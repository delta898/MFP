const CARD_NEWS_SIGNATURE_STORAGE_KEY = 'bloggenius.cardNews.signature';
const CARD_NEWS_SIGNATURE_ENABLED_STORAGE_KEY = 'bloggenius.cardNews.signatureEnabled';

function readCardNewsSignature() {
  try { return String(localStorage.getItem(CARD_NEWS_SIGNATURE_STORAGE_KEY) || '').slice(0, 48); } catch (_) { return ''; }
}

function getCardNewsSignatureForRequest() {
  const enabled = document.getElementById('card-news-signature-enabled');
  if (enabled && !enabled.checked) return '';
  const input = document.getElementById('card-news-signature');
  if (input && !input.disabled) return String(input.value || '').trim().slice(0, 48);
  if (input) return '';
  return readCardNewsSignature();
}

function readCardNewsSignatureEnabled() {
  try {
    const stored = localStorage.getItem(CARD_NEWS_SIGNATURE_ENABLED_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch (_) {
    return true;
  }
}

function cardNewsUrlWithSignature(value) {
  const raw = String(value || '');
  if (!raw || /^(?:data|blob):/i.test(raw)) return raw;
  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '');
  const signature = getCardNewsSignatureForRequest();
  const expectedSignature = cardNewsViewState.signaturePreviewEffectiveSignature;
  if (signature) query.set('signature', signature);
  else query.delete('signature');
  if (cardNewsViewState.signaturePreviewResolved) query.set('expected_signature', expectedSignature);
  else query.delete('expected_signature');
  const serialized = query.toString();
  return `${pathname}${serialized ? `?${serialized}` : ''}${hash}`;
}
