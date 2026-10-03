const DESIGN_STYLE_REGISTRY = Object.freeze({
  compatibility: Object.freeze({
    id: 'compatibility',
    label: 'Compatibility',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: false
  }),
  'warm-editorial': Object.freeze({
    id: 'warm-editorial',
    label: '따뜻한 에디토리얼',
    blurb: '기본 화면. 종이 질감의 따뜻함과 여유로운 밀도입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'quiet-sage-studio': Object.freeze({
    id: 'quiet-sage-studio',
    label: '고요한 세이지 스튜디오',
    blurb: '차분한 세이지 색감의 조용한 밀도입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'autumn-night-library': Object.freeze({
    id: 'autumn-night-library',
    label: '가을밤 서재',
    blurb: '짙은 월넛과 구리빛으로 집중감을 높인 어두운 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'hanji-dancheong': Object.freeze({
    id: 'hanji-dancheong',
    label: '한지 위의 단청',
    blurb: '한지의 여백에 먹색과 절제된 단청색을 더한 반듯한 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'retro-terminal': Object.freeze({
    id: 'retro-terminal',
    label: '레트로 터미널',
    blurb: '인광빛과 선명한 경계로 자동화 작업의 리듬을 살린 어두운 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  minimalism: Object.freeze({
    id: 'minimalism',
    label: '미니멀',
    blurb: '색과 장식을 걷어낸 가장 단순한 화면입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'cerulean-atelier': Object.freeze({
    id: 'cerulean-atelier',
    label: '세룰리안 아틀리에',
    blurb: '맑은 세룰리안 블루와 차가운 백색으로 완성한 선명한 에디토리얼입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  'amethyst-salon': Object.freeze({
    id: 'amethyst-salon',
    label: '자수정 살롱',
    blurb: '플럼빛 다크 바탕에 자수정과 은빛 라일락을 얹은 우아한 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  techwear: Object.freeze({
    id: 'techwear',
    label: '테크웨어',
    blurb: '차콜과 블루그레이, 절제된 빙하 블루 포인트로 완성한 기능적 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  }),
  goblincore: Object.freeze({
    id: 'goblincore',
    label: '고블린코어',
    blurb: '이끼·버섯·흙빛과 유기적인 표면 질감에서 영감을 얻은 스타일입니다.',
    contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
    selectable: true
  })
});

const DESIGN_STYLE_REMOTE_STORAGE_KEY = 'bloggenius.ui.style-catalog-cache';
const DESIGN_STYLE_REMOTE_REGISTRY = new Map();
const DESIGN_STYLE_APPLIED_TOKENS = new WeakMap();
let designStyleCatalogPromise = null;
let designStyleCatalogLoadedAt = 0;

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
  if (!next.size) return false;
  DESIGN_STYLE_REMOTE_REGISTRY.clear();
  next.forEach((style, id) => DESIGN_STYLE_REMOTE_REGISTRY.set(id, style));
  return true;
}

function getDesignStyleEntry(styleId) {
  return DESIGN_STYLE_REMOTE_REGISTRY.get(styleId) || DESIGN_STYLE_REGISTRY[styleId] || null;
}

function readCachedRemoteDesignStyles() {
  try {
    const raw = window.localStorage?.getItem(DESIGN_STYLE_REMOTE_STORAGE_KEY) || '';
    if (!raw) return false;
    return registerRemoteDesignStyles(JSON.parse(raw));
  } catch (_error) { return false; }
}

async function refreshRemoteDesignStyles() {
  if (DESIGN_STYLE_REMOTE_REGISTRY.size && Date.now() - designStyleCatalogLoadedAt < 5 * 60 * 1000) return true;
  if (designStyleCatalogPromise) return designStyleCatalogPromise;
  designStyleCatalogPromise = (async () => {
    if (typeof window.fetch !== 'function') return false;
    const response = await window.fetch('/api/v1/settings/design-styles', { cache: 'no-store' });
    const body = await response.json();
    const styles = body?.data?.styles;
    if (!response.ok || body?.success !== true || !registerRemoteDesignStyles(styles)) return false;
    try { window.localStorage?.setItem(DESIGN_STYLE_REMOTE_STORAGE_KEY, JSON.stringify(styles)); } catch (_error) { }
    designStyleCatalogLoadedAt = Date.now();
    const selected = readStoredDesignStyleId();
    if (selected && DESIGN_STYLE_REMOTE_REGISTRY.has(selected)) applyDesignStyle(selected);
    return true;
  })().catch(() => false).finally(() => { designStyleCatalogPromise = null; });
  return designStyleCatalogPromise;
}

function resolveDesignStyleId(candidate) {
  const normalized = String(candidate || '').trim().toLowerCase();
  return DESIGN_STYLE_REMOTE_REGISTRY.has(normalized) || Object.prototype.hasOwnProperty.call(DESIGN_STYLE_REGISTRY, normalized)
    ? normalized
    : DESIGN_STYLE_DEFAULT_ID;
}

function getSelectableDesignStyles() {
  if (DESIGN_STYLE_REMOTE_REGISTRY.size) return [...DESIGN_STYLE_REMOTE_REGISTRY.values()];
  return Object.values(DESIGN_STYLE_REGISTRY).filter((style) => style.selectable === true);
}

function readStoredDesignStyleId() {
  try {
    const stored = String(window.localStorage?.getItem(DESIGN_STYLE_STORAGE_KEY) || '').trim().toLowerCase();
    if (!stored) return '';
    const entry = getDesignStyleEntry(stored);
    return entry && entry.selectable === true ? stored : '';
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
