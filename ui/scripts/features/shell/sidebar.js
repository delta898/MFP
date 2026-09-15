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
const SIDEBAR_TOOLTIP_ID = 'sidebar-menu-tooltip';
let sidebarTooltipTarget = null;

function isCollapsedSidebarTooltipEnabled() {
  return window.innerWidth > 960 && document.getElementById('sidebar')?.classList.contains('collapsed');
}

function getSidebarTooltip() {
  let tooltip = document.getElementById(SIDEBAR_TOOLTIP_ID);
  if (tooltip) return tooltip;

  tooltip = document.createElement('div');
  tooltip.id = SIDEBAR_TOOLTIP_ID;
  tooltip.className = 'sidebar-menu-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function hideCollapsedSidebarTooltip() {
  const tooltip = document.getElementById(SIDEBAR_TOOLTIP_ID);
  if (sidebarTooltipTarget) sidebarTooltipTarget.removeAttribute('aria-describedby');
  sidebarTooltipTarget = null;
  if (tooltip) tooltip.hidden = true;
}

function showCollapsedSidebarTooltip(item) {
  if (!isCollapsedSidebarTooltipEnabled()) return;
  const label = item.querySelector('.nav-label')?.textContent?.trim();
  if (!label) return;

  const tooltip = getSidebarTooltip();
  tooltip.textContent = label;
  tooltip.hidden = false;
  const itemRect = item.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.min(itemRect.right + 10, window.innerWidth - tooltipRect.width - 12);
  const top = Math.max(12, Math.min(
    itemRect.top + ((itemRect.height - tooltipRect.height) / 2),
    window.innerHeight - tooltipRect.height - 12
  ));
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  sidebarTooltipTarget = item;
  item.setAttribute('aria-describedby', SIDEBAR_TOOLTIP_ID);
}

function bindCollapsedSidebarTooltip(item) {
  if (item.dataset.sidebarTooltipBound === 'true') return;
  item.dataset.sidebarTooltipBound = 'true';
  item.addEventListener('pointerenter', () => showCollapsedSidebarTooltip(item));
  item.addEventListener('pointerleave', hideCollapsedSidebarTooltip);
  item.addEventListener('focus', () => showCollapsedSidebarTooltip(item));
  item.addEventListener('blur', hideCollapsedSidebarTooltip);
}

function syncCollapsedSidebarTooltips() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  hideCollapsedSidebarTooltip();
  sidebar.querySelectorAll('.nav-btn, .nav-link-btn').forEach((item) => {
    const label = item.querySelector('.nav-label')?.textContent?.trim();
    if (!label) return;

    item.setAttribute('aria-label', label);
    item.removeAttribute('title');
    bindCollapsedSidebarTooltip(item);
  });
}

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
      syncCollapsedSidebarTooltips();
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
  syncCollapsedSidebarTooltips();
  window.addEventListener('resize', syncCollapsedSidebarTooltips);
  void refreshSidebarDynamicContent();
}
