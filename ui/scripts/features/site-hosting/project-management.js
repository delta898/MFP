let siteHostingProjectsBound = false;
let siteHostingProjects = [];
let siteHostingSelectedProject = null;
let siteHostingProjectTab = 'overview';
let siteHostingProjectBusy = false;

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
  if (tab === 'sites') {
    return `<section class="site-hosting-panel" role="tabpanel" id="site-hosting-project-panel-sites" aria-labelledby="site-hosting-project-tab-sites">
      <div class="site-hosting-section-heading"><div><h3>사이트</h3><p>${siteCount}개</p></div></div>
      <section class="ui-empty-state" aria-label="프로젝트 사이트 목록">
        <h3>${siteCount === 0 ? '이 프로젝트에는 아직 사이트가 없습니다.' : `사이트 ${siteCount}개`}</h3>
      </section>
    </section>`;
  }
  if (tab === 'settings') {
    return `<section class="site-hosting-panel" role="tabpanel" id="site-hosting-project-panel-settings" aria-labelledby="site-hosting-project-tab-settings">
      <div class="site-hosting-section-heading"><div><h3>프로젝트 설정</h3><p>프로젝트 정보와 저장 위치</p></div></div>
      <div class="site-hosting-overview-grid">
        <article class="site-hosting-info-card"><h3>사용자 정의 도메인</h3><p>${siteHostingEscapeHtml(project.root_domain || '미설정')}</p></article>
        <article class="site-hosting-info-card"><h3>저장 위치</h3><code>${siteHostingEscapeHtml(project.root_path || '')}</code></article>
      </div>
    </section>`;
  }
  return `<section class="site-hosting-panel" role="tabpanel" id="site-hosting-project-panel-overview" aria-labelledby="site-hosting-project-tab-overview">
    <div class="site-hosting-section-heading"><div><h3>프로젝트 개요</h3></div></div>
    <div class="site-hosting-overview-grid">
      <article class="site-hosting-info-card"><h3>사이트</h3><p>${siteCount}개</p></article>
      <article class="site-hosting-info-card"><h3>사용자 정의 도메인</h3><p>${siteHostingEscapeHtml(project.root_domain || '미설정')}</p></article>
    </div>
  </section>`;
}

function siteHostingRenderProjectDetail() {
  const content = document.getElementById('site-hosting-content');
  const project = siteHostingSelectedProject;
  if (!content || !project) return;
  const tabs = [
    ['overview', '개요'],
    ['sites', '사이트'],
    ['settings', '설정']
  ];
  content.innerHTML = `<div class="site-hosting-project-detail">
    <nav class="site-hosting-breadcrumb" aria-label="현재 위치">
      <button class="site-hosting-back-link" type="button" data-site-project-list>프로젝트</button>
      <span aria-hidden="true">/</span><span>${siteHostingEscapeHtml(project.name)}</span>
    </nav>
    <header class="site-hosting-project-detail-header">
      <div><h2>${siteHostingEscapeHtml(project.name)}</h2><p>프로젝트</p></div>
    </header>
    <div class="site-hosting-project-tabs ui-segmented-tabs" role="tablist" aria-label="프로젝트 메뉴">
      ${tabs.map(([id, label]) => `<button class="site-hosting-project-tab ui-segmented-tab" id="site-hosting-project-tab-${id}" type="button" role="tab" aria-selected="${siteHostingProjectTab === id}" aria-controls="site-hosting-project-panel-${id}" tabindex="${siteHostingProjectTab === id ? '0' : '-1'}" data-site-project-tab="${id}">${label}</button>`).join('')}
    </div>
    ${siteHostingProjectPanel(project, siteHostingProjectTab)}
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
    siteHostingProjectTab = 'overview';
    siteHostingSetFeedback('');
    siteHostingRenderProjectDetail();
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
    siteHostingProjectTab = 'overview';
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
        siteHostingProjectTab = 'overview';
        return siteHostingRenderProjectList();
      }
      const tab = event.target.closest('[data-site-project-tab]');
      if (tab && siteHostingSelectedProject) {
        siteHostingProjectTab = tab.dataset.siteProjectTab;
        return siteHostingRenderProjectDetail();
      }
      if (event.target.closest('[data-site-project-retry]')) return void siteHostingLoadProjects();
    });
    content.addEventListener('keydown', (event) => {
      const current = event.target.closest('[role="tab"][data-site-project-tab]');
      if (!current) return;
      const tabs = [...content.querySelectorAll('[role="tab"][data-site-project-tab]')];
      const currentIndex = tabs.indexOf(current);
      const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (currentIndex - 1 + tabs.length) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (nextIndex < 0) return;
      event.preventDefault();
      tabs[nextIndex].click();
      content.querySelector(`[data-site-project-tab="${tabs[nextIndex].dataset.siteProjectTab}"]`)?.focus();
    });
    document.getElementById('site-project-create-form')?.addEventListener('submit', (event) => void siteHostingCreateProject(event));
    document.querySelector('[data-site-project-cancel]')?.addEventListener('click', () => document.getElementById('site-project-create-dialog')?.close());
  }
  void siteHostingLoadProjects();
}
