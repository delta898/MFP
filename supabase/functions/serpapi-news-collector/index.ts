import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSerpApiGoogleNewsProvider } from "../_shared/knowledge-provider-serpapi-google-news.ts";
import { createSerpApiCollectionService } from "../_shared/serpapi-collection-service.ts";

const encoder = new TextEncoder();

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function secureEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  let difference = leftHash.length ^ rightHash.length;
  for (let index = 0; index < Math.max(leftHash.length, rightHash.length); index += 1) {
    difference |= (leftHash[index] || 0) ^ (rightHash[index] || 0);
  }
  return difference === 0;
}

function publicFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
  if (code === "SERPAPI_RATE_LIMITED") return { status: 429, code };
  if (code === "SERPAPI_AUTH_FAILED" || code === "SERPAPI_NOT_CONFIGURED") {
    return { status: 503, code: "COLLECTOR_NOT_CONFIGURED" };
  }
  if (code === "OBSERVATION_STORE_FAILED" || code === "COLLECTION_RUN_STORE_FAILED") {
    return { status: 503, code };
  }
  if (code === "SERPAPI_REQUEST_REJECTED") return { status: 502, code };
  return { status: 502, code: "COLLECTION_FAILED" };
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { success: false, code: "METHOD_NOT_ALLOWED" });

  const collectorSecret = Deno.env.get("SERPAPI_COLLECTOR_SECRET")?.trim() || "";
  const presentedSecret = req.headers.get("x-collector-secret")?.trim() || "";
  if (!collectorSecret) {
    console.error("SERPAPI_COLLECTOR_NOT_CONFIGURED");
    return json(500, { success: false, code: "NOT_CONFIGURED" });
  }
  if (!presentedSecret || !await secureEqual(presentedSecret, collectorSecret)) {
    return json(401, { success: false, code: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
    || Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || "";
  const serpApiKey = Deno.env.get("SERPAPI_API_KEY")?.trim() || "";
  if (!supabaseUrl || !serviceRoleKey || !serpApiKey) {
    console.error("SERPAPI_COLLECTOR_NOT_CONFIGURED");
    return json(500, { success: false, code: "NOT_CONFIGURED" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_error) {
    return json(400, { success: false, code: "INVALID_REQUEST" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = {
    async upsertObservations(providerId: string, observations: Record<string, unknown>[]) {
      const { data, error } = await supabase.rpc("upsert_knowledge_observations", {
        p_provider_id: providerId,
        p_observations: observations,
      });
      if (error || !data || typeof data !== "object") throw new Error("observation_store_failed");
      return data as { accepted_count: number; inserted_count: number; refreshed_count: number };
    },
    async recordRun(run: Record<string, unknown>) {
      const { data, error } = await supabase.rpc("record_knowledge_collection_run", { p_run: run });
      if (error || !data?.recorded) throw new Error("collection_run_store_failed");
      return data;
    },
  };

  try {
    const service = createSerpApiCollectionService({
      collector: createSerpApiGoogleNewsProvider(),
      store,
    });
    const run = await service.run(body);
    return json(200, {
      success: true,
      run: {
        run_id: run.run_id,
        status: run.status,
        lane: run.lane,
        fetched_count: run.fetched_count,
        accepted_count: run.accepted_count,
        inserted_count: run.inserted_count,
        refreshed_count: run.refreshed_count,
        rejected_count: run.rejected_count,
      },
    });
  } catch (error) {
    const failure = publicFailure(error);
    console.warn("SERPAPI_COLLECTION_FAILED", { code: failure.code });
    return json(failure.status, { success: false, code: failure.code });
  }
});

