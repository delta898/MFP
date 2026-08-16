// ─── 첫 실행 안내 배너 ───────────────────────────────────────────
const SETUP_BANNER_DISMISS_KEY = 'bloggenius_setup_banner_dismissed_v1';
const UI_TOAST_DEFAULT_TIMEOUT_MS = 8000;
const UI_TOAST_DEDUPE_WINDOW_MS = 15000;
let uiToastSeq = 0;
const uiToastTimers = new Map();
const uiToastRecentShownAt = new Map();
const uiToastActiveByDedupeKey = new Map();
const uiIssueStateByKey = new Map();

async function checkSetupBanner() {
  if (localStorage.getItem(SETUP_BANNER_DISMISS_KEY) === 'true') return;
  try {
    const status = await fetchJson('/api/v1/config/status');
    const banner = document.getElementById('setup-guide-banner');
    if (!banner) return;
    if (status && status.isEssentialSet === false) {
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
      localStorage.removeItem(SETUP_BANNER_DISMISS_KEY);
    }
  } catch (e) {
    console.warn('Setup banner check failed:', e.message);
  }
}

function goToSettings() {
  const settingsBtn = document.querySelector('[data-view="settings"]');
  if (settingsBtn) settingsBtn.click();
}

async function navigateToSettingsTarget(tabName, targetId) {
  await navigateTo('settings', tabName);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = document.getElementById(String(targetId || '').trim());
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('settings-navigation-target');
      void target.offsetWidth;
      target.classList.add('settings-navigation-target');
      setTimeout(() => target.classList.remove('settings-navigation-target'), 1800);
    });
  });
}

function dismissSetupBanner() {
  const banner = document.getElementById('setup-guide-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem(SETUP_BANNER_DISMISS_KEY, 'true');
}
// ─────────────────────────────────────────────────────────────────

const SIDEBAR_DYNAMIC_ICON_PATHS = {
  heart: [{ tag: 'path', d: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z' }],
  coffee: [
    { tag: 'path', d: 'M18 8h1a4 4 0 0 1 0 8h-1' },
    { tag: 'path', d: 'M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z' },
    { tag: 'line', x1: '6', y1: '1', x2: '6', y2: '4' },
    { tag: 'line', x1: '10', y1: '1', x2: '10', y2: '4' },
    { tag: 'line', x1: '14', y1: '1', x2: '14', y2: '4' }
  ],
  book: [
    { tag: 'path', d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' },
    { tag: 'path', d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' }
  ],
  sparkles: [
    { tag: 'path', d: 'm12 3-1.4 3.6L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.4Z' },
    { tag: 'path', d: 'm5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8Z' },
    { tag: 'path', d: 'm19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8Z' }
  ],
  link: [
    { tag: 'path', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
    { tag: 'path', d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }
  ]
};
let sidebarDynamicContentSignature = null;
let sidebarDynamicRefreshPromise = null;
const supportingSurfaceStates = new Map();
const SURFACE_ROTATION_SEED_KEY = 'blog_genius_surface_rotation_seed_v1';

function createSidebarDynamicIcon(iconKey) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.classList.add('nav-icon');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const parts = SIDEBAR_DYNAMIC_ICON_PATHS[iconKey] || SIDEBAR_DYNAMIC_ICON_PATHS.link;
  parts.forEach((part) => {
    const node = document.createElementNS(namespace, part.tag);
    Object.entries(part).forEach(([name, value]) => {
      if (name !== 'tag') node.setAttribute(name, value);
    });
    svg.appendChild(node);
  });
  return svg;
}

function createSidebarDynamicBlock(block) {
  const link = document.createElement('a');
  link.className = 'nav-link-btn nav-dynamic-link';
  link.href = block.targetUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.dynamicBlock = block.id;
  link.dataset.sortOrder = String(block.sortOrder);
  link.title = block.disclosure ? `${block.title} · ${block.disclosure}` : block.title;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'nav-dynamic-icon-wrap';
  iconWrap.appendChild(createSidebarDynamicIcon(block.icon));
  link.appendChild(iconWrap);

  if (block.media?.url && block.kind !== 'support') {
    const image = document.createElement('img');
    image.className = 'nav-dynamic-thumbnail';
    image.src = block.media.url;
    image.alt = block.media.alt || '';
    image.width = 28;
    image.height = 28;
    image.loading = 'lazy';
    image.addEventListener('error', () => link.classList.add('media-failed'), { once: true });
    link.classList.add('has-thumbnail');
    link.appendChild(image);
  }

  const label = document.createElement('span');
  label.className = 'nav-label nav-dynamic-label';
  label.textContent = block.title;
  link.appendChild(label);

  if (block.kind === 'affiliate') {
    const badge = document.createElement('span');
    badge.className = 'nav-dynamic-badge';
    badge.textContent = '제휴';
    link.appendChild(badge);
  }

  link.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth <= 960 && sidebar?.classList.contains('open')) {
      sidebar.classList.remove('open');
      overlay?.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
  return link;
}

async function refreshSidebarDynamicContent() {
  const region = document.getElementById('sidebar-utility-region');
  if (!region) return;
  if (sidebarDynamicRefreshPromise) return sidebarDynamicRefreshPromise;

  sidebarDynamicRefreshPromise = (async () => {
    try {
      const payload = await fetchJson('/api/v1/surface-content/sidebar');
      const blocks = Array.isArray(payload?.regions?.utility?.blocks)
        ? payload.regions.utility.blocks
        : [];
      const nextSignature = JSON.stringify(blocks);
      if (nextSignature === sidebarDynamicContentSignature) return;

      region.querySelectorAll('[data-dynamic-block]').forEach((node) => node.remove());
      blocks.forEach((block) => region.appendChild(createSidebarDynamicBlock(block)));

      const nodes = Array.from(region.children);
      nodes.sort((left, right) => {
        const orderDiff = Number(left.dataset.sortOrder || 500) - Number(right.dataset.sortOrder || 500);
        if (orderDiff !== 0) return orderDiff;
        const leftCore = left.hasAttribute('data-core-block') ? 0 : 1;
        const rightCore = right.hasAttribute('data-core-block') ? 0 : 1;
        if (leftCore !== rightCore) return leftCore - rightCore;
        return String(left.dataset.dynamicBlock || left.dataset.coreBlock || '')
          .localeCompare(String(right.dataset.dynamicBlock || right.dataset.coreBlock || ''));
      });
      nodes.forEach((node) => region.appendChild(node));
      sidebarDynamicContentSignature = nextSignature;
    } catch (error) {
      console.debug('[SurfaceContent] Dynamic sidebar content unavailable:', error.message);
    }
  })();

  try {
    return await sidebarDynamicRefreshPromise;
  } finally {
    sidebarDynamicRefreshPromise = null;
  }
}

function initSidebarDynamicContent() {
  void refreshSidebarDynamicContent();
}

function getSurfaceRotationSeed() {
  try {
    let seed = localStorage.getItem(SURFACE_ROTATION_SEED_KEY);
    if (!seed) {
      seed = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      localStorage.setItem(SURFACE_ROTATION_SEED_KEY, seed);
    }
    return seed;
  } catch (_) {
    return 'default-installation';
  }
}

function selectDailySurfaceBlock(blocks, surface, region) {
  if (!Array.isArray(blocks) || !blocks.length) return null;
  const today = new Date();
  const dateKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  const source = `${getSurfaceRotationSeed()}|${dateKey}|${surface}|${region}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return blocks[Math.abs(hash >>> 0) % blocks.length] || blocks[0];
}

function selectDailyCycleSurfaceBlock(blocks, surface, region) {
  if (!Array.isArray(blocks) || !blocks.length) return null;
  const today = new Date();
  const localDayNumber = Math.floor(Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ) / 86400000);
  const source = `${getSurfaceRotationSeed()}|${surface}|${region}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const installationOffset = Math.abs(hash >>> 0) % blocks.length;
  return blocks[(installationOffset + localDayNumber) % blocks.length] || blocks[0];
}

function createSupportingContentCard(block) {
  const link = document.createElement('a');
  link.className = `surface-supporting-card surface-supporting-card-${block.kind}`;
  link.href = block.targetUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.dynamicBlock = block.id;
  link.title = block.disclosure ? `${block.title} · ${block.disclosure}` : block.title;

  const visual = document.createElement('span');
  visual.className = 'surface-supporting-visual';
  if (block.media?.url && block.kind !== 'support') {
    const image = document.createElement('img');
    image.src = block.media.url;
    image.alt = block.media.alt || '';
    image.width = 64;
    image.height = 64;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.remove();
      visual.appendChild(createSidebarDynamicIcon(block.icon));
    }, { once: true });
    visual.appendChild(image);
  } else {
    visual.appendChild(createSidebarDynamicIcon(block.icon));
  }

  const copy = document.createElement('span');
  copy.className = 'surface-supporting-copy';
  const typeLabel = document.createElement('span');
  typeLabel.className = 'surface-supporting-type';
  typeLabel.textContent = block.kind === 'support'
    ? '개발자 지원'
    : block.kind === 'affiliate' ? '제휴 추천' : '추천 자료';
  const title = document.createElement('strong');
  title.textContent = block.title;
  copy.append(typeLabel, title);
  if (block.disclosure) {
    const disclosure = document.createElement('small');
    disclosure.textContent = block.disclosure;
    copy.appendChild(disclosure);
  }

  const cta = document.createElement('span');
  cta.className = 'surface-supporting-cta';
  cta.textContent = block.ctaLabel || '자세히 보기';
  cta.insertAdjacentHTML('beforeend', '<span aria-hidden="true">↗</span>');

  link.append(visual, copy, cta);
  return link;
}

async function refreshSupportingSurfaceContent(surface, regionConfigs) {
  const configs = Array.isArray(regionConfigs) ? regionConfigs : [];
  if (!configs.some((config) => document.getElementById(config.elementId))) return;
  const state = supportingSurfaceStates.get(surface) || { signature: null, pending: null };
  supportingSurfaceStates.set(surface, state);
  if (state.pending) return state.pending;

  state.pending = (async () => {
    try {
      const payload = await fetchJson(`/api/v1/surface-content/${surface}`);
      const selections = configs.map((config) => {
        const blocks = Array.isArray(payload?.regions?.[config.region]?.blocks)
          ? payload.regions[config.region].blocks
          : [];
        return {
          config,
          selected: config.selection === 'daily_cycle'
            ? selectDailyCycleSurfaceBlock(blocks, surface, config.region)
            : selectDailySurfaceBlock(blocks, surface, config.region)
        };
      });
      const nextSignature = JSON.stringify(selections.map(({ config, selected }) => ({
        region: config.region,
        selected
      })));
      if (nextSignature === state.signature) return;

      selections.forEach(({ config, selected }) => {
        const region = document.getElementById(config.elementId);
        if (!region) return;
        region.replaceChildren();
        if (selected) region.appendChild(createSupportingContentCard(selected));
        const visibilityTarget = document.getElementById(config.visibilityElementId || config.elementId);
        if (visibilityTarget) visibilityTarget.hidden = !selected;
      });
      state.signature = nextSignature;
    } catch (error) {
      console.debug(`[SurfaceContent] Dynamic ${surface} content unavailable:`, error.message);
    }
  })();

  try {
    return await state.pending;
  } finally {
    state.pending = null;
  }
}

function initDashboardDynamicContent() {
  return refreshSupportingSurfaceContent('dashboard', [
    {
      region: 'supporting',
      elementId: 'dashboard-supporting-region',
      selection: 'daily_rotate'
    },
    {
      region: 'recommendations',
      elementId: 'dashboard-recommendations-region',
      visibilityElementId: 'dashboard-recommendations-section',
      selection: 'daily_cycle'
    }
  ]);
}

function refreshAccountDynamicContent() {
  return refreshSupportingSurfaceContent('account', [{
    region: 'supporting',
    elementId: 'account-supporting-region',
    selection: 'daily_rotate'
  }]);
}

function initAccountDynamicContent() {
  void refreshAccountDynamicContent();
}

function getUiToastContainer() {
  return document.getElementById('ui-toast-container');
}

function clearUiToastTimer(toastId) {
  const timer = uiToastTimers.get(toastId);
  if (timer) {
    clearTimeout(timer);
    uiToastTimers.delete(toastId);
  }
}

function pulseUiToast(toastEl) {
  if (!toastEl) return;
  toastEl.classList.remove('ui-toast-attention');
  void toastEl.offsetWidth;
  toastEl.classList.add('ui-toast-attention');
}

function dismissUiToast(toastId) {
  const toastEl = document.getElementById(`ui-toast-${toastId}`);
  clearUiToastTimer(toastId);
  if (!toastEl) return;

  const dedupeKey = String(toastEl.dataset.dedupeKey || '').trim();
  if (dedupeKey) {
    uiToastActiveByDedupeKey.delete(dedupeKey);
  }

  toastEl.classList.add('is-leaving');
  setTimeout(() => {
    if (toastEl.parentNode) {
      toastEl.parentNode.removeChild(toastEl);
    }
  }, 180);
}

function showUiToast(options = {}) {
  const container = getUiToastContainer();
  if (!container) return null;

  const message = String(options?.message || '').trim();
  if (!message) return null;

  const dedupeKey = String(options?.dedupeKey || '').trim();
  const now = Date.now();
  if (dedupeKey) {
    const activeToastId = uiToastActiveByDedupeKey.get(dedupeKey);
    if (activeToastId) {
      const activeToastEl = document.getElementById(`ui-toast-${activeToastId}`);
      if (activeToastEl) {
        pulseUiToast(activeToastEl);
        clearUiToastTimer(activeToastId);
        const timeoutMs = Math.max(1200, Number(options?.timeoutMs) || UI_TOAST_DEFAULT_TIMEOUT_MS);
        uiToastTimers.set(activeToastId, setTimeout(() => dismissUiToast(activeToastId), timeoutMs));
        return activeToastId;
      }
      uiToastActiveByDedupeKey.delete(dedupeKey);
    }

    const lastShownAt = uiToastRecentShownAt.get(dedupeKey) || 0;
    if ((now - lastShownAt) < UI_TOAST_DEDUPE_WINDOW_MS) {
      return null;
    }
    uiToastRecentShownAt.set(dedupeKey, now);
  }

  const toastId = ++uiToastSeq;
  const level = String(options?.level || 'info').trim() || 'info';
  const timeoutMs = Math.max(1200, Number(options?.timeoutMs) || UI_TOAST_DEFAULT_TIMEOUT_MS);
  const title = String(options?.title || '알림').trim() || '알림';
  const actionLabel = String(options?.actionLabel || '').trim();
  const onAction = typeof options?.onAction === 'function' ? options.onAction : null;

  const toastEl = document.createElement('section');
  toastEl.id = `ui-toast-${toastId}`;
  toastEl.className = `ui-toast ui-toast-${level}`;
  toastEl.dataset.dedupeKey = dedupeKey;
  toastEl.setAttribute('role', 'status');

  const headerEl = document.createElement('div');
  headerEl.className = 'ui-toast-header';

  const titleEl = document.createElement('strong');
  titleEl.className = 'ui-toast-title';
  titleEl.textContent = title;
  headerEl.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ui-toast-close';
  closeBtn.setAttribute('aria-label', '알림 닫기');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => dismissUiToast(toastId));
  headerEl.appendChild(closeBtn);

  const messageEl = document.createElement('p');
  messageEl.className = 'ui-toast-message';
  messageEl.textContent = message;

  toastEl.appendChild(headerEl);
  toastEl.appendChild(messageEl);

  if (actionLabel && onAction) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'ui-toast-actions';

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'ui-toast-action';
    actionBtn.textContent = actionLabel;
    actionBtn.addEventListener('click', async () => {
      try {
        await onAction();
      } catch (e) {
        console.warn('Toast action failed:', e.message);
      } finally {
        dismissUiToast(toastId);
      }
    });

    actionsEl.appendChild(actionBtn);
    toastEl.appendChild(actionsEl);
  }

  container.appendChild(toastEl);

  if (dedupeKey) {
    uiToastActiveByDedupeKey.set(dedupeKey, toastId);
  }
  uiToastTimers.set(toastId, setTimeout(() => dismissUiToast(toastId), timeoutMs));
  return toastId;
}

function navigateToNaverLoginSettings() {
  if (typeof navigateTo === 'function') {
    return navigateTo('settings', 'naver-blog');
  }
  goToSettings();
  return Promise.resolve();
}

function getUiIssueRule(code, error, context = {}) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (normalizedCode === 'NAVER_SESSION_INVALID') {
    const reason = String(context?.reason || error?.reason || '').trim().toLowerCase();
    let message = '네이버 로그인 세션이 만료되었거나 유효하지 않습니다.\n설정 화면에서 다시 로그인해 주세요.';
    if (reason === 'expired') {
      message = '네이버 로그인 세션이 만료되었습니다.\n설정 화면에서 다시 로그인해 주세요.';
    } else if (reason === 'missing_auth') {
      message = '네이버 로그인이 필요합니다.\n설정 화면에서 로그인을 진행해 주세요.';
    }
    return {
      dedupeKey: 'NAVER_SESSION_INVALID',
      level: 'warn',
      title: '네이버 로그인 필요',
      message,
      actionLabel: '설정으로 이동',
      onAction: () => navigateToNaverLoginSettings(),
      timeoutMs: 9000
    };
  }
  return null;
}

function getUiIssueRuleFromMessage(message) {
  const normalizedMessage = String(message || '').trim().toLowerCase();
  if (!normalizedMessage) return null;

  const looksLikeNaverSessionIssue =
    normalizedMessage.includes('네이버 로그인 세션이 유효하지 않습니다')
    || normalizedMessage.includes('로그인 세션이 만료')
    || normalizedMessage.includes('login session expired');

  if (looksLikeNaverSessionIssue) {
    return getUiIssueRule('NAVER_SESSION_INVALID');
  }
  return null;
}

function notifyUiIssueFromError(error, context = {}) {
  const rule = getUiIssueRule(error?.code, error, context);
  if (!rule) return false;
  error.uiIssueNotified = true;
  showUiToast(rule);
  return true;
}

function notifyUiIssueFromMessage(message) {
  const rule = getUiIssueRuleFromMessage(message);
  if (!rule) return false;
  showUiToast(rule);
  return true;
}

function notifyUiIssueFromStateTransition(issueKey, stateKey, code, payload, context = {}) {
  const normalizedIssueKey = String(issueKey || '').trim();
  if (!normalizedIssueKey) return false;

  const normalizedStateKey = String(stateKey || '').trim() || 'unknown';
  const previousStateKey = uiIssueStateByKey.get(normalizedIssueKey) || '';
  if (previousStateKey === normalizedStateKey) return false;
  uiIssueStateByKey.set(normalizedIssueKey, normalizedStateKey);

  if (normalizedStateKey === 'valid' || normalizedStateKey === 'ok' || normalizedStateKey === 'healthy') {
    return false;
  }

  const issuePayload = payload && typeof payload === 'object' ? { ...payload } : {};
  if (!issuePayload.code) issuePayload.code = code;
  return notifyUiIssueFromError(issuePayload, context);
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await readJsonResponseSafely(res);
    if (!res.ok || !body.success) {
      console.error(`❌ API Fetch Error (${url}):`, body);
      const err = new Error(body?.error?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = body?.error?.code || '';
      err.method = 'GET';
      err.url = url;
      notifyUiIssueFromError(err, { method: 'GET', url });
      throw err;
    }
    return body.data;
  } catch (e) {
    console.error(`❌ Network or Parse Error (${url}):`, e);
    throw e;
  }
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  const body = await readJsonResponseSafely(res);
  if (!res.ok || !body.success) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body?.error?.code || '';
    err.method = 'POST';
    err.url = url;
    notifyUiIssueFromError(err, { method: 'POST', url });
    throw err;
  }
  return body.data;
}

async function readJsonResponseSafely(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn('Failed to parse JSON response:', e.message);
    return {};
  }
}

function formatRemaining(value) {
  if (typeof value === 'number' && value < 0) return '무제한';
  if (typeof value === 'number') return `${value}회`;
  return '-';
}

/**
 * 설정 화면의 상태 메시지 UI를 공통된 스타일로 업데이트합니다.
 * @param {string} selector - 대상 엘리먼트 선택자 (id 또는 class)
 * @param {string} message - 표시할 메시지
 * @param {'info'|'success'|'error'} type - 메시지 타입 (색상 결정)
 */
function updateSettingsStatus(selector, message, type = 'info') {
  const els = document.querySelectorAll(selector);
  if (els.length === 0) return;

  const colors = {
    info: '',
    success: '#10b981', // green
    error: '#ef4444'    // red
  };

  els.forEach(el => {
    el.textContent = message;
    el.style.color = colors[type] || '';
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function syncFooterVersion(version) {
  const el = document.getElementById('footer-version-display');
  if (el && version) el.textContent = `v${version}`;
}

function setPre(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = JSON.stringify(data, null, 2);
}

function scrollLogTargetIntoView(targetEl) {
  if (!targetEl || typeof targetEl.scrollIntoView !== 'function') return;
  requestAnimationFrame(() => {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

const SETTINGS_SECRET_FIELD_IDS = [
  'settings-wordpress-app-password',
  'settings-notify-telegram-bot-token',
  'settings-notify-bitly-token',
  'settings-text-model-api-key',
  'settings-image-model-api-key',
  'settings-chat-model-api-key',
  'settings-notify-slack-webhook-url',
  'settings-buffer-api-key'
];

function maskPartialSecret(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (raw.length <= 8) return '•'.repeat(raw.length);

  const headCount = Math.min(5, Math.max(3, Math.floor(raw.length * 0.12)));
  const tailCount = Math.min(4, Math.max(2, Math.floor(raw.length * 0.08)));
  const maskCount = Math.max(4, raw.length - headCount - tailCount);

  return `${raw.slice(0, headCount)}${'•'.repeat(maskCount)}${raw.slice(raw.length - tailCount)}`;
}

function isManagedSettingsSecretField(el) {
  return Boolean(el?.dataset?.secretManaged === 'true');
}

function getManagedSettingsSecretValue(el) {
  if (!el) return '';
  return String(el.dataset.secretRaw ?? el.value ?? '');
}

function syncManagedSettingsSecretDisplay(el) {
  if (!el) return;
  const raw = getManagedSettingsSecretValue(el);
  const isFocused = el.dataset.secretFocused === 'true';
  el.type = 'text';
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.value = isFocused ? raw : maskPartialSecret(raw);
}

function setManagedSettingsSecretValue(el, value = '') {
  if (!el) return;
  el.dataset.secretRaw = String(value ?? '');
  syncManagedSettingsSecretDisplay(el);
}

function bindManagedSettingsSecretField(el) {
  if (!el || isManagedSettingsSecretField(el)) return;

  el.dataset.secretManaged = 'true';
  el.dataset.secretFocused = 'false';
  el.dataset.secretRaw = String(el.value || '');
  syncManagedSettingsSecretDisplay(el);

  el.addEventListener('focus', () => {
    el.dataset.secretFocused = 'true';
    syncManagedSettingsSecretDisplay(el);
    requestAnimationFrame(() => {
      try { el.select(); } catch (_) {}
    });
  });

  el.addEventListener('input', () => {
    el.dataset.secretRaw = String(el.value || '');
  });

  el.addEventListener('blur', () => {
    el.dataset.secretFocused = 'false';
    el.dataset.secretRaw = String(el.value || '');
    syncManagedSettingsSecretDisplay(el);
  });
}

function initManagedSettingsSecretFields() {
  SETTINGS_SECRET_FIELD_IDS
    .map((id) => document.getElementById(id))
    .filter(Boolean)
    .forEach(bindManagedSettingsSecretField);
}

function getSettingsInputValue(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return isManagedSettingsSecretField(el)
    ? getManagedSettingsSecretValue(el)
    : String(el.value || '');
}

function parsePositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function formatNextRunText(nextRunAt) {
  const raw = String(nextRunAt || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return '곧 실행';
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}시간 ${m}분 후`;
}

function formatDateTimeAbsolute(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 ${pad(d.getMinutes())}분`;
}

function formatDashboardActivityTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseBoolLike(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'y' || raw === 'on';
}

let categoryCache = null; // 워드프레스 카테고리 캐시 공통
let categoryFetchPromise = null; // 중복 요청 방지용 프로미스
let blogTopicsCache = []; // [Restored] 블로그 목록 데이터 캐시
let blogTopicsWriteLockUntil = 0; // [Restored] 블로그 목록 재렌더링 방지 락
let blogTrendsCache = [];
let blogShoppingCache = [];
const blogSelectedRowIndices = new Set();
const blogTrendsSelectedRowIndices = new Set();
const blogShoppingSelectedRowIndices = new Set();
let blogLastBatchResult = null;
const blogRecentBatchRows = new Map();
let blogInlineEditState = null;
let shoppingInlineEditState = null;

// [Restored] 워드프레스 카테고리 드롭다운 채우기 헬퍼
function populateFilterWpCategoryDropdown(selectId, categories) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const firstOption = select.options.length > 0 ? select.options[0] : null;
  select.innerHTML = '';

  if (firstOption && firstOption.value === '') {
    select.appendChild(firstOption);
  } else {
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '워드프레스 카테고리 (전체)';
    select.appendChild(defaultOpt);
  }

  if (Array.isArray(categories)) {
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name || cat.id; // 보통 검색 필터는 name을 사용
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  }
}
let blogActiveTab = 'quick';
let shoppingActiveTab = 'quick';
let settingsActiveTab = 'general';
let quickInputMode = ['ai', 'manuscript', 'pasted'].includes(localStorage.getItem('quick_input_mode'))
  ? localStorage.getItem('quick_input_mode')
  : 'ai';
const createLocalMarkdownPreviewState = () => ({
  folderLabel: '',
  selectedFiles: [],
  selectedFilesPayload: [],
  imageObjectUrls: {},
  data: null
});
let quickManuscriptPreviewState = createLocalMarkdownPreviewState();
let quickPastedPreviewState = createLocalMarkdownPreviewState();
let quickGeneratedPreviewState = {
  previewId: '',
  rowIndex: null,
  rowNumber: null,
  primaryTarget: '',
  targets: [],
  activeTarget: '',
  previews: {}
};
let quickTrendTopicContext = null;
let quickRecommendationTopicContext = null;
const quickTopicRecommendationState = {
  items: [],
  loaded: false,
  loading: false,
  error: ''
};
const trendPostingState = {
  meta: null,
  items: [],
  itemsById: new Map(),
  savedIds: new Set(),
  recentTopicKeys: new Set(),
  recentTopicsLoaded: false,
  recentTopicsLoading: false,
  queryRange: null,
  loading: false
};
let settingsTelegramRuntimeStatus = null;
let settingsMcpRuntimeStatus = null;
let settingsMcpTokenVisible = false;
let settingsAiPresets = { text: [], image: [] };
let settingsAiProviderProfiles = { text: {}, image: {}, chat: {} };
let settingsBufferOrganizations = [];
let settingsBufferChannels = [];
let settingsBufferSelectedChannelIds = new Set();
let settingsSnsCheckInFlight = false;
let settingsSnsPublishInFlight = false;
let naverCommentDraftItems = [];
let naverCommentDraftStatusText = '설정을 확인한 뒤 실행해 주세요.';
let blogTrendsCollectInFlight = false;
let blogAutoManualRunInFlight = false;
let shoppingAutoManualRunInFlight = false;
const SETTINGS_SHOPPING_SLOT_ORDER = ['ftc', 'cta1', 'cta2', 'cta3'];
const SETTINGS_SHOPPING_SLOT_META = {
  ftc: { key: 'FTC_DISCLOSURE_IMAGE_URL', label: '공정위 이미지', required: true },
  cta1: { key: 'SHOPPING_CTA_IMAGE_URL1', label: '구매 독려 이미지 1', required: true },
  cta2: { key: 'SHOPPING_CTA_IMAGE_URL2', label: '구매 독려 이미지 2', required: false },
  cta3: { key: 'SHOPPING_CTA_IMAGE_URL3', label: '구매 독려 이미지 3', required: false }
};
let settingsShoppingImageSlots = {};
let settingsShoppingImageDefaults = {};
const settingsShoppingImageFileState = {};
const settingsShoppingImageObjectUrls = {};
const blogPageState = {
  trends: { limit: 50, offset: 0, total: 0 },
  topics: { limit: 50, offset: 0, total: 0 },
  shopping: { limit: 50, offset: 0, total: 0 }
};
const tableSortState = {
  trendPosting: { key: 'latestTrendDate', direction: 'desc' },
  trends: { key: 'rowNumber', direction: 'desc' },
  topics: { key: 'rowNumber', direction: 'desc' },
  shopping: { key: 'rowNumber', direction: 'desc' }
};
let uiConfigReady = true;
let uiNaverReady = true;
let uiWpReady = true;
let uiConfigPopupShown = false;
let uiConfigStatusMessage = '';
let uiSheetsReady = false;
let uiSheetsPreflightInFlight = null;
let dashboardPollingPauseCount = 0;
const dashboardAutoScheduleState = {
  blog: { enabled: false, nextRunAt: '', status: '', startTime: '', endTime: '' },
  shopping: { enabled: false, nextRunAt: '', status: '', startTime: '', endTime: '' }
};
let settingsMajorSaveInFlight = false;
let settingsMajorApplyingForm = false;
let settingsMajorLastSavedSignature = '';
let settingsMajorLoadedOnce = false;
let settingsMajorHasPendingBasicChanges = false;
let dashboardExternalContentLastLoadedAt = 0;
const DASHBOARD_EXTERNAL_CONTENT_REFRESH_MS = 5 * 60 * 1000;
const SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT = "나 보기가 역겨워 가실 때에는\n말없이 고이 보내 드리우리다\n영변에 약산 진달래꽃\n아름 따다 가실 길에 뿌리우리다";

let uiUpdateInfo = null;
let uiUpdateLastCheckedAt = 0;
let uiUpdateCheckInFlight = false;
const systemLogRenderState = {
  fileName: '',
  lastRaw: ''
};
const MOBILE_QUICK_MODE_BREAKPOINT = 960;
let isMobileQuickMode = false;
let hasInitializedMobileQuickEntry = false;
const UPDATE_AUTO_CHECK_STALE_MS = 6 * 60 * 60 * 1000;
const UPDATE_AUTO_CHECK_POLL_MS = 30 * 60 * 1000;

function formatUpdatePublishDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildUpdateDetailsMessage(info) {
  const details = info?.details || {};
  const lines = [];
  const summary = String(details.summary || info?.body || '').trim();
  const highlights = Array.isArray(details.highlights) ? details.highlights.filter(Boolean) : [];
  const publishDate = formatUpdatePublishDate(info?.publishDate);

  if (summary) lines.push(summary);
  if (publishDate) lines.push(`배포일: ${publishDate}`);
  if (highlights.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('주요 변경');
    highlights.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }
  if (!summary && highlights.length === 0) {
    lines.push(`v${info?.latestVersion || ''} 업데이트 안내 정보가 아직 없습니다.`);
  }

  return lines.join('\n');
}

async function openUpdateDetailsDialog() {
  if (!uiUpdateInfo) return;
  await showUiDialog({
    title: `v${uiUpdateInfo.latestVersion} 업데이트 안내`,
    message: buildUpdateDetailsMessage(uiUpdateInfo),
    showCancel: false,
    confirmText: '확인'
  });
}

function highlightUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.classList.remove('update-banner-attention');
  void banner.offsetWidth;
  banner.classList.add('update-banner-attention');
  window.setTimeout(() => {
    banner.classList.remove('update-banner-attention');
  }, 1800);
}

function scrollToUpdateBanner({ emphasize = false } = {}) {
  const banner = document.getElementById('update-banner');
  if (!banner || banner.classList.contains('hidden')) return;
  banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (emphasize) highlightUpdateBanner();
}

function clearUpdateBannerState() {
  uiUpdateInfo = null;
  const banner = document.getElementById('update-banner');
  const normalSection = document.getElementById('update-banner-normal');
  const progressSection = document.getElementById('update-banner-progress');
  const updateNowBtn = document.getElementById('update-now-btn');
  const updateCloseBtn = document.getElementById('update-close-btn');
  const updateCancelBtn = document.getElementById('update-cancel-btn');
  if (banner) banner.classList.add('hidden');
  if (normalSection) normalSection.style.display = '';
  if (progressSection) progressSection.style.display = 'none';
  if (updateNowBtn) updateNowBtn.style.display = '';
  if (updateCloseBtn) updateCloseBtn.style.display = '';
  if (updateCancelBtn) updateCancelBtn.style.display = 'none';
}

function shouldRefreshUpdateCheck() {
  return !uiUpdateLastCheckedAt || (Date.now() - uiUpdateLastCheckedAt) >= UPDATE_AUTO_CHECK_STALE_MS;
}

async function ensureUpdateCheckFresh(options = {}) {
  const { silent = true, force = false } = options;
  if (uiUpdateCheckInFlight) return;
  if (!force && !shouldRefreshUpdateCheck()) return;
  uiUpdateCheckInFlight = true;
  try {
    await checkUpdate(!silent, force);
  } finally {
    uiUpdateCheckInFlight = false;
  }
}

async function checkUpdate(isManual = false, isForce = false) {
  try {
    uiUpdateLastCheckedAt = Date.now();
    if (isManual) {
      showUiPopup(isForce ? '전체 환경을 다시 점검하며 강제 업데이트를 확인 중입니다...' : '최신 버전을 확인하고 있습니다...');
    }

    const url = isForce ? '/api/v1/system/update/check?force=true' : '/api/v1/system/update/check';
    const info = await fetchJson(url);
    if (info && info.hasUpdate) {
      uiUpdateInfo = info;
      const banner = document.getElementById('update-banner');
      const bannerText = document.getElementById('update-banner-text');
      if (banner && bannerText) {
        bannerText.textContent = isForce
          ? `강제 업데이트 준비 완료 (대상 버전: v${info.latestVersion})`
          : `새로운 버전(v${info.latestVersion})이 출시되었습니다!`;
        banner.classList.remove('hidden');
      }
      if (isManual) {
        const msg = isForce
          ? `현재 버전과 동일하더라도 업데이트가 가능합니다.\n상단 알림 배너의 '지금 업데이트'를 눌러 재설치를 진행하세요.`
          : `새로운 버전 v${info.latestVersion}을 찾았습니다!\n상단 알림 배너의 '지금 업데이트'를 눌러 진행하세요.`;
        showUiPopup(msg).then(() => {
          scrollToUpdateBanner({ emphasize: true });
        });
      }
    } else {
      clearUpdateBannerState();
      if (isManual) showUiPopup('현재 최신 버전을 사용 중입니다.');
    }
  } catch (e) {
    console.warn('업데이트 체크 실패:', e);
    if (isManual) showUiPopup(`업데이트 확인 실패: ${e.message}`);
  }
}

async function applyUpdate() {
  if (!uiUpdateInfo) return;

  const confirmed = await showUiConfirm(`BlogGenius v${uiUpdateInfo.latestVersion} 업데이트를 시작할까요?\n\n업데이트 완료 후 앱이 자동으로 재시작됩니다.`);
  if (!confirmed) return;

  const banner = document.getElementById('update-banner');
  const normalSection = document.getElementById('update-banner-normal');
  const progressSection = document.getElementById('update-banner-progress');
  const progressMessage = document.getElementById('update-progress-message');
  const progressPercent = document.getElementById('update-progress-percent');
  const progressBar = document.getElementById('update-progress-bar');
  const progressIcon = document.getElementById('update-progress-icon');
  const updateNowBtn = document.getElementById('update-now-btn');
  const updateCloseBtn = document.getElementById('update-close-btn');
  const updateCancelBtn = document.getElementById('update-cancel-btn');

  // Show progress UI
  if (normalSection) normalSection.style.display = 'none';
  if (progressSection) progressSection.style.display = 'flex';
  if (banner) banner.classList.remove('hidden');
  if (updateNowBtn) updateNowBtn.style.display = 'none';
  if (updateCloseBtn) updateCloseBtn.style.display = 'none';

  const stageIcons = { downloading: '⬇️', verifying: '🔐', extracting: '📦', syncing: '🔄', done: '✅', error: '❌', idle: '⏳' };

  function setProgressUi({ message, percent, stage }) {
    // message에 대한 텍스트 (퍼센트 제외, 별도로 표시)
    const stageLabels = {
      downloading: '다운로드 중...',
      verifying: '무결성 검증 중...',
      extracting: '압축 해제 중...',
      syncing: '파일 동기화 중...',
      done: '업데이트 완료! 재시작 중...',
      error: message || '오류 발생',
      idle: '준비 중...'
    };
    if (progressMessage) progressMessage.textContent = stageLabels[stage] || message || '진행 중...';
    if (progressIcon) progressIcon.textContent = stageIcons[stage] || '⏳';

    // 퍼센트는 다운로드 단계에서만 표시
    if (stage === 'downloading') {
      const pct = typeof percent === 'number' ? percent : 0;
      if (progressPercent) progressPercent.textContent = pct > 0 ? `${pct}%` : '';
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (updateCancelBtn) updateCancelBtn.style.display = ''; // 취소 가능
    } else {
      if (progressPercent) progressPercent.textContent = '';
      if (progressBar) progressBar.style.width = '100%';
      if (updateCancelBtn) updateCancelBtn.style.display = 'none'; // 취소 불가
    }
  }

  let pollTimer = null;
  let cancelled = false;

  if (updateCancelBtn) {
    updateCancelBtn.onclick = async () => {
      cancelled = true;
      clearTimeout(pollTimer);
      if (updateCancelBtn) updateCancelBtn.disabled = true;
      if (progressMessage) progressMessage.textContent = '취소 중...';
      try { await postJson('/api/v1/system/update/cancel'); } catch (_) { }
      // Restore normal state
      setTimeout(() => {
        if (normalSection) normalSection.style.display = '';
        if (progressSection) progressSection.style.display = 'none';
        if (updateNowBtn) updateNowBtn.style.display = '';
        if (updateCloseBtn) updateCloseBtn.style.display = '';
        if (updateCancelBtn) { updateCancelBtn.style.display = 'none'; updateCancelBtn.disabled = false; }
      }, 1000);
    };
  }

  async function pollProgress() {
    if (cancelled) return;
    try {
      const p = await fetchJson('/api/v1/system/update/progress');
      setProgressUi(p);
      if (p.stage !== 'done' && p.stage !== 'error') pollTimer = setTimeout(pollProgress, 800);
    } catch (_) {
      if (!cancelled) pollTimer = setTimeout(pollProgress, 1000);
    }
  }

  try {
    const applyPromise = postJson('/api/v1/system/update/apply');
    pollTimer = setTimeout(pollProgress, 400);
    await applyPromise;
    if (cancelled) return;
    clearTimeout(pollTimer);
    setProgressUi({ stage: 'done', percent: 100 });
    setTimeout(async () => {
      try { await postJson('/api/v1/system/update/restart'); } catch (_) { }
      setTimeout(() => location.reload(), 3000);
    }, 1500);
  } catch (e) {
    if (cancelled) return;
    clearTimeout(pollTimer);
    setProgressUi({ stage: 'error', message: `업데이트 실패: ${e.message}`, percent: 0 });
    if (updateNowBtn) updateNowBtn.style.display = '';
    if (updateCloseBtn) updateCloseBtn.style.display = '';
    if (updateCancelBtn) updateCancelBtn.style.display = 'none';
    setTimeout(() => {
      if (normalSection) normalSection.style.display = '';
      if (progressSection) progressSection.style.display = 'none';
    }, 4000);
  }
}

const SETTINGS_TYPING_PREVIEW_DELAY = {
  QUICK: 8,
  FAST: 20,
  NORMAL: 38,
  HUMAN: 55
};
const SETTINGS_TYPING_PREVIEW_REPEAT_COUNT = 3;
let settingsTypingPreviewTimer = null;
let settingsTypingPreviewRunId = 0;
let blogAutoCategoryCatalog = [];
let blogAutoCategorySelected = new Set();
let blogAutoCategoryCatalogMeta = {
  runtimeCount: 0,
  trendCount: 0,
  updatedAt: ''
};
let uiDialogResolver = null;
let uiDialogMode = 'default';

// ─── Logging & Progress Utilities ──────────────────────────────────
const QUICK_PROGRESS_POLL_MS = 1500;
const QUICK_PROGRESS_MAX_LINES = 300;
const QUICK_PROGRESS_FETCH_LIMIT = 600;

const buildDashboardLogKey = (log) => `${String(log?.timestamp || '').trim()}__${String(log?.level || '').trim()}__${String(log?.message || '').trim()}`;

const fetchDashboardLogsSafe = async (limit = 160) => {
  try {
    const safeLimit = Math.max(50, Math.min(1000, Number(limit) || QUICK_PROGRESS_FETCH_LIMIT));
    const res = await fetchJson(`/api/v1/dashboard/logs?limit=${safeLimit}`);
    return Array.isArray(res?.logs) ? res.logs : [];
  } catch (_e) {
    return [];
  }
};

const formatDashboardProgressLine = (log) => {
  const ts = String(log?.timestamp || '').trim();
  const level = String(log?.level || 'info').trim().toUpperCase();
  const message = String(log?.message || '').trim();
  if (!message) return '';
  if (ts) return `[${ts}] [${level}] ${message}`;
  return `[${level}] ${message}`;
};

const appendProgressLine = (targetEl, lines, line) => {
  if (!targetEl) return;
  const text = String(line || '').trim();
  if (!text) return;
  const distanceFromBottom = targetEl.scrollHeight - targetEl.clientHeight - targetEl.scrollTop;
  const shouldStickToBottom = distanceFromBottom <= 24;
  lines.push(text);
  if (lines.length > QUICK_PROGRESS_MAX_LINES) {
    lines.splice(0, lines.length - QUICK_PROGRESS_MAX_LINES);
  }
  targetEl.textContent = lines.join('\n');
  if (shouldStickToBottom) {
    targetEl.scrollTop = targetEl.scrollHeight;
  }
};

const runWithLiveProgress = async ({ targetEl, requestLabel, requestFn, onTick }) => {
  if (!targetEl || typeof requestFn !== 'function') return null;

  const progressLines = [];
  const seenLogKeys = new Set();
  const push = (line) => appendProgressLine(targetEl, progressLines, line);

  const seedLogs = await fetchDashboardLogsSafe(QUICK_PROGRESS_FETCH_LIMIT);
  seedLogs.forEach((log) => {
    seenLogKeys.add(buildDashboardLogKey(log));
  });

  const flushNewLogs = async () => {
    const currentLogs = await fetchDashboardLogsSafe(QUICK_PROGRESS_FETCH_LIMIT);
    if (typeof onTick === 'function') {
      try { await onTick(); } catch (e) { }
    }
    if (!Array.isArray(currentLogs) || currentLogs.length === 0) return;
    const ordered = currentLogs.slice().reverse();
    for (const log of ordered) {
      const key = buildDashboardLogKey(log);
      if (seenLogKeys.has(key)) continue;
      seenLogKeys.add(key);
      push(formatDashboardProgressLine(log));
    }
  };

  push(`[요청] ${requestLabel}`);
  push('[진행] 서버 처리 시작...');

  let timer = null;
  try {
    // 🚀 시작하자마자 첫 번째 폴링 즉시 실행
    flushNewLogs().catch(e => console.warn('Initial flush failed:', e));

    timer = setInterval(async () => {
      void flushNewLogs();
    }, QUICK_PROGRESS_POLL_MS);

    const data = await requestFn();
    await flushNewLogs();
    push('[완료] 요청 처리 완료');
    if (data && typeof data === 'object') {
      const statusText = String(data.status || '').trim();
      const postStatusText = String(data.postStatus || '').trim();
      const executionModeText = String(data.executionMode || data.mode || '').trim();
      const rowNumber = Number(data.rowNumber);
      if (statusText) push(`[상태] ${statusText}`);
      if (postStatusText) push(`[포스팅 옵션] ${getPostStatusLabel(postStatusText)}`);
      if (executionModeText) push(`[실행 모드] ${getExecutionModeLabel(executionModeText)}`);
      if (Number.isFinite(rowNumber) && rowNumber > 0) push(`[Row] ${rowNumber}`);
    }
    return data;
  } catch (e) {
    await flushNewLogs();
    push(`[오류] ${String(e?.message || '요청 처리 중 오류')}`);
    throw e;
  } finally {
    if (timer) clearInterval(timer);
  }
};
// ─────────────────────────────────────────────────────────────────


function pauseDashboardPolling() {
  dashboardPollingPauseCount += 1;
}

function resumeDashboardPolling() {
  dashboardPollingPauseCount = Math.max(0, dashboardPollingPauseCount - 1);
}

function isDashboardPollingPaused() {
  return dashboardPollingPauseCount > 0;
}

function closeUiDialog(result = false) {
  const backdrop = document.getElementById('ui-dialog-backdrop');
  const confirmBtn = document.getElementById('ui-dialog-confirm');
  const cancelBtn = document.getElementById('ui-dialog-cancel');
  const inputEl = document.getElementById('ui-dialog-input');
  const resolvedValue = uiDialogMode === 'prompt'
    ? (result ? String(inputEl?.value || '') : null)
    : Boolean(result);
  if (backdrop) {
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
  }
  if (inputEl) {
    inputEl.value = '';
    inputEl.placeholder = '';
    inputEl.classList.add('hidden');
  }
  if (confirmBtn) confirmBtn.textContent = '확인';
  if (cancelBtn) {
    cancelBtn.textContent = '취소';
    cancelBtn.classList.add('hidden');
  }
  uiDialogMode = 'default';
  if (uiDialogResolver) {
    const resolver = uiDialogResolver;
    uiDialogResolver = null;
    resolver(resolvedValue);
  }
}

function showUiDialog(options = {}) {
  const title = String(options?.title || '알림').trim() || '알림';
  const message = String(options?.message || '').trim();
  const showCancel = options?.showCancel === true;
  const confirmText = String(options?.confirmText || '확인').trim() || '확인';
  const cancelText = String(options?.cancelText || '취소').trim() || '취소';

  const backdrop = document.getElementById('ui-dialog-backdrop');
  const titleEl = document.getElementById('ui-dialog-title');
  const messageEl = document.getElementById('ui-dialog-message');
  const inputEl = document.getElementById('ui-dialog-input');
  const confirmBtn = document.getElementById('ui-dialog-confirm');
  const cancelBtn = document.getElementById('ui-dialog-cancel');
  if (!backdrop || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
    if (showCancel) {
      return Promise.resolve(window.confirm(message));
    }
    window.alert(message);
    return Promise.resolve(true);
  }

  if (uiDialogResolver) {
    closeUiDialog(false);
  }

  titleEl.textContent = title;
  messageEl.textContent = message;
  if (inputEl) {
    inputEl.value = '';
    inputEl.placeholder = '';
    inputEl.classList.add('hidden');
  }
  uiDialogMode = 'default';
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  cancelBtn.classList.toggle('hidden', !showCancel);

  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');

  return new Promise((resolve) => {
    uiDialogResolver = resolve;
  });
}

function showUiPrompt(message, options = {}) {
  const backdrop = document.getElementById('ui-dialog-backdrop');
  const titleEl = document.getElementById('ui-dialog-title');
  const messageEl = document.getElementById('ui-dialog-message');
  const inputEl = document.getElementById('ui-dialog-input');
  const confirmBtn = document.getElementById('ui-dialog-confirm');
  const cancelBtn = document.getElementById('ui-dialog-cancel');
  if (!backdrop || !titleEl || !messageEl || !inputEl || !confirmBtn || !cancelBtn) {
    return Promise.resolve(window.prompt(String(message || ''), String(options?.defaultValue || '')));
  }

  if (uiDialogResolver) {
    closeUiDialog(false);
  }

  uiDialogMode = 'prompt';
  titleEl.textContent = String(options?.title || '입력').trim() || '입력';
  messageEl.textContent = String(message || '');
  inputEl.type = String(options?.type || 'text').trim() || 'text';
  inputEl.value = String(options?.defaultValue || '');
  inputEl.placeholder = String(options?.placeholder || '');
  inputEl.classList.remove('hidden');
  confirmBtn.textContent = String(options?.confirmText || '확인').trim() || '확인';
  cancelBtn.textContent = String(options?.cancelText || '취소').trim() || '취소';
  cancelBtn.classList.remove('hidden');

  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  setTimeout(() => inputEl.focus(), 0);

  return new Promise((resolve) => {
    uiDialogResolver = resolve;
  });
}

function showUiPopup(message) {
  const text = String(message || '').trim();
  if (!text) return Promise.resolve(true);
  if (notifyUiIssueFromMessage(text)) return Promise.resolve(true);
  return showUiDialog({
    title: '알림',
    message: text,
    showCancel: false
  });
}

function showUiConfirm(message, options = {}) {
  return showUiDialog({
    title: String(options?.title || '확인'),
    message: String(message || ''),
    showCancel: true,
    confirmText: String(options?.confirmText || '확인'),
    cancelText: String(options?.cancelText || '취소')
  });
}

function isSettingsViewActive() {
  const settingsView = document.getElementById('view-settings');
  return Boolean(settingsView?.classList.contains('active'));
}

async function confirmDiscardUnsavedSettings() {
  if (!settingsMajorHasPendingBasicChanges) return true;

  const shouldDiscard = await showUiConfirm(
    '저장되지 않은 설정 변경사항이 있습니다.\n저장하지 않고 이동하면 변경사항이 사라집니다.',
    {
      title: '설정 변경사항',
      confirmText: '저장 안 하고 이동',
      cancelText: '계속 편집'
    }
  );

  if (!shouldDiscard) return false;
  await loadSettingsMajor({ force: true, skipPendingConfirm: true });
  return true;
}

async function shouldProceedWithMajorSettingsReload({ force = false, skipPendingConfirm = false, contextLabel = '설정' } = {}) {
  if (!settingsMajorHasPendingBasicChanges) return true;
  if (!force) return false;
  if (skipPendingConfirm) return true;

  const shouldDiscard = await showUiConfirm(
    `저장되지 않은 변경사항이 있습니다.\n${contextLabel}을 다시 불러오면 화면의 임시 변경사항이 사라집니다.`,
    {
      title: '변경사항 새로고침',
      confirmText: '버리고 불러오기',
      cancelText: '취소'
    }
  );

  return shouldDiscard === true;
}

async function loadConfigStatus() {
  try {
    const status = await fetchJson('/api/v1/config/status');
    console.log('[Config Status] Received:', status);
    uiConfigReady = status?.ready === true;
    uiNaverReady = status?.isNaverSet === true;
    uiWpReady = status?.isWpSet === true;
    uiConfigStatusMessage = String(status?.message || '').trim();

    // 플랫폼 UI 상태 동기화 (네이버 & 워드프레스)
    syncPlatformUiState('naver', uiNaverReady);
    syncPlatformUiState('wordpress', uiWpReady);

    // 앱 버전 즉시 표시
    const versionBadge = document.getElementById('badge-version');
    if (versionBadge) {
      const v = status?.version || '0.0.0';
      versionBadge.textContent = `v${v}`;
      syncFooterVersion(v);
      console.log('[UI] Version badge updated to:', v);
    }

    if (!uiConfigReady && !uiConfigPopupShown) {
      uiConfigPopupShown = true;
      const popupText = [
        '설정 파일이 준비되지 않았습니다.',
        '',
        '설정 메뉴에서 주요 항목을 입력 후 저장하세요.',
        '',
        uiConfigStatusMessage || '- config/config.json 또는 config/config.json.sample 확인 필요'
      ].join('\n');
      showUiPopup(popupText);
    }
    return status;
  } catch (e) {
    uiConfigReady = false;
    uiNaverReady = false;
    uiWpReady = false;
    uiConfigStatusMessage = String(e.message || '');
    syncPlatformUiState('naver', false);
    syncPlatformUiState('wordpress', false);
    if (!uiConfigPopupShown) {
      uiConfigPopupShown = true;
      showUiPopup(`설정 상태 확인 중 오류가 발생했습니다.\n${uiConfigStatusMessage}`);
    }
    return null;
  }
}

function syncPlatformUiState(platform, isReady) {
  const targetIds = {
    naver: [
      'quick-target-naver',
      'local-markdown-target-naver',
      'blog-batch-target-naver',
      'shopping-quick-target-naver',
      'shopping-batch-target-naver',
      'blog-publish-auto-target-naver',
      'shopping-publish-auto-target-naver'
    ],
    wordpress: [
      'quick-target-wordpress',
      'local-markdown-target-wordpress',
      'blog-batch-target-wordpress',
      'shopping-quick-target-wordpress',
      'shopping-batch-target-wordpress',
      'blog-publish-auto-target-wordpress',
      'shopping-publish-auto-target-wordpress'
    ]
  };

  const ids = targetIds[platform] || [];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    // 비활성화 처리
    el.disabled = !isReady;

    // 설정 미비 시 체크 해제
    if (!isReady) el.checked = false;

    // 안내 아이콘 (Emoji) 제어
    const container = el.closest('label') || el.parentElement;
    if (!container) return;

    let hint = container.querySelector('.platform-setup-hint');
    if (!isReady) {
      if (!hint) {
        hint = document.createElement('span');
        hint.className = 'platform-setup-hint';
        hint.style.cursor = 'pointer';
        hint.style.marginLeft = '-3px';
        hint.style.fontSize = '12px';
        hint.innerHTML = '❗';
        hint.title = `${platform === 'naver' ? '네이버' : '워드프레스'} 설정이 필요합니다. 클릭하여 [설정 > 블로그] 탭으로 이동합니다.`;

        // 클릭 시 설정 -> 블로그 탭으로 이동
        hint.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof navigateTo === 'function') {
            navigateTo('settings', 'naver-blog');
          }
        };

        container.appendChild(hint);
      }
    } else {
      if (hint) hint.remove();
    }
  });
}

// Legacy function removed (integrated into syncPlatformUiState)
function syncWordPressUiState() { }

function guardUiConfigReady(featureLabel = '이 기능') {
  if (uiConfigReady) return true;
  showUiPopup([
    `${featureLabel}을(를) 실행하려면 설정이 필요합니다.`,
    '상단 메뉴의 [설정]에서 주요 항목 저장 후 다시 시도하세요.',
    '',
    uiConfigStatusMessage || ''
  ].join('\n'));
  return false;
}

async function ensureSheetsPreflightUi(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;

  if (!uiConfigReady) return false;
  if (!force && uiSheetsReady) return true;

  if (uiSheetsPreflightInFlight && !force) {
    try {
      await uiSheetsPreflightInFlight;
      return true;
    } catch (_e) {
      return false;
    }
  }

  const query = force ? '?force=true' : '';
  uiSheetsPreflightInFlight = fetchJson(`/api/v1/sheets/ensure${query}`)
    .then(() => {
      uiSheetsReady = true;
      return true;
    })
    .catch((e) => {
      uiSheetsReady = false;
      if (!silent) {
        showUiPopup([
          '필수 시트 준비에 실패했습니다.',
          '설정의 GOOGLE_SHEET_URL과 서비스 계정 공유 상태를 확인해 주세요.',
          '',
          String(e?.message || 'unknown')
        ].join('\n'));
      }
      throw e;
    })
    .finally(() => {
      uiSheetsPreflightInFlight = null;
    });

  try {
    await uiSheetsPreflightInFlight;
    return true;
  } catch (_e) {
    return false;
  }
}

function findTrendByRowIndex(rowIndex) {
  return (blogTrendsCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function getPageInfo(type) {
  return blogPageState[type] || { limit: 50, offset: 0, total: 0 };
}

function setPageInfo(type, patch = {}) {
  const current = getPageInfo(type);
  blogPageState[type] = {
    ...current,
    ...patch
  };
}

function getPageSummary(total, limit, offset) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeLimit = Math.max(1, Number(limit || 50));
  const pageCount = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const currentPage = Math.min(pageCount, Math.floor(Math.max(0, Number(offset || 0)) / safeLimit) + 1);
  return { pageCount, currentPage };
}

function renderTrendsPagination() {
  const infoEl = document.getElementById('blog-trends-page-info');
  const prevBtn = document.getElementById('blog-trends-page-prev');
  const nextBtn = document.getElementById('blog-trends-page-next');
  const pageInfo = getPageInfo('trends');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function renderTopicsPagination() {
  const infoEl = document.getElementById('blog-topics-page-info');
  const prevBtn = document.getElementById('blog-topics-page-prev');
  const nextBtn = document.getElementById('blog-topics-page-next');
  const pageInfo = getPageInfo('topics');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function renderShoppingPagination() {
  const infoEl = document.getElementById('shopping-page-info');
  const prevBtn = document.getElementById('shopping-page-prev');
  const nextBtn = document.getElementById('shopping-page-next');
  const pageInfo = getPageInfo('shopping');
  const { pageCount, currentPage } = getPageSummary(pageInfo.total, pageInfo.limit, pageInfo.offset);
  if (infoEl) infoEl.textContent = `페이지 ${currentPage} / ${pageCount} (총 ${pageInfo.total || 0}건)`;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= pageCount;
}

function updateTrendsSelectionUi() {
  const countEl = document.getElementById('blog-trends-selected-count');
  if (countEl) countEl.textContent = `${blogTrendsSelectedRowIndices.size}건 선택`;
}

function clearTrendsSelections() {
  blogTrendsSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.trend-row-selector'));
  selectors.forEach(el => { el.checked = false; });
  updateTrendsSelectionUi();
}

function findShoppingByRowIndex(rowIndex) {
  return (blogShoppingCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function updateShoppingSelectionUi() {
  const countEl = document.getElementById('shopping-selected-count');
  if (countEl) countEl.textContent = `${blogShoppingSelectedRowIndices.size}건 선택`;
}

function clearShoppingSelections() {
  blogShoppingSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.shopping-row-selector'));
  selectors.forEach(el => { el.checked = false; });
  updateShoppingSelectionUi();
}

function getSortState(tableName) {
  const target = String(tableName || '').trim();
  if (!tableSortState[target]) {
    tableSortState[target] = { key: 'rowNumber', direction: 'desc' };
  }
  return tableSortState[target];
}

function updateSortableHeadersUi() {
  const headers = Array.from(document.querySelectorAll('.data-table th.sortable'));
  headers.forEach((th) => {
    const tableName = String(th.dataset.sortTable || '').trim();
    const key = String(th.dataset.sortKey || '').trim();
    const state = getSortState(tableName);
    const isActive = state.key === key;
    th.classList.toggle('active-sort', isActive);
    th.setAttribute('data-sort-dir', isActive ? state.direction : '');
    th.setAttribute('aria-sort', isActive ? (state.direction === 'desc' ? 'descending' : 'ascending') : 'none');
    th.setAttribute('role', 'button');
    th.setAttribute('tabindex', '0');
  });
}

function toggleTableSort(tableName, key) {
  const state = getSortState(tableName);
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;

  if (state.key === normalizedKey) {
    state.direction = state.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.key = normalizedKey;
    state.direction = 'asc';
  }
  updateSortableHeadersUi();

  if (tableName === 'trends') {
    setPageInfo('trends', { offset: 0 });
    loadBlogTrends();
    return;
  }
  if (tableName === 'topics') {
    setPageInfo('topics', { offset: 0 });
    loadBlogTopics();
    return;
  }
  if (tableName === 'shopping') {
    setPageInfo('shopping', { offset: 0 });
    loadBlogShopping();
    return;
  }
  if (tableName === 'trendPosting') {
    renderTrendPostingResults();
  }
}

function resetTableSort(tableName) {
  const state = getSortState(tableName);
  state.key = 'rowNumber';
  state.direction = 'desc';
  updateSortableHeadersUi();
}

function renderBlogTrendsTable(items) {
  const tbody = document.getElementById('blog-trends-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">조회 결과가 없습니다.</td></tr>';
    updateTrendsSelectionUi();
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const checked = blogTrendsSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    return `
      <tr data-row-index="${item.rowIndex}">
        <td><input type="checkbox" class="trend-row-selector" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td>${escapeHtml(item.date || '-')}</td>
        <td>${escapeHtml(item.category || '-')}</td>
        <td>${escapeHtml(item.keyword || '-')}</td>
        <td>${escapeHtml(item.variation || '-')}</td>
        <td>${escapeHtml(item.status || '-')}</td>
      </tr>
    `;
  }).join('');
  const trendsSelectAll = document.getElementById('blog-trends-table-select-all');
  if (trendsSelectAll) trendsSelectAll.checked = false;
  updateTrendsSelectionUi();
  updateSortableHeadersUi();
}

async function loadBlogTrends(options = {}) {
  if (!guardUiConfigReady('Trends 조회')) return;
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('blog-trends-result');
  const pageInfo = getPageInfo('trends');
  const q = (document.getElementById('blog-trends-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  const sortState = getSortState('trends');
  if (q) params.set('q', q);
  params.set('limit', String(pageInfo.limit));
  params.set('offset', String(pageInfo.offset));
  params.set('sortBy', String(sortState.key || 'rowNumber'));
  params.set('sortDir', String(sortState.direction || 'desc'));
  if (resultBox && !silent) resultBox.textContent = 'Trends 조회 중...';

  try {
    const data = await fetchJson(`/api/v1/trends/items?${params.toString()}`);
    blogTrendsCache = Array.isArray(data.items) ? data.items : [];
    setPageInfo('trends', {
      total: Number(data.total || 0),
      limit: Number(data.limit || pageInfo.limit || 50),
      offset: Number(data.offset || 0)
    });
    renderBlogTrendsTable(blogTrendsCache);
    renderTrendsPagination();
    if (resultBox && !silent) resultBox.textContent = `조회 완료: ${data.total ?? blogTrendsCache.length}건`;
  } catch (e) {
    blogTrendsCache = [];
    renderBlogTrendsTable([]);
    renderTrendsPagination();
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getKstDateParts(baseDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(baseDate);

  const year = Number(parts.find(p => p.type === 'year')?.value || 0);
  const month = Number(parts.find(p => p.type === 'month')?.value || 0);
  const day = Number(parts.find(p => p.type === 'day')?.value || 0);
  return { year, month, day };
}

function isValidYmd(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year
    && d.getUTCMonth() + 1 === month
    && d.getUTCDate() === day;
}

function shiftKstDays(days) {
  const { year, month, day } = getKstDateParts(new Date());
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + Number(days || 0));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function resolveTrendCollectDateYmd(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) return shiftKstDays(-1);

  const lower = input.toLowerCase();
  if (lower === 'yesterday' || input === '어제') return shiftKstDays(-1);

  const relativeMatch = lower.match(/^-(\d{1,3})d$/);
  if (relativeMatch) {
    const days = Number(relativeMatch[1]);
    if (!Number.isInteger(days) || days < 1) {
      throw new Error('상대 날짜는 -1d, -2d 형식으로 입력하세요.');
    }
    return shiftKstDays(-days);
  }

  const compactMatch = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const year = Number(compactMatch[1]);
    const month = Number(compactMatch[2]);
    const day = Number(compactMatch[3]);
    if (!isValidYmd(year, month, day)) {
      throw new Error('유효하지 않은 날짜입니다.');
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const dashedMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashedMatch) {
    const year = Number(dashedMatch[1]);
    const month = Number(dashedMatch[2]);
    const day = Number(dashedMatch[3]);
    if (!isValidYmd(year, month, day)) {
      throw new Error('유효하지 않은 날짜입니다.');
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  throw new Error('날짜 형식이 올바르지 않습니다. (예: 2026-02-18, 20260218, yesterday, -1d)');
}

async function checkTrendDateAlreadyCollected(targetDateYmd) {
  const limit = 200;
  let offset = 0;
  let guard = 0;

  while (guard < 20) {
    const params = new URLSearchParams({
      q: targetDateYmd,
      limit: String(limit),
      offset: String(offset)
    });
    const data = await fetchJson(`/api/v1/trends/items?${params.toString()}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    const exists = items.some(item => String(item?.date || '').trim() === targetDateYmd);
    if (exists) return true;

    const total = Number(data?.total || 0);
    if (items.length <= 0 || offset + items.length >= total) {
      return false;
    }
    offset += items.length;
    guard += 1;
  }
  return false;
}

async function runBlogTrendsCollect() {
  if (!guardUiConfigReady('트렌드 수집')) return;
  if (blogTrendsCollectInFlight) return;
  const resultBox = document.getElementById('blog-trends-result');
  const rawDateInput = String(document.getElementById('blog-trends-date')?.value || '').trim();
  let targetDateYmd = '';
  try {
    targetDateYmd = resolveTrendCollectDateYmd(rawDateInput);
    if (!targetDateYmd) throw new Error('날짜 해석에 실패했습니다.');
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
    return;
  }

  let alreadyCollected = false;
  try {
    alreadyCollected = await checkTrendDateAlreadyCollected(targetDateYmd);
  } catch (e) {
    // 중복 확인 실패는 수집 자체를 막지 않는다.
    console.warn('트렌드 날짜 중복 확인 실패:', e);
  }
  const confirmLines = [`${targetDateYmd} 기준으로 트렌드 수집을 진행하시겠습니까?`];
  if (alreadyCollected) {
    confirmLines.push('');
    confirmLines.push('이미 수집된 날짜가 확인되었습니다. 계속 진행하면 중복 데이터가 추가될 수 있습니다.');
  }
  const confirmMessage = confirmLines.join('\n');

  const shouldProceed = await showUiConfirm(confirmMessage, {
    title: '트렌드 수집 확인',
    confirmText: '진행',
    cancelText: '취소'
  });
  if (shouldProceed !== true) {
    return;
  }

  blogTrendsCollectInFlight = true;
  if (resultBox) resultBox.textContent = `트렌드 수집 중... (기준일: ${targetDateYmd})`;
  try {
    const selectedCategories = Array.from(blogAutoCategorySelected.values())
      .map(v => String(v || '').trim())
      .filter(Boolean);
    const headless = Boolean(document.getElementById('blog-trends-headless')?.checked);
    const payload = {
      date: targetDateYmd,
      headless,
      ...(selectedCategories.length > 0 ? { categories: selectedCategories } : {})
    };
    const data = await postJson('/api/v1/trends/collect', payload);
    if (resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
    clearTrendsSelections();
    setPageInfo('trends', { offset: 0 });
    await Promise.all([
      loadDashboard(),
      loadBlogTrends({ silent: true }),
      loadBlogAutoCategoryCatalog({ force: true, silent: true })
    ]);
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  } finally {
    blogTrendsCollectInFlight = false;
  }
}

async function runTrendsToTopics() {
  if (!guardUiConfigReady('Trends → Topics')) return;
  const resultBox = document.getElementById('blog-trends-result');
  const rowIndices = Array.from(blogTrendsSelectedRowIndices.values()).filter(v => Number.isInteger(v));
  if (rowIndices.length === 0) {
    if (resultBox) resultBox.textContent = '먼저 Topics에 보낼 Trends 행을 1개 이상 선택하세요.';
    return;
  }

  if (resultBox) resultBox.textContent = `Trends → Topics 처리 중... (${rowIndices.length}건)`;
  try {
    const data = await postJson('/api/v1/trends/to-topics', { rowIndices });
    if (resultBox) resultBox.textContent = JSON.stringify(data, null, 2);
    clearTrendsSelections();
    await Promise.all([loadBlogTrends({ silent: true }), loadBlogTopics({ silent: true })]);
  } catch (e) {
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  }
}

function activateBlogTab(tabName, options = {}) {
  console.log("=== activateBlogTab CALLED ===", tabName);
  const allowed = ['quick', 'trend-posting', 'trends', 'topics', 'comment-draft', 'collect', 'auto'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  blogActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.blog-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.blogTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `blog-tab-${target}`));
  syncScopedMajorSaveActions();

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'quick') {
    void loadQuickTopicRecommendations();
    return;
  }

  if (target === 'trend-posting') {
    void loadTrendPostingMeta();
    return;
  }
  if (target === 'trends') {
    loadBlogTrends();
    return;
  }
  if (target === 'topics') {
    console.log("activateBlogTab: calling loadBlogTopics()");
    loadBlogTopics();
    console.log("activateBlogTab: loading categories");
    fetchWpCategories().then(() => {
      populateFilterWpCategoryDropdown('blog-status-filter-wp-category', globalWpCategoryCache || categoryCache);
      console.log("activateBlogTab: categories populated");
    }).catch(e => console.error("WP Category Load Error:", e));
    return;
  }
  if (target === 'comment-draft') {
    loadNaverCommentDraftSettings();
    return;
  }
  if (target === 'collect') {
    loadBlogCollectSettings();
    return;
  }
  if (target === 'auto') {
    loadBlogAutoSettings();
    return;
  }
}

function applyQuickInputMode(mode) {
  const nextMode = ['ai', 'manuscript', 'pasted'].includes(mode) ? mode : 'ai';
  quickInputMode = nextMode;
  localStorage.setItem('quick_input_mode', quickInputMode);
  document.getElementById('quick-mode-ai-btn')?.classList.toggle('is-active', quickInputMode === 'ai');
  document.getElementById('quick-mode-manuscript-btn')?.classList.toggle('is-active', quickInputMode === 'manuscript');
  document.getElementById('quick-mode-pasted-btn')?.classList.toggle('is-active', quickInputMode === 'pasted');
  const aiPanel = document.getElementById('quick-ai-mode-panel');
  const manuscriptPanel = document.getElementById('quick-manuscript-mode-panel');
  const pastedPanel = document.getElementById('quick-pasted-mode-panel');
  if (aiPanel) aiPanel.hidden = quickInputMode !== 'ai';
  if (manuscriptPanel) manuscriptPanel.hidden = quickInputMode !== 'manuscript';
  if (pastedPanel) pastedPanel.hidden = quickInputMode !== 'pasted';
}

function getActiveQuickTrendContext() {
  if (!quickTrendTopicContext) return null;
  const subject = String(document.getElementById('quick-subject')?.value || '').trim();
  const keywords = String(document.getElementById('quick-keywords')?.value || '').trim();
  if (subject !== quickTrendTopicContext.subject || keywords !== quickTrendTopicContext.keyword) return null;
  return quickTrendTopicContext;
}

function getActiveQuickRecommendationContext() {
  if (!quickRecommendationTopicContext) return null;
  const subject = String(document.getElementById('quick-subject')?.value || '').trim();
  const keywords = String(document.getElementById('quick-keywords')?.value || '').trim();
  if (subject !== quickRecommendationTopicContext.subject || keywords !== quickRecommendationTopicContext.keywordsText) return null;
  return quickRecommendationTopicContext;
}

function syncQuickTopicOrigin() {
  const originEl = document.getElementById('quick-topic-origin');
  if (!originEl) return;
  const trendContext = getActiveQuickTrendContext();
  const recommendationContext = getActiveQuickRecommendationContext();
  const context = trendContext || recommendationContext;
  originEl.hidden = !context;
  originEl.textContent = trendContext
    ? `네이버 트렌드 글감 · ${trendContext.trendDate}`
    : (recommendationContext ? `추천 글감 · ${recommendationContext.topicSeed || recommendationContext.subject}` : '');
}

function handleQuickTopicIdentityInput() {
  if (quickTrendTopicContext && !getActiveQuickTrendContext()) {
    quickTrendTopicContext = null;
  }
  if (quickRecommendationTopicContext && !getActiveQuickRecommendationContext()) {
    quickRecommendationTopicContext = null;
  }
  syncQuickTopicOrigin();
}

function getQuickRecommendationSourceLabel(item = {}) {
  const refs = Array.isArray(item?.recommendation?.source_refs) ? item.recommendation.source_refs : [];
  if (refs.some((ref) => ['trends', 'knowledge'].includes(String(ref?.kind || '').toLowerCase()))) return '트렌드와 연결';
  if (refs.some((ref) => ['topic', 'facet'].includes(String(ref?.kind || '').toLowerCase()))) return '관심 주제와 연결';
  return '내 글쓰기 기반';
}

function renderQuickTopicRecommendations() {
  const statusEl = document.getElementById('quick-topic-recommendations-status');
  const listEl = document.getElementById('quick-topic-recommendations-list');
  const refreshBtn = document.getElementById('quick-topic-recommendations-refresh');
  if (!statusEl || !listEl) return;
  refreshBtn?.toggleAttribute('disabled', quickTopicRecommendationState.loading);
  if (quickTopicRecommendationState.loading) {
    statusEl.hidden = false;
    statusEl.textContent = '기억과 최신 신호를 살펴 추천을 만들고 있습니다...';
    listEl.innerHTML = '';
    return;
  }
  const items = quickTopicRecommendationState.items;
  if (items.length === 0) {
    statusEl.hidden = false;
    statusEl.textContent = quickTopicRecommendationState.error
      ? `추천을 불러오지 못했습니다: ${quickTopicRecommendationState.error}`
      : (quickTopicRecommendationState.loaded
      ? '지금 바로 드릴 추천이 없습니다. 다른 추천을 눌러 다시 살펴보세요.'
      : '추천을 준비하고 있습니다...');
    listEl.innerHTML = '';
    return;
  }
  statusEl.hidden = true;
  listEl.innerHTML = items.map((item, index) => {
    const keywords = Array.isArray(item.keywords) ? item.keywords.slice(0, 4).join(' · ') : '';
    return `
      <article class="quick-topic-recommendation-row" data-recommendation-id="${escapeHtml(item.id || String(index))}">
        <div class="quick-topic-recommendation-main">
          <span class="quick-topic-recommendation-source">${escapeHtml(getQuickRecommendationSourceLabel(item))}</span>
          <strong>${escapeHtml(item.title || '')}</strong>
          ${keywords ? `<span class="quick-topic-recommendation-keywords">${escapeHtml(keywords)}</span>` : ''}
          <button class="quick-topic-recommendation-reason-toggle" type="button" data-recommendation-action="reason" aria-expanded="false">추천 근거</button>
          <p class="quick-topic-recommendation-reason" hidden>${escapeHtml(item.reason || item.summary || '최근 활동과 관심 신호를 바탕으로 추천했습니다.')}</p>
        </div>
        <div class="quick-topic-recommendation-actions">
          <button class="btn btn-primary" type="button" data-recommendation-action="quick">빠른 포스팅</button>
          <button class="btn btn-secondary" type="button" data-recommendation-action="save">글감 저장</button>
          <button class="quick-topic-recommendation-dismiss" type="button" data-recommendation-action="dismiss" aria-label="이 추천이 도움되지 않음">×</button>
        </div>
      </article>`;
  }).join('');
}

async function loadQuickTopicRecommendations({ refresh = false } = {}) {
  if (quickTopicRecommendationState.loading || (quickTopicRecommendationState.loaded && !refresh)) return;
  quickTopicRecommendationState.loading = true;
  quickTopicRecommendationState.error = '';
  renderQuickTopicRecommendations();
  try {
    const query = refresh ? '?limit=3&refresh=1' : '?limit=3';
    const result = await fetchJson(`/api/v1/blog/topic-recommendations${query}`);
    quickTopicRecommendationState.items = Array.isArray(result?.ideas) ? result.ideas.slice(0, 3) : [];
    quickTopicRecommendationState.loaded = true;
  } catch (error) {
    quickTopicRecommendationState.items = [];
    quickTopicRecommendationState.loaded = true;
    quickTopicRecommendationState.error = error.message;
  } finally {
    quickTopicRecommendationState.loading = false;
    renderQuickTopicRecommendations();
  }
}

async function recordQuickTopicRecommendationOutcome(item, stage, extra = {}) {
  if (!item?.recommendation?.run_id || !item?.recommendation?.candidate_id) return;
  try {
    await postJson('/api/v1/blog/topic-recommendations/outcome', {
      stage,
      subject: item.title,
      recommendation: item.recommendation,
      ...extra
    });
  } catch (error) {
    console.warn('[TopicRecommendation] outcome 저장 실패:', error.message);
  }
}

async function applyQuickTopicRecommendation(item) {
  if (!item) return false;
  const values = ['quick-subject', 'quick-keywords', 'quick-instruction', 'quick-reference-url']
    .map((id) => String(document.getElementById(id)?.value || '').trim());
  const activeContext = getActiveQuickRecommendationContext();
  const same = activeContext?.id === String(item.id || '');
  if (!same && values.some(Boolean)) {
    const confirmed = await showUiConfirm(
      '빠른 포스팅에 작성 중인 내용이 있습니다. 선택한 추천 글감으로 교체할까요?',
      { title: '추천 글감으로 교체', confirmText: '교체', cancelText: '취소' }
    );
    if (!confirmed) return false;
  }
  applyQuickInputMode('ai');
  const keywordsText = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  document.getElementById('quick-subject').value = String(item.title || '').trim();
  document.getElementById('quick-keywords').value = keywordsText;
  document.getElementById('quick-instruction').value = String(item.summary || '').trim();
  document.getElementById('quick-reference-url').value = '';
  quickTrendTopicContext = null;
  quickRecommendationTopicContext = {
    id: String(item.id || ''),
    subject: String(item.title || '').trim(),
    keywordsText,
    topicSeed: String(item?.recommendation?.topic_seed || '').trim(),
    recommendation: item.recommendation
  };
  syncQuickTopicOrigin();
  await recordQuickTopicRecommendationOutcome(item, 'selected');
  document.getElementById('quick-subject')?.focus();
  return true;
}

function formatTrendPostingDateLabel(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return String(value || '');
  return `${parts[1]}월 ${parts[2]}일`;
}

function subtractTrendPostingDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function getSelectedTrendPostingCategories() {
  return Array.from(document.querySelectorAll('[data-trend-posting-category].active'))
    .map((button) => String(button.dataset.category || '').trim())
    .filter(Boolean);
}

function syncTrendPostingCategoryLimit() {
  const selected = getSelectedTrendPostingCategories();
  const atLimit = selected.length >= 5;
  document.querySelectorAll('[data-trend-posting-category]').forEach((button) => {
    button.disabled = atLimit && !button.classList.contains('active');
  });
  const countEl = document.getElementById('trend-posting-category-count');
  const hintEl = document.getElementById('trend-posting-category-hint');
  if (countEl) countEl.textContent = `${selected.length}/5`;
  if (hintEl) hintEl.textContent = atLimit
    ? '최대 5개를 선택했습니다. 다른 카테고리를 선택하려면 하나를 해제하세요.'
    : '최대 5개까지 선택할 수 있습니다.';
}

function syncTrendPostingPeriodUi() {
  const isCustom = document.getElementById('trend-posting-period')?.value === 'custom';
  const customEl = document.getElementById('trend-posting-custom-dates');
  if (customEl) customEl.hidden = !isCustom;
}

function resolveTrendPostingDateRange() {
  const latest = String(trendPostingState.meta?.dateRange?.max || '').trim();
  const period = document.getElementById('trend-posting-period')?.value || 'latest';
  if (period === 'custom') {
    return {
      dateFrom: String(document.getElementById('trend-posting-date-from')?.value || '').trim(),
      dateTo: String(document.getElementById('trend-posting-date-to')?.value || '').trim()
    };
  }
  return {
    dateFrom: period === '7days' ? subtractTrendPostingDays(latest, 6) : latest,
    dateTo: latest
  };
}

function renderTrendPostingCategories(categories) {
  const container = document.getElementById('trend-posting-categories');
  if (!container) return;
  container.innerHTML = (Array.isArray(categories) ? categories : []).map((category, index) => `
    <button type="button" class="category-option-btn${index === 0 ? ' active' : ''}"
      data-trend-posting-category data-category="${escapeHtml(category)}"
      aria-pressed="${index === 0 ? 'true' : 'false'}">${escapeHtml(category)}</button>
  `).join('') || '<span class="category-hint">선택할 수 있는 카테고리가 없습니다.</span>';
  syncTrendPostingCategoryLimit();
}

function renderTrendPostingChange(change = {}) {
  const type = ['up', 'down', 'new', 'steady'].includes(change.type) ? change.type : 'steady';
  const fallback = { up: '상승', down: '하락', new: '신규', steady: '유지' }[type];
  return `<span class="trend-change trend-change-${type}">${escapeHtml(change.raw || fallback)}</span>`;
}

function getTrendPostingChangeSortValue(change = {}) {
  const type = String(change?.type || 'steady');
  const amount = Number(change?.amount);
  if (type === 'new') return Number.POSITIVE_INFINITY;
  if (type === 'up') return Number.isFinite(amount) ? Math.abs(amount) : 0;
  if (type === 'down') return Number.isFinite(amount) ? -Math.abs(amount) : 0;
  return 0;
}

function compareTrendPostingItems(left, right, key) {
  if (key === 'change') {
    const leftValue = getTrendPostingChangeSortValue(left?.change);
    const rightValue = getTrendPostingChangeSortValue(right?.change);
    if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
    return String(left?.change?.raw || '').localeCompare(String(right?.change?.raw || ''), 'ko');
  }
  if (key === 'categories') {
    const leftCategories = Array.isArray(left?.categories) ? left.categories.join(', ') : '';
    const rightCategories = Array.isArray(right?.categories) ? right.categories.join(', ') : '';
    return leftCategories.localeCompare(rightCategories, 'ko');
  }
  const leftValue = String(left?.[key] || '');
  const rightValue = String(right?.[key] || '');
  return leftValue.localeCompare(rightValue, 'ko');
}

function getTrendPostingFilterValues() {
  const keyword = String(document.getElementById('trend-posting-filter-keyword')?.value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ko-KR');
  const view = String(document.getElementById('trend-posting-filter-view')?.value || 'all');
  const excludeRecent = Boolean(document.getElementById('trend-posting-filter-exclude-recent')?.checked);
  return { keyword, view, excludeRecent };
}

function filterTrendPostingItems(items) {
  const { keyword, view, excludeRecent } = getTrendPostingFilterValues();
  let filtered = items.filter((item) => {
    const changeType = String(item?.change?.type || 'steady');
    const itemKey = String(item?.keyword || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
    if (keyword && !String(item?.keyword || '').toLocaleLowerCase('ko-KR').includes(keyword)) return false;
    if (excludeRecent && trendPostingState.recentTopicKeys.has(itemKey)) return false;
    if (view === 'all') return true;
    if (view === 'top10') return changeType === 'up' && Number.isFinite(Number(item?.change?.amount));
    return changeType === view;
  });
  if (view === 'top10') {
    filtered = filtered
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const difference = getTrendPostingChangeSortValue(right.item?.change) - getTrendPostingChangeSortValue(left.item?.change);
        return difference === 0 ? left.index - right.index : difference;
      })
      .slice(0, 10)
      .map(({ item }) => item);
  }
  return filtered;
}

async function loadRecentTrendPostingTopics() {
  if (trendPostingState.recentTopicsLoaded || trendPostingState.recentTopicsLoading) return;
  const checkbox = document.getElementById('trend-posting-filter-exclude-recent');
  const statusEl = document.getElementById('trend-posting-status');
  trendPostingState.recentTopicsLoading = true;
  if (checkbox) checkbox.disabled = true;
  try {
    const result = await fetchJson('/api/v1/trend-posting/recent-topics?days=15');
    trendPostingState.recentTopicKeys = new Set((Array.isArray(result?.keywords) ? result.keywords : [])
      .map((value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR'))
      .filter(Boolean));
    trendPostingState.recentTopicsLoaded = true;
  } catch (error) {
    if (checkbox) checkbox.checked = false;
    if (statusEl) statusEl.textContent = `최근 저장 글감을 불러오지 못했습니다: ${error.message}`;
  } finally {
    trendPostingState.recentTopicsLoading = false;
    if (checkbox) checkbox.disabled = false;
    renderTrendPostingResults();
  }
}

function updateTrendPostingFilterCount(visibleCount) {
  const countEl = document.getElementById('trend-posting-filter-count');
  if (!countEl) return;
  const total = trendPostingState.items.length;
  countEl.textContent = total > 0
    ? `${total}개 중 ${visibleCount}개 표시`
    : (trendPostingState.queryRange ? '0개 중 0개 표시' : '조회 후 사용할 수 있습니다.');
}

function initTrendPostingStickyStack() {
  const panel = document.getElementById('blog-tab-trend-posting');
  const filters = document.getElementById('trend-posting-result-filters');
  if (!panel || !filters) return;
  const syncHeight = () => {
    panel.style.setProperty('--trend-posting-filter-height', `${filters.offsetHeight}px`);
  };
  syncHeight();
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(syncHeight);
    observer.observe(filters);
  } else {
    window.addEventListener('resize', syncHeight);
  }
}

function getSortedTrendPostingItems() {
  const sortState = getSortState('trendPosting');
  const direction = sortState.direction === 'desc' ? -1 : 1;
  return filterTrendPostingItems(trendPostingState.items)
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const compared = compareTrendPostingItems(left.item, right.item, sortState.key);
      return compared === 0 ? left.index - right.index : compared * direction;
    })
    .map(({ item }) => item);
}

function renderTrendPostingResults(items) {
  const body = document.getElementById('trend-posting-table-body');
  if (!body) return;
  if (Array.isArray(items)) {
    trendPostingState.items = items.slice();
    trendPostingState.itemsById = new Map(trendPostingState.items.map((item) => [String(item.id), item]));
  }
  if (trendPostingState.items.length === 0) {
    updateTrendPostingFilterCount(0);
    body.innerHTML = trendPostingState.queryRange
      ? '<tr><td colspan="5">조건에 맞는 트렌드 키워드가 없습니다.</td></tr>'
      : '<tr><td colspan="5">아직 조회하지 않았습니다.</td></tr>';
    return;
  }
  const visibleItems = getSortedTrendPostingItems();
  updateTrendPostingFilterCount(visibleItems.length);
  if (visibleItems.length === 0) {
    body.innerHTML = '<tr><td colspan="5">현재 결과 필터에 맞는 키워드가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = visibleItems.map((item) => {
    const id = String(item.id || '');
    const saved = trendPostingState.savedIds.has(`${id}:${String(item.latestTrendDate || '')}`);
    const categories = (Array.isArray(item.categories) ? item.categories : [])
      .map((category) => `<span class="trend-category-tag">${escapeHtml(category)}</span>`)
      .join('');
    return `
      <tr data-trend-posting-id="${escapeHtml(id)}">
        <td><div class="trend-category-tags">${categories}</div></td>
        <td>${escapeHtml(item.latestTrendDate)}</td>
        <td class="trend-keyword-cell">${escapeHtml(item.keyword)}</td>
        <td>${renderTrendPostingChange(item.change)}</td>
        <td>
          <div class="trend-posting-action-cell">
            <div class="trend-posting-row-actions">
              <button type="button" class="primary" data-trend-posting-action="write" data-item-id="${escapeHtml(id)}">빠른 포스팅</button>
              <button type="button" class="secondary" data-trend-posting-action="save" data-item-id="${escapeHtml(id)}"${saved ? ' disabled' : ''}>${saved ? '저장됨' : '글감 저장'}</button>
            </div>
            <span class="trend-topic-save-feedback${saved ? ' is-success' : ''}"
              data-trend-topic-save-feedback aria-live="polite">${saved ? '대기 상태로 저장됨' : ''}</span>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function loadTrendPostingMeta(options = {}) {
  if (trendPostingState.loading) return;
  if (trendPostingState.meta && options.force !== true) return;
  const statusEl = document.getElementById('trend-posting-status');
  trendPostingState.loading = true;
  if (statusEl) statusEl.textContent = '트렌드 조회 정보를 불러오는 중...';
  try {
    const meta = await fetchJson('/api/v1/trend-posting/meta');
    trendPostingState.meta = meta;
    const latest = String(meta?.dateRange?.max || '');
    const latestLabel = formatTrendPostingDateLabel(latest);
    const badge = document.getElementById('trend-posting-latest-badge');
    const period = document.getElementById('trend-posting-period');
    if (badge) badge.textContent = latestLabel ? `최신 데이터 ${latestLabel}` : '최신 날짜 없음';
    const latestOption = period?.querySelector('option[value="latest"]');
    if (latestOption) latestOption.textContent = latestLabel ? `최신 데이터 (${latestLabel})` : '최신 데이터';
    const fromEl = document.getElementById('trend-posting-date-from');
    const toEl = document.getElementById('trend-posting-date-to');
    if (fromEl) {
      fromEl.min = String(meta?.dateRange?.min || '');
      fromEl.max = latest;
      fromEl.value = latest;
    }
    if (toEl) {
      toEl.min = String(meta?.dateRange?.min || '');
      toEl.max = latest;
      toEl.value = latest;
    }
    renderTrendPostingCategories(meta?.categories || []);
    const queryBtn = document.getElementById('trend-posting-query-btn');
    if (queryBtn) queryBtn.disabled = !latest || !Array.isArray(meta?.categories) || meta.categories.length === 0;
    if (statusEl) statusEl.textContent = '기간과 트렌드 카테고리를 선택한 뒤 조회하세요.';
  } catch (error) {
    if (statusEl) statusEl.textContent = `조회 정보를 불러오지 못했습니다: ${error.message}`;
  } finally {
    trendPostingState.loading = false;
  }
}

async function queryTrendPostingKeywords() {
  if (trendPostingState.loading) return;
  const statusEl = document.getElementById('trend-posting-status');
  const queryBtn = document.getElementById('trend-posting-query-btn');
  const categories = getSelectedTrendPostingCategories();
  if (categories.length === 0) {
    await showUiPopup('트렌드 카테고리를 하나 이상 선택해 주세요.');
    return;
  }
  const { dateFrom, dateTo } = resolveTrendPostingDateRange();
  if (!dateFrom || !dateTo) {
    await showUiPopup('조회 기간을 입력해 주세요.');
    return;
  }
  const fromTime = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toTime = Date.parse(`${dateTo}T00:00:00.000Z`);
  const inclusiveDays = Math.floor((toTime - fromTime) / 86400000) + 1;
  if (!Number.isFinite(inclusiveDays) || inclusiveDays < 1) {
    await showUiPopup('시작일은 종료일보다 늦을 수 없습니다.');
    return;
  }
  if (inclusiveDays > 31) {
    await showUiPopup('직접 지정 기간은 최대 31일까지 조회할 수 있습니다.');
    return;
  }
  trendPostingState.loading = true;
  if (queryBtn) queryBtn.disabled = true;
  if (statusEl) statusEl.textContent = '트렌드 키워드를 조회하는 중...';
  try {
    const params = new URLSearchParams({ dateFrom, dateTo });
    categories.forEach((category) => params.append('categories[]', category));
    const result = await fetchJson(`/api/v1/trend-posting/keywords?${params.toString()}`);
    trendPostingState.queryRange = { dateFrom, dateTo };
    renderTrendPostingResults(result?.items || []);
    if (statusEl) statusEl.textContent = `${Number(result?.count || 0)}개의 키워드를 찾았습니다. (${dateFrom} ~ ${dateTo})`;
  } catch (error) {
    if (statusEl) statusEl.textContent = `트렌드 조회에 실패했습니다: ${error.message}`;
  } finally {
    trendPostingState.loading = false;
    if (queryBtn) queryBtn.disabled = false;
  }
}

async function openTrendTopicInQuickPosting(item) {
  if (!item) return;
  const perTopicValues = ['quick-subject', 'quick-keywords', 'quick-instruction', 'quick-reference-url']
    .map((id) => String(document.getElementById(id)?.value || '').trim());
  const activeContext = getActiveQuickTrendContext();
  const alreadyShowingSameTrend = activeContext?.id === String(item.id || '')
    && activeContext?.trendDate === String(item.latestTrendDate || '');
  if (!alreadyShowingSameTrend && perTopicValues.some(Boolean)) {
    const confirmed = await showUiConfirm(
      '빠른 포스팅에 작성 중인 글감이 있습니다. 선택한 트렌드 키워드로 교체할까요?',
      { title: '빠른 포스팅 글감 교체', confirmText: '교체', cancelText: '취소' }
    );
    if (!confirmed) return;
  }
  await navigateTo('blog', 'quick');
  if (!document.getElementById('blog-tab-quick')?.classList.contains('active')) return;
  applyQuickInputMode('ai');
  const keyword = String(item.keyword || '').trim();
  document.getElementById('quick-subject').value = keyword;
  document.getElementById('quick-keywords').value = keyword;
  document.getElementById('quick-instruction').value = '';
  document.getElementById('quick-reference-url').value = '';
  quickTrendTopicContext = {
    id: String(item.id || ''),
    subject: keyword,
    keyword,
    source: 'naver_trend',
    trendDate: String(item.latestTrendDate || '')
  };
  syncQuickTopicOrigin();
  document.getElementById('quick-subject')?.focus();
}

async function saveTrendPostingTopic(item, button) {
  if (!item || !button || button.disabled) return;
  const row = button.closest('tr');
  const feedbackEl = row?.querySelector('[data-trend-topic-save-feedback]');
  row?.classList.remove('trend-topic-save-success', 'trend-topic-save-error');
  button.disabled = true;
  button.textContent = '저장 중...';
  if (feedbackEl) {
    feedbackEl.className = 'trend-topic-save-feedback is-pending';
    feedbackEl.textContent = 'Google Spreadsheet에 저장하는 중...';
  }
  try {
    await postJson('/api/v1/trend-posting/topics', {
      keyword: item.keyword,
      trendDate: item.latestTrendDate
    });
    trendPostingState.savedIds.add(`${String(item.id)}:${String(item.latestTrendDate || '')}`);
    const savedKey = String(item.keyword || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
    if (savedKey) trendPostingState.recentTopicKeys.add(savedKey);
    button.textContent = '저장됨';
    row?.classList.add('trend-topic-save-success');
    if (feedbackEl) {
      feedbackEl.className = 'trend-topic-save-feedback is-success';
      feedbackEl.textContent = 'topics에 대기 상태로 저장됨';
    }
    const statusEl = document.getElementById('trend-posting-status');
    if (statusEl) statusEl.textContent = `“${item.keyword}” 글감을 대기 상태로 저장했습니다.`;
    if (document.getElementById('trend-posting-filter-exclude-recent')?.checked) {
      renderTrendPostingResults();
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = '다시 시도';
    row?.classList.add('trend-topic-save-error');
    if (feedbackEl) {
      feedbackEl.className = 'trend-topic-save-feedback is-error';
      feedbackEl.textContent = `저장 실패: ${error.message}`;
    }
    const statusEl = document.getElementById('trend-posting-status');
    if (statusEl) statusEl.textContent = `글감 저장에 실패했습니다: ${error.message}`;
  }
}

function setNaverCommentDraftResultText(message) {
  naverCommentDraftStatusText = String(message || '');
  const resultEl = document.getElementById('naver-comment-draft-result');
  if (resultEl) resultEl.textContent = naverCommentDraftStatusText;
}

function getNaverCommentDraftSettingsFromUi() {
  return {
    aiMode: (document.getElementById('naver-comment-draft-ai-mode')?.value || 'default').trim(),
    fetchLimit: parseInt(document.getElementById('naver-comment-draft-fetch-limit')?.value || '10', 10) || 10,
    tone: (document.getElementById('naver-comment-draft-tone')?.value || 'empathetic').trim(),
    maxChars: parseInt(document.getElementById('naver-comment-draft-max-chars')?.value || '60', 10) || 60,
    headless: Boolean(document.getElementById('naver-comment-draft-headless')?.checked)
  };
}

function renderNaverCommentDraftItems(items = []) {
  const listEl = document.getElementById('naver-comment-draft-list');
  if (!listEl) return;

  const safeItems = Array.isArray(items) ? items : [];
  naverCommentDraftItems = safeItems.map(item => ({ ...(item || {}) }));
  if (safeItems.length === 0) {
    listEl.innerHTML = '<p class="dash-feed-empty">조건에 맞는 후보 글이 없습니다.</p>';
    return;
  }

  listEl.innerHTML = safeItems.map((item, index) => {
    const drafts = Array.isArray(item?.drafts) ? item.drafts : [];
    const draftHtml = drafts.length > 0
      ? drafts.map((draft, draftIndex) => `
        <div class="comment-draft-item">
          <button class="secondary compact" type="button" data-comment-draft-copy="${index}:${draftIndex}">복사</button>
          <div class="comment-draft-item-text">${escapeHtml(draft)}</div>
        </div>
      `).join('')
      : `<div class="comment-draft-item"><div class="comment-draft-item-text">${escapeHtml(item?.error || '초안을 생성하지 못했습니다.')}</div></div>`;

    const chips = [
      item?.likedStateKnown ? (item?.liked ? '이미 공감한 글' : '공감 안 한 글') : '공감 여부 확인 불가',
      item?.postUrl ? '글 링크 확인됨' : '글 링크 없음'
    ];

    return `
      <article class="comment-draft-card" data-comment-draft-card="${index}">
        <div class="comment-draft-card-head">
          ${item?.thumbnailUrl ? `<div class="comment-draft-thumb"><img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('is-hidden'); this.remove();"></div>` : ''}
          <div>
            <div class="comment-draft-card-author">${escapeHtml(item?.authorName || '작성자 미상')}</div>
            <div class="comment-draft-card-title">${escapeHtml(item?.title || '제목 없음')}</div>
          </div>
        </div>
        <div class="comment-draft-chip-row">
          ${chips.map((chip) => `<span class="comment-draft-chip">${escapeHtml(chip)}</span>`).join('')}
        </div>
        <div class="comment-draft-card-excerpt">${escapeHtml(item?.excerpt || '본문 요약을 불러오지 못했습니다.')}</div>
        <div class="comment-draft-drafts">${draftHtml}</div>
        <div class="comment-draft-actions">
          <button class="secondary" type="button" data-comment-draft-redraft="${index}">다시 생성</button>
          ${(item?.commentUrl || item?.postUrl) ? `<a class="secondary" href="${escapeHtml(item.commentUrl || item.postUrl)}" target="_blank" rel="noopener noreferrer">글로 이동</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

async function loadNaverCommentDraftSettings() {
  const hadItems = Array.isArray(naverCommentDraftItems) && naverCommentDraftItems.length > 0;
  setNaverCommentDraftResultText(hadItems ? naverCommentDraftStatusText : '불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/blog/naver-comment-draft/settings');
    const settings = data?.settings || {};
    const aiModeEl = document.getElementById('naver-comment-draft-ai-mode');
    const fetchLimitEl = document.getElementById('naver-comment-draft-fetch-limit');
    const toneEl = document.getElementById('naver-comment-draft-tone');
    const maxCharsEl = document.getElementById('naver-comment-draft-max-chars');
    const headlessEl = document.getElementById('naver-comment-draft-headless');
    if (aiModeEl) aiModeEl.value = String(settings.aiMode || 'default');
    if (fetchLimitEl) fetchLimitEl.value = String(settings.fetchLimit || 10);
    if (toneEl) toneEl.value = String(settings.tone || 'empathetic');
    if (maxCharsEl) maxCharsEl.value = String(settings.maxChars || 60);
    if (headlessEl) headlessEl.checked = Boolean(settings.headless ?? true);
    if (hadItems) {
      renderNaverCommentDraftItems(naverCommentDraftItems);
      setNaverCommentDraftResultText(naverCommentDraftStatusText);
    } else {
      setNaverCommentDraftResultText('불러오기 완료');
    }
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  }
}

async function saveNaverCommentDraftSettings() {
  setNaverCommentDraftResultText('저장 중...');
  try {
    const payload = getNaverCommentDraftSettingsFromUi();
    await postJson('/api/v1/blog/naver-comment-draft/settings', payload);
    setNaverCommentDraftResultText('저장 완료');
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  }
}

async function runNaverCommentDraft() {
  const runBtn = document.getElementById('naver-comment-draft-run-btn');
  const saveBtn = document.getElementById('naver-comment-draft-save-btn');
  if (runBtn?.disabled) return;
  if (runBtn) runBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;
  setNaverCommentDraftResultText('후보 글을 수집하고 댓글 초안을 생성 중...');
  const listEl = document.getElementById('naver-comment-draft-list');
  if (listEl) listEl.innerHTML = '<p class="dash-feed-empty">실행 중...</p>';
  let progressPolling = true;
  let progressTimer = null;
  const pollProgress = async () => {
    if (!progressPolling) return;
    try {
      const data = await fetchJson('/api/v1/blog/naver-comment-draft/progress');
      if (progressPolling && data?.progress?.message) {
        setNaverCommentDraftResultText(data.progress.message);
      }
    } catch (_e) {
      // 실행 성공/실패는 본 요청으로 판정하며, 진행 상태 조회 실패는 현재 표시를 유지한다.
    }
    if (progressPolling) progressTimer = window.setTimeout(pollProgress, 1000);
  };
  progressTimer = window.setTimeout(pollProgress, 250);
  try {
    const payload = getNaverCommentDraftSettingsFromUi();
    const data = await postJson('/api/v1/blog/naver-comment-draft/run', payload);
    renderNaverCommentDraftItems(data?.items || []);
    const summary = data?.summary || {};
    if (summary.status === 'no_candidates') {
      setNaverCommentDraftResultText('조건에 맞는 이웃새글 후보가 없습니다.');
    } else if (summary.status === 'rate_limited') {
      setNaverCommentDraftResultText(`AI 요청 한도로 실행을 중단했습니다. ${summary.successCount || 0}/${summary.candidateCount || 0}건 생성`);
    } else if (summary.status === 'draft_generation_failed') {
      setNaverCommentDraftResultText(`후보 ${summary.candidateCount || 0}건을 찾았지만 댓글 초안을 생성하지 못했습니다.`);
    } else if (summary.status === 'partial_success') {
      setNaverCommentDraftResultText(`일부 완료: ${summary.successCount || 0}건 생성, ${summary.failureCount || 0}건 실패`);
    } else {
      setNaverCommentDraftResultText(`완료: ${summary.successCount ?? (Array.isArray(data?.items) ? data.items.length : 0)}건의 댓글 초안을 생성했습니다.`);
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = '<p class="dash-feed-empty">실행 결과가 없습니다.</p>';
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  } finally {
    progressPolling = false;
    if (progressTimer) window.clearTimeout(progressTimer);
    if (runBtn) runBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function redraftNaverCommentDraft(itemIndex) {
  const item = naverCommentDraftItems[itemIndex];
  if (!item) return;
  const redraftBtn = document.querySelector(`[data-comment-draft-redraft="${itemIndex}"]`);
  if (redraftBtn?.disabled) return;
  if (redraftBtn) redraftBtn.disabled = true;
  const payload = {
    ...getNaverCommentDraftSettingsFromUi(),
    title: item.title || '',
    authorName: item.authorName || '',
    excerpt: item.excerpt || '',
    postUrl: item.postUrl || ''
  };

  setNaverCommentDraftResultText('초안을 다시 생성 중...');
  try {
    const data = await postJson('/api/v1/blog/naver-comment-draft/redraft', payload);
    const currentItems = naverCommentDraftItems.map((entry, index) => ({
      ...entry,
      drafts: index === itemIndex ? (Array.isArray(data?.drafts) ? data.drafts : []) : (Array.isArray(entry?.drafts) ? entry.drafts : [])
    }));
    renderNaverCommentDraftItems(currentItems);
    setNaverCommentDraftResultText('초안을 다시 생성했습니다.');
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  } finally {
    const currentRedraftBtn = document.querySelector(`[data-comment-draft-redraft="${itemIndex}"]`);
    if (currentRedraftBtn) currentRedraftBtn.disabled = false;
  }
}

function activateShoppingTab(tabName, options = {}) {
  const allowed = ['quick', 'batch', 'auto'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  shoppingActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.shopping-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.shopping-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.shoppingTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `shopping-tab-${target}`));
  syncScopedMajorSaveActions();

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'batch') {
    loadBlogShopping();
    return;
  }
  if (target === 'auto') {
    loadShoppingAutoSettings();
  }
}

function activateSettingsTab(tabName, options = {}) {
  const allowed = ['general', 'mcp', 'naver-blog', 'shopping-connect', 'sns', 'notification', 'ai'];
  const requested = allowed.includes(String(tabName)) ? String(tabName) : 'general';
  const target = requested === 'mcp' ? 'ai' : requested;
  settingsActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.settings-tab-btn[data-settings-tab]'));
  const tabPanels = Array.from(document.querySelectorAll('.settings-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.settingsTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `settings-tab-${target}`));
  if (target === 'naver-blog' && options.forceReload !== false) {
    void loadNaverSessionStatus();
  }
}

function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafePreviewHref(href) {
  const normalized = String(href || '').trim();
  return /^https?:\/\//i.test(normalized);
}

function renderInlinePreviewLinksHtml(input) {
  const source = String(input ?? '');
  if (!source) return '';

  const parts = [];
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\b(https?:\/\/[^\s<]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = markdownLinkPattern.exec(source)) !== null) {
    const [fullMatch, markdownLabel = '', markdownHref = '', bareHref = ''] = match;
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      parts.push(escapeHtml(source.slice(lastIndex, matchIndex)));
    }

    const href = markdownHref || bareHref;
    if (isSafePreviewHref(href)) {
      const label = markdownLabel || bareHref;
      parts.push(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      );
    } else {
      parts.push(escapeHtml(fullMatch));
    }
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < source.length) {
    parts.push(escapeHtml(source.slice(lastIndex)));
  }

  return parts.join('');
}

function renderInlinePreviewHtml(input, boldRanges = []) {
  const source = String(input ?? '');
  const ranges = Array.isArray(boldRanges)
    ? boldRanges
      .map((range) => ({
        start: Math.max(0, Number(range?.start) || 0),
        end: Math.min(source.length, Number(range?.end) || 0)
      }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start)
    : [];

  if (ranges.length === 0) return renderInlinePreviewLinksHtml(source);

  const parts = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    parts.push(renderInlinePreviewLinksHtml(source.slice(cursor, range.start)));
    parts.push(`<strong>${renderInlinePreviewLinksHtml(source.slice(range.start, range.end))}</strong>`);
    cursor = range.end;
  }
  parts.push(renderInlinePreviewLinksHtml(source.slice(cursor)));
  return parts.join('');
}

function normalizeCommaListText(input) {
  return String(input || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .join(', ');
}

function setLocalMarkdownPreviewDensity(panelEl, bodyEl, imageListEl, stats = {}) {
  if (!panelEl || !bodyEl) return;
  const contentCount = Number(stats?.contentCount || 0);
  const imageBlockCount = Number(stats?.imageBlockCount || 0);
  const imageResolvedCount = Number(stats?.imageResolvedCount || 0);
  const bodyHasRenderableContent = contentCount > 0 && !bodyEl.querySelector('.local-markdown-empty');
  const hasImages = imageBlockCount > 0 || imageResolvedCount > 0;

  panelEl.classList.toggle('is-expanded', bodyHasRenderableContent);
  panelEl.classList.toggle('is-compact', !bodyHasRenderableContent);

  const imageSection = imageListEl?.closest('.local-markdown-preview-section');
  if (imageSection) {
    imageSection.classList.toggle('is-hidden', !hasImages);
  }
}

function renderDashboardAutoSchedule() {
  const blog = dashboardAutoScheduleState.blog;
  const shopping = dashboardAutoScheduleState.shopping;

  const setAutoScheduleUI = (prefix, data) => {
    const dateEl = document.getElementById(`dash-auto-${prefix}-next-date`);
    const relEl = document.getElementById(`dash-auto-${prefix}-next-relative`);

    const isWithinTimeRange = (timeStr, start, end) => {
      if (!start || !end) return true;
      if (!timeStr || timeStr === '-') return true;
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return true;
      const mins = date.getHours() * 60 + date.getMinutes();
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      const sMin = sH * 60 + sM;
      const eMin = eH * 60 + eM;
      if (sMin <= eMin) return mins >= sMin && mins <= eMin;
      return mins >= sMin || mins <= eMin;
    };

    if (!data.enabled || !data.nextRunAt || data.nextRunAt === '-') {
      if (dateEl) dateEl.textContent = '-';
      if (relEl) relEl.textContent = '';
    } else {
      const isAllowed = isWithinTimeRange(data.nextRunAt, data.startTime, data.endTime);
      if (data.status === 'waiting_time_window' || !isAllowed) {
        if (dateEl) dateEl.textContent = `허용 대기중 (${data.startTime || '00:00'}~${data.endTime || '23:59'})`;
        if (relEl) relEl.textContent = '';
      } else {
        if (dateEl) dateEl.textContent = formatDateTimeAbsolute(data.nextRunAt);
        if (relEl) relEl.textContent = formatNextRunText(data.nextRunAt);
      }
    }
  };

  setAutoScheduleUI('blog', blog);
  setAutoScheduleUI('shopping', shopping);
}

function formatDashboardFeedDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function truncateText(value, maxLen = 120) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`;
}

function renderDashboardFeedList(containerId, source) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = (Array.isArray(source?.items) ? source.items : []).slice(0, 3);
  if (!items.length) {
    const message = source?.error ? `불러오기 실패: ${escapeHtml(source.error)}` : '콘텐츠가 없습니다.';
    container.innerHTML = `<p class="dash-feed-empty">${message}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const link = String(item?.link || source?.homeUrl || '').trim();
    const title = escapeHtml(item?.title || '(제목 없음)');
    const summary = escapeHtml(truncateText(item?.summary || '', 140));
    const published = escapeHtml(formatDashboardFeedDate(item?.publishedAt || ''));
    const thumbnail = String(item?.thumbnail || '').trim();
    const thumbHtml = thumbnail
      ? `<div class="dash-feed-thumb"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '';
    const metaHtml = published ? `<div class="dash-feed-meta">${published}</div>` : '';
    const summaryHtml = summary ? `<div class="dash-feed-summary">${summary}</div>` : '';
    return `
      <a class="dash-feed-item" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        ${thumbHtml}
        <div class="dash-feed-body">
          <div class="dash-feed-title">${title}</div>
          ${metaHtml}
          ${summaryHtml}
        </div>
      </a>
    `;
  }).join('');
}

function renderDashboardShortsList(containerId, source) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const items = (Array.isArray(source?.items) ? source.items : []).slice(0, 3);
  if (!items.length) {
    const message = source?.error ? `불러오기 실패: ${escapeHtml(source.error)}` : '콘텐츠가 없습니다.';
    container.innerHTML = `<p class="dash-feed-empty">${message}</p>`;
    syncDashboardBottomColumnHeights();
    return;
  }

  container.innerHTML = items.map((item) => {
    const link = String(item?.link || source?.homeUrl || '').trim();
    const title = escapeHtml(item?.title || '(제목 없음)');
    const summary = escapeHtml(truncateText(item?.summary || '', 96));
    const published = escapeHtml(formatDashboardFeedDate(item?.publishedAt || ''));
    const thumbnail = String(item?.thumbnail || '').trim();
    const thumbHtml = thumbnail
      ? `<div class="dash-shorts-thumb"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '<div class="dash-shorts-thumb dash-shorts-thumb-empty">▶</div>';
    const publishedHtml = published ? `<div class="dash-shorts-meta">${published}</div>` : '';
    const summaryHtml = summary ? `<div class="dash-shorts-summary">${summary}</div>` : '';
    return `
      <a class="dash-shorts-item" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        ${thumbHtml}
        <div class="dash-shorts-body">
          <div class="dash-shorts-title">${title}</div>
          ${publishedHtml}
          ${summaryHtml}
        </div>
      </a>
    `;
  }).join('');
  syncDashboardBottomColumnHeights();
}

function syncDashboardBottomColumnHeights() {
  const timeline = document.getElementById('activity-timeline');
  const shorts = document.getElementById('dash-smart-feed-youtube');
  if (!timeline || !shorts) return;

  if (window.innerWidth <= 1100) {
    timeline.style.maxHeight = '';
    shorts.style.maxHeight = '';
    return;
  }

  window.requestAnimationFrame(() => {
    const shortsItems = shorts.querySelectorAll('.dash-shorts-item');
    if (!shortsItems.length) {
      timeline.style.maxHeight = '';
      shorts.style.maxHeight = '';
      return;
    }

    const nextHeight = `${Math.max(320, Math.min(560, shorts.scrollHeight))}px`;
    timeline.style.maxHeight = nextHeight;
    shorts.style.maxHeight = nextHeight;
  });
}

window.addEventListener('resize', syncDashboardBottomColumnHeights);

async function loadDashboardExternalContent(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;
  const now = Date.now();
  if (!force && dashboardExternalContentLastLoadedAt > 0) {
    const elapsed = now - dashboardExternalContentLastLoadedAt;
    if (elapsed < DASHBOARD_EXTERNAL_CONTENT_REFRESH_MS) return;
  }

  try {
    const data = await fetchJson('/api/v1/dashboard/external-content?limit=6');
    const sourceMap = {};
    for (const source of (data?.sources || [])) {
      sourceMap[String(source?.key || '').trim()] = source;
    }
    renderDashboardFeedList('dash-feed-list-naver', sourceMap.naver || {});
    renderDashboardFeedList('dash-feed-list-wordpress', sourceMap.wordpress || {});
    renderDashboardFeedList('dash-feed-list-itmania', sourceMap.itmania || {});

    // Smart Feed (YouTube RSS -> Instagram Widget Fallback)
    const smart = sourceMap.smart || {};
    const smartTitle = document.getElementById('dash-smart-feed-title');
    const smartLink = document.getElementById('dash-smart-feed-link');
    const smartStatus = document.getElementById('dash-smart-feed-status');
    const smartYoutube = document.getElementById('dash-smart-feed-youtube');
    const smartInstagram = document.getElementById('dash-smart-feed-instagram');

    if (smartStatus) smartStatus.style.display = 'none';

    if (smart && Array.isArray(smart.items) && smart.items.length > 0) {
      // YouTube Win
      if (smartTitle) smartTitle.textContent = '유튜브 최신 영상';
      if (smartLink) smartLink.href = String(smart.homeUrl || 'https://www.youtube.com/channel/UC4Sl4m-ZV65knmWTl0UFYkw');
      if (smartLink) smartLink.textContent = '채널 이동';

      if (smartYoutube) {
        smartYoutube.style.display = 'flex';
        renderDashboardShortsList('dash-smart-feed-youtube', smart);
      }
      if (smartInstagram) smartInstagram.style.display = 'none';
    } else {
      // Instagram Fallback
      if (smartTitle) smartTitle.textContent = '인스타그램 릴스';
      if (smartLink) smartLink.href = 'https://www.instagram.com/amadejjs/reels/';
      if (smartLink) smartLink.textContent = '프로필 이동';

      if (smartYoutube) smartYoutube.style.display = 'none';
      if (smartInstagram) smartInstagram.style.display = 'block';
    }

    const setHomeLink = (id, source) => {
      const el = document.getElementById(id);
      if (!el) return;
      const next = String(source?.homeUrl || '').trim();
      if (next) el.href = next;
    };
    setHomeLink('dash-feed-home-naver', sourceMap.naver || {});
    setHomeLink('dash-feed-home-wordpress', sourceMap.wordpress || {});
    setHomeLink('dash-feed-home-itmania', sourceMap.itmania || {});
    // setHomeLink('dash-feed-home-instagram-reels', sourceMap.instagramReels || {});

    dashboardExternalContentLastLoadedAt = Date.now();
    syncDashboardBottomColumnHeights();
  } catch (e) {
    const errMsg = String(e?.message || '콘텐츠를 불러오지 못했습니다.');
    if (!silent) {
      console.warn('[Dashboard External Content]', errMsg);
    }
    const fallback = { error: errMsg };
    renderDashboardFeedList('dash-feed-list-naver', fallback);
    renderDashboardFeedList('dash-feed-list-wordpress', fallback);
    renderDashboardFeedList('dash-feed-list-noworry', fallback);
    // renderDashboardShortsList('dash-feed-list-instagram-reels', fallback);
  }
}

let isDashboardLoading = false;
let lastDashboardLoadTime = 0;

let isAccountOverviewLoading = false;
let lastAccountOverview = null;

function formatAccountDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function setAccountMetaItem(elementId, label, value) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const formatted = formatAccountDate(value);
  element.textContent = `${label} ${formatted}`;
  element.classList.toggle('hidden', formatted === '-');
}

function setAccountMetaText(elementId, text, visible = true) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = String(text || '').trim();
  element.classList.toggle('hidden', !visible || !element.textContent);
}

function getAccountAction(overview, actionId) {
  const actions = Array.isArray(overview?.actions) ? overview.actions : [];
  return actions.find((item) => String(item?.id || '') === actionId) || null;
}

function renderAccountConnection(elementId, connection) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const status = String(connection?.status || 'unknown');
  const connected = status === 'connected' || status === 'configured';
  element.textContent = connected ? '연결됨' : (status === 'not_configured' ? '미설정' : '로그인 필요');
  element.className = connected ? 'state-ok' : (status === 'not_configured' ? 'state-muted' : 'state-warning');
}

function renderAccountOverview(overview) {
  lastAccountOverview = overview;
  const subscription = overview?.subscription || {};
  const usage = overview?.usage || {};
  const device = overview?.device || {};
  const identity = overview?.identity || {};

  const planName = String(subscription.plan_name || subscription.plan_code || '-').trim() || '-';
  const normalizedPlanCode = String(subscription.plan_code || '').trim().toLowerCase();
  const status = String(subscription.status || 'unavailable').trim();
  const statusLabels = {
    active: '활성',
    quota_exhausted: '사용량 소진',
    unavailable: '확인 필요'
  };
  const statusClass = status === 'active' ? 'active' : (status === 'quota_exhausted' ? 'warning' : 'error');

  setText('account-plan-name', planName);
  const statusEl = document.getElementById('account-plan-status');
  if (statusEl) {
    statusEl.textContent = statusLabels[status] || status;
    statusEl.className = `account-status-badge ${statusClass}`;
  }

  const unlimited = usage.mode === 'unlimited' || Number(usage.limit) < 0 || Number(usage.remaining) < 0;
  const used = Number.isFinite(Number(usage.used)) ? Number(usage.used) : null;
  const limit = Number.isFinite(Number(usage.limit)) ? Number(usage.limit) : null;
  const remaining = Number.isFinite(Number(usage.remaining)) ? Number(usage.remaining) : null;
  const quotaCycle = String(usage.cycle || '').trim().toLowerCase();
  const usageLabel = quotaCycle === 'monthly'
    ? '이번 달 사용량'
    : (quotaCycle === 'none' && normalizedPlanCode === 'test' ? '체험 사용량' : '사용량');
  const planCycleHelpEl = document.getElementById('account-plan-cycle-help');
  if (planCycleHelpEl) {
    const showCycleHelp = quotaCycle === 'monthly';
    planCycleHelpEl.classList.toggle('hidden', !showCycleHelp);
    const cycleHelpText = normalizedPlanCode === 'free'
      ? 'Free Plan은 매월 1일 갱신됩니다.'
      : '월 기본 제공량은 매월 1일 갱신됩니다.';
    planCycleHelpEl.dataset.tooltip = cycleHelpText;
    planCycleHelpEl.setAttribute('aria-label', cycleHelpText);
  }
  setText('account-usage-used-label', usageLabel);
  setText('account-usage-used', unlimited ? '제한 없음' : (used == null || limit == null ? '-' : `${used} / ${limit}회`));
  setText('account-usage-remaining', unlimited ? '무제한' : (remaining == null ? '-' : `${remaining}회`));

  const creditBalance = Number.isFinite(Number(usage.credit_balance)) ? Math.max(0, Number(usage.credit_balance)) : 0;
  const totalAvailable = Number.isFinite(Number(usage.total_available)) ? Number(usage.total_available) : null;
  setText('account-credit-balance', `${creditBalance}회`);
  setText('account-total-available', unlimited ? '무제한' : (totalAvailable == null ? '-' : `${Math.max(0, totalAvailable)}회`));
  const basicAvailableLabel = unlimited ? '무제한' : (remaining == null ? '-' : `${Math.max(0, remaining)}회`);
  const creditAvailableLabel = `${creditBalance}회`;
  setText('account-total-breakdown', unlimited
    ? '현재 플랜에서 발행 횟수 제한 없이 사용할 수 있습니다.'
    : `기본 제공량 ${basicAvailableLabel} + 크레딧 ${creditAvailableLabel}`);
  const creditHelpEl = document.getElementById('account-credit-help');
  if (creditHelpEl) {
    const creditHelpText = quotaCycle === 'monthly'
      ? '기본 제공량 소진 후 충전 크레딧이 사용됩니다.'
      : '충전 크레딧은 현재 플랜 권한 안에서 사용할 수 있는 추가 발행 횟수입니다.';
    creditHelpEl.dataset.tooltip = creditHelpText;
    creditHelpEl.setAttribute('aria-label', creditHelpText);
  }

  setText('account-license-created', `라이선스 생성일: ${formatAccountDate(subscription.created_at)}`);
  if (quotaCycle === 'monthly') {
    setAccountMetaText('account-period-start', '', false);
    setAccountMetaText('account-next-reset', '', false);
  } else {
    setAccountMetaItem('account-period-start', '사용 시작일', usage.current_period_start_at);
    setAccountMetaItem('account-next-reset', '다음 갱신일', usage.resets_at);
  }

  const upgradeFreeAction = getAccountAction(overview, 'upgrade_free');
  const guidanceEl = document.getElementById('account-plan-guidance');
  const guidanceTitleEl = document.getElementById('account-plan-guidance-title');
  const guidanceMessageEl = document.getElementById('account-plan-guidance-message');
  const upgradeFreeBtn = document.getElementById('account-upgrade-free-btn');
  const shouldShowFreeUpgrade = normalizedPlanCode === 'test'
    && status === 'quota_exhausted'
    && upgradeFreeAction?.enabled === true;
  if (guidanceEl) {
    guidanceEl.classList.toggle('hidden', !shouldShowFreeUpgrade);
  }
  if (guidanceTitleEl) {
    guidanceTitleEl.textContent = shouldShowFreeUpgrade ? 'Tester Plan 사용량을 모두 사용했습니다' : '';
  }
  if (guidanceMessageEl) {
    guidanceMessageEl.textContent = shouldShowFreeUpgrade
      ? 'Free Plan은 자동으로 전환되지 않습니다. 이메일 인증 후 월간 무료 발행 횟수로 계속 사용할 수 있습니다.'
      : '';
  }
  if (upgradeFreeBtn) {
    upgradeFreeBtn.textContent = shouldShowFreeUpgrade ? (upgradeFreeAction?.label || 'Free Plan으로 전환') : '';
    upgradeFreeBtn.disabled = !shouldShowFreeUpgrade;
    upgradeFreeBtn.title = upgradeFreeAction?.reason || '';
  }

  const changePlanAction = getAccountAction(overview, 'change_plan') || getAccountAction(overview, 'upgrade');
  const changePlanButton = document.getElementById('account-change-plan-btn');
  if (changePlanButton) {
    changePlanButton.textContent = changePlanAction?.label || '구독 / 플랜 변경';
    changePlanButton.disabled = changePlanAction?.enabled !== true;
    changePlanButton.title = changePlanAction?.reason || '';
  }
  const purchaseCreditsAction = getAccountAction(overview, 'purchase_credits');
  const purchaseCreditsButton = document.getElementById('account-purchase-credits-btn');
  if (purchaseCreditsButton) {
    purchaseCreditsButton.textContent = purchaseCreditsAction?.label || '크레딧 충전';
    purchaseCreditsButton.disabled = purchaseCreditsAction?.enabled !== true || unlimited;
    purchaseCreditsButton.title = unlimited
      ? '무제한 플랜에서는 크레딧 충전이 필요하지 않습니다.'
      : (purchaseCreditsAction?.reason || '');
  }

  setText('account-identity-label', identity.label || '기기 라이선스로 사용 중');
  setText('account-identity-detail', identity.email_verified && (identity.email_masked || identity.email)
    ? `${identity.email_masked || identity.email}\n${identity.purpose || '라이선스 복구와 플랜 관리에 사용됩니다.'}`
    : '로그인 없이 현재 기기에 연결된 라이선스를 사용합니다.');
  const registerAction = getAccountAction(overview, 'register_email');
  const registerButton = document.getElementById('account-register-email-btn');
  if (registerButton) {
    registerButton.textContent = registerAction?.label || '계정 연결 준비 중';
    registerButton.disabled = registerAction?.enabled !== true;
    registerButton.title = registerAction?.reason || '';
  }

  const platformLabels = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
  setText('account-device-platform', `${platformLabels[device.platform] || device.platform || '-'}${device.os_release ? ` ${device.os_release}` : ''}`);
  setText('account-device-arch', device.arch || '-');
  setText('account-device-hw-id', device.hw_id || '-');
  setText('account-device-app-version', device.app_version ? `v${device.app_version}` : '-');

  const featureList = document.getElementById('account-feature-list');
  if (featureList) {
    featureList.innerHTML = '';
    const items = Array.isArray(overview?.capabilities?.items) ? overview.capabilities.items : [];
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = '플랜 기능 정보가 없습니다.';
      featureList.appendChild(empty);
    } else {
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'account-state-row';
        const label = document.createElement('span');
        label.textContent = item.label || item.id;
        const value = document.createElement('strong');
        value.textContent = item.enabled ? '사용 가능' : '제한됨';
        value.className = item.enabled ? 'state-ok' : 'state-muted';
        row.append(label, value);
        featureList.appendChild(row);
      });
    }
  }

  renderAccountConnection('account-connection-naver', overview?.connections?.naver);
  renderAccountConnection('account-connection-google', overview?.connections?.google_sheets);
  renderAccountConnection('account-connection-wordpress', overview?.connections?.wordpress);
}

function isValidAccountEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || '').trim());
}

async function runLicenseEmailVerification({ email, title = '이메일 인증', button = null } = {}) {
  const normalizedEmail = String(email || '').trim();
  if (!isValidAccountEmail(normalizedEmail)) {
    await showUiPopup('유효한 이메일 주소를 입력해 주세요.');
    return null;
  }

  if (button) {
    button.disabled = true;
    button.textContent = '인증 요청 중...';
  }

  const requestResult = await postJson('/api/v1/license/registration/request', {
    email: normalizedEmail
  });
  const code = await showUiPrompt(`${requestResult?.message || '인증 코드가 발송되었습니다.'}\n메일로 받은 6자리 인증 코드를 입력해 주세요.`, {
    title,
    type: 'text',
    placeholder: '123456',
    confirmText: '인증',
    cancelText: '취소'
  });
  if (code == null) {
    await loadAccountOverview({ force: true }).catch(() => {});
    return null;
  }

  const normalizedCode = String(code || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    await showUiPopup('6자리 인증 코드를 입력해 주세요.');
    await loadAccountOverview({ force: true }).catch(() => {});
    return null;
  }

  if (button) {
    button.disabled = true;
    button.textContent = '인증 확인 중...';
  }

  await postJson('/api/v1/license/registration/verify', {
    email: normalizedEmail,
    code: normalizedCode
  });

  return normalizedEmail;
}

async function loadAccountOverview({ force = false } = {}) {
  const loadingEl = document.getElementById('account-overview-loading');
  const errorEl = document.getElementById('account-overview-error');
  const contentEl = document.getElementById('account-overview-content');

  if (isAccountOverviewLoading) return lastAccountOverview;
  if (!force && lastAccountOverview) {
    renderAccountOverview(lastAccountOverview);
    loadingEl?.classList.add('hidden');
    errorEl?.classList.add('hidden');
    contentEl?.classList.remove('hidden');
    return lastAccountOverview;
  }

  isAccountOverviewLoading = true;
  loadingEl?.classList.remove('hidden');
  errorEl?.classList.add('hidden');
  contentEl?.classList.add('hidden');

  try {
    const overview = await fetchJson(`/api/v1/account/overview?quiet=1${force ? '&force=1' : ''}`);
    renderAccountOverview(overview);
    loadingEl?.classList.add('hidden');
    contentEl?.classList.remove('hidden');
    return overview;
  } catch (error) {
    loadingEl?.classList.add('hidden');
    errorEl?.classList.remove('hidden');
    setText('account-overview-error-message', error.message || '잠시 후 다시 시도해 주세요.');
    throw error;
  } finally {
    isAccountOverviewLoading = false;
  }
}

async function upgradeAccountToFreePlan() {
  const action = getAccountAction(lastAccountOverview, 'upgrade_free');
  if (action?.enabled !== true) {
    await showUiPopup(action?.reason || '현재 Free Plan으로 전환할 수 없습니다.');
    return;
  }

  const email = await showUiPrompt('Free Plan 전환에 사용할 이메일을 입력해 주세요.\n인증 코드를 보내고, 확인 후 Free Plan으로 전환합니다.', {
    title: 'Free Plan 전환',
    type: 'email',
    placeholder: 'you@example.com',
    confirmText: '인증 코드 받기',
    cancelText: '취소'
  });
  if (email == null) return;
  const normalizedEmail = String(email || '').trim();
  if (!isValidAccountEmail(normalizedEmail)) {
    await showUiPopup('유효한 이메일 주소를 입력해 주세요.');
    return;
  }

  const button = document.getElementById('account-upgrade-free-btn');
  try {
    const verifiedEmail = await runLicenseEmailVerification({
      email: normalizedEmail,
      title: '이메일 인증',
      button
    });
    if (!verifiedEmail) return;

    if (button) {
      button.disabled = true;
      button.textContent = '전환 중...';
    }
    const result = await postJson('/api/v1/license/upgrade', {
      targetPlan: 'free',
      email: verifiedEmail
    });
    await showUiPopup(result?.message || 'Free Plan으로 전환되었습니다.');
    lastAccountOverview = null;
    await loadAccountOverview({ force: true });
    await loadDashboard();
  } catch (error) {
    await showUiPopup(`전환 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`);
    await loadAccountOverview({ force: true }).catch(() => {});
  }
}

async function registerOrChangeAccountEmail() {
  const action = getAccountAction(lastAccountOverview, 'register_email');
  if (action?.enabled !== true) {
    await showUiPopup(action?.reason || '현재 이메일을 등록할 수 없습니다.');
    return;
  }

  const isChange = action.mode === 'change' || Boolean(lastAccountOverview?.identity?.email_verified);
  const currentEmail = String(lastAccountOverview?.identity?.email_masked || '').trim();
  const email = await showUiPrompt(
    isChange
      ? `새 이메일을 입력해 주세요.\n현재 연결: ${currentEmail || '-'}\n새 이메일 인증 후 라이선스 복구 이메일이 변경됩니다.`
      : '라이선스 복구와 플랜 관리에 사용할 이메일을 입력해 주세요.\n인증 코드를 보내고, 확인 후 현재 라이선스에 연결합니다.',
    {
      title: isChange ? '이메일 변경' : '이메일 등록',
      type: 'email',
      placeholder: 'you@example.com',
      confirmText: '인증 코드 받기',
      cancelText: '취소'
    }
  );
  if (email == null) return;

  const button = document.getElementById('account-register-email-btn');
  try {
    const verifiedEmail = await runLicenseEmailVerification({
      email,
      title: isChange ? '이메일 변경 인증' : '이메일 등록 인증',
      button
    });
    if (!verifiedEmail) return;

    await showUiPopup(isChange ? '이메일이 변경되었습니다.' : '이메일이 등록되었습니다.');
    lastAccountOverview = null;
    await loadAccountOverview({ force: true });
    await loadDashboard();
  } catch (error) {
    await showUiPopup(`이메일 처리 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`);
    await loadAccountOverview({ force: true }).catch(() => {});
  }
}

function showAccountPlanInfo() {
  return showUiDialog({
    title: '플랜 안내',
    message: [
      'Free',
      '- 월 기본 발행 횟수',
      '- 기본 블로그 발행',
      '',
      'Pro',
      '- 더 많은 월 기본 발행 횟수',
      '- 트렌드, 쇼핑, 연관글 등 고급 기능',
      '',
      'Ultra',
      '- 가장 높은 사용량',
      '- 상위 기능',
      '',
      '크레딧',
      '- 현재 플랜 권한 안에서 사용하는 추가 발행 횟수',
      '- 만료 없음',
      '- 환불 불가',
      '',
      '구독은 기능과 월 기본 횟수를 바꾸고, 크레딧은 현재 플랜 안에서 발행 횟수만 늘립니다.'
    ].join('\n'),
    showCancel: false,
    confirmText: '확인'
  });
}

let accountUpgradeFreeClickBound = false;
function bindAccountUpgradeFreeClick() {
  if (accountUpgradeFreeClickBound || typeof document === 'undefined') return;
  accountUpgradeFreeClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-upgrade-free-btn');
    if (!button) return;
    event.preventDefault();
    upgradeAccountToFreePlan().catch((error) => console.warn('[Account Upgrade Free]', error.message));
  });
}

bindAccountUpgradeFreeClick();

let accountEmailClickBound = false;
function bindAccountEmailClick() {
  if (accountEmailClickBound || typeof document === 'undefined') return;
  accountEmailClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-register-email-btn');
    if (!button) return;
    event.preventDefault();
    registerOrChangeAccountEmail().catch((error) => console.warn('[Account Email]', error.message));
  });
}

bindAccountEmailClick();

let accountPlanInfoClickBound = false;
function bindAccountPlanInfoClick() {
  if (accountPlanInfoClickBound || typeof document === 'undefined') return;
  accountPlanInfoClickBound = true;
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#account-plan-info-btn');
    if (!button) return;
    event.preventDefault();
    showAccountPlanInfo().catch((error) => console.warn('[Account Plan Info]', error.message));
  });
}

bindAccountPlanInfoClick();

async function loadDashboard() {
  if (isDashboardLoading || (Date.now() - lastDashboardLoadTime < 5000)) {
    return; // Throttle: prevent concurrent or overly frequent calls (5s cooldown)
  }
  isDashboardLoading = true;

  const quietCatch = (e) => {
    if (e.status === 503 || String(e.message).includes('fetch failed')) return null;
    console.warn('[Dashboard Polling]', e.message);
    return null;
  };

  let healthResult, accountResult, summaryResult, autoResult;
  try {
    [healthResult, accountResult, summaryResult, autoResult] = await Promise.allSettled([
      fetchJson('/api/v1/health').catch(quietCatch),
      fetchJson('/api/v1/account/overview?quiet=1').catch(quietCatch),
      fetchJson('/api/v1/dashboard/summary').catch(quietCatch),
      fetchJson('/api/v1/auto/status').catch(quietCatch)
    ]);
    lastDashboardLoadTime = Date.now();
  } finally {
    isDashboardLoading = false;
  }

  const healthOk = healthResult.status === 'fulfilled';
  const accountOk = accountResult.status === 'fulfilled' && Boolean(accountResult.value);
  const licenseOk = accountOk;
  const sessionOk = accountOk;
  const summaryOk = summaryResult.status === 'fulfilled';
  const autoOk = autoResult.status === 'fulfilled';

  const health = healthOk ? healthResult.value : null;
  const accountOverview = accountOk ? accountResult.value : null;
  const license = accountOverview ? {
    planCode: accountOverview.subscription?.plan_code,
    planName: accountOverview.subscription?.plan_name,
    remaining: accountOverview.usage?.remaining
  } : null;
  const naverConnection = accountOverview?.connections?.naver || null;
  const session = naverConnection ? {
    valid: naverConnection.status === 'connected',
    reason: naverConnection.reason || '',
    message: naverConnection.message || ''
  } : null;
  const summary = summaryOk ? summaryResult.value : null;
  const auto = autoOk ? autoResult.value : null;

  // Update Badges
  const healthBadge = document.getElementById('badge-health');
  if (healthBadge) {
    if (healthOk && health) {
      healthBadge.textContent = 'Health: OK';
      healthBadge.style.background = '#dcfce7'; healthBadge.style.color = '#166534';

      const versionBadge = document.getElementById('badge-version');
      if (versionBadge && health.version) {
        versionBadge.textContent = `v${health.version}`;
        syncFooterVersion(health.version);
      }
      const settingsVersionDisplay = document.getElementById('settings-current-version-display');
      if (settingsVersionDisplay && health.version) {
        settingsVersionDisplay.textContent = `v${health.version}`;
      }
    } else {
      healthBadge.textContent = 'Health: Error';
      healthBadge.style.background = '#fee2e2'; healthBadge.style.color = '#991b1b';
    }
    healthBadge.style.cursor = 'pointer';
    if (!healthBadge._navBound) {
      healthBadge._navBound = true;
      healthBadge.addEventListener('click', () => void navigateTo('settings', 'general'));
    }
  }

  const sessionBadge = document.getElementById('badge-session');
  if (sessionBadge) {
    if (sessionOk && session && session.valid) {
      sessionBadge.textContent = 'Naver: 로그인';
      sessionBadge.style.background = '#dbeafe'; sessionBadge.style.color = '#1e3a8a';
    } else {
      sessionBadge.textContent = 'Naver: 로그인 필요';
      sessionBadge.style.background = '#fef3c7'; sessionBadge.style.color = '#92400e';
    }
    sessionBadge.style.cursor = 'pointer';
    if (!sessionBadge._navBound) {
      sessionBadge._navBound = true;
      sessionBadge.addEventListener('click', () => void navigateTo('settings', 'naver-blog'));
    }
  }
  if (sessionOk && session) {
    const sessionStateKey = session.valid
      ? 'valid'
      : `invalid:${String(session.reason || 'unknown').trim().toLowerCase() || 'unknown'}`;
    notifyUiIssueFromStateTransition(
      'naver-session',
      sessionStateKey,
      'NAVER_SESSION_INVALID',
      { code: 'NAVER_SESSION_INVALID', message: session.message || '', reason: session.reason || '' },
      { source: 'dashboard-session-status', reason: session.reason || '' }
    );
  }

  const licenseBadge = document.getElementById('badge-license');
  if (licenseBadge) {
    if (licenseOk && license) {
      const rawPlanName = String(license.planName || license.planCode || '').trim();
      const compactPlanName = rawPlanName.replace(/\s+plan$/i, '').trim() || rawPlanName || '-';
      licenseBadge.textContent = `Plan: ${compactPlanName} (잔여 ${license.remaining})`;
      licenseBadge.style.background = '#f3e8ff'; licenseBadge.style.color = '#6b21a8';
    } else {
      licenseBadge.textContent = 'Plan: 확인불가';
      licenseBadge.style.background = '#fee2e2'; licenseBadge.style.color = '#991b1b';
    }
    licenseBadge.style.cursor = 'pointer';
    if (!licenseBadge._navBound) {
      licenseBadge._navBound = true;
      licenseBadge.addEventListener('click', () => void navigateTo('account'));
    }
  }

  if (accountOverview) {
    lastAccountOverview = accountOverview;
    renderAccountOverview(accountOverview);
  }

  // Update Summary Stats
  if (summaryOk && summary) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    setText('stat-blog-weekly', summary.blogWeeklyCount ?? 0);
    setText('stat-shop-weekly', summary.shoppingWeeklyCount ?? 0);
    setText('stat-topic-pending', summary.pendingTopicsCount ?? 0);
    setText('stat-trend-pending', summary.pendingTrendsCount ?? 0);
    setText('stat-trend-recent-date', summary.recentTrendsFetched || '-');
    setText('stat-blog-today', summary.blogTodayCount ?? 0);
    setText('stat-blog-yesterday', summary.blogYesterdayCount ?? 0);
    setText('stat-shop-today', summary.shoppingTodayCount ?? 0);
    setText('stat-shop-yesterday', summary.shoppingYesterdayCount ?? 0);
    setText('stat-blog-today-date', formatYmd(today));
    setText('stat-shop-today-date', formatYmd(today));
    setText('stat-blog-yesterday-date', formatYmd(yesterday));
    setText('stat-shop-yesterday-date', formatYmd(yesterday));
  } else {
    setText('stat-blog-weekly', '-');
    setText('stat-shop-weekly', '-');
    setText('stat-topic-pending', '-');
    setText('stat-trend-pending', '-');
    setText('stat-trend-recent-date', '-');
    setText('stat-blog-today', '-');
    setText('stat-blog-yesterday', '-');
    setText('stat-shop-today', '-');
    setText('stat-shop-yesterday', '-');
    setText('stat-blog-today-date', '-');
    setText('stat-shop-today-date', '-');
    setText('stat-blog-yesterday-date', '-');
    setText('stat-shop-yesterday-date', '-');
  }

  // Auto status cards
  const blogAutoEnabled = Boolean(auto?.blog?.enabled);
  const shopAutoEnabled = Boolean(auto?.shopping?.enabled);
  dashboardAutoScheduleState.blog.enabled = blogAutoEnabled;
  dashboardAutoScheduleState.blog.nextRunAt = String(auto?.blog?.nextRunAt || '').trim();
  dashboardAutoScheduleState.blog.status = auto?.blog?.status;
  dashboardAutoScheduleState.blog.startTime = auto?.blog?.settings?.PUBLISH_AUTO_START_TIME;
  dashboardAutoScheduleState.blog.endTime = auto?.blog?.settings?.PUBLISH_AUTO_END_TIME;

  dashboardAutoScheduleState.shopping.enabled = shopAutoEnabled;
  dashboardAutoScheduleState.shopping.nextRunAt = String(auto?.shopping?.nextRunAt || '').trim();
  dashboardAutoScheduleState.shopping.status = auto?.shopping?.status;
  dashboardAutoScheduleState.shopping.startTime = auto?.shopping?.settings?.SHOPPING_PUBLISH_AUTO_START_TIME;
  dashboardAutoScheduleState.shopping.endTime = auto?.shopping?.settings?.SHOPPING_PUBLISH_AUTO_END_TIME;

  setText('dash-auto-blog-enabled', blogAutoEnabled ? 'ON' : 'OFF');
  setText('dash-auto-shopping-enabled', shopAutoEnabled ? 'ON' : 'OFF');
  renderDashboardAutoSchedule();

  const blogCard = document.getElementById('dash-auto-blog-card');
  const blogStateChip = document.getElementById('dash-auto-blog-enabled');
  if (blogStateChip) {
    blogStateChip.classList.toggle('on', blogAutoEnabled);
    blogStateChip.classList.toggle('off', !blogAutoEnabled);
  }
  if (blogCard) {
    blogCard.classList.toggle('is-on', blogAutoEnabled);
    blogCard.classList.toggle('is-off', !blogAutoEnabled);
  }
  if (blogCard && !blogCard._navBound) {
    blogCard._navBound = true;
    blogCard.addEventListener('click', () => void navigateTo('blog', 'auto'));
  }
  const shoppingCard = document.getElementById('dash-auto-shopping-card');
  const shoppingStateChip = document.getElementById('dash-auto-shopping-enabled');
  if (shoppingStateChip) {
    shoppingStateChip.classList.toggle('on', shopAutoEnabled);
    shoppingStateChip.classList.toggle('off', !shopAutoEnabled);
  }
  if (shoppingCard) {
    shoppingCard.classList.toggle('is-on', shopAutoEnabled);
    shoppingCard.classList.toggle('is-off', !shopAutoEnabled);
  }
  if (shoppingCard && !shoppingCard._navBound) {
    shoppingCard._navBound = true;
    shoppingCard.addEventListener('click', () => void navigateTo('shopping', 'auto'));
  }

  // 📊 compact meta info: 주기, 연속건수, 대상 채널
  function renderAutoMetaRow(prefix, settings, enabledFlag) {
    const metaEl = document.getElementById(`dash-auto-${prefix}-meta`);
    if (!metaEl) return;
    if (!enabledFlag || !settings) {
      metaEl.innerHTML = '';
      return;
    }
    // 블로그: PUBLISH_AUTO_*, 쇼핑: SHOPPING_PUBLISH_AUTO_*
    const interval = settings.PUBLISH_AUTO_INTERVAL_MIN ?? settings.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN ?? '-';
    const batch = settings.PUBLISH_AUTO_BATCH_SIZE ?? settings.SHOPPING_PUBLISH_AUTO_BATCH_SIZE ?? '-';
    const channelStr = settings.PUBLISH_AUTO_TARGET_CHANNELS ?? settings.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS ?? 'naver';
    const channels = String(channelStr).split(',').map(v => v.trim()).filter(Boolean);
    const channelLabel = channels.map(c => c === 'wordpress' ? 'WP' : c === 'naver' ? '네이버' : c).join(' · ');
    metaEl.innerHTML = [
      `<span class="dash-meta-chip">⏱ ${interval}분 주기</span>`,
      `<span class="dash-meta-chip">📄 ${batch}건/회</span>`,
      channelLabel ? `<span class="dash-meta-chip">🎯 ${channelLabel}</span>` : ''
    ].filter(Boolean).join('');
  }

  renderAutoMetaRow('blog', auto?.blog?.settings, blogAutoEnabled);
  renderAutoMetaRow('shopping', auto?.shopping?.settings, shopAutoEnabled);

  // Top header status bar
  setText('top-plan', `플랜: ${license?.planName || license?.planCode || '-'}`);
  setText('top-remaining', `잔여: ${formatRemaining(license?.remaining)}`);
  setText('top-session', `세션: ${sessionOk ? (session.valid ? '유효' : '만료') : '-'}`);

  await Promise.all([
    loadDashboardLogs(),
    loadDashboardExternalContent({ force: false, silent: true })
  ]);
}

async function loadDashboardLogs() {
  const dashList = document.getElementById('activity-timeline');
  const logsList = document.getElementById('logs-activity-timeline');
  if (!dashList && !logsList) return;

  try {
    const [activityRes, logsRes] = await Promise.all([
      dashList ? fetchJson('/api/v1/dashboard/activities?limit=60') : Promise.resolve(null),
      logsList ? fetchJson('/api/v1/dashboard/logs?limit=200') : Promise.resolve(null)
    ]);
    const activities = Array.isArray(activityRes?.activities) ? activityRes.activities : [];
    const logs = Array.isArray(logsRes?.logs) ? logsRes.logs : [];

    const renderActivities = (list, items) => {
      if (!list) return;
      if (!items || items.length === 0) {
        list.innerHTML = '<li class="timeline-empty" style="padding: 12px; color: #64748b; text-align: center; font-size: 14px;">최근 활동 내역이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      items.forEach(activity => {
        const title = String(activity.title || '').trim() || '활동';
        const detail = String(activity.detail || '').trim();
        const level = String(activity.level || 'info').trim().toLowerCase();
        const icon = level === 'error' ? '❌' : (level === 'warn' ? '⚠️' : '✅');
        const timestamp = String(activity.timestamp || '').trim();
        const timeLabel = formatDashboardActivityTime(timestamp);
        const isDashboard = list.id === 'activity-timeline';
        const timeWidth = isDashboard ? '118px' : '132px';
        const timeFontSize = isDashboard ? '11px' : '12px';
        const timeMarginRight = isDashboard ? '12px' : '16px';

        const li = document.createElement('li');
        li.style.padding = '10px 12px';
        li.style.borderBottom = '1px solid #f1f5f9';
        li.style.fontSize = '14px';
        li.style.color = '#334155';
        li.style.display = 'flex';
        li.style.alignItems = 'baseline';
        li.innerHTML = `
          <span style="color:#94a3b8; font-size:${timeFontSize}; margin-right:${timeMarginRight}; white-space: nowrap; width:${timeWidth}; flex:0 0 ${timeWidth}; font-variant-numeric: tabular-nums; line-height:1.25;">${timeLabel}</span>
          <div style="display:flex; flex-direction:column; gap:2px; min-width:0; flex:1;">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${title.replace(/"/g, '&quot;')}">${icon} ${title}</span>
            ${detail ? `<span style="color:#64748b; font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${detail.replace(/"/g, '&quot;')}">${detail}</span>` : ''}
          </div>
        `;
        list.appendChild(li);
      });
    };

    const renderLogs = (list, items) => {
      if (!list) return;
      if (!items || items.length === 0) {
        list.innerHTML = '<li class="timeline-empty" style="padding: 12px; color: #64748b; text-align: center; font-size: 14px;">최근 활동 내역이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      items.forEach(log => {
        const msg = String(log.message || '').trim();
        const li = document.createElement('li');
        li.style.padding = '10px 12px';
        li.style.borderBottom = '1px solid #f1f5f9';
        li.style.fontSize = '14px';
        li.style.color = '#334155';
        li.style.display = 'flex';
        li.style.alignItems = 'center';

        let icon = 'ℹ️';
        if (log.level === 'error') icon = '❌';
        else if (log.level === 'warn') icon = '⚠️';
        else if (msg.includes('완료') || msg.includes('성공')) icon = '✅';

        const startsWithEmoji = /^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/.test(msg);
        const finalMessage = (startsWithEmoji && (msg.startsWith(icon) || icon === 'ℹ️')) ? msg : `${icon} ${msg}`;

        // 대시보드에서는 말줄임표 처리 (line-break 방지)
        const isDashboard = list.id === 'activity-timeline';
        const msgStyle = isDashboard
          ? 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;'
          : 'flex: 1; word-break: break-all;';
        const timeWidth = isDashboard ? '118px' : '132px';
        const timeFontSize = isDashboard ? '11px' : '12px';
        const timeMarginRight = isDashboard ? '12px' : '16px';

        li.innerHTML = `
          <span style="color:#94a3b8; font-size:${timeFontSize}; margin-right:${timeMarginRight}; white-space: nowrap; width:${timeWidth}; flex:0 0 ${timeWidth}; font-variant-numeric: tabular-nums;">${formatDashboardActivityTime(log.timestamp)}</span>
          <span style="${msgStyle}" title="${msg.replace(/"/g, '&quot;')}">${finalMessage}</span>
        `;
        list.appendChild(li);
      });
    };

    renderActivities(dashList, activities.slice(0, 60));
    renderLogs(logsList, logs.slice(0, 50));
    syncDashboardBottomColumnHeights();
  } catch (err) {
    if (err.status === 503 || String(err.message).includes('fetch failed')) return;
    const failHtml = '<li class="timeline-empty" style="padding: 12px; color: #ef4444; text-align: center; font-size: 14px;">로그를 불러오는데 실패했습니다.</li>';
    if (dashList) dashList.innerHTML = failHtml;
    if (logsList) logsList.innerHTML = failHtml;
  }
}

async function loadLogFiles() {
  const select = document.getElementById('logs-system-file-select');
  if (!select) return;
  try {
    const data = await fetchJson('/api/v1/logs/files');
    if (!data.files || data.files.length === 0) {
      select.innerHTML = '<option value="">로그 파일이 없습니다.</option>';
      return;
    }
    select.innerHTML = '';
    data.files.forEach(file => {
      const opt = document.createElement('option');
      opt.value = file;
      opt.textContent = file;
      select.appendChild(opt);
    });
    // 최초 파일 자동 로드
    select.value = data.files[0];
    loadSystemLog();
  } catch (err) {
    if (err.status === 503 || String(err.message).includes('fetch failed')) return;
    select.innerHTML = '<option value="">목록을 불러오지 못했습니다.</option>';
  }
}

async function loadSystemLog() {
  const select = document.getElementById('logs-system-file-select');
  const content = document.getElementById('logs-system-content');
  if (!select || !content) return;
  const scrollContainer = content.closest('.terminal-container') || content;

  const fileName = select.value;
  if (!fileName) {
    content.textContent = '로그 파일을 선택해 주세요.';
    systemLogRenderState.fileName = '';
    systemLogRenderState.lastRaw = '';
    return;
  }

  const isFileChanged = systemLogRenderState.fileName !== fileName;
  if (isFileChanged) {
    content.textContent = '로딩 중...';
    systemLogRenderState.fileName = fileName;
    systemLogRenderState.lastRaw = '';
  }

  const isNearBottom = (() => {
    const gap = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
    return gap <= 24;
  })();

  try {
    const res = await fetchJson(`/api/v1/logs/read?file=${encodeURIComponent(fileName)}`);
    const rawContent = String(res?.content || '');

    if (!rawContent) {
      content.textContent = '내용이 없습니다.';
      systemLogRenderState.lastRaw = '';
      return;
    }

    const oldRaw = systemLogRenderState.lastRaw || '';
    if (!oldRaw) {
      // 최초 로드
      content.innerHTML = formatSystemLogHtml(rawContent);
      systemLogRenderState.lastRaw = rawContent;
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
      return;
    }

    if (rawContent === oldRaw) {
      // 변경 없음
      return;
    }

    if (rawContent.startsWith(oldRaw)) {
      // 증분 append (꿀렁임 최소화)
      const delta = rawContent.slice(oldRaw.length);
      if (delta) {
        content.insertAdjacentHTML('beforeend', formatSystemLogHtml(delta));
      }
      systemLogRenderState.lastRaw = rawContent;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        });
      }
      return;
    }

    // 파일 롤링/잘림 등으로 prefix가 깨진 경우 전체 재렌더
    content.innerHTML = formatSystemLogHtml(rawContent);
    systemLogRenderState.lastRaw = rawContent;
    if (isNearBottom || isFileChanged) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      });
    }
  } catch (e) {
    if (e.status === 503 || String(e.message).includes('fetch failed')) {
      content.textContent = '네트워크 연결이 지연되고 있습니다...';
      return;
    }
    content.textContent = '로그를 읽어오지 못했습니다: ' + e.message;
  }
}

function formatSystemLogHtml(rawText) {
  let htmlContent = escapeHtml(rawText);
  htmlContent = htmlContent.replace(/\[ERROR\]/g, '<span style="color:#ef4444; font-weight:bold;">[ERROR]</span>');
  htmlContent = htmlContent.replace(/\[WARN\]/g, '<span style="color:#f59e0b; font-weight:bold;">[WARN]</span>');
  return htmlContent;
}

let clockInterval = null;
const CLOCK_STYLE_STORAGE_KEY = 'blog_genius_clock_style_v1';
const CLOCK_MODE_STORAGE_KEY = 'blog_genius_clock_mode_v1';
const POMODORO_STYLE_STORAGE_KEY = 'blog_genius_pomodoro_style_v1';
const POMODORO_STATE_STORAGE_KEY = 'blog_genius_pomodoro_state_v1';
const POMODORO_SOUND_STORAGE_KEY = 'blog_genius_pomodoro_sound_v1';
const POMODORO_DURATIONS = Object.freeze({ focus: 25 * 60 * 1000, break: 5 * 60 * 1000 });
const QUICK_POSTING_CELEBRATION_MAX_WAIT_MS = 10 * 60 * 1000;
let celebrationCleanupTimer = null;
let pendingQuickPostingCelebrationAt = 0;

function showAppCelebration({ title, message } = {}) {
  document.querySelectorAll('.app-celebration').forEach((item) => item.remove());
  if (celebrationCleanupTimer) clearTimeout(celebrationCleanupTimer);
  const celebration = document.createElement('div');
  celebration.className = 'app-celebration';
  celebration.setAttribute('aria-hidden', 'true');
  const colors = ['#38bdf8', '#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#a855f7'];
  const particleCount = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 64;
  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('i');
    particle.style.setProperty('--confetti-x', `${Math.round(Math.random() * 100)}vw`);
    particle.style.setProperty('--confetti-drift', `${Math.round((Math.random() - 0.5) * 34)}vw`);
    particle.style.setProperty('--confetti-delay', `${(Math.random() * 0.7).toFixed(2)}s`);
    particle.style.setProperty('--confetti-duration', `${(2.1 + Math.random() * 1.2).toFixed(2)}s`);
    particle.style.setProperty('--confetti-rotation', `${Math.round(Math.random() * 720 - 360)}deg`);
    particle.style.setProperty('--confetti-color', colors[index % colors.length]);
    celebration.appendChild(particle);
  }
  const messageBox = document.createElement('div');
  messageBox.className = 'app-celebration-message';
  const titleEl = document.createElement('strong');
  titleEl.textContent = String(title || '완료! 🎉');
  const messageEl = document.createElement('span');
  messageEl.textContent = String(message || '잘 해냈어요.');
  messageBox.append(titleEl, messageEl);
  celebration.appendChild(messageBox);
  document.body.appendChild(celebration);
  celebrationCleanupTimer = setTimeout(() => celebration.remove(), 3600);
}

function showQuickPostingCelebration() {
  showAppCelebration({
    title: '글쓰기 완료! 🎉',
    message: '새 글을 안전하게 저장했어요.'
  });
}

function isQuickPostingCelebrationStatus(postStatus) {
  return postStatus === 'publish' || postStatus === 'draft';
}

function showOrQueueQuickPostingCelebration() {
  if (document.visibilityState === 'visible' && document.hasFocus()) {
    pendingQuickPostingCelebrationAt = 0;
    showQuickPostingCelebration();
    return;
  }
  pendingQuickPostingCelebrationAt = Date.now();
}

function flushPendingQuickPostingCelebration() {
  if (!pendingQuickPostingCelebrationAt) return;
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
  const waitedMs = Date.now() - pendingQuickPostingCelebrationAt;
  pendingQuickPostingCelebrationAt = 0;
  if (waitedMs <= QUICK_POSTING_CELEBRATION_MAX_WAIT_MS) showQuickPostingCelebration();
}

function initClockWidget() {
  const displays = Array.from(document.querySelectorAll('[data-clock-display]'));
  if (!displays.length) return;

  const styleOptions = [
    { value: 'random', label: '랜덤', icon: '✨' },
    { value: 'digital', label: '디지털', icon: '12:34' },
    { value: 'analog', label: '아날로그', icon: '◷' },
    { value: 'flip', label: '플립', icon: '▣' },
    { value: 'heart', label: '하트', icon: '♥' },
    { value: 'split', label: '분할', icon: 'H M S' },
    { value: 'neon', label: '네온', icon: '✦' },
    { value: 'soft', label: '소프트', icon: '●' }
  ];
  const styles = styleOptions.filter((option) => option.value !== 'random').map((option) => option.value);
  const timerStyleOptions = [
    { value: 'tomato', label: '토마토', icon: '🍅' },
    { value: 'ring', label: '포커스 링', icon: '◯' },
    { value: 'flip', label: '플립', icon: '▣' },
    { value: 'soft', label: '소프트', icon: '●' }
  ];
  const timerStyles = timerStyleOptions.map((option) => option.value);
  const randomStyle = () => styles[Math.floor(Math.random() * styles.length)] || 'digital';
  let preferredStyle = 'random';
  let displayMode = 'clock';
  let timerStyle = 'tomato';
  let completionSoundEnabled = true;
  let timerState = {
    phase: 'focus',
    status: 'idle',
    remainingMs: POMODORO_DURATIONS.focus,
    endsAt: null,
    completionId: null
  };
  try {
    const savedStyle = localStorage.getItem(CLOCK_STYLE_STORAGE_KEY);
    if (savedStyle === 'random' || styles.includes(savedStyle)) preferredStyle = savedStyle;
    const savedMode = localStorage.getItem(CLOCK_MODE_STORAGE_KEY);
    if (savedMode === 'clock' || savedMode === 'timer') displayMode = savedMode;
    const savedTimerStyle = localStorage.getItem(POMODORO_STYLE_STORAGE_KEY);
    if (timerStyles.includes(savedTimerStyle)) timerStyle = savedTimerStyle;
    completionSoundEnabled = localStorage.getItem(POMODORO_SOUND_STORAGE_KEY) !== 'off';
    const savedTimerState = JSON.parse(localStorage.getItem(POMODORO_STATE_STORAGE_KEY) || 'null');
    if (savedTimerState && POMODORO_DURATIONS[savedTimerState.phase]) {
      const status = ['idle', 'running', 'paused', 'completed'].includes(savedTimerState.status)
        ? savedTimerState.status
        : 'idle';
      timerState = {
        phase: savedTimerState.phase,
        status,
        remainingMs: Number.isFinite(Number(savedTimerState.remainingMs))
          ? Math.max(0, Number(savedTimerState.remainingMs))
          : POMODORO_DURATIONS[savedTimerState.phase],
        endsAt: status === 'running' && Number.isFinite(Number(savedTimerState.endsAt))
          ? Number(savedTimerState.endsAt)
          : null,
        completionId: typeof savedTimerState.completionId === 'string' ? savedTimerState.completionId : null
      };
    }
  } catch (_) {
    preferredStyle = 'random';
  }
  let currentStyle = preferredStyle === 'random' ? randomStyle() : preferredStyle;
  let previousValue = null;
  let timerCompletionPulseUntil = 0;
  let timerCompletionPhase = null;
  let lastHandledCompletionId = timerState.completionId;
  let completionAudioContext = null;
  const widgetUnits = [];

  function getCompletionAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!completionAudioContext) completionAudioContext = new AudioContextClass();
    if (completionAudioContext.state === 'suspended') {
      completionAudioContext.resume().catch(() => {});
    }
    return completionAudioContext;
  }

  function playCompletionSound(phase) {
    if (!completionSoundEnabled) return;
    try {
      const context = getCompletionAudioContext();
      if (!context) return;
      const scheduleNotes = () => {
        const notes = phase === 'focus'
          ? [{ frequency: 523.25, offset: 0 }, { frequency: 659.25, offset: 0.15 }, { frequency: 783.99, offset: 0.3 }]
          : [{ frequency: 440, offset: 0 }, { frequency: 523.25, offset: 0.2 }];
        const startAt = context.currentTime + 0.03;
        notes.forEach(({ frequency, offset }) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const noteStart = startAt + offset;
          const noteEnd = noteStart + (phase === 'focus' ? 0.38 : 0.45);
          oscillator.type = phase === 'focus' ? 'sine' : 'triangle';
          oscillator.frequency.setValueAtTime(frequency, noteStart);
          gain.gain.setValueAtTime(0.0001, noteStart);
          gain.gain.exponentialRampToValueAtTime(phase === 'focus' ? 0.16 : 0.1, noteStart + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(noteStart);
          oscillator.stop(noteEnd + 0.02);
        });
      };
      if (context.state === 'suspended') context.resume().then(scheduleNotes).catch(() => {});
      else scheduleNotes();
    } catch (_) {
      // 오디오가 지원되지 않거나 차단되어도 시각 완료 효과는 계속 제공합니다.
    }
  }

  function showFocusCelebration() {
    showAppCelebration({
      title: '집중 완료! 🎉',
      message: '잘 해냈어요. 5분 쉬어갈까요?'
    });
  }

  function handleTimerCompletion(phase, completionId) {
    if (!completionId || completionId === lastHandledCompletionId) return;
    lastHandledCompletionId = completionId;
    timerCompletionPhase = phase;
    timerCompletionPulseUntil = Date.now() + (phase === 'focus' ? 3000 : 2400);
    playCompletionSound(phase);
    if (phase === 'focus') showFocusCelebration();
  }

  function persistTimerState() {
    try {
      localStorage.setItem(POMODORO_STATE_STORAGE_KEY, JSON.stringify(timerState));
    } catch (_) {
      // 저장소를 사용할 수 없어도 현재 실행 중 타이머는 유지합니다.
    }
  }

  function getTimerSnapshot(nowMs = Date.now()) {
    let remainingMs = timerState.remainingMs;
    if (timerState.status === 'running') {
      remainingMs = Math.max(0, Number(timerState.endsAt) - nowMs);
      if (remainingMs <= 0) {
        const completionId = `${timerState.phase}:${timerState.endsAt}`;
        timerState = { ...timerState, status: 'completed', remainingMs: 0, endsAt: null, completionId };
        persistTimerState();
        handleTimerCompletion(timerState.phase, completionId);
      }
    }
    const durationMs = POMODORO_DURATIONS[timerState.phase];
    return {
      ...timerState,
      durationMs,
      remainingMs,
      progress: Math.min(1, Math.max(0, 1 - (remainingMs / durationMs)))
    };
  }

  function formatTimerValue(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return { minutes, seconds, text: `${minutes}:${seconds}` };
  }

  function saveDisplayMode(mode) {
    displayMode = mode;
    try { localStorage.setItem(CLOCK_MODE_STORAGE_KEY, mode); } catch (_) { /* noop */ }
  }

  function saveTimerStyle(style) {
    timerStyle = style;
    try { localStorage.setItem(POMODORO_STYLE_STORAGE_KEY, style); } catch (_) { /* noop */ }
  }

  function toggleCompletionSound() {
    completionSoundEnabled = !completionSoundEnabled;
    try {
      localStorage.setItem(POMODORO_SOUND_STORAGE_KEY, completionSoundEnabled ? 'on' : 'off');
    } catch (_) {
      // 저장하지 못해도 현재 실행 중 설정은 유지합니다.
    }
    if (completionSoundEnabled) getCompletionAudioContext();
    refreshStyleMenus();
  }

  function getSeasonMood(now) {
    const month = now.getMonth() + 1;
    const season = month >= 3 && month <= 5
      ? 'spring'
      : month >= 6 && month <= 8
        ? 'summer'
        : month >= 9 && month <= 11
          ? 'autumn'
          : 'winter';
    const seasonLabel = {
      1: '한겨울', 2: '늦겨울', 3: '초봄', 4: '봄', 5: '늦봄', 6: '초여름',
      7: '한여름', 8: '늦여름', 9: '초가을', 10: '가을', 11: '늦가을', 12: '초겨울'
    }[month];
    const hour = now.getHours();
    const message = hour >= 5 && hour < 11
      ? '좋은 아침이에요'
      : hour >= 11 && hour < 14
        ? '잠시 숨을 고르기 좋은 시간이에요'
        : hour >= 14 && hour < 18
          ? '좋은 오후예요'
          : hour >= 18 && hour < 22
            ? '오늘도 수고했어요'
            : '조용한 밤이에요';
    const dateText = new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(now);
    return { season, text: `${dateText} · ${seasonLabel}`, message };
  }

  function closeStyleMenus(exceptUnit = null) {
    widgetUnits.forEach(({ unit, button }) => {
      if (unit === exceptUnit) return;
      unit.classList.remove('clock-style-menu-open');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function savePreferredStyle(style) {
    preferredStyle = style;
    try {
      localStorage.setItem(CLOCK_STYLE_STORAGE_KEY, style);
    } catch (_) {
      // 저장소를 사용할 수 없어도 현재 실행 중 선택은 유지합니다.
    }
  }

  function refreshStyleMenus() {
    widgetUnits.forEach(({ menu }) => {
      menu.querySelectorAll('[data-clock-mode]').forEach((item) => {
        const isSelected = item.dataset.clockMode === displayMode;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-pressed', String(isSelected));
      });
      const clockStyles = menu.querySelector('[data-clock-style-section]');
      const timerStylesSection = menu.querySelector('[data-timer-style-section]');
      if (clockStyles) clockStyles.hidden = displayMode !== 'clock';
      if (timerStylesSection) timerStylesSection.hidden = displayMode !== 'timer';
      menu.querySelectorAll('[data-clock-style]').forEach((item) => {
        const isSelected = item.dataset.clockStyle === preferredStyle;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-checked', String(isSelected));
      });
      menu.querySelectorAll('[data-timer-style]').forEach((item) => {
        const isSelected = item.dataset.timerStyle === timerStyle;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-checked', String(isSelected));
      });
      const soundToggle = menu.querySelector('[data-pomodoro-sound-toggle]');
      if (soundToggle) {
        soundToggle.classList.toggle('active', completionSoundEnabled);
        soundToggle.setAttribute('aria-pressed', String(completionSoundEnabled));
        const state = soundToggle.querySelector('[data-pomodoro-sound-state]');
        if (state) state.textContent = completionSoundEnabled ? '켜짐' : '꺼짐';
      }
    });
  }

  function refreshTimerControls(snapshot) {
    const phaseLabel = snapshot.phase === 'focus' ? '집중' : '휴식';
    const statusLabel = {
      idle: '동작을 선택하세요',
      running: `${phaseLabel} 중 · ${formatTimerValue(snapshot.remainingMs).text} 남음`,
      paused: `${phaseLabel} 일시정지 · ${formatTimerValue(snapshot.remainingMs).text} 남음`,
      completed: `${phaseLabel} 완료!`
    }[snapshot.status];
    widgetUnits.forEach(({ menu }) => {
      const status = menu.querySelector('[data-pomodoro-status]');
      if (status) status.textContent = statusLabel;
      const isActive = snapshot.status === 'running' || snapshot.status === 'paused';
      menu.querySelectorAll('[data-timer-action="start-focus"], [data-timer-action="start-break"]').forEach((item) => {
        item.disabled = isActive;
      });
      const pauseButton = menu.querySelector('[data-timer-action="toggle-pause"]');
      const stopButton = menu.querySelector('[data-timer-action="stop"]');
      const runningActions = menu.querySelector('.pomodoro-running-actions');
      if (runningActions) runningActions.hidden = !isActive;
      if (pauseButton) {
        pauseButton.hidden = !isActive;
        pauseButton.textContent = snapshot.status === 'paused' ? '▶ 계속' : 'Ⅱ 일시정지';
      }
      if (stopButton) stopButton.hidden = !isActive;
    });
  }

  function selectStyle(style) {
    if (style !== 'random' && !styles.includes(style)) return;
    savePreferredStyle(style);
    currentStyle = style === 'random' ? randomStyle() : style;
    previousValue = null;
    refreshStyleMenus();
    closeStyleMenus();
    displays.forEach((item) => {
      item.classList.remove('clock-display-pulse');
      void item.offsetWidth;
      item.classList.add('clock-display-pulse');
    });
    renderClock();
  }

  function selectDisplayMode(mode) {
    if (mode !== 'clock' && mode !== 'timer') return;
    saveDisplayMode(mode);
    previousValue = null;
    refreshStyleMenus();
    renderClock();
  }

  function selectTimerStyle(style) {
    if (!timerStyles.includes(style)) return;
    saveTimerStyle(style);
    refreshStyleMenus();
    renderClock();
  }

  function startTimer(phase) {
    const durationMs = POMODORO_DURATIONS[phase];
    if (!durationMs) return;
    timerState = {
      phase,
      status: 'running',
      remainingMs: durationMs,
      endsAt: Date.now() + durationMs,
      completionId: null
    };
    timerCompletionPhase = null;
    getCompletionAudioContext();
    persistTimerState();
    renderClock();
  }

  function toggleTimerPause() {
    const snapshot = getTimerSnapshot();
    if (snapshot.status === 'running') {
      timerState = { ...timerState, status: 'paused', remainingMs: snapshot.remainingMs, endsAt: null };
    } else if (snapshot.status === 'paused') {
      timerState = { ...timerState, status: 'running', endsAt: Date.now() + snapshot.remainingMs };
    } else {
      return;
    }
    persistTimerState();
    renderClock();
  }

  function stopTimer() {
    timerState = {
      phase: 'focus',
      status: 'idle',
      remainingMs: POMODORO_DURATIONS.focus,
      endsAt: null,
      completionId: null
    };
    timerCompletionPhase = null;
    persistTimerState();
    renderClock();
  }

  displays.forEach((display) => {
    const unit = document.createElement('div');
    unit.className = 'clock-widget-unit';
    const main = document.createElement('div');
    main.className = 'clock-widget-main';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clock-style-button';
    button.title = '시계 및 타이머 메뉴';
    button.setAttribute('aria-label', '시계 및 타이머 메뉴');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `
      <svg class="clock-menu-trigger-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
      </svg>
    `;
    const controlRail = document.createElement('div');
    controlRail.className = 'clock-control-rail';
    const inlineActions = document.createElement('div');
    inlineActions.className = 'pomodoro-inline-actions';
    inlineActions.setAttribute('aria-label', '타이머 제어');
    const meta = document.createElement('div');
    meta.className = 'clock-ambient-meta';
    meta.setAttribute('aria-live', 'polite');
    const menu = document.createElement('div');
    menu.className = 'clock-style-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', '시계와 집중 타이머');
    menu.innerHTML = `
      <div class="clock-mode-switch" aria-label="메인 표시 모드">
        <button type="button" data-clock-mode="clock" aria-pressed="false">시계</button>
        <button type="button" data-clock-mode="timer" aria-pressed="false">타이머</button>
      </div>
      <div class="clock-style-section" data-clock-style-section>
        <span class="clock-menu-section-label">시계 스타일</span>
        <div class="clock-style-grid">
          ${styleOptions.map((option) => `
            <button type="button" class="clock-style-option" role="radio" aria-checked="false" data-clock-style="${option.value}">
              <span class="clock-style-option-icon">${option.icon}</span>
              <span>${option.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="clock-style-section" data-timer-style-section hidden>
        <span class="clock-menu-section-label">타이머 스타일</span>
        <div class="clock-style-grid">
          ${timerStyleOptions.map((option) => `
            <button type="button" class="clock-style-option" role="radio" aria-checked="false" data-timer-style="${option.value}">
              <span class="clock-style-option-icon">${option.icon}</span>
              <span>${option.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="pomodoro-menu-control">
        <div class="pomodoro-menu-heading">
          <span class="clock-menu-section-label">집중 타이머</span>
          <span data-pomodoro-status></span>
        </div>
        <div class="pomodoro-preset-actions">
          <button type="button" data-timer-action="start-focus">🍅 25분 집중</button>
          <button type="button" data-timer-action="start-break">☕ 5분 휴식</button>
        </div>
        <div class="pomodoro-running-actions">
          <button type="button" data-timer-action="toggle-pause" hidden>Ⅱ 일시정지</button>
          <button type="button" data-timer-action="stop" hidden>종료</button>
        </div>
        <button type="button" class="pomodoro-sound-toggle" data-pomodoro-sound-toggle aria-pressed="true">
          <span>🔔 완료 알림음</span>
          <span data-pomodoro-sound-state>켜짐</span>
        </button>
      </div>
    `;

    const serverControl = display.closest('.dash-clock-widget')?.querySelector('#server-control');
    if (serverControl) {
      const serverControlLabel = document.createElement('span');
      serverControlLabel.className = 'clock-server-control-label';
      serverControlLabel.textContent = '앱 제어';
      serverControl.classList.add('clock-server-control');
      serverControl.setAttribute('aria-label', '앱 제어');
      serverControl.prepend(serverControlLabel);
      menu.appendChild(serverControl);
    }

    display.parentNode.insertBefore(unit, display);
    unit.appendChild(main);
    main.appendChild(display);
    main.appendChild(controlRail);
    controlRail.appendChild(button);
    controlRail.appendChild(inlineActions);
    main.appendChild(meta);
    unit.appendChild(menu);
    widgetUnits.push({ unit, button, inlineActions, meta, menu });

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !unit.classList.contains('clock-style-menu-open');
      closeStyleMenus();
      unit.classList.toggle('clock-style-menu-open', willOpen);
      button.setAttribute('aria-expanded', String(willOpen));
    });
    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      const modeOption = event.target.closest('button[data-clock-mode]');
      const clockOption = event.target.closest('[data-clock-style]');
      const timerOption = event.target.closest('[data-timer-style]');
      const timerAction = event.target.closest('[data-timer-action]');
      const soundToggle = event.target.closest('[data-pomodoro-sound-toggle]');
      if (modeOption) selectDisplayMode(modeOption.dataset.clockMode);
      else if (clockOption) selectStyle(clockOption.dataset.clockStyle);
      else if (timerOption) selectTimerStyle(timerOption.dataset.timerStyle);
      else if (soundToggle) toggleCompletionSound();
      else if (timerAction && !timerAction.disabled) {
        const action = timerAction.dataset.timerAction;
        if (action === 'start-focus') startTimer('focus');
        else if (action === 'start-break') startTimer('break');
        else if (action === 'toggle-pause') toggleTimerPause();
        else if (action === 'stop') stopTimer();
      }
    });
    inlineActions.addEventListener('click', (event) => {
      const timerAction = event.target.closest('[data-timer-inline-action]');
      if (!timerAction) return;
      event.stopPropagation();
      const action = timerAction.dataset.timerInlineAction;
      if (action === 'start') startTimer(timerAction.dataset.timerPhase || timerState.phase);
      else if (action === 'toggle-pause') toggleTimerPause();
      else if (action === 'stop') stopTimer();
    });
  });

  displays.forEach((display) => {
    display.addEventListener('click', (event) => {
      if (displayMode === 'timer') {
        const nextIndex = (timerStyles.indexOf(timerStyle) + 1) % timerStyles.length;
        selectTimerStyle(timerStyles[nextIndex]);
      } else {
        const nextIndex = (styles.indexOf(currentStyle) + 1) % styles.length;
        selectStyle(styles[nextIndex]);
      }
    });
  });

  document.addEventListener('click', () => closeStyleMenus());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeStyleMenus();
  });

  function renderTimerFace(snapshot) {
    const value = formatTimerValue(snapshot.remainingMs);
    const phaseLabel = snapshot.phase === 'focus' ? '25분 집중' : '5분 휴식';
    const phaseIcon = snapshot.phase === 'focus' ? '🍅' : '☕';
    const faceLabel = snapshot.status === 'completed' ? `✓ ${phaseLabel} 완료` : `${phaseIcon} ${phaseLabel}`;
    const progressDegrees = Math.round(snapshot.progress * 360);
    const progressPercent = Math.round(snapshot.progress * 100);
    if (timerStyle === 'ring') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-ring" style="--pomodoro-progress:${progressDegrees}deg">
            <div class="pomodoro-ring-center">
              <span class="pomodoro-face-label">${faceLabel}</span>
              <span class="pomodoro-face-time">${value.text}</span>
            </div>
          </div>
        </div>
      `;
    }
    if (timerStyle === 'flip') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-flip">
            <span class="pomodoro-face-label">${faceLabel}</span>
            <div class="pomodoro-flip-values">
              <span>${value.minutes}</span><b>:</b><span>${value.seconds}</span>
            </div>
            <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
          </div>
        </div>
      `;
    }
    if (timerStyle === 'soft') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-soft">
            <span class="pomodoro-soft-orb">${phaseIcon}</span>
            <div>
              <span class="pomodoro-face-label">${faceLabel}</span>
              <span class="pomodoro-face-time">${value.text}</span>
            </div>
            <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
          </div>
        </div>
      `;
    }
    return `
      <div class="pomodoro-face-shell">
        <div class="pomodoro-face pomodoro-face-tomato">
          <span class="pomodoro-tomato-icon">${phaseIcon}</span>
          <div>
            <span class="pomodoro-face-label">${faceLabel}</span>
            <span class="pomodoro-face-time">${value.text}</span>
          </div>
          <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
        </div>
      </div>
    `;
  }

  function renderInlineTimerControls(snapshot) {
    if (snapshot.status === 'running') {
      return `<button type="button" data-timer-inline-action="toggle-pause" title="일시정지" aria-label="일시정지">Ⅱ</button><button type="button" data-timer-inline-action="stop" title="종료" aria-label="타이머 종료">■</button>`;
    }
    if (snapshot.status === 'paused') {
      return `<button type="button" data-timer-inline-action="toggle-pause" title="계속" aria-label="계속">▶</button><button type="button" data-timer-inline-action="stop" title="종료" aria-label="타이머 종료">■</button>`;
    }
    if (snapshot.status === 'completed') {
      const nextPhase = snapshot.phase === 'focus' ? 'break' : 'focus';
      const nextLabel = snapshot.phase === 'focus' ? '5분 휴식 시작' : '25분 집중 시작';
      const nextIcon = snapshot.phase === 'focus' ? '☕' : '🍅';
      return `<button type="button" class="pomodoro-inline-next" data-timer-inline-action="start" data-timer-phase="${nextPhase}" title="${nextLabel}" aria-label="${nextLabel}">${nextIcon}</button>`;
    }
    const startLabel = snapshot.phase === 'focus' ? '25분 집중 시작' : '5분 휴식 시작';
    return `<button type="button" class="pomodoro-inline-start" data-timer-inline-action="start" data-timer-phase="${snapshot.phase}" title="${startLabel}" aria-label="${startLabel}">▶</button>`;
  }

  function renderClock() {
    const style = currentStyle;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const hourChanged = previousValue && previousValue.h !== h;
    const minuteChanged = previousValue && previousValue.m !== m;
    const secondChanged = previousValue && previousValue.s !== s;
    const mood = getSeasonMood(now);
    const timerSnapshot = getTimerSnapshot(now.getTime());
    const timerValue = formatTimerValue(timerSnapshot.remainingMs);
    const timerPhaseLabel = timerSnapshot.phase === 'focus' ? '집중' : '휴식';
    const timerPhaseIcon = timerSnapshot.phase === 'focus' ? '🍅' : '☕';
    displays.forEach((display) => {
      display.title = displayMode === 'timer'
        ? '클릭하여 타이머 스타일 변경'
        : '클릭하여 시계 스타일 변경';
    });

    widgetUnits.forEach(({ unit, button, inlineActions, meta }) => {
      const completionEffectActive = timerCompletionPulseUntil > now.getTime();
      unit.dataset.clockSeason = mood.season;
      unit.dataset.clockDisplayMode = displayMode;
      unit.dataset.pomodoroPhase = timerSnapshot.phase;
      unit.classList.toggle('pomodoro-complete', completionEffectActive && timerCompletionPhase === 'focus');
      unit.classList.toggle('pomodoro-break-complete', completionEffectActive && timerCompletionPhase === 'break');
      button.title = '시계 및 타이머 메뉴';
      button.setAttribute('aria-label', button.title);
      const inlineControlsHtml = displayMode === 'timer' ? renderInlineTimerControls(timerSnapshot) : '';
      if (inlineActions.dataset.controlsHtml !== inlineControlsHtml) {
        inlineActions.dataset.controlsHtml = inlineControlsHtml;
        inlineActions.innerHTML = inlineControlsHtml;
      }
      let metaHtml = '';
      if (displayMode === 'timer') {
        metaHtml = `<span class="clock-season-dot" aria-hidden="true"></span><span>현재 시각 ${h}:${m}:${s}</span><span class="clock-ambient-message">${mood.text}</span>`;
      } else {
        const timerStatus = timerSnapshot.status === 'paused'
          ? ' · 일시정지'
          : timerSnapshot.status === 'completed'
            ? ' 완료!'
            : '';
        metaHtml = `<span class="clock-season-dot" aria-hidden="true"></span><span>${mood.text}</span><span class="clock-ambient-message">${mood.message}</span><span class="clock-sub-timer ${timerSnapshot.status}">${timerPhaseIcon} ${timerPhaseLabel} ${timerSnapshot.status === 'completed' ? '' : timerValue.text}${timerStatus}</span>`;
      }
      const moodKey = `${displayMode}|${mood.season}|${metaHtml}`;
      if (meta.dataset.clockMoodKey !== moodKey) {
        meta.dataset.clockMoodKey = moodKey;
        meta.innerHTML = metaHtml;
      }
    });
    refreshTimerControls(timerSnapshot);

    if (displayMode === 'timer') {
      const html = renderTimerFace(timerSnapshot);
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'digital') {
      const html = `<div style="font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 2px; color: #0f172a; line-height: 1;">
        ${h}<span style="opacity:0.5;">:</span>${m}<span style="opacity:0.5;">:</span>${s}
      </div>`;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'analog') {
      const secDeg = now.getSeconds() * 6;
      const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
      const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;

      let ticksHtml = '';
      for (let i = 0; i < 12; i++) {
        ticksHtml += `<div style="position: absolute; top: 0; left: 50%; width: 2px; height: ${i % 3 === 0 ? '8px' : '4px'}; background: ${i % 3 === 0 ? '#334155' : '#94a3b8'}; transform-origin: center 40px; transform: translateX(-50%) rotate(${i * 30}deg);"></div>`;
      }

      const html = `
        <div style="position: relative; width: 88px; height: 88px; border-radius: 50%; border: 4px solid #334155; box-sizing: border-box; background: #f8fafc; margin-right: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          ${ticksHtml}
          <!-- center dot -->
          <div style="position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; background: #0f172a; border-radius: 50%; transform: translate(-50%, -50%); z-index: 10;"></div>
          <!-- Hour Hand -->
          <div style="position: absolute; top: 25%; bottom: 50%; left: 50%; width: 5px; background: #0f172a; transform-origin: bottom center; transform: translateX(-50%) rotate(${hourDeg}deg); border-radius: 3px; z-index: 7;"></div>
          <!-- Min Hand -->
          <div style="position: absolute; top: 12%; bottom: 50%; left: 50%; width: 3px; background: #334155; transform-origin: bottom center; transform: translateX(-50%) rotate(${minDeg}deg); border-radius: 2px; z-index: 8;"></div>
          <!-- Sec Hand -->
          <div style="position: absolute; top: 5%; bottom: 40%; left: 50%; width: 2px; background: #ef4444; transform-origin: 75% 75%; transform: translateX(-50%) rotate(${secDeg}deg); z-index: 9; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'flip') {
      const bStyle = "display:inline-block; background:#1e293b; color:#fff; padding:6px 10px; border-radius:6px; font-size:28px; font-weight:bold; font-family:monospace; margin:0 3px; box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1); line-height: 1;";
      const html = `<div style="display:flex; align-items:center;">
        <span style="${bStyle}">${h}</span>
        <span style="font-size:24px; font-weight:bold; color:#334155; margin:0 2px;">:</span>
        <span style="${bStyle}">${m}</span>
        <span style="font-size:24px; font-weight:bold; color:#334155; margin:0 2px;">:</span>
        <span style="${bStyle}">${s}</span>
      </div>`;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'heart') {
      const secDeg = now.getSeconds() * 6;
      const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
      const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
      const html = `
        <div style="position:relative; width:112px; height:102px; margin-right:6px;">
          <div style="position:absolute; inset:0; clip-path:polygon(50% 100%, 8% 63%, 8% 26%, 26% 26%, 26% 8%, 40% 8%, 40% 0, 60% 0, 60% 8%, 74% 8%, 74% 26%, 92% 26%, 92% 63%); background:linear-gradient(180deg,#fb923c 0%,#f97316 42%,#f43f5e 100%); border:4px solid rgba(255,255,255,0.72); box-shadow:0 12px 28px rgba(244,63,94,0.24), inset 0 1px 0 rgba(255,255,255,0.4);"></div>
          <div style="position:absolute; inset:10px 12px 14px; clip-path:polygon(50% 100%, 8% 63%, 8% 26%, 26% 26%, 26% 8%, 40% 8%, 40% 0, 60% 0, 60% 8%, 74% 8%, 74% 26%, 92% 26%, 92% 63%); background:linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02));"></div>
          <div style="position:absolute; top:50%; left:50%; width:10px; height:10px; background:#334155; border:2px solid rgba(255,255,255,0.88); border-radius:999px; transform:translate(-50%, -50%); z-index:10; box-shadow:0 2px 4px rgba(15,23,42,0.18);"></div>
          <div style="position:absolute; top:26%; bottom:50%; left:50%; width:5px; background:rgba(255,255,255,0.92); transform-origin:bottom center; transform:translateX(-50%) rotate(${hourDeg}deg); border-radius:999px; z-index:7;"></div>
          <div style="position:absolute; top:16%; bottom:50%; left:50%; width:3px; background:rgba(241,245,249,0.95); transform-origin:bottom center; transform:translateX(-50%) rotate(${minDeg}deg); border-radius:999px; z-index:8;"></div>
          <div style="position:absolute; top:12%; bottom:46%; left:50%; width:2px; background:#ffffff; transform-origin:bottom center; transform:translateX(-50%) rotate(${secDeg}deg); z-index:9; border-radius:999px; opacity:0.92;"></div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'split') {
      const html = `
        <div class="clock-split">
          <div class="clock-split-block${hourChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Hour</span>
            <span class="clock-split-value">${h}</span>
          </div>
          <div class="clock-split-block${minuteChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Min</span>
            <span class="clock-split-value">${m}</span>
          </div>
          <div class="clock-split-block clock-split-block-accent${secondChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Sec</span>
            <span class="clock-split-value">${s}</span>
          </div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'neon') {
      const html = `
        <div style="display:inline-flex; align-items:center; gap:10px; padding:10px 16px; border-radius:18px; background:linear-gradient(135deg,#020617,#111827 55%,#1e1b4b); box-shadow:0 0 0 1px rgba(34,211,238,0.18), 0 12px 28px rgba(15,23,42,0.32);">
          <span style="font-size:30px; font-weight:800; font-family:monospace; letter-spacing:0.12em; color:#67e8f9; text-shadow:0 0 8px rgba(103,232,249,0.55); font-variant-numeric:tabular-nums;">${h}:${m}</span>
          <span style="font-size:16px; font-weight:800; color:#c4b5fd; text-shadow:0 0 8px rgba(196,181,253,0.45); min-width:24px; text-align:center; font-variant-numeric:tabular-nums;">${s}</span>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'soft') {
      const html = `
        <div style="display:inline-flex; align-items:center; gap:12px; padding:10px 16px; border-radius:20px; background:linear-gradient(135deg,#fdf2f8,#eef2ff); border:1px solid rgba(216,180,254,0.55); box-shadow:0 10px 24px rgba(148,163,184,0.14);">
          <span style="display:inline-flex; width:10px; height:10px; border-radius:999px; background:#22c55e; box-shadow:0 0 0 5px rgba(34,197,94,0.12);"></span>
          <div style="display:flex; flex-direction:column; gap:2px; line-height:1;">
            <span style="font-size:28px; font-weight:800; color:#1f2937; font-variant-numeric:tabular-nums;">${h}:${m}:${s}</span>
          </div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    }

    previousValue = { h, m, s };
  }

  if (clockInterval) clearInterval(clockInterval);
  refreshStyleMenus();
  renderClock();
  clockInterval = setInterval(renderClock, 1000);
}


let manualSnsConfig = { configured: false, local_media_available: false, channels: [], ai: { available: false, model_name: '' } };
let manualSnsConfigLoading = false;
let manualSnsOptimizationSnapshot = null;
let manualSnsOptimizationInFlight = false;
let manualSnsLocalImageFile = null;
let manualSnsLocalImagePreviewUrl = '';
const MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY = 'manual_sns_selected_channel_ids_v1';
const DEFAULT_BUFFER_HELP_URL = 'https://m.blog.naver.com/amadejjs/223940980574';

function loadManualSnsSelectedChannelIds() {
  try {
    const raw = localStorage.getItem(MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.map((id) => String(id || '').trim()).filter(Boolean));
  } catch (_error) {
    return null;
  }
}

function persistManualSnsSelectedChannels() {
  const selectedIds = Array.from(document.querySelectorAll('[data-manual-sns-channel]:checked'))
    .map((input) => String(input.value || '').trim())
    .filter(Boolean);
  try {
    localStorage.setItem(MANUAL_SNS_SELECTED_CHANNELS_STORAGE_KEY, JSON.stringify(selectedIds));
  } catch (_error) {
    // Local Storage가 차단되어도 SNS 발행 자체는 계속 사용할 수 있어야 합니다.
  }
}

function getManualSnsSelectedChannels() {
  const selectedIds = new Set(Array.from(document.querySelectorAll('[data-manual-sns-channel]:checked'))
    .map((input) => String(input.value || '').trim()));
  return (Array.isArray(manualSnsConfig.channels) ? manualSnsConfig.channels : [])
    .filter((channel) => selectedIds.has(String(channel.id || '').trim()));
}

function getManualSnsImageValidation() {
  const localMode = document.getElementById('manual-sns-image-source-local')?.checked === true;
  if (localMode) {
    if (manualSnsConfig.local_media_available !== true) {
      return { valid: false, mode: 'local', hasImage: false, message: '로컬 이미지를 사용하려면 WordPress 연결 설정이 필요합니다.' };
    }
    if (!manualSnsLocalImageFile) return { valid: true, mode: 'local', hasImage: false, file: null, url: '' };
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(String(manualSnsLocalImageFile.type || '').toLowerCase())) {
      return { valid: false, mode: 'local', hasImage: false, message: 'png, jpg, webp, gif 이미지만 사용할 수 있습니다.' };
    }
    if (manualSnsLocalImageFile.size > 10 * 1024 * 1024) {
      return { valid: false, mode: 'local', hasImage: false, message: '이미지 파일은 최대 10MB까지 사용할 수 있습니다.' };
    }
    return { valid: true, mode: 'local', hasImage: true, file: manualSnsLocalImageFile, url: '' };
  }
  const raw = String(document.getElementById('manual-sns-image-url')?.value || '').trim();
  if (!raw) return { valid: true, mode: 'url', hasImage: false, url: '' };
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) {
      return { valid: false, mode: 'url', hasImage: false, url: '', message: '공개 HTTPS 이미지 URL을 입력하세요.' };
    }
    return { valid: true, mode: 'url', hasImage: true, url: url.toString() };
  } catch (_error) {
    return { valid: false, mode: 'url', hasImage: false, url: '', message: '이미지 URL 형식을 확인하세요.' };
  }
}

function setManualSnsLocalImageFile(file = null) {
  if (manualSnsLocalImagePreviewUrl) URL.revokeObjectURL(manualSnsLocalImagePreviewUrl);
  manualSnsLocalImageFile = file || null;
  manualSnsLocalImagePreviewUrl = file ? URL.createObjectURL(file) : '';
}

function syncManualSnsImageSourceUi() {
  const localRadio = document.getElementById('manual-sns-image-source-local');
  const localLabel = document.getElementById('manual-sns-image-source-local-label');
  const urlRadio = document.getElementById('manual-sns-image-source-url');
  const urlPanel = document.getElementById('manual-sns-image-url-panel');
  const localPanel = document.getElementById('manual-sns-image-local-panel');
  const localAvailable = manualSnsConfig.local_media_available === true;
  if (localRadio) localRadio.disabled = !localAvailable;
  if (localLabel) {
    localLabel.classList.toggle('is-disabled', !localAvailable);
    localLabel.title = localAvailable ? '' : '설정 > 블로그에서 WordPress 연결 정보를 먼저 저장해 주세요.';
  }
  if (!localAvailable && localRadio?.checked && urlRadio) urlRadio.checked = true;
  const localMode = localRadio?.checked === true;
  if (urlPanel) urlPanel.hidden = localMode;
  if (localPanel) localPanel.hidden = !localMode;
}

function syncManualSnsImagePreview() {
  const inputEl = document.getElementById('manual-sns-image-url');
  const removeBtn = document.getElementById('manual-sns-image-remove-btn');
  const fileRemoveBtn = document.getElementById('manual-sns-image-file-remove-btn');
  const filePickerEl = document.getElementById('manual-sns-image-file-picker');
  const fileNameEl = document.getElementById('manual-sns-image-file-name');
  const fileActionEl = document.getElementById('manual-sns-image-file-action');
  const previewEl = document.getElementById('manual-sns-image-preview');
  const imageEl = document.getElementById('manual-sns-image-preview-img');
  const statusEl = document.getElementById('manual-sns-image-preview-status');
  const raw = String(inputEl?.value || '').trim();
  syncManualSnsImageSourceUi();
  const validation = getManualSnsImageValidation();
  if (removeBtn) removeBtn.hidden = !raw;
  if (fileRemoveBtn) fileRemoveBtn.hidden = !manualSnsLocalImageFile;
  if (filePickerEl) filePickerEl.classList.toggle('has-file', Boolean(manualSnsLocalImageFile));
  if (fileNameEl) fileNameEl.textContent = manualSnsLocalImageFile?.name || '이미지 파일 선택';
  if (fileActionEl) fileActionEl.textContent = manualSnsLocalImageFile ? '변경' : '파일 찾기';
  if (!previewEl || !imageEl || !statusEl) return;

  if (!validation.hasImage || !validation.valid) {
    previewEl.hidden = true;
    imageEl.removeAttribute('src');
    return;
  }
  previewEl.hidden = false;
  if (validation.mode === 'local') {
    imageEl.onload = null;
    imageEl.onerror = null;
    imageEl.src = manualSnsLocalImagePreviewUrl;
    statusEl.textContent = `${validation.file.name} · WordPress를 통해 임시 업로드됩니다.`;
    return;
  }
  statusEl.textContent = '이미지 미리보기를 불러오는 중입니다.';
  imageEl.onerror = () => {
    statusEl.textContent = '미리보기를 불러오지 못했습니다. Buffer에서 접근 가능한 직접 이미지 URL인지 확인하세요.';
  };
  imageEl.onload = () => {
    statusEl.textContent = '이미지 URL 1개가 함께 발행됩니다.';
  };
  imageEl.src = validation.url;
}

function syncManualSnsComposerState() {
  syncManualSnsImageSourceUi();
  const textEl = document.getElementById('manual-sns-text');
  const countEl = document.getElementById('manual-sns-character-count');
  const limitEl = document.getElementById('manual-sns-limit-status');
  const summaryEl = document.getElementById('manual-sns-publish-summary');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const optimizeActionEl = document.getElementById('manual-sns-ai-action');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  const text = String(textEl?.value || '').trim();
  const characterCount = Array.from(text).length;
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  let errorMessage = '';

  const exceeded = selectedChannels.find((channel) => characterCount > Number(channel.limit || 0));
  if (exceeded) {
    errorMessage = `${exceeded.name || exceeded.service} 글자 수 제한을 ${characterCount - Number(exceeded.limit || 0)}자 초과했습니다. (${characterCount}/${exceeded.limit}자)`;
  } else if (!image.valid) {
    errorMessage = image.message;
  } else {
    const imageRequired = selectedChannels.find((channel) => channel.image_required === true);
    if (imageRequired && !image.hasImage) {
      errorMessage = `${imageRequired.name || imageRequired.service} 채널은 이미지가 필요합니다.`;
    }
  }

  if (countEl) {
    const selectedLimits = selectedChannels.map((channel) => Number(channel.limit || 0)).filter((limit) => limit > 0);
    const shortestLimit = selectedLimits.length > 0 ? Math.min(...selectedLimits) : 0;
    countEl.textContent = shortestLimit > 0 ? `${characterCount}/${shortestLimit}자` : `${characterCount}자`;
    countEl.classList.toggle('is-over', Boolean(exceeded));
  }
  if (limitEl) {
    limitEl.textContent = errorMessage || (selectedChannels.length > 0 ? '선택한 모든 채널의 글자 수 제한 안에 있습니다.' : '');
    limitEl.classList.toggle('is-error', Boolean(errorMessage));
  }
  if (summaryEl) {
    summaryEl.textContent = selectedChannels.length > 0
      ? `${selectedChannels.length}개 채널에 즉시 발행합니다${image.hasImage ? ' · 이미지 포함' : ''}.`
      : '발행할 채널을 선택하세요.';
  }
  if (publishBtn) {
    publishBtn.textContent = selectedChannels.length > 0 ? `${selectedChannels.length}개 채널에 지금 발행` : '지금 발행';
    publishBtn.disabled = manualSnsOptimizationInFlight || !manualSnsConfig.configured || selectedChannels.length === 0 || !text || Boolean(errorMessage);
  }
  if (optimizeBtn) {
    const aiAvailable = manualSnsConfig.ai?.available === true;
    if (optimizeActionEl) optimizeActionEl.hidden = !aiAvailable;
    optimizeBtn.disabled = manualSnsOptimizationInFlight || selectedChannels.length === 0 || !text;
    optimizeBtn.textContent = manualSnsOptimizationInFlight ? 'AI 최적화 중...' : 'AI 최적화';
  }
  if (undoBtn) {
    undoBtn.hidden = manualSnsOptimizationSnapshot === null;
    undoBtn.disabled = manualSnsOptimizationInFlight;
  }

  document.querySelectorAll('.social-channel-option').forEach((label) => {
    const input = label.querySelector('[data-manual-sns-channel]');
    label.classList.toggle('is-selected', Boolean(input?.checked));
  });
  if (selectAllEl) {
    const enabledInputs = Array.from(document.querySelectorAll('[data-manual-sns-channel]:not(:disabled)'));
    const selectedCount = enabledInputs.filter((input) => input.checked).length;
    selectAllEl.disabled = enabledInputs.length === 0;
    selectAllEl.checked = enabledInputs.length > 0 && selectedCount === enabledInputs.length;
    selectAllEl.indeterminate = selectedCount > 0 && selectedCount < enabledInputs.length;
  }
}

function renderManualSnsChannels() {
  const listEl = document.getElementById('manual-sns-channel-list');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  if (!listEl) return;
  listEl.replaceChildren();

  const channels = Array.isArray(manualSnsConfig.channels) ? manualSnsConfig.channels : [];
  if (!manualSnsConfig.configured || channels.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'social-channel-empty';
    const messageEl = document.createElement('span');
    messageEl.textContent = 'Buffer 연결 또는 발행 채널 설정이 필요합니다.';
    const linksEl = document.createElement('div');
    linksEl.className = 'buffer-resource-links social-channel-help-links';
    linksEl.setAttribute('aria-label', 'Buffer 관련 링크');
    const helpLinkEl = document.createElement('a');
    helpLinkEl.href = DEFAULT_BUFFER_HELP_URL;
    helpLinkEl.target = '_blank';
    helpLinkEl.rel = 'noopener noreferrer';
    helpLinkEl.textContent = 'Buffer 알아보기';
    const separatorEl = document.createElement('span');
    separatorEl.setAttribute('aria-hidden', 'true');
    separatorEl.textContent = '·';
    const joinLinkEl = document.createElement('a');
    joinLinkEl.href = 'https://join.buffer.com/delta898-gmail-com';
    joinLinkEl.target = '_blank';
    joinLinkEl.rel = 'noopener noreferrer';
    joinLinkEl.textContent = 'Buffer 가입';
    linksEl.append(helpLinkEl, separatorEl, joinLinkEl);
    emptyEl.append(messageEl, linksEl);
    listEl.appendChild(emptyEl);
    if (selectAllEl) selectAllEl.disabled = true;
    syncManualSnsComposerState();
    return;
  }

  if (selectAllEl) selectAllEl.disabled = false;
  const savedChannelIds = loadManualSnsSelectedChannelIds();
  channels.forEach((channel) => {
    const unavailable = !channel.supported || channel.disabled || channel.is_disconnected || channel.is_locked;
    const label = document.createElement('label');
    label.className = `social-channel-option${unavailable ? ' is-disabled' : ''}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = channel.id;
    input.dataset.manualSnsChannel = 'true';
    input.disabled = unavailable;
    input.checked = !unavailable && savedChannelIds?.has(String(channel.id || '').trim()) === true;
    input.addEventListener('change', () => {
      persistManualSnsSelectedChannels();
      syncManualSnsComposerState();
    });
    const copy = document.createElement('span');
    copy.className = 'social-channel-copy';
    const name = document.createElement('strong');
    name.textContent = channel.name || channel.service || 'Buffer 채널';
    const detail = document.createElement('span');
    detail.textContent = unavailable
      ? '현재 수동 발행 미지원'
      : `${channel.service} · 최대 ${Number(channel.limit || 0).toLocaleString('ko-KR')}자${channel.image_required ? ' · 이미지 필수' : ''}`;
    copy.append(name, detail);
    label.append(input, copy);
    listEl.appendChild(label);
  });
  if (savedChannelIds !== null) persistManualSnsSelectedChannels();
  syncManualSnsComposerState();
}

async function loadManualSnsComposer({ force = false } = {}) {
  if (manualSnsConfigLoading) return;
  if (!force && Array.isArray(manualSnsConfig.channels) && manualSnsConfig.channels.length > 0) {
    renderManualSnsChannels();
    return;
  }
  const listEl = document.getElementById('manual-sns-channel-list');
  if (listEl) {
    listEl.replaceChildren();
    const loadingEl = document.createElement('p');
    loadingEl.className = 'muted';
    loadingEl.textContent = 'Buffer 채널을 불러오는 중입니다.';
    listEl.appendChild(loadingEl);
  }
  manualSnsConfigLoading = true;
  try {
    const data = await fetchJson('/api/v1/social/manual/config');
    manualSnsConfig = {
      configured: data?.configured === true,
      local_media_available: data?.local_media_available === true,
      channels: Array.isArray(data?.channels) ? data.channels : [],
      ai: data?.ai && typeof data.ai === 'object'
        ? { available: data.ai.available === true, model_name: String(data.ai.model_name || '') }
        : { available: false, model_name: '' }
    };
    renderManualSnsChannels();
  } catch (error) {
    manualSnsConfig = { configured: false, local_media_available: false, channels: [], ai: { available: false, model_name: '' } };
    renderManualSnsChannels();
  } finally {
    manualSnsConfigLoading = false;
  }
}

function renderManualSnsAiStatus(message = '', isError = false) {
  const statusEl = document.getElementById('manual-sns-ai-status');
  if (!statusEl) return;
  statusEl.textContent = String(message || '');
  statusEl.classList.toggle('is-error', isError);
}

async function optimizeManualSnsText() {
  const textEl = document.getElementById('manual-sns-text');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  if (!textEl || !optimizeBtn || optimizeBtn.disabled || manualSnsOptimizationInFlight) return;

  const originalValue = String(textEl.value || '');
  const selectedChannels = getManualSnsSelectedChannels();
  manualSnsOptimizationInFlight = true;
  renderManualSnsAiStatus('Chat Model이 글과 해시태그를 다듬고 있습니다.');
  syncManualSnsComposerState();
  try {
    const data = await postJson('/api/v1/social/manual/optimize', {
      channelIds: selectedChannels.map((channel) => channel.id),
      text: originalValue.trim()
    });
    const optimizedText = String(data?.optimized_text || '').trim();
    if (!optimizedText) throw new Error('AI 최적화 결과가 비어 있습니다.');
    if (String(textEl.value || '') !== originalValue) {
      throw new Error('최적화 중 내용이 변경되어 결과를 반영하지 않았습니다. 다시 실행해 주세요.');
    }

    manualSnsOptimizationSnapshot = originalValue;
    textEl.value = optimizedText;
    textEl.dispatchEvent(new Event('input', { bubbles: true }));
    renderManualSnsAiStatus(data?.within_limit === true
      ? 'AI 최적화를 완료했습니다. 내용을 확인하고 필요하면 직접 수정하세요.'
      : 'AI 최적화를 완료했지만 선택한 채널의 글자 수 제한을 넘었습니다. 내용을 줄여 주세요.',
    data?.within_limit !== true);
    textEl.focus();
  } catch (error) {
    renderManualSnsAiStatus(`AI 최적화 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`, true);
  } finally {
    manualSnsOptimizationInFlight = false;
    syncManualSnsComposerState();
  }
}

function undoManualSnsOptimization() {
  const textEl = document.getElementById('manual-sns-text');
  if (!textEl || manualSnsOptimizationSnapshot === null || manualSnsOptimizationInFlight) return;
  textEl.value = manualSnsOptimizationSnapshot;
  manualSnsOptimizationSnapshot = null;
  textEl.dispatchEvent(new Event('input', { bubbles: true }));
  renderManualSnsAiStatus('AI 최적화 전 내용으로 되돌렸습니다.');
  textEl.focus();
}

function renderManualSnsPublishResult(data = {}) {
  const resultEl = document.getElementById('manual-sns-publish-result');
  if (!resultEl) return;
  resultEl.replaceChildren();
  resultEl.classList.add('is-visible');
  const heading = document.createElement('strong');
  heading.textContent = data.success
    ? `발행 완료 · ${Number(data.success_count || 0)}개 채널 성공`
    : `일부 발행 실패 · 성공 ${Number(data.success_count || 0)}개 / 실패 ${Number(data.failure_count || 0)}개`;
  resultEl.appendChild(heading);
  (Array.isArray(data.results) ? data.results : []).forEach((result) => {
    const row = document.createElement('div');
    row.className = `social-result-row ${result.success ? 'is-success' : 'is-error'}`;
    row.textContent = result.success
      ? `✅ ${result.channel_name || result.service} ${result.status === 'sent' ? '발행 성공' : '발행 요청 성공'}`
      : `❌ ${result.channel_name || result.service} 실패${result.message ? ` · ${result.message}` : ''}`;
    resultEl.appendChild(row);
  });
  if (data.media_cleanup?.retained === true) {
    const cleanupRow = document.createElement('div');
    cleanupRow.className = 'social-result-row is-error';
    cleanupRow.textContent = '⚠️ 발행 상태를 확인하지 못해 임시 이미지가 WordPress 미디어에 남아 있습니다.';
    resultEl.appendChild(cleanupRow);
  }
}

function readManualSnsFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function publishManualSns() {
  syncManualSnsComposerState();
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  if (!publishBtn || publishBtn.disabled) return;
  const text = String(document.getElementById('manual-sns-text')?.value || '').trim();
  const selectedChannels = getManualSnsSelectedChannels();
  const image = getManualSnsImageValidation();
  const confirmed = await showUiDialog({
    title: 'SNS 즉시 발행',
    message: `${selectedChannels.map((channel) => channel.name || channel.service).join(', ')}에 지금 발행할까요?`,
    showCancel: true,
    confirmText: '지금 발행',
    cancelText: '취소'
  });
  if (!confirmed) return;

  const resultEl = document.getElementById('manual-sns-publish-result');
  publishBtn.disabled = true;
  publishBtn.textContent = '발행 중...';
  if (resultEl) {
    resultEl.classList.add('is-visible');
    resultEl.textContent = image.mode === 'local'
      ? 'WordPress에 이미지를 임시 업로드하고 Buffer로 발행하고 있습니다.'
      : 'Buffer로 즉시 발행하고 있습니다.';
  }
  try {
    const localImage = image.mode === 'local' && image.file
      ? {
          fileName: image.file.name,
          mimeType: image.file.type,
          base64Data: await readManualSnsFileAsDataUrl(image.file)
        }
      : null;
    const data = await postJson('/api/v1/social/manual/publish', {
      channelIds: selectedChannels.map((channel) => channel.id),
      text,
      imageUrl: image.url,
      localImage
    });
    renderManualSnsPublishResult(data);
  } catch (error) {
    if (resultEl) {
      resultEl.classList.add('is-visible');
      resultEl.textContent = `❌ 발행 실패: ${error.message}`;
    }
  } finally {
    syncManualSnsComposerState();
  }
}

function initManualSnsComposer() {
  const textEl = document.getElementById('manual-sns-text');
  const imageUrlEl = document.getElementById('manual-sns-image-url');
  const imageRemoveBtn = document.getElementById('manual-sns-image-remove-btn');
  const imageFileEl = document.getElementById('manual-sns-image-file');
  const imageFileRemoveBtn = document.getElementById('manual-sns-image-file-remove-btn');
  const imageSourceUrlEl = document.getElementById('manual-sns-image-source-url');
  const imageSourceLocalEl = document.getElementById('manual-sns-image-source-local');
  const selectAllEl = document.getElementById('manual-sns-select-all');
  const publishBtn = document.getElementById('manual-sns-publish-btn');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  const undoBtn = document.getElementById('manual-sns-ai-undo-btn');
  textEl?.addEventListener('input', syncManualSnsComposerState);
  imageUrlEl?.addEventListener('input', () => {
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  });
  imageRemoveBtn?.addEventListener('click', () => {
    if (imageUrlEl) imageUrlEl.value = '';
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
    imageUrlEl?.focus();
  });
  imageFileEl?.addEventListener('change', () => {
    setManualSnsLocalImageFile(imageFileEl.files?.[0] || null);
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
  });
  imageFileRemoveBtn?.addEventListener('click', () => {
    setManualSnsLocalImageFile(null);
    if (imageFileEl) imageFileEl.value = '';
    syncManualSnsImagePreview();
    syncManualSnsComposerState();
    imageFileEl?.focus();
  });
  [imageSourceUrlEl, imageSourceLocalEl].forEach((radio) => {
    radio?.addEventListener('change', () => {
      syncManualSnsImagePreview();
      syncManualSnsComposerState();
    });
  });
  selectAllEl?.addEventListener('change', () => {
    const enabledInputs = Array.from(document.querySelectorAll('[data-manual-sns-channel]:not(:disabled)'));
    const shouldSelect = selectAllEl.checked;
    enabledInputs.forEach((input) => { input.checked = shouldSelect; });
    persistManualSnsSelectedChannels();
    syncManualSnsComposerState();
  });
  publishBtn?.addEventListener('click', () => void publishManualSns());
  optimizeBtn?.addEventListener('click', () => void optimizeManualSnsText());
  undoBtn?.addEventListener('click', undoManualSnsOptimization);
  syncManualSnsImageSourceUi();
  syncManualSnsComposerState();
}

async function navigateTo(viewName, subTab) {
  const requestedView = String(viewName || '').trim();
  const requestedSubTab = String(subTab || '').trim();
  if (isMobileQuickMode) {
    if (!['dashboard', 'blog', 'social', 'account'].includes(requestedView)) {
      viewName = 'blog';
      subTab = 'quick';
    } else if (requestedView === 'blog') {
      subTab = 'quick';
    }
  }

  if (viewName !== 'settings' && isSettingsViewActive() && settingsMajorHasPendingBasicChanges) {
    const canLeaveSettings = await confirmDiscardUnsavedSettings();
    if (!canLeaveSettings) return;
  }

  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  const views = Array.from(document.querySelectorAll('.view'));
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
  views.forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
  if (viewName === 'dashboard') {
    void ensureUpdateCheckFresh({ silent: true });
    loadDashboard();
    return;
  }
  if (viewName === 'logs') {
    const activeTab = document.querySelector('.logs-tab-btn.active');
    if (activeTab && activeTab.getAttribute('data-logs-tab') === 'system') {
      loadLogFiles();
    } else {
      loadDashboardLogs();
    }
    return;
  }
  if (viewName === 'account') {
    loadAccountOverview().catch((error) => console.warn('[Account Overview]', error.message));
    return;
  }
  if (viewName === 'social') {
    await loadManualSnsComposer({ force: true });
    return;
  }
  if (viewName === 'blog') {
    const ready = await ensureSheetsPreflightUi();
    if (!ready) return;
    if (subTab) {
      blogActiveTab = String(subTab).trim() || blogActiveTab;
    }
    activateBlogTab(blogActiveTab, { forceReload: true });
    return;
  }
  if (viewName === 'shopping') {
    const ready = await ensureSheetsPreflightUi();
    if (!ready) return;
    if (subTab) {
      shoppingActiveTab = String(subTab).trim() || shoppingActiveTab;
    }
    activateShoppingTab(shoppingActiveTab, { forceReload: true });
    return;
  }
  if (viewName === 'settings') {
    void ensureUpdateCheckFresh({ silent: true });
    const tab = subTab || settingsActiveTab;
    if (isSettingsViewActive()) {
      activateSettingsTab(tab, { forceReload: false });
      return;
    }
    loadSettingsMajor();
    activateSettingsTab(tab, { forceReload: true });
    return;
  }
}

function bindNavigation() {
  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      void navigateTo(btn.dataset.view);
    });
  });
}

function applyMobileQuickMode() {
  const nextMobileMode = window.innerWidth <= MOBILE_QUICK_MODE_BREAKPOINT;
  isMobileQuickMode = nextMobileMode;
  document.body.classList.toggle('mobile-quick-mode', nextMobileMode);

  if (!nextMobileMode) {
    hasInitializedMobileQuickEntry = false;
    return;
  }

  blogActiveTab = 'quick';

  const activeView = document.querySelector('.view.active')?.id?.replace(/^view-/, '') || '';
  const activeBlogTab = document.querySelector('.blog-tab-panel.active')?.id?.replace(/^blog-tab-/, '') || '';

  if (!hasInitializedMobileQuickEntry) {
    hasInitializedMobileQuickEntry = true;
    if (activeView !== 'blog' || activeBlogTab !== 'quick') {
      void navigateTo('blog', 'quick');
    }
    return;
  }

  if (activeView === 'blog' && activeBlogTab !== 'quick') {
    activateBlogTab('quick', { forceReload: false });
    return;
  }

  if (activeView && !['dashboard', 'blog'].includes(activeView)) {
    void navigateTo('blog', 'quick');
  }
}

function getSelectedBlogRowIndices() {
  return Array.from(blogSelectedRowIndices.values()).filter(v => Number.isInteger(v));
}

function getRecentBatchMeta(rowIndex) {
  return blogRecentBatchRows.get(rowIndex) || null;
}

function markRecentBatchRows(results) {
  for (const rowResult of (Array.isArray(results) ? results : [])) {
    const rowIndex = Number(rowResult?.rowIndex);
    if (!Number.isInteger(rowIndex)) continue;
    blogRecentBatchRows.set(rowIndex, {
      success: rowResult?.success === true
    });
  }
}

function clearPreviousBatchVisualState() {
  blogRecentBatchRows.clear();
  blogLastBatchResult = null;
  renderBlogLastBatchResult(null);
}

function clearBlogSelections() {
  blogSelectedRowIndices.clear();
  const selectors = Array.from(document.querySelectorAll('input.row-selector'));
  selectors.forEach(el => {
    el.checked = false;
  });
  updateBlogSelectionUi();
}

function updateBlogSelectionUi() {
  const count = blogSelectedRowIndices.size;
  const countText = document.getElementById('blog-selected-count');
  if (countText) countText.textContent = `${count}건 선택`;
}

function getPostStatusLabel(val) {
  const norm = String(val || 'publish').trim().toLowerCase();
  const map = { 'publish': '즉시 발행', 'draft': '임시 저장', 'schedule': '예약 발행' };
  return map[norm] || val || '-';
}

function getExecutionModeLabel(val) {
  const norm = String(val || '').trim().toLowerCase();
  const map = {
    'append_only': '시트 추가만',
    'append_and_generate': '시트 추가 + 생성',
    'append_and_publish': '시트 추가 + 실행',
    'publish': '즉시 실행'
  };
  return map[norm] || val || '-';
}

function renderBlogTable(items) {
  const tbody = document.getElementById('blog-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11">조회 결과가 없습니다.</td></tr>';
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const subject = escapeHtml(item.subject || '');
    const instruction = escapeHtml(item.content_guide?.additional_instructions || '');
    const referenceUrl = escapeHtml((item.content_guide?.reference_urls || []).join(', '));
    const runtimeLog = escapeHtml(item.runtimeLog || '');
    const keywords = (Array.isArray(item.keywords) ? item.keywords : [])
      .join(', ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const category = escapeHtml(item.category || '');
    const postStatusRaw = item.postStatus || 'publish';
    const postStatus = escapeHtml(getPostStatusLabel(postStatusRaw));
    const scheduleDate = escapeHtml(item.scheduleDate || '');
    const status = escapeHtml(item.status || '');
    const imageGeneration = Boolean(item.image_gen);
    const externalReference = Boolean(item.external_reference);
    const recentMeta = getRecentBatchMeta(item.rowIndex);
    const runningClass = runtimeLog ? 'running-row' : '';
    const recentClass = recentMeta ? (recentMeta.success ? 'recent-batch-success' : 'recent-batch-fail') : '';
    const subjectBadge = recentMeta
      ? `<span class="recent-badge ${recentMeta.success ? 'success' : 'fail'}">${recentMeta.success ? '방금 성공' : '방금 실패'}</span>`
      : '';
    const checked = blogSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    const imageChecked = imageGeneration ? 'checked' : '';
    const externalChecked = externalReference ? 'checked' : '';
    return `
      <tr class="${[runningClass, recentClass].filter(Boolean).join(' ')}" data-row-index="${item.rowIndex}">
        <td><input type="checkbox" class="row-selector" name="blog-row" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td class="editable-cell" data-field="postStatus">${postStatus}</td>
        <td class="editable-cell" data-field="subject">${subject || '-'}${subjectBadge}</td>
        <td class="editable-cell" data-field="keywords">${keywords || '-'}</td>
        <td class="editable-cell" data-field="instruction">${instruction || '-'}</td>
        <td class="editable-cell" data-field="referenceUrl">${referenceUrl || '-'}</td>
        <td class="toggle-cell"><input type="checkbox" class="inline-toggle" data-field="imageGeneration" data-row-index="${item.rowIndex}" ${imageChecked}></td>
        <td class="toggle-cell"><input type="checkbox" class="inline-toggle" data-field="externalReference" data-row-index="${item.rowIndex}" ${externalChecked}></td>
        <td class="runtime-log-cell">${runtimeLog}</td>
        <td class="editable-cell" data-field="status">${status || '-'}</td>
      </tr>
    `;
  }).join('');
  const blogSelectAll = document.getElementById('blog-table-select-all');
  if (blogSelectAll) blogSelectAll.checked = false;
  updateBlogSelectionUi();
  updateSortableHeadersUi();
}

function getEditableFieldValue(item, field) {
  if (!item) return '';
  if (field === 'category') return String(item.category || '');
  if (field === 'postStatus') return String(item.postStatus || 'publish');
  if (field === 'scheduleDate') return String(item.scheduleDate || '');
  if (field === 'subject') return String(item.subject || '');
  if (field === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  if (field === 'instruction') return String(item.content_guide?.additional_instructions || '');
  if (field === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
  if (field === 'status') return String(item.status || '');
  return '';
}

function isRuntimeRunning(item) {
  return Boolean(String(item?.runtimeLog || '').trim());
}

async function cancelBlogInlineEdit() {
  blogInlineEditState = null;
}

// --- Modal Editor Logic ---
let currentEditRowIndex = null;

async function openBlogTopicEditor(rowIndex) {
  const item = findTopicByRowIndex(rowIndex);
  if (!item) return;

  if (isRuntimeRunning(item)) {
    const resultBox = document.getElementById('blog-action-result');
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2}는 진행 중이라 수정할 수 없습니다.`;
    return;
  }

  currentEditRowIndex = rowIndex;
  const modal = document.getElementById('blog-edit-modal-backdrop');

  // Fill fields
  document.getElementById('blog-edit-subject').value = item.subject || '';
  document.getElementById('blog-edit-keywords').value = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
  document.getElementById('blog-edit-instruction').value = item.content_guide?.additional_instructions || '';
  document.getElementById('blog-edit-reference-url').value = Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join('\n') : '';
  document.getElementById('blog-edit-writing-strategy').value = item.writing_strategy || item.options?.writing_strategy || 'inherit';
  document.getElementById('blog-edit-schedule-date').value = (item.scheduleDate || '').replace(' ', 'T').substring(0, 16);

  // Category Parsing (N:..., W:...)
  let naverCategory = '';
  let wordpressCategory = '';
  const rawCat = item.category || '';
  if (rawCat.includes('N:') || rawCat.includes('W:')) {
    const nMatch = rawCat.match(/N:([^,]*)/);
    const wMatch = rawCat.match(/W:([^,]*)/);
    naverCategory = nMatch ? nMatch[1].trim() : '';
    wordpressCategory = wMatch ? wMatch[1].trim() : '';
  } else {
    // Legacy support: if no prefix, assume it's for both or just use as is
    naverCategory = rawCat;
    wordpressCategory = rawCat;
  }
  document.getElementById('blog-edit-naver-category').value = naverCategory;
  document.getElementById('blog-edit-wordpress-category').value = wordpressCategory;

  const statusTabText = document.getElementById('modal-blog-status-text');
  statusTabText.textContent = item.status || '대기';
  statusTabText.dataset.value = item.status || '대기';

  const postStatusMap = { 'publish': '즉시 발행', 'draft': '임시 저장', 'schedule': '예약 발행' };
  const postStatusValue = item.postStatus || 'publish';
  const postStatusText = document.getElementById('modal-blog-post-status-text');
  postStatusText.textContent = postStatusMap[postStatusValue] || postStatusValue;
  postStatusText.dataset.value = postStatusValue;

  // Checkboxes
  document.getElementById('blog-edit-image-required').checked = Boolean(item.image_gen);
  document.getElementById('blog-edit-external-ref').checked = Boolean(item.external_reference);

  // document.getElementById('blog-edit-result').textContent = '';
  modal.classList.remove('hidden');
}

function initModalCategorySearch(initialValue) {
  const searchInput = document.getElementById('modal-blog-category-search');
  const optionsContainer = document.getElementById('modal-blog-category-options');
  const triggerText = document.getElementById('modal-blog-category-text');

  searchInput.value = '';

  const renderOptions = (filter = '') => {
    optionsContainer.innerHTML = '';
    const categories = window.categoryCache ? ['', ...window.categoryCache.map(c => c.name)] : [''];

    const filtered = categories.filter(c => c.toLowerCase().includes(filter.toLowerCase()));
    if (filter && !filtered.includes(filter)) {
      filtered.unshift(filter);
    }

    filtered.forEach(cat => {
      const div = document.createElement('div');
      div.className = `custom-select-option ${cat === initialValue ? 'selected' : ''}`;
      div.textContent = cat || '(기본)';
      div.dataset.value = cat;
      div.onclick = () => {
        triggerText.textContent = cat || '(기본)';
        triggerText.dataset.value = cat;
        document.getElementById('modal-blog-category-container').classList.remove('open');
      };
      optionsContainer.appendChild(div);
    });
  };

  renderOptions();
  searchInput.oninput = () => renderOptions(searchInput.value);
}

function closeBlogTopicEditor() {
  document.getElementById('blog-edit-modal-backdrop').classList.add('hidden');
  currentEditRowIndex = null;
}

// ── 쇼핑 팝업 편집 ──────────────────────────────────────────
let currentShoppingEditRowIndex = null;

function openShoppingEditor(rowIndex) {
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) return;

  currentShoppingEditRowIndex = rowIndex;

  document.getElementById('shopping-edit-product').value = item.product || '';
  document.getElementById('shopping-edit-url').value = item.shortUrl || '';
  document.getElementById('shopping-edit-instruction').value = item.instruction || item.options?.instruction || '';
  document.getElementById('shopping-edit-schedule-date').value = (item.scheduleDate || '').replace(' ', 'T').substring(0, 16);

  // 카테고리 파싱 (N:..., W:...)
  let naverCategory = '';
  let wordpressCategory = '';
  const rawCat = item.category || '';
  if (rawCat.includes('N:') || rawCat.includes('W:')) {
    const nMatch = rawCat.match(/N:([^,]*)/);
    const wMatch = rawCat.match(/W:(.*)/);
    naverCategory = nMatch ? nMatch[1].trim() : '';
    wordpressCategory = wMatch ? wMatch[1].trim() : '';
  } else {
    naverCategory = rawCat;
    wordpressCategory = rawCat;
  }
  document.getElementById('shopping-edit-naver-category').value = naverCategory;
  document.getElementById('shopping-edit-wordpress-category').value = wordpressCategory;

  const postStatusMap = { 'publish': '즉시 발행', 'draft': '임시 저장', 'schedule': '예약 발행' };
  const postStatusValue = item.postStatus || 'publish';
  const postStatusText = document.getElementById('modal-shopping-post-status-text');
  postStatusText.textContent = postStatusMap[postStatusValue] || postStatusValue;
  postStatusText.dataset.value = postStatusValue;

  const statusText = document.getElementById('modal-shopping-status-text');
  statusText.textContent = item.status || '준비';
  statusText.dataset.value = item.status || '준비';

  document.getElementById('shopping-edit-result').textContent = '';
  document.getElementById('shopping-edit-modal-backdrop').classList.remove('hidden');
}

function closeShoppingEditor() {
  document.getElementById('shopping-edit-modal-backdrop').classList.add('hidden');
  currentShoppingEditRowIndex = null;
}

async function saveShoppingModifications() {
  if (currentShoppingEditRowIndex === null) return;
  const resultBox = document.getElementById('shopping-edit-result');
  const rowIndex = currentShoppingEditRowIndex;

  const product = document.getElementById('shopping-edit-product').value.trim();
  const shortUrl = document.getElementById('shopping-edit-url').value.trim();
  const instruction = document.getElementById('shopping-edit-instruction').value.trim();
  const naverCategory = document.getElementById('shopping-edit-naver-category').value.trim();
  const wordpressCategory = document.getElementById('shopping-edit-wordpress-category').value.trim();
  const scheduleDate = document.getElementById('shopping-edit-schedule-date').value.replace('T', ' ');
  const postStatus = document.getElementById('modal-shopping-post-status-text').dataset.value || 'publish';
  const status = document.getElementById('modal-shopping-status-text').dataset.value || '준비';

  const category = (naverCategory || wordpressCategory)
    ? `N:${naverCategory}, W:${wordpressCategory}`
    : '';

  const patch = {
    product, shortUrl, instruction, category, postStatus, status,
    scheduleDate: scheduleDate ? (scheduleDate.length === 16 ? scheduleDate + ':00' : scheduleDate) : ''
  };

  try {
    resultBox.textContent = '저장 중...';
    await saveShoppingRowPatch(rowIndex, patch, { silent: true });
    resultBox.textContent = '저장 완료';
    setTimeout(() => {
      closeShoppingEditor();
      loadBlogShopping({ silent: true });
    }, 500);
  } catch (err) {
    resultBox.textContent = `오류: ${err.message}`;
  }
}
// ────────────────────────────────────────────────────────────


async function saveBlogTopicModifications() {
  if (currentEditRowIndex === null) return;

  const resultBox = document.getElementById('blog-edit-result');
  const rowIndex = currentEditRowIndex;

  const subject = document.getElementById('blog-edit-subject').value.trim();
  const keywords = document.getElementById('blog-edit-keywords').value.trim();
  const instruction = document.getElementById('blog-edit-instruction').value.trim();
  const referenceUrl = document.getElementById('blog-edit-reference-url').value.trim();
  const writingStrategy = document.getElementById('blog-edit-writing-strategy').value;
  const scheduleDate = document.getElementById('blog-edit-schedule-date').value.replace('T', ' ');
  const naverCategory = document.getElementById('blog-edit-naver-category').value.trim();
  const wordpressCategory = document.getElementById('blog-edit-wordpress-category').value.trim();

  const status = document.getElementById('modal-blog-status-text').dataset.value || '대기';
  const postStatus = document.getElementById('modal-blog-post-status-text').dataset.value || 'publish';
  const isImageRequired = document.getElementById('blog-edit-image-required').checked;
  const isExternalRef = document.getElementById('blog-edit-external-ref').checked;

  const patch = {
    subject,
    keywords: normalizeCommaListText(keywords),
    instruction,
    referenceUrl: normalizeCommaListText(referenceUrl),
    writingStrategy,
    category: `N:${naverCategory}, W:${wordpressCategory}`,
    naverCategory,
    wordpressCategory,
    status,
    postStatus,
    imageGeneration: isImageRequired,
    externalReference: isExternalRef,
    scheduleDate: scheduleDate ? (scheduleDate.length === 16 ? scheduleDate + ':00' : scheduleDate) : ''
  };

  try {
    resultBox.textContent = '저장 중...';
    await saveBlogRowPatch(rowIndex, patch, { silent: true });
    resultBox.textContent = '저장 완료';
    setTimeout(() => {
      closeBlogTopicEditor();
      loadBlogTopics({ silent: true });
    }, 500);
  } catch (err) {
    resultBox.textContent = `오류: ${err.message}`;
  }
}

function renderBlogLastBatchResult(data) {
  const box = document.getElementById('blog-last-batch');
  if (!box) return;

  if (!data || !Array.isArray(data.results)) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const total = Number(data.requestedCount || data.results.length || 0);
  const success = Number(data.successCount || 0);
  const fail = Number(data.failCount || 0);
  const quotaMessage = String(data?.quotaPreflight?.message || '').trim();
  const lines = data.results.slice(0, 12).map((rowResult) => {
    const rowNo = Number.isInteger(Number(rowResult.rowIndex)) ? Number(rowResult.rowIndex) + 2 : '-';
    const label = rowResult.success ? '성공' : '실패';
    const message = rowResult.success
      ? (rowResult?.data?.status || '완료')
      : (rowResult?.message || rowResult?.code || '실패');
    return `<li>Row ${rowNo}: ${label} - ${escapeHtml(message)}</li>`;
  }).join('');
  const nowText = new Date().toLocaleString();

  box.innerHTML = `
    <div class="title">이번 실행 결과 (${nowText})</div>
    ${quotaMessage ? `<div>${escapeHtml(quotaMessage)}</div>` : ''}
    <div>요청 ${total}건 / 성공 ${success}건 / 실패 ${fail}건</div>
    <ul>${lines || '<li>결과 없음</li>'}</ul>
  `;
  box.classList.remove('hidden');
}

async function getPublishQuotaPreflight(selectedCount) {
  const license = await fetchJson('/api/v1/license/status?quiet=true');
  const selected = Math.max(0, Number(selectedCount || 0));
  const remainingValue = Number(license?.remaining);
  const unlimited = remainingValue === -1;
  const remaining = unlimited ? -1 : Math.max(0, Number.isFinite(remainingValue) ? remainingValue : 0);
  const executable = unlimited ? selected : Math.min(selected, remaining);
  return {
    selected,
    remaining,
    executable,
    unlimited,
    message: `${selected}건 선택 · 잔여 ${unlimited ? '무제한' : `${remaining}회`} · 최대 ${executable}건 실행`
  };
}

function findTopicByRowIndex(rowIndex) {
  return (blogTopicsCache || []).find(item => item.rowIndex === rowIndex) || null;
}

function buildBlogUpdatePayload(baseItem, patch = {}) {
  const safeItem = baseItem || {};
  return {
    rowIndex: safeItem.rowIndex,
    subject: String((patch.subject !== undefined ? patch.subject : safeItem.subject) || '').trim(),
    keywords: (patch.keywords !== undefined ? patch.keywords : (Array.isArray(safeItem.keywords) ? safeItem.keywords.join(', ') : '')).toString().trim(),
    instruction: String((patch.instruction !== undefined ? patch.instruction : safeItem.content_guide?.additional_instructions) || '').trim(),
    referenceUrl: (patch.referenceUrl !== undefined ? patch.referenceUrl : (Array.isArray(safeItem.content_guide?.reference_urls) ? safeItem.content_guide.reference_urls.join(', ') : '')).toString().trim(),
    status: String((patch.status !== undefined ? patch.status : safeItem.status) || '').trim(),
    category: String((patch.category !== undefined ? patch.category : safeItem.category) || '').trim(),
    postStatus: String((patch.postStatus !== undefined ? patch.postStatus : safeItem.postStatus) || '').trim(),
    scheduleDate: String((patch.scheduleDate !== undefined ? patch.scheduleDate : safeItem.scheduleDate) || '').trim(),
    imageGeneration: (patch.imageGeneration !== undefined ? patch.imageGeneration : Boolean(safeItem.image_gen)) === true,
    externalReference: (patch.externalReference !== undefined ? patch.externalReference : Boolean(safeItem.external_reference)) === true,
    writingStrategy: String((patch.writingStrategy !== undefined ? patch.writingStrategy : safeItem.writing_strategy) || 'inherit').trim()
  };
}

/**
 * 워드프레스 카테고리 목록을 서버에서 가져옵니다. (캐시 및 중복 요청 방지 포함)
 */
async function fetchWpCategories(options = {}) {
  const force = Boolean(options.force);
  if (!force && categoryCache) return categoryCache;
  if (categoryFetchPromise) return categoryFetchPromise;

  categoryFetchPromise = (async () => {
    try {
      const data = await fetchJson('/api/v1/wordpress/categories');
      if (Array.isArray(data)) {
        categoryCache = data;
        // 카테고리를 사용하는 UI들 갱신 요청 (이벤트 방식 대신 간단히 캐시 채우기)
        return data;
      }
      return null;
    } catch (e) {
      console.warn('WordPress categories fetch failed:', e);
      return null;
    } finally {
      categoryFetchPromise = null;
    }
  })();

  return categoryFetchPromise;
}

/**
 * 워드프레스 카테고리 캐시를 강제로 비웁니다. (설정 변경 시 등)
 */
function invalidateWpCategoryCache() {
  categoryCache = null;
  categoryFetchPromise = null;
}

async function fetchWpCategoriesSilently() {
  await fetchWpCategories();
}

async function saveBlogRowPatch(rowIndex, patch = {}, options = {}) {
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('blog-action-result');
  const item = findTopicByRowIndex(rowIndex);
  if (!item) throw new Error(`rowIndex(${rowIndex})를 찾지 못했습니다.`);

  // 1. 캐시를 즉시 업데이트 (race condition 방지)
  if (patch.imageGeneration !== undefined) item.image_gen = Boolean(patch.imageGeneration);
  if (patch.externalReference !== undefined) item.external_reference = Boolean(patch.externalReference);
  if (patch.subject !== undefined) item.subject = patch.subject;
  if (patch.keywords !== undefined) item.keywords = typeof patch.keywords === 'string'
    ? patch.keywords.split(',').map(k => k.trim()).filter(Boolean)
    : patch.keywords;
  if (patch.instruction !== undefined) {
    if (!item.content_guide) item.content_guide = {};
    item.content_guide.additional_instructions = patch.instruction;
  }
  if (patch.referenceUrl !== undefined) {
    if (!item.content_guide) item.content_guide = {};
    item.content_guide.reference_urls = typeof patch.referenceUrl === 'string'
      ? patch.referenceUrl.split(',').map(u => u.trim()).filter(Boolean)
      : patch.referenceUrl;
  }
  if (patch.status !== undefined) item.status = patch.status;
  if (patch.postStatus !== undefined) item.postStatus = patch.postStatus;
  if (patch.scheduleDate !== undefined) item.scheduleDate = patch.scheduleDate;
  if (patch.category !== undefined) item.category = patch.category;
  if (patch.writingStrategy !== undefined) {
    const value = ['search', 'discovery'].includes(patch.writingStrategy) ? patch.writingStrategy : '';
    item.writing_strategy = value;
    item.options = { ...(item.options || {}) };
    if (value) item.options.writing_strategy = value;
    else delete item.options.writing_strategy;
  }

  // 2. 즉시 재렌더링 (낙관적 업데이트)
  renderBlogTable(blogTopicsCache);

  const payload = buildBlogUpdatePayload(item, patch);
  if (!payload.subject) throw new Error('Subject는 비워둘 수 없습니다.');
  if (!silent && resultBox) resultBox.textContent = `row ${rowIndex + 2} 수정 중...`;

  const data = await postJson('/api/v1/blog/topic/update', payload);
  if (!silent && resultBox) resultBox.textContent = JSON.stringify(data, null, 2);

  // 3. write-lock: Google Sheets 전파 시간(~5s) 동안 loadBlogTopics가 재렌더링하지 않도록 막음
  blogTopicsWriteLockUntil = Date.now() + 6000;
  setTimeout(() => loadBlogTopics({ silent: true }), 6500);
}


async function loadBlogTopics(options = {}) {
  console.log("=== loadBlogTopics START ===", options);
  try {
    if (!guardUiConfigReady('블로그 목록 조회')) {
      console.log("loadBlogTopics: guardUiConfigReady returned false");
      return;
    }

    const silent = Boolean(options.silent);
    const skipRender = Boolean(options.skipRender);
    const pageInfo = getPageInfo('topics');
    const status = (document.getElementById('blog-status-filter')?.value || '').trim();
    const q = (document.getElementById('blog-q-filter')?.value || '').trim();
    const params = new URLSearchParams();
    const sortState = getSortState('topics');

    if (status) params.set('status', status);
    if (q) params.set('q', q);
    params.set('limit', String(pageInfo.limit));
    params.set('offset', String(pageInfo.offset));
    params.set('sortBy', String(sortState.key || 'rowNumber'));
    params.set('sortDir', String(sortState.direction || 'desc'));

    const resultBox = document.getElementById('blog-action-result');
    if (resultBox && !silent) resultBox.textContent = '블로그 목록 조회 중...';

    const writeLocked = Date.now() < blogTopicsWriteLockUntil;
    console.log("loadBlogTopics: fetching...", `/api/v1/blog/topics?${params.toString()}`);

    const data = await fetchJson(`/api/v1/blog/topics?${params.toString()}`);
    console.log("loadBlogTopics: fetch complete", data);

    const freshItems = Array.isArray(data?.items) ? data.items : [];
    if (!writeLocked && !skipRender) {
      blogTopicsCache = freshItems;
      setPageInfo('topics', {
        total: Number(data.total || 0),
        limit: Number(data.limit || pageInfo.limit || 50),
        offset: Number(data.offset || 0)
      });
      renderBlogTable(blogTopicsCache);
      renderTopicsPagination();
    } else {
      blogTopicsCache = freshItems;
    }
    if (resultBox && !silent) {
      resultBox.textContent = `조회 완료: ${data.total ?? blogTopicsCache.length}건`;
    }
  } catch (e) {
    console.error("=== FATAL ERROR in loadBlogTopics ===", e);
    const writeLocked = Date.now() < blogTopicsWriteLockUntil;
    const skipRender = Boolean(options.skipRender);
    if (!writeLocked && !skipRender) {
      blogTopicsCache = [];
      renderBlogTable([]);
      renderTopicsPagination();
    }
    const silent = Boolean(options.silent);
    const resultBox = document.getElementById('blog-action-result');
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

function renderBlogShoppingTable(items) {
  const tbody = document.getElementById('shopping-table-body');
  if (!tbody) return;

  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">조회 결과가 없습니다.</td></tr>';
    updateShoppingSelectionUi();
    updateSortableHeadersUi();
    return;
  }

  tbody.innerHTML = sourceItems.map(item => {
    const checked = blogShoppingSelectedRowIndices.has(item.rowIndex) ? 'checked' : '';
    const product = escapeHtml(item.product || '');
    const shortUrl = escapeHtml(item.shortUrl || '');
    const runtimeLog = escapeHtml(item.runtimeLog || '');
    const status = escapeHtml(item.status || '');
    const publishedAt = escapeHtml(item.publishedAt || '');
    const postStatusRaw = item.postStatus || 'publish';
    const postStatus = escapeHtml(getPostStatusLabel(postStatusRaw));
    const runningClass = runtimeLog ? 'running-row' : '';
    return `
      <tr class="${runningClass} clickable-row" data-row-index="${item.rowIndex}" title="더블클릭으로 편집" style="cursor:pointer;">
        <td><input type="checkbox" class="shopping-row-selector" value="${item.rowIndex}" ${checked}></td>
        <td>${item.rowNumber}</td>
        <td>${postStatus || '-'}</td>
        <td>${product || '-'}</td>
        <td>${shortUrl || '-'}</td>
        <td class="runtime-log-cell">${runtimeLog || ''}</td>
        <td>${status || '-'}</td>
        <td>${publishedAt || '-'}</td>
      </tr>
    `;
  }).join('');
  const shoppingSelectAll = document.getElementById('shopping-table-select-all');
  if (shoppingSelectAll) shoppingSelectAll.checked = false;
  updateShoppingSelectionUi();
  updateSortableHeadersUi();
}

async function loadBlogShopping(options = {}) {
  if (!guardUiConfigReady('쇼핑 목록 조회')) return;
  const silent = Boolean(options.silent);
  const pageInfo = getPageInfo('shopping');
  const status = (document.getElementById('shopping-status-filter')?.value || '').trim();
  const q = (document.getElementById('shopping-q-filter')?.value || '').trim();
  const params = new URLSearchParams();
  const sortState = getSortState('shopping');
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  params.set('limit', String(pageInfo.limit));
  params.set('offset', String(pageInfo.offset));
  params.set('sortBy', String(sortState.key || 'rowNumber'));
  params.set('sortDir', String(sortState.direction || 'desc'));

  const resultBox = document.getElementById('shopping-batch-result');
  if (resultBox && !silent) resultBox.textContent = '쇼핑 목록 조회 중...';

  try {
    const data = await fetchJson(`/api/v1/shopping/items?${params.toString()}`);
    blogShoppingCache = Array.isArray(data.items) ? data.items : [];
    setPageInfo('shopping', {
      total: Number(data.total || 0),
      limit: Number(data.limit || pageInfo.limit || 50),
      offset: Number(data.offset || 0)
    });
    renderBlogShoppingTable(blogShoppingCache);
    renderShoppingPagination();
    if (resultBox && !silent) {
      resultBox.textContent = `조회 완료: ${data.total ?? blogShoppingCache.length}건`;
    }
  } catch (e) {
    blogShoppingCache = [];
    renderBlogShoppingTable([]);
    renderShoppingPagination();
    if (resultBox && !silent) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function runShoppingBatchAction() {
  if (!guardUiConfigReady('선택 글감 포스팅')) return;
  const resultBox = document.getElementById('shopping-action-result');
  if (!resultBox) return;

  const rowIndices = Array.from(blogShoppingSelectedRowIndices.values()).filter(v => Number.isInteger(v));
  if (rowIndices.length === 0) {
    resultBox.textContent = '먼저 발행할 행을 1개 이상 선택하세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];

  const headless = Boolean(document.getElementById('shopping-batch-headless')?.checked);
  const targets = [];
  if (document.getElementById('shopping-batch-target-naver')?.checked) targets.push('naver');
  if (document.getElementById('shopping-batch-target-wordpress')?.checked) targets.push('wordpress');

  const preCheck = checkPublishPrerequisites(targets);
  if (!preCheck.ok) {
    resultBox.textContent = preCheck.message;
    return;
  }

  try {
    const quota = await getPublishQuotaPreflight(selectedSnapshot.length);
    if (quota.executable === 0) {
      resultBox.textContent = quota.message;
      return;
    }
    if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
      resultBox.textContent = '발행이 취소되었습니다.';
      return;
    }
  } catch (error) {
    resultBox.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }

  clearShoppingSelections();
  pauseDashboardPolling();

  try {
    await runWithLiveProgress({
      targetEl: resultBox,
      requestLabel: `쇼핑 일괄 발행 (${selectedSnapshot.length}건)`,
      requestFn: async () => {
        await loadBlogShopping({ silent: true });
        const data = await postJson('/api/v1/shopping/action', { action: 'batch', rowIndices: selectedSnapshot, headless, targets });
        return data;
      },
      onTick: () => loadBlogShopping({ silent: true })
    });
    await Promise.all([loadDashboard(), loadBlogShopping()]);
  } catch (e) {
    // runWithLiveProgress 이미 노출
  } finally {
    resumeDashboardPolling();
  }
}

function getShoppingEditableFieldValue(item, field) {
  if (!item) return '';
  if (field === 'product') return String(item.product || '');
  if (field === 'shortUrl') return String(item.shortUrl || '');
  if (field === 'status') return String(item.status || '');
  if (field === 'category') return String(item.category || '');
  if (field === 'postStatus') return String(item.postStatus || 'publish');
  if (field === 'scheduleDate') return String(item.scheduleDate || '');
  return '';
}

function isShoppingRuntimeRunning(item) {
  return Boolean(String(item?.runtimeLog || '').trim());
}

async function cancelShoppingInlineEdit() {
  if (!shoppingInlineEditState) return;
  const { cell, originalHtml } = shoppingInlineEditState;
  if (cell) cell.innerHTML = originalHtml;
  shoppingInlineEditState = null;
}

async function saveShoppingRowPatch(rowIndex, patch = {}, options = {}) {
  const silent = Boolean(options.silent);
  const resultBox = document.getElementById('shopping-batch-result');
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) throw new Error(`rowIndex(${rowIndex})를 찾지 못했습니다.`);

  // 1. 캐시를 즉시 업데이트 (race condition 방지)
  if (patch.product !== undefined) item.product = patch.product;
  if (patch.shortUrl !== undefined) item.shortUrl = patch.shortUrl;
  if (patch.instruction !== undefined) {
    item.instruction = patch.instruction;
    item.options = { ...(item.options || {}) };
    if (patch.instruction) item.options.instruction = patch.instruction;
    else delete item.options.instruction;
  }
  if (patch.status !== undefined) item.status = patch.status;
  if (patch.category !== undefined) item.category = patch.category;
  if (patch.postStatus !== undefined) item.postStatus = patch.postStatus;
  if (patch.scheduleDate !== undefined) item.scheduleDate = patch.scheduleDate;

  // 2. 즉시 재렌더링 (낙관적 업데이트)
  renderBlogShoppingTable(blogShoppingCache);

  const payload = {
    rowIndex,
    product: patch.product !== undefined ? String(patch.product || '').trim() : item.product,
    shortUrl: patch.shortUrl !== undefined ? String(patch.shortUrl || '').trim() : item.shortUrl,
    instruction: patch.instruction !== undefined ? String(patch.instruction || '').trim() : String(item.instruction || ''),
    status: patch.status !== undefined ? String(patch.status || '').trim() : item.status,
    category: patch.category !== undefined ? String(patch.category || '').trim() : item.category,
    postStatus: patch.postStatus !== undefined ? String(patch.postStatus || '').trim() : item.postStatus,
    scheduleDate: patch.scheduleDate !== undefined ? String(patch.scheduleDate || '').trim() : item.scheduleDate
  };

  if (!silent && resultBox) resultBox.textContent = `row ${rowIndex + 2} 수정 중...`;
  const data = await postJson('/api/v1/shopping/row/update', payload);
  if (!silent && resultBox) resultBox.textContent = JSON.stringify(data, null, 2);

  // 3. write-lock: Google Sheets 전파 시간(~5s) 동안 loadBlogShopping가 재렌더링하지 않도록 막음
  if (typeof blogShoppingWriteLockUntil !== 'undefined') {
    blogShoppingWriteLockUntil = Date.now() + 6000;
  }
  setTimeout(() => loadBlogShopping({ silent: true }), 6500);
}

async function commitShoppingInlineEdit() {
  if (!shoppingInlineEditState) return;

  const resultBox = document.getElementById('shopping-batch-result');
  const {
    rowIndex,
    field,
    editorEl,
    cell,
    originalHtml
  } = shoppingInlineEditState;

  let normalizedValue = String(editorEl?.value ?? '').trim();
  if (field === 'scheduleDate' && normalizedValue) {
    normalizedValue = normalizedValue.replace('T', ' ');
    if (normalizedValue.length === 16) normalizedValue += ':00';
  }
  const item = findShoppingByRowIndex(rowIndex);
  if (!item) {
    shoppingInlineEditState = null;
    await loadBlogShopping({ silent: true });
    return;
  }

  const beforeValue = getShoppingEditableFieldValue(item, field);
  if (normalizedValue === beforeValue) {
    cell.innerHTML = originalHtml;
    shoppingInlineEditState = null;
    return;
  }

  const patch = {};
  patch[field] = normalizedValue;

  try {
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 중...`;
    await saveShoppingRowPatch(rowIndex, patch, { silent: true });
    shoppingInlineEditState = null;
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2} inline 수정 완료`;
  } catch (e) {
    cell.innerHTML = originalHtml;
    shoppingInlineEditState = null;
    if (resultBox) resultBox.textContent = `오류: ${e.message}`;
  }
}

async function startShoppingInlineEdit(cell) {
  if (!cell) return;
  const row = cell.closest('tr[data-row-index]');
  if (!row) return;
  const rowIndex = Number(row.dataset.rowIndex);
  const field = String(cell.dataset.field || '');
  if (!Number.isInteger(rowIndex)) return;
  if (!['product', 'shortUrl', 'status', 'category', 'postStatus', 'scheduleDate'].includes(field)) return;

  const item = findShoppingByRowIndex(rowIndex);
  if (!item) return;
  if (isShoppingRuntimeRunning(item)) {
    const resultBox = document.getElementById('shopping-batch-result');
    if (resultBox) resultBox.textContent = `row ${rowIndex + 2}는 진행 중이라 수정할 수 없습니다.`;
    return;
  }

  if (shoppingInlineEditState) {
    if (shoppingInlineEditState.cell === cell) return;
    await cancelShoppingInlineEdit();
  }

  const originalHtml = cell.innerHTML;
  const initialValue = getShoppingEditableFieldValue(item, field);
  const multiline = false; // 쇼핑 테이블은 아직 멀티라인 필드 없음
  const useSelect = ['status', 'postStatus', 'category'].includes(field);
  const isDateTime = field === 'scheduleDate';
  let editorEl;

  if (useSelect) {
    editorEl = document.createElement('select');
    editorEl.className = 'inline-editor';
    let options = [];
    if (field === 'status') {
      options = ['', '준비', '발행 준비 완료', '발행 중', '발행 완료', '임시 저장 완료', '예약 포스팅 등록 완료', '실패'];
    } else if (field === 'postStatus') {
      options = ['publish', 'draft', 'schedule'];
    } else if (field === 'category') {
      options = [''];
      if (categoryCache) {
        options = ['', ...categoryCache.map(c => c.name)];
      } else {
        fetchWpCategories().then(() => {
          if (shoppingInlineEditState && shoppingInlineEditState.cell === cell && shoppingInlineEditState.field === 'category') {
            const currentVal = editorEl.value;
            editorEl.innerHTML = '';
            const newOpts = ['', ...categoryCache.map(c => c.name)];
            if (currentVal && !newOpts.includes(currentVal)) newOpts.push(currentVal);
            newOpts.forEach(optVal => {
              const opt = document.createElement('option');
              opt.value = optVal;
              opt.textContent = optVal || '(기본)';
              if (optVal === currentVal) opt.selected = true;
              editorEl.appendChild(opt);
            });
          }
        });
      }
      if (initialValue && !options.includes(initialValue)) {
        options.push(initialValue);
      }
    }

    for (const optionValue of options) {
      const opt = document.createElement('option');
      opt.value = optionValue;
      opt.textContent = optionValue || (field === 'category' ? '(기본)' : '(비움)');
      if (optionValue === initialValue) opt.selected = true;
      editorEl.appendChild(opt);
    }
  } else {
    editorEl = document.createElement('input');
    if (isDateTime) {
      editorEl.type = 'datetime-local';
    } else {
      editorEl.type = 'text';
    }
    editorEl.className = `inline-editor ${isDateTime ? 'datetime' : ''}`.trim();

    // scheduleDate 포맷 변환 (YYYY-MM-DD HH:mm:ss -> YYYY-MM-DDTHH:mm)
    let val = initialValue;
    if (isDateTime && val) {
      val = val.replace(' ', 'T').substring(0, 16);
    }
    editorEl.value = val;
  }

  cell.innerHTML = '';
  cell.appendChild(editorEl);
  editorEl.focus();
  if (!useSelect) editorEl.select?.();

  shoppingInlineEditState = {
    rowIndex,
    field,
    cell,
    editorEl,
    originalHtml,
    committing: false
  };

  editorEl.addEventListener('keydown', async (e) => {
    if (!shoppingInlineEditState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      await cancelShoppingInlineEdit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      shoppingInlineEditState.committing = true;
      await commitShoppingInlineEdit();
    }
  });

  editorEl.addEventListener('blur', async () => {
    if (!shoppingInlineEditState) return;
    if (shoppingInlineEditState.committing) return;
    shoppingInlineEditState.committing = true;
    await commitShoppingInlineEdit();
  });
}

async function runBlogBatchAction() {
  if (!guardUiConfigReady('선택 글감 포스팅')) return;
  const resultBox = document.getElementById('blog-action-result');
  if (!resultBox) return;

  const rowIndices = getSelectedBlogRowIndices();
  if (rowIndices.length === 0) {
    resultBox.textContent = '먼저 발행할 행을 1개 이상 선택하세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];

  const headless = Boolean(document.getElementById('blog-batch-headless')?.checked);
  const targets = [];
  if (document.getElementById('blog-batch-target-naver')?.checked) targets.push('naver');
  if (document.getElementById('blog-batch-target-wordpress')?.checked) targets.push('wordpress');

  const preCheck = checkPublishPrerequisites(targets);
  if (!preCheck.ok) {
    resultBox.textContent = preCheck.message;
    return;
  }

  try {
    const quota = await getPublishQuotaPreflight(selectedSnapshot.length);
    if (quota.executable === 0) {
      resultBox.textContent = quota.message;
      return;
    }
    if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
      resultBox.textContent = '발행이 취소되었습니다.';
      return;
    }
  } catch (error) {
    resultBox.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }

  clearBlogSelections();
  clearPreviousBatchVisualState();
  pauseDashboardPolling();

  try {
    const data = await runWithLiveProgress({
      targetEl: resultBox,
      requestLabel: `블로그 일괄 발행 (${selectedSnapshot.length}건)`,
      requestFn: async () => {
        await loadBlogTopics({ silent: true });
        const res = await postJson('/api/v1/blog/action', { action: 'batch', rowIndices: selectedSnapshot, headless, targets });
        return res;
      },
      onTick: () => loadBlogTopics({ silent: true })
    });
    blogLastBatchResult = data;
    markRecentBatchRows(data?.results || []);
    renderBlogLastBatchResult(blogLastBatchResult);
    await Promise.all([loadDashboard(), loadBlogTopics()]);
  } catch (e) {
    // runWithLiveProgress 이미 노출
  } finally {
    resumeDashboardPolling();
  }
}

const BLOG_WRITING_STYLE_PREVIEWS = {
  'conversational:polite': {
    description: '친근하고 자연스러운 후기형 문체',
    example: '직접 써보니 생각보다 편했고, 처음 쓰는 분도 금방 익힐 수 있어요.'
  },
  'conversational:plain': {
    description: '편안하고 자유로운 일기·SNS형 문체',
    example: '직접 써보니 생각보다 편했고, 처음 써도 금방 익힐 수 있어.'
  },
  'written:polite': {
    description: '정돈되고 신뢰감 있는 정보·전문형 문체',
    example: '직접 사용해 본 결과 편의성이 높았으며, 처음 사용하는 경우에도 쉽게 익힐 수 있습니다.'
  },
  'written:plain': {
    description: '간결하고 객관적인 설명문·칼럼형 문체',
    example: '직접 사용해 본 결과 편의성이 높았고, 처음 사용하는 경우에도 쉽게 익힐 수 있다.'
  }
};
let currentBlogWritingStrategy = 'search';

function getSelectedSettingsRadioValue(name, fallback) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function setSelectedSettingsRadioValue(name, value, fallback) {
  const targetValue = String(value || fallback);
  const target = document.querySelector(`input[name="${name}"][value="${targetValue}"]`)
    || document.querySelector(`input[name="${name}"][value="${fallback}"]`);
  if (target) target.checked = true;
}

function syncSettingsBlogWritingStyleDescription() {
  const writingMode = getSelectedSettingsRadioValue('settings-blog-writing-mode', 'conversational');
  const speechLevel = getSelectedSettingsRadioValue('settings-blog-speech-level', 'polite');
  const preview = BLOG_WRITING_STYLE_PREVIEWS[`${writingMode}:${speechLevel}`]
    || BLOG_WRITING_STYLE_PREVIEWS['conversational:polite'];
  const descriptionTarget = document.querySelector('#settings-blog-writing-style-description strong');
  const exampleTarget = document.getElementById('settings-blog-writing-style-example');
  if (descriptionTarget) descriptionTarget.textContent = preview.description;
  if (exampleTarget) exampleTarget.textContent = `(예시: ${preview.example})`;
}

function getWritingStrategyLabel(value) {
  return value === 'discovery' ? '발견 중심 (피드)' : '검색 중심';
}

function syncWritingStrategyInheritanceLabels() {
  const label = `기본 설정 사용 (현재: ${getWritingStrategyLabel(currentBlogWritingStrategy)})`;
  const inheritOption = document.querySelector('#blog-edit-writing-strategy option[value="inherit"]');
  if (inheritOption) inheritOption.textContent = label;
  setSelectedSettingsRadioValue('quick-writing-strategy', currentBlogWritingStrategy, 'search');
}

function syncSettingsBlogWritingStrategyDescription() {
  currentBlogWritingStrategy = getSelectedSettingsRadioValue('settings-blog-writing-strategy', 'search') === 'discovery'
    ? 'discovery'
    : 'search';
  const target = document.querySelector('#settings-blog-writing-strategy-description strong');
  if (target) {
    target.textContent = currentBlogWritingStrategy === 'discovery'
      ? '피드에서 발견한 독자의 관심과 읽기 흐름을 고려합니다.'
      : '검색 의도와 핵심 정보를 명확하게 전달합니다.';
  }
  syncWritingStrategyInheritanceLabels();
}

function normalizeSettingsBufferChannels(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  return source
    .map((item) => ({
      id: String(item?.id || '').trim(),
      name: String(item?.display_name || item?.name || item?.descriptor || '').trim(),
      display_name: String(item?.display_name || item?.name || item?.descriptor || '').trim(),
      service: String(item?.service || '').trim().toLowerCase(),
      avatar: String(item?.avatar || '').trim(),
      is_disconnected: item?.is_disconnected === true,
      is_locked: item?.is_locked === true
    }))
    .filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function isSettingsBufferChannelUnsupported(channel) {
  const service = String(channel?.service || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['tiktok', 'youtube', 'youtubeshorts'].includes(service);
}

function getSelectedSettingsBufferChannels() {
  return settingsBufferChannels
    .filter((channel) => (
      settingsBufferSelectedChannelIds.has(channel.id)
      && !isSettingsBufferChannelUnsupported(channel)
    ))
    .slice(0, 3)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      display_name: channel.display_name,
      service: channel.service,
      avatar: channel.avatar
    }));
}

function renderSettingsBufferOrganizations(selectedId = '') {
  const selectEl = document.getElementById('settings-buffer-organization');
  if (!selectEl) return;
  const targetId = String(selectedId || '').trim();
  selectEl.innerHTML = '';

  if (settingsBufferOrganizations.length === 0) {
    const option = document.createElement('option');
    option.value = targetId;
    option.textContent = targetId ? `저장된 Organization (${targetId})` : 'API Key 연결 확인이 필요합니다';
    selectEl.appendChild(option);
    return;
  }

  if (settingsBufferOrganizations.length > 1) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Organization을 선택하세요';
    selectEl.appendChild(placeholder);
  }
  settingsBufferOrganizations.forEach((organization) => {
    const option = document.createElement('option');
    option.value = organization.id;
    option.textContent = organization.name || organization.id;
    selectEl.appendChild(option);
  });
  selectEl.value = settingsBufferOrganizations.some((item) => item.id === targetId) ? targetId : '';
}

function renderSettingsBufferChannels() {
  const containerEl = document.getElementById('settings-buffer-channel-list');
  if (!containerEl) return;
  containerEl.innerHTML = '';

  if (settingsBufferChannels.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'sns-empty-message';
    emptyEl.textContent = 'Organization을 선택하고 연결 확인을 완료하면 채널이 표시됩니다.';
    containerEl.appendChild(emptyEl);
    return;
  }

  settingsBufferChannels.forEach((channel) => {
    const unsupported = isSettingsBufferChannelUnsupported(channel);
    if (unsupported) settingsBufferSelectedChannelIds.delete(channel.id);
    const labelEl = document.createElement('label');
    labelEl.className = 'settings-checkbox-label';
    const checkEl = document.createElement('input');
    checkEl.type = 'checkbox';
    checkEl.checked = settingsBufferSelectedChannelIds.has(channel.id);
    checkEl.disabled = channel.is_disconnected || channel.is_locked || unsupported;
    checkEl.addEventListener('change', () => {
      if (checkEl.checked && settingsBufferSelectedChannelIds.size >= 3) {
        checkEl.checked = false;
        showUiToast({
          level: 'warning',
          title: '채널 선택 제한',
          message: 'SNS 발행 채널은 최대 3개까지 선택할 수 있습니다.',
          dedupeKey: 'buffer-channel-limit'
        });
        return;
      }
      if (checkEl.checked) settingsBufferSelectedChannelIds.add(channel.id);
      else settingsBufferSelectedChannelIds.delete(channel.id);
      scheduleSettingsMajorAutoSave({ immediate: true });
    });

    const textEl = document.createElement('span');
    const stateLabel = channel.is_disconnected
      ? ' · 연결 끊김'
      : (channel.is_locked ? ' · 잠김' : (unsupported ? ' · 지원 제외' : ''));
    textEl.textContent = `${channel.display_name || channel.name || channel.id} · ${channel.service || 'unknown'}${stateLabel}`;
    labelEl.append(checkEl, textEl);
    containerEl.appendChild(labelEl);
  });
}

function syncSettingsBufferHelpLink(url = '') {
  const wrapEl = document.getElementById('settings-buffer-help-wrap');
  const linkEl = document.getElementById('settings-buffer-help-link');
  const normalizedUrl = String(url || '').trim() || DEFAULT_BUFFER_HELP_URL;
  if (linkEl) linkEl.href = normalizedUrl;
  if (wrapEl) wrapEl.style.display = '';
}

function syncSettingsSnsAiHint() {
  const modeEl = document.getElementById('settings-sns-ai-mode');
  const hintEl = document.getElementById('settings-sns-ai-hint');
  if (!modeEl || !hintEl) return;

  if (modeEl.value === 'blog_text') {
    const modelName = (
      document.getElementById('settings-text-model-name')?.value
      || document.getElementById('settings-text-model-preset-code')?.value
      || ''
    ).trim();
    const hasApiKey = Boolean(getSettingsInputValue('settings-text-model-api-key').trim());
    hintEl.textContent = hasApiKey
      ? `설정된 Text Model${modelName ? ` (${modelName})` : ''}을 SNS 콘텐츠 처리에 사용합니다. 현재는 글당 해시태그 생성에 사용합니다.`
      : 'Text Model API Key가 없어 현재 SNS AI 작업을 실행하지 않습니다. AI 설정에서 확인해 주세요.';
    return;
  }

  if (modeEl.value === 'chat') {
    const source = getSelectedSettingsRadioValue('settings-chat-model-source', 'writing');
    const prefix = source === 'writing' ? 'text' : 'chat';
    const modelName = (
      document.getElementById(`settings-${prefix}-model-name`)?.value
      || document.getElementById(`settings-${prefix}-model-preset-code`)?.value
      || ''
    ).trim();
    hintEl.textContent = `Chat Model${modelName ? ` (${modelName})` : ''}을 SNS 콘텐츠 처리에 사용합니다. 현재는 글당 해시태그 생성에 사용합니다.`;
    return;
  }

  hintEl.textContent = 'SNS 콘텐츠 처리에 AI를 사용하지 않습니다.';
}

function formatSettingsSnsRuntimeStatus(sns = {}) {
  const lines = [];
  if (sns.running) {
    lines.push('현재 RSS 확인 또는 SNS 발행을 처리하고 있습니다.');
  } else if (sns.enabled) {
    lines.push('자동 처리 대기 중');
  } else {
    lines.push('SNS 자동 발행이 비활성화되어 있습니다.');
  }

  if (sns.nextRunAt) {
    lines.push(`다음 자동 처리: ${formatDateTimeAbsolute(sns.nextRunAt)} (${formatNextRunText(sns.nextRunAt)})`);
  } else if (sns.enabled && !sns.running) {
    lines.push('다음 자동 처리 시각이 아직 예약되지 않았습니다.');
  }

  if (sns.lastRunAt) {
    lines.push(`마지막 실행: ${formatDateTimeAbsolute(sns.lastRunAt)}`);
  } else {
    lines.push('마지막 실행: 아직 실행되지 않음');
  }

  const lastResult = sns.lastResult;
  const automationData = lastResult?.data?.discovery || lastResult?.data?.distribution
    ? lastResult.data
    : null;
  const discoveryResult = automationData?.discovery || (
    String(lastResult?.code || '').startsWith('SNS_DISCOVERY_') ? lastResult : null
  );
  const distributionResult = automationData?.distribution || (
    String(lastResult?.code || '').startsWith('SNS_DISTRIBUTION_') ? lastResult : null
  );

  if (discoveryResult?.success) {
    const data = discoveryResult.data || {};
    lines.push(
      `RSS 결과: 발견 ${Number(data.discoveredCount || 0)}건 · 신규 원문 ${Number(data.newEntryCount || 0)}건 · SNS 행 ${Number(data.addedDeliveryCount || 0)}건 · 중복 ${Number(data.duplicateCount || 0)}건`
    );
    const unavailableSources = Array.isArray(data.unavailableSourceBlogs)
      ? data.unavailableSourceBlogs
      : [];
    if (unavailableSources.length > 0) {
      const labels = unavailableSources.map((source) => source === 'naver' ? '네이버 블로그' : 'WordPress');
      lines.push(`미설정으로 제외: ${labels.join(', ')}`);
    }
  }
  if (distributionResult) {
    const data = distributionResult.data || {};
    if (distributionResult.code === 'SNS_DISTRIBUTION_EMPTY') {
      lines.push('발행 결과: 대기 중인 원문 글 없음');
    } else {
      lines.push(
        `발행 결과: 성공 ${Number(data.completedCount || 0)}건 · 실패 ${Number(data.failedCount || 0)}건 · 건너뜀 ${Number(data.skippedCount || 0)}건`
      );
    }
  }
  if (!discoveryResult && !distributionResult && lastResult?.message) {
    lines.push(`마지막 결과: ${lastResult.message}`);
  }
  return lines.join('\n');
}

async function loadSettingsSnsRuntimeStatus() {
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (!resultEl) return null;
  try {
    const data = await fetchJson('/api/v1/auto/status');
    resultEl.textContent = formatSettingsSnsRuntimeStatus(data?.sns || {});
    return data?.sns || {};
  } catch (error) {
    resultEl.textContent = `상태 확인 실패: ${error.message}`;
    return null;
  }
}

async function runSettingsSnsCheckNow() {
  if (settingsSnsCheckInFlight) return;
  const buttonEl = document.getElementById('settings-sns-check-now-btn');
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (settingsMajorHasPendingBasicChanges) {
    if (resultEl) resultEl.textContent = '변경한 설정을 먼저 저장한 뒤 확인해 주세요.';
    return;
  }

  settingsSnsCheckInFlight = true;
  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) resultEl.textContent = 'RSS를 확인하는 중입니다...';
  try {
    const result = await postJson('/api/v1/auto/collect/sns/run', {});
    const data = result?.data || {};
    if (resultEl) {
      resultEl.textContent = [
        'RSS 확인 완료',
        `발견 ${Number(data.discoveredCount || 0)}건 · 신규 원문 ${Number(data.newEntryCount || 0)}건 · SNS 행 ${Number(data.addedDeliveryCount || 0)}건 · 중복 ${Number(data.duplicateCount || 0)}건`
      ].join('\n');
    }
    await loadSettingsSnsRuntimeStatus();
  } catch (error) {
    if (resultEl) resultEl.textContent = `RSS 확인 실패: ${error.message}`;
  } finally {
    settingsSnsCheckInFlight = false;
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function runSettingsSnsPublishNow() {
  if (settingsSnsPublishInFlight) return;
  const buttonEl = document.getElementById('settings-sns-publish-now-btn');
  const resultEl = document.getElementById('settings-sns-runtime-result');
  if (settingsMajorHasPendingBasicChanges) {
    if (resultEl) resultEl.textContent = '변경한 설정을 먼저 저장한 뒤 발행해 주세요.';
    return;
  }
  const confirmed = window.confirm(
    'SNS 시트에서 가장 앞선 대기 원문 글 1건을 선택된 모든 Buffer 채널에 즉시 발행할까요?'
  );
  if (!confirmed) return;

  settingsSnsPublishInFlight = true;
  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) resultEl.textContent = '대기 중인 원문 글을 SNS에 발행하는 중입니다...';
  try {
    const result = await postJson('/api/v1/auto/publish/sns/run', {});
    const data = result?.data || {};
    if (resultEl) {
      resultEl.textContent = `발행 완료: 성공 ${Number(data.completedCount || 0)}건 · 실패 ${Number(data.failedCount || 0)}건 · 건너뜀 ${Number(data.skippedCount || 0)}건`;
    }
    await loadSettingsSnsRuntimeStatus();
  } catch (error) {
    if (resultEl) resultEl.textContent = `SNS 발행 확인 필요: ${error.message}`;
    await loadSettingsSnsRuntimeStatus();
  } finally {
    settingsSnsPublishInFlight = false;
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function inspectSettingsBufferConnection(organizationId = '') {
  const apiKey = getSettingsInputValue('settings-buffer-api-key').trim();
  const connectBtn = document.getElementById('settings-buffer-connect-btn');
  const resultEl = document.getElementById('settings-buffer-connection-result');
  if (!apiKey) {
    if (resultEl) resultEl.textContent = 'Buffer API Key를 입력해 주세요.';
    return;
  }

  if (connectBtn) connectBtn.disabled = true;
  if (resultEl) resultEl.textContent = 'Buffer 연결을 확인하는 중...';
  try {
    const data = await postJson('/api/v1/settings/buffer-connection', {
      apiKey,
      organizationId: String(organizationId || '').trim()
    });
    settingsBufferOrganizations = Array.isArray(data.organizations) ? data.organizations : [];
    renderSettingsBufferOrganizations(data.organization_id || organizationId);

    settingsBufferChannels = normalizeSettingsBufferChannels(data.channels);
    const availableIds = new Set(
      settingsBufferChannels
        .filter((channel) => !isSettingsBufferChannelUnsupported(channel))
        .map((channel) => channel.id)
    );
    settingsBufferSelectedChannelIds = new Set(
      Array.from(settingsBufferSelectedChannelIds).filter((id) => availableIds.has(id))
    );
    renderSettingsBufferChannels();

    if (resultEl) {
      resultEl.textContent = data.organization_id
        ? `연결됨 · Organization ${settingsBufferOrganizations.find((item) => item.id === data.organization_id)?.name || data.organization_id} · 채널 ${settingsBufferChannels.length}개`
        : `연결됨 · Organization ${settingsBufferOrganizations.length}개 중 하나를 선택해 주세요.`;
    }
    if (data.organization_id) scheduleSettingsMajorAutoSave({ immediate: true });
  } catch (error) {
    settingsBufferChannels = [];
    renderSettingsBufferChannels();
    if (resultEl) resultEl.textContent = `연결 실패: ${error.message}`;
  } finally {
    if (connectBtn) connectBtn.disabled = false;
  }
}

function applySettingsMajorToForm(data, options = {}) {
  const fields = data?.fields || {};
  const skipFocused = options.skipFocused === true;

  // 저장 직후 폼을 다시 채울 때, 현재 포커스된 필드를 덮어쓰지 않기 위한 래퍼 함수
  const sv = (el, val) => {
    if (!el) return;
    if (skipFocused && document.activeElement === el) return;
    if (isManagedSettingsSecretField(el)) {
      setManagedSettingsSecretValue(el, val);
      return;
    }
    el.value = String(val);
  };
  const sc = (el, val) => {
    if (!el) return;
    if (skipFocused && document.activeElement === el) return;
    el.checked = Boolean(val);
  };

  const listenHostEl = document.getElementById('settings-listen-host');
  const listenPortEl = document.getElementById('settings-listen-port');
  const mcpRemoteEnabledEl = document.getElementById('settings-mcp-remote-enabled');
  const mcpRemoteHostEl = document.getElementById('settings-mcp-remote-host');
  const mcpRemotePortEl = document.getElementById('settings-mcp-remote-port');
  const mcpRemotePathEl = document.getElementById('settings-mcp-remote-path');
  const mcpRemoteAuthTokenEl = document.getElementById('settings-mcp-remote-auth-token');
  const naverIdEl = document.getElementById('settings-naver-id');
  const wordpressUrlEl = document.getElementById('settings-wordpress-url');
  const wordpressUserIdEl = document.getElementById('settings-wordpress-user-id');
  const wordpressAppPasswordEl = document.getElementById('settings-wordpress-app-password');
  const sheetUrlEl = document.getElementById('settings-google-sheet-url');
  const updateServerTypeEl = document.getElementById('settings-update-server-type');
  const updateMirrorRepoEl = document.getElementById('settings-update-mirror-repo');
  const customUpdateCheckUrlEl = document.getElementById('settings-custom-update-check-url');
  const updateChannelDisplayEl = document.getElementById('settings-update-channel-display');

  const typingEl = document.getElementById('settings-typing-speed');
  const blogCollectTrendsEnabledEl = document.getElementById('blog-collect-trends-enabled');
  const blogCollectTrendsTimeEl = document.getElementById('blog-collect-trends-time');
  const blogCollectTrendsFilterNewEl = document.getElementById('blog-collect-trends-filter-new');
  const blogCollectTrendsFilterDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const blogCollectTrendsFilterNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const blogCollectTrendsFilterTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const blogCollectTrendsFilterMinEl = document.getElementById('blog-collect-trends-filter-min');
  const blogCollectTrendsFilterTopEl = document.getElementById('blog-collect-trends-filter-top');
  const blogCollectTrendsReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');

  const blogPublishAutoEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const blogPublishAutoBatchEl = document.getElementById('blog-publish-auto-batch');
  const blogPublishAutoIntervalEl = document.getElementById('blog-publish-auto-interval');
  const blogPublishAutoPostStatusEl = document.getElementById('blog-publish-auto-post-status');
  const blogPublishAutoHeadlessEl = document.getElementById('blog-publish-auto-headless');
  const shoppingPublishAutoEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const shoppingPublishAutoBatchEl = document.getElementById('shopping-publish-auto-batch');
  const shoppingPublishAutoIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const shoppingPublishAutoHeadlessEl = document.getElementById('shopping-publish-auto-headless');
  const shoppingPublishAutoNotifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  const blogPublishAutoNotifyEnabledEl = document.getElementById('blog-publish-auto-notify-enabled');

  const telegramEnabledEl = document.getElementById('settings-notify-telegram-enabled');
  const telegramBotTokenEl = document.getElementById('settings-notify-telegram-bot-token');
  const telegramChatIdEl = document.getElementById('settings-notify-telegram-chat-id');
  const bitlyTokenEl = document.getElementById('settings-notify-bitly-token');
  const textModelPresetProviderEl = document.getElementById('settings-text-model-preset-provider');
  const textModelPresetCodeEl = document.getElementById('settings-text-model-preset-code');
  const textModelNameEl = document.getElementById('settings-text-model-name');
  const textModelBaseUrlEl = document.getElementById('settings-text-model-base-url');
  const textModelApiKeyEl = document.getElementById('settings-text-model-api-key');
  const imageModelPresetProviderEl = document.getElementById('settings-image-model-preset-provider');
  const imageModelPresetCodeEl = document.getElementById('settings-image-model-preset-code');
  const imageModelNameEl = document.getElementById('settings-image-model-name');
  const imageModelBaseUrlEl = document.getElementById('settings-image-model-base-url');
  const imageModelApiKeyEl = document.getElementById('settings-image-model-api-key');
  const chatModelPresetProviderEl = document.getElementById('settings-chat-model-preset-provider');
  const chatModelPresetCodeEl = document.getElementById('settings-chat-model-preset-code');
  const chatModelNameEl = document.getElementById('settings-chat-model-name');
  const chatModelBaseUrlEl = document.getElementById('settings-chat-model-base-url');
  const chatModelApiKeyEl = document.getElementById('settings-chat-model-api-key');
  const slackEnabledEl = document.getElementById('settings-notify-slack-enabled');
  const slackWebhookUrlEl = document.getElementById('settings-notify-slack-webhook-url');
  const bufferApiKeyEl = document.getElementById('settings-buffer-api-key');
  const bufferOrganizationEl = document.getElementById('settings-buffer-organization');
  const snsPublishEnabledEl = document.getElementById('settings-sns-publish-enabled');
  const snsPublishIntervalEl = document.getElementById('settings-sns-publish-interval');
  const snsAiModeEl = document.getElementById('settings-sns-ai-mode');

  settingsMajorApplyingForm = true;

  sv(listenHostEl, fields.LISTEN_HOST || '127.0.0.1');
  sv(listenPortEl, fields.LISTEN_PORT || 4577);
  sc(mcpRemoteEnabledEl, fields.MCP_REMOTE_ENABLED ?? false);
  sv(mcpRemoteHostEl, fields.MCP_REMOTE_HOST || '127.0.0.1');
  sv(mcpRemotePortEl, fields.MCP_REMOTE_PORT || 4578);
  sv(mcpRemotePathEl, fields.MCP_REMOTE_PATH || '/mcp');
  sv(mcpRemoteAuthTokenEl, fields.MCP_REMOTE_AUTH_TOKEN || '');
  settingsMcpRuntimeStatus = data?.remoteMcpStatus || null;
  settingsMcpTokenVisible = false;
  sv(naverIdEl, fields.NAVER_ID || '');
  sv(wordpressUrlEl, fields.WORDPRESS_URL || '');
  sv(wordpressUserIdEl, fields.WORDPRESS_USER_ID || '');
  sv(wordpressAppPasswordEl, fields.WORDPRESS_APP_PASSWORD || '');
  setSelectedSettingsRadioValue('settings-blog-writing-mode', fields.BLOG_WRITING_MODE, 'conversational');
  setSelectedSettingsRadioValue('settings-blog-speech-level', fields.BLOG_SPEECH_LEVEL, 'polite');
  setSelectedSettingsRadioValue('settings-blog-writing-strategy', fields.BLOG_WRITING_STRATEGY, 'search');
  syncSettingsBlogWritingStyleDescription();
  syncSettingsBlogWritingStrategyDescription();
  sv(sheetUrlEl, fields.GOOGLE_SHEET_URL || '');
  sv(updateServerTypeEl, fields.UPDATE_SERVER_TYPE || 'github');
  sv(updateMirrorRepoEl, fields.UPDATE_MIRROR_REPO || 'delta898/NaverAutoBlog-Releases');
  sv(customUpdateCheckUrlEl, fields.CUSTOM_UPDATE_CHECK_URL || '');
  if (data?.aiPresets) {
    settingsAiPresets = data.aiPresets;
  }
  settingsAiProviderProfiles = normalizeSettingsAiProviderProfiles(data?.aiProviderProfiles);
  if (textModelPresetProviderEl) {
    textModelPresetProviderEl.dataset.desiredValue = fields.TEXT_MODEL_PROVIDER || 'google';
  }
  if (textModelPresetCodeEl) {
    textModelPresetCodeEl.dataset.desiredValue = fields.TEXT_MODEL_PRESET_CODE || '';
  }
  sv(textModelNameEl, fields.TEXT_MODEL_NAME || '');
  sv(textModelBaseUrlEl, fields.TEXT_MODEL_BASE_URL || '');
  sv(textModelApiKeyEl, fields.TEXT_MODEL_API_KEY || '');
  if (imageModelPresetProviderEl) {
    imageModelPresetProviderEl.dataset.desiredValue = fields.IMAGE_MODEL_PROVIDER || 'google';
  }
  if (imageModelPresetCodeEl) {
    imageModelPresetCodeEl.dataset.desiredValue = fields.IMAGE_MODEL_PRESET_CODE || '';
  }
  sv(imageModelNameEl, fields.IMAGE_MODEL_NAME || '');
  sv(imageModelBaseUrlEl, fields.IMAGE_MODEL_BASE_URL || '');
  sv(imageModelApiKeyEl, fields.IMAGE_MODEL_API_KEY || '');
  if (updateChannelDisplayEl) {
    updateChannelDisplayEl.textContent = `현재 채널: ${fields.UPDATE_CHANNEL || 'stable'}`;
  }
  settingsTelegramRuntimeStatus = data?.telegramBotStatus || null;

  const imageOptimizationEl = document.getElementById('settings-image-optimization');
  sc(imageOptimizationEl, fields.IMAGE_OPTIMIZATION_ENABLED ?? true);

  // 개별 섹션의 Headless 설정을 우선하며, Global 설정은 이제 레거시 호환용으로만 유지됩니다.

  sv(typingEl, fields.TYPING_SPEED || 'NORMAL');
  sc(blogCollectTrendsEnabledEl, fields.COLLECT_TRENDS_ENABLED);

  const naverCatEl = document.getElementById('blog-collect-trends-naver-category');
  sv(naverCatEl, fields.COLLECT_TRENDS_NAVER_CATEGORY || '');

  setSelectedBlogAutoCategories(fields.COLLECT_TRENDS_CATEGORIES || '');
  renderBlogAutoCategoryUi();

  sv(blogCollectTrendsTimeEl, fields.COLLECT_TRENDS_TIME || '07:30');
  sc(blogCollectTrendsFilterNewEl, fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW);
  sc(blogCollectTrendsFilterDashEl, fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH);
  sc(blogCollectTrendsFilterNumberEnabledEl, fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER);
  sv(blogCollectTrendsFilterTypeEl, fields.COLLECT_TRENDS_FILTER_TYPE || 'min');

  const wordpressCatEl = document.getElementById('blog-collect-trends-wordpress-category');
  sv(wordpressCatEl, fields.COLLECT_TRENDS_WP_CATEGORY || '');

  // RSS Configs Sync
  if (fields.COLLECT_RSS_CONFIGS) {
    try {
      window.currentRssConfigs = typeof fields.COLLECT_RSS_CONFIGS === 'string'
        ? JSON.parse(fields.COLLECT_RSS_CONFIGS)
        : fields.COLLECT_RSS_CONFIGS;
      renderRssConfigTable();
    } catch (e) {
      console.error('Failed to sync RSS configs:', e);
    }
  }

  if (blogCollectTrendsFilterMinEl) {
    const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_MIN_INCR, 50);
    sv(blogCollectTrendsFilterMinEl, val === '' ? '' : String(val));
  }
  if (blogCollectTrendsFilterTopEl) {
    const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_TOP_N, 5);
    sv(blogCollectTrendsFilterTopEl, val === '' ? '' : String(val));
  }
  sv(blogCollectTrendsReuseGapEl, fields.COLLECT_TRENDS_REUSE_GAP_DAYS || 15);

  sc(blogPublishAutoEnabledEl, fields.PUBLISH_AUTO_ENABLED);
  sv(blogPublishAutoBatchEl, fields.PUBLISH_AUTO_BATCH_SIZE || 1);
  sv(blogPublishAutoIntervalEl, fields.PUBLISH_AUTO_INTERVAL_MIN || 60);
  sv(blogPublishAutoPostStatusEl, fields.PUBLISH_AUTO_POST_STATUS === 'draft' ? 'draft' : 'publish');
  sc(blogPublishAutoHeadlessEl, fields.PUBLISH_AUTO_HEADLESS ?? true);
  sc(blogPublishAutoNotifyEnabledEl, fields.PUBLISH_AUTO_NOTIFY_ENABLED);

  const blogStartTimeEl = document.getElementById('blog-publish-auto-start-time');
  const blogEndTimeEl = document.getElementById('blog-publish-auto-end-time');
  sv(blogStartTimeEl, fields.PUBLISH_AUTO_START_TIME || '00:00');
  sv(blogEndTimeEl, fields.PUBLISH_AUTO_END_TIME || '23:59');

  const targetChannels = Array.isArray(fields.PUBLISH_AUTO_TARGET_CHANNELS)
    ? fields.PUBLISH_AUTO_TARGET_CHANNELS
    : String(fields.PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
  // 자동 발행 전용 타겟 체크박스만 갱신 (수동/일괄 UI는 전역 설정에 영향받지 않도록 skip)
  ['blog-publish-auto-target-naver', 'blog-publish-auto-target-wordpress'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || (skipFocused && document.activeElement === el)) return;
    el.checked = targetChannels.includes(el.getAttribute('data-publish-target'));
  });

  sc(shoppingPublishAutoEnabledEl, fields.SHOPPING_PUBLISH_AUTO_ENABLED);

  const shoppingStartTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const shoppingEndTimeEl = document.getElementById('shopping-publish-auto-end-time');
  sv(shoppingStartTimeEl, fields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
  sv(shoppingEndTimeEl, fields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
  sv(shoppingPublishAutoBatchEl, fields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
  sv(shoppingPublishAutoIntervalEl, fields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);

  const shoppingTargetChannels = Array.isArray(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
    ? fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
    : String(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
  // 쇼핑 자동 발행 전용 타겟 체크박스만 갱신
  ['shopping-publish-auto-target-naver', 'shopping-publish-auto-target-wordpress'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || (skipFocused && document.activeElement === el)) return;
    el.checked = shoppingTargetChannels.includes(el.getAttribute('data-shopping-publish-target'));
  });

  sc(shoppingPublishAutoHeadlessEl, fields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
  sc(shoppingPublishAutoNotifyEnabledEl, fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

  sc(telegramEnabledEl, fields.NOTIFY_TELEGRAM_ENABLED);
  sv(telegramBotTokenEl, fields.NOTIFY_TELEGRAM_BOT_TOKEN || '');
  sv(telegramChatIdEl, fields.NOTIFY_TELEGRAM_CHAT_ID || '');
  sv(bitlyTokenEl, fields.NOTIFY_BITLY_TOKEN || '');
  setSelectedSettingsRadioValue('settings-chat-model-source', fields.CHAT_MODEL_SOURCE, 'writing');
  sv(chatModelPresetProviderEl, fields.CHAT_MODEL_PROVIDER || 'direct');
  if (chatModelPresetProviderEl) chatModelPresetProviderEl.dataset.desiredValue = fields.CHAT_MODEL_PROVIDER || 'direct';
  sv(chatModelPresetCodeEl, fields.CHAT_MODEL_PRESET_CODE || '');
  if (chatModelPresetCodeEl) chatModelPresetCodeEl.dataset.desiredValue = fields.CHAT_MODEL_PRESET_CODE || '';
  sv(chatModelNameEl, fields.CHAT_MODEL_NAME || '');
  sv(chatModelBaseUrlEl, fields.CHAT_MODEL_BASE_URL || '');
  sv(chatModelApiKeyEl, fields.CHAT_MODEL_API_KEY || '');
  sc(slackEnabledEl, fields.NOTIFY_SLACK_ENABLED);
  sv(slackWebhookUrlEl, fields.NOTIFY_SLACK_WEBHOOK_URL || '');
  sv(bufferApiKeyEl, fields.BUFFER_API_KEY || '');
  sc(snsPublishEnabledEl, fields.SNS_PUBLISH_ENABLED);
  sv(snsPublishIntervalEl, Math.max(10, Number(fields.SNS_PUBLISH_INTERVAL_MIN) || 10));
  sv(snsAiModeEl, fields.SNS_AI_MODE || 'none');
  syncSettingsSnsAiHint();
  const snsSourceBlogs = Array.isArray(fields.SNS_SOURCE_BLOGS)
    ? fields.SNS_SOURCE_BLOGS
    : ['naver', 'wordpress'];
  sc(document.getElementById('settings-sns-source-naver'), snsSourceBlogs.includes('naver'));
  sc(document.getElementById('settings-sns-source-wordpress'), snsSourceBlogs.includes('wordpress'));
  settingsBufferOrganizations = [];
  settingsBufferChannels = normalizeSettingsBufferChannels(fields.BUFFER_CHANNELS);
  settingsBufferSelectedChannelIds = new Set(
    settingsBufferChannels
      .filter((channel) => !isSettingsBufferChannelUnsupported(channel))
      .map((channel) => channel.id)
      .slice(0, 3)
  );
  renderSettingsBufferOrganizations(fields.BUFFER_ORGANIZATION_ID || '');
  if (bufferOrganizationEl) bufferOrganizationEl.value = fields.BUFFER_ORGANIZATION_ID || '';
  renderSettingsBufferChannels();
  syncSettingsBufferHelpLink(fields.BUFFER_HELP_URL || '');

  syncBlogAutoVariationTypeUi();
  if (blogCollectTrendsReuseGapEl && !(skipFocused && document.activeElement === blogCollectTrendsReuseGapEl)) {
    const rawReuseGap = fields.COLLECT_TRENDS_REUSE_GAP_DAYS || fields.BLOG_AUTO_KEYWORD_REUSE_GAP_DAYS;
    const normalizedReuseGap = normalizeBlogAutoKeywordReuseGapValue(rawReuseGap, 15);
    blogCollectTrendsReuseGapEl.value = String(normalizedReuseGap);
  }
  syncBlogAutoVariationNumberUi();

  // 이미지 슬롯을 applyingForm 플래그 해제 전에 먼저 채웁니다.
  // 그래야 플래그 해제 직후 auto-save가 트리거되더라도
  // ensureRequiredSettingsShoppingImages()가 올바른 데이터를 볼 수 있습니다.
  settingsShoppingImageDefaults = { ...(data?.shoppingImageDefaults || {}) };
  settingsShoppingImageSlots = { ...(data?.shoppingImageSlots || {}) };
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    clearStagedSettingsShoppingImage(slot);
  });
  renderSettingsShoppingImageSlots();

  settingsMajorApplyingForm = false;
  settingsMajorLoadedOnce = true;
  syncSettingsTelegramUi();
  syncSettingsMcpUi();
  syncSettingsUpdateSourceUi();
  syncSettingsAiModelUi('text');
  syncSettingsAiModelUi('image');
  syncSettingsChatModelUi();
  playSettingsTypingPreview();

  commitSettingsMajorSavedState();
}

function getSettingsMajorBasicValuesFromDom() {
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');

  const variationMin = normalizeBlogAutoVariationNumberValue(variationMinEl?.value, 50);
  const variationTopN = normalizeBlogAutoVariationNumberValue(variationTopEl?.value, 5);
  const keywordReuseGap = normalizeBlogAutoKeywordReuseGapValue(keywordReuseGapEl?.value, 15);

  return {
    // General & Blog
    LISTEN_HOST: (document.getElementById('settings-listen-host')?.value || '127.0.0.1').trim(),
    LISTEN_PORT: parseInt((document.getElementById('settings-listen-port')?.value || '4577').trim(), 10) || 4577,
    MCP_REMOTE_ENABLED: Boolean(document.getElementById('settings-mcp-remote-enabled')?.checked),
    MCP_REMOTE_HOST: (document.getElementById('settings-mcp-remote-host')?.value || '127.0.0.1').trim(),
    MCP_REMOTE_PORT: parseInt((document.getElementById('settings-mcp-remote-port')?.value || '4578').trim(), 10) || 4578,
    MCP_REMOTE_PATH: normalizeSettingsMcpPath(document.getElementById('settings-mcp-remote-path')?.value || '/mcp'),
    MCP_REMOTE_AUTH_TOKEN: (document.getElementById('settings-mcp-remote-auth-token')?.value || '').trim(),
    NAVER_ID: (document.getElementById('settings-naver-id')?.value || '').trim(),
    WORDPRESS_URL: (document.getElementById('settings-wordpress-url')?.value || '').trim(),
    WORDPRESS_USER_ID: (document.getElementById('settings-wordpress-user-id')?.value || '').trim(),
    WORDPRESS_APP_PASSWORD: getSettingsInputValue('settings-wordpress-app-password').trim(),
    BLOG_WRITING_MODE: getSelectedSettingsRadioValue('settings-blog-writing-mode', 'conversational'),
    BLOG_SPEECH_LEVEL: getSelectedSettingsRadioValue('settings-blog-speech-level', 'polite'),
    BLOG_WRITING_STRATEGY: getSelectedSettingsRadioValue('settings-blog-writing-strategy', 'search'),
    GOOGLE_SHEET_URL: (document.getElementById('settings-google-sheet-url')?.value || '').trim(),
    UPDATE_SERVER_TYPE: (document.getElementById('settings-update-server-type')?.value || 'github').trim(),
    CUSTOM_UPDATE_CHECK_URL: (document.getElementById('settings-custom-update-check-url')?.value || '').trim(),
    UPDATE_MIRROR_REPO: (document.getElementById('settings-update-mirror-repo')?.value || 'delta898/NaverAutoBlog-Releases').trim(),
    TEXT_MODEL_PROVIDER: (document.getElementById('settings-text-model-preset-provider')?.value || 'google').trim(),
    TEXT_MODEL_PRESET_CODE: (document.getElementById('settings-text-model-preset-code')?.value || '').trim(),
    TEXT_MODEL_NAME: (document.getElementById('settings-text-model-name')?.value || '').trim(),
    TEXT_MODEL_BASE_URL: (document.getElementById('settings-text-model-base-url')?.value || '').trim(),
    TEXT_MODEL_API_KEY: getSettingsInputValue('settings-text-model-api-key').trim(),
    IMAGE_MODEL_PROVIDER: (document.getElementById('settings-image-model-preset-provider')?.value || 'google').trim(),
    IMAGE_MODEL_PRESET_CODE: (document.getElementById('settings-image-model-preset-code')?.value || '').trim(),
    IMAGE_MODEL_NAME: (document.getElementById('settings-image-model-name')?.value || '').trim(),
    IMAGE_MODEL_BASE_URL: (document.getElementById('settings-image-model-base-url')?.value || '').trim(),
    IMAGE_MODEL_API_KEY: getSettingsInputValue('settings-image-model-api-key').trim(),
    AI_MODEL_PROFILES: serializeSettingsAiProviderProfiles(),

    IMAGE_OPTIMIZATION_ENABLED: Boolean(document.getElementById('settings-image-optimization')?.checked),

    TYPING_SPEED: (document.getElementById('settings-typing-speed')?.value || 'NORMAL').trim().toUpperCase(),

    // Trend Collection
    COLLECT_TRENDS_ENABLED: Boolean(document.getElementById('blog-collect-trends-enabled')?.checked),
    COLLECT_TRENDS_CATEGORIES: serializeSelectedBlogAutoCategories(),
    COLLECT_TRENDS_NAVER_CATEGORY: (document.getElementById('blog-collect-trends-naver-category')?.value || '').trim(),
    COLLECT_TRENDS_WP_CATEGORY: (document.getElementById('blog-collect-trends-wordpress-category')?.value || '').trim(),
    COLLECT_TRENDS_TIME: (document.getElementById('blog-collect-trends-time')?.value || '07:30').trim(),
    COLLECT_TRENDS_FILTER_INCLUDE_NEW: Boolean(document.getElementById('blog-collect-trends-filter-new')?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_DASH: Boolean(document.getElementById('blog-collect-trends-filter-dash')?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: Boolean(document.getElementById('blog-collect-trends-filter-number-enabled')?.checked),
    COLLECT_TRENDS_FILTER_TYPE: (document.getElementById('blog-collect-trends-filter-type')?.value || 'min').trim(),
    COLLECT_TRENDS_FILTER_MIN_INCR: variationMin,
    COLLECT_TRENDS_FILTER_TOP_N: variationTopN,
    COLLECT_TRENDS_REUSE_GAP_DAYS: keywordReuseGap,

    // RSS Collection
    COLLECT_RSS_ENABLED: Boolean(document.getElementById('blog-collect-rss-enabled')?.checked),
    COLLECT_RSS_CONFIGS: JSON.stringify(typeof currentRssConfigs !== 'undefined' ? currentRssConfigs : []),

    // Auto Publishing
    PUBLISH_AUTO_ENABLED: Boolean(document.getElementById('blog-publish-auto-enabled')?.checked),
    PUBLISH_AUTO_INTERVAL_MIN: parseInt(document.getElementById('blog-publish-auto-interval')?.value || '60', 10),
    PUBLISH_AUTO_BATCH_SIZE: parseInt(document.getElementById('blog-publish-auto-batch')?.value || '1', 10),
    PUBLISH_AUTO_POST_STATUS: document.getElementById('blog-publish-auto-post-status')?.value === 'draft' ? 'draft' : 'publish',
    PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')),
    PUBLISH_AUTO_HEADLESS: Boolean(document.getElementById('blog-publish-auto-headless')?.checked),
    PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(document.getElementById('blog-publish-auto-notify-enabled')?.checked),
    PUBLISH_AUTO_START_TIME: (document.getElementById('blog-publish-auto-start-time')?.value || '00:00').trim(),
    PUBLISH_AUTO_END_TIME: (document.getElementById('blog-publish-auto-end-time')?.value || '23:59').trim(),

    // Shopping Auto Refined
    SHOPPING_PUBLISH_AUTO_ENABLED: Boolean(document.getElementById('shopping-publish-auto-enabled')?.checked),
    SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: parseInt(document.getElementById('shopping-publish-auto-interval')?.value || '60', 10),
    SHOPPING_PUBLISH_AUTO_BATCH_SIZE: parseInt(document.getElementById('shopping-publish-auto-batch')?.value || '1', 10),
    SHOPPING_PUBLISH_AUTO_START_TIME: (document.getElementById('shopping-publish-auto-start-time')?.value || '00:00').trim(),
    SHOPPING_PUBLISH_AUTO_END_TIME: (document.getElementById('shopping-publish-auto-end-time')?.value || '23:59').trim(),
    SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')),
    SHOPPING_PUBLISH_AUTO_HEADLESS: Boolean(document.getElementById('shopping-publish-auto-headless')?.checked),
    SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(document.getElementById('shopping-publish-auto-notify-enabled')?.checked),

    // Notification (Telegram)
    NOTIFY_TELEGRAM_ENABLED: Boolean(document.getElementById('settings-notify-telegram-enabled')?.checked),
    NOTIFY_TELEGRAM_BOT_TOKEN: getSettingsInputValue('settings-notify-telegram-bot-token').trim(),
    NOTIFY_TELEGRAM_CHAT_ID: (document.getElementById('settings-notify-telegram-chat-id')?.value || '').trim(),
    NOTIFY_BITLY_TOKEN: getSettingsInputValue('settings-notify-bitly-token').trim(),
    CHAT_MODEL_SOURCE: getSelectedSettingsRadioValue('settings-chat-model-source', 'writing'),
    CHAT_MODEL_PROVIDER: (document.getElementById('settings-chat-model-preset-provider')?.value || 'direct').trim(),
    CHAT_MODEL_PRESET_CODE: (document.getElementById('settings-chat-model-preset-code')?.value || '').trim(),
    CHAT_MODEL_NAME: (document.getElementById('settings-chat-model-name')?.value || '').trim(),
    CHAT_MODEL_BASE_URL: (document.getElementById('settings-chat-model-base-url')?.value || '').trim(),
    CHAT_MODEL_API_KEY: getSettingsInputValue('settings-chat-model-api-key').trim(),

    // Notification (Slack)
    NOTIFY_SLACK_ENABLED: Boolean(document.getElementById('settings-notify-slack-enabled')?.checked),
    NOTIFY_SLACK_WEBHOOK_URL: getSettingsInputValue('settings-notify-slack-webhook-url').trim(),

    // SNS publishing (Buffer)
    BUFFER_API_KEY: getSettingsInputValue('settings-buffer-api-key').trim(),
    BUFFER_ORGANIZATION_ID: (document.getElementById('settings-buffer-organization')?.value || '').trim(),
    BUFFER_CHANNELS: getSelectedSettingsBufferChannels(),
    BUFFER_HELP_URL: (() => {
      const href = document.getElementById('settings-buffer-help-link')?.getAttribute('href') || '';
      return href === '#' ? '' : href.trim();
    })(),
    SNS_PUBLISH_ENABLED: Boolean(document.getElementById('settings-sns-publish-enabled')?.checked),
    SNS_AI_MODE: (document.getElementById('settings-sns-ai-mode')?.value || 'none').trim(),
    SNS_SOURCE_BLOGS: [
      document.getElementById('settings-sns-source-naver')?.checked ? 'naver' : '',
      document.getElementById('settings-sns-source-wordpress')?.checked ? 'wordpress' : ''
    ].filter(Boolean),
    SNS_PUBLISH_INTERVAL_MIN: Math.max(
      10,
      parseInt(document.getElementById('settings-sns-publish-interval')?.value || '10', 10) || 10
    ),
  };
}

function checkPublishPrerequisites(targets) {
  if (!targets || targets.length === 0) {
    return { ok: false, message: '발행 대상을 1개 이상 선택해 주세요.' };
  }
  const settings = getSettingsMajorBasicValuesFromDom();
  if (targets.includes('naver')) {
    if (!settings.NAVER_ID) {
      return { ok: false, message: '네이버 블로그 설정(NAVER_ID)이 필요합니다. 설정 탭에서 확인해 주세요.' };
    }
  }
  if (targets.includes('wordpress')) {
    if (!settings.WORDPRESS_URL || !settings.WORDPRESS_USER_ID || !settings.WORDPRESS_APP_PASSWORD) {
      return { ok: false, message: '워드프레스 설정(URL, App ID, Password)이 필요합니다. 설정 탭에서 확인해 주세요.' };
    }
  }
  return { ok: true };
}

function buildSettingsShoppingImageDraftState() {
  const imageSources = {};
  const stagedFiles = {};
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    const source = String(sourceInput?.value || settingsShoppingImageSlots?.[slot]?.source || '').trim();
    imageSources[meta.key] = source;

    const stagedFile = settingsShoppingImageFileState?.[slot];
    stagedFiles[slot] = stagedFile
      ? { name: stagedFile.name, size: stagedFile.size, lastModified: stagedFile.lastModified }
      : null;
  });
  return { imageSources, stagedFiles };
}

function buildSettingsMajorBasicSignature() {
  return JSON.stringify({
    basic: getSettingsMajorBasicValuesFromDom(),
    shoppingImages: buildSettingsShoppingImageDraftState()
  });
}

function commitSettingsMajorSavedState() {
  settingsMajorLastSavedSignature = buildSettingsMajorBasicSignature();
  settingsMajorHasPendingBasicChanges = false;
  updateSettingsMajorSaveUi();
}

function normalizeSettingsMcpPath(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '/mcp';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  return prefixed.length > 1 ? prefixed.replace(/\/+$/, '') : prefixed;
}

function refreshSettingsMajorPendingState() {
  scheduleSettingsMajorAutoSave({ immediate: true });
}

function getSettingsMcpTokenValue() {
  return String(document.getElementById('settings-mcp-remote-auth-token')?.value || '').trim();
}

function setSettingsMcpTokenValue(token, options = {}) {
  const hiddenEl = document.getElementById('settings-mcp-remote-auth-token');
  if (hiddenEl) {
    hiddenEl.value = String(token || '').trim();
  }
  if (options.visible !== undefined) {
    settingsMcpTokenVisible = Boolean(options.visible);
  }
  syncSettingsMcpTokenDisplay();
}

function maskSettingsMcpToken(token) {
  const value = String(token || '').trim();
  if (!value) return '';
  if (value.length <= 12) {
    return `${value.slice(0, 4)}${'•'.repeat(Math.max(0, value.length - 8))}${value.slice(-4)}`;
  }
  return `${value.slice(0, 6)}${'•'.repeat(Math.max(4, value.length - 10))}${value.slice(-4)}`;
}

function syncSettingsMcpTokenDisplay() {
  const displayEl = document.getElementById('settings-mcp-remote-auth-token-display');
  const toggleBtn = document.getElementById('settings-mcp-remote-auth-toggle-btn');
  const copyBtn = document.getElementById('settings-mcp-remote-auth-copy-btn');
  if (!displayEl) return;

  const token = getSettingsMcpTokenValue();
  const hasToken = Boolean(token);
  displayEl.readOnly = !settingsMcpTokenVisible;
  displayEl.value = settingsMcpTokenVisible ? token : (hasToken ? maskSettingsMcpToken(token) : '');
  displayEl.placeholder = hasToken ? 'Bearer token' : '비우면 인증 없음';

  if (toggleBtn) {
    toggleBtn.textContent = settingsMcpTokenVisible ? '숨기기' : '보기';
  }
  if (copyBtn) {
    copyBtn.disabled = !hasToken;
  }
}

function buildSettingsTelegramPreviewLines() {
  const enabled = Boolean(document.getElementById('settings-notify-telegram-enabled')?.checked);
  const botToken = getSettingsInputValue('settings-notify-telegram-bot-token').trim();
  const chatId = String(document.getElementById('settings-notify-telegram-chat-id')?.value || '').trim();
  const runtimeRunning = settingsTelegramRuntimeStatus?.running === true;
  const runtimeEnabled = settingsTelegramRuntimeStatus?.enabled === true;
  const runtimeConfigured = settingsTelegramRuntimeStatus?.configured === true;
  const runtimeStateLabel = runtimeRunning
    ? '실행 중'
    : (runtimeEnabled
      ? (runtimeConfigured ? '중지됨' : '설정 미완료')
      : '중지됨');

  const lines = [
    `현재 상태: ${runtimeStateLabel}`,
    `저장 후 적용: ${enabled ? '활성화' : '비활성화'}`
  ];

  if (!botToken || !chatId) {
    lines.push('봇 토큰과 챗 ID가 모두 있어야 저장 및 적용 시 텔레그램 봇이 시작됩니다.');
  } else {
    lines.push('저장 및 적용 시 현재 입력한 봇 토큰과 챗 ID로 텔레그램 봇 상태가 다시 적용됩니다.');
  }

  if (!enabled) {
    lines.push('비활성화 상태로 저장하면 텔레그램 봇은 실행되지 않습니다.');
  }

  return lines;
}

function syncSettingsTelegramUi() {
  const previewEl = document.getElementById('settings-telegram-status-preview');
  if (previewEl) {
    previewEl.textContent = buildSettingsTelegramPreviewLines().join('\n');
  }
}

function buildSettingsMcpPreviewLines() {
  const enabled = Boolean(document.getElementById('settings-mcp-remote-enabled')?.checked);
  const host = (document.getElementById('settings-mcp-remote-host')?.value || '127.0.0.1').trim() || '127.0.0.1';
  const port = parseInt((document.getElementById('settings-mcp-remote-port')?.value || '4578').trim(), 10) || 4578;
  const path = normalizeSettingsMcpPath(document.getElementById('settings-mcp-remote-path')?.value || '/mcp');
  const token = getSettingsMcpTokenValue();
  const authMode = token ? 'bearer' : 'none';
  const directHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  const runtimeRunning = settingsMcpRuntimeStatus?.running === true;
  const runtimeEnabled = settingsMcpRuntimeStatus?.enabled === true;
  const runtimeStateLabel = runtimeRunning
    ? `실행 중 (${settingsMcpRuntimeStatus?.endpoint || '-'})`
    : (runtimeEnabled ? '시작 중 또는 재시작 중' : '중지됨');

  const lines = [
    `현재 상태: ${runtimeStateLabel}`,
    `저장 후 적용: ${enabled ? '활성화' : '비활성화'}`,
    `Direct URL: http://${directHost}:${port}${path}`,
    `인증: ${authMode === 'bearer' ? 'Bearer Token' : '없음'}`
  ];

  if (host === '0.0.0.0') {
    lines.push('LAN/Public에서는 장치의 실제 IP 또는 reverse proxy URL을 MCP client에 넣어야 합니다.');
  } else {
    lines.push('같은 컴퓨터의 MCP client는 위 Direct URL을 그대로 사용하면 됩니다.');
  }

  if (authMode === 'bearer') {
    lines.push('MCP client는 Authorization: Bearer <token> 헤더를 함께 보내야 합니다.');
  } else {
    lines.push('Bearer Token이 비어 있으므로 저장 시 인증 없이 동작합니다.');
  }

  if (enabled) {
    lines.push('저장 및 적용 시 MCP 서버가 현재 설정으로 시작되거나 다시 시작됩니다.');
  } else {
    lines.push('저장 및 적용 시 MCP 서버는 실행되지 않습니다.');
  }

  return lines;
}

function syncSettingsMcpUi() {
  syncSettingsMcpTokenDisplay();
  const previewEl = document.getElementById('settings-mcp-remote-endpoint-preview');
  if (previewEl) {
    previewEl.textContent = buildSettingsMcpPreviewLines().join('\n');
  }
}

function syncSettingsUpdateSourceUi() {
  const updateServerType = (document.getElementById('settings-update-server-type')?.value || 'github').trim();
  const githubField = document.getElementById('settings-update-mirror-repo-field');
  const customField = document.getElementById('settings-custom-update-url-field');
  if (githubField) {
    githubField.style.display = updateServerType === 'github' ? '' : 'none';
  }
  if (customField) {
    customField.style.display = updateServerType === 'custom' ? '' : 'none';
  }
}

function getSettingsAiPresetCatalog(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  return Array.isArray(settingsAiPresets?.[catalogKind]) ? settingsAiPresets[catalogKind] : [];
}

function getSettingsAiPresetProviders(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  const configuredProviders = Array.isArray(settingsAiPresets?.providers?.[catalogKind])
    ? settingsAiPresets.providers[catalogKind]
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean)
    : [];
  const presetProviders = getSettingsAiPresetCatalog(kind)
    .map((item) => String(item.provider || '').trim())
    .filter(Boolean);
  return Array.from(new Set([...configuredProviders, ...presetProviders, 'direct']));
}

function getSettingsAiProviderLabels(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  const configuredProviders = Array.isArray(settingsAiPresets?.providers?.[catalogKind])
    ? settingsAiPresets.providers[catalogKind]
    : [];
  return Object.fromEntries(configuredProviders
    .map((item) => [
      String(item?.id || '').trim(),
      String(item?.name || item?.display_name || item?.id || '').trim()
    ])
    .filter(([id, name]) => id && name));
}

function populateSettingsAiProviderSelect(kind, selectEl, selectedProvider) {
  if (!selectEl) return;
  const catalogProviders = getSettingsAiPresetProviders(kind);
  const providers = selectedProvider && !catalogProviders.includes(selectedProvider)
    ? [selectedProvider, ...catalogProviders]
    : catalogProviders;
  const labels = {
    google: 'Google',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    kie: 'KIE.ai',
    ...getSettingsAiProviderLabels(kind),
    direct: '직접 입력'
  };
  const resolvedProvider = providers.includes(selectedProvider) ? selectedProvider : (providers[0] || '');
  selectEl.innerHTML = providers
    .map((provider) => {
      const isUnavailable = provider === selectedProvider && !catalogProviders.includes(provider);
      const label = labels[provider] || provider;
      return `<option value="${provider}">${isUnavailable ? `${label} (현재 설정, 카탈로그에 없음)` : label}</option>`;
    })
    .join('');
  if (resolvedProvider) {
    selectEl.value = resolvedProvider;
  }
}

function populateSettingsAiPresetModelSelect(kind, provider, selectEl, summaryEl, selectedCode) {
  if (!selectEl) return;
  const presets = getSettingsAiPresetCatalog(kind).filter((item) => String(item.provider || '') === String(provider || ''));
  const fallback = presets[0] || null;
  const configured = presets.find((item) => item.code === selectedCode) || null;
  const unavailable = selectedCode && !configured
    ? { code: selectedCode, name: `${selectedCode} (현재 설정, 카탈로그에 없음)`, unavailable: true }
    : null;
  const selected = configured || unavailable || fallback;
  selectEl.innerHTML = [...(unavailable ? [unavailable] : []), ...presets]
    .map((item) => `<option value="${item.code}">${item.name || item.code}</option>`)
    .join('');
  if (selected?.code) {
    selectEl.value = selected.code;
  }
  if (summaryEl) {
    if (selected?.unavailable) {
      summaryEl.textContent = '현재 선택한 모델은 제품 카탈로그에 없습니다. 설정을 유지하거나 지원 모델로 변경할 수 있습니다.';
    } else if (selected?.transport === 'gemini_generate_content') {
      summaryEl.textContent = 'Google Gemini API를 사용합니다.';
    } else if (String(provider || '') === 'openai') {
      summaryEl.textContent = kind === 'image'
        ? 'OpenAI Images API를 사용합니다.'
        : 'OpenAI Chat Completions API를 사용합니다.';
    } else {
      summaryEl.textContent = selected?.base_url
        ? `기본 Base URL: ${selected.base_url}`
        : '';
    }
  }
  return selected;
}

function syncSettingsAiModelUi(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerWrapEl = document.getElementById(`settings-${prefix}-model-provider-wrap`);
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetWrapEl = document.getElementById(`settings-${prefix}-model-preset-code-wrap`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  const summaryEl = document.getElementById(`settings-${prefix}-model-preset-summary`);
  const nameEl = document.getElementById(`settings-${prefix}-model-name`);
  const nameWrapEl = document.getElementById(`settings-${prefix}-model-name-wrap`);
  const baseUrlEl = document.getElementById(`settings-${prefix}-model-base-url`);
  const baseUrlWrapEl = document.getElementById(`settings-${prefix}-model-base-url-wrap`);
  const baseUrlLabelEl = baseUrlWrapEl?.querySelector('.settings-model-base-url-label');
  if (!providerEl) return;

  const desiredProvider = String(providerEl?.dataset?.desiredValue ?? providerEl?.value ?? 'google').trim();
  const selectedCode = String(presetEl?.dataset?.desiredValue ?? presetEl?.value ?? '').trim();

  populateSettingsAiProviderSelect(kind, providerEl, desiredProvider);
  const resolvedProvider = String(providerEl.value || desiredProvider || 'google').trim();
  const isDirect = resolvedProvider === 'direct';

  if (providerWrapEl) providerWrapEl.style.display = '';
  if (presetWrapEl) presetWrapEl.style.display = isDirect ? 'none' : '';
  if (nameWrapEl) nameWrapEl.style.display = isDirect ? '' : 'none';
  if (baseUrlWrapEl) baseUrlWrapEl.style.display = '';
  if (baseUrlLabelEl) {
    baseUrlLabelEl.textContent = !isDirect
      ? (resolvedProvider === 'google'
        ? 'Google AI API'
        : (resolvedProvider === 'openai'
          ? 'OpenAI API'
          : (resolvedProvider === 'kie' ? 'KIE.ai API' : 'Base URL')))
      : 'Base URL';
  }
  providerEl.dataset.desiredValue = resolvedProvider;
  providerEl.dataset.activeProvider = resolvedProvider;

  if (presetEl) {
    presetEl.disabled = isDirect;
  }
  if (nameEl) {
    nameEl.disabled = !isDirect;
  }

  if (!isDirect && providerEl) {
    const selected = populateSettingsAiPresetModelSelect(kind, resolvedProvider, presetEl, summaryEl, selectedCode);
    if (presetEl) presetEl.dataset.desiredValue = presetEl.value || '';
    if (baseUrlEl) {
      baseUrlEl.value = resolvedProvider === 'google' ? '' : (selected?.base_url || '');
      baseUrlEl.readOnly = true;
    }
    if (nameEl) {
      nameEl.readOnly = false;
    }
  } else {
    if (summaryEl) summaryEl.textContent = '';
    if (presetEl) {
      presetEl.innerHTML = '';
      presetEl.dataset.desiredValue = '';
    }
    if (baseUrlEl) {
      baseUrlEl.readOnly = false;
    }
    if (nameEl) {
      nameEl.readOnly = false;
    }
  }
}

function captureSettingsAiModelDesiredState(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  if (providerEl) {
    providerEl.dataset.desiredValue = String(providerEl.value || '').trim();
  }
  if (presetEl) {
    presetEl.dataset.desiredValue = String(presetEl.value || '').trim();
  }
}

function createEmptySettingsAiProviderProfiles() {
  return { text: {}, image: {}, chat: {} };
}

function normalizeSettingsAiProviderProfiles(rawProfiles) {
  const normalized = createEmptySettingsAiProviderProfiles();
  const source = rawProfiles && typeof rawProfiles === 'object' && !Array.isArray(rawProfiles)
    ? rawProfiles
    : {};
  ['text', 'image', 'chat'].forEach((role) => {
    const roleProfiles = source[role] && typeof source[role] === 'object' && !Array.isArray(source[role])
      ? source[role]
      : {};
    Object.entries(roleProfiles).slice(0, 30).forEach(([profileKey, rawProfile]) => {
      if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return;
      const provider = String(rawProfile.provider || profileKey || '').trim().toLowerCase();
      if (!provider || provider !== String(profileKey || '').trim().toLowerCase()) return;
      normalized[role][provider] = {
        provider,
        code: String(rawProfile.code || '').trim(),
        name: String(rawProfile.name || '').trim(),
        base_url: String(rawProfile.base_url || '').trim(),
        api_key: String(rawProfile.api_key || '').trim()
      };
    });
  });
  return normalized;
}

function cloneSettingsAiProviderProfiles(rawProfiles = settingsAiProviderProfiles) {
  return normalizeSettingsAiProviderProfiles(rawProfiles);
}

function readSettingsAiProviderProfile(kind, providerOverride = '') {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const provider = String(
    providerOverride || document.getElementById(`settings-${prefix}-model-preset-provider`)?.value || ''
  ).trim().toLowerCase();
  if (!provider) return null;
  const presetCode = String(document.getElementById(`settings-${prefix}-model-preset-code`)?.value || '').trim();
  const name = String(document.getElementById(`settings-${prefix}-model-name`)?.value || '').trim();
  return {
    provider,
    code: provider === 'direct' ? name : presetCode,
    name: provider === 'direct' ? name : '',
    base_url: String(document.getElementById(`settings-${prefix}-model-base-url`)?.value || '').trim(),
    api_key: getSettingsInputValue(`settings-${prefix}-model-api-key`).trim()
  };
}

function snapshotSettingsAiProviderProfile(kind, providerOverride = '', targetProfiles = settingsAiProviderProfiles) {
  const profile = readSettingsAiProviderProfile(kind, providerOverride);
  if (!profile) return;
  if (!targetProfiles[kind]) targetProfiles[kind] = {};
  targetProfiles[kind][profile.provider] = profile;
}

function restoreSettingsAiProviderProfile(kind, provider) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const profile = settingsAiProviderProfiles?.[kind]?.[normalizedProvider] || null;
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  const nameEl = document.getElementById(`settings-${prefix}-model-name`);
  const baseUrlEl = document.getElementById(`settings-${prefix}-model-base-url`);
  const apiKeyEl = document.getElementById(`settings-${prefix}-model-api-key`);

  if (providerEl) providerEl.dataset.desiredValue = normalizedProvider;
  if (presetEl) presetEl.dataset.desiredValue = profile?.code || '';
  syncSettingsAiModelUi(kind);

  setManagedSettingsSecretValue(apiKeyEl, profile?.api_key || '');
  if (normalizedProvider === 'direct') {
    if (nameEl) nameEl.value = profile?.name || profile?.code || '';
    if (baseUrlEl) baseUrlEl.value = profile?.base_url || '';
  } else if (profile?.base_url && presetEl?.selectedOptions?.[0]?.textContent?.includes('카탈로그에 없음')) {
    if (baseUrlEl) baseUrlEl.value = profile.base_url;
  }
  resetSettingsAiModelTestResult(kind);
}

function handleSettingsAiProviderChange(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  if (!providerEl) return;
  const previousProvider = String(providerEl.dataset.activeProvider || '').trim().toLowerCase();
  const nextProvider = String(providerEl.value || '').trim().toLowerCase();
  if (previousProvider && previousProvider !== nextProvider) {
    snapshotSettingsAiProviderProfile(kind, previousProvider);
  }
  restoreSettingsAiProviderProfile(kind, nextProvider);
}

function serializeSettingsAiProviderProfiles() {
  const profiles = cloneSettingsAiProviderProfiles();
  ['text', 'image', 'chat'].forEach((kind) => snapshotSettingsAiProviderProfile(kind, '', profiles));
  return profiles;
}

function getSettingsAiModelTestPayload(kind) {
  if (kind === 'chat' && getSelectedSettingsRadioValue('settings-chat-model-source', 'writing') === 'writing') {
    return getSettingsAiModelTestPayload('text');
  }
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  return {
    kind: kind === 'chat' ? 'text' : kind,
    provider: (document.getElementById(`settings-${prefix}-model-preset-provider`)?.value || '').trim(),
    presetCode: (document.getElementById(`settings-${prefix}-model-preset-code`)?.value || '').trim(),
    name: (document.getElementById(`settings-${prefix}-model-name`)?.value || '').trim(),
    baseUrl: (document.getElementById(`settings-${prefix}-model-base-url`)?.value || '').trim(),
    apiKey: getSettingsInputValue(`settings-${prefix}-model-api-key`).trim()
  };
}

function resetSettingsAiModelTestResult(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const resultEl = document.getElementById(`settings-${prefix}-model-test-result`);
  if (!resultEl) return;
  resultEl.textContent = 'API Key와 연결 정보를 확인합니다.';
  resultEl.style.color = 'var(--text-muted)';
}

async function runSettingsAiModelTest(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const buttonEl = document.getElementById(`settings-${prefix}-model-test-btn`);
  const resultEl = document.getElementById(`settings-${prefix}-model-test-result`);
  const payload = getSettingsAiModelTestPayload(kind);
  const modelCode = payload.provider === 'direct' ? payload.name : payload.presetCode;

  if (!modelCode) {
    if (resultEl) {
      resultEl.textContent = '❌ 테스트할 모델을 선택하거나 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }
  if (payload.provider !== 'direct' && !payload.apiKey) {
    if (resultEl) {
      resultEl.textContent = '❌ 선택한 모델의 API Key를 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }
  if (payload.provider === 'direct' && !payload.baseUrl) {
    if (resultEl) {
      resultEl.textContent = '❌ 직접 입력 모델의 Base URL을 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }

  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) {
    resultEl.textContent = '⏳ API Key와 연결 정보 확인 중...';
    resultEl.style.color = 'var(--text-muted)';
  }

  try {
    const result = await postJson('/api/v1/settings/test-ai-model', payload);
    const elapsed = Number.isFinite(Number(result?.latency_ms))
      ? ` · ${(Number(result.latency_ms) / 1000).toFixed(2)}초`
      : '';
    const credit = Number.isFinite(Number(result?.credit_balance))
      ? ` · 잔여 크레딧 ${Number(result.credit_balance).toLocaleString()}`
      : '';
    if (resultEl) {
      const roleLabel = kind === 'chat' ? 'Chat Model · ' : '';
      resultEl.textContent = `✅ ${roleLabel}${result?.display_name || modelCode} 연결 성공${credit}${elapsed}`;
      resultEl.style.color = 'var(--success)';
    }
  } catch (error) {
    if (resultEl) {
      const modelName = payload.name || modelCode || 'AI 모델';
      const errorMessage = String(error?.message || '연결 중 오류가 발생했습니다.');
      resultEl.textContent = errorMessage.includes('연결 실패')
        ? `❌ ${errorMessage}`
        : `❌ ${modelName} 연결 실패 · ${errorMessage}`;
      resultEl.style.color = 'var(--danger)';
    }
  } finally {
    if (buttonEl) buttonEl.disabled = false;
  }
}

function syncSettingsChatModelUi() {
  const source = getSelectedSettingsRadioValue('settings-chat-model-source', 'writing');
  const dedicatedCardEl = document.getElementById('settings-chat-model-dedicated-card');
  const writingSummaryEl = document.getElementById('settings-chat-model-writing-summary');
  if (dedicatedCardEl) dedicatedCardEl.style.display = source === 'dedicated' ? '' : 'none';

  const writingModelName = (
    document.getElementById('settings-text-model-name')?.value
    || document.getElementById('settings-text-model-preset-code')?.selectedOptions?.[0]?.textContent
    || document.getElementById('settings-text-model-preset-code')?.value
    || '현재 글쓰기 모델'
  ).trim();
  if (writingSummaryEl) {
    writingSummaryEl.textContent = source === 'writing'
      ? `현재 글쓰기 모델(${writingModelName})을 Chat Model 역할에도 사용합니다.`
      : 'Chat Model을 글쓰기 모델과 별도로 설정합니다.';
  }
  if (source === 'dedicated') syncSettingsAiModelUi('chat');
  syncSettingsSnsAiHint();
}

function markSettingsMajorPendingChanges(pending = true) {
  settingsMajorHasPendingBasicChanges = Boolean(pending);
  updateSettingsMajorSaveUi();
}

function updateSettingsMajorSaveUi() {
  const saveBtns = document.querySelectorAll('#settings-major-save-btn, .settings-major-save-btn');
  const statusEls = Array.from(document.querySelectorAll('.settings-major-save-status'));
  const isDirty = settingsMajorHasPendingBasicChanges === true;

  saveBtns.forEach((btn) => {
    btn.disabled = !isDirty || settingsMajorSaveInFlight;
  });

  if (statusEls.length === 0) return;
  if (settingsMajorSaveInFlight) {
    statusEls.forEach((statusEl) => {
      statusEl.textContent = '저장 중...';
      statusEl.style.color = 'var(--text-muted)';
    });
    return;
  }
  if (isDirty) {
    statusEls.forEach((statusEl) => {
      statusEl.textContent = '저장되지 않은 변경사항';
      statusEl.style.color = 'var(--warning, #d97706)';
    });
    return;
  }
  statusEls.forEach((statusEl) => {
    statusEl.textContent = '저장됨';
    statusEl.style.color = 'var(--success, #16a34a)';
  });
}

function syncScopedMajorSaveActions() {
  const blogSaveActionsEl = document.getElementById('blog-major-save-actions');
  if (blogSaveActionsEl) {
    const shouldShow = ['collect', 'auto'].includes(String(blogActiveTab || ''));
    blogSaveActionsEl.hidden = !shouldShow;
    blogSaveActionsEl.style.display = shouldShow ? 'inline-flex' : 'none';
  }

  const shoppingSaveActionsEl = document.getElementById('shopping-major-save-actions');
  if (shoppingSaveActionsEl) {
    const shouldShow = String(shoppingActiveTab || '') === 'auto';
    shoppingSaveActionsEl.hidden = !shouldShow;
    shoppingSaveActionsEl.style.display = shouldShow ? 'inline-flex' : 'none';
  }
}

function setSettingsMajorResultText(message) {
  const resultEls = document.querySelectorAll('.settings-major-result');
  resultEls.forEach(el => el.textContent = String(message || ''));
}

function stopSettingsTypingPreview() {
  if (settingsTypingPreviewTimer) {
    clearTimeout(settingsTypingPreviewTimer);
    settingsTypingPreviewTimer = null;
  }
}

function setSettingsTypingPreviewMeta(message) {
  const metaEl = document.getElementById('settings-typing-preview-meta');
  if (!metaEl) return;
  metaEl.textContent = String(message || '');
}

function getSettingsTypingPreviewDelay(speedKey) {
  const key = String(speedKey || '').trim().toUpperCase();
  const base = SETTINGS_TYPING_PREVIEW_DELAY[key] || SETTINGS_TYPING_PREVIEW_DELAY.NORMAL;
  const jitter = Math.floor(base * 0.35);
  const offset = Math.floor(Math.random() * (jitter * 2 + 1)) - jitter;
  return Math.max(1, base + offset);
}

function getSettingsTypingPreviewSourceText() {
  const inputEl = document.getElementById('settings-typing-preview-input');
  const raw = String(inputEl?.value || '').trim();
  if (raw) return raw;
  const placeholder = String(inputEl?.placeholder || '').trim();
  if (placeholder) return placeholder;
  return SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT;
}

function playSettingsTypingPreview() {
  const targetEl = document.getElementById('settings-typing-preview-text');
  const speedEl = document.getElementById('settings-typing-speed');
  const sampleText = getSettingsTypingPreviewSourceText();
  if (!targetEl || !speedEl) return;
  if (!sampleText) {
    targetEl.textContent = '미리보기 문구를 입력해 주세요.';
    setSettingsTypingPreviewMeta('자동 재생: 대기');
    stopSettingsTypingPreview();
    return;
  }

  stopSettingsTypingPreview();
  const runId = ++settingsTypingPreviewRunId;
  const speedKey = String(speedEl.value || 'NORMAL').trim().toUpperCase();
  let cursor = 0;
  let repeatIndex = 1;
  targetEl.textContent = '';
  setSettingsTypingPreviewMeta(`자동 재생: ${repeatIndex}/${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}`);

  const tick = () => {
    if (runId !== settingsTypingPreviewRunId) return;
    if (cursor >= sampleText.length) {
      targetEl.textContent = sampleText;
      if (repeatIndex >= SETTINGS_TYPING_PREVIEW_REPEAT_COUNT) {
        setSettingsTypingPreviewMeta(`자동 재생 완료: ${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}회`);
        stopSettingsTypingPreview();
        return;
      }
      repeatIndex += 1;
      cursor = 0;
      setSettingsTypingPreviewMeta(`자동 재생: ${repeatIndex}/${SETTINGS_TYPING_PREVIEW_REPEAT_COUNT}`);
      settingsTypingPreviewTimer = setTimeout(tick, 420);
      return;
    }
    cursor += 1;
    targetEl.textContent = `${sampleText.slice(0, cursor)}▌`;
    settingsTypingPreviewTimer = setTimeout(tick, getSettingsTypingPreviewDelay(speedKey));
  };

  settingsTypingPreviewTimer = setTimeout(tick, 120);
}

function scheduleSettingsMajorAutoSave({ immediate = false } = {}) {
  if (settingsMajorApplyingForm || !settingsMajorLoadedOnce) return;
  const currentSignature = buildSettingsMajorBasicSignature();
  const isDirty = currentSignature !== settingsMajorLastSavedSignature;
  markSettingsMajorPendingChanges(isDirty);
  if (!isDirty) return;
  setSettingsMajorResultText('저장되지 않은 변경사항이 있습니다.');
}

async function loadSettingsMajor({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '설정 화면'
  });
  if (!canReload) return false;

  const refreshBtns = document.querySelectorAll('.settings-major-refresh-btn');
  const resultEls = document.querySelectorAll('.settings-major-result');

  refreshBtns.forEach(btn => btn.disabled = true);
  updateSettingsStatus('.settings-major-result', '불러오는 중...', 'info');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    applySettingsMajorToForm(data);
    await loadSettingsSnsRuntimeStatus();
    updateSettingsStatus('.settings-major-result', `불러오기 완료: ${data.configPath || '-'}`, 'success');
    return true;
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
    return false;
  } finally {
    refreshBtns.forEach(btn => btn.disabled = false);
  }
}

function buildSettingsMajorPayload() {
  const imageSources = {};
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    const domValue = (document.getElementById(`settings-image-source-${slot}`)?.value || '').trim();
    // DOM input이 비어있을 수 있음 (쇼핑 설정 탭이 활성화되지 않으면 renderSettingsShoppingImageSlot이 값을 채우지 않음)
    // 그 경우 메모리에 있는 슬롯 데이터를 사용하여 기존 값이 유실되지 않도록 함
    const memoryValue = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    imageSources[meta.key] = domValue || memoryValue;
  });

  const basic = getSettingsMajorBasicValuesFromDom();

  return {
    ...basic,
    ...imageSources
  };
}

function revokeSettingsShoppingObjectUrl(slot) {
  const current = settingsShoppingImageObjectUrls[slot];
  if (current) {
    URL.revokeObjectURL(current);
    delete settingsShoppingImageObjectUrls[slot];
  }
}

function buildSettingsShoppingPreviewUrl(slot, source) {
  const value = String(source || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const query = new URLSearchParams({
    slot,
    source: value,
    _t: String(Date.now())
  });
  return `/api/v1/settings/shopping-image/preview?${query.toString()}`;
}

function clearStagedSettingsShoppingImage(slot) {
  delete settingsShoppingImageFileState[slot];
  revokeSettingsShoppingObjectUrl(slot);
  const fileInput = document.getElementById(`settings-image-file-${slot}`);
  if (fileInput) fileInput.value = '';
}

function renderSettingsShoppingImageSlot(slot) {
  const slotData = settingsShoppingImageSlots[slot] || {};
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  const previewWrap = document.getElementById(`settings-image-preview-wrap-${slot}`);
  const previewImg = document.getElementById(`settings-image-preview-${slot}`);
  const metaEl = document.getElementById(`settings-image-meta-${slot}`);
  if (!sourceInput || !previewWrap || !previewImg || !metaEl) return;

  let source = String(sourceInput.value || '').trim();
  if (!source) source = String(slotData.source || '').trim();
  sourceInput.value = source;

  const stagedFile = settingsShoppingImageFileState[slot];
  if (stagedFile) {
    revokeSettingsShoppingObjectUrl(slot);
    const objectUrl = URL.createObjectURL(stagedFile);
    settingsShoppingImageObjectUrls[slot] = objectUrl;
    previewImg.src = objectUrl;
    previewWrap.classList.add('has-image');
    metaEl.textContent = `선택됨(저장 시 반영): ${stagedFile.name}`;
    return;
  }

  revokeSettingsShoppingObjectUrl(slot);
  const previewUrl = buildSettingsShoppingPreviewUrl(slot, source);
  if (previewUrl) {
    const modeText = /^https?:\/\//i.test(source) ? '원격 URL' : '로컬 파일';
    metaEl.textContent = `현재 이미지: ${modeText}`;
    previewImg.onload = () => {
      previewWrap.classList.add('has-image');
    };
    previewImg.onerror = () => {
      previewWrap.classList.remove('has-image');
      metaEl.textContent = '현재 이미지: 미리보기를 불러오지 못했습니다.';
    };
    previewWrap.classList.remove('has-image');
    previewImg.src = previewUrl;
  } else {
    previewImg.onload = null;
    previewImg.onerror = null;
    previewImg.removeAttribute('src');
    previewWrap.classList.remove('has-image');
    metaEl.textContent = '현재 이미지: 설정 없음';
  }
}

function renderSettingsShoppingImageSlots() {
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    const source = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    if (sourceInput) sourceInput.value = source;
    renderSettingsShoppingImageSlot(slot);
  });
}

function restoreSettingsShoppingDefault(slot) {
  const meta = SETTINGS_SHOPPING_SLOT_META[slot];
  if (!meta) return;
  clearStagedSettingsShoppingImage(slot);
  const source = String(settingsShoppingImageDefaults?.[meta.key] || '').trim();
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  if (sourceInput) sourceInput.value = source;
  if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
  settingsShoppingImageSlots[slot].source = source;
  renderSettingsShoppingImageSlot(slot);
}

function clearSettingsShoppingOptional(slot) {
  clearStagedSettingsShoppingImage(slot);
  const sourceInput = document.getElementById(`settings-image-source-${slot}`);
  if (sourceInput) sourceInput.value = '';
  if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
  settingsShoppingImageSlots[slot].source = '';
  renderSettingsShoppingImageSlot(slot);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('파일이 선택되지 않았습니다.'));
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadShoppingImageFromSettings(slot, file) {
  if (!file) throw new Error('업로드할 이미지 파일을 먼저 선택해 주세요.');
  const dataUrl = await readFileAsDataUrl(file);
  return postJson('/api/v1/settings/shopping-image', {
    slot,
    fileName: file.name,
    mimeType: file.type || '',
    base64Data: dataUrl
  });
}

async function uploadPendingSettingsShoppingImages(resultEls) {
  for (const slot of SETTINGS_SHOPPING_SLOT_ORDER) {
    const file = settingsShoppingImageFileState[slot];
    if (!file) continue;
    const label = SETTINGS_SHOPPING_SLOT_META[slot]?.label || slot;
    if (resultEls) resultEls.forEach(el => el.textContent = `이미지 업로드 중... (${label}: ${file.name})`);
    const data = await uploadShoppingImageFromSettings(slot, file);
    const sourceValue = String(data?.value || '').trim();
    const sourceInput = document.getElementById(`settings-image-source-${slot}`);
    if (sourceInput) sourceInput.value = sourceValue;
    if (!settingsShoppingImageSlots[slot]) settingsShoppingImageSlots[slot] = {};
    settingsShoppingImageSlots[slot].source = sourceValue;
    clearStagedSettingsShoppingImage(slot);
  }
}

function ensureRequiredSettingsShoppingImages() {
  // 슬롯 데이터가 아직 로드되지 않은 경우 검증을 건너뜁니다
  if (!settingsShoppingImageSlots || Object.keys(settingsShoppingImageSlots).length === 0) return;
  for (const slot of SETTINGS_SHOPPING_SLOT_ORDER) {
    const meta = SETTINGS_SHOPPING_SLOT_META[slot];
    if (!meta?.required) continue;
    // DOM input 대신 메모리 상태로 검사 (렌더링 여부와 무관하게 항상 정확함)
    const slotSource = String(settingsShoppingImageSlots?.[slot]?.source || '').trim();
    const hasStagedFile = !!settingsShoppingImageFileState?.[slot];
    if (!slotSource && !hasStagedFile) {
      throw new Error(`${meta.label}는 필수입니다. 이미지를 선택하거나 기본 이미지로 복원해 주세요.`);
    }
  }
}

async function saveSettingsMajor({ mode = 'manual' } = {}) {
  const saveBtns = document.querySelectorAll('#settings-major-save-btn, .settings-major-save-btn');
  const resultEls = document.querySelectorAll('.settings-major-result');
  let savedResponse = null;

  if (settingsMajorSaveInFlight) {
    return;
  }

  settingsMajorSaveInFlight = true;
  updateSettingsMajorSaveUi();
  console.log(`[Settings] Save starting (mode: ${mode})`);

  try {
    updateSettingsStatus('.settings-major-result', '주요 설정 저장 중...', 'info');

    await uploadPendingSettingsShoppingImages(resultEls);
    ensureRequiredSettingsShoppingImages();

    const payload = buildSettingsMajorPayload();
    const data = await postJson('/api/v1/settings/major', payload);
    savedResponse = data;
    const warningMessages = Array.isArray(data?.warnings)
      ? data.warnings.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const warningSuffix = warningMessages.length > 0
      ? `\n확인 필요: ${warningMessages.join(' / ')}`
      : '';

    console.log('[Settings] Save successful');
    applySettingsMajorToForm(data);
    commitSettingsMajorSavedState();
    uiSheetsReady = false;
    invalidateWpCategoryCache();

    if (data.restarting) {
      updateSettingsStatus(
        '.settings-major-result',
        `${data.message || '주요 설정 저장 완료'}\n주소/포트 변경으로 인해 서버를 재시작 중입니다... 새 주소로 이동합니다.${warningSuffix}`,
        'success'
      );
      if (warningMessages.length > 0) {
        showUiToast({
          level: 'warn',
          title: '설정 저장 후 확인 필요',
          message: warningMessages.join(' / '),
          dedupeKey: 'settings-major-save-warnings',
          timeoutMs: 10000
        });
      }
      setTimeout(() => {
        window.location.href = `http://${data.newHost === '0.0.0.0' ? '127.0.0.1' : data.newHost}:${data.newPort}`;
      }, 1500);
      return;
    }

    const mcpStatusLine = data?.remoteMcpStatus?.running
      ? `\nMCP: ${data.remoteMcpStatus.endpoint || '-'}`
      : (data?.remoteMcpStatus?.enabled === false ? '\nMCP: 비활성화' : '');
    updateSettingsStatus(
      '.settings-major-result',
      `${data.message || '주요 설정 저장 완료'}\n${data.configPath || '-'}${mcpStatusLine}${warningSuffix}`,
      'success'
    );
    if (warningMessages.length > 0) {
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: warningMessages.join(' / '),
        dedupeKey: 'settings-major-save-warnings',
        timeoutMs: 10000
      });
    }
    try {
      await Promise.all([loadConfigStatus(), loadDashboard()]);
      await loadSettingsSnsRuntimeStatus();
      if (uiConfigReady) {
        await ensureSheetsPreflightUi({ force: true, silent: true });
      }
      commitSettingsMajorSavedState();
    } catch (refreshError) {
      console.warn('[Settings] Post-save refresh failed:', refreshError);
      updateSettingsStatus(
        '.settings-major-result',
        `${data.message || '주요 설정 저장 완료'}\n일부 화면 갱신에 실패했습니다. 새로고침 후 다시 확인해 주세요.${warningSuffix}`,
        'success'
      );
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: '설정은 저장됐지만 일부 화면 갱신에 실패했습니다. 새로고침 후 다시 확인해 주세요.',
        dedupeKey: 'settings-major-refresh-failed',
        timeoutMs: 9000
      });
    }
  } catch (e) {
    console.error('[Settings] Save failed:', e);
    if (savedResponse) {
      commitSettingsMajorSavedState();
      updateSettingsStatus(
        '.settings-major-result',
        `${savedResponse.message || '주요 설정 저장 완료'}\n일부 후속 작업에 실패했습니다: ${e.message}`,
        'success'
      );
      showUiToast({
        level: 'warn',
        title: '설정 저장 후 확인 필요',
        message: `설정은 저장됐지만 후속 작업 중 오류가 있었습니다: ${e.message}`,
        dedupeKey: 'settings-major-post-save-failed',
        timeoutMs: 9000
      });
    } else {
      updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
      showUiToast({
        level: 'error',
        title: '설정 저장 실패',
        message: `설정을 저장하지 못했습니다: ${e.message}`,
        dedupeKey: 'settings-major-save-failed',
        timeoutMs: 10000
      });
    }
  } finally {
    settingsMajorSaveInFlight = false;
    updateSettingsMajorSaveUi();
  }
}

async function regenerateSettingsMcpToken() {
  try {
    const data = await postJson('/api/v1/settings/mcp-token', {});
    setSettingsMcpTokenValue(String(data?.token || ''), { visible: true });
    syncSettingsMcpUi();
    refreshSettingsMajorPendingState();
    updateSettingsStatus('.settings-major-result', '새 MCP bearer token을 생성했습니다. 저장하면 파일에 반영됩니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `MCP token 재발급 실패: ${e.message}`, 'error');
  }
}

function toggleSettingsMcpTokenVisibility() {
  settingsMcpTokenVisible = !settingsMcpTokenVisible;
  syncSettingsMcpUi();
}

async function copySettingsMcpToken() {
  const token = getSettingsMcpTokenValue();
  if (!token) {
    updateSettingsStatus('.settings-major-result', '복사할 Bearer Token이 없습니다.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(token);
    updateSettingsStatus('.settings-major-result', 'Bearer Token을 클립보드에 복사했습니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-major-result', `Bearer Token 복사 실패: ${e.message}`, 'error');
  }
}

function buildGoogleSheetOpenUrl(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return 'https://docs.google.com/spreadsheets';

  const lower = raw.toLowerCase();
  const hasPlaceholderHint =
    lower.includes('여기에') ||
    lower.includes('구글시트') ||
    lower.includes('your_') ||
    lower.includes('<') ||
    lower.includes('...');
  if (hasPlaceholderHint) return 'https://docs.google.com/spreadsheets';

  const extractId = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
    try {
      const u = new URL(text);
      const byPath = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
      if (byPath?.[1]) return byPath[1];
      const byQuery = u.searchParams.get('id');
      if (byQuery && /^[a-zA-Z0-9-_]{20,}$/.test(byQuery)) return byQuery;
    } catch (_e) { }
    return '';
  };

  const id = extractId(raw);
  if (id) return `https://docs.google.com/spreadsheets/d/${id}`;
  if (/^https?:\/\//i.test(raw) && !/^https?:\/\/docs\.google\.com\/spreadsheets/i.test(raw)) return raw;
  return 'https://docs.google.com/spreadsheets';
}

function openGoogleSheetFromUi() {
  const resultEls = document.querySelectorAll('.settings-major-result');
  const inputValue = (document.getElementById('settings-google-sheet-url')?.value || '').trim();
  const openUrl = buildGoogleSheetOpenUrl(inputValue);
  window.open(openUrl, '_blank', 'noopener,noreferrer');
  resultEls.forEach(el => {
    if (/^https?:\/\/docs\.google\.com\/spreadsheets\/d\//i.test(openUrl)) {
      el.textContent = `스프레드시트를 새 탭에서 열었습니다.\n${openUrl}`;
    } else {
      el.textContent = [
        '스프레드시트 목록 페이지를 열었습니다.',
        'Google 계정을 먼저 연결한 뒤, 사용할 문서의 URL을 GOOGLE_SHEET_URL에 입력하세요.',
        openUrl
      ].join('\n');
    }
  });
}

async function loadGoogleAuthStatus() {
  const statusById = document.getElementById('settings-google-auth-status');
  const statusByClass = Array.from(document.querySelectorAll('.settings-google-auth-status'));
  const statusEls = statusById
    ? [statusById, ...statusByClass.filter(el => el !== statusById)]
    : statusByClass;
  if (statusEls.length === 0) return;

  const detailsById = document.getElementById('settings-google-auth-details');
  const detailsByClass = Array.from(document.querySelectorAll('.settings-google-auth-details'));
  const detailEls = detailsById
    ? [detailsById, ...detailsByClass.filter(el => el !== detailsById)]
    : detailsByClass;

  statusEls.forEach(el => {
    el.textContent = '상태 확인 중...';
    el.className = 'status-badge';
  });
  detailEls.forEach(el => {
    el.textContent = '연결 상태 확인 중...';
  });

  try {
    const data = await fetchJson('/api/v1/google-oauth/status');
    const state = String(data?.state || '').trim().toLowerCase();
    const connectedEmail = String(data?.connectedEmail || data?.email || '').trim();
    const lastVerifiedAt = String(data?.lastVerifiedAt || '').trim();
    const lastVerifiedText = lastVerifiedAt
      ? new Date(lastVerifiedAt).toLocaleString()
      : '';
    const detailText = state === 'connected'
      ? [
        `연결 계정: ${connectedEmail || '-'}`,
        lastVerifiedText ? `마지막 확인: ${lastVerifiedText}` : '',
        data?.message || ''
      ].filter(Boolean).join('\n')
      : [
        data?.message || 'Google 계정 연결이 필요합니다.',
        connectedEmail ? `이전 연결 계정: ${connectedEmail}` : ''
      ].filter(Boolean).join('\n');

    statusEls.forEach(el => {
      if (state === 'connected') {
        el.textContent = '연결됨';
        el.className = 'status-badge success';
      } else if (state === 'reauth_required') {
        el.textContent = '다시 로그인 필요';
        el.className = 'status-badge error';
      } else {
        el.textContent = '미연결';
        el.className = 'status-badge error';
      }
    });
    detailEls.forEach(el => {
      el.textContent = detailText;
    });
  } catch (e) {
    statusEls.forEach(el => {
      el.textContent = '상태 확인 실패';
      el.className = 'status-badge error';
    });
    detailEls.forEach(el => {
      el.textContent = `상태 조회 실패\n오류: ${String(e?.message || 'unknown')}`;
    });
  }
}

async function pollGoogleOauthStatus(maxAttempts = 60, intervalMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    try {
      const data = await fetchJson('/api/v1/google-oauth/status');
      if (String(data?.state || '').trim().toLowerCase() === 'connected') {
        await loadGoogleAuthStatus();
        return data;
      }
    } catch (_) {
      // ignore transient polling errors
    }
  }
  return null;
}

async function startGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '브라우저에서 Google 로그인을 진행하세요.', 'info');
  try {
    const data = await postJson('/api/v1/google-oauth/start', {});
    if (!data?.authUrl) {
      throw new Error('Google 인증 URL을 생성하지 못했습니다.');
    }
    let resolved = false;
    const handleOauthMessage = async (event) => {
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(String(event.origin || ''))) return;
      if (event.data?.source !== 'google-oauth') return;
      window.removeEventListener('message', handleOauthMessage);
      resolved = true;
      await loadGoogleAuthStatus();
      uiSheetsReady = false;
      if (event.data?.status === 'success') {
        updateSettingsStatus('.settings-google-auth-result', `연결 완료\n계정: ${event.data?.email || '-'}`, 'success');
      } else {
        updateSettingsStatus('.settings-google-auth-result', `오류: ${event.data?.message || 'Google 연결에 실패했습니다.'}`, 'error');
      }
    };
    window.addEventListener('message', handleOauthMessage);
    const popup = window.open(data.authUrl, 'google-oauth-login', 'width=620,height=760');
    if (!popup) {
      window.removeEventListener('message', handleOauthMessage);
      throw new Error('브라우저 팝업을 열지 못했습니다. 팝업 차단을 확인하세요.');
    }
    const status = await pollGoogleOauthStatus();
    window.removeEventListener('message', handleOauthMessage);
    if (resolved || String(status?.state || '').trim().toLowerCase() === 'connected') {
      updateSettingsStatus('.settings-google-auth-result', `연결 완료\n계정: ${status?.connectedEmail || status?.email || '-'}`, 'success');
      uiSheetsReady = false;
      return;
    }
    updateSettingsStatus('.settings-google-auth-result', '브라우저에서 로그인을 완료한 뒤 다시 상태를 확인하세요.', 'info');
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

async function disconnectGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '연결 해제 중...', 'info');
  try {
    await postJson('/api/v1/google-oauth/disconnect', {});
    await loadGoogleAuthStatus();
    uiSheetsReady = false;
    updateSettingsStatus('.settings-google-auth-result', 'Google 계정 연결을 해제했습니다.', 'success');
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

async function testGoogleOauth() {
  updateSettingsStatus('.settings-google-auth-result', '연결 테스트 중...', 'info');
  try {
    const data = await postJson('/api/v1/google-oauth/test', {});
    await loadGoogleAuthStatus();
    uiSheetsReady = false;
    updateSettingsStatus(
      '.settings-google-auth-result',
      [
        '연결 테스트 성공',
        data?.email ? `계정: ${data.email}` : '',
        data?.sheetTitle ? `시트: ${data.sheetTitle}` : ''
      ].filter(Boolean).join('\n'),
      'success'
    );
  } catch (e) {
    updateSettingsStatus('.settings-google-auth-result', `오류: ${e.message}`, 'error');
  }
}

async function startNaverLoginFromUi() {
  renderNaverSessionStatus(null, { checking: true, detail: '로그인 완료를 기다리는 중...' });
  updateSettingsStatus('.settings-major-result', '로그인 시작 요청 중...', 'info');
  try {
    await postJson('/api/v1/session/naver-login/start', {});
    updateSettingsStatus('.settings-major-result', '브라우저에서 네이버 로그인을 완료해 주세요.', 'info');
    const loginResult = await pollNaverLoginStatus();
    await loadNaverSessionStatus({ force: true });
    if (String(loginResult?.status || '') === 'success') {
      updateSettingsStatus('.settings-major-result', '네이버 로그인이 완료되었습니다.', 'success');
    } else {
      updateSettingsStatus(
        '.settings-major-result',
        `네이버 로그인에 실패했습니다: ${loginResult?.error || loginResult?.message || '로그인 완료를 확인하지 못했습니다.'}`,
        'error'
      );
    }
  } catch (e) {
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', `오류: ${e.message}`, 'error');
  }
}

function renderNaverSessionStatus(data, options = {}) {
  const badge = document.getElementById('settings-naver-session-badge');
  const detail = document.getElementById('settings-naver-session-detail');
  const loginBtn = document.getElementById('settings-naver-login-btn');
  const logoutBtn = document.getElementById('settings-naver-logout-btn');
  if (!badge || !detail) return;

  if (options.checking) {
    badge.textContent = '확인 중';
    badge.className = 'status-badge';
    detail.textContent = options.detail || '네이버 로그인 상태를 확인하고 있습니다.';
    if (loginBtn) loginBtn.disabled = true;
    if (logoutBtn) logoutBtn.disabled = true;
    return;
  }

  const valid = data?.valid === true;
  const reason = String(data?.reason || '').trim();
  if (valid) {
    badge.textContent = '로그인됨';
    badge.className = 'status-badge success';
    detail.textContent = '네이버 로그인 세션이 정상입니다.';
  } else if (reason === 'expired') {
    badge.textContent = '로그인 만료';
    badge.className = 'status-badge error';
    detail.textContent = '세션이 만료되었습니다. 다시 로그인해 주세요.';
  } else if (reason === 'check_failed') {
    badge.textContent = '확인 실패';
    badge.className = 'status-badge error';
    detail.textContent = data?.message || '로그인 상태를 확인하지 못했습니다.';
  } else {
    badge.textContent = '로그아웃됨';
    badge.className = 'status-badge';
    detail.textContent = '저장된 네이버 로그인 정보가 없습니다.';
  }

  if (loginBtn) {
    loginBtn.hidden = valid;
    loginBtn.disabled = false;
  }
  if (logoutBtn) {
    logoutBtn.hidden = !valid;
    logoutBtn.disabled = false;
  }
}

async function loadNaverSessionStatus({ force = false } = {}) {
  renderNaverSessionStatus(null, { checking: true });
  try {
    const suffix = force ? '?force=1' : '';
    const data = await fetchJson(`/api/v1/session/naver${suffix}`);
    renderNaverSessionStatus(data);
    return data;
  } catch (e) {
    renderNaverSessionStatus({
      valid: false,
      reason: 'check_failed',
      message: e.message
    });
    return null;
  }
}

async function pollNaverLoginStatus(maxAttempts = 150, intervalMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    const data = await fetchJson('/api/v1/session/naver-login');
    const status = String(data?.status || '').trim().toLowerCase();
    if (status === 'success' || status === 'failed') return data;
  }
  return {
    status: 'failed',
    message: '로그인 확인 시간이 초과되었습니다.'
  };
}

async function logoutNaverFromUi() {
  const confirmed = await showUiConfirm(
    '이 기기에 저장된 네이버 로그인 정보를 삭제하고 로그아웃할까요?',
    {
      title: '네이버 로그아웃',
      confirmText: '로그아웃',
      cancelText: '취소'
    }
  );
  if (!confirmed) return;

  renderNaverSessionStatus(null, { checking: true, detail: '로그아웃 중...' });
  try {
    await postJson('/api/v1/session/naver-login/logout', {});
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', '이 기기의 네이버 로그인 정보를 삭제했습니다.', 'success');
  } catch (e) {
    await loadNaverSessionStatus({ force: true });
    updateSettingsStatus('.settings-major-result', `로그아웃 실패: ${e.message}`, 'error');
  }
}

async function verifyWordPressAuthFromUi() {
  const resultEl = document.getElementById('settings-wordpress-verify-result');
  const btn = document.getElementById('settings-wordpress-verify-btn');
  if (!resultEl) return;

  const wordpressUrl = (document.getElementById('settings-wordpress-url')?.value || '').trim();
  const wordpressUserId = (document.getElementById('settings-wordpress-user-id')?.value || '').trim();
  const wordpressAppPassword = getSettingsInputValue('settings-wordpress-app-password').trim();

  updateSettingsStatus('#settings-wordpress-verify-result', '연동 확인 중...', 'info');
  if (btn) btn.disabled = true;

  try {
    const res = await postJson('/api/v1/session/wordpress-verify', {
      wordpressUrl,
      wordpressUserId,
      wordpressAppPassword
    });
    if (res.success) {
      updateSettingsStatus('#settings-wordpress-verify-result', '✅ ' + res.message, 'success');
      invalidateWpCategoryCache(); // 인증 성공 시 카테고리 정보 갱신을 위해 캐시 초기화
      fetchWpCategories(); // 백그라운드에서 즉시 갱신 시작
    } else {
      updateSettingsStatus('#settings-wordpress-verify-result', '❌ ' + res.message, 'error');
    }
  } catch (e) {
    updateSettingsStatus('#settings-wordpress-verify-result', `❌ 오류: ${e.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}



function setBlogAutoResultText(message) {
  const resultEl = document.getElementById('blog-publish-auto-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function setBlogCollectResultText(message) {
  const resultEl = document.getElementById('blog-collect-trends-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function setBlogCollectResultText(message) {
  const resultEl = document.getElementById('blog-collect-result');
  if (resultEl) resultEl.textContent = String(message || '').replace(/\\n/g, '\n');
}

let currentRssConfigs = [];
window.addRssConfig = function () {
  currentRssConfigs.push({ enabled: true, url: '', interval: 60, includeKeywords: '', excludeKeywords: '', naver_category: '', wordpress_category: '' });
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.removeRssConfig = function (index) {
  currentRssConfigs.splice(index, 1);
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.updateRssConfig = function (index, key, value) {
  if (currentRssConfigs[index]) {
    currentRssConfigs[index][key] = value;
    scheduleSettingsMajorAutoSave({ immediate: true });
  }
};
window.toggleAllRssConfigs = function (checked) {
  currentRssConfigs.forEach(rss => { rss.enabled = checked; });
  renderBlogCollectRssUi(currentRssConfigs);
  scheduleSettingsMajorAutoSave({ immediate: true });
};
window.openRssTest = function (index) {
  const url = currentRssConfigs[index]?.url;
  if (url) window.open(url, '_blank');
};
function buildWpCategorySelectHtml(selectedValue, index) {
  const containerId = `rss-category-container-${index}`;
  const triggerId = `rss-category-trigger-${index}`;
  const textId = `rss-category-text-${index}`;
  const menuId = `rss-category-menu-${index}`;
  const searchId = `rss-category-search-${index}`;
  const optionsId = `rss-category-options-${index}`;

  const defaultText = selectedValue || '카테고리 선택 (미지정 시 기본)';

  return `
    <div class="custom-select-container rss-category-container" id="${containerId}" style="width: 100%; z-index: ${100 - index};">
      <div class="custom-select-trigger" id="${triggerId}" style="min-height: 32px; font-size: 13px; border-radius: 4px;">
        <span id="${textId}">${defaultText}</span>
        <i class="chevron-down-icon"></i>
      </div>
      <div class="custom-select-menu" id="${menuId}">
        <div class="custom-select-search">
          <input type="text" id="${searchId}" placeholder="검색 또는 직접 입력 후 Enter..." autocomplete="off">
        </div>
        <div class="custom-select-options" id="${optionsId}">
          <div class="custom-select-loading">카테고리 정보를 불러오는 중...</div>
        </div>
      </div>
    </div>
  `;
}

function renderBlogCollectRssUi(configs = []) {
  currentRssConfigs = Array.isArray(configs) ? configs : [];
  const tbody = document.getElementById('blog-collect-rss-tbody');
  if (!tbody) return;

  // Attempt to load WP categories asynchronously if needed
  if (!categoryCache && !window._wpCatFetchTriggeredForRss) {
    window._wpCatFetchTriggeredForRss = true;
    fetchWpCategories().finally(() => {
      if (!categoryCache) categoryCache = []; // Default to empty array to prevent refetch loops
      renderBlogCollectRssUi(currentRssConfigs);
    });
  }

  tbody.innerHTML = '';

  // 헤더 체크박스 상태 동기화
  const toggleAllEl = document.getElementById('blog-collect-rss-toggle-all');
  if (toggleAllEl) {
    toggleAllEl.checked = currentRssConfigs.length > 0 && currentRssConfigs.every(rss => rss.enabled);
  }

  if (currentRssConfigs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: var(--text-muted);">등록된 RSS 피드가 없습니다.</td></tr>';
    return;
  }
  const initTasks = [];

  currentRssConfigs.forEach((rss, index) => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid var(--border-color)';
    tr.innerHTML = `
      <td style="padding: 10px; text-align: center;">
        <input type="checkbox" onchange="updateRssConfig(${index}, 'enabled', this.checked); renderBlogCollectRssUi(currentRssConfigs);" ${rss.enabled ? 'checked' : ''}>
      </td>
      <td style="padding: 10px;">
        <input type="url" placeholder="RSS URL" value="${rss.url || ''}" onchange="updateRssConfig(${index}, 'url', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <input type="text" placeholder="네이버" value="${rss.naver_category || ''}" onchange="updateRssConfig(${index}, 'naver_category', this.value)" onblur="scheduleSettingsMajorAutoSave({ immediate: true })" style="width: 100%; min-height: 28px; padding: 0 8px; font-size: 12px; box-sizing: border-box;">
          <input type="text" placeholder="워드프레스" value="${rss.wordpress_category || rss.category || ''}" onchange="updateRssConfig(${index}, 'wordpress_category', this.value)" onblur="scheduleSettingsMajorAutoSave({ immediate: true })" style="width: 100%; min-height: 28px; padding: 0 8px; font-size: 12px; box-sizing: border-box;">
        </div>
      </td>
      <td style="padding: 10px; text-align: center;">
        <input type="number" min="1" step="1" value="${rss.interval || 60}" onchange="updateRssConfig(${index}, 'interval', parseInt(this.value, 10))" style="width: 60px; min-height: 32px; text-align: center;">
      </td>
      <td style="padding: 10px;">
        <input type="text" placeholder="포함(쉼표 구분)" value="${Array.isArray(rss.includeKeywords) ? rss.includeKeywords.join(', ') : (rss.includeKeywords || '')}" onchange="updateRssConfig(${index}, 'includeKeywords', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px;">
        <input type="text" placeholder="제외(쉼표 구분)" value="${Array.isArray(rss.excludeKeywords) ? rss.excludeKeywords.join(', ') : (rss.excludeKeywords || '')}" onchange="updateRssConfig(${index}, 'excludeKeywords', this.value)" style="width: 100%; min-height: 32px; padding: 0 8px; box-sizing: border-box;">
      </td>
      <td style="padding: 10px; text-align: center; white-space: nowrap;">
        <div style="display: flex; gap: 4px; justify-content: center;">
          <button type="button" class="secondary compact" onclick="openRssTest(${index})">테스트</button>
          <button type="button" class="secondary compact" onclick="removeRssConfig(${index})">삭제</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

  });

  // Execute initialization tasks after all rows are fully mounted to the DOM
  setTimeout(() => initTasks.forEach(task => task()), 0);
}

function normalizeCategoryToken(input) {
  return String(input || '').trim();
}

function parseCategoryTokens(input) {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map(normalizeCategoryToken).filter(Boolean)));
  }
  const raw = String(input || '').trim();
  if (!raw) return [];
  return Array.from(new Set(
    raw
      .split(/[\n,]/)
      .map(normalizeCategoryToken)
      .filter(Boolean)
  ));
}

function serializeSelectedBlogAutoCategories() {
  return Array.from(blogAutoCategorySelected.values()).join(', ');
}

function getBlogAutoSettingsFromUi() {
  const modeEl = document.getElementById('blog-collect-trends-enabled');
  const variationNewEl = document.getElementById('blog-collect-trends-filter-new');
  const variationDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const variationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const variationTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');
  const trendsTimeEl = document.getElementById('blog-collect-trends-time');

  const variationMinRaw = String(variationMinEl?.value ?? '').trim();
  if (variationMinRaw && !/^-?\d+$/.test(variationMinRaw)) throw new Error('증감 숫자 기준은 정수만 입력할 수 있습니다.');
  const variationMin = normalizeBlogAutoVariationNumberValue(variationMinRaw, 50);

  const variationTopRaw = String(variationTopEl?.value ?? '').trim();
  if (variationTopRaw && !/^-?\d+$/.test(variationTopRaw)) throw new Error('상위 랭킹 개수는 앞선 정수만 필요합니다.');
  const variationTopN = normalizeBlogAutoVariationNumberValue(variationTopRaw, 5);

  const keywordReuseGapRaw = String(keywordReuseGapEl?.value ?? '').trim();
  if (keywordReuseGapRaw && !/^\d+$/.test(keywordReuseGapRaw)) throw new Error('중복 키워드 금지 간격은 0 이상의 정수만 입력할 수 있습니다.');
  const keywordReuseGap = normalizeBlogAutoKeywordReuseGapValue(keywordReuseGapRaw, 15);

  const categories = serializeSelectedBlogAutoCategories();

  return {
    COLLECT_TRENDS_ENABLED: Boolean(modeEl?.checked),
    COLLECT_TRENDS_CATEGORIES: categories,
    COLLECT_TRENDS_WP_CATEGORY: localStorage.getItem('blog_collect_trends_wp_category_value') || '',
    COLLECT_TRENDS_TIME: (trendsTimeEl?.value || '07:30').trim(),
    COLLECT_TRENDS_FILTER_INCLUDE_NEW: Boolean(variationNewEl?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_DASH: Boolean(variationDashEl?.checked),
    COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: Boolean(variationNumberEnabledEl?.checked),
    COLLECT_TRENDS_FILTER_TYPE: (variationTypeEl?.value || 'min').trim(),
    COLLECT_TRENDS_FILTER_MIN_INCR: variationMin,
    COLLECT_TRENDS_FILTER_TOP_N: variationTopN,
    COLLECT_TRENDS_REUSE_GAP_DAYS: keywordReuseGap
  };
}

function setSelectedBlogAutoCategories(categories = []) {
  blogAutoCategorySelected = new Set(parseCategoryTokens(categories));
}

function ensureSelectedCategoriesInCatalog() {
  if (!blogAutoCategorySelected.size) return;
  const existingKeys = new Set(blogAutoCategoryCatalog.map((v) => String(v).toLowerCase()));
  for (const category of blogAutoCategorySelected.values()) {
    const key = String(category).toLowerCase();
    if (!existingKeys.has(key)) {
      blogAutoCategoryCatalog.push(category);
      existingKeys.add(key);
    }
  }
}

function renderBlogAutoCategoryOptions() {
  const optionContainers = Array.from(document.querySelectorAll('[data-blog-category-options]'));
  if (optionContainers.length === 0) return;

  const categories = Array.from(new Set(blogAutoCategoryCatalog.map(normalizeCategoryToken).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'ko', { sensitivity: 'base' }));

  if (categories.length === 0) {
    optionContainers.forEach((el) => {
      el.innerHTML = '<p class="category-hint">표시할 카테고리가 없습니다.</p>';
    });
    return;
  }

  const html = categories
    .map((value) => {
      const escaped = escapeHtml(value);
      const active = blogAutoCategorySelected.has(value) ? 'active' : '';
      return `<button type="button" class="category-option-btn ${active}" data-blog-collect-trends-category-toggle="${escaped}">${escaped}</button>`;
    })
    .join('');
  optionContainers.forEach((el) => {
    el.innerHTML = html;
  });
}

function renderBlogAutoCategoryUi() {
  ensureSelectedCategoriesInCatalog();
  renderBlogAutoCategoryOptions();
}

function applyBlogAutoCategoryCatalog(data = {}) {
  const list = Array.isArray(data.categories) ? data.categories : [];
  blogAutoCategoryCatalog = parseCategoryTokens(list);
  blogAutoCategoryCatalogMeta = {
    runtimeCount: Number(data.runtimeCategories?.length || 0),
    trendCount: Number(data.trendCategories?.length || 0),
    updatedAt: String(data.updatedAt || '')
  };
}

async function loadBlogAutoCategoryCatalog(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;
  try {
    const query = force ? '?force=true' : '';
    const data = await fetchJson(`/api/v1/blog/auto/categories${query}`);
    applyBlogAutoCategoryCatalog(data);
    renderBlogAutoCategoryUi();
    if (!silent) {
      const base = `카테고리 목록 갱신 완료(${blogAutoCategoryCatalog.length}건)`;
      const detail = `(마스터 ${blogAutoCategoryCatalogMeta.runtimeCount} / 트렌드 ${blogAutoCategoryCatalogMeta.trendCount})`;
      setBlogAutoResultText(`${base} ${detail}`);
    }
  } catch (e) {
    if (!silent) setBlogAutoResultText(`카테고리 목록 갱신 실패: ${e.message}`);
  }
}

function clearAllBlogAutoCategories() {
  blogAutoCategorySelected.clear();
  renderBlogAutoCategoryUi();
  scheduleSettingsMajorAutoSave({ immediate: true });
}

function setShoppingAutoResultText(message) {
  const resultEl = document.getElementById('shopping-auto-result');
  if (resultEl) resultEl.textContent = String(message || '');
}

function normalizeShoppingAutoDailyPostsValue(rawValue) {
  let value = parseInt(String(rawValue || '').trim(), 10);
  if (!Number.isInteger(value) || value < 0) value = 0;
  return value;
}

function clampShoppingAutoDailyPostsInputValue(options = {}) {
  const force = options?.force === true;
  const inputEl = document.getElementById('shopping-auto-daily-posts');
  if (!inputEl) return;

  const raw = String(inputEl.value || '').trim();
  if (!raw) {
    if (force) inputEl.value = '0';
    return;
  }

  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    if (force) inputEl.value = '0';
    return;
  }

  const normalized = normalizeShoppingAutoDailyPostsValue(parsed);
  if (normalized !== parsed) {
    inputEl.value = String(normalized);
  }
}


function normalizeBlogAutoVariationNumberValue(rawValue, fallback = 50) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

function normalizeBlogAutoVariationNumberEnabledValue(rawValue, fallback = true) {
  if (typeof rawValue === 'boolean') return rawValue;
  const raw = String(rawValue ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes', 'on', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'off', 'n'].includes(raw)) return false;
  return fallback;
}

function normalizeBlogAutoKeywordReuseGapValue(rawValue, fallback = 15) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function syncBlogAutoVariationNumberUi() {
  const enabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const minWrap = document.getElementById('blog-collect-trends-filter-min-wrap');
  const topWrap = document.getElementById('blog-collect-trends-filter-top-wrap');
  if (!enabledEl) return;
  const enabled = Boolean(enabledEl.checked);

  if (minWrap) {
    const minInput = document.getElementById('blog-collect-trends-filter-min');
    if (minInput) minInput.disabled = !enabled;
    minWrap.classList.toggle('input-disabled', !enabled);
  }
  if (topWrap) {
    const topInput = document.getElementById('blog-collect-trends-filter-top');
    if (topInput) topInput.disabled = !enabled;
    topWrap.classList.toggle('input-disabled', !enabled);
  }
}

function syncBlogAutoVariationTypeUi() {
  const typeEl = document.getElementById('blog-collect-trends-filter-type');
  const minWrap = document.getElementById('blog-collect-trends-filter-min-wrap');
  const topWrap = document.getElementById('blog-collect-trends-filter-top-wrap');
  if (!typeEl || !minWrap || !topWrap) return;

  if (typeEl.value === 'top') {
    minWrap.style.display = 'none';
    topWrap.style.display = 'block';
  } else {
    minWrap.style.display = 'block';
    topWrap.style.display = 'none';
  }
}
function normalizeBlogAutoVariationNumberValue(rawValue, fallback = 50) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
}

function normalizeBlogAutoVariationNumberEnabledValue(rawValue, fallback = true) {
  if (typeof rawValue === 'boolean') return rawValue;
  const str = String(rawValue ?? '').toLowerCase();
  if (str === 'true') return true;
  if (str === 'false') return false;
  return fallback;
}


async function loadBlogCollectSettings({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '블로그 자동글감 설정'
  });
  if (!canReload) return false;

  const modeEl = document.getElementById('blog-collect-trends-enabled');
  const trendsTimeEl = document.getElementById('blog-collect-trends-time');
  const variationNewEl = document.getElementById('blog-collect-trends-filter-new');
  const variationDashEl = document.getElementById('blog-collect-trends-filter-dash');
  const variationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const variationMinEl = document.getElementById('blog-collect-trends-filter-min');
  const variationTopEl = document.getElementById('blog-collect-trends-filter-top');
  const keywordReuseGapEl = document.getElementById('blog-collect-trends-reuse-gap');
  setBlogCollectResultText('불러오는 중...');
  try {
    const [data] = await Promise.all([
      fetchJson('/api/v1/settings/major'),
      loadBlogAutoCategoryCatalog({ silent: true })
    ]);
    const fields = data?.fields || {};
    if (modeEl) modeEl.checked = Boolean(fields.COLLECT_TRENDS_ENABLED);
    setSelectedBlogAutoCategories(fields.COLLECT_TRENDS_CATEGORIES || '');
    renderBlogAutoCategoryUi();

    const catVal = String(fields.COLLECT_TRENDS_WP_CATEGORY || '');
    const triggerText = document.getElementById('blog-collect-trends-wp-category-text');
    if (triggerText) {
      triggerText.textContent = catVal || '카테고리 선택 (미지정 시 기본)';
    }
    localStorage.setItem('blog_collect_trends_wp_category_value', catVal);
    localStorage.setItem('blog_collect_trends_wp_category_name', catVal || '카테고리 선택 (미지정 시 기본)');

    // Async Init
    initWpCategorySelector({
      optionsContainerId: 'blog-collect-trends-wp-category-options',
      triggerTextId: 'blog-collect-trends-wp-category-text',
      containerId: 'blog-collect-trends-wp-category-container',
      storagePrefix: 'blog_collect_trends_',
      initialValue: fields.COLLECT_TRENDS_WP_CATEGORY || '',
      initialText: fields.COLLECT_TRENDS_WP_CATEGORY || '카테고리 선택 (또는 직접 입력)',
      onValueChange: (val) => {
        scheduleSettingsMajorAutoSave({ immediate: true });
      }
    });


    if (trendsTimeEl) trendsTimeEl.value = String(fields.COLLECT_TRENDS_TIME || '07:30');

    if (variationNewEl) variationNewEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_NEW);
    if (variationDashEl) variationDashEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_DASH);
    const variationTypeEl = document.getElementById('blog-collect-trends-filter-type');
    if (variationNumberEnabledEl) {
      variationNumberEnabledEl.checked = Boolean(fields.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER);
    }
    if (variationTypeEl) {
      variationTypeEl.value = String(fields.COLLECT_TRENDS_FILTER_TYPE || 'min');
    }
    if (variationMinEl) {
      const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_MIN_INCR, 50);
      variationMinEl.value = val === '' ? '' : String(val);
    }
    if (variationTopEl) {
      const val = normalizeBlogAutoVariationNumberValue(fields.COLLECT_TRENDS_FILTER_TOP_N, 5);
      variationTopEl.value = val === '' ? '' : String(val);
    }
    syncBlogAutoVariationTypeUi();
    syncBlogAutoVariationNumberUi();
    if (keywordReuseGapEl) {
      keywordReuseGapEl.value = String(fields.COLLECT_TRENDS_REUSE_GAP_DAYS || 15);
    }

    const rssGlobalEnabledEl = document.getElementById('blog-collect-rss-enabled');
    if (rssGlobalEnabledEl) rssGlobalEnabledEl.checked = Boolean(fields.COLLECT_RSS_ENABLED ?? false);

    let rssArr = [];
    try { rssArr = typeof fields.COLLECT_RSS_CONFIGS === 'string' ? JSON.parse(fields.COLLECT_RSS_CONFIGS) : fields.COLLECT_RSS_CONFIGS; } catch (e) { }
    renderBlogCollectRssUi(rssArr);

    setBlogCollectResultText([
      '불러오기 완료',
      '- 수집 기준을 확인했습니다.',
      '- 변경 후 상단의 저장 및 적용 버튼으로 반영할 수 있습니다.'
    ].join('\n'));
    return true;
  } catch (e) {
    setBlogCollectResultText(`오류: ${e.message}`);
    return false;
  }
}

async function saveBlogCollectSettings() {
  setBlogCollectResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };

    const uiSettings = getBlogAutoSettingsFromUi();

    const payload = {
      ...fields,
      ...uiSettings,
      COLLECT_RSS_ENABLED: Boolean(document.getElementById('blog-collect-rss-enabled')?.checked),
      COLLECT_RSS_CONFIGS: JSON.stringify(currentRssConfigs)
    };
    await postJson('/api/v1/settings/major', payload);

    setBlogCollectResultText([
      '저장 완료',
      '- 자동수집 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setBlogCollectResultText(`오류: ${e.message}`);
  }
}

async function loadBlogAutoSettings({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '블로그 자동 포스팅 설정'
  });
  if (!canReload) return false;

  const publishEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('blog-publish-auto-interval');
  const publishBatchEl = document.getElementById('blog-publish-auto-batch');
  const postStatusEl = document.getElementById('blog-publish-auto-post-status');
  const headlessEl = document.getElementById('blog-publish-auto-headless');

  setBlogAutoResultText('불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    const fields = data?.fields || {};

    if (publishEnabledEl) publishEnabledEl.checked = Boolean(fields.PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(fields.PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(fields.PUBLISH_AUTO_BATCH_SIZE || 1);
    if (postStatusEl) postStatusEl.value = fields.PUBLISH_AUTO_POST_STATUS === 'draft' ? 'draft' : 'publish';

    const targetChannels = String(fields.PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-publish-target]').forEach(el => {
      el.checked = targetChannels.includes(el.getAttribute('data-publish-target'));
    });

    if (headlessEl) headlessEl.checked = Boolean(fields.PUBLISH_AUTO_HEADLESS ?? true);
    if (document.getElementById('blog-publish-auto-start-time')) document.getElementById('blog-publish-auto-start-time').value = String(fields.PUBLISH_AUTO_START_TIME || '00:00');
    if (document.getElementById('blog-publish-auto-end-time')) document.getElementById('blog-publish-auto-end-time').value = String(fields.PUBLISH_AUTO_END_TIME || '23:59');

    setBlogAutoResultText([
      '불러오기 완료',
      '- 자동발행 기준을 확인했습니다.',
      '- 변경 후 상단의 저장 및 적용 버튼으로 반영할 수 있습니다.'
    ].join('\n'));
    return true;
  } catch (e) {
    setBlogAutoResultText(`오류: ${e.message}`);
    return false;
  }
}

async function saveBlogAutoSettings() {
  const publishEnabledEl = document.getElementById('blog-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('blog-publish-auto-interval');
  const publishBatchEl = document.getElementById('blog-publish-auto-batch');
  const postStatusEl = document.getElementById('blog-publish-auto-post-status');
  const headlessEl = document.getElementById('blog-publish-auto-headless');

  setBlogAutoResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };

    const payload = {
      ...fields,
      PUBLISH_AUTO_ENABLED: Boolean(publishEnabledEl?.checked),
      PUBLISH_AUTO_INTERVAL_MIN: parseInt(publishIntervalEl?.value || '60', 10),
      PUBLISH_AUTO_BATCH_SIZE: parseInt(publishBatchEl?.value || '1', 10),
      PUBLISH_AUTO_POST_STATUS: postStatusEl?.value === 'draft' ? 'draft' : 'publish',
      PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')).join(','),
      PUBLISH_AUTO_HEADLESS: Boolean(headlessEl?.checked),
      PUBLISH_AUTO_START_TIME: (document.getElementById('blog-publish-auto-start-time')?.value || '00:00').trim(),
      PUBLISH_AUTO_END_TIME: (document.getElementById('blog-publish-auto-end-time')?.value || '23:59').trim()
    };

    await postJson('/api/v1/settings/major', payload);

    setBlogAutoResultText([
      '저장 완료',
      '- 자동 포스팅 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setBlogAutoResultText(`오류: ${e.message}`);
  }
}

async function runBlogCollectTrendsManual() {
  if (!guardUiConfigReady('트렌드 수동 실행')) return;
  const resultEl = document.getElementById('blog-collect-trends-result');
  const runDateEl = document.getElementById('blog-collect-trends-date');

  const rawDate = String(runDateEl?.value || '').trim();

  const confirmMessage = rawDate ? `${rawDate} 기준으로 트렌드 수집을 수동 실행하시겠습니까 ? ` : `오늘 날짜를 기준으로 트렌드 수집을 수동 실행하시겠습니까 ? `;
  if (await showUiConfirm(confirmMessage) === false) return;

  if (resultEl) resultEl.textContent = '트렌드 수집 실행 중...';
  try {
    const settings = getBlogAutoSettingsFromUi();
    const data = await postJson('/api/v1/auto/collect/trends/run', { trendDate: rawDate, settings });
    // Handle both data structures (nested or direct summary) gracefully
    const dataPayload = data?.data || data;
    const summary = dataPayload?.summary || dataPayload || {};

    const lines = [
      '수동 수집 완료',
      `- 트렌드 수집: ${Number(summary?.trendsCollected || 0)
      }건`,
      `- Topics 추가: ${Number(summary?.trendsToTopics || 0)
      }건`
    ];
    if (resultEl) resultEl.textContent = lines.join('\n');
    await loadBlogTopics({ silent: true });
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function runBlogCollectRssManual() {
  if (!guardUiConfigReady('RSS 1회 수집')) return;
  const resultEl = document.getElementById('blog-collect-trends-result');
  if (await showUiConfirm('RSS 수집을 수동 실행하시겠습니까?') === false) return;
  if (resultEl) resultEl.textContent = 'RSS 수집 실행 중...';
  try {
    const data = await postJson('/api/v1/auto/collect/rss/run', {
      settingsOverrides: {
        COLLECT_RSS_CONFIGS: currentRssConfigs
      }
    });
    if (resultEl) resultEl.textContent = `RSS 수집 완료: ${JSON.stringify(data.data?.summary || data)}`;
  } catch (e) {
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  }
}

async function loadShoppingAutoSettings({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '쇼핑 자동 포스팅 설정'
  });
  if (!canReload) return false;

  const publishEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const publishBatchEl = document.getElementById('shopping-publish-auto-batch');
  const startTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const endTimeEl = document.getElementById('shopping-publish-auto-end-time');
  const notifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');
  setShoppingAutoResultText('불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    const fields = data?.fields || {};
    if (publishEnabledEl) publishEnabledEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(fields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(fields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
    if (startTimeEl) startTimeEl.value = String(fields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
    if (endTimeEl) endTimeEl.value = String(fields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
    if (headlessEl) headlessEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
    if (notifyEnabledEl) notifyEnabledEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

    const targetChannels = Array.isArray(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
      ? fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
      : String(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-shopping-publish-target]').forEach((el) => {
      el.checked = targetChannels.includes(el.getAttribute('data-shopping-publish-target'));
    });

    setShoppingAutoResultText([
      '불러오기 완료',
      '- 자동발행 기준을 확인했습니다.',
      '- 변경 후 상단의 저장 및 적용 버튼으로 반영할 수 있습니다.'
    ].join('\n'));
    return true;
  } catch (e) {
    setShoppingAutoResultText(`오류: ${e.message}`);
    return false;
  }
}

async function saveShoppingAutoSettings() {
  const publishEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const publishBatchEl = document.getElementById('shopping-publish-auto-batch');
  const startTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const endTimeEl = document.getElementById('shopping-publish-auto-end-time');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');
  const notifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  setShoppingAutoResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };
    const payload = {
      ...fields,
      SHOPPING_PUBLISH_AUTO_ENABLED: Boolean(publishEnabledEl?.checked),
      SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: parseInt(publishIntervalEl?.value || '60', 10),
      SHOPPING_PUBLISH_AUTO_BATCH_SIZE: parseInt(publishBatchEl?.value || '1', 10),
      SHOPPING_PUBLISH_AUTO_START_TIME: (startTimeEl?.value || '00:00').trim(),
      SHOPPING_PUBLISH_AUTO_END_TIME: (endTimeEl?.value || '23:59').trim(),
      SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')).join(','),
      SHOPPING_PUBLISH_AUTO_HEADLESS: Boolean(headlessEl?.checked),
      SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(notifyEnabledEl?.checked)
    };
    const saved = await postJson('/api/v1/settings/major', payload);
    const savedFields = saved?.fields || {};
    if (publishEnabledEl) publishEnabledEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
    if (startTimeEl) startTimeEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
    if (endTimeEl) endTimeEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
    if (headlessEl) headlessEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
    if (notifyEnabledEl) notifyEnabledEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

    const targetChannels = Array.isArray(savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
      ? savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
      : String(savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-shopping-publish-target]').forEach((el) => {
      el.checked = targetChannels.includes(el.getAttribute('data-shopping-publish-target'));
    });

    setShoppingAutoResultText([
      '저장 완료',
      '- 쇼핑 자동 포스팅 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setShoppingAutoResultText(`오류: ${e.message}`);
  }
}

async function runShoppingAutoManual() {
  if (!guardUiConfigReady('쇼핑 자동발행 수동 실행')) return;
  if (shoppingAutoManualRunInFlight) return;

  const resultEl = document.getElementById('shopping-auto-result');
  const batchEl = document.getElementById('shopping-publish-auto-batch');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');

  let quota;
  try {
    quota = await getPublishQuotaPreflight(parseInt((batchEl?.value || '1').trim(), 10) || 1);
  } catch (error) {
    if (resultEl) resultEl.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }
  if (quota.executable === 0) {
    if (resultEl) resultEl.textContent = quota.message;
    return;
  }
  const shouldProceed = await showUiConfirm(quota.message, {
    title: '수동 실행 확인',
    confirmText: '진행',
    cancelText: '취소'
  });
  if (shouldProceed === false) {
    if (resultEl) resultEl.textContent = '수동 실행이 취소되었습니다.';
    return;
  }

  const batchSize = parseInt((batchEl?.value || '1').trim(), 10) || 1;
  const targets = Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')).join(',');
  const headless = Boolean(headlessEl?.checked);

  shoppingAutoManualRunInFlight = true;
  if (resultEl) resultEl.textContent = '쇼핑 자동발행 파이프라인 실행 중...';
  pauseDashboardPolling();
  try {
    const data = await postJson('/api/v1/auto/shopping/run', {
      settingsOverrides: {
        SHOPPING_PUBLISH_AUTO_BATCH_SIZE: batchSize,
        SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: targets,
        SHOPPING_PUBLISH_AUTO_HEADLESS: headless
      }
    });
    const summary = data?.summary || {};
    const lines = [
      '쇼핑 수동 실행 완료',
      `- 시도 / 성공: ${Number(summary?.attempted || 0)
      } / ${Number(summary?.success || 0)}건`
    ];
    if (resultEl) resultEl.textContent = lines.join('\n');
    await Promise.all([
      loadDashboard(),
      loadBlogShopping({ silent: true })
    ]);
  } catch (e) {
    console.error('[Shopping][ManualRun] Failed:', e);
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  } finally {
    shoppingAutoManualRunInFlight = false;
    resumeDashboardPolling();
  }
}

async function runBlogPublishAutoManual() {
  if (!guardUiConfigReady('자동발행 수동 실행')) return;
  if (blogAutoManualRunInFlight) return;

  const batchEl = document.getElementById('blog-publish-auto-batch');
  const postStatusEl = document.getElementById('blog-publish-auto-post-status');
  const headlessEl = document.getElementById('blog-publish-auto-headless');
  const resultEl = document.getElementById('blog-publish-auto-result');
  const batchSize = parseInt((batchEl?.value || '1').trim(), 10) || 1;
  const postStatus = postStatusEl?.value === 'draft' ? 'draft' : 'publish';
  const targets = Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')).join(',');
  const headless = Boolean(headlessEl?.checked);

  try {
    const quota = await getPublishQuotaPreflight(batchSize);
    if (quota.executable === 0) {
      if (resultEl) resultEl.textContent = quota.message;
      return;
    }
    if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) return;
  } catch (error) {
    if (resultEl) resultEl.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }

  blogAutoManualRunInFlight = true;

  try {
    await runWithLiveProgress({
      targetEl: resultEl,
      requestLabel: '수동 발행 실행',
      requestFn: () => postJson('/api/v1/auto/publish/run', {
        settingsOverrides: {
          PUBLISH_AUTO_BATCH_SIZE: batchSize,
          PUBLISH_AUTO_POST_STATUS: postStatus,
          PUBLISH_AUTO_TARGET_CHANNELS: targets,
          PUBLISH_AUTO_HEADLESS: headless
        }
      })
    });
    await Promise.all([
      loadDashboard(),
      loadBlogTopics({ silent: true })
    ]);
  } catch (e) {
    // runWithLiveProgress already shows error in the log area
  } finally {
    blogAutoManualRunInFlight = false;
  }
}

function bindActions() {
  document.querySelectorAll('.app-title').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelector('.nav-btn[data-view="dashboard"]').click();
    });
  });

  // Logs 위젯 이벤트 (Pill 탭 전환)
  const logsTabBtns = Array.from(document.querySelectorAll('.logs-tab-btn'));
  logsTabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      logsTabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const tabName = e.target.getAttribute('data-logs-tab');
      document.querySelectorAll('.logs-tab-panel').forEach(p => p.style.display = 'none');
      document.getElementById(`logs-tab-${tabName}`).style.display = 'block';
      if (tabName === 'system') loadLogFiles();
      else loadDashboardLogs();
    });
  });

  const logsActivityRefreshBtn = document.getElementById('logs-activity-refresh-btn');
  if (logsActivityRefreshBtn) {
    logsActivityRefreshBtn.addEventListener('click', () => {
      loadDashboardLogs();
      logsActivityRefreshBtn.textContent = '불러오는 중...';
      setTimeout(() => logsActivityRefreshBtn.textContent = '새로고침', 500);
    });
  }

  const logsSystemFileSelect = document.getElementById('logs-system-file-select');
  const logsSystemRefreshBtn = document.getElementById('logs-system-refresh-btn');
  if (logsSystemFileSelect) {
    logsSystemFileSelect.addEventListener('change', loadSystemLog);
  }
  if (logsSystemRefreshBtn) {
    logsSystemRefreshBtn.addEventListener('click', () => {
      loadSystemLog();
      logsSystemRefreshBtn.textContent = '불러오는 중...';
      setTimeout(() => logsSystemRefreshBtn.textContent = '현재 파일 새로고침', 500);
    });
  }

  const dialogBackdrop = document.getElementById('ui-dialog-backdrop');
  const dialogConfirmBtn = document.getElementById('ui-dialog-confirm');
  const dialogCancelBtn = document.getElementById('ui-dialog-cancel');
  const dialogInputEl = document.getElementById('ui-dialog-input');
  if (dialogConfirmBtn) {
    dialogConfirmBtn.addEventListener('click', () => closeUiDialog(true));
  }
  if (dialogCancelBtn) {
    dialogCancelBtn.addEventListener('click', () => closeUiDialog(false));
  }
  if (dialogBackdrop) {
    dialogBackdrop.addEventListener('click', (e) => {
      if (e.target === dialogBackdrop) closeUiDialog(false);
    });
  }
  if (dialogInputEl) {
    dialogInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeUiDialog(true);
      }
    });
  }
  document.querySelectorAll('.label-help').forEach((helpEl) => {
    helpEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    helpEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const backdrop = document.getElementById('ui-dialog-backdrop');
    if (backdrop && !backdrop.classList.contains('hidden')) {
      closeUiDialog(false);
    }
  });

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadConfigStatus().finally(() => loadDashboard());
    });
  }

  const quickModeAiBtn = document.getElementById('quick-mode-ai-btn');
  const quickModeManuscriptBtn = document.getElementById('quick-mode-manuscript-btn');
  const quickModePastedBtn = document.getElementById('quick-mode-pasted-btn');
  const quickSubjectInput = document.getElementById('quick-subject');
  const quickKeywordsInput = document.getElementById('quick-keywords');
  const quickRecommendationList = document.getElementById('quick-topic-recommendations-list');
  const quickRecommendationRefresh = document.getElementById('quick-topic-recommendations-refresh');
  quickModeAiBtn?.addEventListener('click', () => applyQuickInputMode('ai'));
  quickModeManuscriptBtn?.addEventListener('click', () => applyQuickInputMode('manuscript'));
  quickModePastedBtn?.addEventListener('click', () => applyQuickInputMode('pasted'));
  applyQuickInputMode(quickInputMode);
  quickSubjectInput?.addEventListener('input', handleQuickTopicIdentityInput);
  quickKeywordsInput?.addEventListener('input', handleQuickTopicIdentityInput);
  quickRecommendationRefresh?.addEventListener('click', () => loadQuickTopicRecommendations({ refresh: true }));
  quickRecommendationList?.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-recommendation-action]');
    const row = event.target.closest('[data-recommendation-id]');
    if (!actionButton || !row) return;
    const item = quickTopicRecommendationState.items.find((entry) => String(entry.id || '') === String(row.dataset.recommendationId || ''));
    if (!item) return;
    const action = String(actionButton.dataset.recommendationAction || '');
    if (action === 'reason') {
      const reason = row.querySelector('.quick-topic-recommendation-reason');
      const expanded = actionButton.getAttribute('aria-expanded') === 'true';
      actionButton.setAttribute('aria-expanded', String(!expanded));
      if (reason) reason.hidden = expanded;
      return;
    }
    if (action === 'dismiss') {
      await recordQuickTopicRecommendationOutcome(item, 'feedback', { feedback: 'not_helpful' });
      quickTopicRecommendationState.items = quickTopicRecommendationState.items.filter((entry) => entry !== item);
      renderQuickTopicRecommendations();
      return;
    }
    actionButton.disabled = true;
    try {
      const applied = await applyQuickTopicRecommendation(item);
      if (applied && action === 'save') document.getElementById('quick-save-btn')?.click();
    } finally {
      actionButton.disabled = false;
    }
  });

  const saveBtn = document.getElementById('quick-save-btn');
  const directPublishBtn = document.getElementById('quick-direct-publish-btn');
  const generateBtn = document.getElementById('quick-generate-btn');
  const previewPublishBtn = document.getElementById('quick-preview-publish-btn');
  const clearBtn = document.getElementById('quick-clear-btn');
  const resultEl = document.getElementById('quick-result');
  let quickPublishInFlight = false;
  let shoppingQuickPublishInFlight = false;

  const buildQuickPayload = (mode) => {
    const targets = [];
    if (document.getElementById('quick-target-naver')?.checked) targets.push('naver');
    if (document.getElementById('quick-target-wordpress')?.checked) targets.push('wordpress');

    const naverCat = (document.getElementById('quick-naver-category')?.value || '').trim();
    const wpCat = (document.getElementById('quick-wp-category')?.value || '').trim();

    const trendContext = getActiveQuickTrendContext();
    const recommendationContext = getActiveQuickRecommendationContext();
    const payload = {
      subject: (document.getElementById('quick-subject')?.value || '').trim(),
      title: (document.getElementById('quick-title')?.value || '').trim(),
      keywords: (document.getElementById('quick-keywords')?.value || '').trim(),
      instruction: (document.getElementById('quick-instruction')?.value || '').trim(),
      writingStrategy: getSelectedSettingsRadioValue(
        'quick-writing-strategy',
        currentBlogWritingStrategy
      ),
      referenceUrl: (document.getElementById('quick-reference-url')?.value || '').trim(),
      imageGeneration: Boolean(document.getElementById('quick-image-generation')?.checked),
      externalReference: Boolean(document.getElementById('quick-external-reference')?.checked),
      headless: Boolean(document.getElementById('quick-headless')?.checked),
      publishMode: mode,
      targets,
      naverCategory: naverCat,
      wordpressCategory: wpCat,
      postStatus: (document.getElementById('quick-wp-post-status')?.value || 'publish').trim(),
      scheduleDate: (document.getElementById('quick-wp-schedule-date')?.value || '').trim()
    };
    if (trendContext) {
      payload.source = trendContext.source;
      payload.trendDate = trendContext.trendDate;
    } else if (recommendationContext) {
      payload.source = 'topic_recommendation';
      payload.recommendation = recommendationContext.recommendation;
    }

    // [Consolidated] Individual options are now persisted via initGlobalPublishSettingsSync change listeners.

    return payload;
  };

  const buildQuickPreviewPublishPayload = () => ({
    previewId: quickGeneratedPreviewState.previewId,
    targets: [
      document.getElementById('quick-target-naver')?.checked ? 'naver' : '',
      document.getElementById('quick-target-wordpress')?.checked ? 'wordpress' : ''
    ].filter(Boolean),
    naverCategory: (document.getElementById('quick-naver-category')?.value || '').trim(),
    wordpressCategory: (document.getElementById('quick-wp-category')?.value || '').trim(),
    postStatus: (document.getElementById('quick-wp-post-status')?.value || 'publish').trim(),
    scheduleDate: (document.getElementById('quick-wp-schedule-date')?.value || '').trim(),
    headless: Boolean(document.getElementById('quick-headless')?.checked)
  });

  function getQuickPreviewActiveTarget() {
    const stateTarget = String(quickGeneratedPreviewState.activeTarget || '').trim();
    if (stateTarget && quickGeneratedPreviewState.previews?.[stateTarget]) return stateTarget;
    const primaryTarget = String(quickGeneratedPreviewState.primaryTarget || '').trim();
    if (primaryTarget && quickGeneratedPreviewState.previews?.[primaryTarget]) return primaryTarget;
    const previewTargets = Object.keys(quickGeneratedPreviewState.previews || {});
    return previewTargets[0] || '';
  }

  function setQuickPreviewActiveTarget(target) {
    const normalized = String(target || '').trim().toLowerCase();
    if (!normalized || !quickGeneratedPreviewState.previews?.[normalized]) return;
    quickGeneratedPreviewState.activeTarget = normalized;
    renderQuickGeneratedPreview();
  }

  function renderQuickPreviewValidation(validation = null) {
    const el = document.getElementById('quick-preview-validation');
    if (!el) return;
    el.classList.remove('has-error', 'has-warning', 'is-ok');
    if (!validation) {
      el.textContent = '아직 생성된 preview가 없습니다.';
      return;
    }
    const lines = [];
    if (Array.isArray(validation.errors) && validation.errors.length > 0) {
      el.classList.add('has-error');
      lines.push('[오류]');
      validation.errors.forEach((item) => lines.push(`- ${item}`));
    }
    if (Array.isArray(validation.warnings) && validation.warnings.length > 0) {
      if (!el.classList.contains('has-error')) el.classList.add('has-warning');
      if (lines.length > 0) lines.push('');
      lines.push('[경고]');
      validation.warnings.forEach((item) => lines.push(`- ${item}`));
    }
    if (lines.length === 0) {
      el.classList.add('is-ok');
      lines.push('검증 통과: 생성된 preview에 표시할 경고가 없습니다.');
    }
    el.textContent = lines.join('\n');
  }

  function renderQuickPreviewBodyHtml(data = null) {
    const items = Array.isArray(data?.contentItems) ? data.contentItems : [];
    const images = Array.isArray(data?.images) ? data.images : [];
    const imageMap = new Map(images.map((image) => [Number(image.index), image]));
    const fragments = [];
    let activeListType = '';

    const closeList = () => {
      if (!activeListType) return;
      fragments.push(activeListType === 'ordered' ? '</ol>' : '</ul>');
      activeListType = '';
    };

    const renderImageFigure = (item = {}) => {
      const image = imageMap.get(Number(item.index));
      const previewUrl = image?.previewUrl || '';
      const imageBody = previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image?.title || item.text || '')}" loading="lazy">`
        : `<div class="local-markdown-inline-image-missing">매칭되는 생성 이미지가 없습니다.</div>`;
      return `
        <figure>
          ${imageBody}
          <figcaption>
            <div class="image-caption-title">${escapeHtml(image?.title || item.text || `IMAGE_${item.index}`)}</div>
            ${image?.prompt || item.prompt ? `<div class="image-caption-prompt">${escapeHtml(image?.prompt || item.prompt || '')}</div>` : ''}
          </figcaption>
        </figure>
      `;
    };

    items.forEach((item) => {
      const type = String(item?.type || 'paragraph');
      const text = renderInlinePreviewHtml(item?.text || '', item?.boldRanges);
      if (type !== 'list-item') closeList();

      if (type === 'header-h2') {
        fragments.push(`<h2>${text}</h2>`);
        return;
      }
      if (type === 'header-h3') {
        fragments.push(`<h3>${text}</h3>`);
        return;
      }
      if (type === 'quote') {
        fragments.push(`<blockquote><p>${text}</p></blockquote>`);
        return;
      }
      if (type === 'list-item') {
        const nextListType = item?.listType === 'ordered' ? 'ordered' : 'unordered';
        if (activeListType !== nextListType) {
          closeList();
          fragments.push(nextListType === 'ordered' ? '<ol>' : '<ul>');
          activeListType = nextListType;
        }
        fragments.push(`<li>${text}</li>`);
        return;
      }
      if (type === 'image') {
        fragments.push(renderImageFigure(item));
        return;
      }
      if (type === 'separator') {
        fragments.push('<div class="local-markdown-preview-separator" role="separator" aria-label="구분선"></div>');
        return;
      }
      if (type === 'newline') {
        fragments.push('<div style="height:8px"></div>');
        return;
      }
      fragments.push(`<p>${text}</p>`);
    });

    closeList();
    return fragments.join('') || '<div class="local-markdown-empty">본문 preview를 표시할 내용이 없습니다.</div>';
  }

  function renderQuickGeneratedPreview(data) {
    const emptyEl = document.getElementById('quick-preview-empty');
    const panelEl = document.getElementById('quick-preview-panel');
    const tabsEl = document.getElementById('quick-preview-tabs');
    const tabButtons = Array.from(document.querySelectorAll('#quick-preview-tabs .preview-target-tab'));
    const titleEl = document.getElementById('quick-preview-title');
    const metaEl = document.getElementById('quick-preview-meta');
    const badgeEl = document.getElementById('quick-preview-target-badge');
    const bodyEl = document.getElementById('quick-body-preview');
    const imageListEl = document.getElementById('quick-image-list');

    const activeTarget = getQuickPreviewActiveTarget();
    const resolvedData = typeof data === 'undefined'
      ? (quickGeneratedPreviewState.previews?.[activeTarget] || null)
      : data;

    if (!resolvedData) {
      renderQuickPreviewValidation(null);
      if (emptyEl) emptyEl.hidden = false;
      if (panelEl) panelEl.hidden = true;
      if (panelEl) panelEl.classList.remove('is-expanded', 'is-compact');
      if (tabsEl) tabsEl.hidden = true;
      if (bodyEl) bodyEl.innerHTML = '';
      if (imageListEl) imageListEl.innerHTML = '';
      if (badgeEl) badgeEl.textContent = '미리보기 기준: -';
      if (previewPublishBtn) previewPublishBtn.disabled = true;
      return;
    }

    const activePreview = quickGeneratedPreviewState.previews?.[activeTarget] || resolvedData;
    const previewTargets = Object.keys(quickGeneratedPreviewState.previews || {});

    renderQuickPreviewValidation(activePreview.validation || null);
    if (emptyEl) emptyEl.hidden = true;
    if (panelEl) panelEl.hidden = false;
    if (tabsEl) tabsEl.hidden = previewTargets.length <= 1;
    tabButtons.forEach((button) => {
      const target = String(button.dataset.target || '').trim();
      button.hidden = !previewTargets.includes(target);
      button.classList.toggle('is-active', target === activeTarget);
    });
    if (titleEl) titleEl.textContent = activePreview.title || '제목 없음';
    if (metaEl) {
      const source = activePreview.source || {};
      const stats = activePreview.stats || {};
      metaEl.textContent = [
        source.fileName || '',
        source.folderName || source.directoryPath || '',
        `${stats.contentCount || 0}개 블록`,
        `이미지 ${stats.imageResolvedCount || 0}/${stats.imageBlockCount || 0}개`
      ].filter(Boolean).join(' | ');
    }
    if (badgeEl) {
      const label = activeTarget === 'wordpress' ? '워드프레스' : '네이버 블로그';
      badgeEl.textContent = `미리보기 기준: ${label}`;
    }
    if (bodyEl) bodyEl.innerHTML = renderQuickPreviewBodyHtml(activePreview);
    if (imageListEl) {
      const images = Array.isArray(activePreview.images) ? activePreview.images : [];
      imageListEl.innerHTML = images.length === 0
        ? '<div class="local-markdown-empty">이미지 블록이 없습니다.</div>'
        : images.map((image) => {
          const statusClass = image.exists ? 'ok' : 'missing';
          const statusText = image.exists ? '매칭됨' : '누락';
          const preview = image.previewUrl
            ? `<div class="local-markdown-image-card-preview"><img src="${escapeHtml(image.previewUrl)}" alt="${escapeHtml(image.title || '')}" loading="lazy"></div>`
            : '<div class="local-markdown-image-card-preview"><div class="local-markdown-image-card-placeholder">매칭되는 생성 이미지가 없습니다.</div></div>';
          return `
            <article class="local-markdown-image-card">
              <div class="local-markdown-image-card-header">
                <div>
                  <div class="local-markdown-image-card-title">IMAGE_${escapeHtml(String(image.index))} ${escapeHtml(image.title || '')}</div>
                  <div class="local-markdown-image-card-meta">${escapeHtml(image.fileName || '파일 미매칭')}</div>
                </div>
                <span class="local-markdown-image-card-status ${statusClass}">${statusText}</span>
              </div>
              ${preview}
              <p class="local-markdown-image-card-prompt">${escapeHtml(image.prompt || '')}</p>
            </article>
          `;
        }).join('');
    }
    setLocalMarkdownPreviewDensity(panelEl, bodyEl, imageListEl, activePreview.stats || {});
    if (previewPublishBtn) previewPublishBtn.disabled = false;
  }

  function clearQuickGeneratedPreview() {
    quickGeneratedPreviewState = {
      previewId: '',
      rowIndex: null,
      rowNumber: null,
      primaryTarget: '',
      targets: [],
      activeTarget: '',
      previews: {}
    };
    renderQuickGeneratedPreview(null);
  }

  const runQuickPublish = async (mode, payloadOverride = null) => {
    if (!resultEl) return;
    if (!guardUiConfigReady('빠른발행')) return;
    if (quickPublishInFlight) {
      resultEl.textContent = '이미 요청이 진행 중입니다. 잠시만 기다려주세요.';
      return;
    }
    clearQuickGeneratedPreview();
    quickPublishInFlight = true;
    if (saveBtn) saveBtn.disabled = true;
    if (directPublishBtn) directPublishBtn.disabled = true;
    if (generateBtn) generateBtn.disabled = true;
    if (previewPublishBtn) previewPublishBtn.disabled = true;

    const dummyPayload = payloadOverride || buildQuickPayload(mode);
    if (mode === 'publish') dummyPayload.operationId = crypto.randomUUID();

    if (dummyPayload.postStatus === 'schedule') {
      if (!dummyPayload.scheduleDate) {
        if (resultEl) resultEl.textContent = '⚠️ 예약 발행을 위해서는 예약 일시를 선택해야 합니다.';
        showUiPopup('예약 발행을 위해서는 예약 일시를 입력해야 합니다.');
        if (saveBtn) saveBtn.disabled = false;
        if (directPublishBtn) directPublishBtn.disabled = false;
        if (generateBtn) generateBtn.disabled = false;
        if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
        quickPublishInFlight = false;
        return;
      }
    }

    // [New] Require at least one of Subject, Keywords, or Reference URL
    if (!dummyPayload.subject && !dummyPayload.keywords && !dummyPayload.referenceUrl) {
        const msg = 'Subject, Keywords, 참고 URL 중 최소 하나는 입력해 주세요.';
        if (resultEl) resultEl.textContent = `⚠️ ${msg}`;
        showUiPopup(msg);
        if (saveBtn) saveBtn.disabled = false;
        if (directPublishBtn) directPublishBtn.disabled = false;
        if (generateBtn) generateBtn.disabled = false;
        if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
        quickPublishInFlight = false;
        return;
    }

    const preCheck = checkPublishPrerequisites(dummyPayload.targets);
    if (!preCheck.ok) {
      resultEl.textContent = preCheck.message;
      quickPublishInFlight = false;
      if (saveBtn) saveBtn.disabled = false;
      if (directPublishBtn) directPublishBtn.disabled = false;
      if (generateBtn) generateBtn.disabled = false;
      if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
      return;
    }

    if (mode === 'publish') {
      try {
        const quota = await getPublishQuotaPreflight(1);
        if (quota.executable === 0 || await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
          resultEl.textContent = quota.executable === 0 ? quota.message : '발행이 취소되었습니다.';
          quickPublishInFlight = false;
          if (saveBtn) saveBtn.disabled = false;
          if (directPublishBtn) directPublishBtn.disabled = false;
          if (generateBtn) generateBtn.disabled = false;
          if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
          return;
        }
      } catch (error) {
        resultEl.textContent = `사용량 확인 실패: ${error.message}`;
        quickPublishInFlight = false;
        if (saveBtn) saveBtn.disabled = false;
        if (directPublishBtn) directPublishBtn.disabled = false;
        if (generateBtn) generateBtn.disabled = false;
        if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
        return;
      }
    }

    try {
      scrollLogTargetIntoView(resultEl);
      const actionText = mode === 'append_and_generate'
        ? '미리보기 생성'
        : (mode === 'publish'
          ? (dummyPayload.postStatus === 'draft'
            ? '빠른 포스팅 임시 저장'
            : (dummyPayload.postStatus === 'schedule' ? '빠른 포스팅 예약 등록' : '빠른 포스팅 실행'))
          : '글감 저장');
      const data = await runWithLiveProgress({
        targetEl: resultEl,
        requestLabel: actionText,
        requestFn: () => postJson('/api/v1/blog/quick-publish', dummyPayload)
      });
      if (mode === 'publish' && isQuickPostingCelebrationStatus(dummyPayload.postStatus)) {
        showOrQueueQuickPostingCelebration();
      }
      if (mode === 'append_and_generate' && data?.previews) {
        quickGeneratedPreviewState.previewId = data.previewId || '';
        quickGeneratedPreviewState.rowIndex = Number.isFinite(Number(data.rowIndex)) ? Number(data.rowIndex) : null;
        quickGeneratedPreviewState.rowNumber = Number.isFinite(Number(data.rowNumber)) ? Number(data.rowNumber) : null;
        quickGeneratedPreviewState.primaryTarget = String(data.primaryTarget || '').trim();
        quickGeneratedPreviewState.targets = Array.isArray(data.targets) ? data.targets.slice() : [];
        quickGeneratedPreviewState.activeTarget = quickGeneratedPreviewState.primaryTarget || quickGeneratedPreviewState.targets[0] || '';
        quickGeneratedPreviewState.previews = typeof data.previews === 'object' && data.previews
          ? data.previews
          : {};
        renderQuickGeneratedPreview(data.previews?.[quickGeneratedPreviewState.activeTarget] || null);
      }
      await loadDashboard();
    } catch (e) {
      // runWithLiveProgress에서 상세 로그/오류를 이미 표기함
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (directPublishBtn) directPublishBtn.disabled = false;
      if (generateBtn) generateBtn.disabled = false;
      if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
      quickPublishInFlight = false;
    }
  };

  const runQuickGeneratedPublish = async () => {
    if (!resultEl) return;
    if (!guardUiConfigReady('빠른발행')) return;
    if (!quickGeneratedPreviewState.previewId) {
      showUiPopup('먼저 `미리보기 생성`을 실행해 주세요.');
      return;
    }
    if (quickPublishInFlight) {
      resultEl.textContent = '이미 요청이 진행 중입니다. 잠시만 기다려주세요.';
      return;
    }
    const payload = buildQuickPreviewPublishPayload();
    if (!Array.isArray(payload.targets) || payload.targets.length === 0) {
      showUiPopup('포스팅할 대상을 하나 이상 선택해 주세요.');
      return;
    }
    const missingTargets = payload.targets.filter((target) => !quickGeneratedPreviewState.previews?.[target]);
    if (missingTargets.length > 0) {
      showUiPopup(`${missingTargets.join(', ')} 대상의 생성 preview가 없습니다. 미리보기 생성을 다시 해주세요.`);
      return;
    }
    if (payload.postStatus === 'schedule' && !payload.scheduleDate) {
      showUiPopup('예약 발행을 위해서는 예약 일시를 입력해야 합니다.');
      return;
    }

    try {
      const quota = await getPublishQuotaPreflight(1);
      if (quota.executable === 0) {
        resultEl.textContent = quota.message;
        return;
      }
      if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) return;
    } catch (error) {
      resultEl.textContent = `사용량 확인 실패: ${error.message}`;
      return;
    }

    scrollLogTargetIntoView(resultEl);
    quickPublishInFlight = true;
    if (saveBtn) saveBtn.disabled = true;
    if (directPublishBtn) directPublishBtn.disabled = true;
    if (generateBtn) generateBtn.disabled = true;
    if (previewPublishBtn) previewPublishBtn.disabled = true;
    try {
      await runWithLiveProgress({
        targetEl: resultEl,
        requestLabel: payload.postStatus === 'draft'
          ? '빠른 포스팅 임시 저장'
          : (payload.postStatus === 'schedule' ? '빠른 포스팅 예약 등록' : '빠른 포스팅 실행'),
        requestFn: () => postJson('/api/v1/blog/quick-preview/publish', payload)
      });
      if (isQuickPostingCelebrationStatus(payload.postStatus)) showOrQueueQuickPostingCelebration();
      await loadDashboard();
    } catch (_error) {
      // runWithLiveProgress already renders logs/errors
    } finally {
      quickPublishInFlight = false;
      if (saveBtn) saveBtn.disabled = false;
      if (directPublishBtn) directPublishBtn.disabled = false;
      if (generateBtn) generateBtn.disabled = false;
      if (previewPublishBtn) previewPublishBtn.disabled = !quickGeneratedPreviewState.previewId;
    }
  };

  if (saveBtn) {
    saveBtn.addEventListener('click', () => runQuickPublish('append_only'));
  }
  if (directPublishBtn) {
    directPublishBtn.addEventListener('click', () => runQuickPublish('publish'));
  }
  if (generateBtn) {
    generateBtn.addEventListener('click', () => runQuickPublish('append_and_generate'));
  }
  if (previewPublishBtn) {
    previewPublishBtn.addEventListener('click', () => runQuickGeneratedPublish());
  }
  document.querySelectorAll('#quick-preview-tabs .preview-target-tab').forEach((button) => {
    button.addEventListener('click', () => {
      setQuickPreviewActiveTarget(button.dataset.target || '');
    });
  });
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const subjectEl = document.getElementById('quick-subject');
      const keywordsEl = document.getElementById('quick-keywords');
      const titleEl = document.getElementById('quick-title');
      const instructionEl = document.getElementById('quick-instruction');
      const referenceUrlEl = document.getElementById('quick-reference-url');
      if (subjectEl) subjectEl.value = '';
      if (keywordsEl) keywordsEl.value = '';
      if (titleEl) titleEl.value = '';
      if (instructionEl) instructionEl.value = '';
      if (referenceUrlEl) referenceUrlEl.value = '';
      quickTrendTopicContext = null;
      quickRecommendationTopicContext = null;
      syncQuickTopicOrigin();
      setSelectedSettingsRadioValue('quick-writing-strategy', currentBlogWritingStrategy, 'search');

      // [New] Clear Categories
      const naverCatEl = document.getElementById('quick-naver-category');
      const wpCatEl = document.getElementById('quick-wp-category');
      if (naverCatEl) {
        naverCatEl.value = '';
        localStorage.setItem('last_quick_naver_category', '');
      }
      if (wpCatEl) {
        wpCatEl.value = '';
        localStorage.setItem('last_quick_wp_category', '');
      }

      clearQuickGeneratedPreview();
      if (resultEl) resultEl.textContent = '입력 내용과 생성 preview를 지웠습니다.';
      subjectEl?.focus();
    });
  }

  function normalizeLocalMarkdownRelativePath(value) {
    return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  }

  function isLocalMarkdownFileName(fileName) {
    return /\.(md|markdown)$/i.test(String(fileName || '').trim());
  }

  function isLocalMarkdownImageEntry(entry = {}) {
    const fileName = String(entry?.name || '').trim();
    const contentType = String(entry?.type || '').trim().toLowerCase();
    if (contentType.startsWith('image/')) return true;
    return /\.(png|jpg|jpeg|webp|avif)$/i.test(fileName);
  }

  function getLocalMarkdownFolderLabelFromFiles(files = []) {
    const firstRelativePath = normalizeLocalMarkdownRelativePath(files?.[0]?.webkitRelativePath || files?.[0]?.name);
    if (!firstRelativePath) return '';
    const parts = firstRelativePath.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
  }

  async function buildLocalMarkdownSelectedFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return {
        folderLabel: '',
        selectedFiles: [],
        selectedFilesPayload: []
      };
    }

    const selectedFiles = files.map((file) => ({
      file,
      name: file.name || '',
      type: file.type || '',
      size: Number.isFinite(Number(file.size)) ? Number(file.size) : 0,
      relativePath: normalizeLocalMarkdownRelativePath(file.webkitRelativePath || file.name)
    }));
    const folderLabel = getLocalMarkdownFolderLabelFromFiles(files);
    const selectedFilesPayload = await Promise.all(selectedFiles.map(async (entry) => ({
      relativePath: entry.relativePath,
      name: entry.name,
      contentType: entry.type,
      size: entry.size,
      textContent: isLocalMarkdownFileName(entry.name) ? await entry.file.text() : ''
    })));

    return {
      folderLabel,
      selectedFiles,
      selectedFilesPayload
    };
  }

  function renderLocalMarkdownBodyHtml(data = null, getImageObjectUrl = () => '') {
    const items = Array.isArray(data?.contentItems) ? data.contentItems : [];
    const images = Array.isArray(data?.images) ? data.images : [];
    const imageMap = new Map(images.map((image) => [Number(image.index), image]));
    const fragments = [];
    let activeListType = '';

    const closeList = () => {
      if (!activeListType) return;
      fragments.push(activeListType === 'ordered' ? '</ol>' : '</ul>');
      activeListType = '';
    };

    const renderImageFigure = (item = {}) => {
      const image = imageMap.get(Number(item.index));
      const previewUrl = image?.exists ? getImageObjectUrl(image.imagePath) : '';
      const imageBody = previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image?.title || item.text || '')}" loading="lazy">`
        : `<div class="local-markdown-inline-image-missing">매칭되는 로컬 이미지가 없습니다.</div>`;
      return `
        <figure>
          ${imageBody}
          <figcaption>
            <div class="image-caption-title">${escapeHtml(image?.title || item.text || `IMAGE_${item.index}`)}</div>
            ${image?.prompt || item.prompt ? `<div class="image-caption-prompt">${escapeHtml(image?.prompt || item.prompt || '')}</div>` : ''}
          </figcaption>
        </figure>
      `;
    };

    items.forEach((item) => {
      const type = String(item?.type || 'paragraph');
      const text = renderInlinePreviewHtml(item?.text || '', item?.boldRanges);
      if (type !== 'list-item') closeList();

      if (type === 'header-h2') {
        fragments.push(`<h2>${text}</h2>`);
        return;
      }
      if (type === 'header-h3') {
        fragments.push(`<h3>${text}</h3>`);
        return;
      }
      if (type === 'quote') {
        fragments.push(`<blockquote><p>${text}</p></blockquote>`);
        return;
      }
      if (type === 'list-item') {
        const nextListType = item?.listType === 'ordered' ? 'ordered' : 'unordered';
        if (activeListType !== nextListType) {
          closeList();
          fragments.push(nextListType === 'ordered' ? '<ol>' : '<ul>');
          activeListType = nextListType;
        }
        fragments.push(`<li>${text}</li>`);
        return;
      }
      if (type === 'image') {
        fragments.push(renderImageFigure(item));
        return;
      }
      if (type === 'separator') {
        fragments.push('<div class="local-markdown-preview-separator" role="separator" aria-label="구분선"></div>');
        return;
      }
      if (type === 'newline') {
        fragments.push('<div style="height:8px"></div>');
        return;
      }
      fragments.push(`<p>${text}</p>`);
    });

    closeList();
    return fragments.join('') || '<div class="local-markdown-empty">본문 preview를 표시할 내용이 없습니다.</div>';
  }

  function createLocalMarkdownController(config) {
    let publishInFlight = false;
    let previewTimer = null;
    let previewRequestId = 0;
    const ids = config.ids || {};
    const getState = config.getState;
    const setState = config.setState;
    const sourceType = config.sourceType === 'pasted' ? 'pasted' : 'folder';

    const getEl = (key) => document.getElementById(ids[key]);
    const getPathEl = () => getEl('pathInput');
    const getFolderInputEl = () => getEl('folderInput');
    const getMarkdownInputEl = () => getEl('markdownInput');
    const hasSource = () => {
      if (sourceType === 'pasted') return Boolean((getMarkdownInputEl()?.value || '').trim());
      const state = getState();
      return Array.isArray(state.selectedFilesPayload) && state.selectedFilesPayload.length > 0;
    };

    const buildPreviewPayload = () => {
      const state = getState();
      const targets = [];
      if (getEl('targetNaver')?.checked) targets.push('naver');
      if (getEl('targetWordpress')?.checked) targets.push('wordpress');

      const payload = {
        folderName: state.folderLabel || (getPathEl()?.value || '').trim(),
        targets,
        postStatus: (getEl('postStatus')?.value || 'publish').trim(),
        scheduleDate: (getEl('scheduleDate')?.value || '').trim(),
        imageGeneration: Boolean(getEl('imageGeneration')?.checked)
      };
      if (sourceType === 'pasted') {
        const markdownText = getMarkdownInputEl()?.value || '';
        payload.markdownText = markdownText;
        payload.selectedFiles = [{
          relativePath: 'pasted-manuscript/contents.md',
          name: 'contents.md',
          contentType: 'text/markdown',
          size: new Blob([markdownText]).size,
          textContent: markdownText
        }];
      } else {
        payload.selectedFiles = Array.isArray(state.selectedFilesPayload) ? state.selectedFilesPayload : [];
      }
      return payload;
    };

    const buildPublishPayload = async () => {
      const state = getState();
      const selectedFiles = Array.isArray(state.selectedFiles) ? state.selectedFiles : [];
      const serializedFiles = [];

      for (const entry of selectedFiles) {
        if (!entry?.file) continue;
        if (!isLocalMarkdownFileName(entry.name) && !isLocalMarkdownImageEntry(entry)) continue;

        const serialized = {
          relativePath: entry.relativePath,
          name: entry.name,
          contentType: entry.type,
          size: entry.size
        };

        if (isLocalMarkdownFileName(entry.name)) {
          serialized.textContent = await entry.file.text();
        } else if (isLocalMarkdownImageEntry(entry)) {
          serialized.base64Data = await readFileAsDataUrl(entry.file);
        }

        serializedFiles.push(serialized);
      }

      const payload = {
        folderName: state.folderLabel || '',
        targets: [
          getEl('targetNaver')?.checked ? 'naver' : '',
          getEl('targetWordpress')?.checked ? 'wordpress' : ''
        ].filter(Boolean),
        naverCategory: (getEl('naverCategory')?.value || '').trim(),
        wordpressCategory: (getEl('wpCategory')?.value || '').trim(),
        postStatus: (getEl('postStatus')?.value || 'publish').trim(),
        scheduleDate: (getEl('scheduleDate')?.value || '').trim(),
        headless: Boolean(getEl('headless')?.checked),
        imageGeneration: Boolean(getEl('imageGeneration')?.checked)
      };
      if (sourceType === 'pasted') {
        const markdownText = getMarkdownInputEl()?.value || '';
        payload.markdownText = markdownText;
        payload.selectedFiles = [{
          relativePath: 'pasted-manuscript/contents.md',
          name: 'contents.md',
          contentType: 'text/markdown',
          size: new Blob([markdownText]).size,
          textContent: markdownText
        }];
      } else {
        payload.selectedFiles = serializedFiles;
      }
      return payload;
    };

    const revokeObjectUrls = () => {
      const state = getState();
      const urlMap = state.imageObjectUrls || {};
      Object.keys(urlMap).forEach((key) => {
        try {
          URL.revokeObjectURL(urlMap[key]);
        } catch (_error) { }
      });
      setState({
        ...state,
        imageObjectUrls: {}
      });
    };

    const getImageObjectUrl = (relativePath) => {
      const normalizedPath = normalizeLocalMarkdownRelativePath(relativePath);
      if (!normalizedPath) return '';
      const state = getState();
      if (state.imageObjectUrls?.[normalizedPath]) {
        return state.imageObjectUrls[normalizedPath];
      }

      const fileEntry = (Array.isArray(state.selectedFiles) ? state.selectedFiles : [])
        .find((entry) => normalizeLocalMarkdownRelativePath(entry.relativePath) === normalizedPath);
      if (!fileEntry || !isLocalMarkdownImageEntry(fileEntry)) return '';

      const objectUrl = URL.createObjectURL(fileEntry.file);
      setState({
        ...state,
        imageObjectUrls: {
          ...(state.imageObjectUrls || {}),
          [normalizedPath]: objectUrl
        }
      });
      return objectUrl;
    };

    const toggleScheduleDate = () => {
      const input = getEl('scheduleDate');
      const status = getEl('postStatus')?.value || 'publish';
      if (!input) return;
      input.disabled = status !== 'schedule';
      if (status === 'schedule' && !input.value) {
        const now = new Date(Date.now() + 10 * 60 * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        input.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
        if (config.scheduleStorageKey) {
          localStorage.setItem(config.scheduleStorageKey, input.value);
        }
      }
    };

    const renderValidation = (validation = null) => {
      const el = getEl('validation');
      if (!el) return;

      el.classList.remove('has-error', 'has-warning', 'is-ok');
      if (!validation) {
        el.textContent = config.emptyValidationText || '아직 원고 폴더를 선택하지 않았습니다.';
        return;
      }

      const lines = [];
      if (Array.isArray(validation.errors) && validation.errors.length > 0) {
        el.classList.add('has-error');
        lines.push('[오류]');
        validation.errors.forEach((item) => lines.push(`- ${item}`));
      }
      if (Array.isArray(validation.warnings) && validation.warnings.length > 0) {
        if (!el.classList.contains('has-error')) el.classList.add('has-warning');
        if (lines.length > 0) lines.push('');
        lines.push('[경고]');
        validation.warnings.forEach((item) => lines.push(`- ${item}`));
      }
      if (lines.length === 0) {
        el.classList.add('is-ok');
        lines.push('검증 통과: 현재 입력값 기준으로 preview/validation 문제가 없습니다.');
      }
      el.textContent = lines.join('\n');
    };

    const renderPreview = (data = null) => {
      const state = getState();
      const emptyEl = getEl('previewEmpty');
      const panelEl = getEl('previewPanel');
      const titleEl = getEl('previewTitle');
      const metaEl = getEl('previewMeta');
      const bodyEl = getEl('bodyPreview');
      const imageListEl = getEl('imageList');

      if (!data) {
        setState({
          ...state,
          data: null
        });
        renderValidation(null);
        if (emptyEl) emptyEl.hidden = false;
        if (panelEl) panelEl.hidden = true;
        if (panelEl) panelEl.classList.remove('is-expanded', 'is-compact');
        if (titleEl) titleEl.textContent = '제목 없음';
        if (metaEl) metaEl.textContent = '-';
        if (bodyEl) bodyEl.innerHTML = '';
        if (imageListEl) imageListEl.innerHTML = '';
        return;
      }

      setState({
        ...state,
        data
      });
      renderValidation(data.validation || null);
      if (emptyEl) emptyEl.hidden = true;
      if (panelEl) panelEl.hidden = false;
      if (titleEl) titleEl.textContent = data.title || '제목 없음';
      if (metaEl) {
        const source = data.source || {};
        const stats = data.stats || {};
        metaEl.textContent = [
          source.fileName || '',
          source.folderName || source.directoryPath || '',
          `${stats.contentCount || 0}개 블록`,
          `이미지 ${stats.imageResolvedCount || 0}/${stats.imageBlockCount || 0}개`
        ].filter(Boolean).join(' | ');
      }
      if (bodyEl) bodyEl.innerHTML = renderLocalMarkdownBodyHtml(data, getImageObjectUrl);
      if (imageListEl) {
        const images = Array.isArray(data.images) ? data.images : [];
        imageListEl.innerHTML = images.length === 0
          ? '<div class="local-markdown-empty">이미지 블록이 없습니다.</div>'
          : images.map((image) => {
            const statusClass = image.exists ? 'ok' : 'missing';
            const statusText = image.exists ? '매칭됨' : '누락';
            const previewUrl = image.exists ? getImageObjectUrl(image.imagePath) : '';
            const preview = image.exists
              ? `<div class="local-markdown-image-card-preview"><img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(image.title || '')}" loading="lazy"></div>`
              : `<div class="local-markdown-image-card-preview"><div class="local-markdown-image-card-placeholder">${escapeHtml(config.missingImageText || '매칭되는 로컬 이미지가 없습니다.')}</div></div>`;
            return `
              <article class="local-markdown-image-card">
                <div class="local-markdown-image-card-header">
                  <div>
                    <div class="local-markdown-image-card-title">IMAGE_${escapeHtml(String(image.index))} ${escapeHtml(image.title || '')}</div>
                    <div class="local-markdown-image-card-meta">${escapeHtml(image.fileName || '파일 미매칭')}</div>
                  </div>
                  <span class="local-markdown-image-card-status ${statusClass}">${statusText}</span>
                </div>
                ${preview}
                <p class="local-markdown-image-card-prompt">${escapeHtml(image.prompt || '')}</p>
              </article>
            `;
          }).join('');
      }
      setLocalMarkdownPreviewDensity(panelEl, bodyEl, imageListEl, data.stats || {});
    };

    const renderPreviewError = (message) => {
      const state = getState();
      const emptyEl = getEl('previewEmpty');
      const panelEl = getEl('previewPanel');
      setState({
        ...state,
        data: null
      });
      renderValidation({
        errors: [String(message || '원고 미리보기에 실패했습니다.')],
        warnings: []
      });
      if (emptyEl) emptyEl.hidden = false;
      if (panelEl) panelEl.hidden = true;
    };

    const loadPreview = async () => {
      const requestId = ++previewRequestId;
      const payload = buildPreviewPayload();
      const sourceReady = sourceType === 'pasted'
        ? Boolean(String(payload.markdownText || '').trim())
        : (Array.isArray(payload.selectedFiles) && payload.selectedFiles.length > 0);
      if (!sourceReady) {
        renderPreview(null);
        return;
      }

      try {
        const data = await postJson('/api/v1/blog/local-markdown/preview', payload);
        if (requestId !== previewRequestId) return;
        renderPreview(data);
      } catch (e) {
        if (requestId !== previewRequestId) return;
        renderPreviewError(e.message);
        throw e;
      }
    };

    const clearSelection = () => {
      previewRequestId++;
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
      revokeObjectUrls();
      if (getPathEl()) getPathEl().value = '';
      if (getFolderInputEl()) getFolderInputEl().value = '';
      if (getMarkdownInputEl()) getMarkdownInputEl().value = '';
      if (config.draftStorageKey) localStorage.removeItem(config.draftStorageKey);
      setState(createLocalMarkdownPreviewState());
      renderPreview(null);
    };

    const runPublishAction = async () => {
      const resultEl = getEl('result');
      if (!guardUiConfigReady(config.featureLabel || '원고 포스팅')) return;
      if (publishInFlight) return;
      const state = getState();
      if (!state.data) {
        showUiPopup(config.emptySourceMessage || '먼저 원고 폴더를 선택해 주세요.');
        return;
      }
      if (!state.data.validation?.ok) {
        showUiPopup('현재 validation 오류가 있어 실행할 수 없습니다. 원고와 옵션을 먼저 확인해 주세요.');
        return;
      }

      const publishPayload = await buildPublishPayload();
      const preCheck = checkPublishPrerequisites(publishPayload.targets);
      if (!preCheck.ok) {
        if (resultEl) resultEl.textContent = preCheck.message;
        return;
      }

      const actionLabel = publishPayload.postStatus === 'draft'
        ? `${config.actionPrefix || '원고'} 임시 저장`
        : (publishPayload.postStatus === 'schedule' ? `${config.actionPrefix || '원고'} 예약 포스팅` : `${config.actionPrefix || '원고'} 포스팅`);
      let quota;
      try {
        quota = await getPublishQuotaPreflight(1);
      } catch (error) {
        if (resultEl) resultEl.textContent = `사용량 확인 실패: ${error.message}`;
        return;
      }
      if (quota.executable === 0) {
        if (resultEl) resultEl.textContent = quota.message;
        return;
      }
      const confirmMessage = `${config.confirmMessage || `${actionLabel}을 진행하시겠습니까?`}\n\n${quota.message}`;
      const confirmed = await showUiConfirm(confirmMessage, {
        title: '실행 확인',
        confirmText: '진행',
        cancelText: '취소'
      });
      if (confirmed === false) {
        if (resultEl) resultEl.textContent = `${config.actionPrefix || '원고'} 포스팅 실행이 취소되었습니다.`;
        return;
      }

      scrollLogTargetIntoView(resultEl);
      publishInFlight = true;
      const publishButtons = (ids.publishButtons || []).map((id) => document.getElementById(id)).filter(Boolean);
      publishButtons.forEach((button) => { button.disabled = true; });
      try {
        await runWithLiveProgress({
          targetEl: resultEl,
          requestLabel: actionLabel,
          requestFn: () => postJson('/api/v1/blog/local-markdown/publish', publishPayload)
        });
        if (isQuickPostingCelebrationStatus(publishPayload.postStatus)) showOrQueueQuickPostingCelebration();
      } catch (_error) {
        // runWithLiveProgress already renders logs/errors
      } finally {
        publishInFlight = false;
        publishButtons.forEach((button) => { button.disabled = false; });
      }
    };

    const selectBtn = getEl('selectBtn');
    const folderInput = getFolderInputEl();
    const clearBtn = getEl('clearBtn');
    const postStatusEl = getEl('postStatus');
    const markdownInputEl = getMarkdownInputEl();

    selectBtn?.addEventListener('click', () => {
      folderInput?.click();
    });

    folderInput?.addEventListener('change', async (event) => {
      try {
        const nextSelection = await buildLocalMarkdownSelectedFiles(event.target?.files);
        if (!Array.isArray(nextSelection.selectedFiles) || nextSelection.selectedFiles.length === 0) return;
        revokeObjectUrls();
        setState({
          ...getState(),
          folderLabel: nextSelection.folderLabel,
          selectedFiles: nextSelection.selectedFiles,
          selectedFilesPayload: nextSelection.selectedFilesPayload,
          data: null,
          imageObjectUrls: {}
        });
        if (getPathEl()) getPathEl().value = nextSelection.folderLabel || '';
        await loadPreview();
      } catch (e) {
        renderPreviewError(e.message);
        showUiPopup(`${config.selectErrorLabel || '원고 폴더 선택 실패'}: ${e.message}`);
      } finally {
        event.target.value = '';
      }
    });

    if (markdownInputEl) {
      const savedDraft = config.draftStorageKey ? localStorage.getItem(config.draftStorageKey) : '';
      if (savedDraft) {
        markdownInputEl.value = savedDraft;
      }
      markdownInputEl.addEventListener('input', () => {
        if (config.draftStorageKey) {
          localStorage.setItem(config.draftStorageKey, markdownInputEl.value);
        }
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
          loadPreview().catch((e) => {
            showUiPopup(`${config.previewErrorLabel || '원고 미리보기 실패'}: ${e.message}`);
          });
        }, 350);
      });
      if (markdownInputEl.value.trim()) {
        setTimeout(() => {
          loadPreview().catch(() => {});
        }, 0);
      }
    }

    clearBtn?.addEventListener('click', () => {
      clearSelection();
    });

    (ids.publishButtons || []).forEach((id) => {
      const button = document.getElementById(id);
      button?.addEventListener('click', () => {
        runPublishAction().catch((e) => {
          showUiPopup(`${config.publishErrorLabel || '원고 포스팅 실행 실패'}: ${e.message}`);
        });
      });
    });

    postStatusEl?.addEventListener('change', () => {
      toggleScheduleDate();
      if (hasSource()) {
        loadPreview().catch((e) => {
          showUiPopup(`${config.previewErrorLabel || '원고 미리보기 실패'}: ${e.message}`);
        });
      }
    });

    [
      ids.targetNaver,
      ids.targetWordpress,
      ids.imageGeneration,
      ids.scheduleDate
    ].filter(Boolean).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (hasSource()) {
          loadPreview().catch((e) => {
            showUiPopup(`${config.previewErrorLabel || '원고 미리보기 실패'}: ${e.message}`);
          });
        }
      });
    });

    return {
      toggleScheduleDate,
      renderPreview,
      loadPreview,
      clearSelection
    };
  }

  const quickManuscriptController = createLocalMarkdownController({
    featureLabel: '빠른 포스팅 원고 모드',
    actionPrefix: '원고',
    confirmMessage: '포스팅을 실행하겠습니까?',
    scheduleStorageKey: 'quick_manuscript_schedule_date',
    getState: () => quickManuscriptPreviewState,
    setState: (nextState) => {
      quickManuscriptPreviewState = nextState;
    },
    ids: {
      selectBtn: 'quick-manuscript-select-btn',
      clearBtn: 'quick-manuscript-clear-btn',
      folderInput: 'quick-manuscript-folder-input',
      pathInput: 'quick-manuscript-path',
      naverCategory: 'quick-manuscript-naver-category',
      wpCategory: 'quick-manuscript-wp-category',
      postStatus: 'quick-manuscript-post-status',
      scheduleDate: 'quick-manuscript-schedule-date',
      targetNaver: 'quick-manuscript-target-naver',
      targetWordpress: 'quick-manuscript-target-wordpress',
      headless: 'quick-manuscript-headless',
      imageGeneration: 'quick-manuscript-image-generation',
      validation: 'quick-manuscript-validation',
      previewEmpty: 'quick-manuscript-preview-empty',
      previewPanel: 'quick-manuscript-preview-panel',
      previewTitle: 'quick-manuscript-preview-title',
      previewMeta: 'quick-manuscript-preview-meta',
      bodyPreview: 'quick-manuscript-body-preview',
      imageList: 'quick-manuscript-image-list',
      result: 'quick-manuscript-result',
      publishButtons: ['quick-manuscript-publish-btn', 'quick-manuscript-publish-inline-btn']
    }
  });

  window.toggleQuickManuscriptScheduleDate = quickManuscriptController.toggleScheduleDate;
  window.renderQuickManuscriptPreview = quickManuscriptController.renderPreview;

  const quickPastedController = createLocalMarkdownController({
    sourceType: 'pasted',
    featureLabel: '빠른 포스팅 원고 붙여넣기',
    actionPrefix: '붙여넣은 원고',
    confirmMessage: '붙여넣은 원고로 포스팅을 실행하겠습니까?',
    emptySourceMessage: '먼저 Markdown 원고를 붙여넣어 주세요.',
    emptyValidationText: 'Markdown 원고를 붙여넣어 주세요.',
    missingImageText: '붙여넣기 원고에는 매칭된 로컬 이미지가 없습니다.',
    draftStorageKey: 'quick_pasted_markdown_draft',
    scheduleStorageKey: 'quick_pasted_schedule_date',
    getState: () => quickPastedPreviewState,
    setState: (nextState) => {
      quickPastedPreviewState = nextState;
    },
    ids: {
      clearBtn: 'quick-pasted-clear-btn',
      markdownInput: 'quick-pasted-markdown',
      naverCategory: 'quick-pasted-naver-category',
      wpCategory: 'quick-pasted-wp-category',
      postStatus: 'quick-pasted-post-status',
      scheduleDate: 'quick-pasted-schedule-date',
      targetNaver: 'quick-pasted-target-naver',
      targetWordpress: 'quick-pasted-target-wordpress',
      headless: 'quick-pasted-headless',
      imageGeneration: 'quick-pasted-image-generation',
      validation: 'quick-pasted-validation',
      previewEmpty: 'quick-pasted-preview-empty',
      previewPanel: 'quick-pasted-preview-panel',
      previewTitle: 'quick-pasted-preview-title',
      previewMeta: 'quick-pasted-preview-meta',
      bodyPreview: 'quick-pasted-body-preview',
      imageList: 'quick-pasted-image-list',
      result: 'quick-pasted-result',
      publishButtons: ['quick-pasted-publish-btn', 'quick-pasted-publish-inline-btn']
    }
  });

  window.toggleQuickPastedScheduleDate = quickPastedController.toggleScheduleDate;

  const shoppingQuickSaveBtn = document.getElementById('shopping-quick-save-btn');
  const shoppingQuickPublishBtn = document.getElementById('shopping-quick-publish-btn');
  const shoppingQuickResultEl = document.getElementById('shopping-quick-result');
  const shoppingQuickUrlInput = document.getElementById('shopping-quick-url');
  const shoppingQuickProductInput = document.getElementById('shopping-quick-product');
  const buildShoppingQuickPayload = (mode) => {
    const targets = [];
    if (document.getElementById('shopping-quick-target-naver')?.checked) targets.push('naver');
    if (document.getElementById('shopping-quick-target-wordpress')?.checked) targets.push('wordpress');

    const naverCat = (document.getElementById('shopping-quick-naver-category')?.value || '').trim();
    const wpCat = (document.getElementById('shopping-quick-wp-category')?.value || '').trim();

    const payload = {
      shortUrl: (shoppingQuickUrlInput?.value || '').trim(),
      product: (shoppingQuickProductInput?.value || '').trim(),
      instruction: (document.getElementById('shopping-quick-instruction')?.value || '').trim(),
      headless: Boolean(document.getElementById('shopping-quick-headless')?.checked),
      publishMode: mode,
      targets,
      naverCategory: naverCat,
      wordpressCategory: wpCat,
      postStatus: (document.getElementById('shopping-quick-wp-post-status')?.value || 'publish').trim(),
      scheduleDate: (document.getElementById('shopping-quick-wp-schedule-date')?.value || '').trim()
    };

    // category 필드는 하위 호환성을 위해 유지
    payload.category = wpCat;

    return payload;
  };
  const runShoppingQuickPublish = async (mode) => {
    if (!shoppingQuickResultEl) return;
    if (!guardUiConfigReady('쇼핑커넥트 빠른발행')) return;
    if (shoppingQuickPublishInFlight) {
      shoppingQuickResultEl.textContent = '이미 요청이 진행 중입니다. 잠시만 기다려주세요.';
      return;
    }
    shoppingQuickPublishInFlight = true;
    if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = true;
    if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = true;

    const dummyPayload = buildShoppingQuickPayload(mode);
    if (mode === 'append_and_publish') dummyPayload.operationId = crypto.randomUUID();
    const preCheck = checkPublishPrerequisites(dummyPayload.targets);
    if (!preCheck.ok) {
      shoppingQuickResultEl.textContent = preCheck.message;
      shoppingQuickPublishInFlight = false;
      if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
      if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
      return;
    }

    if (dummyPayload.postStatus === 'schedule' && !dummyPayload.scheduleDate) {
      shoppingQuickResultEl.textContent = '⚠️ 예약 발행을 위해서는 예약 일시를 선택해야 합니다.';
      showUiPopup('예약 발행을 위해서는 예약 일시를 입력해야 합니다.');
      shoppingQuickPublishInFlight = false;
      if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
      if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
      return;
    }

    if (mode === 'append_and_publish') {
      try {
        const quota = await getPublishQuotaPreflight(1);
        if (quota.executable === 0 || await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
          shoppingQuickResultEl.textContent = quota.executable === 0 ? quota.message : '발행이 취소되었습니다.';
          shoppingQuickPublishInFlight = false;
          if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
          if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
          return;
        }
      } catch (error) {
        shoppingQuickResultEl.textContent = `사용량 확인 실패: ${error.message}`;
        shoppingQuickPublishInFlight = false;
        if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
        if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
        return;
      }
    }

    try {
      const actionText = mode === 'append_and_publish'
        ? (dummyPayload.postStatus === 'draft'
          ? '쇼핑 글감 저장 & 임시 저장'
          : (dummyPayload.postStatus === 'schedule' ? '쇼핑 글감 저장 & 예약 등록' : '쇼핑 글감 저장 & 즉시 발행'))
        : '쇼핑 글감 저장';
      await runWithLiveProgress({
        targetEl: shoppingQuickResultEl,
        requestLabel: actionText,
        requestFn: () => postJson('/api/v1/shopping/quick-publish', dummyPayload)
      });
      await Promise.all([loadDashboard(), loadBlogShopping({ silent: true })]);
    } catch (e) {
      // runWithLiveProgress에서 상세 로그/오류를 이미 표기함
    } finally {
      if (shoppingQuickSaveBtn) shoppingQuickSaveBtn.disabled = false;
      if (shoppingQuickPublishBtn) shoppingQuickPublishBtn.disabled = false;
      shoppingQuickPublishInFlight = false;
    }
  };

  if (shoppingQuickSaveBtn) {
    shoppingQuickSaveBtn.addEventListener('click', () => runShoppingQuickPublish('append_only'));
  }
  if (shoppingQuickPublishBtn) {
    shoppingQuickPublishBtn.addEventListener('click', () => runShoppingQuickPublish('append_and_publish'));
  }

  const blogTabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const shoppingTabButtons = Array.from(document.querySelectorAll('.shopping-tab-btn'));
  const blogTrendsDateInput = document.getElementById('blog-trends-date');
  const naverCommentDraftSaveBtn = document.getElementById('naver-comment-draft-save-btn');
  const naverCommentDraftRunBtn = document.getElementById('naver-comment-draft-run-btn');
  const naverCommentDraftListEl = document.getElementById('naver-comment-draft-list');
  const blogTrendsQFilter = document.getElementById('blog-trends-q-filter');
  const blogTrendsQClearBtn = document.getElementById('blog-trends-q-clear-btn');
  const blogTrendsCollectBtn = document.getElementById('blog-trends-collect-btn');
  const blogTrendsRefreshBtn = document.getElementById('blog-trends-refresh-btn');
  const blogTrendsSearchBtn = document.getElementById('blog-trends-search-btn');
  const blogTrendsToTopicsBtn = document.getElementById('blog-trends-to-topics-btn');
  const blogTrendsPrevBtn = document.getElementById('blog-trends-page-prev');
  const blogTrendsNextBtn = document.getElementById('blog-trends-page-next');
  const blogRefreshBtn = document.getElementById('blog-refresh-btn');
  const blogBatchBtn = document.getElementById('blog-batch-btn');
  const blogTopicsPrevBtn = document.getElementById('blog-topics-page-prev');
  const blogTopicsNextBtn = document.getElementById('blog-topics-page-next');
  const blogTopicsQClearBtn = document.getElementById('blog-topics-q-clear-btn');
  const shoppingRefreshBtn = document.getElementById('shopping-refresh-btn');
  const shoppingQClearBtn = document.getElementById('shopping-q-clear-btn');
  const shoppingBatchBtn = document.getElementById('shopping-batch-btn');
  const shoppingStatusFilter = document.getElementById('shopping-status-filter');
  const shoppingQFilter = document.getElementById('shopping-q-filter');
  const shoppingPrevBtn = document.getElementById('shopping-page-prev');
  const shoppingNextBtn = document.getElementById('shopping-page-next');
  const blogStatusFilter = document.getElementById('blog-status-filter');
  const blogQFilter = document.getElementById('blog-q-filter');
  const blogTrendsTableBody = document.getElementById('blog-trends-table-body');
  const trendPostingPeriod = document.getElementById('trend-posting-period');
  const trendPostingCategories = document.getElementById('trend-posting-categories');
  const trendPostingQueryBtn = document.getElementById('trend-posting-query-btn');
  const trendPostingResultFilters = document.getElementById('trend-posting-result-filters');
  const trendPostingFilterReset = document.getElementById('trend-posting-filter-reset');
  const trendPostingExcludeRecent = document.getElementById('trend-posting-filter-exclude-recent');
  const trendPostingTableBody = document.getElementById('trend-posting-table-body');
  const blogTopicsTableBody = document.getElementById('blog-table-body');
  const shoppingTableBody = document.getElementById('shopping-table-body');
  const sortableHeaders = Array.from(document.querySelectorAll('.data-table th.sortable'));

  blogTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = String(btn.dataset.blogTab || '');
      activateBlogTab(tabName, { forceReload: true });
    });
  });
  trendPostingPeriod?.addEventListener('change', syncTrendPostingPeriodUi);
  trendPostingCategories?.addEventListener('click', (event) => {
    const button = event.target?.closest('[data-trend-posting-category]');
    if (!button || button.disabled) return;
    const nextActive = !button.classList.contains('active');
    button.classList.toggle('active', nextActive);
    button.setAttribute('aria-pressed', nextActive ? 'true' : 'false');
    syncTrendPostingCategoryLimit();
  });
  trendPostingQueryBtn?.addEventListener('click', queryTrendPostingKeywords);
  trendPostingResultFilters?.addEventListener('input', (event) => {
    if (event.target === trendPostingExcludeRecent) return;
    renderTrendPostingResults();
  });
  trendPostingExcludeRecent?.addEventListener('change', () => {
    if (trendPostingExcludeRecent.checked && !trendPostingState.recentTopicsLoaded) {
      void loadRecentTrendPostingTopics();
      return;
    }
    renderTrendPostingResults();
  });
  trendPostingFilterReset?.addEventListener('click', () => {
    const keywordEl = document.getElementById('trend-posting-filter-keyword');
    const viewEl = document.getElementById('trend-posting-filter-view');
    if (keywordEl) keywordEl.value = '';
    if (viewEl) viewEl.value = 'all';
    if (trendPostingExcludeRecent) trendPostingExcludeRecent.checked = false;
    renderTrendPostingResults();
  });
  trendPostingTableBody?.addEventListener('click', (event) => {
    const button = event.target?.closest('[data-trend-posting-action]');
    if (!button) return;
    const item = trendPostingState.itemsById.get(String(button.dataset.itemId || ''));
    if (!item) return;
    if (button.dataset.trendPostingAction === 'write') {
      void openTrendTopicInQuickPosting(item);
    } else if (button.dataset.trendPostingAction === 'save') {
      void saveTrendPostingTopic(item, button);
    }
  });
  shoppingTabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = String(btn.dataset.shoppingTab || '');
      activateShoppingTab(tabName, { forceReload: true });
    });
  });

  if (blogTrendsCollectBtn) {
    blogTrendsCollectBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runBlogTrendsCollect();
    });
  }
  if (blogTrendsRefreshBtn) blogTrendsRefreshBtn.addEventListener('click', () => loadBlogTrends());
  if (blogTrendsSearchBtn) {
    blogTrendsSearchBtn.addEventListener('click', () => {
      setPageInfo('trends', { offset: 0 });
      loadBlogTrends();
    });
  }
  if (blogTrendsQClearBtn) {
    blogTrendsQClearBtn.addEventListener('click', () => {
      if (blogTrendsQFilter) blogTrendsQFilter.value = '';
      setPageInfo('trends', { offset: 0 });
      loadBlogTrends();
      blogTrendsQFilter?.focus();
    });
  }
  if (blogTrendsToTopicsBtn) blogTrendsToTopicsBtn.addEventListener('click', runTrendsToTopics);
  if (blogTrendsQFilter) {
    blogTrendsQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('trends', { offset: 0 });
        loadBlogTrends();
      }
    });
  }
  // 날짜 입력창 Enter로 수집을 바로 실행하지 않는다.
  // (중복 호출/오동작 방지)
  if (blogTrendsPrevBtn) {
    blogTrendsPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('trends');
      setPageInfo('trends', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogTrends();
    });
  }
  if (blogTrendsNextBtn) {
    blogTrendsNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('trends');
      setPageInfo('trends', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogTrends();
    });
  }

  if (blogRefreshBtn) blogRefreshBtn.addEventListener('click', loadBlogTopics);
  if (naverCommentDraftSaveBtn) naverCommentDraftSaveBtn.addEventListener('click', saveNaverCommentDraftSettings);
  if (naverCommentDraftRunBtn) naverCommentDraftRunBtn.addEventListener('click', runNaverCommentDraft);
  if (naverCommentDraftListEl) {
    naverCommentDraftListEl.addEventListener('click', async (event) => {
      const copyBtn = event.target.closest('[data-comment-draft-copy]');
      if (copyBtn) {
        const raw = String(copyBtn.getAttribute('data-comment-draft-copy') || '');
        const [cardIndexRaw, draftIndexRaw] = raw.split(':');
        const cardIndex = Number(cardIndexRaw);
        const draftIndex = Number(draftIndexRaw);
        const cardEl = naverCommentDraftListEl.querySelector(`[data-comment-draft-card="${cardIndex}"]`);
        const textEls = Array.from(cardEl?.querySelectorAll('.comment-draft-item-text') || []);
        const text = textEls[draftIndex]?.textContent || '';
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          const original = copyBtn.textContent;
          copyBtn.textContent = '복사됨';
          setTimeout(() => {
            copyBtn.textContent = original || '복사';
          }, 1200);
        } catch (e) {
          showUiPopup(`복사 실패: ${e.message}`);
        }
        return;
      }

      const redraftBtn = event.target.closest('[data-comment-draft-redraft]');
      if (redraftBtn) {
        const itemIndex = Number(redraftBtn.getAttribute('data-comment-draft-redraft'));
        if (Number.isInteger(itemIndex)) {
          await redraftNaverCommentDraft(itemIndex);
        }
      }
    });
  }
  if (blogTopicsQClearBtn) {
    blogTopicsQClearBtn.addEventListener('click', () => {
      if (blogQFilter) blogQFilter.value = '';
      setPageInfo('topics', { offset: 0 });
      loadBlogTopics();
      blogQFilter?.focus();
    });
  }
  if (blogBatchBtn) blogBatchBtn.addEventListener('click', runBlogBatchAction);
  const blogDeleteBatchBtn = document.getElementById('blog-delete-batch-btn');
  if (blogDeleteBatchBtn) {
    blogDeleteBatchBtn.addEventListener('click', async () => {
      const rowIndices = Array.from(blogSelectedRowIndices);
      if (rowIndices.length === 0) {
        showUiPopup('삭제할 글감을 선택해 주세요.');
        return;
      }
      if (!confirm(`선택한 ${rowIndices.length}개의 글감을 삭제하시겠습니까?\n구글 시트에서도 행이 영구 삭제됩니다.`)) {
        return;
      }
      const resultBox = document.getElementById('blog-action-result');
      if (resultBox) resultBox.textContent = '글감 삭제 중...';
      try {
        await postJson('/api/v1/blog/topics/delete', { rowIndices });
        blogSelectedRowIndices.clear();
        updateBlogSelectionUi();
        await loadBlogTopics();
        if (resultBox) resultBox.textContent = `성공: ${rowIndices.length}개의 글감을 삭제했습니다.`;
      } catch (err) {
        if (resultBox) resultBox.textContent = `삭제 실패: ${err.message}`;
        showUiPopup(`삭제 실패: ${err.message}`);
      }
    });
  }
  if (shoppingRefreshBtn) shoppingRefreshBtn.addEventListener('click', loadBlogShopping);
  if (shoppingQClearBtn) {
    shoppingQClearBtn.addEventListener('click', () => {
      if (shoppingQFilter) shoppingQFilter.value = '';
      setPageInfo('shopping', { offset: 0 });
      loadBlogShopping();
      shoppingQFilter?.focus();
    });
  }
  if (shoppingBatchBtn) shoppingBatchBtn.addEventListener('click', runShoppingBatchAction);
  const shoppingDeleteBatchBtn = document.getElementById('shopping-delete-batch-btn');
  if (shoppingDeleteBatchBtn) {
    shoppingDeleteBatchBtn.addEventListener('click', async () => {
      const rowIndices = Array.from(blogShoppingSelectedRowIndices);
      if (rowIndices.length === 0) {
        showUiPopup('삭제할 상품을 선택해 주세요.');
        return;
      }
      if (!confirm(`선택한 ${rowIndices.length}개의 상품을 삭제하시겠습니까?\n구글 시트에서도 행이 영구 삭제됩니다.`)) {
        return;
      }
      const shoppingResultBox = document.getElementById('shopping-action-result');
      if (shoppingResultBox) shoppingResultBox.textContent = '상품 삭제 중...';
      try {
        await postJson('/api/v1/shopping/topics/delete', { rowIndices });
        blogShoppingSelectedRowIndices.clear();
        updateShoppingSelectionUi();
        await loadBlogShopping();
        if (shoppingResultBox) shoppingResultBox.textContent = `성공: ${rowIndices.length}개의 상품을 삭제했습니다.`;
      } catch (err) {
        if (shoppingResultBox) shoppingResultBox.textContent = `삭제 실패: ${err.message}`;
        showUiPopup(`삭제 실패: ${err.message}`);
      }
    });
  }
  if (shoppingStatusFilter) {
    shoppingStatusFilter.addEventListener('change', () => {
      setPageInfo('shopping', { offset: 0 });
      loadBlogShopping();
    });
  }
  if (shoppingQFilter) {
    shoppingQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('shopping', { offset: 0 });
        loadBlogShopping();
      }
    });
  }
  if (shoppingPrevBtn) {
    shoppingPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('shopping');
      setPageInfo('shopping', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogShopping();
    });
  }
  if (shoppingNextBtn) {
    shoppingNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('shopping');
      setPageInfo('shopping', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogShopping();
    });
  }
  if (blogStatusFilter) {
    blogStatusFilter.addEventListener('change', () => {
      setPageInfo('topics', { offset: 0 });
      loadBlogTopics();
    });
  }
  if (blogQFilter) {
    blogQFilter.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPageInfo('topics', { offset: 0 });
        loadBlogTopics();
      }
    });
  }
  if (blogTopicsPrevBtn) {
    blogTopicsPrevBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('topics');
      setPageInfo('topics', { offset: Math.max(0, pageInfo.offset - pageInfo.limit) });
      loadBlogTopics();
    });
  }
  if (blogTopicsNextBtn) {
    blogTopicsNextBtn.addEventListener('click', () => {
      const pageInfo = getPageInfo('topics');
      setPageInfo('topics', { offset: Math.max(0, pageInfo.offset + pageInfo.limit) });
      loadBlogTopics();
    });
  }

  // --- Topic Edit Modal Events ---
  const blogEditCloseBtn = document.getElementById('blog-edit-close-btn');
  const blogEditCancelBtn = document.getElementById('blog-edit-cancel-btn');
  const blogEditSaveBtn = document.getElementById('blog-edit-save-btn');
  const blogEditModalBackdrop = document.getElementById('blog-edit-modal-backdrop');

  if (blogEditCloseBtn) blogEditCloseBtn.onclick = closeBlogTopicEditor;
  if (blogEditCancelBtn) blogEditCancelBtn.onclick = closeBlogTopicEditor;
  if (blogEditSaveBtn) blogEditSaveBtn.onclick = saveBlogTopicModifications;

  // Custom Select Triggers within Modal
  ['modal-blog-category', 'modal-blog-status', 'modal-blog-post-status'].forEach(id => {
    const trigger = document.getElementById(`${id}-trigger`);
    const container = document.getElementById(`${id}-container`);
    if (trigger && container) {
      trigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = container.classList.contains('open');
        // Close all other custom selects first
        document.querySelectorAll('.custom-select-container.open').forEach(el => {
          if (el !== container) el.classList.remove('open');
        });
        container.classList.toggle('open');
      };
    }

    // Static Modal Option Click handling (for Status, Post Status - Category is dynamic)
    if (id !== 'modal-blog-category') {
      const options = container?.querySelectorAll('.custom-select-option');
      options?.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          const text = opt.textContent;
          const textEl = document.getElementById(`${id}-text`);
          if (textEl) {
            textEl.textContent = text;
            textEl.dataset.value = val;
          }
          container.classList.remove('open');
        });
      });
    }
  });

  // Table Double Click Editing
  if (blogTopicsTableBody) {
    blogTopicsTableBody.addEventListener('dblclick', (e) => {
      const td = e.target.closest('td.editable-cell');
      if (!td) return;
      const row = td.closest('tr[data-row-index]');
      if (!row) return;
      const rowIndex = Number(row.dataset.rowIndex);
      if (Number.isInteger(rowIndex)) {
        openBlogTopicEditor(rowIndex);
      }
    });

  }

  // Modal Backdrop Click to Close
  if (blogEditModalBackdrop) {
    blogEditModalBackdrop.onclick = (e) => {
      if (e.target === blogEditModalBackdrop) closeBlogTopicEditor();
    };
  }

  // Select All Header Checkbox Listeners
  const trendsSelectAll = document.getElementById('blog-trends-table-select-all');
  if (trendsSelectAll) {
    trendsSelectAll.addEventListener('change', () => {
      const checked = trendsSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.trend-row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogTrendsSelectedRowIndices.add(rowIndex);
        else blogTrendsSelectedRowIndices.delete(rowIndex);
      });
      updateTrendsSelectionUi();
    });
  }

  const blogSelectAll = document.getElementById('blog-table-select-all');
  if (blogSelectAll) {
    blogSelectAll.addEventListener('change', () => {
      const checked = blogSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogSelectedRowIndices.add(rowIndex);
        else blogSelectedRowIndices.delete(rowIndex);
      });
      updateBlogSelectionUi();
    });
  }

  const shoppingSelectAll = document.getElementById('shopping-table-select-all');
  if (shoppingSelectAll) {
    shoppingSelectAll.addEventListener('change', () => {
      const checked = shoppingSelectAll.checked;
      const selectors = Array.from(document.querySelectorAll('input.shopping-row-selector'));
      selectors.forEach(s => {
        s.checked = checked;
        const rowIndex = Number(s.value);
        if (checked) blogShoppingSelectedRowIndices.add(rowIndex);
        else blogShoppingSelectedRowIndices.delete(rowIndex);
      });
      updateShoppingSelectionUi();
    });
  }

  if (blogTrendsTableBody) {
    blogTrendsTableBody.addEventListener('change', (e) => {
      const selector = e.target?.closest('input.trend-row-selector');
      if (!selector) return;
      const rowIndex = Number(selector.value);
      if (!Number.isInteger(rowIndex) || !findTrendByRowIndex(rowIndex)) return;
      if (selector.checked) {
        blogTrendsSelectedRowIndices.add(rowIndex);
      } else {
        blogTrendsSelectedRowIndices.delete(rowIndex);
      }
      updateTrendsSelectionUi();
    });
  }

  if (blogTopicsTableBody) {
    blogTopicsTableBody.addEventListener('change', async (e) => {
      const selector = e.target?.closest('input.row-selector');
      if (selector) {
        const rowIndex = Number(selector.value);
        if (!Number.isInteger(rowIndex)) return;
        if (selector.checked) {
          blogSelectedRowIndices.add(rowIndex);
        } else {
          blogSelectedRowIndices.delete(rowIndex);
        }
        updateBlogSelectionUi();
        return;
      }

      const toggle = e.target?.closest('input.inline-toggle');
      if (toggle) {
        const rowIndex = Number(toggle.dataset.rowIndex);
        const field = String(toggle.dataset.field || '');
        if (!Number.isInteger(rowIndex) || !['imageGeneration', 'externalReference'].includes(field)) return;
        const patch = {};
        patch[field] = Boolean(toggle.checked);
        try {
          await saveBlogRowPatch(rowIndex, patch, { silent: true });
        } catch (err) {
          toggle.checked = !toggle.checked;
          const resultBox = document.getElementById('blog-action-result');
          if (resultBox) resultBox.textContent = `오류: ${err.message}`;
        }
      }
    });

    blogTopicsTableBody.addEventListener('click', (e) => {
      if (e.target?.closest('.inline-editor')) return;
      const cell = e.target?.closest('td.editable-cell');
      if (!cell) return;
      startBlogInlineEdit(cell);
    });
  }

  if (shoppingTableBody) {
    shoppingTableBody.addEventListener('change', (e) => {
      const selector = e.target?.closest('input.shopping-row-selector');
      if (!selector) return;
      const rowIndex = Number(selector.value);
      if (!Number.isInteger(rowIndex) || !findShoppingByRowIndex(rowIndex)) return;
      if (selector.checked) {
        blogShoppingSelectedRowIndices.add(rowIndex);
      } else {
        blogShoppingSelectedRowIndices.delete(rowIndex);
      }
      updateShoppingSelectionUi();
    });

    shoppingTableBody.addEventListener('dblclick', (e) => {
      if (e.target?.closest('input[type="checkbox"]')) return;
      const tr = e.target?.closest('tr[data-row-index]');
      if (!tr) return;
      const rowIndex = Number(tr.dataset.rowIndex);
      if (Number.isInteger(rowIndex)) openShoppingEditor(rowIndex);
    });
  }

  // Shopping Edit Modal
  const shoppingEditCloseBtn = document.getElementById('shopping-edit-close-btn');
  const shoppingEditCancelBtn = document.getElementById('shopping-edit-cancel-btn');
  const shoppingEditSaveBtn = document.getElementById('shopping-edit-save-btn');
  const shoppingEditModalBackdrop = document.getElementById('shopping-edit-modal-backdrop');

  if (shoppingEditCloseBtn) shoppingEditCloseBtn.onclick = closeShoppingEditor;
  if (shoppingEditCancelBtn) shoppingEditCancelBtn.onclick = closeShoppingEditor;
  if (shoppingEditSaveBtn) shoppingEditSaveBtn.onclick = saveShoppingModifications;
  if (shoppingEditModalBackdrop) {
    shoppingEditModalBackdrop.addEventListener('click', (e) => {
      if (e.target === shoppingEditModalBackdrop) closeShoppingEditor();
    });
  }

  // Custom Select Triggers within Shopping Modal
  ['modal-shopping-post-status', 'modal-shopping-status'].forEach(id => {
    const trigger = document.getElementById(`${id}-trigger`);
    const container = document.getElementById(`${id}-container`);
    if (trigger && container) {
      trigger.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select-container.open').forEach(el => {
          if (el !== container) el.classList.remove('open');
        });
        container.classList.toggle('open');
      };
      const options = container.querySelectorAll('.custom-select-option');
      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          const text = opt.textContent;
          const textEl = document.getElementById(`${id}-text`);
          if (textEl) { textEl.textContent = text; textEl.dataset.value = val; }
          container.classList.remove('open');
        });
      });
    }
  });

  sortableHeaders.forEach((th) => {
    const onSort = () => {
      const tableName = String(th.dataset.sortTable || '').trim();
      const key = String(th.dataset.sortKey || '').trim();
      if (!tableName || !key) return;
      toggleTableSort(tableName, key);
    };
    th.addEventListener('click', onSort);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSort();
      }
    });
  });

  const settingsMajorRefreshBtns = document.querySelectorAll('.settings-major-refresh-btn');
  const settingsMajorSaveBtns = document.querySelectorAll('.settings-major-save-btn');
  const settingsNaverLoginBtn = document.getElementById('settings-naver-login-btn');
  const settingsNaverLogoutBtn = document.getElementById('settings-naver-logout-btn');
  const settingsOpenGoogleSheetBtn = document.getElementById('settings-open-google-sheet-btn');
  const settingsGoogleOauthConnectBtn = document.getElementById('settings-google-oauth-connect-btn');
  const settingsGoogleOauthDisconnectBtn = document.getElementById('settings-google-oauth-disconnect-btn');
  const settingsGoogleOauthTestBtn = document.getElementById('settings-google-oauth-test-btn');
  const settingsTypingSpeedEl = document.getElementById('settings-typing-speed');
  const blogCollectRefreshBtn = document.getElementById('blog-collect-trends-refresh-btn');
  const blogCollectTrendsRunBtn = document.getElementById('blog-collect-trends-run-btn');
  const blogCollectRssRunBtn = document.getElementById('blog-collect-rss-run-btn');
  const blogCollectRssAddBtn = document.getElementById('blog-collect-rss-add-btn');
  const blogAutoRefreshBtn = document.getElementById('blog-publish-auto-refresh-btn');
  const blogAutoSaveBtn = document.getElementById('blog-publish-auto-save-btn');
  const blogAutoCategoryOptionsEls = Array.from(document.querySelectorAll('[data-blog-category-options]'));
  const blogAutoVariationNumberEnabledEl = document.getElementById('blog-collect-trends-filter-number-enabled');
  const blogAutoVariationNumberInputEl = document.getElementById('blog-collect-trends-filter-min');
  const blogAutoVariationTypeEl = document.getElementById('blog-collect-trends-filter-type');
  const blogAutoRunBtn = document.getElementById('blog-publish-auto-run-btn');
  const shoppingAutoRefreshBtn = document.getElementById('shopping-auto-refresh-btn');
  const shoppingAutoSaveBtn = document.getElementById('shopping-auto-save-btn');
  const shoppingAutoRunBtn = document.getElementById('shopping-publish-auto-run-btn');
  const shoppingAutoDailyPostsInputEl = document.getElementById('shopping-auto-daily-posts');
  const settingsTypingPreviewInputEl = document.getElementById('settings-typing-preview-input');
  const settingsTypingPreviewReplayBtn = document.getElementById('settings-typing-preview-replay');
  const settingsTabButtons = Array.from(document.querySelectorAll('.settings-tab-btn[data-settings-tab]'));
  const settingsMajorAutoSaveInputs = [
    document.getElementById('settings-listen-port'),
    document.getElementById('settings-mcp-remote-port'),
    document.getElementById('settings-mcp-remote-path'),
    document.getElementById('settings-mcp-remote-auth-token-display'),
    document.getElementById('settings-naver-id'),
    document.getElementById('settings-wordpress-url'),
    document.getElementById('settings-wordpress-user-id'),
    document.getElementById('settings-wordpress-app-password'),
    document.getElementById('settings-google-sheet-url'),
    document.getElementById('settings-update-mirror-repo'),
    document.getElementById('settings-custom-update-check-url'),
    document.getElementById('settings-text-model-name'),
    document.getElementById('settings-text-model-base-url'),
    document.getElementById('settings-text-model-api-key'),
    document.getElementById('settings-image-model-name'),
    document.getElementById('settings-image-model-base-url'),
    document.getElementById('settings-image-model-api-key'),
    document.getElementById('settings-chat-model-name'),
    document.getElementById('settings-chat-model-base-url'),
    document.getElementById('settings-chat-model-api-key'),
    document.getElementById('blog-collect-trends-time'),
    document.getElementById('blog-collect-trends-filter-min'),
    document.getElementById('blog-collect-trends-filter-top'),
    document.getElementById('blog-collect-trends-reuse-gap'),
    document.getElementById('blog-collect-trends-naver-category'),
    document.getElementById('blog-collect-trends-wordpress-category'),
    document.getElementById('blog-publish-auto-interval'),
    document.getElementById('blog-publish-auto-batch'),
    document.getElementById('blog-publish-auto-start-time'),
    document.getElementById('blog-publish-auto-end-time'),
    document.getElementById('shopping-publish-auto-interval'),
    document.getElementById('shopping-publish-auto-batch'),
    document.getElementById('shopping-publish-auto-start-time'),
    document.getElementById('shopping-publish-auto-end-time'),
    document.getElementById('settings-notify-telegram-bot-token'),
    document.getElementById('settings-notify-telegram-chat-id'),
    document.getElementById('settings-notify-bitly-token'),
    document.getElementById('settings-notify-slack-webhook-url'),
    document.getElementById('settings-buffer-api-key'),
    document.getElementById('settings-sns-publish-interval'),
  ].filter(Boolean);
  const settingsMajorAutoSaveSelects = [
    document.getElementById('settings-listen-host'),
    document.getElementById('settings-update-server-type'),
    document.getElementById('settings-text-model-preset-provider'),
    document.getElementById('settings-text-model-preset-code'),
    document.getElementById('settings-image-model-preset-provider'),
    document.getElementById('settings-image-model-preset-code'),
    document.getElementById('settings-chat-model-preset-provider'),
    document.getElementById('settings-chat-model-preset-code'),
    document.getElementById('settings-mcp-remote-host'),
    document.getElementById('settings-sns-ai-mode'),
    document.getElementById('settings-typing-speed'),
    document.getElementById('blog-publish-auto-post-status'),
    document.getElementById('blog-collect-trends-filter-type')
  ].filter(Boolean);
  const settingsMajorAutoSaveChecks = [
    document.getElementById('settings-mcp-remote-enabled'),
    document.getElementById('settings-image-optimization'),
    document.getElementById('blog-collect-trends-enabled'),
    document.getElementById('blog-collect-trends-filter-new'),
    document.getElementById('blog-collect-trends-filter-dash'),
    document.getElementById('blog-collect-trends-filter-number-enabled'),
    document.getElementById('blog-publish-auto-enabled'),
    document.getElementById('blog-publish-auto-headless'),
    document.getElementById('shopping-publish-auto-enabled'),
    document.getElementById('shopping-publish-auto-headless'),
    document.getElementById('blog-publish-auto-notify-enabled'),
    document.getElementById('shopping-publish-auto-notify-enabled'),
    document.getElementById('settings-notify-telegram-enabled'),
    document.getElementById('settings-notify-slack-enabled'),
    document.getElementById('settings-sns-publish-enabled'),
    document.getElementById('settings-sns-source-naver'),
    document.getElementById('settings-sns-source-wordpress'),
    ...Array.from(document.querySelectorAll('input[name="settings-blog-writing-mode"]')),
    ...Array.from(document.querySelectorAll('input[name="settings-blog-speech-level"]')),
    ...Array.from(document.querySelectorAll('input[name="settings-blog-writing-strategy"]')),
    ...Array.from(document.querySelectorAll('input[name="settings-chat-model-source"]')),
    ...Array.from(document.querySelectorAll('[data-publish-target]')),
    ...Array.from(document.querySelectorAll('[data-shopping-publish-target]'))
  ].filter(Boolean);

  settingsMajorRefreshBtns.forEach(btn => btn.addEventListener('click', () => loadSettingsMajor({ force: true })));
  settingsMajorSaveBtns.forEach(btn => btn.addEventListener('click', () => saveSettingsMajor({ mode: 'manual' })));
  [
    document.getElementById('settings-notify-telegram-enabled'),
    document.getElementById('settings-notify-telegram-bot-token'),
    document.getElementById('settings-notify-telegram-chat-id'),
    document.getElementById('settings-mcp-remote-enabled'),
    document.getElementById('settings-mcp-remote-host'),
    document.getElementById('settings-mcp-remote-port'),
    document.getElementById('settings-mcp-remote-path'),
    document.getElementById('settings-mcp-remote-auth-token-display'),
    document.getElementById('settings-update-server-type'),
    document.getElementById('settings-text-model-preset-provider'),
    document.getElementById('settings-text-model-preset-code'),
    document.getElementById('settings-image-model-preset-provider'),
    document.getElementById('settings-image-model-preset-code'),
    document.getElementById('settings-chat-model-preset-provider'),
    document.getElementById('settings-chat-model-preset-code'),
    ...Array.from(document.querySelectorAll('input[name="settings-chat-model-source"]'))
  ].filter(Boolean).forEach((el) => {
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      if (el.id === 'settings-text-model-preset-provider') {
        handleSettingsAiProviderChange('text');
      } else if (el.id === 'settings-text-model-preset-code') {
        captureSettingsAiModelDesiredState('text');
      }
      if (el.id === 'settings-image-model-preset-provider') {
        handleSettingsAiProviderChange('image');
      } else if (el.id === 'settings-image-model-preset-code') {
        captureSettingsAiModelDesiredState('image');
      }
      if (el.id === 'settings-chat-model-preset-provider') {
        handleSettingsAiProviderChange('chat');
      } else if (el.id === 'settings-chat-model-preset-code') {
        captureSettingsAiModelDesiredState('chat');
      }
      syncSettingsTelegramUi();
      syncSettingsMcpUi();
      syncSettingsUpdateSourceUi();
      syncSettingsAiModelUi('text');
      syncSettingsAiModelUi('image');
      syncSettingsChatModelUi();
      if (el.name === 'settings-chat-model-source') resetSettingsAiModelTestResult('chat');
    });
  });
  const settingsMcpRemoteAuthTokenDisplay = document.getElementById('settings-mcp-remote-auth-token-display');
  if (settingsMcpRemoteAuthTokenDisplay) {
    settingsMcpRemoteAuthTokenDisplay.addEventListener('input', () => {
      if (!settingsMcpTokenVisible) return;
      setSettingsMcpTokenValue(settingsMcpRemoteAuthTokenDisplay.value, { visible: true });
      refreshSettingsMajorPendingState();
    });
  }
  const settingsMcpRemoteAuthToggleBtn = document.getElementById('settings-mcp-remote-auth-toggle-btn');
  if (settingsMcpRemoteAuthToggleBtn) {
    settingsMcpRemoteAuthToggleBtn.addEventListener('click', toggleSettingsMcpTokenVisibility);
  }
  const settingsMcpRemoteAuthCopyBtn = document.getElementById('settings-mcp-remote-auth-copy-btn');
  if (settingsMcpRemoteAuthCopyBtn) {
    settingsMcpRemoteAuthCopyBtn.addEventListener('click', copySettingsMcpToken);
  }
  const settingsMcpRemoteAuthRegenerateBtn = document.getElementById('settings-mcp-remote-auth-regenerate-btn');
  if (settingsMcpRemoteAuthRegenerateBtn) {
    settingsMcpRemoteAuthRegenerateBtn.addEventListener('click', regenerateSettingsMcpToken);
  }
  if (settingsNaverLoginBtn) settingsNaverLoginBtn.addEventListener('click', startNaverLoginFromUi);
  if (settingsNaverLogoutBtn) settingsNaverLogoutBtn.addEventListener('click', logoutNaverFromUi);
  const settingsWordPressVerifyBtn = document.getElementById('settings-wordpress-verify-btn');
  if (settingsWordPressVerifyBtn) settingsWordPressVerifyBtn.addEventListener('click', verifyWordPressAuthFromUi);
  const settingsBufferConnectBtn = document.getElementById('settings-buffer-connect-btn');
  const settingsBufferOrganizationEl = document.getElementById('settings-buffer-organization');
  if (settingsBufferConnectBtn) {
    settingsBufferConnectBtn.addEventListener('click', () => {
      inspectSettingsBufferConnection(settingsBufferOrganizationEl?.value || '');
    });
  }
  if (settingsBufferOrganizationEl) {
    settingsBufferOrganizationEl.addEventListener('change', () => {
      settingsBufferChannels = [];
      settingsBufferSelectedChannelIds = new Set();
      renderSettingsBufferChannels();
      inspectSettingsBufferConnection(settingsBufferOrganizationEl.value);
    });
  }
  const settingsSnsCheckNowBtn = document.getElementById('settings-sns-check-now-btn');
  if (settingsSnsCheckNowBtn) {
    settingsSnsCheckNowBtn.addEventListener('click', runSettingsSnsCheckNow);
  }
  const settingsSnsPublishNowBtn = document.getElementById('settings-sns-publish-now-btn');
  if (settingsSnsPublishNowBtn) {
    settingsSnsPublishNowBtn.addEventListener('click', runSettingsSnsPublishNow);
  }
  const settingsSnsAiModeEl = document.getElementById('settings-sns-ai-mode');
  if (settingsSnsAiModeEl) {
    settingsSnsAiModeEl.addEventListener('change', syncSettingsSnsAiHint);
  }
  [
    document.getElementById('settings-text-model-preset-code'),
    document.getElementById('settings-text-model-name'),
    document.getElementById('settings-text-model-api-key'),
    document.getElementById('settings-chat-model-preset-code'),
    document.getElementById('settings-chat-model-name')
  ].filter(Boolean).forEach((element) => {
    element.addEventListener('input', syncSettingsSnsAiHint);
    element.addEventListener('change', syncSettingsSnsAiHint);
  });
  if (settingsOpenGoogleSheetBtn) settingsOpenGoogleSheetBtn.addEventListener('click', openGoogleSheetFromUi);
  if (settingsGoogleOauthConnectBtn) settingsGoogleOauthConnectBtn.addEventListener('click', startGoogleOauth);
  if (settingsGoogleOauthDisconnectBtn) settingsGoogleOauthDisconnectBtn.addEventListener('click', disconnectGoogleOauth);
  if (settingsGoogleOauthTestBtn) settingsGoogleOauthTestBtn.addEventListener('click', testGoogleOauth);
  if (settingsTypingSpeedEl) settingsTypingSpeedEl.addEventListener('change', playSettingsTypingPreview);
  if (blogCollectRefreshBtn) blogCollectRefreshBtn.addEventListener('click', () => loadBlogCollectSettings({ force: true }));
  if (blogCollectTrendsRunBtn) blogCollectTrendsRunBtn.addEventListener('click', runBlogCollectTrendsManual);
  if (blogCollectRssRunBtn) blogCollectRssRunBtn.addEventListener('click', runBlogCollectRssManual);
  if (blogCollectRssAddBtn) blogCollectRssAddBtn.addEventListener('click', window.addRssConfig);
  if (blogAutoRefreshBtn) blogAutoRefreshBtn.addEventListener('click', () => loadBlogAutoSettings({ force: true }));
  if (blogAutoSaveBtn) blogAutoSaveBtn.addEventListener('click', saveBlogAutoSettings);
  if (blogAutoRunBtn) blogAutoRunBtn.addEventListener('click', runBlogPublishAutoManual);
  if (blogAutoVariationNumberEnabledEl) {
    blogAutoVariationNumberEnabledEl.addEventListener('change', syncBlogAutoVariationNumberUi);
  }
  if (blogAutoVariationTypeEl) {
    blogAutoVariationTypeEl.addEventListener('change', syncBlogAutoVariationTypeUi);
  }
  if (shoppingAutoRefreshBtn) shoppingAutoRefreshBtn.addEventListener('click', () => loadShoppingAutoSettings({ force: true }));
  if (shoppingAutoSaveBtn) shoppingAutoSaveBtn.addEventListener('click', saveShoppingAutoSettings);
  if (shoppingAutoRunBtn) shoppingAutoRunBtn.addEventListener('click', runShoppingAutoManual);
  blogAutoCategoryOptionsEls.forEach((containerEl) => {
    containerEl.addEventListener('click', (e) => {
      const btn = e.target?.closest('button[data-blog-collect-trends-category-toggle]');
      if (!btn) return;
      const category = normalizeCategoryToken(btn.dataset.blogCollectTrendsCategoryToggle || '');
      if (!category) return;
      if (blogAutoCategorySelected.has(category)) blogAutoCategorySelected.delete(category);
      else blogAutoCategorySelected.add(category);
      renderBlogAutoCategoryUi();
      scheduleSettingsMajorAutoSave({ immediate: true });
    });
  });
  if (blogAutoVariationNumberInputEl) {
    blogAutoVariationNumberInputEl.addEventListener('blur', () => {
      const normalized = normalizeBlogAutoVariationNumberValue(blogAutoVariationNumberInputEl.value, 50);
      blogAutoVariationNumberInputEl.value = normalized === '' ? '' : String(normalized);
    });
  }
  if (blogAutoVariationNumberEnabledEl) {
    blogAutoVariationNumberEnabledEl.addEventListener('change', () => {
      syncBlogAutoVariationNumberUi();
    });
  }
  if (shoppingAutoDailyPostsInputEl) {
    shoppingAutoDailyPostsInputEl.addEventListener('input', () => {
      clampShoppingAutoDailyPostsInputValue({ force: false });
    });
    shoppingAutoDailyPostsInputEl.addEventListener('blur', () => {
      clampShoppingAutoDailyPostsInputValue({ force: true });
    });
  }
  const settingsNotifyTelegramTestBtn = document.getElementById('settings-notify-telegram-test-btn');
  if (settingsNotifyTelegramTestBtn) {
    settingsNotifyTelegramTestBtn.addEventListener('click', async () => {
      const botToken = getSettingsInputValue('settings-notify-telegram-bot-token').trim();
      const chatId = (document.getElementById('settings-notify-telegram-chat-id')?.value || '').trim();
      const resultEl = document.getElementById('settings-notify-telegram-test-result');

      if (!botToken || !chatId) {
        if (resultEl) {
          resultEl.textContent = '❌ 봇 토큰과 챗 ID를 입력해주세요.';
          resultEl.style.color = 'var(--danger)';
        }
        return;
      }

      settingsNotifyTelegramTestBtn.disabled = true;
      if (resultEl) {
        resultEl.textContent = '⏳ 테스트 중...';
        resultEl.style.color = 'var(--text-muted)';
      }

      try {
        const res = await postJson('/api/v1/settings/test-telegram', { botToken, chatId });
        if (resultEl) {
          resultEl.textContent = '✅ 성공! 텔레그램 메시지를 확인하세요.';
          resultEl.style.color = 'var(--success)';
        }
      } catch (e) {
        if (resultEl) {
          resultEl.textContent = '❌ 실패: ' + e.message;
          resultEl.style.color = 'var(--danger)';
        }
      } finally {
        settingsNotifyTelegramTestBtn.disabled = false;
      }
    });
  }

  ['text', 'image', 'chat'].forEach((kind) => {
    const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
    const testButtonEl = document.getElementById(`settings-${prefix}-model-test-btn`);
    if (testButtonEl) {
      testButtonEl.addEventListener('click', () => runSettingsAiModelTest(kind));
    }
    [
      document.getElementById(`settings-${prefix}-model-preset-provider`),
      document.getElementById(`settings-${prefix}-model-preset-code`),
      document.getElementById(`settings-${prefix}-model-name`),
      document.getElementById(`settings-${prefix}-model-base-url`),
      document.getElementById(`settings-${prefix}-model-api-key`)
    ].filter(Boolean).forEach((element) => {
      element.addEventListener('input', () => {
        resetSettingsAiModelTestResult(kind);
        if (kind === 'text' && getSelectedSettingsRadioValue('settings-chat-model-source', 'writing') === 'writing') {
          resetSettingsAiModelTestResult('chat');
        }
      });
      element.addEventListener('change', () => {
        resetSettingsAiModelTestResult(kind);
        if (kind === 'text' && getSelectedSettingsRadioValue('settings-chat-model-source', 'writing') === 'writing') {
          resetSettingsAiModelTestResult('chat');
        }
      });
    });
  });

  const settingsNotifySlackTestBtn = document.getElementById('settings-notify-slack-test-btn');
  if (settingsNotifySlackTestBtn) {
    settingsNotifySlackTestBtn.addEventListener('click', async () => {
      const webhookUrl = getSettingsInputValue('settings-notify-slack-webhook-url').trim();
      const resultEl = document.getElementById('settings-notify-slack-test-result');

      if (!webhookUrl) {
        if (resultEl) {
          resultEl.textContent = '❌ Webhook URL을 입력해주세요.';
          resultEl.style.color = 'var(--danger)';
        }
        return;
      }

      settingsNotifySlackTestBtn.disabled = true;
      if (resultEl) {
        resultEl.textContent = '⏳ 테스트 중...';
        resultEl.style.color = 'var(--text-muted)';
      }

      try {
        const res = await postJson('/api/v1/settings/test-slack', { webhookUrl });
        if (resultEl) {
          resultEl.textContent = '✅ 성공! Slack 채널을 확인하세요.';
          resultEl.style.color = 'var(--success)';
        }
      } catch (e) {
        if (resultEl) {
          resultEl.textContent = '❌ 실패: ' + e.message;
          resultEl.style.color = 'var(--danger)';
        }
      } finally {
        settingsNotifySlackTestBtn.disabled = false;
      }
    });
  }
  if (settingsTypingPreviewReplayBtn) settingsTypingPreviewReplayBtn.addEventListener('click', playSettingsTypingPreview);
  if (settingsTypingPreviewInputEl) {
    settingsTypingPreviewInputEl.placeholder = SETTINGS_TYPING_PREVIEW_DEFAULT_TEXT;
    settingsTypingPreviewInputEl.addEventListener('input', () => {
      setSettingsTypingPreviewMeta('문구가 변경되었습니다. [다시 재생]을 누르거나 입력창을 벗어나면 재생됩니다.');
    });
    settingsTypingPreviewInputEl.addEventListener('blur', () => {
      playSettingsTypingPreview();
    });
  }
  settingsTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activateSettingsTab(btn.dataset.settingsTab, { forceReload: true });
    });
  });
  settingsMajorAutoSaveInputs.forEach((inputEl) => {
    inputEl.addEventListener('input', () => scheduleSettingsMajorAutoSave());
    inputEl.addEventListener('blur', () => scheduleSettingsMajorAutoSave({ immediate: true }));
    // type="time" 필드는 change 이벤트가 더 확실하게 저장 트리거임
    if (inputEl.type === 'time') {
      inputEl.addEventListener('change', () => scheduleSettingsMajorAutoSave({ immediate: true }));
    }
  });
  settingsMajorAutoSaveSelects.forEach((selectEl) => {
    selectEl.addEventListener('change', () => scheduleSettingsMajorAutoSave({ immediate: true }));
  });
  settingsMajorAutoSaveChecks.forEach((checkEl) => {
    checkEl.addEventListener('change', () => {
      if (checkEl.name === 'settings-blog-writing-mode' || checkEl.name === 'settings-blog-speech-level') {
        syncSettingsBlogWritingStyleDescription();
      }
      if (checkEl.name === 'settings-blog-writing-strategy') {
        syncSettingsBlogWritingStrategyDescription();
      }
      if (checkEl.name === 'settings-chat-model-source') {
        syncSettingsChatModelUi();
      }
      scheduleSettingsMajorAutoSave({ immediate: true });
    });
  });
  SETTINGS_SHOPPING_SLOT_ORDER.forEach((slot) => {
    const fileInput = document.getElementById(`settings-image-file-${slot}`);
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) {
          settingsShoppingImageFileState[slot] = file;
        } else {
          clearStagedSettingsShoppingImage(slot);
        }
        renderSettingsShoppingImageSlot(slot);
        scheduleSettingsMajorAutoSave({ immediate: true });
      });
    }

    const resetBtn = document.getElementById(`settings-image-reset-${slot}`);
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        restoreSettingsShoppingDefault(slot);
        scheduleSettingsMajorAutoSave({ immediate: true });
      });
    }

    const clearBtn = document.getElementById(`settings-image-clear-${slot}`);
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearSettingsShoppingOptional(slot);
        scheduleSettingsMajorAutoSave({ immediate: true });
      });
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('beforeunload', (event) => {
    if (!settingsMajorHasPendingBasicChanges) return;
    event.preventDefault();
    event.returnValue = '';
  });

  try { initManagedSettingsSecretFields(); } catch (e) { console.warn('initManagedSettingsSecretFields error:', e); }
  try { initManualSnsComposer(); } catch (e) { console.warn('initManualSnsComposer error:', e); }
  checkSetupBanner();
  void initSidebarDynamicContent();
  void initDashboardDynamicContent();
  void initAccountDynamicContent();
  const settingsCheckUpdateBtn = document.getElementById('settings-check-update-btn');
  if (settingsCheckUpdateBtn) {
    settingsCheckUpdateBtn.addEventListener('click', () => {
      checkUpdate(true, false);
    });
  }

  const settingsForceUpdateBtn = document.getElementById('settings-force-update-btn');
  if (settingsForceUpdateBtn) {
    settingsForceUpdateBtn.addEventListener('click', () => {
      checkUpdate(true, true);
    });
  }

  try { initClockWidget(); } catch (e) { console.warn('initClockWidget error:', e); }
  try { ensureUpdateCheckFresh({ silent: true }); } catch (e) { console.warn('checkUpdate error:', e); }
  try { applyMobileQuickMode(); } catch (e) { console.warn('applyMobileQuickMode error:', e); }
  window.addEventListener('resize', applyMobileQuickMode);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushPendingQuickPostingCelebration();
      void ensureUpdateCheckFresh({ silent: true });
      void refreshSidebarDynamicContent();
      void initDashboardDynamicContent();
      void refreshAccountDynamicContent();
    }
  });
  window.addEventListener('focus', () => {
    flushPendingQuickPostingCelebration();
    void ensureUpdateCheckFresh({ silent: true });
    void refreshSidebarDynamicContent();
    void initDashboardDynamicContent();
    void refreshAccountDynamicContent();
  });
  setInterval(() => {
    void ensureUpdateCheckFresh({ silent: true });
  }, UPDATE_AUTO_CHECK_POLL_MS);

  const accountRefreshBtn = document.getElementById('account-refresh-btn');
  accountRefreshBtn?.addEventListener('click', () => {
    void refreshAccountDynamicContent();
    loadAccountOverview({ force: true }).catch((error) => console.warn('[Account Overview Refresh]', error.message));
  });
  const accountRetryBtn = document.getElementById('account-retry-btn');
  accountRetryBtn?.addEventListener('click', () => {
    void refreshAccountDynamicContent();
    loadAccountOverview({ force: true }).catch((error) => console.warn('[Account Overview Retry]', error.message));
  });
  bindAccountUpgradeFreeClick();
  bindAccountEmailClick();
  bindAccountPlanInfoClick();
  document.querySelectorAll('[data-account-settings-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      void navigateToSettingsTarget(
        button.getAttribute('data-account-settings-tab') || 'general',
        button.getAttribute('data-account-settings-target') || ''
      );
    });
  });

  // Sidebar Toggle (Desktop)
  try {
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebar = document.getElementById('sidebar');

    // Restore state
    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed && sidebar) {
      sidebar.classList.add('collapsed');
    }

    if (sidebarToggleBtn && sidebar) {
      sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const nowCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar-collapsed', nowCollapsed);

        // Trigger a window resize event to let other components (like tables) adjust if needed
        window.dispatchEvent(new Event('resize'));
      });
    }
  } catch (e) { console.warn('Sidebar toggle init error:', e); }

  // Mobile Menu Toggle
  try {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuBtn && sidebar && sidebarOverlay) {
      function toggleMenu() {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
      }
      mobileMenuBtn.addEventListener('click', toggleMenu);
      sidebarOverlay.addEventListener('click', toggleMenu);

      // Close menu when a navigation button is clicked on mobile
      const navBtns = document.querySelectorAll('.nav-btn');
      navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          if (window.innerWidth <= 960 && sidebar.classList.contains('open')) {
            toggleMenu();
          }
        });
      });
    }
  } catch (e) { console.warn('Mobile menu init error:', e); }

  // Server Control Buttons
  try {
    const restartBtn = document.getElementById('server-restart-btn');
    const stopBtn = document.getElementById('server-stop-btn');

    if (restartBtn) {
      restartBtn.addEventListener('click', async () => {
        const confirmed = await showUiDialog({
          title: '서버 재시작',
          message: '서버를 재시작하시겠습니까?\n잠시 후 자동으로 페이지가 새로고침됩니다.',
          showCancel: true,
          confirmText: '재시작',
          cancelText: '취소'
        });
        if (!confirmed) return;
        restartBtn.disabled = true;
        restartBtn.textContent = '재시작 중...';
        try {
          await postJson('/api/v1/system/restart');
          setTimeout(() => { location.reload(); }, 3500);
        } catch (e) {
          restartBtn.disabled = false;
          restartBtn.textContent = '🔄 재시작';
          await showUiDialog({ title: '오류', message: '재시작에 실패했습니다: ' + e.message });
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        const confirmed = await showUiDialog({
          title: '⚠️ 서버 종료',
          message: '서버를 완전히 종료하시겠습니까?\n\n종료 후에는 이 페이지도 연결이 끊기며,\n다시 시작하려면 터미널에서 수동으로 실행해야 합니다.',
          showCancel: true,
          confirmText: '종료',
          cancelText: '취소'
        });
        if (!confirmed) return;
        stopBtn.disabled = true;
        stopBtn.textContent = '종료 중...';
        try {
          await postJson('/api/v1/system/stop');
        } catch (e) {
          // Connection refused is expected after stop
        }
      });
    }
  } catch (e) { console.warn('Server control init error:', e); }

  // Update Banner Events
  try {
    const updateCloseBtn = document.getElementById('update-close-btn');
    if (updateCloseBtn) {
      updateCloseBtn.addEventListener('click', () => {
        const banner = document.getElementById('update-banner');
        if (banner) banner.classList.add('hidden');
      });
    }

    const updateDetailsBtn = document.getElementById('update-details-btn');
    if (updateDetailsBtn) {
      updateDetailsBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openUpdateDetailsDialog();
      });
    }

    const updateNowBtn = document.getElementById('update-now-btn');
    if (updateNowBtn) {
      updateNowBtn.addEventListener('click', () => {
        applyUpdate();
      });
    }
  } catch (e) { console.warn('Update banner init error:', e); }

// =========================================================================
// Keyword Research & SEO Title Generator UI Handlers
// =========================================================================
function initKeywordResearchModal() {
  const keywordModal = document.getElementById('keyword-research-modal');
  const titleRecommendBtn = document.getElementById('quick-title-recommend-btn');
  const keywordModalCloseBtn = document.getElementById('keyword-research-modal-close');
  const keywordModalCloseFooter = document.getElementById('keyword-research-modal-close-footer');
  const keywordModalInput = document.getElementById('keyword-modal-input');
  const keywordModalSearchBtn = document.getElementById('keyword-modal-search-btn');
  const keywordModalLoading = document.getElementById('keyword-modal-loading');
  const keywordModalContent = document.getElementById('keyword-modal-content');

  if (!keywordModal) return;

  const openKeywordModal = () => {
    const currentSubject = (document.getElementById('quick-subject')?.value || '').trim();
    const currentKeywords = (document.getElementById('quick-keywords')?.value || '').trim();
    const currentTitle = (document.getElementById('quick-title')?.value || '').trim();
    const initialQuery = currentSubject || currentKeywords || currentTitle;
    if (keywordModalInput) keywordModalInput.value = initialQuery;
    keywordModal.classList.remove('hidden');
    keywordModal.setAttribute('aria-hidden', 'false');
    if (initialQuery) {
      runKeywordPipeline(initialQuery);
    }
  };

  const closeKeywordModal = () => {
    keywordModal.classList.add('hidden');
    keywordModal.setAttribute('aria-hidden', 'true');
  };

  const runKeywordPipeline = async (query) => {
    const q = String(query || keywordModalInput?.value || '').trim();
    if (!q) {
      showUiPopup('분석할 주제나 키워드를 입력해 주세요.');
      return;
    }
    const subject = String(document.getElementById('quick-subject')?.value || q).trim() || q;
    const keywords = String(document.getElementById('quick-keywords')?.value || '')
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    const analysisKeywords = keywords.length > 0 ? keywords : [q];
    if (keywordModalLoading) keywordModalLoading.classList.remove('hidden');
    if (keywordModalContent) keywordModalContent.innerHTML = '';
    if (keywordModalSearchBtn) keywordModalSearchBtn.disabled = true;

    try {
      const data = await postJson('/api/v1/keywords/pipeline', {
        subject,
        keywords: analysisKeywords,
        related_assist: true
      });

      if (!data) {
        throw new Error('키워드 분석 및 제목 추천 실패');
      }

      renderKeywordPipelineResult(data);
    } catch (err) {
      if (keywordModalContent) {
        keywordModalContent.innerHTML = `<div class="alert alert-error" style="color: #dc2626; padding: 12px; background: #fee2e2; border-radius: 6px;">⚠️ 오류: ${escapeHtml(err.message)}</div>`;
      }
    } finally {
      if (keywordModalLoading) keywordModalLoading.classList.add('hidden');
      if (keywordModalSearchBtn) keywordModalSearchBtn.disabled = false;
    }
  };

  const renderKeywordPipelineResult = (data) => {
    if (!keywordModalContent || !data) return;
    const selectedKeyword = data.selected_keyword || '';
    const analysis = data.analysis || null;
    const titles = Array.isArray(data.titles) ? data.titles : [];

    let html = '';

    // 1. Selected Keyword Banner
    if (selectedKeyword) {
      html += `
        <div class="keyword-selected-banner">
          <div><span class="badge">추천 대표 키워드</span> <span class="keyword-text">${escapeHtml(selectedKeyword)}</span></div>
          ${analysis?.selection_reason ? `<div class="reason-text">💡 ${escapeHtml(analysis.selection_reason)}</div>` : ''}
          ${data.analysis_note ? `<div class="reason-text" style="color: #ca8a04;">ℹ️ ${escapeHtml(data.analysis_note)}</div>` : ''}
        </div>
      `;
    }

    // 2. Keyword Metrics Table (if analysis data exists)
    const allKeywords = [...(analysis?.input_keywords || []), ...(analysis?.related_candidates || [])];
    if (allKeywords.length > 0) {
      html += `
        <div class="keyword-section-title">📊 키워드 검색량 &amp; 경쟁도 지표</div>
        <div class="keyword-metrics-table-wrap">
          <table class="keyword-metrics-table">
            <thead>
              <tr>
                <th>키워드</th>
                <th>월간 검색수 (PC / 모바일 / 합계)</th>
                <th>블로그 문서수</th>
                <th>경쟁강도</th>
                <th>기회지수</th>
              </tr>
            </thead>
            <tbody>
      `;

      allKeywords.slice(0, 10).forEach((item) => {
        const totalVol = item.monthly_search_volume?.total !== null && item.monthly_search_volume?.total !== undefined
          ? item.monthly_search_volume.total.toLocaleString()
          : '-';
        const pcVol = item.monthly_search_volume?.pc !== null && item.monthly_search_volume?.pc !== undefined
          ? item.monthly_search_volume.pc.toLocaleString()
          : '-';
        const mobVol = item.monthly_search_volume?.mobile !== null && item.monthly_search_volume?.mobile !== undefined
          ? item.monthly_search_volume.mobile.toLocaleString()
          : '-';
        const docCount = item.blog_document_count !== null && item.blog_document_count !== undefined
          ? item.blog_document_count.toLocaleString() + '건'
          : '-';
        const compLevel = item.competition_strength?.level || '미확인';
        const compClass = compLevel === '낮음' ? 'low' : (compLevel === '높음' ? 'high' : 'medium');
        const oppScore = item.opportunity?.monthly_searches_per_document !== null && item.opportunity?.monthly_searches_per_document !== undefined
          ? item.opportunity.monthly_searches_per_document
          : '-';

        const isPrimary = item.keyword === selectedKeyword;

        html += `
          <tr style="${isPrimary ? 'background: #f0fdf4; font-weight: 600;' : ''}">
            <td>${escapeHtml(item.keyword)} ${isPrimary ? '<span style="color: #16a34a; font-size: 0.75rem;">(선정)</span>' : ''}</td>
            <td>${pcVol} / ${mobVol} / <strong>${totalVol}</strong></td>
            <td>${docCount}</td>
            <td><span class="comp-badge ${compClass}">${compLevel}</span></td>
            <td>${oppScore}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
    }

    // 3. AI Generated SEO Titles
    if (titles.length > 0) {
      html += `
        <div class="keyword-section-title">✨ AI SEO 추천 제목 (3종)</div>
        <div class="title-suggestions-grid">
      `;

      titles.forEach((t) => {
        const role = t.role || '추천 제목';
        const roleClass = role.includes('의도') ? 'intent' : (role.includes('공감') ? 'empathy' : 'scope');

        html += `
          <div class="title-card">
            <div class="title-card-header">
              <span class="title-role-badge ${roleClass}">${escapeHtml(role)}</span>
              <button class="title-apply-btn" type="button" data-title="${escapeHtml(t.title)}" data-keyword="${escapeHtml(selectedKeyword)}">이 제목과 키워드 적용</button>
            </div>
            <div class="title-text">${escapeHtml(t.title)}</div>
            <div class="title-details">
              ${t.seo_reason ? `<div class="title-detail-row"><span class="title-detail-label">🎯 SEO:</span> <span>${escapeHtml(t.seo_reason)}</span></div>` : ''}
              ${t.click_reason ? `<div class="title-detail-row"><span class="title-detail-label">👀 클릭:</span> <span>${escapeHtml(t.click_reason)}</span></div>` : ''}
              ${t.tradeoff ? `<div class="title-detail-row"><span class="title-detail-label">⚖️ 유의점:</span> <span>${escapeHtml(t.tradeoff)}</span></div>` : ''}
            </div>
          </div>
        `;
      });

      html += `</div>`;
    }

    keywordModalContent.innerHTML = html;

    // Attach apply handlers
    keywordModalContent.querySelectorAll('.title-apply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosenTitle = btn.dataset.title || '';
        const chosenKw = btn.dataset.keyword || '';
        const titleInput = document.getElementById('quick-title');
        const keywordInput = document.getElementById('quick-keywords');

        if (titleInput) titleInput.value = chosenTitle;
        if (keywordInput) keywordInput.value = chosenKw;

        closeKeywordModal();
        showToast('선택한 제목과 키워드가 입력되었습니다.', { title: '적용 완료' });
      });
    });
  };

  if (titleRecommendBtn) titleRecommendBtn.addEventListener('click', openKeywordModal);
  if (keywordModalCloseBtn) keywordModalCloseBtn.addEventListener('click', closeKeywordModal);
  if (keywordModalCloseFooter) keywordModalCloseFooter.addEventListener('click', closeKeywordModal);
  if (keywordModalSearchBtn) keywordModalSearchBtn.addEventListener('click', () => runKeywordPipeline());
  if (keywordModalInput) {
    keywordModalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runKeywordPipeline();
      }
    });
  }
}

try { initKeywordResearchModal(); } catch (e) { console.warn('initKeywordResearchModal error:', e); }

  document.addEventListener('click', (event) => {
    const detailsButton = event.target instanceof Element
      ? event.target.closest('#update-details-btn')
      : null;
    if (!detailsButton) return;
    event.preventDefault();
    event.stopPropagation();
    void openUpdateDetailsDialog();
  });

  try {
    const dashLogRefreshBtn = document.getElementById('dash-log-refresh-btn');
    if (dashLogRefreshBtn) {
      dashLogRefreshBtn.addEventListener('click', () => {
        loadDashboardLogs();
        dashLogRefreshBtn.textContent = '불러오는 중...';
        setTimeout(() => dashLogRefreshBtn.textContent = '새로고침', 500);
      });
    }
  } catch (e) { console.warn('Dash log refresh init error:', e); }

  try {
    const dashContentRefreshBtn = document.getElementById('dash-content-refresh-btn');
    if (dashContentRefreshBtn) {
      dashContentRefreshBtn.addEventListener('click', async () => {
        const original = dashContentRefreshBtn.textContent;
        dashContentRefreshBtn.textContent = '불러오는 중...';
        dashContentRefreshBtn.disabled = true;
        try {
          await loadDashboardExternalContent({ force: true, silent: false });
        } finally {
          dashContentRefreshBtn.disabled = false;
          dashContentRefreshBtn.textContent = original || '새로고침';
        }
      });
    }
  } catch (e) { console.warn('Dash content refresh init error:', e); }

  try { bindNavigation(); } catch (e) { console.warn('bindNavigation error:', e); }
  try { bindActions(); } catch (e) { console.warn('bindActions error:', e); }
  try { syncScopedMajorSaveActions(); } catch (e) { console.warn('syncScopedMajorSaveActions error:', e); }
  try { playSettingsTypingPreview(); } catch (e) { console.warn('playSettingsTypingPreview error:', e); }
  try { loadGoogleAuthStatus(); } catch (e) { console.warn('loadGoogleAuthStatus error:', e); }

  // 🚀 설정 초기 로딩 (어느 탭에서든 즉시 발행 가능하도록)
  loadSettingsMajor();

  // 🚀 비동기 병렬 초기화 (블로킹 제거)
  loadConfigStatus().finally(() => {
    console.log('[UI] Initial config status check completed');
  });

  // Unify and Persistence Publish Settings (Headless, Targets)
  initGlobalPublishSettingsSync();

  // [Removed] Duplicated category search handlers.
  // Consolidated into initWpCategorySelector.
  // Close dropdown on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-container').forEach(c => c.classList.remove('open'));
  });

  // Initial WP Options Sync
  window.toggleQuickWpOptions();
  initShoppingQuickCategoryPersistence();

  // 대시보드 별도 로드 (블로킹 방지)
  loadDashboard().finally(() => {
    console.log('[UI] Initial dashboard load attempted');
  });

  // 시트 검사는 백그라운드에서 진행
  setTimeout(() => {
    if (uiConfigReady) {
      ensureSheetsPreflightUi({ silent: true }).then(ready => {
        if (ready) loadDashboard();
      });
    }
  }, 2000);
  loadBlogCollectSettings();
  loadBlogAutoSettings();
  renderBlogLastBatchResult(blogLastBatchResult);
  updateBlogSelectionUi();
  updateTrendsSelectionUi();
  updateShoppingSelectionUi();
  updateSortableHeadersUi();
  initTrendPostingStickyStack();
  renderTrendsPagination();
  renderTopicsPagination();
  renderShoppingPagination();
  setInterval(() => {
    if (isDashboardPollingPaused()) return;
    loadDashboard();
    checkSetupBanner();

    // 자동 새로고침: 로그/이력 뷰가 활성화되어 있으면 함께 갱신
    const logsViewEl = document.getElementById('view-logs');
    if (logsViewEl && logsViewEl.classList.contains('active')) {
      const activeTab = document.querySelector('.logs-tab-btn.active');
      const tabName = activeTab ? activeTab.getAttribute('data-logs-tab') : 'activity';
      if (tabName === 'system') {
        loadSystemLog();
      } else {
        loadDashboardLogs();
      }
    }
  }, 30000);

  // 대시보드 자동발행 "다음 실행"은 분 단위로 상대시간을 갱신
  setInterval(() => {
    renderDashboardAutoSchedule();
  }, 60000);
});

/**
 * Common WordPress Category Custom Select Initializer
 * @param {string} optionsContainerId - ID of the container for dropdown options (e.g., 'quick-wp-category-options-v2')
 * @param {string} triggerTextId - ID of the text element on the trigger button (e.g., 'quick-wp-category-text')
 * @param {string} containerId - ID of the main wrapper (e.g., 'quick-wp-category-container')
 * @param {string} storagePrefix - Prefix for localStorage keys (e.g., 'quick_' or 'shopping_quick_')
 */
async function initWpCategorySelector({ optionsContainerId, triggerTextId, containerId, storagePrefix, onValueChange, initialValue, initialText }) {
  const optionsContainer = document.getElementById(optionsContainerId);
  const triggerText = document.getElementById(triggerTextId);
  const container = document.getElementById(containerId);
  const searchInput = container?.querySelector('input[type="text"]');

  // Helper to update selection
  const updateSelection = (val, text) => {
    const freshTriggerText = document.getElementById(triggerTextId);
    if (freshTriggerText) freshTriggerText.textContent = text;

    optionsContainer?.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === val);
    });
    if (storagePrefix) {
      localStorage.setItem(`${storagePrefix}wp_category_name`, text);
      localStorage.setItem(`${storagePrefix}wp_category_value`, val);
    }
    if (typeof onValueChange === 'function') {
      onValueChange(val);
    }
    const freshContainer = document.getElementById(containerId);
    if (freshContainer) freshContainer.classList.remove('open');
  };

  // Helper to render options
  const renderOptions = (items, filterQuery = '') => {
    if (!optionsContainer) return;
    optionsContainer.innerHTML = '';

    const q = filterQuery.toLowerCase().trim();

    // 1. "Use Custom Value" Option (Hybrid)
    if (q) {
      const customOpt = document.createElement('div');
      customOpt.className = 'custom-select-option custom-value';
      customOpt.dataset.value = q;
      customOpt.innerHTML = `<i class="plus-icon"></i> 직접 입력: <strong>${escapeHtml(q)}</strong>`;
      customOpt.addEventListener('click', (e) => {
        e.stopPropagation();
        updateSelection(q, q);
      });
      optionsContainer.appendChild(customOpt);
    }

    // 2. Default "No Selection" Option
    const defaultOpt = document.createElement('div');
    defaultOpt.className = 'custom-select-option';
    defaultOpt.dataset.value = '';
    defaultOpt.textContent = '카테고리 선택 (미지정 시 기본)';
    defaultOpt.style.display = (!q || defaultOpt.textContent.toLowerCase().includes(q)) ? '' : 'none';
    defaultOpt.addEventListener('click', (e) => {
      e.stopPropagation();
      updateSelection('', defaultOpt.textContent);
    });
    optionsContainer.appendChild(defaultOpt);

    // 3. Populate Categories
    let found = q ? false : true;
    items.forEach(cat => {
      const match = !q || cat.name.toLowerCase().includes(q);
      const opt = document.createElement('div');
      opt.className = 'custom-select-option';
      opt.dataset.value = cat.name;
      opt.textContent = `${cat.name} (${cat.count})`;
      opt.style.display = match ? '' : 'none';
      if (match) {
        found = true;
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          updateSelection(cat.name, opt.textContent);
        });
        optionsContainer.appendChild(opt);
      }
    });

    // Handle "No results" message
    if (!found && !q) {
      const noResultEl = document.createElement('div');
      noResultEl.className = 'custom-select-no-results';
      noResultEl.textContent = '검색 결과가 없습니다.';
      optionsContainer.appendChild(noResultEl);
    }
  };

  // 1. Initial Render or Restore
  const currentVal = initialValue !== undefined ? initialValue : (storagePrefix ? localStorage.getItem(`${storagePrefix}wp_category_value`) : '');
  const currentName = initialText !== undefined ? initialText : (storagePrefix ? localStorage.getItem(`${storagePrefix}wp_category_name`) : '');

  if (currentName && triggerText) {
    triggerText.textContent = currentName;
  }

  // Search Input Bindings
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderOptions(window.categoryCache || [], searchInput.value);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q) {
          updateSelection(q, q);
          if (searchInput) searchInput.value = '';
        }
      }
    });
    searchInput.addEventListener('click', (e) => e.stopPropagation());
  }

  // Bind click trigger universally
  const triggerEl = container?.querySelector('.custom-select-trigger');

  if (triggerEl) {
    // 1. Remove old listeners by cloning the node
    const newTriggerEl = triggerEl.cloneNode(true);
    triggerEl.parentNode.replaceChild(newTriggerEl, triggerEl);

    // 2. Attach clean, fresh listener
    newTriggerEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isOpen = container.classList.contains('open');
      document.querySelectorAll('.custom-select-container').forEach(c => {
        if (c !== container) c.classList.remove('open');
      });
      container.classList.toggle('open');

      // 🚀 Only fetch categories if not already loaded and the dropdown is being opened
      if (!isOpen) {
        if (searchInput) setTimeout(() => searchInput.focus(), 50);

        const hasOptions = optionsContainer && optionsContainer.querySelectorAll('.custom-select-option').length > 0;
        if (!hasOptions || !window.categoryCache) {
          if (optionsContainer) optionsContainer.innerHTML = '<div class="custom-select-loading">불러오는 중...</div>';
          try {
            const categories = await window.fetchWpCategories();
            renderOptions(categories || []);
            if (currentVal) {
              optionsContainer?.querySelectorAll('.custom-select-option').forEach(opt => {
                if (opt.dataset.value === currentVal) opt.classList.add('selected');
              });
            }
          } catch (err) {
            console.error(`WP Categories fetch failed:`, err);
            if (optionsContainer) optionsContainer.innerHTML = '<div class="custom-select-loading">호출 오류</div>';
          }
        }
      }
    });
  }
}

// WordPress Quick Publish UI Helpers
window.toggleQuickWpOptions = async function () {
  // No longer using hybrid selector here

  // 2. Initialize Custom Post Status Selector
  const statusContainer = document.getElementById('quick-wp-status-container');
  const statusTrigger = document.getElementById('quick-wp-status-trigger');
  const statusText = document.getElementById('quick-wp-status-text');
  const statusOptions = document.getElementById('quick-wp-status-options');
  const hiddenStatusInput = document.getElementById('quick-wp-post-status');

  if (statusContainer && statusTrigger && statusOptions) {
    if (statusContainer.dataset.initialized) {
      // Already bound, just toggle visibility or sync state if needed
      return;
    }
    statusContainer.dataset.initialized = 'true';

    const updateStatus = (val, text) => {
      if (statusText) statusText.textContent = text;
      if (hiddenStatusInput) hiddenStatusInput.value = val;

      const options = statusOptions.querySelectorAll('.custom-select-option');
      options.forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === val);
      });

      localStorage.setItem('last_quick_wp_post_status', val);
      localStorage.setItem('last_quick_wp_post_status_text', text);

      // [Sync] Update hidden input if it exists
      if (hiddenStatusInput) {
        hiddenStatusInput.value = val;
        // Trigger change so other listeners (if any) know
        hiddenStatusInput.dispatchEvent(new Event('change'));
      }

      statusContainer.classList.remove('open');
      if (typeof window.toggleQuickWpScheduleDate === 'function') window.toggleQuickWpScheduleDate();
    };

    // Click trigger to toggle
    statusTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      statusContainer.classList.toggle('open');
    });

    // Click options
    statusOptions.querySelectorAll('.custom-select-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        updateStatus(opt.dataset.value, opt.textContent);
      });
    });

    // Restore saved
    const savedStatus = localStorage.getItem('last_quick_wp_post_status');
    const savedStatusText = localStorage.getItem('last_quick_wp_post_status_text');
    if (savedStatus) {
      updateStatus(savedStatus, savedStatusText || '즉시 발행');
    } else {
      // Default
      updateStatus('publish', '즉시 발행');
    }
  }

  // 3. Persistence for Date
  const wpDateEl = document.getElementById('quick-wp-schedule-date');
  if (wpDateEl) {
    const savedDate = localStorage.getItem('last_quick_wp_schedule_date');
    if (savedDate) wpDateEl.value = savedDate;
    wpDateEl.addEventListener('change', () => {
      localStorage.setItem('last_quick_wp_schedule_date', wpDateEl.value);
    });
  }
};

window.toggleQuickWpScheduleDate = function () {
  const input = document.getElementById('quick-wp-schedule-date');
  const status = document.getElementById('quick-wp-post-status')?.value;
  if (input) {
    input.disabled = (status !== 'schedule');
  }
};

/**
 * Unify and Persistence Publish Settings (Headless, Targets) across all tabs
 */
function initGlobalPublishSettingsSync() {
  const syncGroups = [
    {
      key: 'pub_pref_headless',
      ids: ['quick-headless', 'quick-manuscript-headless', 'quick-pasted-headless', 'blog-trends-headless', 'blog-batch-headless', 'shopping-quick-headless', 'shopping-batch-headless', 'shopping-publish-auto-headless', 'blog-publish-auto-headless'],
      type: 'checkbox',
      default: true
    },
    {
      key: 'pub_pref_target_naver',
      ids: ['quick-target-naver', 'quick-manuscript-target-naver', 'quick-pasted-target-naver', 'blog-batch-target-naver', 'shopping-quick-target-naver', 'shopping-batch-target-naver', 'blog-publish-auto-target-naver', 'shopping-publish-auto-target-naver'],
      type: 'checkbox',
      default: true
    },
    {
      key: 'pub_pref_target_wordpress',
      ids: ['quick-target-wordpress', 'quick-manuscript-target-wordpress', 'quick-pasted-target-wordpress', 'blog-batch-target-wordpress', 'shopping-quick-target-wordpress', 'shopping-batch-target-wordpress', 'blog-publish-auto-target-wordpress', 'shopping-publish-auto-target-wordpress'],
      type: 'checkbox',
      default: false
    },
    {
      key: 'pub_pref_image_generation',
      ids: ['quick-image-generation', 'quick-manuscript-image-generation', 'quick-pasted-image-generation'], // extensible
      type: 'checkbox',
      default: false
    },
    {
      key: 'pub_pref_external_reference',
      ids: ['quick-external-reference'], // extensible
      type: 'checkbox',
      default: true
    },
    {
      key: 'last_quick_naver_category',
      ids: ['quick-naver-category', 'quick-manuscript-naver-category', 'quick-pasted-naver-category'],
      type: 'input',
      default: ''
    },
    {
      key: 'last_quick_wp_category',
      ids: ['quick-wp-category', 'quick-manuscript-wp-category', 'quick-pasted-wp-category'],
      type: 'input',
      default: ''
    }
  ].filter(Boolean);

  // Helper to update all elements in a group
  const updateGroupUi = (group, value) => {
    group.ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (group.type === 'checkbox') {
        el.checked = (value === 'true' || value === true);
      } else {
        el.value = value;
      }
    });
    // Special Trigger: If WP target changed, sync WP options visibility
    if (group.key === 'pub_pref_target_wordpress') {
      if (typeof toggleQuickWpOptions === 'function') toggleQuickWpOptions();
      if (typeof toggleShoppingQuickWpOptions === 'function') toggleShoppingQuickWpOptions();
    }
  };

  // 1. Initial Load & Apply
  syncGroups.forEach(group => {
    let saved = localStorage.getItem(group.key);
    if (saved === null) {
      saved = String(group.default);
      localStorage.setItem(group.key, saved);
    }
    updateGroupUi(group, saved);
  });

  // 2. Event Listeners for Syncing
  syncGroups.forEach(group => {
    group.ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener('change', () => {
        const newValue = (group.type === 'checkbox') ? el.checked : el.value;
        localStorage.setItem(group.key, String(newValue));
        updateGroupUi(group, newValue);
      });
    });
  });

  // 3. Keep other Quick Publish specific options that are not shared but need persistence
  const quickSpecific = [
    { key: 'last_quick_wp_post_status', id: 'quick-wp-post-status', type: 'select', default: 'publish' },
    { key: 'last_quick_wp_schedule_date', id: 'quick-wp-schedule-date', type: 'input', default: '' },
    { key: 'quick_manuscript_post_status', id: 'quick-manuscript-post-status', type: 'select', default: 'publish' },
    { key: 'quick_manuscript_schedule_date', id: 'quick-manuscript-schedule-date', type: 'input', default: '' },
    { key: 'quick_pasted_post_status', id: 'quick-pasted-post-status', type: 'select', default: 'publish' },
    { key: 'quick_pasted_schedule_date', id: 'quick-pasted-schedule-date', type: 'input', default: '' },
    { key: 'shopping_quick_wp_post_status', id: 'shopping-quick-wp-post-status', type: 'select', default: 'publish' },
    { key: 'shopping_quick_wp_schedule_date', id: 'shopping-quick-wp-schedule-date', type: 'input', default: '' }
  ];

  quickSpecific.forEach(item => {
    const el = document.getElementById(item.id);
    if (!el) return;

    // Restore
    const saved = localStorage.getItem(item.key);
    if (saved !== null) el.value = saved;
    else if (item.default) el.value = item.default;

    // Listener
    el.addEventListener('change', () => {
      localStorage.setItem(item.key, el.value);
      if (item.id === 'quick-wp-post-status' && typeof toggleQuickWpScheduleDate === 'function') {
        toggleQuickWpScheduleDate();
      } else if (item.id === 'quick-manuscript-post-status' && typeof window.toggleQuickManuscriptScheduleDate === 'function') {
        window.toggleQuickManuscriptScheduleDate();
      } else if (item.id === 'quick-pasted-post-status' && typeof window.toggleQuickPastedScheduleDate === 'function') {
        window.toggleQuickPastedScheduleDate();
      } else if (item.id === 'shopping-quick-wp-post-status' && typeof toggleShoppingQuickWpScheduleDate === 'function') {
        toggleShoppingQuickWpScheduleDate();
      }
    });
  });

  // Initial dependency sync
  if (typeof toggleQuickWpScheduleDate === 'function') toggleQuickWpScheduleDate();
  if (typeof window.toggleQuickManuscriptScheduleDate === 'function') window.toggleQuickManuscriptScheduleDate();
  if (typeof window.toggleQuickPastedScheduleDate === 'function') window.toggleQuickPastedScheduleDate();
}

// Shopping Connect Quick Publish WP Helpers
window.toggleShoppingQuickWpOptions = function () {
  const panel = document.getElementById('shopping-quick-wp-options-panel');
  const checkbox = document.getElementById('shopping-quick-target-wordpress');

  if (panel && checkbox) {
    panel.style.display = checkbox.checked ? 'block' : 'none';
  }
};

window.toggleShoppingQuickWpScheduleDate = function () {
  const input = document.getElementById('shopping-quick-wp-schedule-date');
  const status = document.getElementById('shopping-quick-wp-post-status')?.value;
  if (!input) return;

  const isSchedule = status === 'schedule';
  input.disabled = !isSchedule;

  if (isSchedule && !input.value) {
    // 현재 시간 + 10분을 기본값으로 설정
    const now = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const defaultVal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    input.value = defaultVal;
  }
};

// Shopping quick publish - localStorage 지속
function initShoppingQuickCategoryPersistence() {
  const naverCatEl = document.getElementById('shopping-quick-naver-category');
  const wpCatEl = document.getElementById('shopping-quick-wp-category');

  if (naverCatEl) {
    const saved = localStorage.getItem('last_shopping_quick_naver_category') || '';
    naverCatEl.value = saved;
    naverCatEl.addEventListener('input', () => {
      localStorage.setItem('last_shopping_quick_naver_category', naverCatEl.value.trim());
    });
  }

  if (wpCatEl) {
    const saved = localStorage.getItem('last_shopping_quick_wp_category') || '';
    wpCatEl.value = saved;
    wpCatEl.addEventListener('input', () => {
      localStorage.setItem('last_shopping_quick_wp_category', wpCatEl.value.trim());
    });
  }
}
