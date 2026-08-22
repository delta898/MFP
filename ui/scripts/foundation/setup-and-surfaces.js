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

