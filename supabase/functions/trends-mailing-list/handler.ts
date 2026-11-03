import { buildRecipientBriefing } from "../../../apps/trends/trends-newsletter/src/delivery.js";

type Action = "subscribe" | "confirm" | "unsubscribe" | "deliver_batch";
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

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validTrendDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function readBrevoError(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  let body = "";
  try { body = (await response.text()).slice(0, 4096); } catch { /* Response details are optional diagnostics. */ }

  let code: string | null = null;
  let message: string | null = null;
  if (contentType.includes("json")) {
    try {
      const payload = JSON.parse(body);
      if (typeof payload?.code === "string") code = payload.code.slice(0, 120);
      if (typeof payload?.message === "string") message = payload.message;
    } catch { /* Keep only the sanitized plain-text fallback below. */ }
  }
  if (!message && body) message = body;

  // Provider errors can echo submitted addresses or request details. Keep logs
  // useful while ensuring email addresses, URLs, and credential-like strings
  // are not persisted in Supabase or exposed through the function response.
  const sanitize = (value: string | null) => value
    ?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(api-key|authorization|token|secret|password)\s*[:=]\s*[^\s,;"'}]+/gi, "$1=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500) || null;

  return { providerCode: sanitize(code), providerMessage: sanitize(message) };
}

async function unsubscribeSignature(subscriberId: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`trends-newsletter-unsubscribe:${subscriberId}`));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

  async function sendCampaign(email: string, campaign: { subject: string; html: string; text: string }, trendDate: string) {
    const key = getEnv("BREVO_API_KEY")?.trim() || "";
    const from = sender();
    if (!key || !from) throw new Error("email_sender_not_configured");
    let response: Response;
    try {
      response = await fetcher("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          sender: from,
          to: [{ email }],
          subject: campaign.subject,
          htmlContent: campaign.html,
          textContent: campaign.text,
        }),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      return { status: "held" as const, outcomeCode: "provider_ambiguous" as const, messageId: null };
    }
    if (!response.ok) {
      const rejected = response.status >= 400 && response.status < 500 && response.status !== 429;
      const providerError = await readBrevoError(response);
      console.error("TRENDS_NEWSLETTER_PROVIDER_RESPONSE", {
        trendDate,
        status: response.status,
        outcomeCode: rejected ? "provider_rejected" : "provider_ambiguous",
        ...providerError,
      });
      return {
        status: rejected ? "failed" as const : "held" as const,
        outcomeCode: rejected ? "provider_rejected" as const : "provider_ambiguous" as const,
        messageId: null,
      };
    }
    let messageId: string | null = null;
    try {
      const payload = await response.json();
      if (typeof payload?.messageId === "string") messageId = payload.messageId.slice(0, 200);
    } catch { /* Brevo may return an empty successful response. */ }
    return { status: "sent" as const, outcomeCode: null, messageId };
  }

  async function deliverBatch(body: Record<string, unknown>) {
    const environment = getEnv("BLOGGENIUS_ENV")?.trim().toLowerCase() || "";
    const mode = getEnv("NEWSLETTER_EMAIL_MODE")?.trim().toLowerCase() || "";
    if (environment !== "development" || mode !== "allowlist") {
      return json(403, { success: false, error: "development_allowlist_required" });
    }
    const trendDate = String(body.trendDate || "").trim();
    const deliveryRevision = Number(body.deliveryRevision);
    const afterId = body.afterId == null || body.afterId === "" ? null : String(body.afterId).trim().toLowerCase();
    if (!validTrendDate(trendDate)
      || !Number.isInteger(deliveryRevision) || deliveryRevision < 1
      || (afterId !== null && !validUuid(afterId))) return json(400, { success: false, error: "invalid_delivery_cursor" });

    const context = await mailingRpc("get_trends_newsletter_delivery_context", { p_trend_date: trendDate });
    if (!context?.run || context.run.collection_status !== "complete"
      || context.run.edition_status !== "draft_ready" || context.edition?.status !== "ready") {
      return json(409, { success: false, error: "newsletter_not_ready" });
    }
    const batchSize = 5;
    const subscribers = await mailingRpc("list_active_trends_subscribers", { p_after_id: afterId, p_limit: batchSize });
    if (!Array.isArray(subscribers)) throw new Error("subscriber_list_invalid");
    const more = subscribers.length === batchSize;
    const nextCursor = subscribers.length ? String(subscribers[subscribers.length - 1].id) : afterId;
    let sent = 0;
    let failed = 0;
    let held = 0;
    let skipped = 0;
    let alreadyClaimed = 0;
    const signingSecret = getEnv("NEWSLETTER_UNSUBSCRIBE_TOKEN_SECRET")?.trim() || "";
    if (subscribers.length && signingSecret.length < 32) throw new Error("unsubscribe_signing_secret_not_configured");
    const trendsUrl = "https://www-dev.bloggenius.kr/trends/";
    const unsubscribeBase = "https://www-dev.bloggenius.kr/trends/unsubscribe/";
    let trends: unknown[] = [];
    if (subscribers.length) {
      const supabaseUrl = getEnv("SUPABASE_URL")?.trim() || "";
      const endpoint = new URL("/rest/v1/items", supabaseUrl);
      endpoint.search = new URLSearchParams({
        select: "trend_date,category,keyword,change_raw,change_type,change_amount,display_order",
        source: "eq.naver_creator_advisor",
        trend_date: `eq.${trendDate}`,
        order: "category.asc,display_order.asc",
        limit: "1000",
      }).toString();
      const key = getEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim() || getEnv("SUPABASE_SECRET_KEY")?.trim() || "";
      if (!key) throw new Error("database_not_configured");
      const trendsResponse = await fetcher(endpoint, {
        headers: { apikey: key, authorization: `Bearer ${key}`, "accept-profile": "trends" },
        signal: AbortSignal.timeout(10000),
      });
      if (!trendsResponse.ok) throw new Error(`trends_http_${trendsResponse.status}`);
      trends = await trendsResponse.json();
      if (!Array.isArray(trends)) throw new Error("trends_payload_invalid");
    }

    for (const subscriber of subscribers) {
      const subscriberId = String(subscriber?.id || "").toLowerCase();
      if (!validUuid(subscriberId)) throw new Error("subscriber_id_invalid");
      const listedEmail = String(subscriber?.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(listedEmail)) throw new Error("subscriber_email_invalid");
      if (!canSendTo(listedEmail)) {
        await mailingRpc("record_trends_newsletter_delivery_skipped", {
          p_trend_date: trendDate, p_delivery_revision: deliveryRevision, p_subscriber_id: subscriberId,
        });
        skipped += 1;
        continue;
      }
      const claim = await mailingRpc("claim_trends_newsletter_delivery", {
        p_trend_date: trendDate, p_delivery_revision: deliveryRevision, p_subscriber_id: subscriberId,
      });
      if (claim?.outcome !== "claimed") {
        alreadyClaimed += 1;
        continue;
      }

      const recipientEmail = String(claim.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) throw new Error("claimed_subscriber_email_invalid");
      if (!canSendTo(recipientEmail)) {
        await mailingRpc("finish_trends_newsletter_delivery", {
          p_delivery_id: claim.delivery_id,
          p_status: "skipped",
          p_outcome_code: "email_policy_denied",
          p_provider_message_id: null,
        });
        skipped += 1;
        continue;
      }

      let deliveryOutcome: { status: "sent" | "held" | "failed"; outcomeCode: string | null; messageId: string | null };
      try {
        const trendsUrlForRecipient = new URL(trendsUrl);
        trendsUrlForRecipient.searchParams.set("date", trendDate);
        const unsubscribeToken = `u_${subscriberId}_${await unsubscribeSignature(subscriberId, signingSecret)}`;
        const unsubscribeUrl = new URL(unsubscribeBase);
        unsubscribeUrl.searchParams.set("token", unsubscribeToken);
        const emailContent = buildRecipientBriefing({
          trendDate,
          categories: claim.categories,
          trends,
          edition: context.edition,
          trendsUrl: trendsUrlForRecipient.toString(),
          unsubscribeUrl: unsubscribeUrl.toString(),
        });
        deliveryOutcome = await sendCampaign(recipientEmail, emailContent, trendDate);
      } catch (error) {
        console.error("TRENDS_NEWSLETTER_RECIPIENT_CONTENT_FAILED", {
          trendDate,
          reason: error instanceof Error ? error.message : "unknown_error",
        });
        deliveryOutcome = { status: "held", outcomeCode: "content_invalid", messageId: null };
      }

      await mailingRpc("finish_trends_newsletter_delivery", {
        p_delivery_id: claim.delivery_id,
        p_status: deliveryOutcome.status,
        p_outcome_code: deliveryOutcome.outcomeCode,
        p_provider_message_id: deliveryOutcome.messageId,
      });
      if (deliveryOutcome.status === "sent") sent += 1;
      else if (deliveryOutcome.status === "failed") failed += 1;
      else held += 1;
    }

    const summary = await mailingRpc("finalize_trends_newsletter_delivery", {
      p_trend_date: trendDate, p_delivery_revision: deliveryRevision, p_has_more: more,
    });
    return json(200, {
      success: true,
      trendDate,
      deliveryRevision,
      nextCursor: more ? nextCursor : null,
      hasMore: more,
      batch: { sent, failed, held, skipped, alreadyClaimed },
      delivery: summary,
    });
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
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || body.consent !== true || categories.length < 1 || categories.length > 10 || categories.some((item) => !NEWSLETTER_CATEGORIES.has(item))) {
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
      if (action === "deliver_batch") return await deliverBatch(body);
      if (action === "confirm" || action === "unsubscribe") {
        const token = String(body.token || "").trim();
        if (action === "unsubscribe" && /^u_[0-9a-f-]{36}_[a-f0-9]{64}$/i.test(token)) {
          const [, rawId, signature] = token.match(/^u_([0-9a-f-]{36})_([a-f0-9]{64})$/i) || [];
          const secret = getEnv("NEWSLETTER_UNSUBSCRIBE_TOKEN_SECRET")?.trim() || "";
          if (!rawId || !validUuid(rawId) || secret.length < 32
            || !constantTimeEquals(signature, await unsubscribeSignature(rawId.toLowerCase(), secret))) {
            return json(400, { success: false, error: "invalid_or_expired_token" });
          }
          const outcome = await mailingRpc("unsubscribe_trends_subscription_by_id", { p_subscriber_id: rawId.toLowerCase() });
          if (String(outcome) !== "unsubscribed") return json(400, { success: false, error: "invalid_or_expired_token" });
          return json(200, { success: true, message: "unsubscribed" });
        }
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
