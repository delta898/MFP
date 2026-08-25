const SERPAPI_ACCOUNT_ENDPOINT = "https://serpapi.com/account.json";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type AccountProviderOptions = {
  fetchImpl?: FetchLike;
  getEnv?: (name: string) => string | undefined;
  timeoutMs?: number;
  now?: () => Date;
};

function compact(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function defaultGetEnv(name: string) {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.(name);
}

function accountError(code: string) {
  const error = new Error(code) as Error & { code?: string; attemptedUpstream?: boolean };
  error.code = code;
  error.attemptedUpstream = false;
  return error;
}

function boundedInteger(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000_000) {
    throw accountError(`SERPAPI_ACCOUNT_${field.toUpperCase()}_INVALID`);
  }
  return parsed;
}

function renewalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const text = compact(value, 10);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)
    || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== text) {
    throw accountError("SERPAPI_ACCOUNT_RENEWAL_DATE_INVALID");
  }
  return text;
}

export function createSerpApiAccountProvider(options: AccountProviderOptions = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const getEnv = options.getEnv || defaultGetEnv;
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 10000, 30000));
  const now = options.now || (() => new Date());

  return {
    async check() {
      const apiKey = compact(getEnv("SERPAPI_API_KEY"), 512);
      if (!apiKey) throw accountError("SERPAPI_NOT_CONFIGURED");
      const url = new URL(SERPAPI_ACCOUNT_ENDPOINT);
      url.searchParams.set("api_key", apiKey);

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (_error) {
        throw accountError("SERPAPI_ACCOUNT_UPSTREAM_FAILED");
      }
      if (response.status === 401 || response.status === 403) {
        throw accountError("SERPAPI_AUTH_FAILED");
      }
      if (response.status === 429) throw accountError("SERPAPI_ACCOUNT_RATE_LIMITED");
      if (!response.ok) throw accountError("SERPAPI_ACCOUNT_UPSTREAM_FAILED");

      let payload: Record<string, unknown>;
      try {
        payload = await response.json() as Record<string, unknown>;
      } catch (_error) {
        throw accountError("SERPAPI_ACCOUNT_INVALID_RESPONSE");
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw accountError("SERPAPI_ACCOUNT_INVALID_RESPONSE");
      }
      if (compact(payload.account_status, 40).toLowerCase() !== "active") {
        throw accountError("SERPAPI_ACCOUNT_INACTIVE");
      }

      const searchesLimit = boundedInteger(payload.searches_per_month, "searches_limit");
      const searchesUsed = boundedInteger(payload.this_month_usage, "searches_used");
      const searchesRemaining = boundedInteger(payload.total_searches_left, "searches_remaining");
      const extraCredits = boundedInteger(payload.extra_credits ?? 0, "extra_credits");
      if (searchesUsed > searchesLimit + extraCredits || searchesRemaining > searchesLimit + extraCredits) {
        throw accountError("SERPAPI_ACCOUNT_USAGE_INVALID");
      }

      return {
        checked_at: now().toISOString(),
        searches_limit: searchesLimit,
        searches_used: searchesUsed,
        searches_remaining: searchesRemaining,
        renewal_date: renewalDate(payload.plan_renewal_date),
      };
    },
  };
}
