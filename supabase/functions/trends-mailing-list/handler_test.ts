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
