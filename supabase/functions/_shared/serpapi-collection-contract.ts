export const SERPAPI_COLLECTION_SCHEMA_VERSION = 1;
export const SERPAPI_NEWS_PROVIDER_ID = "serpapi-google-news";
export const SERPAPI_NEWS_SOURCE = "google-news";
export const SERPAPI_COLLECTION_MAX_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export const SERPAPI_COLLECTION_LANES = Object.freeze([
  "headlines_kr",
  "headlines_global",
  "technology",
  "business",
  "science",
  "culture_lifestyle",
  "travel_local",
] as const);

type CollectionLane = typeof SERPAPI_COLLECTION_LANES[number];
type CollectionTrigger = "scheduled" | "manual";
type CollectionStatus = "succeeded" | "failed" | "skipped";

const ALLOWED_LANES = new Set<string>(SERPAPI_COLLECTION_LANES);
const ALLOWED_LOCALES = new Set(["ko-KR", "en-US"]);
const ALLOWED_COUNTRIES = new Set(["KR", "US"]);
const ALLOWED_TRIGGERS = new Set<CollectionTrigger>(["scheduled", "manual"]);
const ALLOWED_STATUSES = new Set<CollectionStatus>(["succeeded", "failed", "skipped"]);
const SENSITIVE_KEY = /(api[_-]?key|secret|authorization|credential|access[_-]?token|license[_-]?key|hwid|owner[_-]?id|user[_-]?id|raw[_-]?(response|payload)|headers?|html|article[_-]?body)/i;
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

function compact(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function object(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field}_invalid`);
  return value as Record<string, unknown>;
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: Set<string>, field: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${field}_${key}_not_allowed`);
    if (SENSITIVE_KEY.test(key)) throw new Error(`${field}_${key}_sensitive`);
  }
}

function iso(value: unknown, field: string) {
  const text = compact(value, 80);
  const parsed = Date.parse(text);
  if (!text || !Number.isFinite(parsed)) throw new Error(`${field}_invalid`);
  return new Date(parsed).toISOString();
}

function httpsUrl(value: unknown) {
  const text = compact(value, 2048);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch (_error) {
    throw new Error("observation_url_invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("observation_url_unsafe");
  }
  parsed.hash = "";
  return parsed.toString();
}

function boundedCount(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 500) throw new Error(`${field}_invalid`);
  return number;
}

function base64Url(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sha256(value: string) {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function buildSerpApiObservationId(url: unknown) {
  return `ko_${await sha256(httpsUrl(url))}`;
}

export function normalizeSerpApiCollectionRequest(raw: unknown) {
  const request = object(raw, "collection_request");
  assertOnlyKeys(request, new Set(["schema_version", "lane", "trigger"]), "collection_request");
  if (Number(request.schema_version) !== SERPAPI_COLLECTION_SCHEMA_VERSION) {
    throw new Error("collection_request_schema_version_invalid");
  }
  const lane = compact(request.lane, 40);
  const trigger = compact(request.trigger, 20) as CollectionTrigger;
  if (!ALLOWED_LANES.has(lane)) throw new Error("collection_request_lane_invalid");
  if (!ALLOWED_TRIGGERS.has(trigger)) throw new Error("collection_request_trigger_invalid");
  return {
    schema_version: SERPAPI_COLLECTION_SCHEMA_VERSION,
    lane: lane as CollectionLane,
    trigger,
  };
}

export async function normalizeSerpApiObservation(raw: unknown) {
  const observation = object(raw, "observation");
  assertOnlyKeys(observation, new Set([
    "schema_version", "observation_id", "kind", "provider_id", "source", "lane", "locale", "country", "title",
    "summary", "url", "publisher", "published_at", "observed_at", "expires_at",
  ]), "observation");
  if (Number(observation.schema_version) !== SERPAPI_COLLECTION_SCHEMA_VERSION) {
    throw new Error("observation_schema_version_invalid");
  }
  const kind = compact(observation.kind, 20);
  const providerId = compact(observation.provider_id, 120);
  const source = compact(observation.source, 120);
  const lane = compact(observation.lane, 40);
  const locale = compact(observation.locale, 20);
  const country = compact(observation.country, 8).toUpperCase();
  const title = compact(observation.title, 300);
  const summary = compact(observation.summary, 1000);
  const publisher = compact(observation.publisher, 160);
  const url = httpsUrl(observation.url);
  const publishedAt = iso(observation.published_at, "observation_published_at");
  const observedAt = iso(observation.observed_at, "observation_observed_at");
  const expiresAt = iso(observation.expires_at, "observation_expires_at");
  const publishedMs = Date.parse(publishedAt);
  const observedMs = Date.parse(observedAt);
  const expiresMs = Date.parse(expiresAt);

  if (kind !== "news" || providerId !== SERPAPI_NEWS_PROVIDER_ID || source !== SERPAPI_NEWS_SOURCE) {
    throw new Error("observation_identity_invalid");
  }
  if (!ALLOWED_LANES.has(lane)) throw new Error("observation_lane_invalid");
  if (!ALLOWED_LOCALES.has(locale) || !ALLOWED_COUNTRIES.has(country)) {
    throw new Error("observation_locale_invalid");
  }
  if (!title || !publisher) throw new Error("observation_content_invalid");
  if (publishedMs > observedMs + FUTURE_TOLERANCE_MS) throw new Error("observation_published_at_future");
  if (observedMs - publishedMs > SERPAPI_COLLECTION_MAX_RETENTION_MS) {
    throw new Error("observation_published_at_too_old");
  }
  if (expiresMs <= observedMs || expiresMs - observedMs > SERPAPI_COLLECTION_MAX_RETENTION_MS) {
    throw new Error("observation_expiry_invalid");
  }
  const expectedId = await buildSerpApiObservationId(url);
  if (compact(observation.observation_id, 180) !== expectedId) {
    throw new Error("observation_id_invalid");
  }
  return {
    schema_version: SERPAPI_COLLECTION_SCHEMA_VERSION,
    observation_id: expectedId,
    kind: "news" as const,
    provider_id: SERPAPI_NEWS_PROVIDER_ID,
    source: SERPAPI_NEWS_SOURCE,
    lane: lane as CollectionLane,
    locale,
    country,
    title,
    summary,
    url,
    publisher,
    published_at: publishedAt,
    observed_at: observedAt,
    expires_at: expiresAt,
  };
}

export function normalizeSerpApiCollectionRun(raw: unknown) {
  const run = object(raw, "collection_run");
  assertOnlyKeys(run, new Set([
    "schema_version", "run_id", "provider_id", "lane", "trigger", "status",
    "attempted_upstream", "fetched_count", "accepted_count", "inserted_count",
    "refreshed_count", "rejected_count", "error_code", "started_at", "completed_at",
  ]), "collection_run");
  if (Number(run.schema_version) !== SERPAPI_COLLECTION_SCHEMA_VERSION) {
    throw new Error("collection_run_schema_version_invalid");
  }
  const runId = compact(run.run_id, 180);
  const providerId = compact(run.provider_id, 120);
  const lane = compact(run.lane, 40);
  const trigger = compact(run.trigger, 20) as CollectionTrigger;
  const status = compact(run.status, 20) as CollectionStatus;
  const errorCode = compact(run.error_code, 80);
  const attemptedUpstream = run.attempted_upstream;
  if (!runId.startsWith("kcr_") || providerId !== SERPAPI_NEWS_PROVIDER_ID) {
    throw new Error("collection_run_identity_invalid");
  }
  if (!ALLOWED_LANES.has(lane) || !ALLOWED_TRIGGERS.has(trigger) || !ALLOWED_STATUSES.has(status)) {
    throw new Error("collection_run_state_invalid");
  }
  if (typeof attemptedUpstream !== "boolean") throw new Error("collection_run_attempt_invalid");
  if (errorCode && !/^[A-Z][A-Z0-9_]{0,79}$/.test(errorCode)) throw new Error("collection_run_error_code_invalid");
  if (status === "succeeded" && errorCode) throw new Error("collection_run_success_error_invalid");
  if (status === "failed" && !errorCode) throw new Error("collection_run_failure_error_required");
  const fetchedCount = boundedCount(run.fetched_count, "collection_run_fetched_count");
  const acceptedCount = boundedCount(run.accepted_count, "collection_run_accepted_count");
  const insertedCount = boundedCount(run.inserted_count, "collection_run_inserted_count");
  const refreshedCount = boundedCount(run.refreshed_count, "collection_run_refreshed_count");
  const rejectedCount = boundedCount(run.rejected_count, "collection_run_rejected_count");
  if (acceptedCount + rejectedCount > fetchedCount || insertedCount + refreshedCount > acceptedCount) {
    throw new Error("collection_run_counts_invalid");
  }
  if (!attemptedUpstream && fetchedCount + acceptedCount + insertedCount + refreshedCount + rejectedCount > 0) {
    throw new Error("collection_run_skipped_counts_invalid");
  }
  const startedAt = iso(run.started_at, "collection_run_started_at");
  const completedAt = iso(run.completed_at, "collection_run_completed_at");
  if (Date.parse(completedAt) < Date.parse(startedAt)) throw new Error("collection_run_time_invalid");
  return {
    schema_version: SERPAPI_COLLECTION_SCHEMA_VERSION,
    run_id: runId,
    provider_id: SERPAPI_NEWS_PROVIDER_ID,
    lane: lane as CollectionLane,
    trigger,
    status,
    attempted_upstream: attemptedUpstream,
    fetched_count: fetchedCount,
    accepted_count: acceptedCount,
    inserted_count: insertedCount,
    refreshed_count: refreshedCount,
    rejected_count: rejectedCount,
    error_code: errorCode,
    started_at: startedAt,
    completed_at: completedAt,
  };
}

export function serpApiObservationToNewsItem(observation: Awaited<ReturnType<typeof normalizeSerpApiObservation>>) {
  return {
    id: observation.observation_id,
    title: observation.title,
    summary: observation.summary,
    observed_at: observation.observed_at,
    url: observation.url,
    source: observation.source,
    publisher: observation.publisher,
    published_at: observation.published_at,
  };
}
