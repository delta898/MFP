// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveDeliveryPolicy() {
  const environment = Deno.env.get("BLOGGENIUS_ENV")?.trim().toLowerCase() || "";
  const mode = Deno.env.get("BLOGGENIUS_NOTIFICATION_MODE")?.trim().toLowerCase() || "";
  if (!environment || !["local", "development", "production"].includes(environment)) {
    return { allowed: false, environment, mode, reason: "environment_not_configured" };
  }
  if (environment === "production") {
    return mode === "live"
      ? { allowed: true, environment, mode, reason: "" }
      : { allowed: false, environment, mode, reason: "production_notification_mode_invalid" };
  }
  if (mode === "sink" || (environment === "local" && !mode)) {
    return { allowed: true, environment, mode: "sink", reason: "" };
  }
  if (environment === "development" && mode === "allowlist") {
    return { allowed: true, environment, mode, reason: "" };
  }
  return { allowed: false, environment, mode, reason: "nonproduction_notification_mode_invalid" };
}

function resolveEmailAllowlist() {
  return new Set(
    String(Deno.env.get("LICENSE_EMAIL_ALLOWLIST") || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseSender(input: string) {
  const raw = String(input || "").trim();
  // "Name <email@domain.com>" 형식 지원
  const match = raw.match(/^\s*([^<>]+)\s*<\s*([^<>@\s]+@[^<>@\s]+)\s*>\s*$/);
  if (match) {
    return {
      name: match[1].trim(),
      email: match[2].trim().toLowerCase(),
    };
  }
  // "email@domain.com" 형식
  if (isValidEmail(raw)) {
    return {
      name: "BlogGenius",
      email: raw.toLowerCase(),
    };
  }
  return null;
}

function formatExpiryKst(expiresAtRaw: string) {
  const raw = String(expiresAtRaw || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  if (!map.year || !map.month || !map.day || !map.hour || !map.minute || !map.second) {
    return "";
  }
  return `${map.year}년 ${map.month}월 ${map.day}일 ${map.hour}시 ${map.minute}분 ${map.second}초`;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json(405, { success: false, message: "method_not_allowed" });
  }

  const deliveryPolicy = resolveDeliveryPolicy();
  if (!deliveryPolicy.allowed) {
    console.error("LICENSE_EMAIL_POLICY_DENIED", {
      environment: deliveryPolicy.environment || "missing",
      mode: deliveryPolicy.mode || "missing",
      reason: deliveryPolicy.reason,
    });
    return json(500, { success: false, message: deliveryPolicy.reason });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch (_e) {
    return json(400, { success: false, message: "invalid_json_body" });
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const code = String(body?.code || "").trim();
  const ttlSeconds = Math.max(60, Math.min(1800, parseInt(String(body?.ttlSeconds || "300"), 10) || 300));
  const ttlMinutes = Math.max(1, Math.ceil(ttlSeconds / 60));
  const expiresAtText = formatExpiryKst(String(body?.expiresAt || ""));
  const ttlDetail = expiresAtText
    ? `${ttlMinutes}분 (${ttlSeconds}초. ${expiresAtText}까지)`
    : `${ttlMinutes}분 (${ttlSeconds}초)`;

  if (!isValidEmail(email)) {
    return json(400, { success: false, message: "invalid_email" });
  }
  if (!/^\d{6}$/.test(code)) {
    return json(400, { success: false, message: "invalid_code" });
  }

  if (deliveryPolicy.mode === "sink") {
    console.info("LICENSE_EMAIL_SINK_ACCEPTED", { environment: deliveryPolicy.environment });
    return json(200, { success: true, message: "accepted_by_development_sink" });
  }
  if (deliveryPolicy.mode === "allowlist" && !resolveEmailAllowlist().has(email)) {
    return json(403, { success: false, message: "email_recipient_not_allowed" });
  }

  const brevoApiKey = Deno.env.get("BREVO_API_KEY")?.trim() || "";
  const fromRaw = Deno.env.get("LICENSE_EMAIL_FROM")?.trim() || "";
  const sender = parseSender(fromRaw);
  if (!brevoApiKey || !sender) {
    return json(500, { success: false, message: "email_sender_not_configured" });
  }

  const subject = "[BlogGenius] 라이선스 등록 인증 코드";
  const html = `
    <div style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
        <div style="padding:18px 22px;background:linear-gradient(120deg,#0ea5e9,#2563eb);">
          <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">BlogGenius 라이선스 등록</div>
          <div style="margin-top:4px;font-size:13px;color:#dbeafe;">이메일 인증 코드 안내</div>
        </div>

        <div style="padding:22px;">
          <p style="margin:0;color:#111827;font-size:15px;line-height:1.6;">
            아래 인증 코드를 입력해 등록을 완료해 주세요.
          </p>

          <div style="margin:18px 0 14px;padding:14px 16px;border:1px solid #dbeafe;background:#eff6ff;border-radius:10px;text-align:center;">
            <span style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:6px;color:#1d4ed8;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;">
              ${code}
            </span>
          </div>

          <div style="margin-top:10px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
            <div style="font-size:13px;color:#374151;line-height:1.6;">
              유효시간: <b>${ttlDetail}</b>
            </div>
            <div style="margin-top:4px;font-size:12px;color:#6b7280;line-height:1.6;">
              보안을 위해 인증 코드는 타인과 공유하지 마세요.
            </div>
          </div>

          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;line-height:1.7;">
            본 메일을 요청하지 않았다면 무시해 주세요.
          </p>
        </div>

        <div style="padding:12px 22px;border-top:1px solid #f3f4f6;background:#fafafa;font-size:11px;color:#9ca3af;line-height:1.6;">
          This is an automated message from BlogGenius.
        </div>
      </div>
    </div>
  `;
  const text = `BlogGenius 라이선스 등록 인증 코드: ${code}\n유효시간: ${ttlDetail}`;

  const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: sender.email,
        name: sender.name || "BlogGenius",
      },
      to: [{ email }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const raw = await brevoResp.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch (_e) {
    parsed = { raw };
  }

  if (!brevoResp.ok) {
    console.error("BREVO_SEND_FAILED", {
      status: brevoResp.status,
      response: parsed,
    });
    return json(502, {
      success: false,
      message: "email_provider_error",
      provider_status: brevoResp.status,
      provider_response: parsed,
    });
  }

  return json(200, {
    success: true,
    message: "sent",
    provider_message_id: parsed.messageId || null,
  });
});
