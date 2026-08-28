const PROVIDER_ID = "naver-shopping-product";
const PROVIDER_SOURCE = "naver-search-shopping";
const DEVELOPERS_SEARCH_ENDPOINT = "https://openapi.naver.com/v1/search/shop.json";
const CACHE_TTL_SECONDS = 15 * 60;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type NaverShoppingProductRouteOptions = {
  fetchImpl?: FetchLike;
  getEnv?: (name: string) => string | undefined;
  now?: () => Date;
};

function compact(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function productId(value: unknown) {
  const normalized = compact(value, 40);
  return /^\d{1,40}$/.test(normalized) ? normalized : "";
}

function decodeHtml(value: unknown) {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  };
  return String(value ?? "").replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (match, entity: string) => {
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
    const parsed = new URL(compact(decodeHtml(value), 2048));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number.parseInt(compact(value, 20), 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
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

function urlReferencesProductId(value: unknown, expectedProductId: string) {
  const url = safeHttpsUrl(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split("/").filter(Boolean).map((entry) => decodeURIComponent(entry));
    if (pathSegments.includes(expectedProductId)) return true;
    for (const parameterValue of parsed.searchParams.values()) {
      if (parameterValue === expectedProductId) return true;
    }
    return false;
  } catch (_error) {
    return false;
  }
}

function isExactMatch(item: Record<string, unknown>, expectedProductId: string) {
  return productId(item.productId) === expectedProductId || urlReferencesProductId(item.link, expectedProductId);
}

async function buildSnapshot(item: Record<string, unknown> | null, observedAt: string, expectedProductId: string) {
  const expiresAt = new Date(Date.parse(observedAt) + CACHE_TTL_SECONDS * 1000).toISOString();
  return {
    schema_version: 1,
    snapshot_id: `ks_${await sha256Base64Url(`${PROVIDER_ID}:${expectedProductId}:${observedAt}`)}`,
    kind: "shopping_product",
    provider_id: PROVIDER_ID,
    transport: "server_gateway",
    freshness: "fresh",
    observed_at: observedAt,
    expires_at: expiresAt,
    items: item ? [item] : [],
  };
}

async function normalizeExactItem(raw: Record<string, unknown>, observedAt: string, expectedProductId: string) {
  const title = cleanText(raw.title, 300);
  const url = safeHttpsUrl(raw.link);
  if (!title || !url || !isExactMatch(raw, expectedProductId)) return null;
  const imageUrl = safeHttpsUrl(raw.image);
  const categories = [raw.category1, raw.category2, raw.category3, raw.category4]
    .map((entry) => cleanText(entry, 100))
    .filter(Boolean);
  return {
    id: `shopping_${await sha256Base64Url(`${expectedProductId}:${url}`)}`,
    title,
    summary: "",
    observed_at: observedAt,
    url,
    source: PROVIDER_SOURCE,
    publisher: cleanText(raw.mallName, 160),
    product_id: expectedProductId,
    image_url: imageUrl,
    mall_name: cleanText(raw.mallName, 160),
    categories,
    low_price: nonNegativeInteger(raw.lprice),
    high_price: nonNegativeInteger(raw.hprice),
  };
}

export function createNaverShoppingProductRoute(options: NaverShoppingProductRouteOptions = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const getEnv = options.getEnv || defaultGetEnv;
  const now = options.now || (() => new Date());

  return {
    providerId: PROVIDER_ID,
    kind: "shopping_product" as const,
    purpose: "product_recovery" as const,
    execution: "upstream" as const,
    operation: "shopping_product_recovery",
    cacheTtlSeconds: CACHE_TTL_SECONDS,
    staleTtlSeconds: 60 * 60,
    quotaLimit: 5000,
    quotaWindowSeconds: 24 * 60 * 60,
    upstreamTimeoutMs: 10000,
    async fetchSnapshot(query: Record<string, unknown>) {
      const expectedProductId = productId(query.product_id);
      const productName = compact(query.product_name, 180);
      const observedAt = now().toISOString();
      if (!expectedProductId) return await buildSnapshot(null, observedAt, expectedProductId);

      const connection = resolveConnection(getEnv);
      if (!connection) throw providerError("NAVER_SHOPPING_NOT_CONFIGURED");
      const queries = [...new Set([expectedProductId, productName].filter(Boolean))];
      for (const searchQuery of queries) {
        const url = new URL(connection.endpoint);
        url.searchParams.set("query", searchQuery);
        url.searchParams.set("display", "20");
        url.searchParams.set("start", "1");
        url.searchParams.set("sort", "sim");

        const response = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json", ...connection.headers },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw providerError("NAVER_SHOPPING_AUTH_FAILED");
          if (response.status === 429) throw providerError("NAVER_SHOPPING_RATE_LIMITED");
          if (response.status >= 400 && response.status < 500) throw providerError("NAVER_SHOPPING_REQUEST_REJECTED");
          throw providerError("NAVER_SHOPPING_UPSTREAM_FAILED");
        }
        const payload = await response.json() as Record<string, unknown>;
        if (!Array.isArray(payload.items)) throw providerError("NAVER_SHOPPING_INVALID_RESPONSE");
        const matched = payload.items.find((candidate) => (
          candidate && typeof candidate === "object" && !Array.isArray(candidate)
            && isExactMatch(candidate as Record<string, unknown>, expectedProductId)
        ));
        if (matched) {
          const normalized = await normalizeExactItem(matched as Record<string, unknown>, observedAt, expectedProductId);
          if (normalized) return await buildSnapshot(normalized, observedAt, expectedProductId);
        }
      }
      return await buildSnapshot(null, observedAt, expectedProductId);
    },
  };
}

export const NAVER_SHOPPING_PRODUCT_PROVIDER_ID = PROVIDER_ID;
