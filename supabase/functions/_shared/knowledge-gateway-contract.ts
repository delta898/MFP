const ALLOWED_KINDS = new Set(["trends", "news"]);
const ALLOWED_PURPOSES = new Set(["content_ideas"]);
const ALLOWED_LOCALES = new Set(["ko-KR"]);
const ALLOWED_COUNTRIES = new Set(["KR"]);
const ALLOWED_CHANGE_TYPES = new Set(["new", "up", "down", "steady", "unknown"]);
const SENSITIVE_KEY = /(api[_-]?key|secret|authorization|credential|access[_-]?token|license[_-]?key|hwid|raw[_-]?(response|payload)|headers?)/i;

function compact(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function assertNoSensitiveKeys(value: unknown, path = "snapshot", seen = new Set<object>()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) throw new Error(`${path}_circular`);
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`${path}_${key}_not_allowed`);
    assertNoSensitiveKeys(child, `${path}_${key}`, seen);
  }
  seen.delete(value);
}

function iso(value: unknown, field: string) {
  const parsed = Date.parse(compact(value, 80));
  if (!Number.isFinite(parsed)) throw new Error(`${field}_invalid`);
  return new Date(parsed).toISOString();
}

function httpsUrl(value: unknown, required: boolean) {
  const text = compact(value, 2048);
  if (!text && !required) return "";
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch (_error) {
    throw new Error("url_invalid");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("url_unsafe");
  return parsed.toString();
}

export function normalizeKnowledgeGatewayRequest(body: Record<string, unknown>) {
  const allowedBodyKeys = new Set(["schema_version", "kind", "purpose", "query", "licenseKey", "hwid"]);
  if (Object.keys(body).some((key) => !allowedBodyKeys.has(key))) throw new Error("request_field_invalid");
  if (Number(body.schema_version) !== 1) throw new Error("schema_version_invalid");
  const kind = compact(body.kind, 40);
  const purpose = compact(body.purpose, 40);
  const query = body.query && typeof body.query === "object" && !Array.isArray(body.query)
    ? body.query as Record<string, unknown>
    : {};
  if (!ALLOWED_KINDS.has(kind) || !ALLOWED_PURPOSES.has(purpose)) throw new Error("route_invalid");
  const allowedQueryKeys = new Set(["topic", "locale", "country", "limit"]);
  if (Object.keys(query).some((key) => !allowedQueryKeys.has(key))) throw new Error("query_field_invalid");
  const limit = Number(query.limit || 10);
  const locale = compact(query.locale || "ko-KR", 20) || "ko-KR";
  const country = (compact(query.country || "KR", 8) || "KR").toUpperCase();
  if (!ALLOWED_LOCALES.has(locale) || !ALLOWED_COUNTRIES.has(country)) throw new Error("locale_invalid");
  return {
    kind,
    purpose,
    query: {
      topic: compact(query.topic, 180),
      locale,
      country,
      limit: Math.max(1, Math.min(20, Number.isFinite(limit) ? Math.floor(limit) : 10)),
    },
    licenseKey: compact(body.licenseKey, 256),
    hwid: compact(body.hwid, 256),
  };
}

export function validateServerKnowledgeSnapshot(
  raw: Record<string, unknown>,
  expected: { kind: string; providerId: string },
) {
  assertNoSensitiveKeys(raw);
  const allowedSnapshotKeys = new Set([
    "schema_version", "snapshot_id", "kind", "provider_id", "transport", "freshness",
    "observed_at", "expires_at", "items",
  ]);
  if (Object.keys(raw).some((key) => !allowedSnapshotKeys.has(key))) throw new Error("snapshot_field_invalid");
  if (Number(raw.schema_version) !== 1 || raw.kind !== expected.kind
    || raw.provider_id !== expected.providerId || raw.transport !== "server_gateway") {
    throw new Error("snapshot_identity_invalid");
  }
  if (!String(raw.snapshot_id || "").startsWith("ks_") || raw.freshness !== "fresh") {
    throw new Error("snapshot_state_invalid");
  }
  const observedAt = iso(raw.observed_at, "observed_at");
  const expiresAt = iso(raw.expires_at, "expires_at");
  if (Date.parse(expiresAt) < Date.parse(observedAt)) throw new Error("snapshot_expiry_invalid");
  if (!Array.isArray(raw.items) || raw.items.length > 50) throw new Error("snapshot_items_invalid");
  const items = raw.items.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`item_${index}_invalid`);
    const item = value as Record<string, unknown>;
    const commonAllowed = ["id", "title", "summary", "observed_at", "url", "source", "publisher"];
    const kindAllowed = expected.kind === "trends"
      ? ["keyword", "categories", "change_type", "change_amount", "score"]
      : ["published_at"];
    if (Object.keys(item).some((key) => ![...commonAllowed, ...kindAllowed].includes(key))) {
      throw new Error(`item_${index}_field_invalid`);
    }
    const normalized = {
      id: compact(item.id, 180),
      title: compact(item.title, 300),
      summary: compact(item.summary, 1000),
      observed_at: iso(item.observed_at, `item_${index}_observed_at`),
      url: httpsUrl(item.url, expected.kind === "news"),
      source: compact(item.source, 120),
      publisher: compact(item.publisher, 160),
    } as Record<string, unknown>;
    if (!normalized.id || !normalized.title) throw new Error(`item_${index}_identity_invalid`);
    if (expected.kind === "trends") {
      normalized.keyword = compact(item.keyword || item.title, 180);
      normalized.categories = [...new Set(
        (Array.isArray(item.categories) ? item.categories : []).map((entry) => compact(entry, 80)).filter(Boolean),
      )].slice(0, 10);
      normalized.change_type = compact(item.change_type || "unknown", 20).toLowerCase();
      if (!ALLOWED_CHANGE_TYPES.has(String(normalized.change_type))) {
        throw new Error(`item_${index}_change_type_invalid`);
      }
      normalized.change_amount = Number.isFinite(Number(item.change_amount)) ? Number(item.change_amount) : null;
      normalized.score = Number.isFinite(Number(item.score)) ? Number(item.score) : null;
    } else {
      if (!normalized.publisher) throw new Error(`item_${index}_publisher_invalid`);
      normalized.published_at = iso(item.published_at, `item_${index}_published_at`);
    }
    return normalized;
  });
  return { ...raw, observed_at: observedAt, expires_at: expiresAt, items };
}
