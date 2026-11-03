import { createHandler } from "./handler.ts";

const baseEnv = {
  BLOGGENIUS_ENV: "development",
  TRENDS_NEWSLETTER_WORKER_TOKEN: "test-worker-token",
  SUPABASE_URL: "https://dev-project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
  BREVO_API_KEY: "test-brevo-key",
  NEWSLETTER_EMAIL_FROM: "BlogGenius Dev <newsletter-dev@example.com>",
  NEWSLETTER_CONFIRMATION_URL: "https://www-dev.bloggenius.kr/trends/confirm/",
  NEWSLETTER_EMAIL_MODE: "allowlist",
  NEWSLETTER_EMAIL_ALLOWLIST: "reader@example.com",
};

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertStringIncludes(actual: string, expected: string) {
  if (!actual.includes(expected)) throw new Error(`Expected string to include ${expected}`);
}

function trendRows(category = "IT·컴퓨터") {
  return Array.from({ length: 20 }, (_, index) => ({
    trend_date: "2026-11-02",
    category,
    keyword: `테스트 키워드 ${index + 1}`,
    change_raw: index === 0 ? "▲ 3" : index === 1 ? "신규" : "변동 없음",
    change_type: index === 0 ? "up" : index === 1 ? "new" : "steady",
    change_amount: index === 0 ? 3 : null,
    display_order: index + 1,
  }));
}

const sharedEdition = {
  run: { collection_status: "complete", edition_status: "draft_ready" },
  edition: {
    status: "ready",
    greeting: "좋은 아침입니다.",
    introduction: "오늘의 흐름을 살펴보세요.",
    featured_post: { title: "BlogGenius 소식", url: "https://blog.gongzza.com/guide/", excerpt: "참고 글 요약" },
    download_url: "https://www-dev.bloggenius.kr/download/",
    download_banner_url: "https://www-dev.bloggenius.kr/assets/share-card.svg",
  },
};

const activeSubscriber = {
  id: "3f9a8b80-4993-4fdd-a600-077e32ad7c19",
  email: "reader@example.com",
  categories: ["IT·컴퓨터"],
};

function deliveryHandler({
  claimOutcome = "claimed",
  runDeliveryStatus = "not_started",
  extraEnv = {},
  onBrevo,
  onFinish,
  brevoStatus = 201,
  brevoBody = { messageId: "<dev-message-id>" },
}: {
  claimOutcome?: string;
  runDeliveryStatus?: string;
  extraEnv?: Record<string, string>;
  onBrevo?: (payload: Record<string, unknown>) => void;
  onFinish?: (payload: Record<string, unknown>) => void;
  brevoStatus?: number;
  brevoBody?: Record<string, unknown>;
} = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const handler = createHandler({
    env: {
      ...baseEnv,
      NEWSLETTER_UNSUBSCRIBE_TOKEN_SECRET: "x".repeat(48),
      ...extraEnv,
    },
    fetcher: async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/rpc/get_trends_newsletter_delivery_context")) {
        return Response.json({ ...sharedEdition, run: { ...sharedEdition.run, delivery_status: runDeliveryStatus } });
      }
      if (url.includes("/rpc/list_active_trends_subscribers")) return Response.json([activeSubscriber]);
      if (url.includes("/rest/v1/items")) return Response.json(trendRows());
      if (url.includes("/rpc/claim_trends_newsletter_delivery")) {
        return Response.json(claimOutcome === "claimed" ? {
          outcome: "claimed",
          delivery_id: "982c4203-9b01-4dc6-85cc-f3463a399b1a",
          email: activeSubscriber.email,
          categories: activeSubscriber.categories,
        } : { outcome: "already_claimed", status: "sent" });
      }
      if (url.includes("/rpc/finish_trends_newsletter_delivery")) {
        onFinish?.(JSON.parse(String(init.body)));
        return Response.json(true);
      }
      if (url.includes("/rpc/finalize_trends_newsletter_delivery")) {
        return Response.json({ status: "sent", sent: claimOutcome === "claimed" ? 1 : 1, held: 0, failed: 0, skipped: 0, sending: 0 });
      }
      if (url === "https://api.brevo.com/v3/smtp/email") {
        onBrevo?.(JSON.parse(String(init.body)));
        return Response.json(brevoBody, { status: brevoStatus });
      }
      throw new Error(`unexpected_url:${url}`);
    },
  });
  return { handler, calls };
}

function request(body: unknown, token = "test-worker-token") {
  return new Request("https://function.test/trends-mailing-list", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("rejects requests without the Worker token before calling dependencies", async () => {
  let calls = 0;
  const handler = createHandler({ env: baseEnv, fetcher: async () => { calls++; return new Response(); } });
  const response = await handler(request({ action: "subscribe" }, "wrong-token"));
  assertEquals(response.status, 401);
  assertEquals(calls, 0);
});

Deno.test("rejects invalid subscription input before database or mail calls", async () => {
  let calls = 0;
  const handler = createHandler({ env: baseEnv, fetcher: async () => { calls++; return new Response(); } });
  const response = await handler(request({ action: "subscribe", email: "bad", categories: ["unknown"], consent: true }));
  assertEquals(response.status, 400);
  assertEquals(calls, 0);
});

Deno.test("accepts four categories through the API while the site UI applies its own smaller limit", async () => {
  const handler = createHandler({
    env: baseEnv,
    tokenFactory: () => "test-token-abcdefghijklmnopqrstuvwxyz0123456789",
    fetcher: async (input) => String(input).includes("request_trends_subscription")
      ? new Response(JSON.stringify("pending"), { status: 200 })
      : new Response(null, { status: 201 }),
  });
  const response = await handler(request({
    action: "subscribe", email: "reader@example.com",
    categories: ["IT·컴퓨터", "건강·의학", "게임", "공연·전시"], consent: true,
  }));
  assertEquals(response.status, 200);
});

Deno.test("rejects more than ten categories before database or mail calls", async () => {
  let calls = 0;
  const handler = createHandler({ env: baseEnv, fetcher: async () => { calls++; return new Response(); } });
  const response = await handler(request({
    action: "subscribe", email: "reader@example.com",
    categories: ["IT·컴퓨터", "건강·의학", "게임", "공연·전시", "교육·학문", "국내여행", "드라마", "만화·애니", "맛집", "문학·책", "미술·디자인"], consent: true,
  }));
  assertEquals(response.status, 400);
  assertEquals(calls, 0);
});

Deno.test("blocks addresses outside the Development allowlist before database or mail calls", async () => {
  let calls = 0;
  const handler = createHandler({ env: baseEnv, fetcher: async () => { calls++; return new Response(); } });
  const response = await handler(request({ action: "subscribe", email: "other@example.com", categories: ["IT·컴퓨터"], consent: true }));
  assertEquals(response.status, 503);
  assertEquals(calls, 0);
});

Deno.test("sends the confirmation payload through the mocked Brevo boundary for an allowed address", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let generated = 0;
  const handler = createHandler({
    env: baseEnv,
    tokenFactory: () => `test-token-${++generated}-abcdefghijklmnopqrstuvwxyz0123456789`,
    now: () => new Date("2026-11-02T00:00:00.000Z"),
    fetcher: async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/rest/v1/rpc/request_trends_subscription")) return new Response(JSON.stringify("pending"), { status: 200 });
      if (url === "https://api.brevo.com/v3/smtp/email") return new Response(null, { status: 201 });
      throw new Error(`unexpected_url:${url}`);
    },
  });

  const response = await handler(request({ action: "subscribe", email: " Reader@Example.com ", categories: ["IT·컴퓨터"], consent: true }));
  assertEquals(response.status, 200);
  assertEquals(calls.length, 2);
  const dbPayload = JSON.parse(String(calls[0].init.body));
  assertEquals(dbPayload.p_email, "reader@example.com");
  assertEquals(dbPayload.p_consent_at, "2026-11-02T00:00:00.000Z");
  assertEquals(dbPayload.p_confirmation_expires_at, "2026-11-04T00:00:00.000Z");

  const emailPayload = JSON.parse(String(calls[1].init.body));
  assertEquals(calls[1].url, "https://api.brevo.com/v3/smtp/email");
  assertEquals(emailPayload.sender, { name: "BlogGenius Dev", email: "newsletter-dev@example.com" });
  assertEquals(emailPayload.to, [{ email: "reader@example.com" }]);
  assertStringIncludes(emailPayload.textContent, "https://www-dev.bloggenius.kr/trends/confirm/?token=");
  assertStringIncludes(emailPayload.textContent, "https://www-dev.bloggenius.kr/trends/unsubscribe/?token=");
});

Deno.test("previews confirmation categories without exposing the raw token to Supabase", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const handler = createHandler({
    env: baseEnv,
    fetcher: async (input, init = {}) => {
      calls.push({ url: String(input), init });
      return Response.json({ valid: true, categories: ["게임", "교육·학문"] });
    },
  });
  const token = "A".repeat(43);
  const response = await handler(request({ action: "preview_confirmation", token }));
  const result = await response.json();
  const rpcPayload = JSON.parse(String(calls[0].init.body));

  assertEquals(response.status, 200);
  assertEquals(result.categories, ["게임", "교육·학문"]);
  assertEquals(calls[0].url.includes("preview_trends_subscription_confirmation"), true);
  assertEquals(rpcPayload.p_token_hash === token, false);
  assertEquals(rpcPayload.p_token_hash.length, 64);
});

Deno.test("confirms the recipient-edited categories through the atomic confirmation RPC", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const handler = createHandler({
    env: baseEnv,
    fetcher: async (input, init = {}) => {
      calls.push({ url: String(input), init });
      return Response.json("confirmed");
    },
  });
  const response = await handler(request({
    action: "confirm",
    token: "B".repeat(43),
    categories: ["게임", "교육·학문"],
  }));
  const result = await response.json();
  const rpcPayload = JSON.parse(String(calls[0].init.body));

  assertEquals(response.status, 200);
  assertEquals(result.message, "confirmed");
  assertEquals(calls[0].url.includes("confirm_trends_subscription_with_categories"), true);
  assertEquals(rpcPayload.p_categories, ["게임", "교육·학문"]);
  assertEquals(rpcPayload.p_token_hash === "B".repeat(43), false);
});

Deno.test("sends category-change confirmation without replacing the active unsubscribe link", async () => {
  let emailPayload: Record<string, unknown> | undefined;
  const handler = createHandler({
    env: baseEnv,
    tokenFactory: () => "change-token-abcdefghijklmnopqrstuvwxyz0123456789",
    fetcher: async (input, init = {}) => {
      const url = String(input);
      if (url.includes("/rpc/request_trends_subscription")) return Response.json("change_requested");
      if (url === "https://api.brevo.com/v3/smtp/email") {
        emailPayload = JSON.parse(String(init.body));
        return new Response(null, { status: 201 });
      }
      throw new Error(`unexpected_url:${url}`);
    },
  });

  const response = await handler(request({
    action: "subscribe", email: "reader@example.com", categories: ["게임"], consent: true,
  }));

  assertEquals(response.status, 200);
  assertEquals((await response.json()).message, "change_requested");
  assertStringIncludes(String(emailPayload?.subject), "카테고리 변경");
  assertStringIncludes(String(emailPayload?.textContent), "기존 구독 설정은 변경 확인 전까지 유지됩니다.");
  assertEquals(String(emailPayload?.textContent).includes("/trends/unsubscribe/"), false);
});

Deno.test("sends a personalized Development campaign to an allowlisted subscriber and returns aggregate-only data", async () => {
  let emailPayload: Record<string, unknown> | undefined;
  const { handler, calls } = deliveryHandler({ onBrevo: (payload) => { emailPayload = payload; } });
  const response = await handler(request({ action: "deliver_batch", trendDate: "2026-11-02", deliveryRevision: 2, afterId: null }));
  const result = await response.json();

  assertEquals(response.status, 200);
  assertEquals(result.delivery.status, "sent");
  assertEquals(result.deliveryRevision, 2);
  assertEquals(result.batch.sent, 1);
  assertEquals(result.hasMore, false);
  assertEquals(Object.keys(result).sort(), ["batch", "delivery", "deliveryRevision", "hasMore", "nextCursor", "success", "trendDate"].sort());
  assertEquals(calls.filter(({ url }) => url === "https://api.brevo.com/v3/smtp/email").length, 1);
  assertStringIncludes(String(emailPayload?.htmlContent), "테스트 키워드 1");
  assertStringIncludes(String(emailPayload?.htmlContent), "https://blog.gongzza.com/guide/");
  assertStringIncludes(String(emailPayload?.htmlContent), "https://www-dev.bloggenius.kr/download/");
  assertStringIncludes(String(emailPayload?.htmlContent), "https://www-dev.bloggenius.kr/trends/unsubscribe/?token=u_");
  assertEquals(calls.some(({ url }) => url.includes("/rpc/finish_trends_newsletter_delivery")), true);
  const claimCall = calls.find(({ url }) => url.includes("/rpc/claim_trends_newsletter_delivery"));
  assertEquals(JSON.parse(String(claimCall?.init.body)), {
    p_trend_date: "2026-11-02", p_delivery_revision: 2, p_subscriber_id: activeSubscriber.id,
  });
});

Deno.test("keeps campaign delivery Development allowlist-only", async () => {
  let calls = 0;
  const handler = createHandler({
    env: { ...baseEnv, NEWSLETTER_UNSUBSCRIBE_TOKEN_SECRET: "x".repeat(48), BLOGGENIUS_ENV: "production", NEWSLETTER_EMAIL_MODE: "live" },
    fetcher: async () => { calls++; return new Response(); },
  });
  const response = await handler(request({ action: "deliver_batch", trendDate: "2026-11-02", deliveryRevision: 1 }));
  assertEquals(response.status, 403);
  assertEquals(calls, 0);
});

Deno.test("does not call Brevo again for a recipient with an existing delivery claim", async () => {
  const { handler, calls } = deliveryHandler({ claimOutcome: "already_claimed" });
  const response = await handler(request({ action: "deliver_batch", trendDate: "2026-11-02", deliveryRevision: 1, afterId: null }));
  const result = await response.json();
  assertEquals(response.status, 200);
  assertEquals(result.batch.alreadyClaimed, 1);
  assertEquals(calls.filter(({ url }) => url === "https://api.brevo.com/v3/smtp/email").length, 0);
});

Deno.test("records a rejected Brevo response without exposing provider details to the caller", async () => {
  let finishPayload: Record<string, unknown> | undefined;
  const { handler } = deliveryHandler({
    brevoStatus: 401,
    brevoBody: { code: "unauthorized", message: "IP address is not authorized for reader@example.com" },
    onFinish: (payload) => { finishPayload = payload; },
  });
  const response = await handler(request({ action: "deliver_batch", trendDate: "2026-11-02", deliveryRevision: 1 }));
  const result = await response.json();
  assertEquals(response.status, 200);
  assertEquals(result.batch.failed, 1);
  assertEquals(finishPayload?.p_status, "failed");
  assertEquals(finishPayload?.p_outcome_code, "provider_rejected");
  assertEquals(JSON.stringify(result).includes("unauthorized"), false);
  assertEquals(JSON.stringify(result).includes("reader@example.com"), false);
});

Deno.test("can process an explicit new delivery revision even when the date-level status was sent", async () => {
  const { handler, calls } = deliveryHandler({ runDeliveryStatus: "sent" });
  const response = await handler(request({ action: "deliver_batch", trendDate: "2026-11-02", deliveryRevision: 2, afterId: null }));
  const result = await response.json();
  assertEquals(response.status, 200);
  assertEquals(result.deliveryRevision, 2);
  assertEquals(calls.some(({ url }) => url.includes("/rpc/list_active_trends_subscribers")), true);
  assertEquals(calls.filter(({ url }) => url === "https://api.brevo.com/v3/smtp/email").length, 1);
});

Deno.test("requires a positive delivery revision before touching dependencies", async () => {
  let calls = 0;
  const handler = createHandler({ env: baseEnv, fetcher: async () => { calls++; return new Response(); } });
  const response = await handler(request({ action: "deliver_batch", trendDate: "2026-11-02", deliveryRevision: 0 }));
  assertEquals(response.status, 400);
  assertEquals(calls, 0);
});
