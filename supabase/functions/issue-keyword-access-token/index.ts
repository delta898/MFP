import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createLicenseAccessToken,
  parseAccessTokenTtlSeconds,
} from "../_shared/license-access-token.ts";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { success: false, message: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
    || Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || "";
  const signingSecret = Deno.env.get("KEYWORD_ACCESS_TOKEN_SECRET")?.trim() || "";
  const issuer = Deno.env.get("KEYWORD_ACCESS_TOKEN_ISSUER")?.trim() || "bloggenius-license";
  const audience = Deno.env.get("KEYWORD_ACCESS_TOKEN_AUDIENCE")?.trim() || "keyword-gateway";

  if (!supabaseUrl || !serviceRoleKey || !signingSecret) {
    console.error("KEYWORD_ACCESS_TOKEN_NOT_CONFIGURED");
    return json(500, { success: false, message: "keyword_access_not_configured" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_error) {
    return json(400, { success: false, message: "invalid_json_body" });
  }

  const licenseKey = String(body?.licenseKey || "").trim();
  const hwid = String(body?.hwid || "").trim();
  if (!licenseKey || licenseKey.length > 256 || !hwid || hwid.length > 256) {
    return json(400, { success: false, message: "invalid_license_context" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("check_license_status", {
    p_license_key: licenseKey,
    p_hwid: hwid,
  });

  if (error) {
    console.error("KEYWORD_ACCESS_LICENSE_CHECK_FAILED", { code: error.code, message: error.message });
    return json(503, { success: false, message: "license_service_unavailable" });
  }
  if (!data?.success) {
    return json(401, { success: false, message: "license_not_active" });
  }

  const token = await createLicenseAccessToken({
    licenseKey,
    secret: signingSecret,
    issuer,
    audience,
    scope: "keyword:analyze",
    ttlSeconds: parseAccessTokenTtlSeconds(Deno.env.get("KEYWORD_ACCESS_TOKEN_TTL_SECONDS")),
  });

  return json(200, { success: true, ...token });
});
