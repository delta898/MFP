let siteHostingProjectsBound = false;
let siteHostingProjects = [];
let siteHostingSelectedProject = null;
let siteHostingProjectView = 'sites';
let siteHostingProjectBusy = false;
let siteHostingSites = [];
let siteHostingSiteLoadState = 'idle';

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
      <div><h3 id="site-hosting-sites-title">사이트</h3><p>${siteCount}개</p></div>
      <div class="site-hosting-project-actions">
        ${tab === 'settings' ? '' : `<button class="secondary" type="button" data-site-project-settings>설정</button><button class="primary" type="button" data-site-create>사이트 만들기</button>`}
      </div>
    </div>
    ${siteHostingSiteLoadState === 'loading' ? `<section class="ui-empty-state" aria-label="사이트를 불러오는 중"><span class="ui-spinner ui-spinner-accent ui-spinner-md" aria-hidden="true"></span><span>사이트를 불러오는 중입니다.</span></section>` : ''}
    ${siteHostingSiteLoadState === 'error' ? `<section class="ui-empty-state" data-state="error"><h3>사이트를 불러오지 못했습니다.</h3><button class="secondary" type="button" data-site-retry>다시 시도</button></section>` : ''}
    ${siteHostingSiteLoadState === 'ready' && !siteHostingSites.length ? `<section class="ui-empty-state" aria-label="프로젝트 사이트 목록"><h3>이 프로젝트에는 아직 사이트가 없습니다.</h3></section>` : ''}
    ${siteHostingSiteLoadState === 'ready' && siteHostingSites.length ? `<div class="site-hosting-site-list" role="list">${siteHostingSites.map((site) => `<article class="site-hosting-site-card" role="listitem"><div><strong>${siteHostingEscapeHtml(site.name)}</strong><span>${siteHostingEscapeHtml(site.template_name || '템플릿 확인 필요')}</span>${site.deployment?.url ? `<a href="${siteHostingEscapeHtml(site.deployment.url)}" target="_blank" rel="noopener noreferrer">${siteHostingEscapeHtml(site.deployment.url)}</a>` : ''}</div><div class="site-hosting-project-actions"><button class="secondary" type="button" data-site-build="${siteHostingEscapeHtml(site.id)}">빌드</button><button class="secondary" type="button" data-site-preview="${siteHostingEscapeHtml(site.id)}">미리보기</button><button class="primary" type="button" data-site-deploy="${siteHostingEscapeHtml(site.id)}">배포</button></div></article>`).join('')}</div>` : ''}
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
  if (!project || !siteId || button?.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = '빌드 중…';
  siteHostingSetFeedback('사이트를 빌드하고 있습니다.', 'neutral');
  try {
    await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/build`, {});
    siteHostingSetFeedback('사이트 빌드를 마쳤습니다.', 'success');
  } catch (error) {
    siteHostingSetFeedback(error.message || '사이트를 빌드하지 못했습니다.', 'danger');
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = '빌드';
  }
}

async function siteHostingPreviewSite(siteId) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId) return;
  const previewWindow = window.open('about:blank', '_blank');
  if (!previewWindow) {
    siteHostingSetFeedback('미리보기 창을 열 수 없습니다. 팝업을 허용해 주세요.', 'danger');
    return;
  }
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/preview`, {});
    previewWindow.location.href = result.url;
    siteHostingSetFeedback('사이트 미리보기를 열었습니다.', 'success');
  } catch (error) {
    previewWindow.close();
    siteHostingSetFeedback(error.message || '미리보기를 열지 못했습니다.', 'danger');
  }
}

async function siteHostingDeploySite(siteId, button) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || button?.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = '배포 중…';
  siteHostingSetFeedback('사이트를 빌드하고 Cloudflare에 배포하고 있습니다.', 'neutral');
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/deploy`, {});
    const site = siteHostingSites.find((item) => item.id === siteId);
    if (site) site.deployment = { ...result, provider: 'cloudflare' };
    siteHostingRenderProjectDetail();
    siteHostingSetFeedback('Cloudflare 배포를 마쳤습니다.', 'success');
  } catch (error) {
    siteHostingSetFeedback(error.message || 'Cloudflare에 배포하지 못했습니다.', 'danger');
  } finally {
    if (button.isConnected && button.textContent === '배포 중…') button.textContent = '배포';
    button.disabled = false;
    button.classList.remove('is-loading');
  }
}

function siteHostingRenderProjectDetail() {
  const content = document.getElementById('site-hosting-content');
  const project = siteHostingSelectedProject;
  if (!content || !project) return;
  content.innerHTML = `<div class="site-hosting-project-detail">
    <nav class="site-hosting-breadcrumb" aria-label="현재 위치">
      <button class="site-hosting-back-link" type="button" data-site-project-list>프로젝트</button>
      <span aria-hidden="true">/</span><span>${siteHostingEscapeHtml(project.name)}</span>
    </nav>
    <header class="site-hosting-project-detail-header">
      <div><h2>${siteHostingEscapeHtml(project.name)}</h2><p>프로젝트</p></div>
    </header>
    ${siteHostingProjectPanel(project, siteHostingProjectView)}
  </div>`;
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
      siteHostingRenderProjectList();
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
      if (event.target.closest('[data-site-create]')) return void siteHostingOpenCreateSiteDialog();
      const buildSite = event.target.closest('[data-site-build]');
      if (buildSite) return void siteHostingBuildSite(buildSite.dataset.siteBuild, buildSite);
      const previewSite = event.target.closest('[data-site-preview]');
      if (previewSite) return void siteHostingPreviewSite(previewSite.dataset.sitePreview);
      const deploySite = event.target.closest('[data-site-deploy]');
      if (deploySite) return void siteHostingDeploySite(deploySite.dataset.siteDeploy, deploySite);
      if (event.target.closest('[data-site-retry]') && siteHostingSelectedProject) return void siteHostingLoadSites(siteHostingSelectedProject.id);
      if (event.target.closest('[data-site-project-retry]')) return void siteHostingLoadProjects();
    });
    document.getElementById('site-project-create-form')?.addEventListener('submit', (event) => void siteHostingCreateProject(event));
    document.querySelector('[data-site-project-cancel]')?.addEventListener('click', () => document.getElementById('site-project-create-dialog')?.close());
    document.getElementById('site-create-form')?.addEventListener('submit', (event) => void siteHostingCreateSite(event));
    document.querySelector('[data-site-create-cancel]')?.addEventListener('click', () => document.getElementById('site-create-dialog')?.close());
    document.getElementById('site-name')?.addEventListener('input', (event) => event.currentTarget.removeAttribute('aria-invalid'));
  }
  void siteHostingLoadProjects();
}
