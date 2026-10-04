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
    <span class="site-navigation-field-error" data-site-menu-error hidden></span>
  </div>`;
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
  const max = defaults.length + Number(template?.pages?.max_items || 0);
  const addButton = document.querySelector('#site-navigation-fields [data-site-menu-add]');
  if (addButton) addButton.disabled = list.children.length >= max;
  list.querySelectorAll('[data-site-menu-remove]').forEach((button) => { button.disabled = list.children.length <= 1; });
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
  const navigationDefaults = selectedTemplate?.customization?.find((field) => field.key === 'navigation')?.default;
  const menuRows = [...document.querySelectorAll('#site-navigation-fields [data-site-menu-row]')];
  const logoError = document.getElementById('site-logo-error');
  if (logoError) { logoError.hidden = true; logoError.textContent = ''; }
  if (feedback) feedback.textContent = '';
  document.querySelectorAll('#site-navigation-fields [data-site-menu-href], #site-navigation-fields [data-site-menu-label]')
    .forEach((field) => field.removeAttribute('aria-invalid'));
  document.querySelectorAll('#site-navigation-fields [data-site-menu-error]')
    .forEach((error) => { error.hidden = true; error.textContent = ''; });
  const duplicateWarning = document.querySelector('#site-navigation-fields [data-site-menu-duplicate-warning]');
  if (duplicateWarning) { duplicateWarning.hidden = true; duplicateWarning.textContent = ''; }
  let logo = siteHostingLogoDataUrl;
  const logoInput = document.getElementById('site-logo');
  if (logoInput?.files?.[0]) {
    try { logo = await siteHostingReadLogo(logoInput.files[0]); }
    catch (error) {
      if (logoError) { logoError.textContent = error.message; logoError.hidden = false; }
      logoInput.focus();
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
  if (postListRoute && selectedMenuIndex < 0) {
    if (feedback) feedback.textContent = '글 목록으로 연결할 메뉴를 선택해 주세요.';
    return null;
  }
  return {
    name,
    template_id: templateInput.value,
    customization: {
      ...(logo ? { logo } : {}),
      ...(navigation ? { navigation } : {}),
      ...(postListSelection ? { publishing: { post_list_navigation_index: selectedMenuIndex } } : {})
    }
  };
}

async function siteHostingCreateSite(event) {
  event.preventDefault();
  const project = siteHostingSelectedProject;
  const form = event.currentTarget;
  const feedback = document.getElementById('site-create-feedback');
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.classList.add('is-loading');
  try {
    const payload = await siteHostingCollectCreatePayload();
    if (!payload) return;
    const site = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`, payload);
    document.getElementById('site-create-dialog')?.close();
    try {
      siteHostingSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
    } catch (_refreshError) {
      siteHostingSites = [...siteHostingSites, site];
    }
    siteHostingSelectedProject.site_count = siteHostingSites.length;
    siteHostingSiteLoadState = 'ready';
    siteHostingRenderProjectDetail();
    siteHostingSetFeedback('사이트를 만들었습니다.', 'success');
  } catch (error) {
    if (feedback) feedback.textContent = error.message || '사이트를 만들지 못했습니다.';
  } finally {
    submit.disabled = false;
    submit.classList.remove('is-loading');
  }
}

function siteHostingSetLogoPreview(dataUrl) {
  const image = document.getElementById('site-logo-image');
  const empty = document.getElementById('site-logo-empty');
  const choose = document.querySelector('[data-site-logo-choose]');
  const remove = document.querySelector('[data-site-logo-remove]');
  if (image) {
    if (dataUrl) image.src = dataUrl;
    else image.removeAttribute('src');
    image.hidden = !dataUrl;
  }
  if (empty) empty.hidden = Boolean(dataUrl);
  if (choose) choose.textContent = dataUrl ? '이미지 변경' : '이미지 선택';
  if (remove) remove.hidden = !dataUrl;
}

function siteHostingMarkCreatePreviewStale() {
  if (!siteHostingCreatePreviewId) return;
  const status = document.getElementById('site-create-preview-status');
  if (status) status.textContent = '설정 변경됨 · 다시 미리보기 하세요';
}

async function siteHostingClearCreatePreview() {
  const project = siteHostingSelectedProject;
  const previewId = siteHostingCreatePreviewId;
  siteHostingCreatePreviewId = '';
  const frame = document.getElementById('site-create-preview-frame');
  if (frame) { frame.hidden = true; frame.removeAttribute('src'); }
  if (previewId && project) {
    try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(previewId)}`); } catch (_error) { }
  }
}

async function siteHostingPreviewCreateSite() {
  const project = siteHostingSelectedProject;
  const button = document.querySelector('[data-site-create-preview]');
  const feedback = document.getElementById('site-create-feedback');
  const busy = document.getElementById('site-create-preview-busy');
  const image = document.getElementById('site-create-template-preview');
  const frame = document.getElementById('site-create-preview-frame');
  const empty = document.getElementById('site-create-preview-empty');
  const status = document.getElementById('site-create-preview-status');
  if (!project || !button || button.disabled) return;
  const payload = await siteHostingCollectCreatePayload({ allowEmptyName: true });
  if (!payload) return;
  const previewDialog = document.getElementById('site-create-preview-dialog');
  if (previewDialog && !previewDialog.open) previewDialog.showModal();
  const previousPreviewId = siteHostingCreatePreviewId;
  button.disabled = true;
  button.classList.add('is-loading');
  if (busy) busy.hidden = false;
  if (status) status.textContent = '사이트를 빌드하고 있습니다.';
  if (feedback) feedback.textContent = '';
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts`, payload);
    if (document.getElementById('site-create-dialog')?.open) {
      if (frame) { frame.src = result.url; frame.hidden = false; }
      if (image) image.hidden = true;
      if (empty) empty.hidden = true;
      siteHostingCreatePreviewId = result.id;
      if (status) status.textContent = '미리보기 완료';
      if (previousPreviewId) {
        try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(previousPreviewId)}`); } catch (_error) { }
      }
    } else {
      try { await deleteJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/preview-drafts/${encodeURIComponent(result.id)}`); } catch (_error) { }
    }
  } catch (error) {
    if (feedback) feedback.textContent = error.message || '미리보기를 만들지 못했습니다.';
    if (status) status.textContent = siteHostingCreatePreviewId ? '이전 미리보기를 유지합니다.' : '미리보기 실패';
    if (empty && !siteHostingCreatePreviewId) {
      empty.textContent = '미리보기를 만들지 못했습니다.\n설정을 확인하고 다시 시도하세요.';
      empty.hidden = false;
    }
  } finally {
    if (busy) busy.hidden = true;
    button.disabled = false;
    button.classList.remove('is-loading');
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

function siteHostingBindCreateDialogEvents() {
  const dialog = document.getElementById('site-create-dialog');
  const previewDialog = document.getElementById('site-create-preview-dialog');
  document.getElementById('site-create-form')?.addEventListener('submit', (event) => void siteHostingCreateSite(event));
  document.querySelector('[data-site-create-preview]')?.addEventListener('click', () => void siteHostingPreviewCreateSite());
  dialog?.addEventListener('close', () => {
    if (previewDialog?.open) previewDialog.close();
    void siteHostingClearCreatePreview();
  });
  dialog?.addEventListener('click', (event) => {
    const templateChoice = event.target.closest('[data-site-template-select]');
    if (templateChoice) {
      siteHostingSelectedCreateTemplate = templateChoice.dataset.siteTemplateSelect;
      siteHostingRenderCreateTemplates();
      siteHostingRenderCreateNavigation();
      siteHostingMarkCreatePreviewStale();
      return;
    }
    if (event.target.closest('[data-site-logo-remove]')) {
      const logoInput = document.getElementById('site-logo');
      if (logoInput) logoInput.value = '';
      siteHostingLogoDataUrl = '';
      siteHostingSetLogoPreview('');
      const error = document.getElementById('site-logo-error');
      if (error) { error.hidden = true; error.textContent = ''; }
      siteHostingMarkCreatePreviewStale();
      return;
    }
    if (event.target.closest('[data-site-logo-choose]')) {
      document.getElementById('site-logo')?.click();
      return;
    }
    if (event.target.closest('[data-site-menu-add]')) {
      siteHostingAddCreateMenuRow();
      siteHostingMarkCreatePreviewStale();
      return;
    }
    if (!event.target.closest('[data-site-menu-remove]')) return;
    event.target.closest('[data-site-menu-row]')?.remove();
    siteHostingRefreshCreateMenuRows();
    siteHostingMarkCreatePreviewStale();
    const radios = [...document.querySelectorAll('#site-navigation-fields input[name="site-post-list-menu"]')];
    if (radios.length && !radios.some((radio) => radio.checked)) radios[0].checked = true;
  });
  document.getElementById('site-name')?.addEventListener('input', (event) => event.currentTarget.removeAttribute('aria-invalid'));
  document.getElementById('site-logo')?.addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const error = document.getElementById('site-logo-error');
    try {
      const selected = await siteHostingReadLogo(input.files?.[0]);
      if (selected) siteHostingLogoDataUrl = selected;
      siteHostingSetLogoPreview(siteHostingLogoDataUrl);
      if (error) { error.hidden = true; error.textContent = ''; }
      input.value = '';
      siteHostingMarkCreatePreviewStale();
    } catch (cause) {
      input.value = '';
      if (error) { error.textContent = cause.message; error.hidden = false; }
    }
  });
  dialog?.addEventListener('input', (event) => {
    const field = event.target;
    if (field.matches('#site-name, [data-site-menu-label], [data-site-menu-href]')) siteHostingMarkCreatePreviewStale();
    if (field.matches('#site-name')) field.removeAttribute('aria-invalid');
    if (!field.matches('[data-site-menu-label], [data-site-menu-href]')) return;
    field.removeAttribute('aria-invalid');
    const row = field.closest('[data-site-menu-row]');
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
    if (event.target.matches('input[name="site-post-list-menu"]')) siteHostingMarkCreatePreviewStale();
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
  if (!dialog || dialog.open || !siteHostingSelectedProject) return;
  input.value = '';
  input.removeAttribute('aria-invalid');
  feedback.textContent = '';
  templateInput.value = '';
  templateGrid.innerHTML = '<div class="site-template-loading" role="status">템플릿을 불러오는 중…</div>';
  siteHostingCreateTemplates = [];
  siteHostingSelectedCreateTemplate = '';
  document.getElementById('site-template-details').replaceChildren();
  document.getElementById('site-template-count').textContent = '';
  const templatePreview = document.getElementById('site-create-template-preview');
  if (templatePreview) { templatePreview.removeAttribute('src'); templatePreview.hidden = true; }
  siteHostingLogoDataUrl = '';
  const logoInput = document.getElementById('site-logo');
  if (logoInput) logoInput.value = '';
  siteHostingSetLogoPreview('');
  void siteHostingClearCreatePreview();
  document.getElementById('site-create-preview-status').textContent = '';
  document.getElementById('site-create-preview-empty').hidden = false;
  document.getElementById('site-create-preview-busy').hidden = true;
  document.getElementById('site-navigation-fields').replaceChildren();
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
    siteHostingRenderCreateNavigation();
    if (submit) submit.disabled = false;
    if (previewButton) previewButton.disabled = false;
    requestAnimationFrame(() => input.focus());
  } catch (error) {
    templateGrid.innerHTML = '<p class="site-template-loading" role="alert">템플릿을 불러오지 못했습니다.</p>';
    feedback.textContent = error.message || '템플릿을 불러오지 못했습니다.';
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
    </article>`);
    while (cards.length % 3) cards.push('<span class="site-template-card-placeholder" aria-hidden="true"></span>');
    return `<section class="site-template-family-group"><h4 class="site-template-family-heading">${siteHostingEscapeHtml(family.name)}</h4>${cards.join('')}</section>`;
  }).join('');
  if (templateInput) templateInput.value = siteHostingSelectedCreateTemplate;
  siteHostingRenderCreateTemplateDetails();
}

function siteHostingRenderCreateTemplateDetails() {
  const template = siteHostingCreateTemplates.find((item) => item.id === siteHostingSelectedCreateTemplate);
  const details = document.getElementById('site-template-details');
  const image = document.getElementById('site-create-template-preview');
  const frame = document.getElementById('site-create-preview-frame');
  const empty = document.getElementById('site-create-preview-empty');
  if (!details || !image || !template) return;
  details.innerHTML = `<div class="site-template-details-heading"><strong>${siteHostingEscapeHtml(template.name)}</strong><span>제작자 · ${siteHostingEscapeHtml(template.author || '정보 없음')}</span></div><p>${siteHostingEscapeHtml(template.description || '')}</p>${template.homepage_url ? `<a href="${siteHostingEscapeHtml(template.homepage_url)}" target="_blank" rel="noopener noreferrer">템플릿 홈페이지 ↗</a>` : ''}`;
  const hasBuiltPreview = Boolean(siteHostingCreatePreviewId);
  image.src = template.preview_url || '';
  image.alt = `${template.name} 대표 미리보기`;
  image.hidden = hasBuiltPreview || !template.preview_url;
  if (frame) {
    frame.hidden = !hasBuiltPreview;
    if (!hasBuiltPreview) frame.removeAttribute('src');
  }
  if (empty) empty.hidden = hasBuiltPreview || Boolean(template.preview_url);
  const status = document.getElementById('site-create-preview-status');
  if (status) status.textContent = hasBuiltPreview ? '설정 변경됨 · 이전 미리보기' : '템플릿 대표 화면';
}
