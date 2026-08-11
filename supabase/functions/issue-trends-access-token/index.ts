import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return base64Url(new Uint8Array(digest));
}

async function signHs256(signingInput: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  return base64Url(new Uint8Array(signature));
}

function parseTtlSeconds(value: string | undefined) {
  const parsed = Number.parseInt(String(value || "900"), 10);
  if (!Number.isFinite(parsed)) return 900;
  return Math.max(60, Math.min(1800, parsed));
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { success: false, message: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim()
    || Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || "";
  const signingSecret = Deno.env.get("TRENDS_READ_TOKEN_SECRET")?.trim() || "";
  const issuer = Deno.env.get("TRENDS_READ_TOKEN_ISSUER")?.trim() || "bloggenius-license";
  const audience = Deno.env.get("TRENDS_READ_TOKEN_AUDIENCE")?.trim() || "trends-api";

  if (!supabaseUrl || !serviceRoleKey || !signingSecret) {
    console.error("TRENDS_ACCESS_TOKEN_NOT_CONFIGURED");
    return json(500, { success: false, message: "trends_access_not_configured" });
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
    console.error("TRENDS_ACCESS_LICENSE_CHECK_FAILED", { code: error.code, message: error.message });
    return json(503, { success: false, message: "license_service_unavailable" });
  }
  if (!data?.success) {
    return json(401, { success: false, message: "license_not_active" });
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + parseTtlSeconds(Deno.env.get("TRENDS_READ_TOKEN_TTL_SECONDS"));
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64Url(encoder.encode(JSON.stringify({
    iss: issuer,
    aud: audience,
    sub: await sha256Base64Url(licenseKey),
    scope: "trends:read",
    iat: issuedAt,
    exp: expiresAt,
  })));
  const token = `${header}.${payload}.${await signHs256(`${header}.${payload}`, signingSecret)}`;

  return json(200, {
    success: true,
    accessToken: token,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  });
});
