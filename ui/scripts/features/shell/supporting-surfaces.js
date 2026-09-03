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

function selectHalfHourCycleSurfaceBlock(blocks, surface, region) {
  if (!Array.isArray(blocks) || !blocks.length) return null;
  const halfHourSlot = Math.floor(Date.now() / (30 * 60 * 1000));
  const source = `${getSurfaceRotationSeed()}|${surface}|${region}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const installationOffset = Math.abs(hash >>> 0) % blocks.length;
  return blocks[(installationOffset + halfHourSlot) % blocks.length] || blocks[0];
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
  const stateKey = `${surface}|${configs.map((config) => `${config.region}:${config.elementId}`).join(',')}`;
  const state = supportingSurfaceStates.get(stateKey) || { signature: null, pending: null };
  supportingSurfaceStates.set(stateKey, state);
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
          selected: config.selection === 'half_hour_cycle'
            ? selectHalfHourCycleSurfaceBlock(blocks, surface, config.region)
            : config.selection === 'daily_cycle'
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

function initDashboardBetaDynamicContent() {
  const refresh = refreshSupportingSurfaceContent('dashboard', [{
    region: 'recommendations',
    elementId: 'dashboard-beta-tips-region',
    visibilityElementId: 'dashboard-beta-tips-section',
    selection: 'half_hour_cycle'
  }]);
  scheduleDashboardBetaSurfaceRotation();
  return refresh;
}

let dashboardBetaSurfaceRotationTimer = null;

function scheduleDashboardBetaSurfaceRotation() {
  if (dashboardBetaSurfaceRotationTimer) clearTimeout(dashboardBetaSurfaceRotationTimer);
  const intervalMs = 30 * 60 * 1000;
  const delayMs = intervalMs - (Date.now() % intervalMs) + 250;
  dashboardBetaSurfaceRotationTimer = setTimeout(async () => {
    dashboardBetaSurfaceRotationTimer = null;
    const dashboard = document.getElementById('view-dashboard-beta');
    if (!dashboard?.classList.contains('active')) return;
    await refreshSupportingSurfaceContent('dashboard', [{
      region: 'recommendations',
      elementId: 'dashboard-beta-tips-region',
      visibilityElementId: 'dashboard-beta-tips-section',
      selection: 'half_hour_cycle'
    }]);
    scheduleDashboardBetaSurfaceRotation();
  }, delayMs);
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
