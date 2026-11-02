type Action = "subscribe" | "confirm" | "unsubscribe";
type HandlerOptions = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  tokenFactory?: () => string;
  now?: () => Date;
};

const NEWSLETTER_CATEGORIES = new Set([
  "IT·컴퓨터", "건강·의학", "게임", "공연·전시", "교육·학문", "국내여행", "드라마", "만화·애니",
  "맛집", "문학·책", "미술·디자인", "반려동물", "방송", "비즈니스·경제", "사진", "사회·정치",
  "상품리뷰", "세계여행", "스타·연예인", "스포츠", "어학·외국어", "영화", "요리·레시피", "원예·재배",
  "육아·결혼", "음악", "인테리어·DIY", "일상·생각", "자동차", "좋은글·이미지", "취미", "패션·미용",
]);

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function constantTimeEquals(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createHandler(options: HandlerOptions = {}) {
  const getEnv = (name: string) => options.env ? options.env[name] : Deno.env.get(name);
  const fetcher = options.fetcher || fetch;
  const makeToken = options.tokenFactory || randomToken;
  const now = options.now || (() => new Date());

  async function mailingRpc(name: string, params: Record<string, unknown>) {
    const url = getEnv("SUPABASE_URL")?.trim().replace(/\/+$/, "") || "";
    const key = getEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim() || getEnv("SUPABASE_SECRET_KEY")?.trim() || "";
    if (!url || !key) throw new Error("database_not_configured");
    const response = await fetcher(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "content-profile": "mailing",
        "accept-profile": "mailing",
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`database_http_${response.status}`);
    return response.json();
  }

  function sender() {
    const raw = getEnv("NEWSLETTER_EMAIL_FROM")?.trim() || "";
    const match = raw.match(/^\s*([^<>]+)\s*<\s*([^<>@\s]+@[^<>@\s]+)\s*>\s*$/);
    if (match) return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { name: "BlogGenius", email: raw.toLowerCase() };
    return null;
  }

  function canSendTo(email: string) {
    const environment = getEnv("BLOGGENIUS_ENV")?.trim().toLowerCase() || "";
    const mode = getEnv("NEWSLETTER_EMAIL_MODE")?.trim().toLowerCase() || "";
    if (environment === "production") return mode === "live";
    if (["local", "development"].includes(environment) && mode === "allowlist") {
      return new Set((getEnv("NEWSLETTER_EMAIL_ALLOWLIST") || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)).has(email);
    }
    return false;
  }

  async function sendConfirmation(email: string, token: string, unsubscribeToken: string) {
    const key = getEnv("BREVO_API_KEY")?.trim() || "";
    const from = sender();
    const environment = getEnv("BLOGGENIUS_ENV")?.trim().toLowerCase() || "";
    const expectedHost = environment === "production" ? "www.bloggenius.kr"
      : environment === "development" ? "www-dev.bloggenius.kr" : "";
    const defaultBase = expectedHost ? `https://${expectedHost}/trends/confirm/` : "";
    const base = getEnv("NEWSLETTER_CONFIRMATION_URL")?.trim() || defaultBase;
    let url: URL;
    try { url = new URL(base); } catch { throw new Error("email_sender_not_configured"); }
    const localAllowed = environment === "local" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (!key || !from || (expectedHost && (url.protocol !== "https:" || url.hostname !== expectedHost))
        || (!expectedHost && !localAllowed)) throw new Error("email_sender_not_configured");
    url.pathname = "/trends/confirm/";
    url.searchParams.set("token", token);
    const unsubscribeUrl = new URL("/trends/unsubscribe/", url.origin);
    unsubscribeUrl.searchParams.set("token", unsubscribeToken);
    const response = await fetcher("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        sender: from,
        to: [{ email }],
        subject: "[BlogGenius] 네이버 트렌드 구독을 확인해 주세요",
        textContent: `네이버 트렌드 뉴스레터 구독을 완료하려면 아래 링크를 열어 주세요.\n${url}\n\n링크는 48시간 동안 유효합니다. 구독 신청을 취소하려면 아래 링크를 열어 주세요.\n${unsubscribeUrl}\n\n직접 신청하지 않았다면 이 메일을 무시해 주세요.`,
        htmlContent: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#1d2b24"><p style="letter-spacing:.15em;color:#315f4c;font-weight:bold">NAVER TRENDS LETTER</p><h1 style="font-size:24px">구독 신청을 확인해 주세요</h1><p>아래 버튼을 눌러 구독을 완료해 주세요. 링크는 48시간 동안 유효합니다.</p><p style="margin:28px 0"><a href="${url.toString()}" style="display:inline-block;background:#315f4c;color:#fff;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">구독 확인하기</a></p><p style="font-size:13px;color:#68766d">직접 신청하지 않았다면 이 메일을 무시해 주세요. <a href="${unsubscribeUrl.toString()}">신청 취소</a></p></div>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`brevo_http_${response.status}`);
  }

  return async (req: Request) => {
    if (req.method !== "POST") return json(405, { success: false, error: "method_not_allowed" });
    const expected = getEnv("TRENDS_NEWSLETTER_WORKER_TOKEN")?.trim() || "";
    const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!expected || !constantTimeEquals(supplied, expected)) return json(401, { success: false, error: "unauthorized" });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json(400, { success: false, error: "invalid_json" }); }
    const action = String(body.action || "") as Action;
    try {
      if (action === "subscribe") {
        const email = String(body.email || "").trim().toLowerCase();
        const categories = Array.isArray(body.categories) ? [...new Set(body.categories.map((item) => String(item).trim()))] : [];
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || body.consent !== true || categories.length < 1 || categories.length > 5 || categories.some((item) => !NEWSLETTER_CATEGORIES.has(item))) {
          return json(400, { success: false, error: "invalid_subscription" });
        }
        if (!canSendTo(email)) {
          console.error("TRENDS_NEWSLETTER_EMAIL_POLICY_DENIED", { environment: getEnv("BLOGGENIUS_ENV") || "missing", mode: getEnv("NEWSLETTER_EMAIL_MODE") || "missing" });
          return json(503, { success: false, error: "email_delivery_unavailable" });
        }
        const confirmation = makeToken();
        const unsubscribe = makeToken();
        const current = now();
        const outcome = await mailingRpc("request_trends_subscription", {
          p_email: email,
          p_categories: categories,
          p_consent_at: current.toISOString(),
          p_confirmation_hash: await sha256(confirmation),
          p_confirmation_expires_at: new Date(current.getTime() + 48 * 60 * 60 * 1000).toISOString(),
          p_unsubscribe_hash: await sha256(unsubscribe),
          p_consent_version: "2026-11-02",
        });
        if (String(outcome) === "pending") await sendConfirmation(email, confirmation, unsubscribe);
        return json(200, { success: true, message: "pending" });
      }
      if (action === "confirm" || action === "unsubscribe") {
        const token = String(body.token || "").trim();
        if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return json(400, { success: false, error: "invalid_token" });
        const outcome = await mailingRpc(action === "confirm" ? "confirm_trends_subscription" : "unsubscribe_trends_subscription", { p_token_hash: await sha256(token) });
        if (String(outcome) !== (action === "confirm" ? "confirmed" : "unsubscribed")) return json(400, { success: false, error: "invalid_or_expired_token" });
        return json(200, { success: true, message: action === "confirm" ? "confirmed" : "unsubscribed" });
      }
      return json(400, { success: false, error: "unsupported_action" });
    } catch (error) {
      console.error("TRENDS_MAILING_LIST_FAILED", error instanceof Error ? error.message : "unknown");
      return json(503, { success: false, error: "temporarily_unavailable" });
    }
  };
}
