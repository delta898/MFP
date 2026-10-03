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
  container.innerHTML = `<h3>사이트 메뉴</h3><p>메뉴 이름과 연결할 주소를 정하세요. 비워 두면 제안된 주소를 사용합니다.</p><div class="site-navigation-table"><div class="site-navigation-table-head" aria-hidden="true"><span>항목</span><span>메뉴 이름</span><span>주소</span><span>${postListRoute ? '글 목록' : ''}</span><span></span></div><div class="site-navigation-list" data-site-navigation-list>${navigation.map((item, index) => siteHostingCreateMenuRow(item, index, { postListRoute, selected: index === defaultPostListIndex, isDefault: true })).join('')}</div></div>${template?.pages ? '<button class="secondary site-navigation-add" type="button" data-site-menu-add>메뉴 추가</button>' : ''}`;
}

function siteHostingCreateMenuRow(item = {}, index = 0, options = {}) {
  const label = String(item.label || '');
  const href = String(item.href || '');
  const rowNumber = index + 1;
  return `<div class="site-navigation-row" data-site-menu-row>
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

async function siteHostingCreateSite(event) {
  event.preventDefault();
  const project = siteHostingSelectedProject;
  const form = event.currentTarget;
  const input = document.getElementById('site-name');
  const templateInput = document.getElementById('site-template-id');
  const feedback = document.getElementById('site-create-feedback');
  const submit = form.querySelector('[type="submit"]');
  const name = String(input?.value || '').trim();
  if (!name || !templateInput?.value || !project) {
    if (!name) {
      input?.setAttribute('aria-invalid', 'true');
      input?.focus();
    }
    return;
  }
  submit.disabled = true;
  submit.classList.add('is-loading');
  try {
    const logoInput = document.getElementById('site-logo');
    const logo = await siteHostingReadLogo(logoInput?.files?.[0]);
    const selectedTemplate = siteHostingCreateTemplates.find((template) => template.id === templateInput.value);
    const navigationDefaults = selectedTemplate?.customization?.find((field) => field.key === 'navigation')?.default;
    const menuRows = [...document.querySelectorAll('#site-navigation-fields [data-site-menu-row]')];
    document.querySelectorAll('#site-navigation-fields [data-site-menu-href], #site-navigation-fields [data-site-menu-label]')
      .forEach((field) => field.removeAttribute('aria-invalid'));
    document.querySelectorAll('#site-navigation-fields [data-site-menu-error]')
      .forEach((error) => { error.hidden = true; error.textContent = ''; });
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
        return { label, href: siteHostingNormalizeMenuPath(hrefInput?.value, fallback, label) };
      } catch (error) {
        siteHostingShowMenuError(hrefInput, error.message);
        return null;
      }
    }) : undefined;
    if (navigation?.some((item) => !item)) {
      document.querySelector('#site-navigation-fields [aria-invalid="true"]')?.focus();
      return;
    }
    const postListRoute = selectedTemplate?.publishing?.routes?.listing;
    const postListSelection = postListRoute ? document.querySelector('input[name="site-post-list-menu"]:checked') : null;
    const selectedMenuIndex = postListSelection ? menuRows.indexOf(postListSelection.closest('[data-site-menu-row]')) : -1;
    if (postListRoute && selectedMenuIndex < 0) {
      feedback.textContent = '글 목록으로 연결할 메뉴를 선택해 주세요.';
      return;
    }
    const site = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`, {
      name, template_id: templateInput.value,
      customization: {
        ...(logo ? { logo } : {}),
        ...(navigation ? { navigation } : {}),
        ...(postListSelection ? { publishing: { post_list_navigation_index: selectedMenuIndex } } : {})
      }
    });
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
  document.getElementById('site-create-form')?.addEventListener('submit', (event) => void siteHostingCreateSite(event));
  dialog?.addEventListener('click', (event) => {
    const templateChoice = event.target.closest('[data-site-template-select]');
    if (templateChoice) {
      siteHostingSelectedCreateTemplate = templateChoice.dataset.siteTemplateSelect;
      siteHostingRenderCreateTemplates();
      siteHostingRenderCreateNavigation();
      return;
    }
    if (event.target.closest('[data-site-logo-remove]')) {
      const logoInput = document.getElementById('site-logo');
      const preview = document.getElementById('site-logo-preview');
      if (logoInput) logoInput.value = '';
      if (preview) preview.hidden = true;
      siteHostingLogoDataUrl = '';
      return;
    }
    if (event.target.closest('[data-site-menu-add]')) return siteHostingAddCreateMenuRow();
    if (!event.target.closest('[data-site-menu-remove]')) return;
    event.target.closest('[data-site-menu-row]')?.remove();
    siteHostingRefreshCreateMenuRows();
    const radios = [...document.querySelectorAll('#site-navigation-fields input[name="site-post-list-menu"]')];
    if (radios.length && !radios.some((radio) => radio.checked)) radios[0].checked = true;
  });
  document.getElementById('site-name')?.addEventListener('input', (event) => event.currentTarget.removeAttribute('aria-invalid'));
  dialog?.addEventListener('input', (event) => {
    const field = event.target;
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
}
