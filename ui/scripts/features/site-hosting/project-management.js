let siteHostingProjectsBound = false;
let siteHostingProjects = [];
let siteHostingSelectedProject = null;
let siteHostingProjectView = 'sites';
let siteHostingProjectBusy = false;
let siteHostingProjectListMode = false;
let siteHostingSites = [];
let siteHostingOperationStates = new Map();
let siteHostingSiteLoadState = 'idle';
let siteHostingSelectedSiteId = '';
let siteHostingZoneChoices = [];
let siteHostingZoneStatus = 'idle';
let siteHostingZoneMessage = '';

function siteHostingEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function siteHostingSetFeedback(message = '', tone = 'neutral') {
  const feedback = document.getElementById('site-hosting-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.hidden = !message;
  feedback.dataset.state = tone === 'danger' ? 'error' : tone;
}

function siteHostingDateLabel(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date);
}

function siteHostingProjectCard(project) {
  const count = Number(project.site_count || 0);
  const updated = siteHostingDateLabel(project.updated_at);
  return `<article class="site-hosting-project-card" role="listitem">
    <button type="button" data-site-project-open="${siteHostingEscapeHtml(project.id)}">
      <span class="site-hosting-project-card-copy">
        <strong>${siteHostingEscapeHtml(project.name)}</strong>
        <span>${siteHostingEscapeHtml(project.root_domain || '도메인 미설정')}</span>
      </span>
      <span class="site-hosting-project-card-meta">사이트 ${count}개${updated ? ` · ${siteHostingEscapeHtml(updated)} 수정` : ''}</span>
    </button>
  </article>`;
}

function siteHostingSiteCard(site) {
  const siteId = siteHostingEscapeHtml(site.id);
  const operation = siteHostingOperationStates.get(`${site.project_id}:${site.id}`) || null;
  const localState = site.template_status === 'unavailable'
    ? { label: '확인 필요', state: 'error' }
    : { label: '로컬 준비됨', state: 'success' };
  const deploymentState = site.deployment?.url
    ? { label: '배포됨', state: 'success' }
    : { label: '미배포', state: 'neutral' };
  const message = siteHostingSiteMessage(site, operation);
  const screenshot = site.screenshot_url
    ? `<img src="${siteHostingEscapeHtml(site.screenshot_url)}?build=${siteHostingEscapeHtml(site.screenshot?.latest_build?.build_id || site.screenshot?.template?.path || 'template')}" alt="${siteHostingEscapeHtml(site.name)} 미리보기" loading="lazy">`
    : '';
  return `<article class="site-hosting-site-card" role="listitem">
    <div class="site-hosting-site-preview" aria-label="사이트 스크린샷">${screenshot}</div>
    <div class="site-hosting-site-card-content">
      <strong>${siteHostingEscapeHtml(site.name)}</strong>
      <div class="site-hosting-site-badges" aria-label="사이트 상태">
        <span class="site-hosting-site-status" data-state="${localState.state}">로컬 · ${localState.label}</span>
        <span class="site-hosting-site-status" data-state="${deploymentState.state}">배포 · ${deploymentState.label}</span>
      </div>
      <div class="site-hosting-site-message" data-site-message="${siteId}" role="status" aria-live="polite">${message}</div>
      <div class="site-hosting-project-actions">
        <button class="secondary" type="button" data-site-settings="${siteId}">설정</button>
        <button class="secondary" type="button" data-site-preview="${siteId}">미리보기</button>
        <button class="secondary" type="button" data-site-open-folder="${siteId}">폴더 열기</button>
        <button class="primary" type="button" data-site-deploy="${siteId}">배포</button>
      </div>
    </div>
  </article>`;
}

function siteHostingSiteMessage(site, operation) {
  const links = [];
  const workerUrl = String(site.deployment?.url || '');
  const customDomain = String(site.custom_domain_binding?.hostname || site.custom_domain || '');
  if (workerUrl) links.push(`<a href="${siteHostingEscapeHtml(workerUrl)}" target="_blank" rel="noopener noreferrer">Worker 주소</a>`);
  if (customDomain) {
    const url = /^https?:\/\//i.test(customDomain) ? customDomain : `https://${customDomain}`;
    links.push(`<a href="${siteHostingEscapeHtml(url)}" target="_blank" rel="noopener noreferrer">사용자 도메인</a>`);
  }
  if (operation?.phase === 'running') {
    return `<span data-state="pending">${siteHostingEscapeHtml(operation.message)}</span>${links.length ? `<div class="site-hosting-site-message-links">${links.join(' · ')}</div>` : ''}`;
  }
  if (operation?.phase === 'error') {
    return `<span data-state="error">${siteHostingEscapeHtml(operation.message)}</span>${links.length ? `<div class="site-hosting-site-message-links">${links.join(' · ')}</div>` : ''}`;
  }
  if (operation?.phase === 'success') {
    return `<span data-state="success">${siteHostingEscapeHtml(operation.message)}</span>${links.length ? `<div class="site-hosting-site-message-links">${links.join(' · ')}</div>` : ''}`;
  }
  if (links.length) return `<div class="site-hosting-site-message-links">${links.join(' · ')}</div>`;
  return '<span data-state="neutral">아직 빌드하거나 배포한 결과가 없습니다.</span>';
}

function siteHostingSetSiteOperation(siteId, phase, message) {
  const projectId = siteHostingSelectedProject?.id;
  if (!projectId || !siteId) return;
  const key = `${projectId}:${siteId}`;
  siteHostingOperationStates.set(key, { phase, message });
  const site = siteHostingSites.find((item) => item.id === siteId);
  const target = [...document.querySelectorAll('[data-site-message]')].find((element) => element.dataset.siteMessage === siteId);
  if (site && target) {
    target.innerHTML = siteHostingSiteMessage(site, siteHostingOperationStates.get(key));
    const card = target.closest('.site-hosting-site-card');
    card?.querySelectorAll('.site-hosting-project-actions button').forEach((button) => { button.disabled = phase === 'running'; });
  }
}

function siteHostingSiteOperationIsRunning(projectId, siteId) {
  return siteHostingOperationStates.get(`${projectId}:${siteId}`)?.phase === 'running';
}

function siteHostingSiteSettingsPanel() {
  const site = siteHostingSites.find((item) => item.id === siteHostingSelectedSiteId);
  if (!site) return '<section class="ui-empty-state" data-state="error"><h3>사이트를 찾을 수 없습니다.</h3></section>';
  const binding = site.custom_domain_binding;
  const currentZoneId = siteHostingZoneChoices.find((zone) => zone.name.toLowerCase() === String(site.domain || '').toLowerCase())?.id || '';
  const selectedZoneId = document.getElementById('site-settings-zone')?.value || currentZoneId;
  const currentHostnameInput = document.getElementById('site-settings-hostname')?.value ?? site.hostname ?? '';
  const canConnectDomain = Boolean(site.deployment?.worker_name && !binding?.hostname && selectedZoneId);
  const domainStatus = binding?.hostname
    ? `<p class="site-hosting-domain-connection" data-state="success">Cloudflare 연결됨 · <a href="https://${siteHostingEscapeHtml(binding.hostname)}/" target="_blank" rel="noopener noreferrer">${siteHostingEscapeHtml(binding.hostname)}</a></p>`
    : '';
  const zonePanel = siteHostingZoneStatus === 'loading'
    ? '<p class="site-hosting-domain-connection" role="status">Cloudflare 도메인을 확인하고 있습니다.</p>'
    : siteHostingZoneStatus === 'error'
      ? `<p class="site-hosting-domain-connection" data-state="error" role="alert">${siteHostingEscapeHtml(siteHostingZoneMessage)}</p>`
    : siteHostingZoneStatus === 'empty'
      ? `<p class="site-hosting-domain-connection" data-state="warning" role="status">${siteHostingEscapeHtml(siteHostingZoneMessage)}</p><button class="secondary" type="button" data-site-domain-zones="${siteHostingEscapeHtml(site.id)}">다시 조회</button>`
      : siteHostingZoneStatus === 'ready'
        ? `<label class="site-project-form-field" for="site-settings-zone"><span>Cloudflare 도메인</span><select id="site-settings-zone" ${binding?.hostname ? 'disabled' : ''}><option value="">도메인을 선택하세요</option>${siteHostingZoneChoices.map((zone) => `<option value="${siteHostingEscapeHtml(zone.id)}" ${zone.id === selectedZoneId ? 'selected' : ''}>${siteHostingEscapeHtml(zone.name)}</option>`).join('')}</select></label><label class="site-project-form-field" for="site-settings-hostname"><span>호스트 이름</span><input id="site-settings-hostname" name="hostname" type="text" maxlength="253" value="${siteHostingEscapeHtml(currentHostnameInput)}" placeholder="예: blog" autocomplete="off" ${binding?.hostname ? 'disabled' : ''}></label><p class="site-hosting-domain-preview">주소 미리보기: <strong data-site-custom-domain-preview>${siteHostingEscapeHtml(site.custom_domain || '호스트 이름과 도메인을 선택하세요')}</strong></p><div class="site-hosting-domain-actions"><button class="primary ui-loading-action" type="button" data-site-domain-connect="${siteHostingEscapeHtml(site.id)}" ${!canConnectDomain ? 'disabled' : ''}>연결</button></div>${!site.deployment?.worker_name ? '<p class="site-hosting-domain-note">도메인 목록은 확인할 수 있습니다. 실제 연결은 사이트를 배포한 뒤 진행할 수 있습니다.</p>' : ''}`
        : '';
  return `<section class="site-hosting-site-settings" aria-labelledby="site-hosting-site-settings-title">
    <div class="site-hosting-section-heading"><div><h3 id="site-hosting-site-settings-title">사이트 설정</h3></div></div>
    <form class="site-hosting-settings-form" data-site-settings-form="${siteHostingEscapeHtml(site.id)}">
      <label class="site-project-form-field" for="site-settings-name"><span>사이트 이름</span><input id="site-settings-name" name="name" type="text" maxlength="80" required value="${siteHostingEscapeHtml(site.name)}"></label>
      <div class="site-hosting-template-summary" aria-label="템플릿 정보">
        <span>템플릿</span>
        <strong>${siteHostingEscapeHtml(site.template_name || site.template?.id || '확인할 수 없음')}</strong>
        <small>${site.template?.version ? `버전 ${siteHostingEscapeHtml(site.template.version)}` : ''}${site.template_status === 'unavailable' ? ' · 현재 사용할 수 없는 템플릿' : ''}</small>
      </div>
      <section class="site-hosting-domain-connect" aria-label="Cloudflare 도메인 연결">
        <h4>사용자 도메인</h4>
        <p class="site-hosting-domain-note">Cloudflare 계정의 활성 도메인 목록에서 선택하고 호스트 이름을 입력하세요. workers.dev 주소도 계속 사용할 수 있습니다.</p>
        ${domainStatus}
        ${!binding?.hostname ? `<button class="secondary" type="button" data-site-domain-zones="${siteHostingEscapeHtml(site.id)}" ${siteHostingZoneStatus === 'loading' ? 'disabled' : ''}>${siteHostingZoneStatus === 'ready' ? '도메인 목록 새로고침' : 'Cloudflare 도메인 조회'}</button>` : ''}
        ${siteHostingZoneStatus === 'idle' && !siteHostingZoneChoices.length ? '<p class="site-hosting-domain-note">Cloudflare 도메인을 조회해 선택 항목을 불러오세요.</p>' : ''}
        ${zonePanel}
      </section>
      <p class="ui-workflow-feedback" data-site-settings-feedback role="status" aria-live="polite" hidden></p>
      <div class="site-hosting-settings-actions"><button class="secondary" type="button" data-site-settings-close>닫기</button><button class="primary ui-loading-action" type="submit">저장</button></div>
    </form>
  </section>`;
}

function siteHostingAddSiteCard() {
  return `<button class="site-hosting-add-site-card" type="button" data-site-create>
    <span class="site-hosting-add-site-icon" aria-hidden="true">+</span>
    <span>사이트 추가</span>
  </button>`;
}

function siteHostingRenderProjectList() {
  const content = document.getElementById('site-hosting-content');
  if (!content) return;
  if (!siteHostingProjects.length) {
    content.innerHTML = `<section class="ui-empty-state" aria-labelledby="site-hosting-empty-title">
      <h3 id="site-hosting-empty-title">아직 프로젝트가 없습니다.</h3>
      <button class="primary" type="button" data-site-project-create>프로젝트 만들기</button>
    </section>`;
    return;
  }
  content.innerHTML = `<section aria-labelledby="site-hosting-projects-title">
    <div class="site-hosting-projects-header">
      <div><h2 id="site-hosting-projects-title">프로젝트</h2><p>사이트를 프로젝트별로 관리합니다.</p></div>
      <button class="primary" type="button" data-site-project-create>프로젝트 만들기</button>
    </div>
    <div class="site-hosting-project-list" role="list">${siteHostingProjects.map(siteHostingProjectCard).join('')}</div>
  </section>`;
}

function siteHostingProjectPanel(project, tab) {
  const siteCount = Number(project.site_count || 0);
  if (tab === 'site-settings') return siteHostingSiteSettingsPanel();
  if (tab === 'settings') {
    return `<section class="site-hosting-panel" aria-labelledby="site-hosting-project-settings-title">
      <div class="site-hosting-section-heading"><div><h3 id="site-hosting-project-settings-title">프로젝트 설정</h3></div><button class="secondary" type="button" data-site-project-sites>사이트 목록</button></div>
      <div class="site-hosting-overview-grid">
        <article class="site-hosting-info-card"><h3>사용자 정의 도메인</h3><p>${siteHostingEscapeHtml(project.root_domain || '미설정')}</p></article>
        <article class="site-hosting-info-card"><h3>저장 위치</h3><code>${siteHostingEscapeHtml(project.root_path || '')}</code></article>
      </div>
    </section>`;
  }
  return `<section class="site-hosting-panel" aria-labelledby="site-hosting-sites-title">
    <div class="site-hosting-section-heading">
      <div><p id="site-hosting-sites-title">${siteCount}개</p></div>
    </div>
    ${siteHostingSiteLoadState === 'loading' ? `<section class="ui-empty-state" aria-label="사이트를 불러오는 중"><span class="ui-spinner ui-spinner-accent ui-spinner-md" aria-hidden="true"></span><span>사이트를 불러오는 중입니다.</span></section>` : ''}
    ${siteHostingSiteLoadState === 'error' ? `<section class="ui-empty-state" data-state="error"><h3>사이트를 불러오지 못했습니다.</h3><button class="secondary" type="button" data-site-retry>다시 시도</button></section>` : ''}
    ${siteHostingSiteLoadState === 'ready' ? `<div class="site-hosting-site-list" role="list">${siteHostingSites.map(siteHostingSiteCard).join('')}${siteHostingAddSiteCard()}</div>` : ''}
    ${siteHostingSiteLoadState === 'ready' && siteHostingSites.length ? `<p class="site-hosting-status-message">미리보기는 전체 빌드 후 열립니다.</p>` : ''}
  </section>`;
}

async function siteHostingLoadSites(projectId) {
  siteHostingSiteLoadState = 'loading';
  siteHostingSites = [];
  siteHostingRenderProjectDetail();
  try {
    const sites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(projectId)}/sites`);
    if (siteHostingSelectedProject?.id !== projectId) return;
    siteHostingSites = Array.isArray(sites) ? sites : [];
    siteHostingSelectedProject.site_count = siteHostingSites.length;
    siteHostingSiteLoadState = 'ready';
  } catch (_error) {
    if (siteHostingSelectedProject?.id !== projectId) return;
    siteHostingSiteLoadState = 'error';
  }
  siteHostingRenderProjectDetail();
}

async function siteHostingOpenCreateSiteDialog() {
  const dialog = document.getElementById('site-create-dialog');
  const input = document.getElementById('site-name');
  const select = document.getElementById('site-template-id');
  const feedback = document.getElementById('site-create-feedback');
  const submit = document.querySelector('#site-create-form [type="submit"]');
  if (!dialog || dialog.open || !siteHostingSelectedProject) return;
  input.value = '';
  input.removeAttribute('aria-invalid');
  feedback.textContent = '';
  select.disabled = false;
  if (submit) submit.disabled = true;
  select.innerHTML = '<option value="">불러오는 중…</option>';
  dialog.showModal();
  try {
    const templates = await fetchJson('/api/v1/site-hosting/templates');
    select.innerHTML = (Array.isArray(templates) ? templates : []).map((template) => `<option value="${siteHostingEscapeHtml(template.id)}">${siteHostingEscapeHtml(template.name)}</option>`).join('');
    if (!select.options.length) throw new Error('사용할 수 있는 템플릿이 없습니다.');
    if (submit) submit.disabled = false;
    requestAnimationFrame(() => input.focus());
  } catch (error) {
    select.innerHTML = '<option value="">템플릿을 불러오지 못했습니다.</option>';
    select.disabled = true;
    feedback.textContent = error.message || '템플릿을 불러오지 못했습니다.';
  }
}

async function siteHostingCreateSite(event) {
  event.preventDefault();
  const project = siteHostingSelectedProject;
  const form = event.currentTarget;
  const input = document.getElementById('site-name');
  const select = document.getElementById('site-template-id');
  const feedback = document.getElementById('site-create-feedback');
  const submit = form.querySelector('[type="submit"]');
  const name = String(input?.value || '').trim();
  if (!name || !select?.value || !project) {
    if (!name) {
      input?.setAttribute('aria-invalid', 'true');
      input?.focus();
    }
    return;
  }
  submit.disabled = true;
  submit.classList.add('is-loading');
  try {
    const site = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`, {
      name,
      template_id: select.value
    });
    document.getElementById('site-create-dialog')?.close();
    siteHostingSites = [...siteHostingSites, site];
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

async function siteHostingBuildSite(siteId, button) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || button?.disabled || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = '빌드 중…';
  siteHostingSetSiteOperation(siteId, 'running', '빌드 중…');
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/build`, {});
    try {
      const refreshedSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
      siteHostingSites = Array.isArray(refreshedSites) ? refreshedSites : siteHostingSites;
    } catch {
      const site = siteHostingSites.find((item) => item.id === siteId);
      if (site && result.screenshot) {
        site.screenshot = { ...(site.screenshot || {}), latest_build: result.screenshot };
        site.screenshot_url ||= `/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/screenshot`;
      }
    }
    siteHostingRenderProjectDetail();
    const screenshotMessage = result.screenshot_error ? ' (새 스크린샷은 만들지 못했습니다.)' : '';
    siteHostingSetSiteOperation(siteId, 'success', `빌드를 마쳤습니다.${screenshotMessage}`);
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '사이트를 빌드하지 못했습니다.');
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = '빌드';
  }
}

async function siteHostingPreviewSite(siteId) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  const previewWindow = window.open('about:blank', '_blank');
  if (!previewWindow) {
    siteHostingSetSiteOperation(siteId, 'error', '미리보기 창을 열 수 없습니다. 팝업을 허용해 주세요.');
    return;
  }
  siteHostingRenderPreviewWindowNotice(previewWindow, '미리보기를 준비하고 있습니다', '사이트를 전체 빌드하고 화면 캡처를 갱신하고 있습니다.', true);
  siteHostingSetSiteOperation(siteId, 'running', '전체 빌드 후 미리보기를 여는 중…');
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/preview`, {});
    try {
      const refreshedSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
      siteHostingSites = Array.isArray(refreshedSites) ? refreshedSites : siteHostingSites;
    } catch {
      const site = siteHostingSites.find((item) => item.id === siteId);
      if (site && result.screenshot) {
        site.screenshot = { ...(site.screenshot || {}), latest_build: result.screenshot };
        site.screenshot_url ||= `/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/screenshot`;
      }
    }
    siteHostingRenderProjectDetail();
    if (!previewWindow.closed) previewWindow.location.href = result.url;
    const screenshotMessage = result.screenshot_error ? ' (새 스크린샷은 만들지 못했습니다.)' : '';
    siteHostingSetSiteOperation(siteId, 'success', `전체 빌드 후 미리보기를 열었습니다.${screenshotMessage}`);
  } catch (error) {
    if (!previewWindow.closed) {
      siteHostingRenderPreviewWindowNotice(previewWindow, '미리보기를 열지 못했습니다', error.message || '사이트 빌드에 실패했습니다.', false);
    }
    siteHostingSetSiteOperation(siteId, 'error', error.message || '미리보기를 열지 못했습니다.');
  }
}

function siteHostingRenderPreviewWindowNotice(previewWindow, title, message, isBusy) {
  try {
    const document = previewWindow.document;
    document.title = title;
    const body = document.body;
    body.replaceChildren();
    body.style.cssText = 'margin:0;min-height:100vh;display:grid;place-items:center;background:#fbf7f2;color:#30251f;font:16px system-ui,sans-serif';
    const panel = document.createElement('main');
    panel.style.cssText = 'box-sizing:border-box;width:min(560px,calc(100% - 40px));padding:40px;border:1px solid #e2d5c9;border-radius:16px;background:#fffdfa;text-align:center;box-shadow:0 12px 40px #30251f18';
    const heading = document.createElement('h1');
    heading.textContent = title;
    heading.style.cssText = 'margin:0 0 16px;font-size:24px';
    const detail = document.createElement('p');
    detail.textContent = message;
    detail.style.cssText = 'margin:0;color:#756960;line-height:1.6;overflow-wrap:anywhere';
    panel.append(heading, detail);
    if (isBusy) {
      const progress = document.createElement('progress');
      progress.removeAttribute('value');
      progress.setAttribute('aria-label', '사이트 빌드 및 스크린샷 생성 중');
      progress.style.cssText = 'display:block;width:100%;height:8px;margin-top:28px;accent-color:#c97843';
      panel.append(progress);
    }
    body.append(panel);
  } catch {}
}

async function siteHostingOpenBuildFolder(siteId) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  try {
    siteHostingSetSiteOperation(siteId, 'running', '빌드 결과 폴더를 여는 중…');
    await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/open-folder`, {});
    siteHostingSetSiteOperation(siteId, 'success', '빌드 결과 폴더를 열었습니다.');
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '빌드 결과 폴더를 열지 못했습니다.');
  }
}

async function siteHostingDeploySite(siteId, button) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || button?.disabled || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = '배포 중…';
  siteHostingSetSiteOperation(siteId, 'running', '사이트를 빌드하고 Cloudflare에 배포 중…');
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/deploy`, {});
    const site = siteHostingSites.find((item) => item.id === siteId);
    if (site) {
      site.deployment = { ...result, provider: 'cloudflare' };
      if (result.screenshot) site.screenshot = { ...(site.screenshot || {}), latest_build: result.screenshot };
    }
    siteHostingRenderProjectDetail();
    const screenshotMessage = result.screenshot_error ? ' (새 스크린샷은 만들지 못했습니다.)' : '';
    siteHostingSetSiteOperation(siteId, 'success', `Cloudflare 배포를 마쳤습니다.${screenshotMessage}`);
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || 'Cloudflare에 배포하지 못했습니다.');
  } finally {
    if (button.isConnected && button.textContent === '배포 중…') button.textContent = '배포';
    button.disabled = false;
    button.classList.remove('is-loading');
  }
}

async function siteHostingSaveSiteSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const project = siteHostingSelectedProject;
  const siteId = form.dataset.siteSettingsForm;
  const feedback = form.querySelector('[data-site-settings-feedback]');
  const submit = form.querySelector('[type="submit"]');
  if (!project || !siteId || submit?.disabled) return;
  const site = siteHostingSites.find((item) => item.id === siteId);
  if (!site) return;
  const payload = { name: String(form.elements.namedItem('name')?.value || '').trim() };
  submit.disabled = true;
  submit.classList.add('is-loading');
  if (feedback) { feedback.hidden = true; feedback.textContent = ''; }
  try {
    await putJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}`, payload);
    const refreshedSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
    const updated = Array.isArray(refreshedSites) ? refreshedSites.find((site) => site.id === siteId) : null;
    if (!updated || updated.name !== payload.name) {
      throw new Error('저장한 사이트 정보를 다시 확인하지 못했습니다. 설정을 유지했으니 다시 저장해 주세요.');
    }
    siteHostingSites = refreshedSites;
    siteHostingRenderProjectDetail();
    const refreshedFeedback = document.querySelector('[data-site-settings-feedback]');
    if (refreshedFeedback) {
      refreshedFeedback.textContent = '설정을 저장했습니다.';
      refreshedFeedback.dataset.state = 'success';
      refreshedFeedback.hidden = false;
    }
  } catch (error) {
    if (feedback) {
      feedback.textContent = error.message || '사이트 설정을 저장하지 못했습니다.';
      feedback.dataset.state = 'error';
      feedback.hidden = false;
    }
  } finally {
    submit.disabled = false;
    submit.classList.remove('is-loading');
  }
}

async function siteHostingLoadCloudflareZones(siteId, button) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || button?.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  siteHostingZoneStatus = 'loading';
  siteHostingZoneMessage = '';
  siteHostingZoneChoices = [];
  const settingsForm = [...document.querySelectorAll('[data-site-settings-form]')].find((form) => form.dataset.siteSettingsForm === siteId);
  const unsavedName = String(settingsForm?.elements.namedItem('name')?.value || '');
  const unsavedHostname = String(settingsForm?.elements.namedItem('hostname')?.value || '');
  try {
    const zones = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/zones`);
    const site = siteHostingSites.find((item) => item.id === siteId);
    siteHostingZoneChoices = Array.isArray(zones) ? zones : [];
    if (!siteHostingZoneChoices.length) {
      siteHostingZoneStatus = 'empty';
      siteHostingZoneMessage = 'Cloudflare 계정에서 활성 도메인을 찾지 못했습니다. 계정에 등록된 도메인과 Cloudflare 연결을 확인해 주세요.';
    } else {
      siteHostingZoneStatus = 'ready';
    }
  } catch (error) {
    siteHostingZoneStatus = 'error';
    siteHostingZoneMessage = error.message || 'Cloudflare 영역을 불러오지 못했습니다.';
  }
  siteHostingRenderProjectDetail();
  const nextForm = [...document.querySelectorAll('[data-site-settings-form]')].find((form) => form.dataset.siteSettingsForm === siteId);
  if (nextForm) {
    nextForm.elements.namedItem('name').value = unsavedName;
    const hostnameInput = nextForm.elements.namedItem('hostname');
    if (hostnameInput) hostnameInput.value = unsavedHostname;
    siteHostingUpdateDomainPreview(nextForm);
  }
}

async function siteHostingConnectCustomDomain(siteId, button) {
  const project = siteHostingSelectedProject;
  const form = [...document.querySelectorAll('[data-site-settings-form]')].find((item) => item.dataset.siteSettingsForm === siteId);
  const zoneId = String(document.getElementById('site-settings-zone')?.value || '');
  const site = siteHostingSites.find((item) => item.id === siteId);
  const hostname = String(form?.elements.namedItem('hostname')?.value || '').trim();
  if (!project || !siteId || !zoneId || !site || button?.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = '연결 중…';
  try {
    await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/custom-domain`, { zone_id: zoneId, hostname });
    const refreshedSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
    siteHostingSites = Array.isArray(refreshedSites) ? refreshedSites : siteHostingSites;
    siteHostingZoneChoices = [];
    siteHostingZoneStatus = 'idle';
    siteHostingZoneMessage = '';
    siteHostingRenderProjectDetail();
    const refreshedFeedback = document.querySelector('[data-site-settings-feedback]');
    if (refreshedFeedback) {
      refreshedFeedback.textContent = `Cloudflare 도메인을 연결했습니다: ${siteHostingSites.find((item) => item.id === siteId)?.custom_domain || ''}`;
      refreshedFeedback.dataset.state = 'success';
      refreshedFeedback.hidden = false;
    }
  } catch (error) {
    siteHostingZoneStatus = 'error';
    siteHostingZoneMessage = error.message || 'Cloudflare 도메인을 연결하지 못했습니다.';
    siteHostingRenderProjectDetail();
    const nextForm = [...document.querySelectorAll('[data-site-settings-form]')].find((item) => item.dataset.siteSettingsForm === siteId);
    if (nextForm) {
      nextForm.elements.namedItem('name').value = String(form?.elements.namedItem('name')?.value || site?.name || '');
      nextForm.elements.namedItem('hostname').value = hostname;
      siteHostingUpdateDomainPreview(nextForm);
    }
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }
}

function siteHostingUpdateDomainPreview(form) {
  const preview = form?.querySelector('[data-site-custom-domain-preview]');
  if (!preview) return;
  const hostname = String(form.elements.namedItem('hostname')?.value || '').trim().replace(/\.$/, '');
  const zoneId = String(form.querySelector('#site-settings-zone')?.value || '');
  const selectedZone = siteHostingZoneChoices.find((zone) => zone.id === zoneId);
  const domain = selectedZone?.name || '';
  preview.textContent = domain && hostname ? `${hostname}.${domain}` : '호스트 이름과 도메인을 선택하세요';
  const connect = form.querySelector('[data-site-domain-connect]');
  const site = siteHostingSites.find((item) => item.id === form.dataset.siteSettingsForm);
  if (connect) connect.disabled = !site?.deployment?.worker_name || Boolean(site?.custom_domain_binding?.hostname) || !domain || !hostname;
  const saveButton = form.querySelector('[type="submit"]');
  if (saveButton && site) saveButton.disabled = String(form.elements.namedItem('name')?.value || '').trim() === site.name;
}

async function siteHostingCloseSiteSettings() {
  const form = document.querySelector('[data-site-settings-form]');
  const siteId = form?.dataset.siteSettingsForm;
  const site = siteHostingSites.find((item) => item.id === siteId);
  if (form && site) {
    const name = String(form.elements.namedItem('name')?.value || '').trim();
    const hostname = String(form.elements.namedItem('hostname')?.value ?? site.hostname ?? '').trim();
    const zoneId = String(form.querySelector('#site-settings-zone')?.value || '');
    const domain = siteHostingZoneChoices.find((zone) => zone.id === zoneId)?.name || site.domain || '';
    const hasUnsavedChanges = name !== site.name || hostname !== site.hostname || domain !== site.domain;
    if (hasUnsavedChanges && await showUiConfirm('저장하지 않은 변경 사항을 버리고 설정을 닫을까요?', {
      title: '변경 사항 확인', confirmText: '닫기', cancelText: '계속 편집'
    }) === false) return;
  }
  siteHostingProjectView = 'sites';
  siteHostingSelectedSiteId = '';
  siteHostingZoneChoices = [];
  siteHostingZoneStatus = 'idle';
  siteHostingZoneMessage = '';
  siteHostingRenderProjectDetail();
}

function siteHostingRenderProjectDetail() {
  const content = document.getElementById('site-hosting-content');
  const project = siteHostingSelectedProject;
  if (!content || !project) return;
  content.innerHTML = `<div class="site-hosting-project-detail">
    <header class="site-hosting-project-detail-header">
      <div><h2>내 사이트</h2></div>
    </header>
    ${siteHostingProjectPanel(project, siteHostingProjectView)}
  </div>`;
  const settingsForm = content.querySelector('[data-site-settings-form]');
  settingsForm?.addEventListener('submit', (event) => void siteHostingSaveSiteSettings(event));
}

async function siteHostingLoadProjects() {
  const content = document.getElementById('site-hosting-content');
  if (!content || siteHostingProjectBusy) return;
  siteHostingProjectBusy = true;
  content.setAttribute('aria-busy', 'true');
  siteHostingSetFeedback('');
  try {
    siteHostingProjects = await fetchJson('/api/v1/site-hosting/projects');
    if (!Array.isArray(siteHostingProjects)) siteHostingProjects = [];
    if (siteHostingSelectedProject) {
      const exists = siteHostingProjects.some((project) => project.id === siteHostingSelectedProject.id);
      if (exists) {
        siteHostingSelectedProject = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(siteHostingSelectedProject.id)}`);
        siteHostingRenderProjectDetail();
        void siteHostingLoadSites(siteHostingSelectedProject.id);
      } else {
        siteHostingSelectedProject = null;
        siteHostingRenderProjectList();
      }
    } else {
      if (!siteHostingProjectListMode && siteHostingProjects.length) {
        const initialProject = siteHostingProjects.find((project) => project.id === 'default') || siteHostingProjects[0];
        await siteHostingOpenProject(initialProject.id);
      } else {
        siteHostingRenderProjectList();
      }
    }
  } catch (error) {
    siteHostingSetFeedback(error.message || '프로젝트를 불러오지 못했습니다.', 'danger');
    content.innerHTML = `<section class="ui-empty-state" data-state="error"><h3>프로젝트를 불러오지 못했습니다.</h3><button class="secondary" type="button" data-site-project-retry>다시 시도</button></section>`;
  } finally {
    siteHostingProjectBusy = false;
    content.removeAttribute('aria-busy');
  }
}

async function siteHostingOpenProject(projectId) {
  try {
    siteHostingSelectedProject = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(projectId)}`);
    siteHostingProjectView = 'sites';
    siteHostingSites = [];
    siteHostingSiteLoadState = 'idle';
    siteHostingSetFeedback('');
    siteHostingRenderProjectDetail();
    void siteHostingLoadSites(siteHostingSelectedProject.id);
  } catch (error) {
    siteHostingSetFeedback(error.message || '프로젝트를 열지 못했습니다.', 'danger');
  }
}

function siteHostingOpenCreateDialog() {
  const dialog = document.getElementById('site-project-create-dialog');
  const input = document.getElementById('site-project-name');
  if (!dialog || dialog.open) return;
  input.value = '';
  input.removeAttribute('aria-invalid');
  const dialogFeedback = document.getElementById('site-project-create-feedback');
  if (dialogFeedback) dialogFeedback.textContent = '';
  dialog.showModal();
  requestAnimationFrame(() => input.focus());
}

async function siteHostingCreateProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.getElementById('site-project-name');
  const submit = form.querySelector('[type="submit"]');
  const name = String(input?.value || '').trim();
  if (!name) {
    input?.setAttribute('aria-invalid', 'true');
    input?.focus();
    return;
  }
  submit.disabled = true;
  submit.classList.add('is-loading');
  try {
    const project = await postJson('/api/v1/site-hosting/projects', { name });
    document.getElementById('site-project-create-dialog')?.close();
    siteHostingSelectedProject = project;
    siteHostingProjectListMode = false;
    siteHostingProjectView = 'sites';
    siteHostingSites = [];
    siteHostingSiteLoadState = 'idle';
    await siteHostingLoadProjects();
  } catch (error) {
    const feedback = document.getElementById('site-project-create-feedback');
    if (feedback) feedback.textContent = error.message || '프로젝트를 만들지 못했습니다.';
  } finally {
    submit.disabled = false;
    submit.classList.remove('is-loading');
  }
}

function initSiteHostingProjects() {
  const content = document.getElementById('site-hosting-content');
  if (!content) return;
  siteHostingProjectListMode = false;
  if (!siteHostingProjectsBound) {
    siteHostingProjectsBound = true;
    content.addEventListener('click', (event) => {
      const create = event.target.closest('[data-site-project-create]');
      if (create) return siteHostingOpenCreateDialog();
      const project = event.target.closest('[data-site-project-open]');
      if (project) return void siteHostingOpenProject(project.dataset.siteProjectOpen);
      if (event.target.closest('[data-site-project-list]')) {
        siteHostingSelectedProject = null;
        siteHostingProjectView = 'sites';
        siteHostingProjectListMode = true;
        return siteHostingRenderProjectList();
      }
      if (event.target.closest('[data-site-project-settings]') && siteHostingSelectedProject) {
        siteHostingProjectView = 'settings';
        return siteHostingRenderProjectDetail();
      }
      if (event.target.closest('[data-site-project-sites]') && siteHostingSelectedProject) {
        siteHostingProjectView = 'sites';
        return siteHostingRenderProjectDetail();
      }
      const siteSettings = event.target.closest('[data-site-settings]');
      if (siteSettings && siteHostingSelectedProject) {
        siteHostingSelectedSiteId = siteSettings.dataset.siteSettings;
        siteHostingProjectView = 'site-settings';
        siteHostingZoneChoices = [];
        siteHostingZoneStatus = 'idle';
        siteHostingZoneMessage = '';
        return siteHostingRenderProjectDetail();
      }
      if (event.target.closest('[data-site-settings-close]')) return void siteHostingCloseSiteSettings();
      if (event.target.closest('[data-site-create]')) return void siteHostingOpenCreateSiteDialog();
      const buildSite = event.target.closest('[data-site-build]');
      if (buildSite) return void siteHostingBuildSite(buildSite.dataset.siteBuild, buildSite);
      const previewSite = event.target.closest('[data-site-preview]');
      if (previewSite) return void siteHostingPreviewSite(previewSite.dataset.sitePreview);
      const deploySite = event.target.closest('[data-site-deploy]');
      if (deploySite) return void siteHostingDeploySite(deploySite.dataset.siteDeploy, deploySite);
      const openFolder = event.target.closest('[data-site-open-folder]');
      if (openFolder) return void siteHostingOpenBuildFolder(openFolder.dataset.siteOpenFolder);
      const zoneLookup = event.target.closest('[data-site-domain-zones]');
      if (zoneLookup) return void siteHostingLoadCloudflareZones(zoneLookup.dataset.siteDomainZones, zoneLookup);
      const domainConnect = event.target.closest('[data-site-domain-connect]');
      if (domainConnect) return void siteHostingConnectCustomDomain(domainConnect.dataset.siteDomainConnect, domainConnect);
      if (event.target.closest('[data-site-retry]') && siteHostingSelectedProject) return void siteHostingLoadSites(siteHostingSelectedProject.id);
      if (event.target.closest('[data-site-project-retry]')) return void siteHostingLoadProjects();
    });
    content.addEventListener('input', (event) => {
      if (event.target.matches('#site-settings-hostname, #site-settings-name')) siteHostingUpdateDomainPreview(event.target.form);
    });
    content.addEventListener('change', (event) => {
      if (event.target.matches('#site-settings-zone')) siteHostingUpdateDomainPreview(event.target.form);
    });
    document.getElementById('site-project-create-form')?.addEventListener('submit', (event) => void siteHostingCreateProject(event));
    document.querySelector('[data-site-project-cancel]')?.addEventListener('click', () => document.getElementById('site-project-create-dialog')?.close());
    document.getElementById('site-create-form')?.addEventListener('submit', (event) => void siteHostingCreateSite(event));
    document.querySelector('[data-site-create-cancel]')?.addEventListener('click', () => document.getElementById('site-create-dialog')?.close());
    document.getElementById('site-name')?.addEventListener('input', (event) => event.currentTarget.removeAttribute('aria-invalid'));
  }
  void siteHostingLoadProjects();
}
