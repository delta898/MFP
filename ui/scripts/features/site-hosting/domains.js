function siteHostingSiteDomainConnectPanel(site, state) {
  if (!state?.open) return '';
  const siteId = siteHostingEscapeHtml(site.id);
  const zones = Array.isArray(state.zones) ? state.zones : [];
  const zoneOptions = zones.map((zone) => `<option value="${siteHostingEscapeHtml(zone.id)}" ${zone.id === state.zoneId ? 'selected' : ''}>${siteHostingEscapeHtml(zone.name)}</option>`).join('');
  const zoneField = state.status === 'ready'
    ? `<label for="site-card-zone-${siteId}"><span>도메인</span><select id="site-card-zone-${siteId}" data-site-card-zone="${siteId}"><option value="">도메인 선택</option>${zoneOptions}</select></label>`
    : '';
  const hostnameField = state.status === 'ready'
    ? `<label for="site-card-hostname-${siteId}"><span>호스트 이름</span><input id="site-card-hostname-${siteId}" data-site-card-hostname="${siteId}" type="text" maxlength="253" value="${siteHostingEscapeHtml(state.hostname || '')}" placeholder="예: blog" autocomplete="off"></label>`
    : '';
  const status = state.status === 'loading'
    ? '<p role="status">Cloudflare 도메인을 불러오고 있습니다.</p>'
    : state.status === 'error'
      ? `<p data-state="error" role="alert">${siteHostingEscapeHtml(state.message || '도메인 목록을 불러오지 못했습니다.')}</p>`
      : state.status === 'empty'
        ? `<p data-state="error" role="alert">${siteHostingEscapeHtml(state.message || 'Cloudflare 계정에서 활성 도메인을 찾지 못했습니다.')}</p>`
        : '';
  return `<section class="site-hosting-card-domain-panel" aria-label="커스텀 도메인 연결">
    <div class="site-hosting-card-domain-fields">${zoneField}${hostnameField}</div>
    ${status}
  </section>`;
}

function siteHostingCardDomainActions(siteId, state) {
  const escapedId = siteHostingEscapeHtml(siteId);
  const connectAction = state?.status === 'ready'
    ? `<button class="primary" type="button" data-site-card-domain-connect="${escapedId}" ${!state.zoneId || !String(state.hostname || '').trim() ? 'disabled' : ''}>연결</button>`
    : state?.status === 'loading'
      ? `<button class="primary" type="button" disabled>연결</button>`
      : `<button class="primary" type="button" data-site-card-domain-retry="${escapedId}">${state?.status === 'idle' ? '도메인 불러오기' : '다시 시도'}</button>`;
  return `<div class="site-hosting-project-actions site-hosting-card-domain-actions"><button class="secondary" type="button" data-site-card-domain-cancel="${escapedId}">취소</button>${connectAction}</div>`;
}

function siteHostingSafeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
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

function siteHostingDomainStateKey(siteId) {
  return `${siteHostingSelectedProject?.id || ''}:${siteId}`;
}

async function siteHostingOpenCardDomainConnection(siteId) {
  const site = siteHostingSites.find((item) => item.id === siteId);
  if (!site?.deployment?.worker_name) return;
  const key = siteHostingDomainStateKey(siteId);
  const previous = siteHostingDomainConnectStates.get(key);
  if (previous?.open) {
    siteHostingDomainConnectStates.delete(key);
    siteHostingRenderProjectDetail();
    return;
  }
  siteHostingDomainConnectStates.set(key, {
    open: true,
    status: 'loading',
    message: '',
    zones: [],
    zoneId: '',
    hostname: String(site.hostname || '')
  });
  siteHostingRenderProjectDetail();
  try {
    const project = siteHostingSelectedProject;
    const zones = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/zones`);
    const state = siteHostingDomainConnectStates.get(key);
    if (!state?.open) return;
    state.zones = Array.isArray(zones) ? zones : [];
    if (state.zones.length) {
      state.status = 'ready';
      state.zoneId = state.zones.find((zone) => zone.name.toLowerCase() === String(site.domain || '').toLowerCase())?.id || '';
    } else {
      state.status = 'empty';
      state.message = 'Cloudflare 계정에서 활성 도메인을 찾지 못했습니다.';
    }
  } catch (error) {
    const state = siteHostingDomainConnectStates.get(key);
    if (!state?.open) return;
    state.status = 'error';
    state.message = error.message || 'Cloudflare 도메인 목록을 불러오지 못했습니다.';
  }
  siteHostingRenderProjectDetail();
}

async function siteHostingConnectCardDomain(siteId, button) {
  const project = siteHostingSelectedProject;
  const key = siteHostingDomainStateKey(siteId);
  const state = siteHostingDomainConnectStates.get(key);
  const zoneId = String(state?.zoneId || '');
  const hostname = String(state?.hostname || '').trim();
  if (!project || !state?.open || !zoneId || !hostname || button?.disabled) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = '연결 중…';
  siteHostingSetSiteOperation(siteId, 'running', '도메인을 연결하고 있습니다…');
  try {
    await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/custom-domain`, { zone_id: zoneId, hostname });
    const refreshedSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
    siteHostingSites = Array.isArray(refreshedSites) ? refreshedSites : siteHostingSites;
    siteHostingDomainConnectStates.delete(key);
    siteHostingRenderProjectDetail();
    siteHostingSetSiteOperation(siteId, 'success', '');
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '도메인을 연결하지 못했습니다.');
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = '연결';
    }
  }
}

async function siteHostingDisconnectCustomDomain(siteId, button) {
  const project = siteHostingSelectedProject;
  const site = siteHostingSites.find((item) => item.id === siteId);
  const hostname = String(site?.custom_domain_binding?.hostname || '').trim();
  if (!project || !site || !hostname || button?.disabled) return;
  const accepted = await showUiConfirm(
    `${hostname} 연결을 해제할까요? 기본 주소와 Worker는 유지됩니다. Cloudflare가 자동 정리하지 않는 DNS 레코드가 남으면 직접 확인해야 합니다.`,
    { title: '도메인 연결 해지', confirmText: '연결 해지', cancelText: '취소' }
  );
  if (!accepted) return;

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  siteHostingSetSiteOperation(siteId, 'running', '도메인 연결을 해제하고 상태를 확인하고 있습니다…');
  try {
    await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites/${encodeURIComponent(siteId)}/custom-domain-disconnect`, { confirmed: true });
    const refreshedSites = await fetchJson(`/api/v1/site-hosting/projects/${encodeURIComponent(project.id)}/sites`);
    siteHostingSites = Array.isArray(refreshedSites) ? refreshedSites : siteHostingSites;
    siteHostingRenderProjectDetail();
    siteHostingSetSiteOperation(siteId, 'success', '도메인 연결을 해제했습니다. 기본 주소는 계속 사용할 수 있습니다.');
  } catch (error) {
    siteHostingSetSiteOperation(siteId, 'error', error.message || '도메인 연결을 해제하지 못했습니다.');
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
}

function siteHostingUpdateCardDomainState(target) {
  const siteId = target.dataset.siteCardZone || target.dataset.siteCardHostname;
  if (!siteId) return;
  const state = siteHostingDomainConnectStates.get(siteHostingDomainStateKey(siteId));
  if (!state) return;
  if (target.matches('[data-site-card-zone]')) state.zoneId = target.value;
  else state.hostname = target.value;
  const zone = state.zones.find((item) => item.id === state.zoneId);
  const address = state.hostname && zone ? `${state.hostname}.${zone.name}` : '';
  const message = target.closest('.site-hosting-site-card')?.querySelector('[data-site-message]');
  if (message) {
    message.innerHTML = address ? `<span data-state="pending">주소 미리보기: ${siteHostingEscapeHtml(address)}</span>` : '';
    message.hidden = !address;
  }
  const connect = target.closest('.site-hosting-site-card')?.querySelector('[data-site-card-domain-connect]');
  if (connect) connect.disabled = !state.zoneId || !String(state.hostname || '').trim();
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
