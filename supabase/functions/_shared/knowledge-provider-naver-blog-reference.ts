const PROVIDER_ID = "naver-blog-reference";
const PROVIDER_SOURCE = "naver-search-blog";
const DEVELOPERS_SEARCH_ENDPOINT = "https://openapi.naver.com/v1/search/blog.json";
const CACHE_TTL_SECONDS = 10 * 60;
const MAX_RESULTS = 5;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type NaverBlogReferenceRouteOptions = {
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

function cleanText(value: unknown, maxLength: number) {
  return compact(decodeHtml(value).replace(/<[^>]*>/g, " "), maxLength);
}

function safeHttpsUrl(value: unknown) {
  try {
    const parsed = new URL(compact(value, 2048));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

function parsePostDate(value: unknown) {
  const text = compact(value, 8);
  const match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return date.toISOString();
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

function resolveConnection(getEnv: (name: string) => string | undefined) {
  const clientId = compact(getEnv("NAVER_CLIENT_ID"), 512);
  const clientSecret = compact(getEnv("NAVER_CLIENT_SECRET"), 512);
  if (!clientId || !clientSecret) return null;
  return {
    endpoint: DEVELOPERS_SEARCH_ENDPOINT,
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  };
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
    kind: "blog_reference",
    provider_id: PROVIDER_ID,
    transport: "server_gateway",
    freshness: "fresh",
    observed_at: observedAt,
    expires_at: expiresAt,
    items,
  };
}

async function normalizeItems(rawItems: unknown[], observedAt: string, limit: number) {
  const candidates: Array<Record<string, unknown> & { _publishedMs: number }> = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const title = cleanText(item.title, 300);
    const url = safeHttpsUrl(item.link);
    const publishedAt = parsePostDate(item.postdate);
    if (!title || !url || !publishedAt) continue;
    const parsedUrl = new URL(url);
    candidates.push({
      id: `reference_${await sha256Base64Url(url)}`,
      title,
      summary: "",
      observed_at: observedAt,
      url,
      source: PROVIDER_SOURCE,
      publisher: parsedUrl.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "").slice(0, 160),
      published_at: publishedAt,
      _publishedMs: Date.parse(publishedAt),
    });
  }

  candidates.sort((left, right) => right._publishedMs - left._publishedMs);
  const seen = new Set<string>();
  const result: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    const url = String(candidate.url);
    if (seen.has(url)) continue;
    seen.add(url);
    const { _publishedMs: _ignored, ...normalized } = candidate;
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

export function createNaverBlogReferenceRoute(options: NaverBlogReferenceRouteOptions = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const getEnv = options.getEnv || defaultGetEnv;
  const now = options.now || (() => new Date());

  return {
    providerId: PROVIDER_ID,
    kind: "blog_reference" as const,
    purpose: "writing_reference" as const,
    execution: "upstream" as const,
    operation: "blog_reference_search",
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    staleTtlSeconds: 60 * 60,
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

      const connection = resolveConnection(getEnv);
      if (!connection) throw providerError("NAVER_BLOG_NOT_CONFIGURED");

      const requestedLimit = Number(query.limit || 3);
      const limit = Math.max(1, Math.min(MAX_RESULTS, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 3));
      const url = new URL(connection.endpoint);
      url.searchParams.set("query", topic);
      url.searchParams.set("display", String(Math.min(100, Math.max(10, limit * 2))));
      url.searchParams.set("start", "1");
      url.searchParams.set("sort", "sim");

      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", ...connection.headers },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw providerError("NAVER_BLOG_AUTH_FAILED");
        if (response.status === 429) throw providerError("NAVER_BLOG_RATE_LIMITED");
        if (response.status >= 400 && response.status < 500) throw providerError("NAVER_BLOG_REQUEST_REJECTED");
        throw providerError("NAVER_BLOG_UPSTREAM_FAILED");
      }

      const payload = await response.json() as Record<string, unknown>;
      if (!Array.isArray(payload.items)) throw providerError("NAVER_BLOG_INVALID_RESPONSE");
      return await buildSnapshot(await normalizeItems(payload.items, observedAt, limit), observedAt, topic);
    },
  };
}

export const NAVER_BLOG_REFERENCE_PROVIDER_ID = PROVIDER_ID;
