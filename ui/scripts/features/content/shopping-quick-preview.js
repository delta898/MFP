let shoppingQuickPreviewBound = false;

function isShoppingQuickPreviewUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

function normalizeShoppingQuickPreview(data = {}) {
  const commerce = data?.commerce && typeof data.commerce === 'object' ? data.commerce : {};
  const imageCount = Number(data?.imageCount);
  const discountRate = Number(commerce.discountRate);
  return {
    title: String(data?.title || data?.productNameSuggestion || '').trim(),
    finalUrl: isShoppingQuickPreviewUrl(data?.finalUrl) ? String(data.finalUrl).trim() : '',
    thumbnailUrl: isShoppingQuickPreviewUrl(data?.thumbnailUrl) ? String(data.thumbnailUrl).trim() : '',
    salePriceText: String(commerce.salePriceText || '').trim(),
    originalPriceText: String(commerce.originalPriceText || '').trim(),
    discountRate: Number.isFinite(discountRate) && discountRate > 0 ? discountRate : null,
    imageCount: Number.isFinite(imageCount) && imageCount >= 0 ? Math.floor(imageCount) : null
  };
}

function setShoppingQuickPreviewState(state, options = {}) {
  const root = document.getElementById('shopping-quick-preview');
  const empty = document.getElementById('shopping-quick-preview-empty');
  const loading = document.getElementById('shopping-quick-preview-loading');
  const error = document.getElementById('shopping-quick-preview-error');
  const card = document.getElementById('shopping-quick-preview-card');
  if (!root) return;

  root.dataset.state = state;
  if (empty) empty.hidden = state !== 'empty';
  if (loading) loading.hidden = state !== 'loading';
  if (error) error.hidden = state !== 'error';
  if (card) card.hidden = state !== 'success';

  const errorMessage = document.getElementById('shopping-quick-preview-error-message');
  if (errorMessage && state === 'error') {
    errorMessage.textContent = String(options.message || 'URL을 확인하거나 상품명을 직접 입력해 주세요.');
  }
  if (typeof window.updateShoppingQuickActionAvailability === 'function') window.updateShoppingQuickActionAvailability();
}

function resetShoppingQuickPreview() {
  const productField = document.getElementById('shopping-quick-product-field');
  const productInput = document.getElementById('shopping-quick-product');
  if (productField) productField.hidden = true;
  if (productInput) productInput.value = '';
  setShoppingQuickPreviewState('empty');
}

function showShoppingQuickProductField(mode) {
  const field = document.getElementById('shopping-quick-product-field');
  const label = document.getElementById('shopping-quick-product-label');
  const hint = document.getElementById('shopping-quick-product-hint');
  if (field) field.hidden = false;
  if (label) label.textContent = mode === 'recovery' ? '상품명 (선택)' : '상품명';
  if (hint) {
    hint.textContent = '글에 사용할 상품명을 입력하거나 수정하세요.';
  }
}

function renderShoppingQuickPreview(data = {}) {
  const preview = normalizeShoppingQuickPreview(data);
  if (!preview.title || !preview.finalUrl) {
    throw new Error('확인된 상품 정보가 충분하지 않습니다.');
  }

  const title = document.getElementById('shopping-quick-preview-title');
  const price = document.getElementById('shopping-quick-preview-price');
  const discount = document.getElementById('shopping-quick-preview-discount');
  const imageCount = document.getElementById('shopping-quick-preview-image-count');
  const image = document.getElementById('shopping-quick-preview-image');
  const imageEmpty = document.getElementById('shopping-quick-preview-image-empty');
  const link = document.getElementById('shopping-quick-preview-link');
  const productInput = document.getElementById('shopping-quick-product');

  if (title) title.textContent = preview.title;
  if (price) {
    price.textContent = preview.salePriceText
      ? `${preview.salePriceText}${preview.originalPriceText ? ` · 정가 ${preview.originalPriceText}` : ''}`
      : '가격 정보 없음';
  }
  if (discount) discount.textContent = preview.discountRate ? `${preview.discountRate}%` : '할인 정보 없음';
  if (imageCount) imageCount.textContent = preview.imageCount === null ? '확인 안 됨' : `${preview.imageCount}장`;
  if (image) {
    image.hidden = !preview.thumbnailUrl;
    image.alt = preview.thumbnailUrl ? `${preview.title} 대표 이미지` : '';
    if (preview.thumbnailUrl) image.src = preview.thumbnailUrl;
    else image.removeAttribute('src');
  }
  if (imageEmpty) imageEmpty.hidden = Boolean(preview.thumbnailUrl);
  if (link) link.href = preview.finalUrl;
  if (productInput) productInput.value = preview.title;

  showShoppingQuickProductField('confirmed');
  setShoppingQuickPreviewState('success');
}

async function requestShoppingQuickPreview() {
  const urlInput = document.getElementById('shopping-quick-url');
  const button = document.getElementById('shopping-quick-preview-btn');
  const rawUrl = String(urlInput?.value || '').trim();

  if (!isShoppingQuickPreviewUrl(rawUrl)) {
    setShoppingQuickPreviewState('error', { message: 'http 또는 https로 시작하는 상품 URL을 입력해 주세요.' });
    showShoppingQuickProductField('recovery');
    urlInput?.focus();
    return;
  }
  if (button?.getAttribute('aria-busy') === 'true') return;

  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = '불러오는 중...';
  }
  setShoppingQuickPreviewState('loading');

  try {
    const query = new URLSearchParams({ url: rawUrl });
    const data = await fetchJson(`/api/v1/shopping/preview?${query.toString()}`);
    renderShoppingQuickPreview(data);
  } catch (error) {
    setShoppingQuickPreviewState('error', {
      message: error?.message || 'URL을 확인하거나 상품명을 직접 입력해 주세요.'
    });
    showShoppingQuickProductField('recovery');
  } finally {
    if (button) {
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
      button.textContent = '상품 불러오기';
    }
  }
}

function initShoppingQuickPreview() {
  if (shoppingQuickPreviewBound) return;
  const urlInput = document.getElementById('shopping-quick-url');
  const button = document.getElementById('shopping-quick-preview-btn');
  if (!urlInput || !button) return;

  button.addEventListener('click', () => void requestShoppingQuickPreview());
  urlInput.addEventListener('input', resetShoppingQuickPreview);
  document.getElementById('shopping-quick-product')?.addEventListener('input', () => {
    if (typeof window.updateShoppingQuickActionAvailability === 'function') window.updateShoppingQuickActionAvailability();
  });
  if (typeof window.updateShoppingQuickActionAvailability === 'function') window.updateShoppingQuickActionAvailability();
  urlInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void requestShoppingQuickPreview();
  });
  shoppingQuickPreviewBound = true;
}
