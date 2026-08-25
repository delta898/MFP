import {
  buildSerpApiObservationId,
  normalizeSerpApiCollectionRequest,
  normalizeSerpApiObservation,
  SERPAPI_COLLECTION_MAX_RETENTION_MS,
  SERPAPI_NEWS_PROVIDER_ID,
} from "./serpapi-collection-contract.ts";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const MAX_RAW_CANDIDATES = 100;
const MAX_ACCEPTED_OBSERVATIONS = 50;

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ProviderOptions = {
  fetchImpl?: FetchLike;
  getEnv?: (name: string) => string | undefined;
  now?: () => Date;
  timeoutMs?: number;
};

type LaneDefinition = {
  locale: "ko-KR" | "en-US";
  country: "KR" | "US";
  hl: "ko" | "en";
  gl: "kr" | "us";
  query?: string;
};

export const SERPAPI_GOOGLE_NEWS_LANES = Object.freeze<Record<string, LaneDefinition>>({
  headlines_kr: Object.freeze({ locale: "ko-KR", country: "KR", hl: "ko", gl: "kr" }),
  headlines_global: Object.freeze({ locale: "en-US", country: "US", hl: "en", gl: "us" }),
  technology: Object.freeze({
    locale: "ko-KR", country: "KR", hl: "ko", gl: "kr", query: "기술 OR 인공지능 OR 로봇",
  }),
  business: Object.freeze({
    locale: "ko-KR", country: "KR", hl: "ko", gl: "kr", query: "비즈니스 OR 경제 OR 스타트업",
  }),
  science: Object.freeze({
    locale: "ko-KR", country: "KR", hl: "ko", gl: "kr", query: "과학 OR 연구 OR 우주",
  }),
  culture_lifestyle: Object.freeze({
    locale: "ko-KR", country: "KR", hl: "ko", gl: "kr", query: "문화 OR 생활 OR 디자인",
  }),
  travel_local: Object.freeze({
    locale: "ko-KR", country: "KR", hl: "ko", gl: "kr", query: "여행 OR 지역 OR 축제",
  }),
});

function compact(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanText(value: unknown, maxLength: number) {
  const entities: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  };
  return compact(String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&([a-z]+);/gi, (match, name: string) => entities[name.toLowerCase()] ?? match), maxLength);
}

function defaultGetEnv(name: string) {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.(name);
}

function providerError(code: string, attemptedUpstream: boolean) {
  const error = new Error(code) as Error & { code?: string; attemptedUpstream?: boolean };
  error.code = code;
  error.attemptedUpstream = attemptedUpstream;
  return error;
}

function safeUrl(value: unknown) {
  const text = compact(value, 2048);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    url.hash = "";
    return url.toString();
  } catch (_error) {
    return "";
  }
}

function publisherName(value: unknown, url: string) {
  if (typeof value === "string") {
    const name = cleanText(value, 160);
    if (name) return name;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const name = cleanText((value as Record<string, unknown>).name, 160);
    if (name) return name;
  }
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "").slice(0, 160);
  } catch (_error) {
    return "";
  }
}

function publicationTime(item: Record<string, unknown>) {
  for (const value of [item.iso_date, item.date]) {
    const parsed = Date.parse(compact(value, 100));
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return "";
}

function normalizeTitleKey(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 300);
}

function collectRawCandidates(value: unknown) {
  const queue = Array.isArray(value) ? [...value] : [];
  const candidates: Record<string, unknown>[] = [];
  while (queue.length > 0 && candidates.length < MAX_RAW_CANDIDATES) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || Array.isArray(current)) continue;
    const item = current as Record<string, unknown>;
    if (compact(item.title, 300) || compact(item.link, 2048)) candidates.push(item);
    if (Array.isArray(item.stories)) queue.push(...item.stories.slice(0, MAX_RAW_CANDIDATES));
  }
  return candidates;
}

export function createSerpApiGoogleNewsProvider(options: ProviderOptions = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const getEnv = options.getEnv || defaultGetEnv;
  const now = options.now || (() => new Date());
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || 10000, 30000));

  return {
    id: SERPAPI_NEWS_PROVIDER_ID,
    async collect(rawRequest: unknown) {
      const request = normalizeSerpApiCollectionRequest(rawRequest);
      const definition = SERPAPI_GOOGLE_NEWS_LANES[request.lane];
      if (!definition) throw providerError("SERPAPI_LANE_NOT_CONFIGURED", false);
      const apiKey = compact(getEnv("SERPAPI_API_KEY"), 512);
      if (!apiKey) throw providerError("SERPAPI_NOT_CONFIGURED", false);

      const url = new URL(SERPAPI_ENDPOINT);
      url.searchParams.set("engine", "google_news");
      url.searchParams.set("hl", definition.hl);
      url.searchParams.set("gl", definition.gl);
      url.searchParams.set("output", "json");
      url.searchParams.set("api_key", apiKey);
      if (definition.query) url.searchParams.set("q", definition.query);

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (_error) {
        throw providerError("SERPAPI_UPSTREAM_FAILED", true);
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw providerError("SERPAPI_AUTH_FAILED", true);
        }
        if (response.status === 429) throw providerError("SERPAPI_RATE_LIMITED", true);
        if (response.status >= 400 && response.status < 500) {
          throw providerError("SERPAPI_REQUEST_REJECTED", true);
        }
        throw providerError("SERPAPI_UPSTREAM_FAILED", true);
      }

      let payload: Record<string, unknown>;
      try {
        payload = await response.json() as Record<string, unknown>;
      } catch (_error) {
        throw providerError("SERPAPI_INVALID_RESPONSE", true);
      }
      if (compact(payload.error, 500)) throw providerError("SERPAPI_REQUEST_REJECTED", true);
      if (!Array.isArray(payload.news_results)) throw providerError("SERPAPI_INVALID_RESPONSE", true);

      const observedAt = now().toISOString();
      const expiresAt = new Date(Date.parse(observedAt) + SERPAPI_COLLECTION_MAX_RETENTION_MS).toISOString();
      const candidates = collectRawCandidates(payload.news_results);
      const observations: Awaited<ReturnType<typeof normalizeSerpApiObservation>>[] = [];
      const seenUrls = new Set<string>();
      const seenTitles = new Set<string>();

      for (const item of candidates) {
        if (observations.length >= MAX_ACCEPTED_OBSERVATIONS) break;
        const title = cleanText(item.title, 300);
        const summary = cleanText(item.snippet ?? item.description, 1000);
        const articleUrl = safeUrl(item.link);
        const publisher = publisherName(item.source, articleUrl);
        const publishedAt = publicationTime(item);
        const titleKey = normalizeTitleKey(title);
        if (!title || !articleUrl || !publisher || !publishedAt
          || seenUrls.has(articleUrl) || (titleKey && seenTitles.has(titleKey))) continue;
        try {
          const observation = await normalizeSerpApiObservation({
            schema_version: 1,
            observation_id: await buildSerpApiObservationId(articleUrl),
            kind: "news",
            provider_id: SERPAPI_NEWS_PROVIDER_ID,
            source: "google-news",
            lane: request.lane,
            locale: definition.locale,
            country: definition.country,
            title,
            summary,
            url: articleUrl,
            publisher,
            published_at: publishedAt,
            observed_at: observedAt,
            expires_at: expiresAt,
          });
          observations.push(observation);
          seenUrls.add(observation.url);
          if (titleKey) seenTitles.add(titleKey);
        } catch (_error) {
          // Invalid source material is counted as rejected, never logged or persisted raw.
        }
      }

      return {
        provider_id: SERPAPI_NEWS_PROVIDER_ID,
        lane: request.lane,
        attempted_upstream: true,
        fetched_count: candidates.length,
        accepted_count: observations.length,
        rejected_count: candidates.length - observations.length,
        observations,
      };
    },
  };
}
