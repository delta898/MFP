const PROVIDER_ID = "naver-news";
const PROVIDER_SOURCE = "naver-search-news";
const DEVELOPERS_SEARCH_ENDPOINT = "https://openapi.naver.com/v1/search/news.json";
const CACHE_TTL_SECONDS = 15 * 60;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type NaverNewsRouteOptions = {
  fetchImpl?: FetchLike;
  getEnv?: (name: string) => string | undefined;
  now?: () => Date;
};

function compact(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function decodeHtml(value: unknown) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return String(value ?? "")
    .replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        const hexadecimal = entity[1]?.toLowerCase() === "x";
        const parsed = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff) {
          try {
            return String.fromCodePoint(parsed);
          } catch (_error) {
            return match;
          }
        }
        return match;
      }
      return named[entity.toLowerCase()] ?? match;
    });
}

export function cleanNaverNewsText(value: unknown, maxLength = 1000) {
  return compact(decodeHtml(value).replace(/<[^>]*>/g, " "), maxLength);
}

function parseUrl(value: unknown, httpsOnly: boolean) {
  const text = compact(value, 2048);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password) return null;
    if (httpsOnly && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed;
  } catch (_error) {
    return null;
  }
}

function publisherFromUrls(...values: unknown[]) {
  for (const value of values) {
    const parsed = parseUrl(value, false);
    if (!parsed) continue;
    return parsed.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "").slice(0, 160);
  }
  return "";
}

function normalizeTitleKey(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 300);
}

function defaultGetEnv(name: string) {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.(name);
}

function providerError(code: string) {
  const error = new Error(code) as Error & { code?: string };
  error.code = code;
  return error;
}

function resolveNaverSearchConnection(getEnv: (name: string) => string | undefined) {
  const developersClientId = compact(getEnv("NAVER_CLIENT_ID"), 512);
  const developersClientSecret = compact(getEnv("NAVER_CLIENT_SECRET"), 512);
  if (developersClientId && developersClientSecret) {
    return {
      endpoint: DEVELOPERS_SEARCH_ENDPOINT,
      headers: {
        "X-Naver-Client-Id": developersClientId,
        "X-Naver-Client-Secret": developersClientSecret,
      },
    };
  }
  return null;
}

async function sha256Base64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function buildSnapshot(items: Record<string, unknown>[], observedAt: string, topic: string) {
  const expiresAt = new Date(Date.parse(observedAt) + CACHE_TTL_SECONDS * 1000).toISOString();
  return {
    schema_version: 1,
    snapshot_id: `ks_${await sha256Base64Url(`${PROVIDER_ID}:${topic}:${observedAt}`)}`,
    kind: "news",
    provider_id: PROVIDER_ID,
    transport: "server_gateway",
    freshness: "fresh",
    observed_at: observedAt,
    expires_at: expiresAt,
    items,
  };
}

async function normalizeNewsItems(
  rawItems: unknown[],
  options: { observedAt: string; limit: number },
) {
  const observedMs = Date.parse(options.observedAt);
  const candidates: Array<Record<string, unknown> & { _publishedMs: number }> = [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const title = cleanNaverNewsText(item.title, 300);
    const summary = cleanNaverNewsText(item.description, 1000);
    const publishedMs = Date.parse(compact(item.pubDate, 100));
    const originalUrl = parseUrl(item.originallink, true);
    const naverUrl = parseUrl(item.link, true);
    const url = originalUrl || naverUrl;
    const publisher = publisherFromUrls(item.originallink, item.link);
    if (!title || !url || !publisher || !Number.isFinite(publishedMs)) continue;
    if (publishedMs > observedMs + FUTURE_TOLERANCE_MS || observedMs - publishedMs > MAX_AGE_MS) continue;

    const normalizedUrl = url.toString();
    candidates.push({
      id: `news_${await sha256Base64Url(normalizedUrl)}`,
      title,
      summary,
      observed_at: options.observedAt,
      url: normalizedUrl,
      source: PROVIDER_SOURCE,
      publisher,
      published_at: new Date(publishedMs).toISOString(),
      _publishedMs: publishedMs,
    });
  }

  candidates.sort((left, right) => right._publishedMs - left._publishedMs);
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const result: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    const urlKey = String(candidate.url);
    const titleKey = normalizeTitleKey(String(candidate.title));
    if (seenUrls.has(urlKey) || (titleKey && seenTitles.has(titleKey))) continue;
    seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);
    const { _publishedMs: _ignored, ...normalized } = candidate;
    result.push(normalized);
    if (result.length >= options.limit) break;
  }
  return result;
}

export function createNaverNewsRoute(options: NaverNewsRouteOptions = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const getEnv = options.getEnv || defaultGetEnv;
  const now = options.now || (() => new Date());

  return {
    providerId: PROVIDER_ID,
    kind: "news" as const,
    purpose: "content_ideas" as const,
    execution: "upstream" as const,
    operation: "news_search",
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    staleTtlSeconds: 6 * 60 * 60,
    quotaLimit: 5000,
    quotaWindowSeconds: 24 * 60 * 60,
    upstreamTimeoutMs: 10000,
    shouldFetch(query: Record<string, unknown>) {
      return compact(query.topic, 180).length > 0;
    },
    async fetchSnapshot(query: Record<string, unknown>) {
      const topic = compact(query.topic, 180);
      const observedAt = now().toISOString();
      if (!topic) return await buildSnapshot([], observedAt, topic);

      const connection = resolveNaverSearchConnection(getEnv);
      if (!connection) throw providerError("NAVER_NEWS_NOT_CONFIGURED");

      const requestedLimit = Number(query.limit || 10);
      const limit = Math.max(1, Math.min(20, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 10));
      const url = new URL(connection.endpoint);
      url.searchParams.set("query", topic);
      url.searchParams.set("display", String(Math.min(100, Math.max(limit, limit * 3))));
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "date");

      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...connection.headers,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw providerError("NAVER_NEWS_AUTH_FAILED");
        }
        if (response.status === 429) throw providerError("NAVER_NEWS_RATE_LIMITED");
        if (response.status >= 400 && response.status < 500) {
          throw providerError("NAVER_NEWS_REQUEST_REJECTED");
        }
        throw providerError("NAVER_NEWS_UPSTREAM_FAILED");
      }

      const payload = await response.json() as Record<string, unknown>;
      if (!Array.isArray(payload.items)) throw providerError("NAVER_NEWS_INVALID_RESPONSE");
      const items = await normalizeNewsItems(payload.items, { observedAt, limit });
      return await buildSnapshot(items, observedAt, topic);
    },
  };
}

export const NAVER_NEWS_PROVIDER_ID = PROVIDER_ID;
