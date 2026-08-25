import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  normalizeKnowledgeGatewayRequest,
  validateServerKnowledgeSnapshot,
} from "../_shared/knowledge-gateway-contract.ts";
import { resolveKnowledgeProviderRoute } from "../_shared/knowledge-gateway-providers.ts";

const encoder = new TextEncoder();

function json(status: number, payload: Record<string, unknown>, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(Deno.env.get(name) || fallback), 10);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
}

function base64Url(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256(value: string) {
  return base64Url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function staleSnapshot(payload: Record<string, unknown>) {
  return { ...payload, freshness: "stale" };
}

function classifyProviderFailure(error: unknown) {
  const internalCode = error && typeof error === "object" && "code" in error
    ? String(error.code || "").trim().slice(0, 80)
    : "";
  if (internalCode === "NAVER_NEWS_AUTH_FAILED" || internalCode === "NAVER_NEWS_NOT_CONFIGURED") {
    return { publicCode: "PROVIDER_AUTH_FAILED", internalCode };
  }
  if (internalCode === "NAVER_NEWS_RATE_LIMITED") {
    return { publicCode: "PROVIDER_RATE_LIMITED", internalCode };
  }
  if (internalCode === "NAVER_NEWS_REQUEST_REJECTED") {
    return { publicCode: "UPSTREAM_REQUEST_REJECTED", internalCode };
  }
  if (internalCode === "NAVER_NEWS_INVALID_RESPONSE" || internalCode === "INVALID_UPSTREAM_RESPONSE") {
    return { publicCode: "INVALID_UPSTREAM_RESPONSE", internalCode };
  }
  if (String((error as Error)?.message || "") === "upstream_timeout") {
    return { publicCode: "UPSTREAM_TIMEOUT", internalCode: "UPSTREAM_TIMEOUT" };
  }
  return { publicCode: "UPSTREAM_FAILED", internalCode: internalCode || "UNCLASSIFIED" };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error("upstream_timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { success: false, code: "METHOD_NOT_ALLOWED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
    || Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("KNOWLEDGE_GATEWAY_NOT_CONFIGURED");
    return json(500, { success: false, code: "NOT_CONFIGURED" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_error) {
    return json(400, { success: false, code: "INVALID_REQUEST" });
  }

  let request;
  try {
    request = normalizeKnowledgeGatewayRequest(body);
  } catch (_error) {
    return json(400, { success: false, code: "INVALID_REQUEST" });
  }
  if (!request.licenseKey || !request.hwid) {
    return json(400, { success: false, code: "INVALID_REQUEST" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: license, error: licenseError } = await supabase.rpc("check_license_status", {
    p_license_key: request.licenseKey,
    p_hwid: request.hwid,
  });
  if (licenseError) {
    console.error("KNOWLEDGE_LICENSE_CHECK_FAILED", { code: licenseError.code });
    return json(503, { success: false, code: "LICENSE_UNAVAILABLE" });
  }
  if (!license?.success) return json(401, { success: false, code: "LICENSE_NOT_ACTIVE" });

  const subjectHash = await sha256(request.licenseKey);
  const { data: rate, error: rateError } = await supabase.rpc("consume_knowledge_gateway_rate_limit", {
    p_subject_hash: subjectHash,
    p_limit: intEnv("KNOWLEDGE_RATE_LIMIT_PER_MINUTE", 20, 1, 10000),
    p_window_seconds: 60,
  });
  if (rateError) {
    console.error("KNOWLEDGE_RATE_LIMIT_FAILED", { code: rateError.code });
    return json(503, { success: false, code: "RATE_LIMIT_UNAVAILABLE" });
  }
  if (!rate?.allowed) {
    return json(429, { success: false, code: "RATE_LIMITED" }, {
      "Retry-After": String(rate?.retry_after_seconds || 60),
    });
  }

  const route = resolveKnowledgeProviderRoute(request.kind, request.purpose);
  if (!route) return json(503, { success: false, code: "NOT_CONFIGURED" });

  if (route.execution === "stored_corpus") {
    try {
      const stored = await route.readSnapshot(supabase, request.query);
      const snapshot = validateServerKnowledgeSnapshot(stored, {
        kind: route.kind,
        providerId: route.providerId,
      });
      return json(200, { success: true, snapshot });
    } catch (error) {
      const internalCode = error && typeof error === "object" && "code" in error
        ? String(error.code || "").trim().slice(0, 80)
        : "";
      const code = internalCode === "CORPUS_READ_FAILED"
        ? "CORPUS_UNAVAILABLE"
        : "INVALID_UPSTREAM_RESPONSE";
      console.warn("KNOWLEDGE_CORPUS_READ_FAILED", { provider: route.providerId, code });
      return json(code === "CORPUS_UNAVAILABLE" ? 503 : 500, { success: false, code });
    }
  }

  // Some provider operations require a semantic query. A non-applicable request returns a
  // validated empty Snapshot without consuming shared provider quota or calling upstream.
  if (route.shouldFetch && !route.shouldFetch(request.query)) {
    try {
      const emptySnapshot = validateServerKnowledgeSnapshot(
        await route.fetchSnapshot(request.query),
        { kind: route.kind, providerId: route.providerId },
      );
      return json(200, { success: true, snapshot: emptySnapshot });
    } catch (_error) {
      return json(500, { success: false, code: "INVALID_UPSTREAM_RESPONSE" });
    }
  }

  const cacheKey = await sha256(JSON.stringify({
    provider: route.providerId,
    operation: route.operation,
    query: request.query,
  }));
  const nowIso = new Date().toISOString();
  const { data: cached, error: cacheError } = await supabase
    .from("knowledge_gateway_cache")
    .select("payload, expires_at, stale_until")
    .eq("provider_id", route.providerId)
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (cacheError) console.warn("KNOWLEDGE_CACHE_READ_FAILED", { code: cacheError.code });
  if (cached?.payload && cached.expires_at > nowIso) {
    return json(200, { success: true, snapshot: cached.payload });
  }
  const stale = cached?.payload && cached.stale_until > nowIso ? cached.payload as Record<string, unknown> : null;

  const { data: state, error: stateError } = await supabase
    .from("knowledge_gateway_provider_state")
    .select("backoff_until")
    .eq("provider_id", route.providerId)
    .maybeSingle();
  if (stateError) {
    console.error("KNOWLEDGE_PROVIDER_STATE_FAILED", { code: stateError.code });
    return json(503, { success: false, code: "RATE_LIMIT_UNAVAILABLE" });
  }
  if (state?.backoff_until && state.backoff_until > nowIso) {
    return stale
      ? json(200, { success: true, snapshot: staleSnapshot(stale) })
      : json(503, { success: false, code: "PROVIDER_BACKOFF" });
  }

  const { data: quota, error: quotaError } = await supabase.rpc("consume_knowledge_provider_quota", {
    p_provider_id: route.providerId,
    p_operation: route.operation,
    p_limit: route.quotaLimit,
    p_window_seconds: route.quotaWindowSeconds,
  });
  if (quotaError) {
    console.error("KNOWLEDGE_PROVIDER_QUOTA_FAILED", { code: quotaError.code });
    return json(503, { success: false, code: "RATE_LIMIT_UNAVAILABLE" });
  }
  if (!quota?.allowed) {
    return stale
      ? json(200, { success: true, snapshot: staleSnapshot(stale) })
      : json(429, { success: false, code: "PROVIDER_QUOTA_EXHAUSTED" });
  }

  try {
    const upstream = await withTimeout(route.fetchSnapshot(request.query), route.upstreamTimeoutMs);
    let snapshot;
    try {
      snapshot = validateServerKnowledgeSnapshot(upstream, {
        kind: route.kind,
        providerId: route.providerId,
      });
    } catch (_validationError) {
      const invalid = new Error("invalid_upstream_response") as Error & { code?: string };
      invalid.code = "INVALID_UPSTREAM_RESPONSE";
      throw invalid;
    }
    const expiresAt = String(snapshot.expires_at);
    const { error: writeError } = await supabase.from("knowledge_gateway_cache").upsert({
      provider_id: route.providerId,
      cache_key: cacheKey,
      kind: route.kind,
      payload: snapshot,
      expires_at: expiresAt,
      stale_until: new Date(Date.parse(expiresAt) + route.staleTtlSeconds * 1000).toISOString(),
      updated_at: nowIso,
    }, { onConflict: "provider_id,cache_key" });
    if (writeError) console.warn("KNOWLEDGE_CACHE_WRITE_FAILED", { code: writeError.code });
    const { error: successError } = await supabase.rpc("record_knowledge_provider_success", {
      p_provider_id: route.providerId,
    });
    if (successError) console.warn("KNOWLEDGE_PROVIDER_SUCCESS_STATE_FAILED", { code: successError.code });
    return json(200, { success: true, snapshot });
  } catch (error) {
    const failure = classifyProviderFailure(error);
    const errorCode = failure.publicCode;
    const { error: failureError } = await supabase.rpc("record_knowledge_provider_failure", {
      p_provider_id: route.providerId,
      p_error_code: errorCode,
      p_backoff_seconds: intEnv("KNOWLEDGE_PROVIDER_BACKOFF_SECONDS", 60, 5, 3600),
    });
    if (failureError) console.error("KNOWLEDGE_PROVIDER_FAILURE_STATE_FAILED", { code: failureError.code });
    console.warn("KNOWLEDGE_PROVIDER_FAILED", {
      provider: route.providerId,
      code: errorCode,
      upstream_code: failure.internalCode,
    });
    return stale
      ? json(200, { success: true, snapshot: staleSnapshot(stale) })
      : json(errorCode === "PROVIDER_RATE_LIMITED" ? 429 : 502, { success: false, code: errorCode });
  }
});
