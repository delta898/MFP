import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type SearchAdRow = Record<string, unknown>;

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

function resolvePolicy() {
  return {
    maxInputCount: intEnv("KEYWORD_MAX_INPUT_COUNT", 3, 1, 10),
    // Security/cost ceiling only. BlogGenius decides its product candidate count.
    maxWeeklyDocumentKeywords: intEnv("KEYWORD_MAX_WEEKLY_DOCUMENT_KEYWORDS", 11, 1, 30),
    rateLimitPerMinute: intEnv("KEYWORD_RATE_LIMIT_PER_MINUTE", 20, 1, 10000),
    searchAdCacheTtlSeconds: intEnv("KEYWORD_SEARCHAD_CACHE_TTL_SECONDS", 21600, 60, 86400),
    weeklyDocumentCacheTtlSeconds: intEnv("KEYWORD_WEEKLY_DOCUMENT_CACHE_TTL_SECONDS", 3600, 60, 86400),
    weeklyDocumentMaxPages: intEnv("KEYWORD_WEEKLY_DOCUMENT_MAX_PAGES", 3, 1, 10),
    upstreamTimeoutMs: intEnv("KEYWORD_UPSTREAM_TIMEOUT_MS", 10000, 1000, 30000),
    blogConcurrency: intEnv("KEYWORD_BLOG_CONCURRENCY", 3, 1, 5),
  };
}

function normalizeKeyword(value: unknown) {
  return String(value || "").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function parseKeywords(value: unknown) {
  const raw = Array.isArray(value) ? value : [value];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    for (const token of String(item || "").split(",")) {
      const keyword = token.replace(/\s+/g, " ").trim();
      const key = normalizeKeyword(keyword);
      if (keyword && !seen.has(key)) {
        seen.add(key);
        result.push(keyword);
      }
    }
  }
  return result;
}

function base64(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(bytes: ArrayBuffer) {
  return base64(bytes).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256Base64Url(value: string) {
  return base64Url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function searchAdSignature(timestamp: string, method: string, uri: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${method}.${uri}`)));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

// Generated database types are not available in the Edge Function bundle.
function createCache(supabase: any) {
  return {
    async get(kind: "search_ad" | "blog_weekly", key: string) {
      const { data, error } = await supabase
        .from("keyword_research_cache")
        .select("payload, expires_at")
        .eq("cache_kind", kind)
        .eq("cache_key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) {
        console.warn("KEYWORD_CACHE_READ_FAILED", { code: error.code });
        return null;
      }
      return data?.payload ?? null;
    },
    async set(kind: "search_ad" | "blog_weekly", key: string, payload: unknown, ttlSeconds: number) {
      const { error } = await supabase.from("keyword_research_cache").upsert({
        cache_kind: kind,
        cache_key: key,
        payload,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "cache_kind,cache_key" });
      if (error) console.warn("KEYWORD_CACHE_WRITE_FAILED", { code: error.code });
    },
  };
}

function kstDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}${pick("month")}${pick("day")}`;
}

function subtractCalendarDays(dateKey: string, days: number) {
  const date = new Date(Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(4, 6)) - 1,
    Number(dateKey.slice(6, 8)) - days,
  ));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function postDateKey(value: unknown) {
  const match = String(value || "").match(/^(\d{8})$/);
  return match ? match[1] : null;
}

function createNaverClients(config: Record<string, string>, cache: ReturnType<typeof createCache>, policy: ReturnType<typeof resolvePolicy>) {
  async function fetchKeywordRows(keyword: string): Promise<SearchAdRow[]> {
    const key = normalizeKeyword(keyword);
    const cached = await cache.get("search_ad", key);
    if (Array.isArray(cached)) return cached as SearchAdRow[];

    const uri = "/keywordstool";
    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const timestamp = String(Date.now());
      const signature = await searchAdSignature(timestamp, "GET", uri, config.searchAdSecretKey);
      const url = new URL(`https://api.searchad.naver.com${uri}`);
      url.searchParams.set("hintKeywords", key);
      url.searchParams.set("includeHintKeywords", "1");
      url.searchParams.set("showDetail", "1");
      const response = await fetchWithTimeout(url.toString(), {
        headers: {
          "X-Timestamp": timestamp,
          "X-API-KEY": config.searchAdApiKey,
          "X-Customer": config.searchAdCustomerId,
          "X-Signature": signature,
        },
      }, policy.upstreamTimeoutMs);
      lastStatus = response.status;
      if (response.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (!response.ok) break;
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : payload?.keywordList;
      if (!Array.isArray(rows)) throw new Error("invalid_search_ad_response");
      const normalizedRows = rows.filter((row: unknown) => row && typeof row === "object");
      await cache.set("search_ad", key, normalizedRows, policy.searchAdCacheTtlSeconds);
      return normalizedRows;
    }
    console.warn("KEYWORD_SEARCH_AD_FAILED", { status: lastStatus });
    throw new Error("search_ad_upstream_failed");
  }

  async function fetchWeeklyDocuments(keyword: string) {
    const cutoffDate = subtractCalendarDays(kstDateKey(), 6);
    const key = `${normalizeKeyword(keyword)}:${cutoffDate}:p${policy.weeklyDocumentMaxPages}`;
    const cached = await cache.get("blog_weekly", key);
    if (cached && typeof cached === "object" && "count" in cached) return cached;
    const useApiHub = Boolean(config.apiHubClientId && config.apiHubClientSecret);
    const url = new URL(useApiHub
      ? "https://naverapihub.apigw.ntruss.com/search/v1/blog"
      : "https://openapi.naver.com/v1/search/blog.json");
    const headers: Record<string, string> = useApiHub
      ? {
        "X-NCP-APIGW-API-KEY-ID": config.apiHubClientId,
        "X-NCP-APIGW-API-KEY": config.apiHubClientSecret,
      }
      : {
        "X-Naver-Client-Id": config.naverClientId,
        "X-Naver-Client-Secret": config.naverClientSecret,
      };
    let count = 0;
    let pagesFetched = 0;
    for (let page = 0; page < policy.weeklyDocumentMaxPages; page += 1) {
      url.search = "";
      url.searchParams.set("query", keyword);
      url.searchParams.set("display", "100");
      url.searchParams.set("start", String(page * 100 + 1));
      url.searchParams.set("sort", "date");
      const response = await fetchWithTimeout(url.toString(), { headers }, policy.upstreamTimeoutMs);
      if (!response.ok) {
        console.warn("KEYWORD_BLOG_SEARCH_FAILED", { status: response.status });
        const error = response.status === 401 || response.status === 403
          ? "blog_search_auth_failed"
          : (response.status === 429 ? "blog_search_rate_limited" : "blog_search_upstream_failed");
        return { count: null, status: "incomplete", capped: false, cutoff_date: cutoffDate, pages_fetched: pagesFetched, error };
      }
      const payload = await response.json();
      const items = Array.isArray(payload?.items) ? payload.items : null;
      if (!items) {
        return { count: null, status: "incomplete", capped: false, cutoff_date: cutoffDate, pages_fetched: pagesFetched, error: "invalid_blog_search_response" };
      }
      pagesFetched += 1;
      let reachedOlderDocument = false;
      for (const item of items) {
        const date = postDateKey(item?.postdate);
        if (!date || date < cutoffDate) {
          reachedOlderDocument = true;
          break;
        }
        count += 1;
      }
      if (reachedOlderDocument || items.length < 100) {
        const result = { count, status: "complete", capped: false, cutoff_date: cutoffDate, pages_fetched: pagesFetched, error: null };
        await cache.set("blog_weekly", key, result, policy.weeklyDocumentCacheTtlSeconds);
        return result;
      }
    }
    const result = { count, status: "lower_bound", capped: true, cutoff_date: cutoffDate, pages_fetched: pagesFetched, error: null };
    await cache.set("blog_weekly", key, result, policy.weeklyDocumentCacheTtlSeconds);
    return result;
  }

  return { fetchKeywordRows, fetchWeeklyDocuments };
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { success: false, code: "METHOD_NOT_ALLOWED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
    || Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || "";
  const config = {
    searchAdApiKey: Deno.env.get("NAVER_SEARCHAD_API_KEY")?.trim() || "",
    searchAdSecretKey: Deno.env.get("NAVER_SEARCHAD_SECRET_KEY")?.trim() || "",
    searchAdCustomerId: Deno.env.get("NAVER_SEARCHAD_CUSTOMER_ID")?.trim() || "",
    apiHubClientId: Deno.env.get("NAVER_API_HUB_CLIENT_ID")?.trim() || "",
    apiHubClientSecret: Deno.env.get("NAVER_API_HUB_CLIENT_SECRET")?.trim() || "",
    naverClientId: Deno.env.get("NAVER_CLIENT_ID")?.trim() || "",
    naverClientSecret: Deno.env.get("NAVER_CLIENT_SECRET")?.trim() || "",
  };
  const hasBlogCredentials = Boolean(
    (config.apiHubClientId && config.apiHubClientSecret)
    || (config.naverClientId && config.naverClientSecret)
  );
  if (!supabaseUrl || !serviceRoleKey || !config.searchAdApiKey || !config.searchAdSecretKey
    || !config.searchAdCustomerId || !hasBlogCredentials) {
    console.error("KEYWORD_RESEARCH_NOT_CONFIGURED");
    return json(500, { success: false, code: "NOT_CONFIGURED", message: "keyword_research_not_configured" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_error) {
    return json(400, { success: false, code: "INVALID_REQUEST", message: "invalid_json_body" });
  }

  const licenseKey = String(body.licenseKey || "").trim();
  const hwid = String(body.hwid || "").trim();
  const operation = String(body.operation || "").trim();
  const keywords = parseKeywords(body.keywords || body.keyword);
  const policy = resolvePolicy();
  if (!licenseKey || licenseKey.length > 256 || !hwid || hwid.length > 256) {
    return json(400, { success: false, code: "INVALID_LICENSE_CONTEXT", message: "invalid_license_context" });
  }
  const maxKeywords = operation === "weekly_documents"
    ? policy.maxWeeklyDocumentKeywords
    : policy.maxInputCount;
  if (!["search_ad", "weekly_documents"].includes(operation)
    || keywords.length === 0 || keywords.length > maxKeywords) {
    return json(400, { success: false, code: "INVALID_REQUEST", message: "invalid_keyword_request" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: license, error: licenseError } = await supabase.rpc("check_license_status", {
    p_license_key: licenseKey,
    p_hwid: hwid,
  });
  if (licenseError) {
    console.error("KEYWORD_LICENSE_CHECK_FAILED", { code: licenseError.code });
    return json(503, { success: false, code: "LICENSE_UNAVAILABLE", message: "license_service_unavailable" });
  }
  if (!license?.success) {
    return json(401, { success: false, code: "LICENSE_NOT_ACTIVE", message: "license_not_active" });
  }

  const subjectHash = await sha256Base64Url(licenseKey);
  const { data: rate, error: rateError } = await supabase.rpc("consume_keyword_research_rate_limit", {
    p_subject_hash: subjectHash,
    p_limit: policy.rateLimitPerMinute,
    p_window_seconds: 60,
  });
  if (rateError) {
    console.error("KEYWORD_RATE_LIMIT_FAILED", { code: rateError.code });
    return json(503, { success: false, code: "RATE_LIMIT_UNAVAILABLE", message: "rate_limit_unavailable" });
  }
  if (!rate?.allowed) {
    return json(429, { success: false, code: "RATE_LIMITED", message: "rate_limited" }, {
      "Retry-After": String(rate?.retry_after_seconds || 60),
    });
  }

  try {
    const cache = createCache(supabase);
    const naver = createNaverClients(config, cache, policy);
    if (operation === "search_ad") {
      const searchAd = await mapConcurrent(
        keywords,
        policy.blogConcurrency,
        async (keyword) => ({ keyword, rows: await naver.fetchKeywordRows(keyword) }),
      );
      return json(200, { success: true, search_ad: searchAd });
    }

    const weeklyDocuments = await mapConcurrent(
      keywords,
      policy.blogConcurrency,
      async (keyword) => ({ keyword, result: await naver.fetchWeeklyDocuments(keyword) }),
    );
    return json(200, { success: true, weekly_documents: weeklyDocuments });
  } catch (error) {
    console.error("KEYWORD_RESEARCH_FAILED", { name: error instanceof Error ? error.name : "Error" });
    return json(502, { success: false, code: "UPSTREAM_FAILED", message: "keyword_upstream_failed" });
  }
});
