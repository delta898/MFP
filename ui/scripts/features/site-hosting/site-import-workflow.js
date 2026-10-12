function siteHostingImportMenuRow(item = {}, index = 0, options = {}) {
  const rowNumber = index + 1;
  return `<div class="site-navigation-row site-import-navigation-row" data-site-import-menu-row data-site-menu-id="${siteHostingEscapeHtml(item.id || '')}">
    <span class="site-navigation-number" aria-hidden="true">${rowNumber}</span>
    <label class="site-navigation-cell"><span class="site-navigation-mobile-label">메뉴 이름</span><input type="text" maxlength="30" data-site-import-menu-label aria-label="메뉴 ${rowNumber} 이름" value="${siteHostingEscapeHtml(item.label || '')}"></label>
    <label class="site-navigation-cell"><span class="site-navigation-mobile-label">주소</span><input type="text" maxlength="2048" data-site-import-menu-href aria-label="메뉴 ${rowNumber} 주소" value="${siteHostingEscapeHtml(item.href || '')}" placeholder="예: /about/"></label>
    <label class="site-post-list-choice"><input type="radio" name="site-import-post-list-menu" value="${index}"${options.selected ? ' checked' : ''}><span class="site-navigation-mobile-label">글 목록</span><span>글 목록으로 연결</span></label>
    <button class="secondary site-navigation-remove" type="button" data-site-import-menu-remove aria-label="${rowNumber}번 메뉴 제거">제거</button>
    <span class="site-navigation-field-error" data-site-import-menu-error hidden></span>
  </div>`;
}

function siteHostingRenderImportNavigation(items = [], selectedIndex = null) {
  const list = document.querySelector('[data-site-import-navigation]');
  if (!list) return;
  list.innerHTML = items.slice(0, 50).map((item, index) => siteHostingImportMenuRow(item, index, { selected: index === selectedIndex })).join('');
}

function siteHostingApplyImportedIntegrationCapabilities(capabilities = {}) {
    const identity = capabilities.site_identity === true;
    const navigation = capabilities.navigation === true;
  for (const id of ['site-import-description', 'site-import-search-indexing', 'site-description', 'site-search-indexing']) {
    const control = document.getElementById(id);
    if (control) control.disabled = !identity;
  }
  const menuList = document.querySelector('[data-site-import-navigation], #site-navigation-fields [data-site-navigation-list]');
  if (menuList) {
    menuList.querySelectorAll('input, button').forEach((control) => { control.disabled = !navigation; });
    const add = document.querySelector('[data-site-import-menu-add], #site-navigation-fields [data-site-menu-add]');
    if (add) add.disabled = !navigation;
  }
  for (const [key, inputIds] of [['logo', ['site-import-logo', 'site-logo']], ['share_image', ['site-import-share-image', 'site-share-image']], ['favicon', ['site-import-favicon', 'site-favicon']]]) {
    const supported = capabilities[key] === true;
    for (const inputId of inputIds) {
      const input = document.getElementById(inputId);
      if (input) input.disabled = !supported;
    }
    const suffix = key === 'share_image' ? 'share-image' : key;
    for (const button of document.querySelectorAll(`[data-site-import-image-choose="${suffix}"], [data-site-import-image-remove="${suffix}"], [data-site-profile-image-choose="${suffix}"], [data-site-profile-image-remove="${suffix}"]`)) {
      button.disabled = !supported;
    }
  }
  const note = document.querySelector('.site-create-zip-note');
  if (note) {
    const unsupported = [];
    if (!identity) unsupported.push('사이트 설명과 검색 노출');
    if (!navigation) unsupported.push('메뉴');
    for (const [key, label] of [['logo', '로고'], ['favicon', 'Favicon'], ['share_image', '대표 이미지']]) {
      if (capabilities[key] !== true) unsupported.push(label);
    }
    note.textContent = unsupported.length
      ? `이 Astro 프로젝트는 ${unsupported.join(', ')} 설정을 화면에 반영하는 연동을 제공하지 않습니다. 해당 설정은 읽기 전용입니다.`
      : '사이트 설정은 site-data/site.json에 저장됩니다. 새 미리보기와 빌드에서 Astro 화면에 반영됩니다.';
  }
}

function siteHostingUpdateImportNavigationNumbers() {
  const list = document.querySelector('[data-site-import-navigation]');
  if (!list) return;
  [...list.querySelectorAll('[data-site-import-menu-row]')].forEach((row, index) => {
    row.querySelector('.site-navigation-number').textContent = String(index + 1);
    row.querySelector('[data-site-import-menu-label]').setAttribute('aria-label', `메뉴 ${index + 1} 이름`);
    row.querySelector('[data-site-import-menu-href]').setAttribute('aria-label', `메뉴 ${index + 1} 주소`);
    row.querySelector('[data-site-import-menu-remove]').setAttribute('aria-label', `${index + 1}번 메뉴 제거`);
    const radio = row.querySelector('input[name="site-import-post-list-menu"]');
    if (radio) radio.value = String(index);
  });
}

function siteHostingCollectImportedSiteSettings() {
  const menuRows = [...document.querySelectorAll('[data-site-import-menu-row]')];
  const navigation = [];
  for (const row of menuRows) {
    const label = String(row.querySelector('[data-site-import-menu-label]')?.value || '').trim();
    const href = String(row.querySelector('[data-site-import-menu-href]')?.value || '').trim();
    const error = row.querySelector('[data-site-import-menu-error]');
    if (error) { error.hidden = true; error.textContent = ''; }
    if (!label || label.length > 30 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label)) {
      if (error) { error.textContent = '메뉴 이름을 1~30자로 입력해 주세요.'; error.hidden = false; }
      row.querySelector('[data-site-import-menu-label]')?.focus();
      return null;
    }
    try {
    navigation.push({ ...(row.dataset.siteMenuId ? { id: row.dataset.siteMenuId } : {}), label, href: siteHostingNormalizeMenuPath(href, '', label) });
    } catch (cause) {
      if (error) { error.textContent = cause.message; error.hidden = false; }
      row.querySelector('[data-site-import-menu-href]')?.focus();
      return null;
    }
  }
  const postListRadio = document.querySelector('input[name="site-import-post-list-menu"]:checked');
  return {
    site_description: String(document.getElementById('site-import-description')?.value || '').trim(),
    search_engine_indexing: document.getElementById('site-import-search-indexing')?.checked !== false,
    navigation,
    ...(postListRadio ? { publishing: { post_list_navigation_index: Number(postListRadio.value) } } : {}),
    ...(siteHostingImportedProfileImages.logo ? { logo: siteHostingImportedProfileImages.logo } : {}),
    ...(siteHostingImportedProfileImages['share-image'] ? { share_image: siteHostingImportedProfileImages['share-image'] } : {}),
    ...(siteHostingImportedProfileImages.favicon ? { favicon: siteHostingImportedProfileImages.favicon } : {}),
    ...(siteHostingImportedProfileImageClears.has('logo') ? { logo: null } : {}),
    ...(siteHostingImportedProfileImageClears.has('share-image') ? { share_image: null } : {}),
    ...(siteHostingImportedProfileImageClears.has('favicon') ? { favicon: null } : {})
  };
}


function siteHostingMarkCreatePreviewStale() {
  siteHostingUpdateCreateSubmitState();
  if (!siteHostingCreatePreviewId) return;
  const status = document.getElementById('site-create-preview-status');
  if (status) status.textContent = '설정 변경됨 · 다시 미리보기 하세요';
  const settingsPreviewStatus = document.getElementById('site-settings-current-preview-status');
  if (settingsPreviewStatus) {
    settingsPreviewStatus.hidden = false;
    settingsPreviewStatus.textContent = '설정이 변경되었습니다. 다시 미리보기를 눌러 확인하세요.';
  }
  const importStatus = document.querySelector('[data-site-import-preview-status]');
  if (importStatus) {
    importStatus.hidden = false;
    importStatus.textContent = '설정이 변경되었습니다. 다시 미리보기를 눌러 확인하세요.';
  }
}

async function siteHostingClearCreatePreview() {
  const project = siteHostingSelectedProject;
  const previewId = siteHostingCreatePreviewId;
  siteHostingCreatePreviewId = '';
  siteHostingCreatePreviewSnapshot = '';
  const frame = document.getElementById('site-create-preview-frame');
  if (frame) { frame.hidden = true; frame.removeAttribute('src'); }
  const settingsFrame = document.getElementById('site-settings-current-preview-frame');
  if (settingsFrame) { settingsFrame.hidden = true; settingsFrame.removeAttribute('src'); }
  const settingsStatus = document.getElementById('site-settings-current-preview-status');
  if (settingsStatus) { settingsStatus.hidden = true; settingsStatus.textContent = ''; }
  const importFrame = document.querySelector('[data-site-import-preview-frame]');
  if (importFrame) { importFrame.hidden = true; importFrame.removeAttribute('src'); }
  if (previewId && project) {
    try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(previewId)}`); } catch (_error) { }
  }
}

async function siteHostingPreviewImportedSite() {
  const project = siteHostingSelectedProject;
  const button = document.querySelector('[data-site-create-preview]');
  const panel = document.getElementById('site-create-zip-panel');
  const token = String(panel?.dataset.archiveToken || '');
  const name = String(document.getElementById('site-import-name')?.value || '').trim();
  const settings = siteHostingCollectImportedSiteSettings();
  const previewSnapshot = JSON.stringify({ name, settings });
  const frame = document.querySelector('[data-site-import-preview-frame]');
  const empty = document.querySelector('[data-site-import-preview-empty]');
  const status = document.querySelector('[data-site-import-preview-status]');
  if (!project || !button || button.disabled || !token || !siteHostingImportAnalysis || !settings || !frame) return;
  const previousPreviewId = siteHostingCreatePreviewId;
  const previousButtonBusy = button.getAttribute('aria-busy');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (status) { status.hidden = true; status.textContent = ''; }
  const finishPreviewProgress = showUiProgress(document.querySelector('.site-import-preview'), {
    type: UI_PROGRESS_TYPES.REGION_INDETERMINATE,
    message: 'Astro 사이트 미리보기를 만드는 중…'
  });
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts`, {
      name, selection_token: token, settings
    });
    if (!document.getElementById('site-create-dialog')?.open) {
      try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(result.id)}`); } catch (_error) { }
      return;
    }
    frame.src = result.url;
    frame.hidden = false;
    if (empty) empty.hidden = true;
    siteHostingCreatePreviewId = result.id;
    siteHostingCreatePreviewSnapshot = previewSnapshot;
    if (status) { status.hidden = true; status.textContent = ''; }
    const currentName = String(document.getElementById('site-import-name')?.value || '').trim();
    const currentSettings = siteHostingCollectImportedSiteSettings();
    if (currentSettings && JSON.stringify({ name: currentName, settings: currentSettings }) !== previewSnapshot) {
      siteHostingMarkCreatePreviewStale();
    }
    if (previousPreviewId) {
      try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(previousPreviewId)}`); } catch (_error) { }
    }
  } catch (error) {
    if (status) {
      status.hidden = false;
      status.textContent = siteHostingCreatePreviewId ? `새 미리보기를 만들지 못했습니다. 이전 미리보기를 유지합니다. ${error.message || ''}` : error.message || '미리보기를 만들지 못했습니다.';
    }
  } finally {
    finishPreviewProgress();
    button.disabled = document.getElementById('site-create-dialog')?.classList.contains('is-zip-import-mode')
      ? siteHostingImportStep !== 'settings' || !siteHostingImportAnalysis
      : false;
    if (previousButtonBusy === null) button.removeAttribute('aria-busy');
    else button.setAttribute('aria-busy', previousButtonBusy);
  }
}

async function siteHostingPreviewImportedSettings() {
  const project = siteHostingSelectedProject;
  const siteId = siteHostingEditingSiteId;
  const button = document.querySelector('[data-site-create-preview]');
  const payload = await siteHostingCollectImportedEditSettings();
  const preview = document.getElementById('site-settings-current-preview');
  const frame = document.getElementById('site-settings-current-preview-frame');
  const image = document.getElementById('site-settings-current-preview-image');
  const empty = document.getElementById('site-settings-current-preview-empty');
  const status = document.getElementById('site-settings-current-preview-status');
  if (!project || !siteId || !payload || !button || button.disabled || !preview || !frame) return;
  const previewSnapshot = siteHostingCreateFormSnapshot();
  const previousPreviewId = siteHostingCreatePreviewId;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (status) { status.hidden = true; status.textContent = ''; }
  const finishPreviewProgress = showUiProgress(preview, {
    type: UI_PROGRESS_TYPES.REGION_INDETERMINATE,
    message: 'Astro 사이트 미리보기를 만드는 중…'
  });
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts`, {
      site_id: siteId, name: payload.name, settings: payload.customization
    });
    frame.src = result.url;
    frame.hidden = false;
    if (image) image.hidden = true;
    if (empty) empty.hidden = true;
    siteHostingCreatePreviewId = result.id;
    siteHostingCreatePreviewSnapshot = previewSnapshot;
    if (status) { status.hidden = true; status.textContent = ''; }
    if (previousPreviewId) {
      try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(previousPreviewId)}`); } catch (_error) { }
    }
  } catch (error) {
    if (status) { status.hidden = false; status.textContent = error.message || '미리보기를 만들지 못했습니다.'; }
  } finally {
    finishPreviewProgress();
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

function siteHostingShowMenuError(input, message) {
  if (!input) return;
  const row = input.closest('[data-site-menu-row]');
  const error = row?.querySelector('[data-site-menu-error]');
  input.setAttribute('aria-invalid', 'true');
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function siteHostingCreateFormSnapshot() {
  return JSON.stringify({
    name: document.getElementById('site-name')?.value || '',
    description: document.getElementById('site-description')?.value || '',
    template: document.getElementById('site-template-id')?.value || '',
    setupInputs: siteHostingCreateSetupInputs,
    images: siteHostingProfileImages,
    searchIndexing: document.getElementById('site-search-indexing')?.checked !== false,
    menus: [...document.querySelectorAll('#site-navigation-fields [data-site-menu-row]')].map((row) => ({
      id: row.dataset.siteMenuId || '',
      label: row.querySelector('[data-site-menu-label]')?.value || '',
      href: row.querySelector('[data-site-menu-href]')?.value || '',
      postList: row.querySelector('input[name="site-post-list-menu"]')?.checked === true
    }))
  });
}

function siteHostingRenderImportedSettingsNavigation(navigation = [], selectedIndex = null) {
  const container = document.getElementById('site-navigation-fields');
  if (!container) return;
  container.innerHTML = `<h3>사이트 메뉴</h3><p>메뉴 이름과 주소를 수정하고, 글 목록 메뉴를 지정할 수 있습니다.</p><div class="site-navigation-table"><div class="site-navigation-table-head"><span>항목</span><span>메뉴 이름</span><span>주소</span><span>글 목록</span><button class="secondary site-navigation-add" type="button" data-site-menu-add aria-label="메뉴 추가" title="메뉴 추가">+</button></div><div class="site-navigation-list" data-site-navigation-list>${navigation.slice(0, 50).map((item, index) => siteHostingCreateMenuRow({ id: item.id, label: item.label, href: item.href }, index, { postListRoute: true, selected: index === selectedIndex, isDefault: true })).join('')}</div></div><p class="site-navigation-duplicate-warning" data-site-menu-duplicate-warning role="status" hidden></p>`;
  siteHostingRefreshCreateMenuRows();
}

async function siteHostingCollectImportedEditSettings() {
  const navigation = [];
  for (const row of document.querySelectorAll('#site-navigation-fields [data-site-menu-row]')) {
    const labelInput = row.querySelector('[data-site-menu-label]');
    const hrefInput = row.querySelector('[data-site-menu-href]');
    const label = String(labelInput?.value || '').trim();
    const error = row.querySelector('[data-site-menu-error]');
    if (error) { error.hidden = true; error.textContent = ''; }
    if (!label || label.length > 30 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label)) {
      siteHostingShowMenuError(labelInput, '메뉴 이름을 1~30자로 입력해 주세요.');
      labelInput?.focus();
      return null;
    }
    try {
      navigation.push({ ...(row.dataset.siteMenuId ? { id: row.dataset.siteMenuId } : {}), label, href: siteHostingNormalizeMenuPath(hrefInput?.value, '', label) });
    } catch (error) {
      siteHostingShowMenuError(hrefInput, error.message);
      hrefInput?.focus();
      return null;
    }
  }
  const images = { ...siteHostingProfileImages };
  for (const [key, inputId, label] of [['logo', 'site-logo', '로고'], ['share-image', 'site-share-image', '사이트 대표 이미지'], ['favicon', 'site-favicon', 'Favicon']]) {
    const input = document.getElementById(inputId);
    if (!input?.files?.[0]) continue;
    try { images[key] = await siteHostingReadProfileImage(input.files[0], label); }
    catch (cause) {
      const error = document.getElementById(`${inputId}-error`);
      if (error) { error.textContent = cause.message; error.hidden = false; }
      input.focus();
      return null;
    }
  }
  const postListSelection = document.querySelector('input[name="site-post-list-menu"]:checked');
  const currentSiteName = siteHostingSites.find((site) => site.id === siteHostingEditingSiteId)?.name || '';
  return {
    name: String(document.getElementById('site-name')?.value || '').trim() || currentSiteName,
    customization: {
      site_description: String(document.getElementById('site-description')?.value || '').trim(),
      search_engine_indexing: document.getElementById('site-search-indexing')?.checked !== false,
      navigation,
      ...(postListSelection ? { publishing: { post_list_navigation_index: Number(postListSelection.value) } } : {}),
      ...(images.logo ? { logo: images.logo } : {}),
      ...(images['share-image'] ? { share_image: images['share-image'] } : {}),
      ...(images.favicon ? { favicon: images.favicon } : {}),
      ...(siteHostingImportedProfileImageClears.has('logo') ? { logo: null } : {}),
      ...(siteHostingImportedProfileImageClears.has('share-image') ? { share_image: null } : {}),
      ...(siteHostingImportedProfileImageClears.has('favicon') ? { favicon: null } : {})
    }
  };
}
