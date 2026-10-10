function siteHostingSiteSettingsPanel() {
  const site = siteHostingSites.find((item) => item.id === siteHostingSelectedSiteId);
  if (!site) return '<section class="ui-empty-state" data-state="error"><h3>사이트를 찾을 수 없습니다.</h3></section>';
  const binding = site.custom_domain_binding;
  const cloudflareAccountName = String(site.cloudflare_account?.name || '').trim();
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
        ? `<label class="site-project-form-field" for="site-settings-zone"><span>Cloudflare 도메인</span><select id="site-settings-zone" ${binding?.hostname ? 'disabled' : ''}><option value="">도메인을 선택하세요</option>${siteHostingZoneChoices.map((zone) => `<option value="${siteHostingEscapeHtml(zone.id)}" ${zone.id === selectedZoneId ? 'selected' : ''}>${siteHostingEscapeHtml(zone.name)}</option>`).join('')}</select></label><label class="site-project-form-field" for="site-settings-hostname"><span>호스트 이름</span><input id="site-settings-hostname" name="hostname" type="text" maxlength="253" value="${siteHostingEscapeHtml(currentHostnameInput)}" placeholder="예: blog" autocomplete="off" ${binding?.hostname ? 'disabled' : ''}></label><p class="site-hosting-domain-preview">주소 미리보기: <strong data-site-custom-domain-preview>${siteHostingEscapeHtml(site.custom_domain || '호스트 이름과 도메인을 선택하세요')}</strong></p><div class="site-hosting-domain-actions"><button class="primary ui-loading-action" type="button" data-site-domain-connect="${siteHostingEscapeHtml(site.id)}" ${!canConnectDomain ? 'disabled' : ''}>연결</button></div>`
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
        <p class="site-hosting-domain-note">${site.deployment?.worker_name ? `이 사이트를 배포한 Cloudflare 계정${cloudflareAccountName ? `(${siteHostingEscapeHtml(cloudflareAccountName)})` : ''}의 활성 도메인에서 선택하세요.` : '사이트를 배포하면 선택된 Cloudflare 계정의 활성 도메인을 연결할 수 있습니다.'} workers.dev 주소도 계속 사용할 수 있습니다.</p>
        ${domainStatus}
        ${!binding?.hostname ? `<button class="secondary" type="button" data-site-domain-zones="${siteHostingEscapeHtml(site.id)}" ${siteHostingZoneStatus === 'loading' || !site.deployment?.worker_name ? 'disabled' : ''}>${siteHostingZoneStatus === 'ready' ? '도메인 목록 새로고침' : 'Cloudflare 도메인 조회'}</button>` : ''}
        ${siteHostingZoneStatus === 'idle' && !siteHostingZoneChoices.length && site.deployment?.worker_name ? '<p class="site-hosting-domain-note">이 사이트의 배포 계정에서 Cloudflare 도메인 목록을 조회하세요.</p>' : ''}
        ${zonePanel}
      </section>
      <p class="ui-workflow-feedback" data-site-settings-feedback role="status" aria-live="polite" hidden></p>
      <div class="site-hosting-settings-actions"><button class="secondary" type="button" data-site-settings-close>닫기</button><button class="primary ui-loading-action" type="submit">저장</button></div>
    </form>
  </section>`;
}
