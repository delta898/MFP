let siteHostingProjectsBound = false;
let siteHostingProjects = [];
let siteHostingSelectedProject = null;
let siteHostingProjectView = 'sites';
let siteHostingProjectBusy = false;
let siteHostingProjectListMode = false;
let siteHostingSites = [];
let siteHostingOperationStates = new Map();
let siteHostingOperationTimers = new Map();
let siteHostingDomainConnectStates = new Map();
let siteHostingTemplateCheckStarted = false;
let siteHostingTemplateCheckRunning = false;
let siteHostingTemplateCheckMessage = '';
let siteHostingTemplateCheckError = false;
let siteHostingDevelopmentMode = false;
let siteHostingRuntimeEnvironmentLoaded = false;
let siteHostingSiteLoadState = 'idle';
let siteHostingSelectedSiteId = '';
let siteHostingZoneChoices = [];
let siteHostingZoneStatus = 'idle';
let siteHostingZoneMessage = '';
let siteHostingCreateTemplates = [];
let siteHostingSelectedCreateTemplate = '';
let siteHostingCreateSetupInputs = {};
let siteHostingProfileImages = { logo: '', 'share-image': '', favicon: '' };
let siteHostingCreateInitialSnapshot = '';
let siteHostingCreatePreviewId = '';
let siteHostingCreateMode = 'create';
let siteHostingEditingSiteId = '';
let siteHostingCreatePreviewSnapshot = '';

function siteHostingEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
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

function siteHostingTemplateCheckControl() {
  return `<div class="site-hosting-template-check-control">
    <span class="site-hosting-template-check-feedback" data-template-check-feedback role="status" aria-live="polite" data-state="${siteHostingTemplateCheckError ? 'error' : 'success'}"${siteHostingTemplateCheckMessage ? '' : ' hidden'}>${siteHostingEscapeHtml(siteHostingTemplateCheckMessage)}</span>
    <button class="site-hosting-icon-button" type="button" data-site-template-refresh aria-label="템플릿 업데이트 확인" title="템플릿 업데이트 확인" ${siteHostingTemplateCheckRunning ? 'disabled aria-busy="true"' : ''}>${siteHostingRefreshIcon()}</button>
  </div>`;
}

function siteHostingSiteCard(site) {
  const siteKey = `${site.project_id}:${site.id}`;
  const siteId = siteHostingEscapeHtml(site.id);
  const operation = siteHostingOperationStates.get(siteKey) || null;
  const domainConnect = siteHostingDomainConnectStates.get(siteKey) || null;
  const domainConnectOpen = Boolean(domainConnect?.open);
  const deployed = Boolean(site.deployment?.url);
  const deploymentNeeded = Boolean(site.deployment?.url && site.last_build?.status === 'succeeded'
    && Date.parse(site.last_build.completed_at || '') > Date.parse(site.deployment.deployed_at || ''))
    || Boolean(site.deployment?.url && Date.parse(site.template?.updated_at || '') > Date.parse(site.deployment.deployed_at || ''));
  const hasDeploymentAddress = deployed && Boolean(site.deployment?.worker_name);
  const deploymentState = deploymentNeeded
    ? { label: '배포 필요', state: 'warning' }
    : deployed
      ? { label: '배포됨', state: 'success' }
      : { label: '미배포', state: 'neutral' };
  const message = siteHostingSiteMessage(site, operation, domainConnect);
  const screenshot = site.screenshot_url
    ? `<img src="${siteHostingEscapeHtml(site.screenshot_url)}?build=${siteHostingEscapeHtml(site.screenshot?.latest_build?.build_id || site.screenshot?.template?.path || 'template')}" alt="${siteHostingEscapeHtml(site.name)} 미리보기" loading="lazy">`
    : '';
  return `<article class="site-hosting-site-card${domainConnectOpen ? ' has-open-domain-panel' : ''}" role="listitem">
    <div class="site-hosting-site-preview" aria-label="사이트 스크린샷">${screenshot}</div>
    <div class="site-hosting-site-card-content">
      <div class="site-hosting-site-heading">
        <div class="site-hosting-site-title"><strong>${siteHostingEscapeHtml(site.name)}</strong>${siteHostingDevelopmentMode ? `<button class="site-hosting-template-test-button" type="button" data-site-template-test="${siteId}" title="이 사이트의 템플릿 업데이트 가능 상태를 테스트합니다.">테스트</button>` : ''}</div>
        <span class="site-hosting-site-heading-status">${site.template_update_available ? `<button class="site-hosting-template-update-badge" type="button" data-site-template-update="${siteId}" aria-label="템플릿 업데이트 가능. 눌러서 업데이트" title="템플릿 업데이트 적용">템플릿 업데이트</button>` : ''}<span class="site-hosting-site-status" data-state="${deploymentState.state}" aria-label="배포 상태"${deploymentNeeded ? ' title="사이트 변경 사항을 배포해야 합니다."' : ''}>${deploymentState.label}</span></span>
      </div>
      <div class="site-hosting-site-card-body">
        <div class="site-hosting-site-address-area">
          ${domainConnectOpen ? siteHostingSiteDomainConnectPanel(site, domainConnect) : siteHostingSiteAddresses(site, domainConnect, hasDeploymentAddress)}
        </div>
        <div class="site-hosting-site-feedback-slot">
          <div class="site-hosting-site-message" data-site-message="${siteId}" role="status" aria-live="polite"${message ? '' : ' hidden'}>${message}</div>
        </div>
        <div class="site-hosting-site-card-footer">
          <details class="site-hosting-site-more">
            <summary aria-label="사이트 더보기" title="사이트 더보기">더보기 <span aria-hidden="true">⌄</span></summary>
            <div class="site-hosting-site-more-menu">
              ${site.knowledge_collection ? `<button class="secondary" type="button" data-site-open-vault="${siteId}">Vault 폴더 열기</button>` : ''}
              <button class="secondary" type="button" data-site-open-folder="${siteId}">폴더 열기</button>
              <button class="secondary" type="button" data-site-settings="${siteId}">설정</button>
              <button class="secondary" type="button" disabled title="삭제 기능은 추후 제공됩니다.">삭제</button>
            </div>
          </details>
          ${domainConnectOpen ? siteHostingCardDomainActions(site.id, domainConnect) : `<div class="site-hosting-project-actions"><button class="secondary" type="button" data-site-preview="${siteId}">미리보기</button><button class="primary" type="button" data-site-deploy="${siteId}">배포</button></div>`}
        </div>
      </div>
    </div>
  </article>`;
}

function siteHostingSiteMessage(site, operation, domainConnect) {
  if (operation?.phase === 'running') return `<span data-state="pending">${siteHostingEscapeHtml(operation.message)}</span>`;
  if (operation?.phase === 'error') return `<span data-state="error">${siteHostingEscapeHtml(operation.message)}</span>`;
  if (operation?.phase === 'success' && operation.message) return `<span data-state="success">${siteHostingEscapeHtml(operation.message)}</span>`;
  if (domainConnect?.open && domainConnect.status === 'ready' && domainConnect.zoneId && String(domainConnect.hostname || '').trim()) {
    const zone = domainConnect.zones?.find((item) => item.id === domainConnect.zoneId);
    if (zone) return `<span data-state="pending">주소 미리보기: ${siteHostingEscapeHtml(`${String(domainConnect.hostname).trim()}.${zone.name}`)}</span>`;
  }
  return '';
}

function siteHostingSiteAddresses(site, domainConnect, hasDeploymentAddress = Boolean(site.deployment?.url && site.deployment?.worker_name)) {
  const workerUrl = hasDeploymentAddress ? String(site.deployment?.url || '') : '';
  const workerHref = siteHostingSafeHttpsUrl(workerUrl);
  const customDomain = String(site.custom_domain_binding?.hostname || '').trim();
  const customDomainHref = customDomain && !/[\s/\\?#@]/.test(customDomain)
    ? siteHostingSafeHttpsUrl(`https://${customDomain}`)
    : '';
  const workerActions = workerHref
    ? `<span class="site-hosting-address-actions"><button class="site-hosting-icon-button" type="button" data-site-open-address="${siteHostingEscapeHtml(site.id)}" data-address-type="worker" aria-label="기본 주소 열기" title="기본 주소 열기">${siteHostingExternalLinkIcon()}</button><button class="site-hosting-icon-button" type="button" data-site-copy-address="${siteHostingEscapeHtml(site.id)}" data-address-type="worker" aria-label="기본 주소 복사" title="기본 주소 복사">${siteHostingCopyIcon()}</button></span>`
    : `<span class="site-hosting-address-actions"><button class="site-hosting-icon-button" type="button" disabled aria-label="배포 후 기본 주소를 열 수 있습니다." title="배포하면 기본 주소가 생깁니다.">${siteHostingExternalLinkIcon()}</button><button class="site-hosting-icon-button" type="button" disabled aria-label="배포 후 기본 주소를 복사할 수 있습니다." title="배포하면 기본 주소가 생깁니다.">${siteHostingCopyIcon()}</button></span>`;
  const domainActions = customDomainHref
    ? `<span class="site-hosting-address-value">${siteHostingEscapeHtml(customDomain)}</span><span class="site-hosting-address-actions"><button class="site-hosting-icon-button" type="button" data-site-open-address="${siteHostingEscapeHtml(site.id)}" data-address-type="domain" aria-label="연결 도메인 열기" title="연결 도메인 열기">${siteHostingExternalLinkIcon()}</button><button class="site-hosting-icon-button" type="button" data-site-copy-address="${siteHostingEscapeHtml(site.id)}" data-address-type="domain" aria-label="연결 도메인 복사" title="연결 도메인 복사">${siteHostingCopyIcon()}</button></span>`
    : hasDeploymentAddress
      ? `<button class="site-hosting-domain-start" type="button" data-site-domain-start="${siteHostingEscapeHtml(site.id)}" ${domainConnect?.open ? 'aria-expanded="true"' : ''}>도메인 연결 <span aria-hidden="true">+</span></button>`
      : '<span class="site-hosting-address-empty">배포 후 연결할 수 있습니다.</span>';
  return `<div class="site-hosting-site-addresses" aria-label="사이트 주소"><div class="site-hosting-address-row"><span>기본 주소</span>${workerActions}</div><div class="site-hosting-address-row"><span>연결 도메인</span>${domainActions}</div></div>`;
}

function siteHostingExternalLinkIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M9 2h5v5M14 2 7 9"/><path d="M12 9v4H3V4h4"/></svg>';
}

function siteHostingCopyIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 16 16"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 3V2.5A1.5 1.5 0 0 0 9.5 1h-7A1.5 1.5 0 0 0 1 2.5v7A1.5 1.5 0 0 0 2.5 11H3"/></svg>';
}

async function siteHostingOpenAddress(siteId, addressType, button) {
  const projectId = siteHostingSelectedProject?.id;
  if (!projectId || !siteId || !['worker', 'domain'].includes(addressType) || button?.disabled) return;
  const site = siteHostingSites.find((item) => item.id === siteId);
  const addressAvailable = addressType === 'worker'
    ? Boolean(site?.deployment?.url && site?.deployment?.worker_name)
    : Boolean(site?.custom_domain_binding?.hostname);
  if (!addressAvailable) {
    siteHostingSetSiteOperation(siteId, 'error', '배포 또는 도메인 연결 후 주소를 사용할 수 있습니다.');
    return;
  }
  if (button) button.disabled = true;
  try {
    await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(projectId)}/sites/${encodeURIComponent(siteId)}/open-address`, { type: addressType });
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '시스템 브라우저에서 주소를 열지 못했습니다.');
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

async function siteHostingCopyAddress(siteId, addressType, button) {
  const site = siteHostingSites.find((item) => item.id === siteId);
  if (!site || !['worker', 'domain'].includes(addressType) || button?.disabled) return;
  const value = addressType === 'worker'
    ? site.deployment?.worker_name ? siteHostingSafeHttpsUrl(site.deployment?.url) : ''
    : siteHostingSafeHttpsUrl(`https://${site.custom_domain_binding?.hostname || ''}`);
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    siteHostingSetSiteOperation(siteId, 'success', '주소를 복사했습니다.');
  } catch (_error) {
    siteHostingSetSiteOperation(siteId, 'error', '주소를 복사하지 못했습니다. 클립보드 권한을 확인해 주세요.');
  }
}

function siteHostingSetSiteOperation(siteId, phase, message) {
  const projectId = siteHostingSelectedProject?.id;
  if (!projectId || !siteId) return;
  const key = `${projectId}:${siteId}`;
  clearTimeout(siteHostingOperationTimers.get(key));
  siteHostingOperationTimers.delete(key);
  if (phase === 'success' && !message) siteHostingOperationStates.delete(key);
  else siteHostingOperationStates.set(key, { phase, message });
  const site = siteHostingSites.find((item) => item.id === siteId);
  const target = [...document.querySelectorAll('[data-site-message]')].find((element) => element.dataset.siteMessage === siteId);
  if (site && target) {
    target.innerHTML = siteHostingSiteMessage(site, siteHostingOperationStates.get(key) || null);
    target.hidden = !target.innerHTML;
    const card = target.closest('.site-hosting-site-card');
    card?.querySelectorAll('button').forEach((button) => {
      if (button.matches('[data-site-card-domain-cancel]')) return;
      if (phase === 'running' && !button.disabled) {
        button.dataset.operationDisabled = 'true';
        button.disabled = true;
      } else if (phase !== 'running' && button.dataset.operationDisabled === 'true') {
        delete button.dataset.operationDisabled;
        button.disabled = false;
      }
    });
  }
  if (phase === 'success' && message) {
    siteHostingOperationTimers.set(key, setTimeout(() => {
      siteHostingOperationTimers.delete(key);
      if (siteHostingOperationStates.get(key)?.phase === 'success') {
        siteHostingOperationStates.delete(key);
        const target = [...document.querySelectorAll('[data-site-message]')].find((element) => element.dataset.siteMessage === siteId);
        if (target) { target.replaceChildren(); target.hidden = true; }
      }
    }, 3000));
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
        <small>${site.template?.version ? `적용 버전 ${siteHostingEscapeHtml(site.template.version)}` : ''}${site.template_update_available ? ` · 새 버전 ${siteHostingEscapeHtml(site.available_template_version)} 사용 가능` : ''}${site.template_status === 'unavailable' && !site.template_update_available ? ' · 현재 사용할 수 없는 템플릿' : ''}</small>
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
      <div class="site-hosting-project-list-actions">${siteHostingTemplateCheckControl()}<button class="primary" type="button" data-site-project-create>프로젝트 만들기</button></div>
    </section>`;
    return;
  }
  content.innerHTML = `<section aria-labelledby="site-hosting-projects-title">
    <div class="site-hosting-projects-header">
      <div><h2 id="site-hosting-projects-title">프로젝트</h2><p>사이트를 프로젝트별로 관리합니다.</p></div>
      <div class="site-hosting-project-list-actions">${siteHostingTemplateCheckControl()}<button class="primary" type="button" data-site-project-create>프로젝트 만들기</button></div>
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

function siteHostingRefreshIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M13.4 6A5.5 5.5 0 0 0 3.1 4.2L2 5.5M2 2.5v3h3M2.6 10A5.5 5.5 0 0 0 12.9 11.8L14 10.5M14 13.5v-3h-3"/></svg>';
}

async function siteHostingLoadRuntimeEnvironment() {
  if (siteHostingRuntimeEnvironmentLoaded) return;
  siteHostingRuntimeEnvironmentLoaded = true;
  try {
    const status = await fetchJson('/api/v1/config/status');
    siteHostingDevelopmentMode = String(status?.runtimeEnvironment?.environment || '').toLowerCase() === 'development';
  } catch (_error) {
    siteHostingDevelopmentMode = false;
  }
  if (siteHostingSelectedProject && siteHostingProjectView === 'sites') siteHostingRenderProjectDetail();
}

async function siteHostingCheckTemplateUpdates(projectId, manual = true) {
  if (siteHostingTemplateCheckRunning) return;
  siteHostingTemplateCheckRunning = true;
  const setStatus = (message, isError = false) => {
    siteHostingTemplateCheckMessage = message;
    siteHostingTemplateCheckError = isError;
    const status = document.querySelector('[data-template-check-feedback]');
    if (status) {
      status.textContent = message;
      status.hidden = !message;
      status.dataset.state = isError ? 'error' : 'success';
    }
    const button = document.querySelector('[data-site-template-refresh]');
    if (button) {
      button.disabled = siteHostingTemplateCheckRunning;
      button.setAttribute('aria-busy', String(siteHostingTemplateCheckRunning));
    }
  };
  setStatus(manual ? '템플릿을 확인하고 있습니다…' : '템플릿 업데이트를 확인하고 있습니다…');
  try {
    await fetchJson('/api/v1/site-hosting/templates');
    const activeProjectId = projectId || siteHostingSelectedProject?.id;
    if (activeProjectId && siteHostingSelectedProject?.id === activeProjectId && siteHostingProjectView === 'sites') {
      const sites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(activeProjectId)}/sites`);
      if (siteHostingSelectedProject?.id === activeProjectId) {
        siteHostingSites = Array.isArray(sites) ? sites : [];
        siteHostingSelectedProject.site_count = siteHostingSites.length;
        siteHostingRenderProjectDetail();
      }
    }
    setStatus('템플릿 확인을 마쳤습니다.');
    setTimeout(() => {
      if (siteHostingTemplateCheckMessage === '템플릿 확인을 마쳤습니다.') {
        siteHostingTemplateCheckMessage = '';
        const status = document.querySelector('[data-template-check-feedback]');
        if (status) status.hidden = true;
      }
    }, 3000);
  } catch (error) {
    setStatus(error.message || '템플릿 업데이트를 확인하지 못했습니다.', true);
  } finally {
    siteHostingTemplateCheckRunning = false;
    const button = document.querySelector('[data-site-template-refresh]');
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
}

function siteHostingReadLogo(file) {
  return siteHostingReadProfileImage(file, '로고');
}

async function siteHostingBuildSite(siteId, button) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || button?.disabled || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = '생성 중…';
  siteHostingSetSiteOperation(siteId, 'running', '사이트를 생성하는 중…');
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
    siteHostingSetSiteOperation(siteId, 'success', `사이트 생성을 마쳤습니다.${screenshotMessage}`);
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '사이트를 생성하지 못했습니다.');
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = '생성';
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
  siteHostingRenderPreviewWindowNotice(previewWindow, '미리보기를 준비하고 있습니다', '사이트를 준비하고 미리보기 화면을 갱신하고 있습니다.', true);
  siteHostingSetSiteOperation(siteId, 'running', '미리보기를 준비하는 중…');
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
    const collection = result.knowledge_collection;
    const collectionMessage = collection && (collection.source_markdown_count || collection.selection_configured)
      ? ` 공개 ${collection.published_note_count}개 · 제외 ${collection.excluded_note_count}개 · 첨부 ${collection.copied_resource_count}개 · 확인 필요 링크 ${collection.unresolved_link_count + collection.missing_resource_count}개.`
      : '';
    siteHostingSetSiteOperation(siteId, 'success', `미리보기를 열었습니다.${collectionMessage}${screenshotMessage}`);
  } catch (error) {
    if (!previewWindow.closed) {
      siteHostingRenderPreviewWindowNotice(previewWindow, '미리보기를 열지 못했습니다', error.message || '사이트를 준비하지 못했습니다.', false);
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
    siteHostingSetSiteOperation(siteId, 'running', '사이트 파일 폴더를 여는 중…');
    await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/open-folder`, {});
    siteHostingSetSiteOperation(siteId, 'success', '사이트 파일 폴더를 열었습니다.');
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '사이트 파일 폴더를 열지 못했습니다.');
  }
}

async function siteHostingOpenVaultFolder(siteId) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  try {
    siteHostingSetSiteOperation(siteId, 'running', 'Vault 폴더를 여는 중…');
    await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/open-vault`, {});
    siteHostingSetSiteOperation(siteId, 'success', 'Vault 폴더를 열었습니다.');
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || 'Vault 폴더를 열지 못했습니다.');
  }
}

async function siteHostingDeploySite(siteId, button) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || button?.disabled || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = '배포 중…';
  siteHostingSetSiteOperation(siteId, 'running', '사이트를 준비해 Cloudflare에 배포 중…');
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
      ${siteHostingProjectView === 'sites' ? siteHostingTemplateCheckControl() : ''}
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
    siteHostingRenderProjectDetail();
    void siteHostingLoadSites(siteHostingSelectedProject.id);
  } catch (error) {
    const content = document.getElementById('site-hosting-content');
    if (content) content.innerHTML = `<section class="ui-empty-state" data-state="error"><h3>${siteHostingEscapeHtml(error.message || '프로젝트를 열지 못했습니다.')}</h3></section>`;
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
        return void siteHostingOpenSiteSettingsDialog(siteSettings.dataset.siteSettings);
      }
      const templateUpdate = event.target.closest('[data-site-template-update]');
      if (templateUpdate && siteHostingSelectedProject) {
        return void siteHostingUpdateTemplate(templateUpdate.dataset.siteTemplateUpdate, templateUpdate);
      }
      const templateTest = event.target.closest('[data-site-template-test]');
      if (templateTest && siteHostingSelectedProject && siteHostingDevelopmentMode) {
        return void siteHostingPrepareTemplateUpdateTest(templateTest.dataset.siteTemplateTest, templateTest);
      }
      if (event.target.closest('[data-site-template-refresh]')) {
        return void siteHostingCheckTemplateUpdates(siteHostingSelectedProject?.id || '', true);
      }
      const domainStart = event.target.closest('[data-site-domain-start]');
      if (domainStart) return void siteHostingOpenCardDomainConnection(domainStart.dataset.siteDomainStart);
      const openAddress = event.target.closest('[data-site-open-address]');
      if (openAddress) return void siteHostingOpenAddress(openAddress.dataset.siteOpenAddress, openAddress.dataset.addressType, openAddress);
      const copyAddress = event.target.closest('[data-site-copy-address]');
      if (copyAddress) return void siteHostingCopyAddress(copyAddress.dataset.siteCopyAddress, copyAddress.dataset.addressType, copyAddress);
      const openVault = event.target.closest('[data-site-open-vault]');
      if (openVault) {
        openVault.closest('.site-hosting-site-more')?.removeAttribute('open');
        return void siteHostingOpenVaultFolder(openVault.dataset.siteOpenVault);
      }
      const domainCancel = event.target.closest('[data-site-card-domain-cancel]');
      if (domainCancel) {
        siteHostingDomainConnectStates.delete(siteHostingDomainStateKey(domainCancel.dataset.siteCardDomainCancel));
        return siteHostingRenderProjectDetail();
      }
      const domainRetry = event.target.closest('[data-site-card-domain-retry]');
      if (domainRetry) {
        siteHostingDomainConnectStates.delete(siteHostingDomainStateKey(domainRetry.dataset.siteCardDomainRetry));
        return void siteHostingOpenCardDomainConnection(domainRetry.dataset.siteCardDomainRetry);
      }
      const cardDomainConnect = event.target.closest('[data-site-card-domain-connect]');
      if (cardDomainConnect) return void siteHostingConnectCardDomain(cardDomainConnect.dataset.siteCardDomainConnect, cardDomainConnect);
      if (event.target.closest('[data-site-settings-close]')) return void siteHostingCloseSiteSettings();
      if (event.target.closest('[data-site-create]')) return void siteHostingOpenCreateSiteDialog();
      const buildSite = event.target.closest('[data-site-build]');
      if (buildSite) return void siteHostingBuildSite(buildSite.dataset.siteBuild, buildSite);
      const previewSite = event.target.closest('[data-site-preview]');
      if (previewSite) return void siteHostingPreviewSite(previewSite.dataset.sitePreview);
      const deploySite = event.target.closest('[data-site-deploy]');
      if (deploySite) return void siteHostingDeploySite(deploySite.dataset.siteDeploy, deploySite);
      const openFolder = event.target.closest('[data-site-open-folder]');
      if (openFolder) {
        openFolder.closest('.site-hosting-site-more')?.removeAttribute('open');
        return void siteHostingOpenBuildFolder(openFolder.dataset.siteOpenFolder);
      }
      const zoneLookup = event.target.closest('[data-site-domain-zones]');
      if (zoneLookup) return void siteHostingLoadCloudflareZones(zoneLookup.dataset.siteDomainZones, zoneLookup);
      const domainConnect = event.target.closest('[data-site-domain-connect]');
      if (domainConnect) return void siteHostingConnectCustomDomain(domainConnect.dataset.siteDomainConnect, domainConnect);
      if (event.target.closest('[data-site-retry]') && siteHostingSelectedProject) return void siteHostingLoadSites(siteHostingSelectedProject.id);
      if (event.target.closest('[data-site-project-retry]')) return void siteHostingLoadProjects();
    });
    document.addEventListener('click', (event) => {
      content.querySelectorAll('.site-hosting-site-more[open]').forEach((menu) => {
        if (!menu.contains(event.target)) menu.removeAttribute('open');
      });
    });
    content.addEventListener('input', (event) => {
      if (event.target.matches('#site-settings-hostname, #site-settings-name')) siteHostingUpdateDomainPreview(event.target.form);
      if (event.target.matches('[data-site-card-hostname]')) siteHostingUpdateCardDomainState(event.target);
    });
    content.addEventListener('change', (event) => {
      if (event.target.matches('#site-settings-zone')) siteHostingUpdateDomainPreview(event.target.form);
      if (event.target.matches('[data-site-card-zone]')) siteHostingUpdateCardDomainState(event.target);
    });
    document.getElementById('site-project-create-form')?.addEventListener('submit', (event) => void siteHostingCreateProject(event));
    document.querySelector('[data-site-project-cancel]')?.addEventListener('click', () => document.getElementById('site-project-create-dialog')?.close());
    siteHostingBindCreateDialogEvents();
  }
  if (!siteHostingTemplateCheckStarted) {
    siteHostingTemplateCheckStarted = true;
    void siteHostingCheckTemplateUpdates('', false);
  }
  if (!siteHostingRuntimeEnvironmentLoaded) void siteHostingLoadRuntimeEnvironment();
  void siteHostingLoadProjects();
}

async function siteHostingPrepareTemplateUpdateTest(siteId, button) {
  const project = siteHostingSelectedProject;
  if (!project || !siteId || !siteHostingDevelopmentMode || button?.disabled || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  button.disabled = true;
  siteHostingSetSiteOperation(siteId, 'running', '테스트 준비 중…');
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/test-template-update`, {});
    const sites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
    if (siteHostingSelectedProject?.id === project.id) {
      siteHostingSites = Array.isArray(sites) ? sites : [];
      siteHostingRenderProjectDetail();
      siteHostingSetSiteOperation(siteId, 'success', result?.template_update_available
        ? '테스트 상태를 준비했습니다. 템플릿 업데이트 배지를 확인하세요.'
        : '버전은 낮췄지만 이 템플릿은 업데이트 조건을 충족하지 않습니다.');
    }
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '테스트 상태를 준비하지 못했습니다.');
  }
}

async function siteHostingUpdateTemplate(siteId, button) {
  const project = siteHostingSelectedProject;
  const site = siteHostingSites.find((item) => item.id === siteId);
  if (!project || !site?.template_update_available || button?.disabled || siteHostingSiteOperationIsRunning(project.id, siteId)) return;
  const confirmed = await showUiDialog({
    title: '템플릿 업데이트',
    message: `“${site.name}”의 템플릿 코드를 업데이트할까요?\n\n사이트 이름, 메뉴, 로고, SEO 설정, Vault 경로와 콘텐츠는 유지됩니다. 업데이트 후 미리보기에서 확인할 수 있으며, 공개 사이트에도 반영하려면 배포를 눌러 주세요.`,
    confirmText: '업데이트',
    cancelText: '취소',
    showCancel: true
  });
  if (!confirmed) return;

  siteHostingSetSiteOperation(siteId, 'running', '템플릿 업데이트 및 사이트 생성 중…');
  try {
    const result = await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/update-template`, {});
    const siteIndex = siteHostingSites.findIndex((item) => item.id === siteId);
    if (siteIndex >= 0) {
      siteHostingSites[siteIndex] = {
        ...siteHostingSites[siteIndex], ...result,
        ...(result.screenshot ? { screenshot: { ...(siteHostingSites[siteIndex].screenshot || {}), latest_build: result.screenshot } } : {})
      };
      if (result.screenshot) {
        siteHostingSites[siteIndex].screenshot_url ||= `/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/screenshot`;
      }
    }
    try {
      const refreshedSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
      siteHostingSites = Array.isArray(refreshedSites) ? refreshedSites : siteHostingSites;
    } catch (_refreshError) { }
    siteHostingRenderProjectDetail();
    if (result.build_error) {
      siteHostingSetSiteOperation(siteId, 'error', `템플릿은 업데이트했지만 사이트 생성에 실패했습니다: ${result.build_error}`);
    } else {
      const screenshotMessage = result.screenshot_error ? ' 새 대표 이미지는 만들지 못했습니다.' : '';
  siteHostingSetSiteOperation(siteId, 'success', `템플릿 업데이트를 마쳤습니다.${screenshotMessage} 미리보기에서 확인할 수 있습니다.`);
    }
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '템플릿을 업데이트하지 못했습니다.');
  }
}
