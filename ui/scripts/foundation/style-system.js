const DESIGN_STYLE_REGISTRY = Object.freeze({
  'warm-editorial': Object.freeze({
    id: 'warm-editorial',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: false
  })
});

const DESIGN_STYLE_REMOTE_STORAGE_KEY = 'bloggenius.ui.style-catalog-cache';
const DESIGN_STYLE_REMOTE_REGISTRY = new Map();
const DESIGN_STYLE_APPLIED_TOKENS = new WeakMap();
let designStyleCatalogPromise = null;
let designStyleCatalogLoadedAt = 0;
let designStyleCatalogInitialized = false;

function isSafeDesignStyleTokenValue(value) {
  const normalized = String(value || '').trim();
  return Boolean(normalized)
    && normalized.length <= 500
    && !/[;{}<>]/.test(normalized)
    && !/(?:url|expression|image-set|cross-fade|element|paint)\s*\(|@import|javascript:|data:|https?:\/\//i.test(normalized);
}

function normalizeRemoteDesignStyle(style) {
  if (!style || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(style.id || ''))
    || typeof style.label !== 'string' || !style.label.trim()
    || typeof style.blurb !== 'string' || !style.blurb.trim()
    || style.contractVersion !== DESIGN_STYLE_CONTRACT_VERSION
    || style.selectable !== true) return null;
  const tokens = style.tokens;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return null;
  const names = Object.keys(tokens);
  if (names.length !== DESIGN_STYLE_REQUIRED_TOKENS.length
    || DESIGN_STYLE_REQUIRED_TOKENS.some((name) => !Object.prototype.hasOwnProperty.call(tokens, name))
    || names.some((name) => !DESIGN_STYLE_REQUIRED_TOKENS.includes(name) || !isSafeDesignStyleTokenValue(tokens[name]))) return null;
  return Object.freeze({
    id: style.id,
    label: style.label.trim().slice(0, 120),
    blurb: style.blurb.trim().slice(0, 1000),
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true,
    tokens: Object.freeze({ ...tokens })
  });
}

function registerRemoteDesignStyles(styles) {
  if (!Array.isArray(styles)) return false;
  const next = new Map();
  for (const style of styles) {
    const normalized = normalizeRemoteDesignStyle(style);
    if (!normalized || next.has(normalized.id)) return false;
    next.set(normalized.id, normalized);
  }
  DESIGN_STYLE_REMOTE_REGISTRY.clear();
  next.forEach((style, id) => DESIGN_STYLE_REMOTE_REGISTRY.set(id, style));
  designStyleCatalogInitialized = true;
  return true;
}

function getDesignStyleEntry(styleId) {
  return DESIGN_STYLE_REMOTE_REGISTRY.get(styleId) || DESIGN_STYLE_REGISTRY[styleId] || null;
}

function readCachedRemoteDesignStyles() {
  try {
    const raw = window.localStorage?.getItem(DESIGN_STYLE_REMOTE_STORAGE_KEY) || '';
    if (!raw) return false;
    const registered = registerRemoteDesignStyles(JSON.parse(raw));
    if (registered) designStyleCatalogLoadedAt = Date.now();
    return registered;
  } catch (_error) { return false; }
}

async function refreshRemoteDesignStyles() {
  if (designStyleCatalogInitialized && Date.now() - designStyleCatalogLoadedAt < 5 * 60 * 1000) return true;
  if (designStyleCatalogPromise) return designStyleCatalogPromise;
  designStyleCatalogPromise = (async () => {
    if (typeof window.fetch !== 'function') return false;
    const response = await window.fetch('/api/v1/settings/design-styles', { cache: 'no-store' });
    const body = await response.json();
    const styles = body?.data?.styles;
    if (!response.ok || body?.success !== true || !Array.isArray(styles) || !registerRemoteDesignStyles(styles)) return false;
    try { window.localStorage?.setItem(DESIGN_STYLE_REMOTE_STORAGE_KEY, JSON.stringify(styles)); } catch (_error) { }
    designStyleCatalogLoadedAt = Date.now();
    const selected = readStoredDesignStyleId() || DESIGN_STYLE_DEFAULT_ID;
    applyDesignStyle(selected);
    return true;
  })().catch(() => false).finally(() => { designStyleCatalogPromise = null; });
  return designStyleCatalogPromise;
}

function resolveDesignStyleId(candidate) {
  const normalized = String(candidate || '').trim().toLowerCase();
  return DESIGN_STYLE_REMOTE_REGISTRY.has(normalized) || normalized === DESIGN_STYLE_DEFAULT_ID
    ? normalized
    : DESIGN_STYLE_DEFAULT_ID;
}

function getSelectableDesignStyles() {
  return designStyleCatalogInitialized ? [...DESIGN_STYLE_REMOTE_REGISTRY.values()] : [];
}

function readStoredDesignStyleId() {
  try {
    const stored = String(window.localStorage?.getItem(DESIGN_STYLE_STORAGE_KEY) || '').trim().toLowerCase();
    if (!stored) return '';
    const entry = getDesignStyleEntry(stored);
    return stored === DESIGN_STYLE_DEFAULT_ID || (entry && entry.selectable === true) ? stored : '';
  } catch (error) {
    return '';
  }
}

function persistDesignStyleId(styleId) {
  try {
    window.localStorage?.setItem(DESIGN_STYLE_STORAGE_KEY, styleId);
    return true;
  } catch (error) {
    return false;
  }
}

function applyDesignStyle(candidate, root = document.documentElement) {
  const styleId = resolveDesignStyleId(candidate);
  if (root?.dataset) root.dataset.style = styleId;
  const previousTokens = DESIGN_STYLE_APPLIED_TOKENS.get(root) || [];
  previousTokens.forEach((token) => root?.style?.removeProperty(token));
  const entry = getDesignStyleEntry(styleId);
  const tokens = entry?.tokens && root?.style ? Object.keys(entry.tokens) : [];
  tokens.forEach((token) => root.style.setProperty(token, entry.tokens[token]));
  if (root && typeof root === 'object') DESIGN_STYLE_APPLIED_TOKENS.set(root, tokens);
  return entry;
}

function initDesignStyleSystem(root = document.documentElement) {
  const stored = readStoredDesignStyleId();
  if (stored) return applyDesignStyle(stored, root);
  return applyDesignStyle(root?.dataset?.style, root);
}

try {
  readCachedRemoteDesignStyles();
  initDesignStyleSystem();
  void refreshRemoteDesignStyles();
} catch (error) {
  console.warn('Design style initialization failed:', error);
}
