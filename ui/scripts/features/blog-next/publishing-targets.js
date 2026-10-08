const BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY = 'blog_next_publish_settings_by_target_v1';
const blogNextPublishSettingsByTarget = new Map();
try {
  const savedPublishSettings = JSON.parse(sessionStorage.getItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY) || '{}');
  if (savedPublishSettings && typeof savedPublishSettings === 'object' && !Array.isArray(savedPublishSettings)) {
    Object.entries(savedPublishSettings).forEach(([key, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      blogNextPublishSettingsByTarget.set(key, {
        category: String(value.category || ''),
        postStatus: ['publish', 'draft', 'schedule'].includes(value.postStatus) ? value.postStatus : 'publish',
        scheduleDate: String(value.scheduleDate || '')
      });
    });
  }
} catch (_error) {
  // Session storage may be unavailable; the in-memory Map remains the fallback.
}
let blogNextActivePublishSettingsKey = '';
let blogNextTopicEditingSettingsContext = null;

function beginBlogNextTopicEditingSettingsContext() {
  if (blogNextTopicEditingSettingsContext) return;
  if (blogNextActivePublishSettingsKey && typeof captureBlogNextPublishingTargetSettings === 'function') {
    captureBlogNextPublishingTargetSettings('ai');
  }
  const controls = ['blog-next-target-naver', 'blog-next-target-wordpress', 'blog-next-target-site-hosting',
    'blog-next-site-hosting-select', 'blog-next-category', 'blog-next-naver-category', 'blog-next-wordpress-category',
    'blog-next-vault-folder-select', 'blog-next-post-status', 'blog-next-schedule-date', 'blog-next-runner-headless'];
  const values = {};
  controls.forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    values[id] = element.type === 'checkbox' || element.type === 'radio'
      ? { checked: element.checked, disabled: element.disabled }
      : { value: element.value, disabled: element.disabled };
  });
  blogNextTopicEditingSettingsContext = {
    values,
    publishSettingsOpen: getBlogNextSettingsElement('blog-next-publish-settings')?.open ?? false,
    map: new Map([...blogNextPublishSettingsByTarget].map(([key, value]) => [key, { ...value }])),
    activeKey: blogNextActivePublishSettingsKey,
    sessionValue: (() => { try { return sessionStorage.getItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY); } catch (_) { return null; } })()
  };
  blogNextPublishSettingsByTarget.clear();
  blogNextActivePublishSettingsKey = '';
  try { sessionStorage.removeItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY); } catch (_) { /* best effort */ }
}

function endBlogNextTopicEditingSettingsContext() {
  const context = blogNextTopicEditingSettingsContext;
  if (!context) return;
  Object.entries(context.values).forEach(([id, state]) => {
    const element = document.getElementById(id);
    if (!element) return;
    if (Object.hasOwn(state, 'checked')) element.checked = state.checked;
    if (Object.hasOwn(state, 'value')) element.value = state.value;
    element.disabled = state.disabled;
  });
  const settings = getBlogNextSettingsElement('blog-next-publish-settings');
  if (settings) settings.open = context.publishSettingsOpen;
  blogNextPublishSettingsByTarget.clear();
  context.map.forEach((value, key) => blogNextPublishSettingsByTarget.set(key, { ...value }));
  blogNextActivePublishSettingsKey = context.activeKey;
  try {
    if (context.sessionValue === null) sessionStorage.removeItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY);
    else sessionStorage.setItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY, context.sessionValue);
  } catch (_) { /* in-memory values remain authoritative */ }
  blogNextTopicEditingSettingsContext = null;
  if (typeof syncBlogNextDraftSchedule === 'function') syncBlogNextDraftSchedule('ai');
  if (typeof syncBlogNextDraftSettingsSummary === 'function') syncBlogNextDraftSettingsSummary('ai');
}

function readBlogNextDraftSettings(type) {
  const targets = [];
  if (blogNextDraftField(type, 'target-naver')?.checked) targets.push('naver');
  if (blogNextDraftField(type, 'target-wordpress')?.checked) targets.push('wordpress');
  if (blogNextDraftField(type, 'target-site-hosting')?.checked) targets.push('site-hosting');
  const siteOption = getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0];
  const vaultFolder = getBlogNextSettingsElement('blog-next-vault-folder-select');
  const siteKey = siteOption?.dataset.projectId && siteOption?.dataset.siteId
    ? `${siteOption.dataset.projectId}/${siteOption.dataset.siteId}` : '';
  return {
    targets,
    siteProjectId: siteOption?.dataset.projectId || '',
    siteId: siteOption?.dataset.siteId || '',
    siteKind: siteOption?.dataset.siteKind || '',
    destinationPath: siteOption?.dataset.siteKind === 'vault'
      && vaultFolder?.dataset.siteKey === siteKey
      && vaultFolder.selectedOptions?.[0]?.value
      ? vaultFolder.value : '',
    naverCategory: targets.includes('naver') ? getBlogNextSettingsElement('blog-next-category')?.value?.trim() || '' : '',
    wordpressCategory: targets.includes('wordpress') ? getBlogNextSettingsElement('blog-next-category')?.value?.trim() || '' : '',
    postStatus: blogNextDraftField(type, 'post-status')?.value || 'publish',
    scheduleDate: blogNextDraftField(type, 'schedule-date')?.value || '',
    headless: targets.includes('naver') && blogNextDraftField(type, 'headless')?.checked !== false,
    imageMode: 'prompt_only'
  };
}

function getBlogNextPublishingTargetKey(type) {
  const settings = getBlogNextSettingsElement('blog-next-publish-settings');
  const activeType = settings?.dataset.blogNextDraftSettings || type || 'ai';
  if (blogNextDraftField(activeType, 'target-naver')?.checked) return 'naver';
  if (blogNextDraftField(activeType, 'target-wordpress')?.checked) return 'wordpress';
  if (blogNextDraftField(activeType, 'target-site-hosting')?.checked) {
    const option = getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0];
    return option?.dataset.projectId && option?.dataset.siteId
      ? `site-hosting:${option.dataset.projectId}/${option.dataset.siteId}`
      : 'site-hosting:unselected';
  }
  return '';
}

function getBlogNextSiteCategoryValue() {
  const option = getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0];
  if (!option?.dataset.siteId) return '';
  return option.dataset.siteKind === 'blog' ? String(option.dataset.listingRoute || '') : '';
}

function getBlogNextVaultFolderValue() {
  const siteOption = getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0];
  const folderSelect = getBlogNextSettingsElement('blog-next-vault-folder-select');
  const siteKey = siteOption?.dataset.projectId && siteOption?.dataset.siteId
    ? `${siteOption.dataset.projectId}/${siteOption.dataset.siteId}` : '';
  return siteOption?.dataset.siteKind === 'vault' && folderSelect?.dataset.siteKey === siteKey
    ? String(folderSelect.value || '') : '';
}

function captureBlogNextPublishingTargetSettings(type) {
  if (!blogNextActivePublishSettingsKey) return;
  const category = getBlogNextSettingsElement('blog-next-category');
  const status = blogNextDraftField(type, 'post-status');
  const scheduleDate = blogNextDraftField(type, 'schedule-date');
  const current = blogNextPublishSettingsByTarget.get(blogNextActivePublishSettingsKey) || {};
  blogNextPublishSettingsByTarget.set(blogNextActivePublishSettingsKey, {
    ...current,
    category: blogNextActivePublishSettingsKey.startsWith('site-hosting:')
      ? (getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0]?.dataset.siteKind === 'vault'
        ? getBlogNextVaultFolderValue() || current.category || '' : getBlogNextSiteCategoryValue())
      : category?.value || '',
    postStatus: status?.value || 'publish',
    scheduleDate: scheduleDate?.value || ''
  });
  try {
    sessionStorage.setItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY, JSON.stringify(Object.fromEntries(blogNextPublishSettingsByTarget)));
  } catch (_error) {
    // Session storage may be unavailable; keep the current values in memory.
  }
  const legacyCategory = blogNextActivePublishSettingsKey === 'naver' ? 'blog-next-naver-category'
    : blogNextActivePublishSettingsKey === 'wordpress' ? 'blog-next-wordpress-category' : '';
  if (legacyCategory && category) {
      const legacy = getBlogNextSettingsElement(legacyCategory);
    if (legacy) legacy.value = category.value;
  }
}

function syncBlogNextPublishingTargetSettings(type, { force = false, restoreStored = false } = {}) {
  const nextKey = getBlogNextPublishingTargetKey(type);
  if (!nextKey) return;
  if (!force && nextKey === blogNextActivePublishSettingsKey) {
    captureBlogNextPublishingTargetSettings(type);
    return;
  }
  if (!restoreStored) captureBlogNextPublishingTargetSettings(type);
  const stored = blogNextPublishSettingsByTarget.get(nextKey);
  const category = getBlogNextSettingsElement('blog-next-category');
  const categoryField = getBlogNextSettingsElement('blog-next-category-field');
  const categoryLabel = getBlogNextSettingsElement('blog-next-category-label');
  const vaultControl = getBlogNextSettingsElement('blog-next-vault-folder-control');
  const vaultSelect = getBlogNextSettingsElement('blog-next-vault-folder-select');
  const status = blogNextDraftField(type, 'post-status');
  const scheduleDate = blogNextDraftField(type, 'schedule-date');
  const target = nextKey.startsWith('site-hosting:') ? 'site-hosting' : nextKey;
  const legacyCategory = target === 'naver' ? 'blog-next-naver-category'
    : target === 'wordpress' ? 'blog-next-wordpress-category' : '';
  const defaultCategory = legacyCategory ? getBlogNextSettingsElement(legacyCategory)?.value || '' : '';
  const siteCategory = target === 'site-hosting' ? getBlogNextSiteCategoryValue() : '';
  const selectedSiteOption = getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0];
  const isVault = target === 'site-hosting' && selectedSiteOption?.dataset.siteKind === 'vault';
  if (category) {
    category.value = target === 'site-hosting' && !isVault ? siteCategory : stored?.category ?? defaultCategory;
    category.readOnly = target === 'site-hosting' && !isVault;
    category.disabled = false;
    category.hidden = isVault;
    category.placeholder = target === 'site-hosting' && !isVault
      ? (siteCategory ? '' : '사이트를 선택하세요')
      : target === 'wordpress' ? '예: Daily' : '비우면 기본 카테고리';
  }
  if (categoryField) categoryField.dataset.vaultTarget = String(isVault);
  if (vaultControl) vaultControl.hidden = !isVault;
  if (categoryLabel) {
    categoryLabel.htmlFor = getBlogNextSettingsElement(isVault ? 'blog-next-vault-folder-choose' : 'blog-next-category')?.id || '';
    categoryLabel.hidden = false;
  }
  if (isVault && vaultSelect) {
    const siteKey = `${selectedSiteOption.dataset.projectId}/${selectedSiteOption.dataset.siteId}`;
    const needsLoad = vaultSelect.dataset.siteKey !== siteKey;
    const folderPicker = getBlogNextSettingsElement('blog-next-vault-folder-choose');
    if (needsLoad) {
      vaultSelect.disabled = true;
      if (folderPicker) folderPicker.disabled = true;
      vaultSelect.replaceChildren(new Option('Vault 폴더를 불러오는 중입니다.', '', true, true));
      vaultSelect.value = '';
      Promise.resolve().then(() => loadBlogNextVaultFolders({ preserveSelection: true }));
    } else {
      vaultSelect.disabled = vaultSelect.dataset.loadFailed === 'true' || vaultSelect.options.length <= 1;
      if (folderPicker) folderPicker.disabled = vaultSelect.disabled;
    }
    if (vaultSelect.dataset.siteKey === siteKey && stored?.category) {
      vaultSelect.value = stored.category;
      if (vaultSelect.value !== stored.category) {
        stored.category = '';
        blogNextPublishSettingsByTarget.set(nextKey, stored);
      }
    }
  } else if (target === 'site-hosting' && vaultSelect?.dataset.siteKey) {
    Promise.resolve().then(() => loadBlogNextVaultFolders({ preserveSelection: false }));
  }
  const siteHint = getBlogNextSettingsElement('blog-next-site-category-hint');
  if (categoryLabel) {
    categoryLabel.innerHTML = target === 'naver' ? '네이버 카테고리 <small>(선택)</small>'
      : target === 'wordpress' ? '워드프레스 카테고리 <small>(선택)</small>'
        : isVault ? 'Vault 저장 폴더' : '카테고리';
  }
  if (siteHint) {
    siteHint.hidden = target !== 'site-hosting' || !isVault;
    siteHint.textContent = isVault ? '연결된 Vault root 아래 폴더에 원고를 저장합니다.' : '';
  }
  const desiredStatus = stored?.postStatus || (target === 'naver' && !blogNextActivePublishSettingsKey ? status?.value || 'publish' : 'publish');
  const validStatuses = target === 'site-hosting' ? ['publish', 'draft'] : ['publish', 'draft', 'schedule'];
  if (status) status.value = validStatuses.includes(desiredStatus) ? desiredStatus : 'publish';
  if (scheduleDate) scheduleDate.value = stored?.scheduleDate || (target === 'naver' && !blogNextActivePublishSettingsKey ? scheduleDate.value : '');
  blogNextActivePublishSettingsKey = nextKey;
  if (stored) {
    if (target !== 'site-hosting' || !isVault) stored.category = target === 'site-hosting' ? siteCategory : category?.value || '';
    stored.postStatus = status?.value || 'publish';
    stored.scheduleDate = scheduleDate?.value || '';
  } else {
    captureBlogNextPublishingTargetSettings(type);
  }
}

function syncBlogNextDraftSettingsSummary(type) {
  const summary = getBlogNextSettingsElement('blog-next-publish-settings-summary');
  if (!summary) return;
  const settings = readBlogNextDraftSettings(type);
  const statusLabel = settings.postStatus === 'draft' ? '임시 저장'
    : settings.postStatus === 'schedule' ? '예약 발행' : '즉시 발행';
  let targetLabel = formatBlogPlatformList(settings.targets, ' + ') || '포스팅 대상 없음';
  let siteSelected = true;
  if (settings.targets.includes('site-hosting')) {
    const siteOption = getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0];
    siteSelected = Boolean(settings.siteProjectId && settings.siteId && siteOption && !siteOption.disabled);
    if (siteSelected) {
      const vaultFolder = getBlogNextSettingsElement('blog-next-vault-folder-select');
      const siteKey = `${settings.siteProjectId}/${settings.siteId}`;
      if (settings.siteKind === 'vault' && (vaultFolder?.dataset.siteKey !== siteKey || !vaultFolder.value)) {
        targetLabel = '저장 폴더 선택 필요';
        siteSelected = false;
      } else {
        targetLabel = siteOption.textContent.trim();
        if (settings.siteKind === 'vault') targetLabel += ` · ${vaultFolder.selectedOptions[0].textContent.trim()}`;
      }
    } else {
      targetLabel = '사이트 선택 필요';
    }
  }
  const parts = [targetLabel];
  if (siteSelected) parts.push(statusLabel);
  if (settings.targets.includes('naver')) {
    parts.push(settings.headless ? '보이지 않게 실행' : '브라우저 표시');
  }
  summary.textContent = parts.join(' · ');
}

function isBlogNextSiteHostingTarget(type) {
  return readBlogNextDraftSettings(type).targets.includes('site-hosting');
}

function setBlogNextSiteHostingMessage(message, state = '') {
  const element = getBlogNextSettingsElement('blog-next-site-hosting-message');
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

function setBlogNextVaultFolderMessage(message, state = '') {
  const element = getBlogNextSettingsElement('blog-next-site-category-hint');
  if (!element) return;
  element.textContent = message;
  element.dataset.state = state;
}

function syncBlogNextVaultFolderDisplay(select) {
  const display = getBlogNextSettingsElement('blog-next-vault-folder-value');
  if (!display || !select) return;
  const selected = select.selectedOptions?.[0];
  const hasValue = Boolean(selected?.value);
  display.dataset.empty = String(!hasValue);
  const text = display.querySelector('span');
  if (text) text.textContent = hasValue ? selected.textContent.trim() : '폴더를 선택하세요';
}

async function loadBlogNextVaultFolders({ preserveSelection = true } = {}) {
  const siteSelect = getBlogNextSettingsElement('blog-next-site-hosting-select');
  const folderControl = getBlogNextSettingsElement('blog-next-vault-folder-control');
  const folderSelect = getBlogNextSettingsElement('blog-next-vault-folder-select');
  const folderPicker = getBlogNextSettingsElement('blog-next-vault-folder-choose');
  const siteOption = siteSelect?.selectedOptions?.[0];
  if (!folderControl || !folderSelect || !siteOption || siteOption.dataset.siteKind !== 'vault') {
    if (folderControl) folderControl.hidden = true;
    if (folderSelect) {
      folderSelect.disabled = true;
      folderSelect.dataset.siteKey = '';
      folderSelect.replaceChildren(new Option('폴더를 선택하세요', '', true, true));
    }
    if (folderPicker) folderPicker.disabled = true;
    return null;
  }
  const { projectId = '', siteId = '' } = siteOption.dataset;
  const siteKey = `${projectId}/${siteId}`;
  const settings = blogNextPublishSettingsByTarget.get(`site-hosting:${siteKey}`) || {};
  const currentValue = folderSelect.dataset.siteKey === siteKey ? folderSelect.value : '';
  const folderSelectWasForThisSite = folderSelect.dataset.siteKey === siteKey;
  const previousValue = preserveSelection
    ? (folderSelectWasForThisSite ? currentValue : settings.category || '') : '';
  folderControl.hidden = false;
  folderSelect.disabled = true;
  delete folderSelect.dataset.loadFailed;
  if (folderPicker) {
    folderPicker.disabled = true;
    folderPicker.setAttribute('aria-busy', 'true');
  }
  folderSelect.replaceChildren(new Option('Vault 폴더를 불러오는 중입니다.', '', true, true));
  setBlogNextVaultFolderMessage('Vault 폴더 목록을 불러오는 중입니다.');
  try {
    const response = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(projectId)}/sites/${encodeURIComponent(siteId)}/vault-folders`);
    const folders = Array.isArray(response?.folders) ? response.folders : [];
    const options = [new Option('폴더를 선택하세요', '', true, true)];
    for (const folder of folders) {
      const value = String(folder?.path || '');
      if (!value) continue;
      const label = value === '.' ? `${response.root_name || folder.name || 'Vault root'} (Vault root)` : value;
      options.push(new Option(label, value));
    }
    folderSelect.replaceChildren(...options);
    folderSelect.dataset.siteKey = siteKey;
    const matchingOption = Array.from(folderSelect.options).find((candidate) => candidate.value === previousValue && previousValue !== '');
    if (matchingOption) matchingOption.selected = true;
    syncBlogNextVaultFolderDisplay(folderSelect);
    if (matchingOption) {
      settings.category = matchingOption.value;
      if (folderSelect.dataset.siteKey === siteKey) {
        const activeKey = getBlogNextPublishingTargetKey(BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai');
        if (activeKey === `site-hosting:${siteKey}`) {
          const status = blogNextDraftField(BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai', 'post-status');
          const schedule = blogNextDraftField(BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai', 'schedule-date');
          if (status) settings.postStatus = status.value || 'publish';
          if (schedule) settings.scheduleDate = schedule.value || '';
        }
      }
      blogNextPublishSettingsByTarget.set(`site-hosting:${siteKey}`, settings);
      try { sessionStorage.setItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY, JSON.stringify(Object.fromEntries(blogNextPublishSettingsByTarget))); }
      catch (_error) { /* Keep the current values in memory when session storage is unavailable. */ }
    }
    const lostSelection = Boolean(previousValue && !matchingOption);
    if (lostSelection) {
      settings.category = '';
      blogNextPublishSettingsByTarget.set(`site-hosting:${siteKey}`, settings);
      try { sessionStorage.setItem(BLOG_NEXT_PUBLISH_SETTINGS_SESSION_KEY, JSON.stringify(Object.fromEntries(blogNextPublishSettingsByTarget))); }
      catch (_error) { /* Keep the current values in memory when session storage is unavailable. */ }
      setBlogNextVaultFolderMessage('선택한 Vault 폴더를 찾지 못했습니다. 다시 선택해 주세요.', 'error');
    } else if (!folders.length) {
      setBlogNextVaultFolderMessage('선택할 수 있는 Vault 폴더가 없습니다.', 'error');
    } else {
      setBlogNextVaultFolderMessage('연결된 Vault root 아래 폴더에 원고를 저장합니다.');
    }
    folderSelect.disabled = folders.length === 0;
    if (folderPicker) folderPicker.disabled = folders.length === 0
      || getBlogNextSettingsElement('blog-next-target-site-hosting')?.checked !== true;
    if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState();
    return response;
  } catch (error) {
    console.warn('[Blog Beta] Vault 폴더 조회 실패:', error);
    folderSelect.dataset.siteKey = siteKey;
    folderSelect.dataset.loadFailed = 'true';
    const retainedOptions = [new Option('폴더 목록 확인 실패', '', !previousValue, !previousValue)];
    if (previousValue) retainedOptions.push(new Option(previousValue === '.' ? 'Vault root (확인 필요)' : `${previousValue} (확인 필요)`, previousValue, true, true));
    folderSelect.replaceChildren(...retainedOptions);
    if (previousValue) {
      settings.category = previousValue;
      blogNextPublishSettingsByTarget.set(`site-hosting:${siteKey}`, settings);
    }
    folderSelect.disabled = true;
    syncBlogNextVaultFolderDisplay(folderSelect);
    if (folderPicker) folderPicker.disabled = true;
    setBlogNextVaultFolderMessage('Vault 폴더 목록을 확인하지 못했습니다. 선택 경로는 보존했으며, 폴더를 다시 고르거나 포스팅 시 서버에서 확인합니다.', 'error');
    return null;
  } finally {
    if (folderPicker) {
      folderPicker.disabled = getBlogNextSettingsElement('blog-next-target-site-hosting')?.checked !== true;
      folderPicker.setAttribute('aria-busy', 'false');
    }
    const type = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
    syncBlogNextDraftSettingsSummary(type);
    if (typeof syncBlogNextQuickFlowSummaries === 'function') syncBlogNextQuickFlowSummaries();
    if (typeof syncBlogNextTopicActionAvailability === 'function') syncBlogNextTopicActionAvailability();
    if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState();
  }
}

async function loadBlogNextSiteHostingTargets({ preserveSelection = true, selectedTarget = null } = {}) {
  const option = getBlogNextSettingsElement('blog-next-target-site-hosting-option');
  const input = blogNextDraftField('paste', 'target-site-hosting');
  const field = getBlogNextSettingsElement('blog-next-site-hosting-field');
  const select = getBlogNextSettingsElement('blog-next-site-hosting-select');
  const retry = getBlogNextSettingsElement('blog-next-site-hosting-retry');
  if (!option || !input || !field || !select) return [];
  const previous = select.selectedOptions?.[0];
  const previousProjectId = selectedTarget?.project_id || selectedTarget?.projectId
    || (preserveSelection ? previous?.dataset.projectId || '' : '');
  const previousSiteId = selectedTarget?.site_id || selectedTarget?.siteId
    || (preserveSelection ? previous?.dataset.siteId || '' : '');
  input.disabled = true;
  select.disabled = true;
  if (retry) {
    retry.disabled = true;
    retry.setAttribute('aria-busy', 'true');
  }
  setBlogNextSiteHostingMessage('사이트 목록을 불러오는 중입니다.');
  try {
    delete select.dataset.loadFailed;
    const projects = await fetchJson('/api/v1/site-hosting/projects');
    const list = Array.isArray(projects) ? projects : [];
    const groups = await Promise.all(list.filter((project) => project?.id).map(async (project) => ({
      project,
      sites: await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`)
    })));
    const sites = groups.flatMap(({ project, sites: projectSites }) => (Array.isArray(projectSites) ? projectSites : [])
      .filter((site) => site?.id)
      .map((site) => ({ ...site, project_name: project.name || '사이트 프로젝트' })));
    const options = [new Option('사이트를 선택하세요', '', true, true)];
    for (const site of sites) {
      const projectName = site.project_name;
      const eligible = site.posting_target?.eligible === true;
      const reason = String(site.posting_target?.reason || '');
      const optionLabel = `${site.name || '이름 없는 사이트'} · ${projectName}${eligible ? '' : ` — ${reason || '포스팅 조건 미충족'}`}`;
      const siteOption = new Option(optionLabel, String(options.length));
      siteOption.dataset.projectId = site.project_id || '';
      siteOption.dataset.siteId = site.id;
      siteOption.dataset.siteKind = String(site.posting_target?.kind || '');
      siteOption.dataset.listingRoute = String(site.posting_target?.listing_route || '');
      siteOption.disabled = !eligible;
      options.push(siteOption);
    }
    select.replaceChildren(...options);
    const selected = Array.from(select.options).find((candidate) =>
      candidate.dataset.projectId === previousProjectId && candidate.dataset.siteId === previousSiteId && !candidate.disabled);
    if (selected) selected.selected = true;
    if (!selected && selectedTarget && previousProjectId && previousSiteId) {
      const retained = new Option(`${previousSiteId} · 다시 선택 필요`, `retained:${previousSiteId}`);
      retained.dataset.projectId = previousProjectId;
      retained.dataset.siteId = previousSiteId;
      retained.dataset.siteKind = String(selectedTarget.kind || selectedTarget.site_kind || '');
      retained.disabled = true;
      select.add(retained);
      retained.selected = true;
    }
    const hadSelection = Boolean(previousProjectId && previousSiteId);
    const selectionLost = hadSelection && !selected;
    const eligibleCount = sites.filter((site) => site.posting_target?.eligible === true).length;
    input.disabled = eligibleCount === 0;
    select.disabled = false;
    if (selectionLost) {
      setBlogNextSiteHostingMessage('선택한 사이트가 삭제되었거나 포스팅 조건을 충족하지 않습니다. 다시 선택해 주세요.', 'error');
    } else if (!sites.length) {
      setBlogNextSiteHostingMessage('생성된 사이트가 없습니다. 사이트를 먼저 만들어 주세요.');
    } else {
      const disabledCount = sites.length - eligibleCount;
      setBlogNextSiteHostingMessage(disabledCount
        ? `포스팅 가능한 사이트 ${eligibleCount}개 · 포스팅할 수 없는 사이트 ${disabledCount}개는 사유와 함께 표시됩니다.`
        : `포스팅 가능한 사이트 ${eligibleCount}개`);
    }
    const activeType = BLOG_NEXT_DRAFT_TYPES.includes(blogNextActiveInputMode) ? blogNextActiveInputMode : 'ai';
    if (isBlogNextSiteHostingTarget(activeType)) {
      syncBlogNextPublishingTargetSettings(activeType, { force: true });
      syncBlogNextDraftProviderFields(activeType);
    }
    return sites;
  } catch (error) {
    console.warn('[Blog Beta] Site Hosting 대상 조회 실패:', error);
    select.dataset.loadFailed = 'true';
    if (selectedTarget && previousProjectId && previousSiteId) {
      const retained = new Option(`${previousSiteId} · 목록 확인 필요`, `retained:${previousSiteId}`, true, true);
      retained.dataset.projectId = previousProjectId;
      retained.dataset.siteId = previousSiteId;
      retained.dataset.siteKind = String(selectedTarget.kind || selectedTarget.site_kind || '');
      retained.disabled = true;
      select.replaceChildren(new Option('사이트 목록 확인 실패', ''), retained);
    }
    setBlogNextSiteHostingMessage('사이트 목록을 불러오지 못했습니다. 다시 시도해 주세요.', 'error');
    return null;
  } finally {
    if (retry) {
      retry.disabled = !input.checked;
      retry.setAttribute('aria-busy', 'false');
    }
    if (select.dataset.loadFailed === 'true') {
      input.disabled = false;
      select.disabled = select.options.length <= 1;
    } else {
      input.disabled = !Array.from(select.options).some((option) => option.dataset.siteId && !option.disabled);
      select.disabled = select.options.length <= 1;
    }
  }
}

function syncBlogNextSiteHostingOptions(type) {
  const topicEditor = typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null;
  const selected = isBlogNextSiteHostingTarget(type);
  const schedule = blogNextDraftField(type, 'post-status')?.querySelector('option[value="schedule"]');
  const preview = blogNextDraftState[type]?.preview;
  const unresolvedImages = Array.isArray(preview?.images)
    && preview.images.some((image) => !image.excluded && !image.exists && String(image.prompt || '').trim());
  if (schedule) schedule.disabled = selected || unresolvedImages;
  const status = blogNextDraftField(type, 'post-status');
  if (!topicEditor && selected && status?.value === 'schedule') {
    status.value = 'publish';
    captureBlogNextPublishingTargetSettings(type);
  }
  const category = getBlogNextSettingsElement('blog-next-category');
  if (category && selected) {
    const isVault = getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0]?.dataset.siteKind === 'vault';
    category.value = isVault ? '' : getBlogNextSiteCategoryValue();
    category.hidden = isVault;
    category.readOnly = !isVault;
    category.disabled = false;
  }
  syncBlogNextDraftSchedule(type);
}

function syncBlogNextDraftSchedule(type) {
  const field = getBlogNextSettingsElement('blog-next-schedule-field');
  const input = blogNextDraftField(type, 'schedule-date');
  const requiredIndicator = getBlogNextSettingsElement('blog-next-schedule-required');
  const scheduled = blogNextDraftField(type, 'post-status')?.value === 'schedule';
  if (field) field.dataset.dependencyActive = String(scheduled);
  if (input) {
    input.disabled = !scheduled;
    input.required = scheduled;
  }
  if (requiredIndicator) requiredIndicator.hidden = !scheduled;
}

function syncBlogNextDraftProviderFields(type) {
  const settings = getBlogNextSettingsElement('blog-next-publish-settings');
  if (!settings) return;
  const siteHostingOption = getBlogNextSettingsElement('blog-next-target-site-hosting-option');
  if (siteHostingOption) siteHostingOption.hidden = false;
  const siteSelected = blogNextDraftField(type, 'target-site-hosting')?.checked === true;
  const siteSelect = getBlogNextSettingsElement('blog-next-site-hosting-select');
  const siteRefresh = getBlogNextSettingsElement('blog-next-site-hosting-retry');
  if (siteSelect) siteSelect.required = siteSelected;
  if (siteRefresh) {
    const loading = siteRefresh.getAttribute('aria-busy') === 'true';
    siteRefresh.disabled = loading || !siteSelected;
  }
  const naverSelected = blogNextDraftField(type, 'target-naver')?.checked === true;
  const wordpressSelected = blogNextDraftField(type, 'target-wordpress')?.checked === true;
  syncBlogNextPublishingTargetSettings(type);
  settings.querySelectorAll('[data-draft-provider-field]').forEach((field) => {
    const active = field.dataset.draftProviderField === 'naver' ? naverSelected : wordpressSelected;
    field.dataset.dependencyActive = String(active);
    // Headless execution is a Naver-only control; hiding it keeps other targets' 2×2 settings grid balanced.
    if (field.id === 'blog-next-headless-field') field.hidden = !naverSelected;
    field.querySelectorAll('input, select, textarea').forEach((control) => {
      control.disabled = !active;
    });
  });
  const siteActive = blogNextDraftField(type, 'target-site-hosting')?.checked === true;
  const siteSelectField = getBlogNextSettingsElement('blog-next-site-hosting-select');
  if (siteSelectField) siteSelectField.disabled = siteSelectField.options.length <= 1;
  const vaultPicker = getBlogNextSettingsElement('blog-next-vault-folder-choose');
  const vaultSelect = getBlogNextSettingsElement('blog-next-vault-folder-select');
  if (vaultPicker && vaultPicker.getAttribute('aria-busy') !== 'true') {
    vaultPicker.disabled = !siteActive
      || getBlogNextSettingsElement('blog-next-site-hosting-select')?.selectedOptions?.[0]?.dataset.siteKind !== 'vault';
  }
  const scheduleOption = blogNextDraftField(type, 'post-status')?.querySelector('option[value="schedule"]');
  if (scheduleOption && siteActive) scheduleOption.disabled = true;
  syncBlogNextDraftSettingsSummary(type);
  syncBlogNextSiteHostingOptions(type);
}
