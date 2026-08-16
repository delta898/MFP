const encoder = new TextEncoder();

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

export function parseAccessTokenTtlSeconds(value: string | undefined) {
  const parsed = Number.parseInt(String(value || "900"), 10);
  if (!Number.isFinite(parsed)) return 900;
  return Math.max(60, Math.min(1800, parsed));
}

export async function createLicenseAccessToken(options: {
  licenseKey: string;
  secret: string;
  issuer: string;
  audience: string;
  scope: string;
  ttlSeconds: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + options.ttlSeconds;
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64Url(encoder.encode(JSON.stringify({
    iss: options.issuer,
    aud: options.audience,
    sub: await sha256Base64Url(options.licenseKey),
    scope: options.scope,
    iat: issuedAt,
    exp: expiresAt,
  })));
  const signingInput = `${header}.${payload}`;
  return {
    accessToken: `${signingInput}.${await signHs256(signingInput, options.secret)}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
