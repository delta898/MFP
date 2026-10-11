async function siteHostingResolveDeploymentAccount(siteId) {
  const site = siteHostingSites.find((item) => item.id === siteId);
  const boundAccountId = String(site?.deployment?.worker_account_id || site?.cloudflare_account?.id || '').trim();
  if (boundAccountId) return boundAccountId;
  const status = await fetchJson('/api/v1/site-hosting/cloudflare/status');
  const accounts = Array.isArray(status?.accounts) ? status.accounts : [];
  if (status?.connected !== true || !accounts.length) {
    const error = new Error(status?.connected === true
      ? '배포 가능한 Cloudflare 계정이 없습니다. 설정에서 계정 권한을 확인해 주세요.'
      : '먼저 Cloudflare를 연결해 주세요.');
    error.code = status?.connected === true ? 'CLOUDFLARE_ACCOUNT_REQUIRED' : 'CLOUDFLARE_CONNECTION_REQUIRED';
    throw error;
  }
  if (accounts.length === 1) return String(accounts[0].id || '');
  return siteHostingChooseDeploymentAccount(accounts);
}

function siteHostingChooseDeploymentAccount(accounts) {
  const dialog = document.getElementById('site-hosting-cloudflare-account-dialog');
  const form = document.getElementById('site-hosting-cloudflare-account-form');
  const options = document.getElementById('site-hosting-cloudflare-account-options');
  const feedback = document.getElementById('site-hosting-cloudflare-account-feedback');
  if (!dialog || !form || !options || typeof dialog.showModal !== 'function') {
    throw new Error('Cloudflare 계정 선택 창을 열 수 없습니다. 앱을 다시 시작해 주세요.');
  }
  options.replaceChildren();
  if (feedback) feedback.textContent = '';
  for (const [index, account] of accounts.entries()) {
    const label = document.createElement('label');
    label.className = 'site-hosting-cloudflare-account-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'cloudflare-account';
    radio.value = String(account.id || '');
    radio.required = true;
    radio.id = `site-hosting-cloudflare-account-${index}`;
    const name = document.createElement('span');
    name.textContent = String(account.name || '이름 없는 계정');
    label.append(radio, name);
    options.append(label);
  }
  const cancel = form.querySelector('[data-site-cloudflare-account-cancel]');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      form.removeEventListener('submit', handleSubmit);
      cancel?.removeEventListener('click', handleCancel);
      dialog.removeEventListener('close', handleClose);
      resolve(value);
    };
    const handleSubmit = (event) => {
      event.preventDefault();
      const selected = form.querySelector('input[name="cloudflare-account"]:checked');
      if (!selected?.value) {
        if (feedback) feedback.textContent = '배포할 계정을 선택해 주세요.';
        return;
      }
      dialog.close(selected.value);
    };
    const handleCancel = () => dialog.close('');
    const handleClose = () => finish(String(dialog.returnValue || '') || null);
    form.addEventListener('submit', handleSubmit);
    cancel?.addEventListener('click', handleCancel);
    dialog.addEventListener('close', handleClose);
    dialog.showModal();
  });
}
