// Shared image media content used by the manuscript block editor and image list.
window.BlogGeniusManuscriptImageCard = (() => {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function renderMedia(image = {}, options = {}) {
    const exists = Boolean(image.exists && image.imageUrl);
    if (exists) {
      return `<img class="${options.compact ? 'manuscript-image-block-image' : ''}" src="${escapeHtml(image.imageUrl)}" alt="${escapeHtml(image.title || '원고 이미지')}" data-manuscript-card-image>`;
    }
    const title = image.generating ? 'AI 이미지 생성 중' : image.error ? '이미지를 불러오지 못했습니다.' : image.excluded ? '원고에서 제외됨' : '이미지 미지정';
    const message = image.generating ? '완료되면 이 원고 위치에 표시됩니다.' : image.excluded ? '발행 대상에 포함되지 않습니다.' : 'AI로 만들거나 내 이미지에서 채울 수 있습니다.';
    if (options.compact) {
      return `<div class="manuscript-image-block-placeholder${image.error ? ' is-error' : ''}"><svg class="manuscript-image-block-placeholder-waves" viewBox="0 0 800 600" preserveAspectRatio="none" aria-hidden="true"><path d="M-40 420 C120 350 220 485 390 410 S650 350 840 430"/><path d="M-40 455 C130 385 230 520 400 445 S650 385 840 465"/><path d="M-40 490 C140 420 240 555 410 480 S650 420 840 500"/></svg><div class="manuscript-image-block-placeholder-content"><svg class="manuscript-image-block-placeholder-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="8" width="36" height="32" rx="5"/><circle cx="31" cy="18" r="3.5"/><path d="m10 34 10-10 7 7 5-5 6 8"/></svg><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div></div>`;
    }
    return `<div class="local-markdown-image-card-placeholder${image.error ? ' is-error' : ''}">${image.generating ? '<span class="local-markdown-image-spinner" aria-hidden="true"></span>' : ''}<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  }

  return Object.freeze({ renderMedia });
})();
