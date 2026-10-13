function buildGoogleSheetOpenUrl(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return 'https://docs.google.com/spreadsheets';

  const lower = raw.toLowerCase();
  const hasPlaceholderHint = lower.includes('여기에') || lower.includes('구글시트')
    || lower.includes('your_') || lower.includes('<') || lower.includes('...');
  if (hasPlaceholderHint) return 'https://docs.google.com/spreadsheets';

  const extractId = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
    try {
      const url = new URL(text);
      const byPath = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
      if (byPath?.[1]) return byPath[1];
      const byQuery = url.searchParams.get('id');
      if (byQuery && /^[a-zA-Z0-9-_]{20,}$/.test(byQuery)) return byQuery;
    } catch (_error) { }
    return '';
  };

  const id = extractId(raw);
  if (id) return `https://docs.google.com/spreadsheets/d/${id}`;
  if (/^https?:\/\//i.test(raw) && !/^https?:\/\/docs\.google\.com\/spreadsheets/i.test(raw)) return raw;
  return 'https://docs.google.com/spreadsheets';
}
