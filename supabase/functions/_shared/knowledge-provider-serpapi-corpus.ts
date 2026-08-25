const PROVIDER_ID = "serpapi-corpus";
const OBSERVATION_PROVIDER_ID = "serpapi-google-news";
const KIND = "news";
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const CANDIDATE_LIMIT = 50;
const PUBLISHER_CAP = 2;

const ALLOWED_LANES = new Set([
  "headlines_kr", "headlines_global", "technology", "business", "science",
  "culture_lifestyle", "travel_local",
]);
const ALLOWED_LOCALES = new Set(["ko-KR", "en-US"]);
const ALLOWED_COUNTRIES = new Set(["KR", "US"]);

type RpcClient = {
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: null | { code?: string };
  }>;
};

type CorpusRouteOptions = {
  now?: () => Date;
};

type CorpusRow = Record<string, unknown> & {
  observation_id: string;
  lane: string;
  publisher: string;
  expires_at: string;
};

function compact(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function errorWithCode(code: string) {
  const error = new Error(code) as Error & { code?: string };
  error.code = code;
  return error;
}

function iso(value: unknown) {
  const parsed = Date.parse(compact(value, 80));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
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

function titleKey(value: unknown) {
  return compact(value, 300).toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeCorpusRow(raw: unknown, nowMs: number): CorpusRow | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const observationId = compact(row.observation_id, 180);
  const lane = compact(row.lane, 40);
  const locale = compact(row.locale, 20);
  const country = compact(row.country, 8).toUpperCase();
  const title = compact(row.title, 300);
  const summary = compact(row.summary, 1000);
  const url = safeHttpsUrl(row.url);
  const source = compact(row.source, 120);
  const publisher = compact(row.publisher, 160);
  const publishedAt = iso(row.published_at);
  const observedAt = iso(row.observed_at);
  const expiresAt = iso(row.expires_at);
  if (!observationId || row.kind !== KIND || compact(row.provider_id, 120) !== OBSERVATION_PROVIDER_ID
    || !ALLOWED_LANES.has(lane) || !ALLOWED_LOCALES.has(locale) || !ALLOWED_COUNTRIES.has(country)
    || !title || !url || !source || !publisher || !publishedAt || !observedAt || !expiresAt) return null;
  if (Date.parse(expiresAt) <= nowMs || Date.parse(observedAt) > nowMs + FUTURE_TOLERANCE_MS
    || Date.parse(publishedAt) > nowMs + FUTURE_TOLERANCE_MS) return null;
  return {
    ...row,
    observation_id: observationId,
    lane,
    locale,
    country,
    title,
    summary,
    url,
    source,
    publisher,
    published_at: publishedAt,
    observed_at: observedAt,
    expires_at: expiresAt,
  } as CorpusRow;
}

function dedupeRows(rows: CorpusRow[]) {
  const ids = new Set<string>();
  const urls = new Set<string>();
  const titles = new Set<string>();
  return rows.filter((row) => {
    const id = row.observation_id;
    const url = String(row.url);
    const title = titleKey(row.title);
    if (ids.has(id) || urls.has(url) || (title && titles.has(title))) return false;
    ids.add(id);
    urls.add(url);
    if (title) titles.add(title);
    return true;
  });
}

export function selectDiverseCorpusRows(rows: CorpusRow[], requestedLanes: string[], limit: number) {
  const groups = new Map<string, CorpusRow[]>();
  for (const row of rows) {
    if (!groups.has(row.lane)) groups.set(row.lane, []);
    groups.get(row.lane)?.push(row);
  }
  const laneOrder = [
    ...requestedLanes.filter((lane) => groups.has(lane)),
    ...Array.from(groups.keys()).filter((lane) => !requestedLanes.includes(lane)),
  ];
  const selected: CorpusRow[] = [];
  const deferred: CorpusRow[] = [];
  const publisherCounts = new Map<string, number>();
  let progressed = true;
  while (selected.length < limit && progressed) {
    progressed = false;
    for (const lane of laneOrder) {
      const candidate = groups.get(lane)?.shift();
      if (!candidate) continue;
      progressed = true;
      const count = publisherCounts.get(candidate.publisher) || 0;
      if (count >= PUBLISHER_CAP) {
        deferred.push(candidate);
        continue;
      }
      selected.push(candidate);
      publisherCounts.set(candidate.publisher, count + 1);
      if (selected.length >= limit) break;
    }
  }
  if (selected.length < limit) {
    const remaining = [
      ...deferred,
      ...laneOrder.flatMap((lane) => groups.get(lane) || []),
    ];
    for (const candidate of remaining) {
      if (selected.length >= limit) break;
      selected.push(candidate);
    }
  }
  return selected;
}

async function sha256Base64Url(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function createSerpApiCorpusRoute(options: CorpusRouteOptions = {}) {
  const now = options.now || (() => new Date());
  return {
    providerId: PROVIDER_ID,
    kind: KIND as "news",
    purpose: "serendipity" as const,
    execution: "stored_corpus" as const,
    operation: "read_observations",
    async readSnapshot(client: RpcClient, query: Record<string, unknown>) {
      const observedAt = new Date(now()).toISOString();
      const nowMs = Date.parse(observedAt);
      const lanes = Array.isArray(query.lanes) ? query.lanes.map(String) : [];
      const locales = Array.isArray(query.locales) ? query.locales.map(String) : [];
      const countries = Array.isArray(query.countries) ? query.countries.map(String) : [];
      const excludeIds = Array.isArray(query.exclude_ids) ? query.exclude_ids.map(String) : [];
      const excluded = new Set(excludeIds);
      const limit = Math.max(1, Math.min(20, Number(query.limit) || 12));
      const { data, error } = await client.rpc("read_knowledge_observations", {
        p_provider_id: OBSERVATION_PROVIDER_ID,
        p_kind: KIND,
        p_lanes: lanes,
        p_locales: locales,
        p_countries: countries,
        p_exclude_ids: excludeIds,
        p_limit: CANDIDATE_LIMIT,
      });
      if (error || !Array.isArray(data)) throw errorWithCode("CORPUS_READ_FAILED");
      const validRows = data.map((row) => normalizeCorpusRow(row, nowMs)).filter(Boolean) as CorpusRow[];
      if (data.length > 0 && validRows.length === 0) throw errorWithCode("CORPUS_INVALID_RESPONSE");
      const normalized = dedupeRows(validRows.filter((row) =>
        !excluded.has(row.observation_id)
        && (lanes.length === 0 || lanes.includes(row.lane))
        && (locales.length === 0 || locales.includes(String(row.locale)))
        && (countries.length === 0 || countries.includes(String(row.country)))
      ));
      const selected = selectDiverseCorpusRows(normalized, lanes, limit);
      const itemExpiry = selected.reduce(
        (earliest, row) => Math.min(earliest, Date.parse(row.expires_at)),
        nowMs + SNAPSHOT_TTL_MS,
      );
      const items = selected.map((row) => ({
        id: row.observation_id,
        title: row.title,
        summary: row.summary,
        observed_at: row.observed_at,
        url: row.url,
        source: row.source,
        publisher: row.publisher,
        published_at: row.published_at,
      }));
      return {
        schema_version: 1,
        snapshot_id: `ks_${await sha256Base64Url(`${PROVIDER_ID}:${observedAt}:${items.map((item) => item.id).join(",")}`)}`,
        kind: KIND,
        provider_id: PROVIDER_ID,
        transport: "server_gateway",
        freshness: "fresh",
        observed_at: observedAt,
        expires_at: new Date(itemExpiry).toISOString(),
        items,
      };
    },
  };
}
