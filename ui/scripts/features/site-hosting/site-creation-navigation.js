function siteHostingRenderCreateNavigation() {
  const container = document.getElementById('site-navigation-fields');
  const template = siteHostingCreateTemplates.find((item) => item.id === siteHostingSelectedCreateTemplate);
  const navigation = template?.customization?.find((field) => field.key === 'navigation')?.default;
  const postListRoute = template?.publishing?.routes?.listing;
  if (!container) return;
  if (!Array.isArray(navigation) || !navigation.length) {
    container.replaceChildren();
    return;
  }
  const matchingPostListIndex = postListRoute ? navigation.findIndex((item) => item.href === postListRoute) : -1;
  const defaultPostListIndex = postListRoute ? Math.max(0, matchingPostListIndex) : -1;
  container.innerHTML = `<h3>사이트 메뉴</h3><p>메뉴 이름과 연결할 주소를 정하세요. 비워 두면 제안된 주소를 사용합니다.</p><div class="site-navigation-table"><div class="site-navigation-table-head"><span>항목</span><span>메뉴 이름</span><span>주소</span><span>${postListRoute ? '글 목록' : ''}</span>${template?.pages ? '<button class="secondary site-navigation-add" type="button" data-site-menu-add aria-label="메뉴 추가" title="메뉴 추가">+</button>' : '<span></span>'}</div><div class="site-navigation-list" data-site-navigation-list>${navigation.map((item, index) => siteHostingCreateMenuRow(item, index, { postListRoute, selected: index === defaultPostListIndex, isDefault: true })).join('')}</div></div><p class="site-navigation-duplicate-warning" data-site-menu-duplicate-warning role="status" hidden></p>`;
}

function siteHostingCreateMenuRow(item = {}, index = 0, options = {}) {
  const label = String(item.label || '');
  const href = String(item.href || '');
  const rowNumber = index + 1;
  return `<div class="site-navigation-row" data-site-menu-row data-site-menu-id="${siteHostingEscapeHtml(item.id || '')}">
    <span class="site-navigation-number" aria-hidden="true">${rowNumber}</span>
    <label class="site-navigation-cell"><span class="site-navigation-mobile-label">메뉴 이름</span><input type="text" maxlength="30" data-site-menu-label placeholder="예: 소개" aria-label="메뉴 ${rowNumber} 이름" value="${siteHostingEscapeHtml(label)}"></label>
    <label class="site-navigation-cell"><span class="site-navigation-mobile-label">주소</span><input type="text" maxlength="2048" data-site-menu-href data-has-default="${options.isDefault ? 'true' : 'false'}" data-default-href="${siteHostingEscapeHtml(href)}" placeholder="${siteHostingEscapeHtml(href || '/about/')}" aria-label="메뉴 ${rowNumber} 주소"></label>
    <label class="site-post-list-choice${options.postListRoute ? '' : ' is-empty'}">${options.postListRoute ? `<input type="radio" name="site-post-list-menu" value="${index}"${options.selected ? ' checked' : ''}><span class="site-navigation-mobile-label">글 목록</span><span>글 목록으로 연결</span>` : ''}</label>
    <button class="secondary site-navigation-remove" type="button" data-site-menu-remove aria-label="${rowNumber}번 메뉴 제거">제거</button>
    <div class="site-navigation-remove-confirmation" data-site-menu-remove-confirmation hidden>
      <span data-site-menu-remove-message role="status"></span>
      <span class="site-navigation-remove-actions"><button class="secondary" type="button" data-site-menu-remove-cancel>취소</button><button class="primary" type="button" data-site-menu-remove-confirm>삭제</button></span>
    </div>
    <span class="site-navigation-field-error" data-site-menu-error hidden></span>
  </div>`;
}

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

function siteHostingSuggestMenuPath(label) {
  const slug = String(label || '').normalize('NFKC').trim().toLocaleLowerCase('en-US')
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/g, '');
  return slug ? `/${slug}/` : '';
}

function siteHostingNormalizeMenuPath(value, fallback, label) {
  const raw = String(value || '').trim() || String(fallback || '').trim() || siteHostingSuggestMenuPath(label);
  if (!raw) throw new Error('메뉴 주소를 입력하거나 제안 주소를 사용해 주세요.');
  if (/[\s\u0000-\u001f\u007f\p{Zl}\p{Zp}]/u.test(raw) || /%(?![\da-f]{2})/iu.test(raw)) throw new Error('주소 형식을 확인해 주세요.');
  let parsed;
  try { parsed = new URL(raw, 'https://bloggenius.invalid/'); }
  catch (_error) { throw new Error('주소 형식을 확인해 주세요.'); }
  if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) throw new Error('http(s), mailto 또는 tel 주소를 입력해 주세요.');
  return raw;
}

function siteHostingAddCreateMenuRow() {
  const list = document.querySelector('#site-navigation-fields [data-site-navigation-list]');
  const template = siteHostingCreateTemplates.find((item) => item.id === siteHostingSelectedCreateTemplate);
  const max = 50;
  if (!list || list.children.length >= max) return;
  list.insertAdjacentHTML('beforeend', siteHostingCreateMenuRow({}, list.children.length, {
    postListRoute: Boolean(template?.publishing?.routes?.listing)
  }));
  const row = list.lastElementChild;
  row.querySelector('[data-site-menu-label]')?.focus();
  siteHostingRefreshCreateMenuRows();
}

function siteHostingRefreshCreateMenuRows() {
  const list = document.querySelector('#site-navigation-fields [data-site-navigation-list]');
  const template = siteHostingCreateTemplates.find((item) => item.id === siteHostingSelectedCreateTemplate);
  const defaults = template?.customization?.find((field) => field.key === 'navigation')?.default || [];
  if (!list) return;
  [...list.children].forEach((row, index) => {
    row.querySelector('.site-navigation-number').textContent = String(index + 1);
    row.querySelector('[data-site-menu-label]').setAttribute('aria-label', `메뉴 ${index + 1} 이름`);
    row.querySelector('[data-site-menu-href]').setAttribute('aria-label', `메뉴 ${index + 1} 주소`);
    const radio = row.querySelector('input[name="site-post-list-menu"]');
    if (radio) radio.value = String(index);
    row.querySelector('[data-site-menu-remove]').setAttribute('aria-label', `${index + 1}번 메뉴 제거`);
  });
  const max = siteHostingEditingImportedSite ? 50 : defaults.length + Number(template?.pages?.max_items || 0);
  const addButton = document.querySelector('#site-navigation-fields [data-site-menu-add]');
  if (addButton) addButton.disabled = list.children.length >= max;
  list.querySelectorAll('[data-site-menu-remove]').forEach((button) => { button.disabled = !siteHostingEditingImportedSite && list.children.length <= 1; });
}

async function siteHostingCollectCreatePayload(options = {}) {
  const input = document.getElementById('site-name');
  const templateInput = document.getElementById('site-template-id');
  const feedback = document.getElementById('site-create-feedback');
  const name = String(input?.value || '').trim();
  if ((!name && options.allowEmptyName !== true) || !templateInput?.value || !siteHostingSelectedProject) {
    if (!name && options.allowEmptyName !== true) {
      input?.setAttribute('aria-invalid', 'true');
      input?.focus();
    }
    return null;
  }
  const selectedTemplate = siteHostingCreateTemplates.find((template) => template.id === templateInput.value);
  const setupInputs = {};
  for (const item of Array.isArray(selectedTemplate?.setup_inputs) ? selectedTemplate.setup_inputs : []) {
    if (item?.type === 'directory' && item?.purpose === 'knowledge_collection') {
      const value = String(siteHostingCreateSetupInputs[item.id] || '').trim();
      if (item.required && !value && options.allowMissingSetupInputs !== true) {
        if (feedback) feedback.textContent = `${item.label || '필수 폴더'}를 선택해 주세요.`;
        [...document.querySelectorAll('[data-site-setup-input-select]')]
          .find((button) => button.dataset.siteSetupInputSelect === item.id)?.focus();
        return null;
      }
      if (value) setupInputs[item.id] = value;
      continue;
    }
    if (item?.type === 'frontmatter_match' && item?.purpose === 'publication_filter') {
      const configured = siteHostingCreateSetupInputs[item.id] || {};
      const modeInput = [...document.querySelectorAll('[data-site-setup-mode]')]
        .find((control) => control.dataset.siteSetupId === item.id && control.checked);
      const selectedMode = modeInput?.value || (configured.mode === 'all' ? 'all' : 'frontmatter');
      const field = String(configured.field || '').trim();
      const value = String(configured.value ?? '').trim();
      if (item.required && selectedMode === 'frontmatter' && (!field || !value) && options.allowMissingSetupInputs !== true) {
        if (feedback) feedback.textContent = 'Frontmatter 속성과 일치값을 모두 입력해 주세요.';
        [...document.querySelectorAll('[data-site-setup-field]')]
          .find((control) => control.dataset.siteSetupId === item.id)?.focus();
        return null;
      }
      if (selectedMode === 'all') setupInputs[item.id] = { mode: 'all' };
      else if (field && value) setupInputs[item.id] = { mode: 'frontmatter', field, value };
    }
  }
  const navigationDefaults = selectedTemplate?.customization?.find((field) => field.key === 'navigation')?.default;
  const menuRows = [...document.querySelectorAll('#site-navigation-fields [data-site-menu-row]')];
  const profileImageFields = [
    { key: 'logo', inputId: 'site-logo', errorId: 'site-logo-error', label: '로고' },
    { key: 'share-image', inputId: 'site-share-image', errorId: 'site-share-image-error', label: '사이트 대표 이미지' },
    { key: 'favicon', inputId: 'site-favicon', errorId: 'site-favicon-error', label: 'Favicon' }
  ];
  for (const field of profileImageFields) {
    const error = document.getElementById(field.errorId);
    if (error) { error.hidden = true; error.textContent = ''; }
  }
  if (feedback) feedback.textContent = '';
  document.querySelectorAll('#site-navigation-fields [data-site-menu-href], #site-navigation-fields [data-site-menu-label]')
    .forEach((field) => field.removeAttribute('aria-invalid'));
  document.querySelectorAll('#site-navigation-fields [data-site-menu-error]')
    .forEach((error) => { error.hidden = true; error.textContent = ''; });
  const duplicateWarning = document.querySelector('#site-navigation-fields [data-site-menu-duplicate-warning]');
  if (duplicateWarning) { duplicateWarning.hidden = true; duplicateWarning.textContent = ''; }
  const profileImages = { ...siteHostingProfileImages };
  for (const field of profileImageFields) {
    const input = document.getElementById(field.inputId);
    if (!input?.files?.[0]) continue;
    try {
      profileImages[field.key] = await siteHostingReadProfileImage(input.files[0], field.label);
    } catch (error) {
      const errorEl = document.getElementById(field.errorId);
      if (errorEl) { errorEl.textContent = error.message; errorEl.hidden = false; }
      input.focus();
      return null;
    }
  }
  const navigation = Array.isArray(navigationDefaults) ? menuRows.map((row) => {
    const labelInput = row.querySelector('[data-site-menu-label]');
    const hrefInput = row.querySelector('[data-site-menu-href]');
    const label = String(labelInput?.value || '').trim();
    if (!label || label.length > 30 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label)) {
      siteHostingShowMenuError(labelInput, '메뉴 이름을 1~30자로 입력해 주세요.');
      return null;
    }
    try {
      const fallback = hrefInput?.dataset.defaultHref || (hrefInput?.dataset.hasDefault === 'true' ? '' : siteHostingSuggestMenuPath(label));
      const id = String(row.dataset.siteMenuId || '').trim();
      return { ...(id ? { id } : {}), label, href: siteHostingNormalizeMenuPath(hrefInput?.value, fallback, label) };
    } catch (error) {
      siteHostingShowMenuError(hrefInput, error.message);
      return null;
    }
  }) : undefined;
  if (navigation?.some((item) => !item)) {
    document.querySelector('#site-navigation-fields [aria-invalid="true"]')?.focus();
    return null;
  }
  if (navigation) {
    const seen = new Set();
    const hasDuplicate = navigation.some((item) => {
      if (seen.has(item.href)) return true;
      seen.add(item.href);
      return false;
    });
    if (hasDuplicate && duplicateWarning) {
      duplicateWarning.textContent = '같은 주소를 사용하는 메뉴가 있습니다. 중복 주소는 허용되며, 연결 결과는 템플릿에 따라 다를 수 있습니다.';
      duplicateWarning.hidden = false;
    }
  }
  const postListRoute = selectedTemplate?.publishing?.routes?.listing;
  const postListSelection = postListRoute ? document.querySelector('input[name="site-post-list-menu"]:checked') : null;
  const selectedMenuIndex = postListSelection ? menuRows.indexOf(postListSelection.closest('[data-site-menu-row]')) : -1;
  return {
    name,
    template_id: templateInput.value,
    ...(Object.keys(setupInputs).length ? { setup_inputs: setupInputs } : {}),
    customization: {
      ...(String(document.getElementById('site-description')?.value || '').trim()
        ? { site_description: String(document.getElementById('site-description').value).trim() }
        : {}),
      ...(profileImages.logo ? { logo: profileImages.logo } : {}),
      ...(profileImages['share-image'] ? { share_image: profileImages['share-image'] } : {}),
      ...(profileImages.favicon ? { favicon: profileImages.favicon } : {}),
      search_engine_indexing: document.getElementById('site-search-indexing')?.checked !== false,
      ...(navigation ? { navigation } : {}),
      ...(postListSelection ? { publishing: { post_list_navigation_index: selectedMenuIndex } } : {})
    }
  };
}

async function siteHostingCreateSite(event) {
  event.preventDefault();
  if (siteHostingCreateMode === 'settings') return void siteHostingApplySiteSettings(event);
  const project = siteHostingSelectedProject;
  const form = event.currentTarget;
  const feedback = document.getElementById('site-create-feedback');
  const submit = form.querySelector('[type="submit"]');
  if (!submit || submit.disabled) return;
  const hideProgress = showUiProgress(form, {
    type: UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE,
    presentation: 'compact',
    message: '사이트를 만들고 있습니다. 잠시 기다려 주세요.'
  });
  submit.disabled = true;
  try {
    let site;
    if (form.closest('#site-create-dialog')?.classList.contains('is-zip-import-mode')) {
      const zipPanel = document.getElementById('site-create-zip-panel');
      const name = String(document.getElementById('site-import-name')?.value || '').trim();
      const token = String(zipPanel?.dataset.archiveToken || '');
      const settings = siteHostingCollectImportedSiteSettings();
      if (!name || !token || !siteHostingImportAnalysis || !settings) return;
      site = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/import-archive`, { name, selection_token: token, settings });
      zipPanel?.removeAttribute('data-archive-token');
    } else {
      const payload = await siteHostingCollectCreatePayload();
      if (!payload) return;
      site = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`, payload);
    }
    document.getElementById('site-create-dialog')?.close();
    try {
      siteHostingSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
    } catch (_refreshError) {
      siteHostingSites = [site, ...siteHostingSites];
    }
    const createdSiteIndex = siteHostingSites.findIndex((item) => item.id === site.id);
    if (createdSiteIndex >= 0 && site.screenshot) {
      siteHostingSites[createdSiteIndex] = {
        ...siteHostingSites[createdSiteIndex],
        screenshot: { ...(siteHostingSites[createdSiteIndex].screenshot || {}), latest_build: site.screenshot },
        screenshot_url: `/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(site.id)}/screenshot`
      };
    }
    siteHostingSelectedProject.site_count = siteHostingSites.length;
    siteHostingSiteLoadState = 'ready';
    siteHostingRenderProjectDetail();
    if (site.build_error) {
      siteHostingSetSiteOperation(site.id, 'error', `사이트는 만들었지만 준비를 마치지 못했습니다: ${site.build_error}`);
    } else if (site.template_status === 'imported') {
      const screenshotMessage = site.screenshot_error ? ' 대표 이미지는 만들지 못했습니다.' : '';
      siteHostingSetSiteOperation(site.id, 'success', `Astro 프로젝트를 가져와 빌드했습니다.${screenshotMessage}`);
    } else {
      const screenshotMessage = site.screenshot_error ? ' 대표 이미지는 만들지 못했습니다.' : '';
      siteHostingSetSiteOperation(site.id, 'success', `사이트를 만들었습니다.${screenshotMessage}`);
    }
  } catch (error) {
    const zipMode = form.closest('#site-create-dialog')?.classList.contains('is-zip-import-mode');
    const message = error.message || '사이트를 만들지 못했습니다.';
    const zipFeedback = zipMode ? document.querySelector('[data-site-import-zip-feedback]') : null;
    if (zipFeedback) { zipFeedback.hidden = false; zipFeedback.textContent = message; }
    else if (feedback) feedback.textContent = message;
  } finally {
    siteHostingUpdateCreateSubmitState();
    hideProgress();
  }
}

async function siteHostingApplySiteSettings(event) {
  const form = event.currentTarget;
  const project = siteHostingSelectedProject;
  const siteId = siteHostingEditingSiteId;
  const submit = form.querySelector('[type="submit"]');
  const feedback = document.getElementById('site-create-feedback');
  if (!project || !siteId || !submit || submit.disabled) return;
  const hideProgress = showUiProgress(form, {
    type: UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE,
    presentation: 'compact',
    message: '변경사항을 사이트에 반영하고 있습니다.'
  });
  submit.disabled = true;
  try {
    const payload = siteHostingEditingImportedSite
      ? await siteHostingCollectImportedEditSettings()
      : await siteHostingCollectCreatePayload();
    if (!payload) return;
    const result = await putJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}`, payload);
    if (result.build_error) throw new Error(`설정은 저장했지만 사이트 갱신에 실패했습니다: ${result.build_error}`);
    document.getElementById('site-create-dialog')?.close();
    siteHostingSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
    const updatedIndex = siteHostingSites.findIndex((site) => site.id === siteId);
    if (updatedIndex >= 0 && result.screenshot) {
      siteHostingSites[updatedIndex] = {
        ...siteHostingSites[updatedIndex],
        screenshot: { ...(siteHostingSites[updatedIndex].screenshot || {}), latest_build: result.screenshot },
        screenshot_url: `/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/screenshot`
      };
    }
    siteHostingRenderProjectDetail();
    siteHostingSetSiteOperation(siteId, 'success', result.source_kind === 'imported-astro'
      ? '공통 설정을 Astro 프로젝트에 반영하고 사이트를 다시 빌드했습니다.'
      : result.screenshot_error ? '설정을 반영했습니다. 대표 이미지는 갱신하지 못했습니다.' : '설정을 반영했습니다.');
  } catch (error) {
    if (feedback) feedback.textContent = error.message || '설정을 반영하지 못했습니다.';
  } finally {
    siteHostingUpdateCreateSubmitState();
    hideProgress();
  }
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

async function siteHostingPreviewCreateSite() {
  if (siteHostingCreateMode === 'settings' && siteHostingEditingImportedSite) {
    return siteHostingPreviewImportedSettings();
  }
  if (document.getElementById('site-create-dialog')?.classList.contains('is-zip-import-mode')) {
    return siteHostingPreviewImportedSite();
  }
  const project = siteHostingSelectedProject;
  const button = document.querySelector('[data-site-create-preview]');
  const feedback = document.getElementById('site-create-feedback');
  const inlineSettingsPreview = siteHostingCreateMode === 'settings';
  const image = inlineSettingsPreview
    ? document.getElementById('site-settings-current-preview-image')
    : document.getElementById('site-create-template-preview');
  const frame = inlineSettingsPreview
    ? document.getElementById('site-settings-current-preview-frame')
    : document.getElementById('site-create-preview-frame');
  const empty = inlineSettingsPreview
    ? document.getElementById('site-settings-current-preview-empty')
    : document.getElementById('site-create-preview-empty');
  const inlinePreview = inlineSettingsPreview ? document.getElementById('site-settings-current-preview') : null;
  const status = inlineSettingsPreview
    ? document.getElementById('site-settings-current-preview-status')
    : document.getElementById('site-create-preview-status');
  if (!project || !button || button.disabled) return;
  const payload = await siteHostingCollectCreatePayload({ allowEmptyName: true, allowMissingSetupInputs: true });
  if (!payload) return;
  const previewDialog = document.getElementById('site-create-preview-dialog');
  if (!inlineSettingsPreview && previewDialog && !previewDialog.open) previewDialog.showModal();
  const previousPreviewId = siteHostingCreatePreviewId;
  const previousButtonBusy = button.getAttribute('aria-busy');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  if (status && inlineSettingsPreview) { status.hidden = true; status.textContent = ''; }
  const finishPreviewProgress = showUiProgress(inlineSettingsPreview ? inlinePreview : document.querySelector('.site-create-preview-frame'), {
    type: UI_PROGRESS_TYPES.REGION_INDETERMINATE,
    message: '미리보기를 만드는 중…'
  });
  if (status) status.textContent = '사이트 미리보기를 준비하고 있습니다.';
  if (feedback) feedback.textContent = '';
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts`, payload);
    if (document.getElementById('site-create-dialog')?.open) {
      if (frame) { frame.src = result.url; frame.hidden = false; }
      if (image) image.hidden = true;
      if (empty) empty.hidden = true;
      siteHostingCreatePreviewId = result.id;
      siteHostingCreatePreviewSnapshot = inlineSettingsPreview ? siteHostingCreateFormSnapshot() : '';
      siteHostingUpdateCreateSubmitState();
      const collection = result.knowledge_collection;
      if (status) {
        if (inlineSettingsPreview) {
          status.hidden = true;
          status.textContent = '';
        } else {
          status.hidden = false;
          status.textContent = collection && (collection.source_markdown_count || collection.selection_configured)
            ? `미리보기 완료 · 공개 노트 ${collection.published_note_count}개 · 제외 ${collection.excluded_note_count}개 · 첨부 ${collection.copied_resource_count}개 · 미해결 링크 ${collection.unresolved_link_count}개 · 누락 첨부 ${collection.missing_resource_count}개`
            : '미리보기 완료';
        }
      }
      if (previousPreviewId) {
        try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(previousPreviewId)}`); } catch (_error) { }
      }
    } else {
      try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(result.id)}`); } catch (_error) { }
    }
  } catch (error) {
    if (feedback) feedback.textContent = error.message || '미리보기를 만들지 못했습니다.';
    if (status) {
      status.hidden = inlineSettingsPreview ? false : status.hidden;
      status.textContent = error.message || (siteHostingCreatePreviewId ? '이전 미리보기를 유지합니다.' : '미리보기 실패');
    }
    if (empty && !siteHostingCreatePreviewId) {
      empty.textContent = '미리보기를 만들지 못했습니다.\n설정을 확인하고 다시 시도하세요.';
      empty.hidden = false;
    }
  } finally {
    finishPreviewProgress();
    button.disabled = false;
    if (previousButtonBusy === null) button.removeAttribute('aria-busy');
    else button.setAttribute('aria-busy', previousButtonBusy);
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

async function siteHostingRequestCreateCancel() {
  const dialog = document.getElementById('site-create-dialog');
  if (!dialog?.open) return;
  if (dialog.querySelector('#site-create-form[aria-busy="true"]')) return;
  if (siteHostingCreateInitialSnapshot && siteHostingCreateFormSnapshot() !== siteHostingCreateInitialSnapshot) {
    const confirmation = document.getElementById('site-create-cancel-dialog');
    if (!confirmation) return;
    document.getElementById('site-create-cancel-title').textContent = siteHostingCreateMode === 'settings' ? '설정 변경을 취소할까요?' : '사이트 만들기를 취소할까요?';
    confirmation.querySelector('.ui-transaction-dialog-header p').textContent = siteHostingCreateMode === 'settings' ? '반영하지 않은 변경 사항이 저장되지 않습니다.' : '입력한 사이트 정보가 저장되지 않습니다.';
    confirmation.querySelector('[value="confirm"]').textContent = siteHostingCreateMode === 'settings' ? '변경 취소' : '취소하고 닫기';
    confirmation.returnValue = '';
    confirmation.showModal();
    await new Promise((resolve) => confirmation.addEventListener('close', resolve, { once: true }));
    const confirmed = confirmation.returnValue === 'confirm';
    if (!confirmed) return;
  }
  dialog.close();
}

function siteHostingSetCreateModeTab(mode = 'template') {
  const dialog = document.getElementById('site-create-dialog');
  const workspace = document.getElementById('site-create-workspace');
  const templatePanel = document.getElementById('site-create-template-panel');
  const zipPanel = document.getElementById('site-create-zip-panel');
  const zipMode = mode === 'zip' && siteHostingCreateMode === 'create';
  const selectedMode = zipMode ? 'zip' : 'template';
  if (!dialog || !workspace || !templatePanel || !zipPanel) return;
  templatePanel.hidden = selectedMode !== 'template';
  zipPanel.hidden = selectedMode !== 'zip';
  workspace.classList.toggle('is-zip-import-mode', selectedMode === 'zip');
  dialog.classList.toggle('is-zip-import-mode', selectedMode === 'zip');
  dialog.querySelectorAll('[data-site-create-mode-tab]').forEach((tab) => {
    const selected = tab.dataset.siteCreateModeTab === selectedMode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.classList.toggle('is-active', selected);
  });
  const subtitle = dialog.querySelector('.ui-transaction-dialog-header p');
  if (subtitle && siteHostingCreateMode === 'create') {
    subtitle.textContent = selectedMode === 'zip'
      ? 'AI로 만든 Astro 프로젝트를 ZIP으로 가져와 사이트로 준비하는 경로입니다.'
      : '템플릿을 고르고 사이트 정보를 설정하세요. 미리보기에서 결과를 확인할 수 있습니다.';
  }
  const submit = document.querySelector('#site-create-form [type="submit"]');
  const preview = document.querySelector('[data-site-create-preview]');
  if (selectedMode === 'zip') {
    siteHostingUpdateCreateSubmitState();
    if (preview) preview.disabled = siteHostingImportStep !== 'settings' || !siteHostingImportAnalysis;
  } else if (siteHostingCreateMode === 'create') {
    siteHostingUpdateCreateSubmitState();
    if (preview) preview.disabled = false;
  }
}

function siteHostingSetImportStep(step = 'upload') {
  siteHostingImportStep = step === 'settings' && siteHostingImportAnalysis ? 'settings' : 'upload';
  document.querySelectorAll('[data-site-import-step]').forEach((panel) => {
    panel.hidden = panel.dataset.siteImportStep !== siteHostingImportStep;
  });
  document.getElementById('site-create-dialog')?.classList.toggle('is-import-settings-step', siteHostingImportStep === 'settings');
  const importFeedback = document.querySelector('[data-site-import-zip-feedback]');
  if (importFeedback && siteHostingImportStep === 'settings') {
    importFeedback.hidden = true;
    importFeedback.textContent = '';
  }
  const preview = document.querySelector('[data-site-create-preview]');
  if (preview && document.getElementById('site-create-dialog')?.classList.contains('is-zip-import-mode')) {
    preview.disabled = siteHostingImportStep !== 'settings' || !siteHostingImportAnalysis;
  }
  siteHostingUpdateCreateSubmitState();
}

function siteHostingBindCreateModeTabs(dialog) {
  if (!dialog || dialog.dataset.modeTabsBound === 'true') return;
  dialog.dataset.modeTabsBound = 'true';
  dialog.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-site-create-mode-tab]');
    if (!tab) return;
    siteHostingSetCreateModeTab(tab.dataset.siteCreateModeTab);
  });
  dialog.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[data-site-create-mode-tab]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...dialog.querySelectorAll('[data-site-create-mode-tab]')];
    const index = tabs.indexOf(tab);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    siteHostingSetCreateModeTab(next.dataset.siteCreateModeTab);
    next.focus();
  });
}

function siteHostingProfileImageOptions(key) {
  const options = {
    logo: { inputId: 'site-logo', errorId: 'site-logo-error', imageId: 'site-logo-image', emptyId: 'site-logo-empty', chooseButton: '[data-site-profile-image-choose="logo"]', removeButton: '[data-site-profile-image-remove="logo"]' },
    'share-image': { inputId: 'site-share-image', errorId: 'site-share-image-error', imageId: 'site-share-image-preview', emptyId: 'site-share-image-empty', chooseButton: '[data-site-profile-image-choose="share-image"]', removeButton: '[data-site-profile-image-remove="share-image"]' },
    favicon: { inputId: 'site-favicon', errorId: 'site-favicon-error', imageId: 'site-favicon-preview', emptyId: 'site-favicon-empty', chooseButton: '[data-site-profile-image-choose="favicon"]', removeButton: '[data-site-profile-image-remove="favicon"]' }
  };
  return options[key] || null;
}

function siteHostingBindCreateDialogEvents() {
  const dialog = document.getElementById('site-create-dialog');
  const previewDialog = document.getElementById('site-create-preview-dialog');
  siteHostingBindCreateModeTabs(dialog);
  document.getElementById('site-create-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void siteHostingCreateSite(event);
  });
  document.querySelector('[data-site-import-prompt-copy]')?.addEventListener('click', async (event) => {
    const prompt = document.getElementById('site-import-meta-prompt');
    const details = prompt?.closest('details');
    const feedback = document.querySelector('[data-site-import-zip-feedback]');
    const button = event.currentTarget;
    if (!prompt || !String(prompt.value || '').trim() || button.disabled) return;
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('클립보드 기능을 사용할 수 없습니다.');
      await navigator.clipboard.writeText(prompt.value);
      if (feedback) { feedback.hidden = false; feedback.textContent = '메타 프롬프트를 복사했습니다. 예시 답변을 원하는 사이트에 맞게 바꿔 AI 도구에 전달하세요.'; }
    } catch (_error) {
      if (details) details.open = true;
      prompt.focus();
      prompt.select();
      if (feedback) { feedback.hidden = false; feedback.textContent = '자동 복사에 실패했습니다. 프롬프트 내용을 선택했습니다. 복사해 사용해 주세요.'; }
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('[data-site-import-zip]')?.addEventListener('click', async () => {
    const project = siteHostingSelectedProject;
    const button = document.querySelector('[data-site-import-zip]');
    const panel = document.getElementById('site-create-zip-panel');
    const feedback = document.querySelector('[data-site-import-zip-feedback]');
    if (!project || !button || button.disabled) return;
    button.disabled = true;
    if (feedback) { feedback.hidden = false; feedback.textContent = 'ZIP 파일 선택 창을 여는 중입니다.'; }
    try {
      const selected = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/import-archive/select`, {});
      if (selected.cancelled) {
        if (feedback) { feedback.hidden = false; feedback.textContent = '파일 선택을 취소했습니다.'; }
        return;
      }
      if (panel) panel.dataset.archiveToken = selected.selection_token;
      siteHostingImportAnalysis = null;
      siteHostingSetImportStep('upload');
      void siteHostingClearCreatePreview();
      const fileName = document.querySelector('[data-site-import-zip-name]');
      if (fileName) fileName.textContent = selected.name;
      const settingsButton = document.querySelector('[data-site-import-settings]');
      if (settingsButton) settingsButton.disabled = false;
      if (feedback) { feedback.hidden = false; feedback.textContent = 'ZIP을 선택했습니다. 설정을 눌러 분석을 시작하세요.'; }
      siteHostingUpdateCreateSubmitState();
    } catch (error) {
      if (feedback) { feedback.hidden = false; feedback.textContent = error.message || 'ZIP 파일을 선택하지 못했습니다.'; }
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('[data-site-import-settings]')?.addEventListener('click', async (event) => {
    const project = siteHostingSelectedProject;
    const panel = document.getElementById('site-create-zip-panel');
    const token = String(panel?.dataset.archiveToken || '');
    const button = event.currentTarget;
    const feedback = document.querySelector('[data-site-import-zip-feedback]');
    if (!project || !token || !button || button.disabled) return;
    button.disabled = true;
    if (feedback) { feedback.hidden = false; feedback.textContent = 'Astro 프로젝트와 사이트 정보를 분석하고 있습니다.'; }
    try {
      const analysis = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/import-archive/inspect`, { selection_token: token });
      siteHostingImportAnalysis = analysis;
      const name = document.getElementById('site-import-name');
      if (name && !String(name.value || '').trim()) name.value = analysis.suggested?.name || '';
      const previewName = document.querySelector('[data-site-import-preview-name]');
      if (previewName) previewName.textContent = String(name?.value || '').trim() || 'Astro 프로젝트 미리보기';
      const description = document.getElementById('site-import-description');
      if (description) description.value = analysis.suggested?.description || '';
      const indexing = document.getElementById('site-import-search-indexing');
      if (indexing) indexing.checked = analysis.suggested?.search_engine_indexing !== false;
      siteHostingImportedProfileImages = {
        logo: analysis.suggested?.logo_preview || '',
        'share-image': analysis.suggested?.share_image_preview || '',
        favicon: analysis.suggested?.favicon_preview || ''
      };
      siteHostingImportedProfileImageClears = new Set();
      for (const [key, suffix] of [['logo', 'logo'], ['share-image', 'share-image'], ['favicon', 'favicon']]) {
        const image = document.getElementById(`site-import-${suffix}-preview`);
        const empty = document.getElementById(`site-import-${suffix}-empty`);
        const remove = document.querySelector(`[data-site-import-image-remove="${key}"]`);
        if (image) { image.src = siteHostingImportedProfileImages[key]; image.hidden = !siteHostingImportedProfileImages[key]; }
        if (empty) empty.hidden = Boolean(siteHostingImportedProfileImages[key]);
        if (remove) remove.hidden = !siteHostingImportedProfileImages[key];
      }
      siteHostingRenderImportNavigation(analysis.suggested?.navigation || [], analysis.suggested?.post_list_navigation_index ?? null);
      siteHostingApplyImportedIntegrationCapabilities(analysis.integration?.capabilities || {});
      siteHostingSetImportStep('settings');
      siteHostingUpdateCreateSubmitState();
      void siteHostingPreviewImportedSite();
    } catch (error) {
      siteHostingImportAnalysis = null;
      if (feedback) { feedback.hidden = false; feedback.textContent = error.message || 'ZIP을 분석하지 못했습니다.'; }
      siteHostingUpdateCreateSubmitState();
    } finally {
      button.disabled = false;
    }
  });
  document.querySelector('[data-site-import-settings-back]')?.addEventListener('click', () => {
    siteHostingSetImportStep('upload');
    document.querySelector('[data-site-import-settings]')?.focus();
  });
  document.querySelector('[data-site-import-menu-add]')?.addEventListener('click', () => {
    const list = document.querySelector('[data-site-import-navigation]');
    if (!list || list.children.length >= 50) return;
    list.insertAdjacentHTML('beforeend', siteHostingImportMenuRow({}, list.children.length));
    list.lastElementChild?.querySelector('[data-site-import-menu-label]')?.focus();
    siteHostingUpdateImportNavigationNumbers();
    siteHostingMarkCreatePreviewStale();
  });
  document.querySelector('[data-site-import-navigation]')?.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-site-import-menu-remove]');
    if (!remove) return;
    remove.closest('[data-site-import-menu-row]')?.remove();
    siteHostingUpdateImportNavigationNumbers();
    siteHostingMarkCreatePreviewStale();
  });
  for (const [key, suffix, label] of [['logo', 'logo', '로고'], ['share-image', 'share-image', '사이트 대표 이미지'], ['favicon', 'favicon', 'Favicon']]) {
    const input = document.getElementById(`site-import-${suffix}`);
    input?.addEventListener('change', async (event) => {
      const error = document.getElementById(`site-import-${suffix}-error`);
      try {
        const dataUrl = await siteHostingReadProfileImage(event.currentTarget.files?.[0], label);
        if (dataUrl) siteHostingImportedProfileImages[key] = dataUrl;
        if (dataUrl) siteHostingImportedProfileImageClears.delete(key);
        const image = document.getElementById(`site-import-${suffix}-preview`);
        const empty = document.getElementById(`site-import-${suffix}-empty`);
        if (image) { image.src = siteHostingImportedProfileImages[key]; image.hidden = !siteHostingImportedProfileImages[key]; }
        if (empty) empty.hidden = Boolean(siteHostingImportedProfileImages[key]);
        const remove = document.querySelector(`[data-site-import-image-remove="${key}"]`);
        if (remove) remove.hidden = !siteHostingImportedProfileImages[key];
        if (error) { error.hidden = true; error.textContent = ''; }
        event.currentTarget.value = '';
        siteHostingMarkCreatePreviewStale();
      } catch (cause) {
        event.currentTarget.value = '';
        if (error) { error.textContent = cause.message; error.hidden = false; }
      }
    });
  }
  document.getElementById('site-import-name')?.addEventListener('input', (event) => {
    const previewName = document.querySelector('[data-site-import-preview-name]');
    if (previewName) previewName.textContent = event.target.value.trim() || 'Astro 프로젝트 미리보기';
    siteHostingMarkCreatePreviewStale();
    siteHostingUpdateCreateSubmitState();
  });
  document.querySelector('[data-site-create-preview]')?.addEventListener('click', () => void siteHostingPreviewCreateSite());
  document.querySelector('[data-site-create-cancel]')?.addEventListener('click', () => void siteHostingRequestCreateCancel());
  dialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (siteHostingCreateMode === 'create' && !document.getElementById('site-template-detail-view')?.hidden) {
      siteHostingCloseTemplateDetails();
      return;
    }
    void siteHostingRequestCreateCancel();
  });
  dialog?.addEventListener('input', siteHostingUpdateCreateSubmitState);
  dialog?.addEventListener('change', siteHostingUpdateCreateSubmitState);
  dialog?.addEventListener('close', () => {
    if (previewDialog?.open) previewDialog.close();
    void siteHostingClearCreatePreview();
    siteHostingCreateMode = 'create';
    siteHostingEditingImportedSite = false;
    siteHostingEditingSiteId = '';
    dialog.classList.remove('is-site-settings-mode');
    dialog.classList.remove('is-imported-site-settings-mode');
  });
  dialog?.addEventListener('click', (event) => {
    const chooseImportedImage = event.target.closest('[data-site-import-image-choose]');
    if (chooseImportedImage) {
      const key = chooseImportedImage.dataset.siteImportImageChoose;
      document.getElementById(`site-import-${key}`)?.click();
      return;
    }
    const removeImportedImage = event.target.closest('[data-site-import-image-remove]');
    if (removeImportedImage) {
      const key = removeImportedImage.dataset.siteImportImageRemove;
      siteHostingImportedProfileImages[key] = '';
      siteHostingImportedProfileImageClears.add(key);
      document.getElementById(`site-import-${key}`).value = '';
      const image = document.getElementById(`site-import-${key}-preview`);
      const empty = document.getElementById(`site-import-${key}-empty`);
      if (image) { image.removeAttribute('src'); image.hidden = true; }
      if (empty) empty.hidden = false;
      removeImportedImage.hidden = true;
      siteHostingMarkCreatePreviewStale();
      return;
    }
    const closeTemplateDetails = event.target.closest('[data-site-template-details-close]');
    if (closeTemplateDetails) {
      siteHostingCloseTemplateDetails();
      return;
    }
    const templateDetails = event.target.closest('[data-site-template-details]');
    if (templateDetails) {
      siteHostingOpenTemplateDetails(templateDetails.dataset.siteTemplateDetails);
      return;
    }
    const templateChoice = event.target.closest('[data-site-template-select]');
    if (templateChoice) {
      siteHostingSelectedCreateTemplate = templateChoice.dataset.siteTemplateSelect;
      siteHostingRenderCreateTemplates();
      siteHostingRenderCreateSetupInputs();
      siteHostingRenderCreateNavigation();
      siteHostingMarkCreatePreviewStale();
      return;
    }
    const chooseSetupInput = event.target.closest('[data-site-setup-input-select]');
    if (chooseSetupInput) {
      void siteHostingSelectCreateSetupDirectory(chooseSetupInput);
      return;
    }
    const removeImage = event.target.closest('[data-site-profile-image-remove]');
    if (removeImage) {
      const key = removeImage.dataset.siteProfileImageRemove;
      const options = siteHostingProfileImageOptions(key);
      if (!options) return;
      const imageInput = document.getElementById(options.inputId);
      if (imageInput) imageInput.value = '';
      siteHostingProfileImages[key] = '';
      if (siteHostingEditingImportedSite) siteHostingImportedProfileImageClears.add(key);
      siteHostingSetProfileImagePreview({ ...options, dataUrl: '' });
      const error = document.getElementById(options.errorId);
      if (error) { error.hidden = true; error.textContent = ''; }
      siteHostingMarkCreatePreviewStale();
      return;
    }
    const chooseImage = event.target.closest('[data-site-profile-image-choose]');
    if (chooseImage) {
      const options = siteHostingProfileImageOptions(chooseImage.dataset.siteProfileImageChoose);
      if (options) document.getElementById(options.inputId)?.click();
      return;
    }
    if (event.target.closest('[data-site-menu-add]')) {
      siteHostingAddCreateMenuRow();
      siteHostingMarkCreatePreviewStale();
      return;
    }
    const cancelMenuRemoval = event.target.closest('[data-site-menu-remove-cancel]');
    const confirmMenuRemoval = event.target.closest('[data-site-menu-remove-confirm]');
    const removeMenu = event.target.closest('[data-site-menu-remove]');
    const row = (cancelMenuRemoval || confirmMenuRemoval || removeMenu)?.closest('[data-site-menu-row]');
    if (cancelMenuRemoval) {
      row?.classList.remove('is-confirming-remove');
      const confirmation = row?.querySelector('[data-site-menu-remove-confirmation]');
      if (confirmation) confirmation.hidden = true;
      row?.querySelector('[data-site-menu-remove]')?.focus();
      return;
    }
    if (confirmMenuRemoval) {
      row?.remove();
      siteHostingRefreshCreateMenuRows();
      siteHostingMarkCreatePreviewStale();
      return;
    }
    if (!removeMenu || !row) return;
    const removesPostList = row.querySelector('input[name="site-post-list-menu"]')?.checked === true;
    const confirmation = row.querySelector('[data-site-menu-remove-confirmation]');
    const message = row.querySelector('[data-site-menu-remove-message]');
    if (!confirmation || !message) return;
    message.textContent = removesPostList
      ? '삭제하면 이 사이트로 블로그 글을 발행할 수 없습니다. 삭제할까요?'
      : '이 메뉴를 삭제할까요?';
    row.classList.add('is-confirming-remove');
    confirmation.hidden = false;
    confirmation.querySelector('[data-site-menu-remove-confirm]')?.focus();
  });
  document.getElementById('site-name')?.addEventListener('input', (event) => event.currentTarget.removeAttribute('aria-invalid'));
  for (const key of Object.keys(SITE_PROFILE_IMAGE_LABELS)) {
    const options = siteHostingProfileImageOptions(key);
    document.getElementById(options.inputId)?.addEventListener('change', async (event) => {
      const input = event.currentTarget;
      const error = document.getElementById(options.errorId);
      try {
        const selected = await siteHostingReadProfileImage(input.files?.[0], SITE_PROFILE_IMAGE_LABELS[key]);
        if (selected) {
          siteHostingProfileImages[key] = selected;
          siteHostingImportedProfileImageClears.delete(key);
        }
        siteHostingSetProfileImagePreview({ ...options, dataUrl: siteHostingProfileImages[key] });
        if (error) { error.hidden = true; error.textContent = ''; }
        input.value = '';
        siteHostingMarkCreatePreviewStale();
      } catch (cause) {
        input.value = '';
        if (error) { error.textContent = cause.message; error.hidden = false; }
      }
    });
  }
  dialog?.addEventListener('input', (event) => {
    const field = event.target;
    if (field.matches('[data-site-setup-field]')) {
      const inputId = field.dataset.siteSetupId;
      const key = field.dataset.siteSetupField;
      siteHostingCreateSetupInputs[inputId] = {
        ...(siteHostingCreateSetupInputs[inputId] || {}),
        [key]: field.value
      };
      field.removeAttribute('aria-invalid');
      siteHostingMarkCreatePreviewStale();
    }
    if (field.matches('#site-name, #site-description, [data-site-menu-label], [data-site-menu-href], #site-import-name, #site-import-description, [data-site-import-menu-label], [data-site-import-menu-href]')) siteHostingMarkCreatePreviewStale();
    if (field.matches('#site-name')) field.removeAttribute('aria-invalid');
    if (!field.matches('[data-site-menu-label], [data-site-menu-href], [data-site-import-menu-label], [data-site-import-menu-href]')) return;
    field.removeAttribute('aria-invalid');
    const row = field.closest('[data-site-menu-row]');
    if (field.matches('[data-site-import-menu-label], [data-site-import-menu-href]')) {
      const importRow = field.closest('[data-site-import-menu-row]');
      const error = importRow?.querySelector('[data-site-import-menu-error]');
      if (error) { error.hidden = true; error.textContent = ''; }
      if (field.matches('[data-site-import-menu-label]')) {
        const href = importRow?.querySelector('[data-site-import-menu-href]');
        if (!String(href?.value || '').trim()) href.placeholder = siteHostingSuggestMenuPath(field.value);
      }
      return;
    }
    const inlineError = row?.querySelector('[data-site-menu-error]');
    if (inlineError) {
      inlineError.hidden = true;
      inlineError.textContent = '';
    }
    if (field.matches('[data-site-menu-label]')) {
      const href = row?.querySelector('[data-site-menu-href]');
      if (href?.dataset.hasDefault !== 'true') href.placeholder = siteHostingSuggestMenuPath(field.value);
    }
  });
  dialog?.addEventListener('change', (event) => {
    const field = event.target;
    if (!field.matches('[data-site-setup-mode]')) return;
    const inputId = field.dataset.siteSetupId;
    siteHostingCreateSetupInputs[inputId] = field.value === 'all'
      ? { ...(siteHostingCreateSetupInputs[inputId] || {}), mode: 'all' }
      : { mode: 'frontmatter', ...(siteHostingCreateSetupInputs[inputId] || {}) };
    const fields = field.closest('.site-template-setup-input')?.querySelector('.site-template-match-fields');
    if (fields) {
      const disabled = field.value === 'all';
      fields.setAttribute('aria-disabled', String(disabled));
      fields.classList.toggle('is-disabled', disabled);
      fields.querySelectorAll('input').forEach((input) => { input.disabled = disabled; });
    }
    siteHostingMarkCreatePreviewStale();
  });
  dialog?.addEventListener('change', (event) => {
    if (event.target.matches('input[name="site-post-list-menu"], #site-search-indexing, #site-import-search-indexing')) siteHostingMarkCreatePreviewStale();
  });
}
async function siteHostingOpenCreateSiteDialog() {
  const dialog = document.getElementById('site-create-dialog');
  const input = document.getElementById('site-name');
  const templateInput = document.getElementById('site-template-id');
  const templateGrid = document.getElementById('site-template-grid');
  const feedback = document.getElementById('site-create-feedback');
  const submit = document.querySelector('#site-create-form [type="submit"]');
  const previewButton = document.querySelector('[data-site-create-preview]');
  const templatePanel = document.getElementById('site-create-template-panel');
  if (!dialog || dialog.open || !siteHostingSelectedProject) return;
  siteHostingCreateMode = 'create';
  siteHostingImportStep = 'upload';
  siteHostingEditingImportedSite = false;
  dialog.classList.remove('is-imported-site-settings-mode');
  previewButton?.removeAttribute('hidden');
  siteHostingCreatePreviewSnapshot = '';
  siteHostingEditingSiteId = '';
  dialog.classList.remove('is-site-settings-mode');
  dialog.classList.remove('is-import-settings-step');
  siteHostingSetCreateModeTab('template');
  document.getElementById('site-template-picker-title').textContent = '템플릿';
  document.getElementById('site-template-grid').hidden = false;
  document.getElementById('site-template-detail-view').hidden = true;
  document.getElementById('site-settings-current-preview').hidden = true;
  document.getElementById('site-settings-template-summary').hidden = true;
  document.getElementById('site-create-title').textContent = '사이트 만들기';
  document.querySelector('#site-create-dialog .ui-transaction-dialog-header p').textContent = '템플릿을 고르고 사이트 정보를 설정하세요. 미리보기에서 결과를 확인할 수 있습니다.';
  if (submit) submit.textContent = '사이트 만들기';
  input.value = '';
  const zipPanel = document.getElementById('site-create-zip-panel');
  zipPanel?.removeAttribute('data-archive-token');
  siteHostingImportAnalysis = null;
  document.querySelectorAll('[data-site-import-step]').forEach((panel) => { panel.hidden = panel.dataset.siteImportStep !== 'upload'; });
  const importName = document.getElementById('site-import-name');
  if (importName) importName.value = '';
  const importPreviewName = document.querySelector('[data-site-import-preview-name]');
  if (importPreviewName) importPreviewName.textContent = 'Astro 프로젝트 미리보기';
  const importDescription = document.getElementById('site-import-description');
  if (importDescription) importDescription.value = '';
  const importIndexing = document.getElementById('site-import-search-indexing');
  if (importIndexing) importIndexing.checked = true;
  const importNavigation = document.querySelector('[data-site-import-navigation]');
  if (importNavigation) importNavigation.replaceChildren();
  siteHostingImportedProfileImages = { logo: '', 'share-image': '', favicon: '' };
  for (const suffix of ['logo', 'share-image', 'favicon']) {
    const image = document.getElementById(`site-import-${suffix}-preview`);
    const empty = document.getElementById(`site-import-${suffix}-empty`);
    const input = document.getElementById(`site-import-${suffix}`);
    const remove = document.querySelector(`[data-site-import-image-remove="${suffix}"]`);
    const error = document.getElementById(`site-import-${suffix}-error`);
    if (image) { image.removeAttribute('src'); image.hidden = true; }
    if (empty) empty.hidden = false;
    if (input) input.value = '';
    if (remove) remove.hidden = true;
    if (error) { error.hidden = true; error.textContent = ''; }
  }
  const settingsButton = document.querySelector('[data-site-import-settings]');
  if (settingsButton) settingsButton.disabled = true;
  const importFileName = document.querySelector('[data-site-import-zip-name]');
  if (importFileName) importFileName.textContent = '선택한 ZIP 파일이 없습니다.';
  const importFeedback = document.querySelector('[data-site-import-zip-feedback]');
  if (importFeedback) { importFeedback.textContent = ''; importFeedback.hidden = true; }
  const importPreviewFrame = document.querySelector('[data-site-import-preview-frame]');
  if (importPreviewFrame) { importPreviewFrame.hidden = true; importPreviewFrame.removeAttribute('src'); }
  const importPreviewEmpty = document.querySelector('[data-site-import-preview-empty]');
  if (importPreviewEmpty) importPreviewEmpty.hidden = false;
  const importPreviewStatus = document.querySelector('[data-site-import-preview-status]');
  if (importPreviewStatus) { importPreviewStatus.hidden = true; importPreviewStatus.textContent = ''; }
  input.removeAttribute('aria-invalid');
  siteHostingCreateSetupInputs = {};
  document.getElementById('site-description').value = '';
  document.getElementById('site-search-indexing').checked = true;
  feedback.textContent = '';
  templateInput.value = '';
  templateGrid.innerHTML = '<div class="site-template-loading" role="status">템플릿을 불러오는 중…</div>';
  siteHostingCreateTemplates = [];
  siteHostingSelectedCreateTemplate = '';
  document.getElementById('site-template-detail-content').replaceChildren();
  document.getElementById('site-template-detail-view').removeAttribute('data-template-id');
  document.getElementById('site-template-count').textContent = '';
  const templatePreview = document.getElementById('site-create-template-preview');
  if (templatePreview) { templatePreview.removeAttribute('src'); templatePreview.hidden = true; }
  document.getElementById('site-template-detail-view').hidden = true;
  siteHostingProfileImages = { logo: '', 'share-image': '', favicon: '' };
  siteHostingImportedProfileImageClears = new Set();
  for (const key of Object.keys(SITE_PROFILE_IMAGE_LABELS)) {
    const options = siteHostingProfileImageOptions(key);
    const imageInput = document.getElementById(options.inputId);
    if (imageInput) imageInput.value = '';
    const error = document.getElementById(options.errorId);
    if (error) { error.hidden = true; error.textContent = ''; }
    siteHostingSetProfileImagePreview({ ...options, dataUrl: '' });
  }
  void siteHostingClearCreatePreview();
  document.getElementById('site-create-preview-status').textContent = '';
  document.getElementById('site-create-preview-empty').hidden = false;
  document.getElementById('site-navigation-fields').replaceChildren();
  if (templatePanel) templatePanel.inert = true;
  siteHostingCreateInitialSnapshot = '';
  if (submit) submit.disabled = true;
  if (previewButton) {
    previewButton.disabled = true;
  }
  dialog.showModal();
  try {
    const templates = await fetchJson('/api/v1/site-hosting/templates');
    siteHostingCreateTemplates = Array.isArray(templates) ? templates : [];
    if (!siteHostingCreateTemplates.length) throw new Error('사용할 수 있는 템플릿이 없습니다.');
    siteHostingSelectedCreateTemplate = siteHostingCreateTemplates[0].id;
    templateInput.value = siteHostingSelectedCreateTemplate;
    siteHostingRenderCreateTemplates();
    siteHostingRenderCreateSetupInputs();
    siteHostingRenderCreateNavigation();
    if (templatePanel) templatePanel.inert = false;
    siteHostingCreateInitialSnapshot = siteHostingCreateFormSnapshot();
    siteHostingUpdateCreateSubmitState();
    if (previewButton) previewButton.disabled = false;
    requestAnimationFrame(() => input.focus());
  } catch (error) {
    if (templatePanel) templatePanel.inert = true;
    templateGrid.innerHTML = '<p class="site-template-loading" role="alert">템플릿을 불러오지 못했습니다.</p>';
    feedback.textContent = error.message || '템플릿을 불러오지 못했습니다.';
  }
}

async function siteHostingOpenSiteSettingsDialog(siteId) {
  const dialog = document.getElementById('site-create-dialog');
  const project = siteHostingSelectedProject;
  const site = siteHostingSites.find((item) => item.id === siteId);
  if (!dialog || dialog.open || !project || !site) return;
  siteHostingCreateMode = 'settings';
  siteHostingEditingImportedSite = site.source?.kind === 'imported-astro' || site.template_status === 'imported';
  siteHostingCreatePreviewSnapshot = '';
  siteHostingEditingSiteId = siteId;
  siteHostingSetCreateModeTab('template');
  dialog.classList.add('is-site-settings-mode');
  dialog.classList.toggle('is-imported-site-settings-mode', siteHostingEditingImportedSite);
  document.getElementById('site-template-picker-title').textContent = '현재 사이트';
  document.getElementById('site-template-count').textContent = '';
  const currentPreview = document.getElementById('site-settings-current-preview');
  const templateSummary = document.getElementById('site-settings-template-summary');
  const currentPreviewImage = document.getElementById('site-settings-current-preview-image');
  const currentPreviewEmpty = document.getElementById('site-settings-current-preview-empty');
  const previewUrl = site.screenshot_url
    || `/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/screenshot`;
  if (currentPreview && currentPreviewImage && currentPreviewEmpty) {
    currentPreview.hidden = false;
    currentPreviewImage.hidden = true;
    currentPreviewImage.removeAttribute('src');
    currentPreviewImage.alt = `${site.name} 설정 전 미리보기`;
    currentPreviewEmpty.hidden = false;
    currentPreviewImage.onerror = () => {
      currentPreviewImage.hidden = true;
      currentPreviewEmpty.hidden = false;
    };
    currentPreviewImage.onload = () => {
      currentPreviewImage.hidden = false;
      currentPreviewEmpty.hidden = true;
    };
    currentPreviewImage.src = `${previewUrl}?build=${encodeURIComponent(site.screenshot?.latest_build?.build_id || site.last_build?.build_id || site.updated_at || 'current')}`;
  }
  if (templateSummary) templateSummary.hidden = true;
  document.getElementById('site-create-title').textContent = '사이트 설정';
  document.querySelector('#site-create-dialog .ui-transaction-dialog-header p').textContent = siteHostingEditingImportedSite
    ? '가져온 프로젝트의 설정 정보를 불러오고 있습니다.'
    : '설정을 바꾸고 미리보기에서 확인한 뒤 반영하세요. 템플릿은 변경할 수 없습니다.';
  const submit = document.querySelector('#site-create-form [type="submit"]');
  const previewButton = document.querySelector('[data-site-create-preview]');
  const workspace = document.getElementById('site-create-workspace');
  const feedback = document.getElementById('site-create-feedback');
  if (submit) { submit.textContent = '변경사항 반영'; submit.disabled = true; }
  if (previewButton) previewButton.disabled = false;
  if (workspace) workspace.inert = true;
  if (feedback) feedback.textContent = '';
  siteHostingCreateSetupInputs = {};
  siteHostingProfileImages = { logo: '', 'share-image': '', favicon: '' };
  siteHostingImportedProfileImageClears = new Set();
  void siteHostingClearCreatePreview();
  dialog.showModal();
  try {
    const settings = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}`);
    if (siteHostingEditingImportedSite) {
      siteHostingCreateTemplates = [];
      siteHostingSelectedCreateTemplate = '';
      document.getElementById('site-template-id').value = '';
      document.getElementById('site-name').value = settings.name || site.name;
      document.getElementById('site-description').value = settings.customization?.site_description || '';
      document.getElementById('site-search-indexing').checked = settings.customization?.search_engine_indexing !== false;
      document.getElementById('site-template-grid').replaceChildren();
      document.getElementById('site-template-grid').hidden = true;
      document.getElementById('site-template-detail-view').hidden = true;
      document.getElementById('site-template-count').textContent = '';
      document.getElementById('site-template-detail-content').replaceChildren();
      siteHostingCreateSetupInputs = {};
      siteHostingProfileImages = { logo: '', 'share-image': '', favicon: '' };
      siteHostingImportedProfileImageClears = new Set();
      siteHostingRenderImportedSettingsNavigation(settings.customization?.navigation || [], settings.customization?.publishing?.post_list_navigation_index ?? null);
      siteHostingApplyImportedIntegrationCapabilities(settings.integration?.capabilities || {});
      const headerDescription = document.querySelector('#site-create-dialog .ui-transaction-dialog-header p');
      if (headerDescription) headerDescription.textContent = Object.values(settings.integration?.capabilities || {}).some(Boolean)
        ? 'BlogGenius에서 관리하는 설정을 수정합니다. 지원하는 항목은 Astro 프로젝트와 미리보기에 반영됩니다.'
        : '이 프로젝트는 BlogGenius 설정 연동을 제공하지 않아, 사이트 정보만 수정할 수 있습니다.';
      for (const [key, dataKey] of [['logo', 'logo'], ['share-image', 'share_image'], ['favicon', 'favicon']]) {
        const image = settings.customization?.[dataKey] || '';
        siteHostingProfileImages[key] = image;
        const options = siteHostingProfileImageOptions(key);
        siteHostingSetProfileImagePreview({ ...options, dataUrl: image });
        const remove = document.querySelector(options.removeButton);
        if (remove) remove.hidden = !image;
      }
      if (workspace) workspace.inert = false;
      siteHostingCreateInitialSnapshot = siteHostingCreateFormSnapshot();
      siteHostingUpdateCreateSubmitState();
      requestAnimationFrame(() => document.getElementById('site-name')?.focus());
      return;
    }
    const templates = await fetchJson('/api/v1/site-hosting/templates');
    siteHostingCreateTemplates = Array.isArray(templates) ? templates.filter((item) => item.id === settings.template_id) : [];
    if (!siteHostingCreateTemplates.length) throw new Error('현재 템플릿 설정을 불러오지 못했습니다.');
    siteHostingSelectedCreateTemplate = settings.template_id;
    const currentTemplate = siteHostingCreateTemplates[0];
    const summaryName = document.getElementById('site-settings-template-name');
    const summaryFamily = document.getElementById('site-settings-template-family');
    const summaryVersion = document.getElementById('site-settings-template-version');
    if (summaryName) summaryName.textContent = currentTemplate.name || site.template_name || '현재 템플릿';
    if (summaryFamily) summaryFamily.textContent = currentTemplate.family_name || '—';
    if (summaryVersion) summaryVersion.textContent = currentTemplate.version || '—';
    if (templateSummary) templateSummary.hidden = false;
    document.getElementById('site-template-id').value = settings.template_id;
    document.getElementById('site-name').value = settings.name || site.name;
    document.getElementById('site-description').value = settings.customization?.site_description || '';
    document.getElementById('site-search-indexing').checked = settings.customization?.search_engine_indexing !== false;
    document.getElementById('site-template-grid').replaceChildren();
    document.getElementById('site-template-grid').hidden = true;
    document.getElementById('site-template-detail-view').hidden = true;
    document.getElementById('site-template-count').textContent = '';
    document.getElementById('site-template-detail-content').replaceChildren();
    const template = siteHostingCreateTemplates[0];
    siteHostingCreateSetupInputs = { ...(settings.setup_inputs || {}) };
    siteHostingRenderCreateSetupInputs();
    const defaultMenuIds = new Set((template.customization?.find((field) => field.key === 'navigation')?.default || []).map((item) => item.id).filter(Boolean));
    const navigation = Array.isArray(settings.customization?.navigation) ? settings.customization.navigation.map((item) => ({
      ...item, ...(defaultMenuIds.has(item.id) ? {} : { id: '' })
    })) : [];
    const postListIndex = Number(settings.customization?.publishing?.post_list_navigation_index ?? -1);
    const postListRoute = template.publishing?.routes?.listing;
    document.getElementById('site-navigation-fields').innerHTML = navigation.length
      ? `<h3>사이트 메뉴</h3><p>메뉴 이름과 연결할 주소를 수정할 수 있습니다.</p><div class="site-navigation-table"><div class="site-navigation-table-head"><span>항목</span><span>메뉴 이름</span><span>주소</span><span>${postListRoute ? '글 목록' : ''}</span>${template.pages ? '<button class="secondary site-navigation-add" type="button" data-site-menu-add aria-label="메뉴 추가" title="메뉴 추가">+</button>' : '<span></span>'}</div><div class="site-navigation-list" data-site-navigation-list>${navigation.map((item, index) => siteHostingCreateMenuRow(item, index, { postListRoute, selected: index === postListIndex, isDefault: true })).join('')}</div></div><p class="site-navigation-duplicate-warning" data-site-menu-duplicate-warning role="status" hidden></p>`
      : '';
    siteHostingRefreshCreateMenuRows();
    for (const [key, dataKey] of [['logo', 'logo'], ['share-image', 'share_image'], ['favicon', 'favicon']]) {
      const image = settings.customization?.[dataKey] || '';
      siteHostingProfileImages[key] = image;
      const options = siteHostingProfileImageOptions(key);
      siteHostingSetProfileImagePreview({ ...options, dataUrl: image });
      const remove = document.querySelector(options.removeButton);
      if (remove) remove.hidden = !image;
    }
    if (workspace) workspace.inert = false;
    siteHostingCreateInitialSnapshot = siteHostingCreateFormSnapshot();
    siteHostingUpdateCreateSubmitState();
    if (previewButton) previewButton.disabled = false;
    requestAnimationFrame(() => document.getElementById('site-name')?.focus());
  } catch (error) {
    if (workspace) workspace.inert = true;
    if (feedback) feedback.textContent = error.message || '사이트 설정을 불러오지 못했습니다.';
    if (submit) submit.disabled = true;
  }
}

function siteHostingRenderCreateTemplates() {
  const grid = document.getElementById('site-template-grid');
  const templateInput = document.getElementById('site-template-id');
  if (!grid) return;
  const count = document.getElementById('site-template-count');
  if (count) count.textContent = `${siteHostingCreateTemplates.length}개`;
  const families = new Map();
  for (const template of siteHostingCreateTemplates) {
    const key = template.family_id || 'other';
    if (!families.has(key)) families.set(key, { name: template.family_name || '템플릿', templates: [] });
    families.get(key).templates.push(template);
  }
  grid.innerHTML = [...families.values()].map((family) => {
    const cards = family.templates.map((template) => `<article class="site-template-card${template.id === siteHostingSelectedCreateTemplate ? ' is-selected' : ''}">
      <button type="button" class="site-template-card-select" role="radio" aria-checked="${template.id === siteHostingSelectedCreateTemplate}" data-site-template-select="${siteHostingEscapeHtml(template.id)}">
        <span class="site-template-card-preview">${template.preview_url ? `<img src="${siteHostingEscapeHtml(template.preview_url)}" alt="${siteHostingEscapeHtml(template.name)} 미리보기" loading="lazy">` : '<span>미리보기 없음</span>'}</span>
        <span class="site-template-card-copy"><strong>${siteHostingEscapeHtml(template.name)}</strong></span>
      </button>
      <button type="button" class="site-template-card-zoom" data-site-template-details="${siteHostingEscapeHtml(template.id)}" aria-label="${siteHostingEscapeHtml(template.name)} 크게 보기" title="크게 보기"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5M10.8 7.5v6.6M7.5 10.8h6.6"/></svg></button>
    </article>`);
    while (cards.length % 3) cards.push('<span class="site-template-card-placeholder" aria-hidden="true"></span>');
    return `<section class="site-template-family-group"><h4 class="site-template-family-heading">${siteHostingEscapeHtml(family.name)}</h4>${cards.join('')}</section>`;
  }).join('');
  if (templateInput) templateInput.value = siteHostingSelectedCreateTemplate;
}

function siteHostingTemplateDetailsMarkup(template) {
  const metadata = [
    template.family_name ? `<div><dt>계열</dt><dd>${siteHostingEscapeHtml(template.family_name)}</dd></div>` : '',
    template.author ? `<div><dt>작성자</dt><dd>${siteHostingEscapeHtml(template.author)}</dd></div>` : '',
    template.version ? `<div><dt>버전</dt><dd>${siteHostingEscapeHtml(template.version)}</dd></div>` : ''
  ].filter(Boolean).join('');
  const capabilities = [];
  if (template.publishing?.routes?.listing && template.publishing?.routes?.detail) capabilities.push('블로그 글 목록·상세 페이지');
  if (template.pages) capabilities.push('사이트 메뉴 페이지');
  for (const input of Array.isArray(template.setup_inputs) ? template.setup_inputs : []) {
    if (input?.type === 'directory' && input?.purpose === 'knowledge_collection') capabilities.push('Digital Garden Vault 연결');
    if (input?.type === 'frontmatter_match' && input?.purpose === 'publication_filter') capabilities.push('공개 노트 필터');
  }
  return `<div class="site-template-details-heading"><h4 id="site-template-detail-title" tabindex="-1">${siteHostingEscapeHtml(template.name)}</h4></div>
    ${template.description ? `<p>${siteHostingEscapeHtml(template.description)}</p>` : ''}
    ${metadata ? `<dl class="site-template-detail-metadata">${metadata}</dl>` : ''}
    ${capabilities.length ? `<div class="site-template-detail-capabilities"><strong>지원 기능</strong><ul>${capabilities.map((item) => `<li>${siteHostingEscapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
    ${template.homepage_url ? `<a href="${siteHostingEscapeHtml(template.homepage_url)}" target="_blank" rel="noopener noreferrer">템플릿 홈페이지 ↗</a>` : ''}`;
}

function siteHostingOpenTemplateDetails(templateId) {
  const template = siteHostingCreateTemplates.find((item) => item.id === templateId);
  const details = document.getElementById('site-template-detail-view');
  const detailsContent = document.getElementById('site-template-detail-content');
  const image = document.getElementById('site-template-detail-preview-image');
  const empty = document.getElementById('site-template-detail-preview-empty');
  const grid = document.getElementById('site-template-grid');
  if (!template || !details || !detailsContent || !image || !grid || siteHostingCreateMode !== 'create') return;
  details.dataset.templateId = templateId;
  detailsContent.innerHTML = siteHostingTemplateDetailsMarkup(template);
  image.src = template.preview_url || '';
  image.alt = `${template.name} 대표 화면`;
  image.hidden = !template.preview_url;
  if (empty) empty.hidden = Boolean(template.preview_url);
  grid.hidden = true;
  details.hidden = false;
  document.getElementById('site-template-picker-title').textContent = '템플릿 정보';
  document.getElementById('site-template-detail-close').hidden = false;
  const count = document.getElementById('site-template-count');
  if (count) count.textContent = '';
  document.getElementById('site-template-detail-close')?.focus();
}

function siteHostingCloseTemplateDetails() {
  const details = document.getElementById('site-template-detail-view');
  const grid = document.getElementById('site-template-grid');
  if (!details || !grid) return;
  const templateId = details.dataset.templateId;
  details.hidden = true;
  grid.hidden = false;
  document.getElementById('site-template-picker-title').textContent = '템플릿';
  document.getElementById('site-template-detail-close').hidden = true;
  delete details.dataset.templateId;
  const count = document.getElementById('site-template-count');
  if (count) count.textContent = `${siteHostingCreateTemplates.length}개`;
  [...grid.querySelectorAll('[data-site-template-details]')]
    .find((button) => button.dataset.siteTemplateDetails === templateId)?.focus();
}

function siteHostingRenderCreateSetupInputs() {
  const container = document.getElementById('site-template-setup-inputs');
  const template = siteHostingCreateTemplates.find((item) => item.id === siteHostingSelectedCreateTemplate);
  if (!container) return;
  const inputs = Array.isArray(template?.setup_inputs) ? template.setup_inputs : [];
  const supportedInputs = inputs.filter((item) => (item?.type === 'directory' && item?.purpose === 'knowledge_collection')
    || (item?.type === 'frontmatter_match' && item?.purpose === 'publication_filter'));
  if (!supportedInputs.length) {
    container.replaceChildren();
    return;
  }
  container.innerHTML = supportedInputs.map((item) => {
    const label = String(item.label || '템플릿 설정');
    if (item.type === 'frontmatter_match') {
      const configured = siteHostingCreateSetupInputs[item.id] || {};
      const mode = configured.mode === 'all' ? 'all' : 'frontmatter';
      return `<div class="site-project-form-field site-template-setup-input">
        <span>${siteHostingEscapeHtml(label)}${item.required ? ' <b aria-hidden="true">*</b>' : ' <small>선택</small>'}</span>
        <div class="site-publication-mode-options" role="radiogroup" aria-label="공개할 노트 선택">
          <label><input type="radio" name="site-publication-mode-${siteHostingEscapeHtml(item.id)}" value="all" data-site-setup-id="${siteHostingEscapeHtml(item.id)}" data-site-setup-mode ${mode === 'all' ? 'checked' : ''}><span>ALL · Vault의 모든 노트</span></label>
          <label><input type="radio" name="site-publication-mode-${siteHostingEscapeHtml(item.id)}" value="frontmatter" data-site-setup-id="${siteHostingEscapeHtml(item.id)}" data-site-setup-mode ${mode === 'frontmatter' ? 'checked' : ''}><span>Frontmatter 기준으로 선택</span></label>
        </div>
        <div class="site-template-match-fields${mode === 'all' ? ' is-disabled' : ''}" aria-disabled="${mode === 'all'}">
        <div class="site-template-match-row">
          <label><span>Frontmatter 속성</span><input type="text" maxlength="128" data-site-setup-id="${siteHostingEscapeHtml(item.id)}" data-site-setup-field="field" value="${siteHostingEscapeHtml(configured.field || '')}" placeholder="예: is_public" ${mode === 'all' ? 'disabled' : ''}></label>
          <span class="site-template-match-equals" aria-hidden="true">=</span>
          <label><span>일치 값</span><input type="text" maxlength="256" data-site-setup-id="${siteHostingEscapeHtml(item.id)}" data-site-setup-field="value" value="${siteHostingEscapeHtml(configured.value || '')}" placeholder="예: true" ${mode === 'all' ? 'disabled' : ''}></label>
        </div>
        <small>속성명과 일치값을 모두 입력해 주세요.</small>
        </div>
      </div>`;
    }
    const selectedPath = siteHostingCreateSetupInputs[item.id] || '';
    return `<div class="site-project-form-field site-template-setup-input">
      <span>${siteHostingEscapeHtml(label)}${item.required ? ' <b aria-hidden="true">*</b>' : ' <small>선택</small>'}</span>
      <div class="site-template-setup-input-row">
        <span class="site-template-setup-input-path${selectedPath ? ' is-selected' : ''}" title="${siteHostingEscapeHtml(selectedPath)}">${selectedPath ? siteHostingEscapeHtml(selectedPath) : '아직 선택하지 않았습니다'}</span>
        <button class="secondary" type="button" data-site-setup-input-select="${siteHostingEscapeHtml(item.id)}">${selectedPath ? '폴더 변경' : 'Vault root 선택'}</button>
      </div>
      <small>사이트 생성 시 Vault root 경로를 저장합니다. Vault 내용 변환은 다음 단계에서 연결합니다.</small>
    </div>`;
  }).join('');
}

async function siteHostingSelectCreateSetupDirectory(button) {
  const templateId = siteHostingSelectedCreateTemplate;
  const inputId = String(button?.dataset.siteSetupInputSelect || '');
  if (!templateId || !inputId || button.disabled) return;
  const feedback = document.getElementById('site-create-feedback');
  button.disabled = true;
  button.classList.add('is-loading');
  if (feedback) feedback.textContent = '';
  try {
    const result = await postJson(`/api/v1/site-hosting/templates/${encodeURIComponent(templateId)}/setup-inputs/${encodeURIComponent(inputId)}/select-directory`, {});
    if (result?.cancelled) return;
    siteHostingCreateSetupInputs[inputId] = String(result?.path || '');
    siteHostingRenderCreateSetupInputs();
    siteHostingUpdateCreateSubmitState();
    siteHostingMarkCreatePreviewStale();
  } catch (error) {
    if (feedback) feedback.textContent = error.message || 'Vault 폴더를 선택하지 못했습니다.';
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
  }
}
