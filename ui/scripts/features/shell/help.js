let helpCatalogSignature = null;
let helpCatalogPending = null;
const helpLocalRegionMarkup = new Map();

function normalizeHelpGuideUrl(value) {
  return String(value || '')
    .trim()
    .replace(/^https:\/\/blog\.naver\.com\//i, 'https://m.blog.naver.com/');
}

async function navigateToHelpGuide(targetUrl) {
  const url = normalizeHelpGuideUrl(targetUrl);
  if (!url) return false;
  await navigateTo('help');
  await refreshHelpCatalog();
  const guide = Array.from(document.querySelectorAll('#view-help a[href]'))
    .find((element) => normalizeHelpGuideUrl(element.getAttribute('href')) === url);
  if (!guide) return false;
  guide.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth', block: 'center' });
  guide.classList.remove('help-guide-navigation-target');
  void guide.offsetWidth;
  guide.classList.add('help-guide-navigation-target');
  setTimeout(() => guide.classList.remove('help-guide-navigation-target'), 1800);
  return true;
}

function captureHelpLocalFallbacks(view) {
  [
    'help-getting-started-region',
    'help-writing-region',
    'help-automation-region',
  ].forEach((regionId) => {
    const region = view.querySelector(`#${regionId}`);
    if (region && !helpLocalRegionMarkup.has(regionId)) {
      helpLocalRegionMarkup.set(regionId, region.innerHTML);
    }
  });
}

function restoreHelpLocalFallback(element) {
  if (!element || !helpLocalRegionMarkup.has(element.id)) return false;
  const markup = helpLocalRegionMarkup.get(element.id);
  if (element.innerHTML !== markup) element.innerHTML = markup;
  return true;
}

function createHelpCatalogCopy(block) {
  const copy = document.createElement('span');
  copy.className = 'help-catalog-copy';
  const title = document.createElement('strong');
  title.textContent = block.title;
  const detail = document.createElement('small');
  detail.textContent = block.ctaLabel || '공식 가이드 보기';
  copy.append(title, detail);
  return copy;
}

function createHelpCatalogLink(block) {
  const link = document.createElement('a');
  link.href = block.targetUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.dataset.dynamicBlock = block.id;
  link.title = block.disclosure ? `${block.title} · ${block.disclosure}` : block.title;
  link.appendChild(createHelpCatalogCopy(block));
  const arrow = document.createElement('span');
  arrow.className = 'help-link-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '↗';
  link.appendChild(arrow);
  return link;
}

function renderHelpGuideRegion(element, blocks, options = {}) {
  if (!element) return false;
  if (!Array.isArray(blocks) || !blocks.length) {
    return restoreHelpLocalFallback(element);
  }
  const fragment = document.createDocumentFragment();
  blocks.forEach((block, index) => {
    const link = createHelpCatalogLink(block);
    if (options.numbered) {
      const number = document.createElement('span');
      number.className = 'ui-sequence-badge';
      number.textContent = String(index + 1);
      link.insertBefore(number, link.firstChild);
      const item = document.createElement('li');
      item.appendChild(link);
      fragment.appendChild(item);
    } else {
      fragment.appendChild(link);
    }
  });
  element.replaceChildren(fragment);
  return true;
}

function createHelpSupportingCard(block) {
  const link = createHelpCatalogLink(block);
  link.className = `help-supporting-card help-supporting-card-${block.kind}`;
  const visual = document.createElement('span');
  visual.className = 'help-supporting-icon';
  if (block.media?.url && block.kind !== 'support') {
    const image = document.createElement('img');
    image.src = block.media.url;
    image.alt = block.media.alt || '';
    image.width = 38;
    image.height = 38;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.remove();
      visual.appendChild(createSidebarDynamicIcon(block.icon));
    }, { once: true });
    visual.appendChild(image);
  } else {
    visual.appendChild(createSidebarDynamicIcon(block.icon));
  }
  link.insertBefore(visual, link.firstChild);
  return link;
}

function renderHelpSupportingRegion(blocks) {
  const section = document.getElementById('help-supporting-section');
  const region = document.getElementById('help-supporting-region');
  if (!section || !region) return false;
  if (!Array.isArray(blocks) || !blocks.length) {
    region.replaceChildren();
    section.hidden = true;
    return false;
  }
  region.replaceChildren(...blocks.map(createHelpSupportingCard));
  section.hidden = false;
  return true;
}

async function refreshHelpCatalog() {
  if (helpCatalogPending) return helpCatalogPending;
  helpCatalogPending = (async () => {
    try {
      const payload = await fetchJson('/api/v1/surface-content/help');
      const regions = payload?.regions || {};
      const signature = JSON.stringify(regions);
      if (signature === helpCatalogSignature) return;

      renderHelpGuideRegion(
        document.getElementById('help-getting-started-region'),
        regions.getting_started?.blocks,
        { numbered: true }
      );
      renderHelpGuideRegion(
        document.getElementById('help-writing-region'),
        regions.writing?.blocks
      );
      renderHelpGuideRegion(
        document.getElementById('help-automation-region'),
        regions.automation?.blocks
      );
      renderHelpSupportingRegion(regions.supporting?.blocks);
      helpCatalogSignature = signature;
    } catch (error) {
      console.debug('[SurfaceContent] Help catalog unavailable; keeping local guides:', error.message);
    }
  })();

  try {
    return await helpCatalogPending;
  } finally {
    helpCatalogPending = null;
  }
}

function initHelpView() {
  const view = document.getElementById('view-help');
  if (!view) return;

  captureHelpLocalFallbacks(view);

  if (view.dataset.initialized !== 'true') {
    view.querySelectorAll('[data-help-nav]').forEach((button) => {
      button.addEventListener('click', () => {
        void navigateTo(button.dataset.helpNav, button.dataset.helpTab || undefined);
      });
    });
    view.dataset.initialized = 'true';
  }

  void refreshHelpCatalog();
}
