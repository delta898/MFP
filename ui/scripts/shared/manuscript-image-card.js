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
    return `<div class="${options.compact ? 'manuscript-image-block-placeholder' : 'local-markdown-image-card-placeholder'}${image.error ? ' is-error' : ''}">${image.generating ? '<span class="local-markdown-image-spinner" aria-hidden="true"></span>' : ''}<strong>${title}</strong><span>${message}</span></div>`;
  }

  return Object.freeze({ renderMedia });
})();
