const MANUAL_SNS_WORKSPACE_CACHE_STORAGE_KEY = 'manual_sns_workspace_snapshot_v1';
const MANUAL_SNS_WORKSPACE_CACHE_VERSION = 1;
const MANUAL_SNS_WORKSPACE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeManualSnsCachedOrganization(item = {}) {
  return {
    id: String(item.id || '').trim(),
    name: String(item.name || '').trim()
  };
}

function normalizeManualSnsCachedChannel(item = {}) {
  return {
    id: String(item.id || '').trim(),
    name: String(item.name || item.display_name || '').trim(),
    display_name: String(item.display_name || item.name || '').trim(),
    service: String(item.service || '').trim().toLowerCase(),
    limit: Math.max(0, Number(item.limit) || 0),
    max_assets: Math.max(0, Number(item.max_assets) || 0),
    image_required: item.image_required === true,
    supported: item.supported !== false,
    disabled: item.disabled === true,
    is_disconnected: item.is_disconnected === true,
    is_locked: item.is_locked === true
  };
}

function normalizeManualSnsWorkspaceSnapshot(input = {}, now = Date.now()) {
  if (!input || typeof input !== 'object' || Number(input.version) !== MANUAL_SNS_WORKSPACE_CACHE_VERSION) return null;
  const fetchedAt = Number(input.fetchedAt);
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0 || fetchedAt > now + 5 * 60 * 1000) return null;
  const organizations = (Array.isArray(input.organizations) ? input.organizations : [])
    .map(normalizeManualSnsCachedOrganization)
    .filter((item) => item.id);
  const organizationId = String(input.organizationId || '').trim();
  if (organizationId && !organizations.some((item) => item.id === organizationId)) return null;
  const channels = (Array.isArray(input.channels) ? input.channels : [])
    .map(normalizeManualSnsCachedChannel)
    .filter((item) => item.id);
  return {
    version: MANUAL_SNS_WORKSPACE_CACHE_VERSION,
    fetchedAt,
    organizations,
    organizationId,
    channels,
    isFresh: now - fetchedAt <= MANUAL_SNS_WORKSPACE_CACHE_TTL_MS
  };
}

function readManualSnsWorkspaceCache(now = Date.now()) {
  try {
    const raw = localStorage.getItem(MANUAL_SNS_WORKSPACE_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const snapshot = normalizeManualSnsWorkspaceSnapshot(JSON.parse(raw), now);
    if (!snapshot) localStorage.removeItem(MANUAL_SNS_WORKSPACE_CACHE_STORAGE_KEY);
    return snapshot;
  } catch (_error) {
    try { localStorage.removeItem(MANUAL_SNS_WORKSPACE_CACHE_STORAGE_KEY); } catch (_ignored) { /* optional cache */ }
    return null;
  }
}

function persistManualSnsWorkspaceCache(input = {}, now = Date.now()) {
  const snapshot = normalizeManualSnsWorkspaceSnapshot({
    version: MANUAL_SNS_WORKSPACE_CACHE_VERSION,
    fetchedAt: now,
    organizations: input.organizations,
    organizationId: input.organizationId || input.organization_id,
    channels: input.channels
  }, now);
  if (!snapshot) return null;
  try {
    localStorage.setItem(MANUAL_SNS_WORKSPACE_CACHE_STORAGE_KEY, JSON.stringify({
      version: snapshot.version,
      fetchedAt: snapshot.fetchedAt,
      organizations: snapshot.organizations,
      organizationId: snapshot.organizationId,
      channels: snapshot.channels
    }));
  } catch (_error) {
    // Cache storage failure must never block SNS publishing.
  }
  return snapshot;
}

function clearManualSnsWorkspaceCache() {
  try { localStorage.removeItem(MANUAL_SNS_WORKSPACE_CACHE_STORAGE_KEY); }
  catch (_error) { /* optional cache */ }
}

function isManualSnsWorkspaceSnapshotFresh(fetchedAt, now = Date.now()) {
  const timestamp = Number(fetchedAt);
  return Number.isFinite(timestamp) && timestamp > 0 && now - timestamp <= MANUAL_SNS_WORKSPACE_CACHE_TTL_MS;
}

function shouldInvalidateManualSnsWorkspaceCache(error) {
  const status = Number(error?.status) || 0;
  return status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}
