function renderBufferPublishingResults(container, results = [], { notice = '' } = {}) {
  if (!container) return;
  container.replaceChildren();
  (Array.isArray(results) ? results : []).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'buffer-publishing-result-item';
    row.dataset.state = item.success ? 'ready' : 'error';
    const service = String(item.service || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const platform = BufferChannelCards.serviceLabels[service] || String(item.service || '').trim();
    const account = String(item.channel_name || '').trim();
    const identity = document.createElement('span');
    identity.className = 'buffer-publishing-result-identity';
    const name = document.createElement('strong');
    name.textContent = platform || account || '채널';
    identity.append(name);
    if (platform && account && platform.toLowerCase() !== account.toLowerCase()) {
      const accountName = document.createElement('span');
      accountName.className = 'buffer-publishing-result-account';
      accountName.textContent = account;
      identity.append(accountName);
    }
    const badge = document.createElement('span');
    badge.className = 'ui-status-badge';
    badge.dataset.state = item.success ? 'ready' : 'error';
    badge.textContent = item.success
      ? (item.status === 'sent' ? '발행 완료' : '요청 완료')
      : (item.message || '발행 실패');
    row.append(identity, badge);
    if (item.success && item.external_link) {
      try {
        const url = new URL(String(item.external_link));
        if (url.protocol === 'https:' && !url.username && !url.password) {
          const link = document.createElement('a');
          link.className = 'ui-text-action compact';
          link.href = url.href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = '게시물 열기 ↗';
          row.append(link);
        }
      } catch (_error) {
        // 잘못된 외부 링크는 표시하지 않습니다.
      }
    }
    container.append(row);
  });
  if (notice) {
    const message = document.createElement('p');
    message.className = 'buffer-publishing-result-notice';
    message.dataset.state = 'error';
    message.textContent = notice;
    container.append(message);
  }
  container.classList.toggle('is-visible', container.childElementCount > 0);
}
