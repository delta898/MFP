function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafePreviewHref(href) {
  const normalized = String(href || '').trim();
  return /^https?:\/\//i.test(normalized);
}

function renderInlinePreviewLinksHtml(input) {
  const source = String(input ?? '');
  if (!source) return '';

  const parts = [];
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\b(https?:\/\/[^\s<]+)/gi;
  let lastIndex = 0;
  let match;

  while ((match = markdownLinkPattern.exec(source)) !== null) {
    const [fullMatch, markdownLabel = '', markdownHref = '', bareHref = ''] = match;
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      parts.push(escapeHtml(source.slice(lastIndex, matchIndex)));
    }

    const href = markdownHref || bareHref;
    if (isSafePreviewHref(href)) {
      const label = markdownLabel || bareHref;
      parts.push(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
      );
    } else {
      parts.push(escapeHtml(fullMatch));
    }
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < source.length) {
    parts.push(escapeHtml(source.slice(lastIndex)));
  }

  return parts.join('');
}

function renderInlinePreviewHtml(input, boldRanges = []) {
  const source = String(input ?? '');
  const ranges = Array.isArray(boldRanges)
    ? boldRanges
      .map((range) => ({
        start: Math.max(0, Number(range?.start) || 0),
        end: Math.min(source.length, Number(range?.end) || 0)
      }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start)
    : [];

  if (ranges.length === 0) return renderInlinePreviewLinksHtml(source);

  const parts = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    parts.push(renderInlinePreviewLinksHtml(source.slice(cursor, range.start)));
    parts.push(`<strong>${renderInlinePreviewLinksHtml(source.slice(range.start, range.end))}</strong>`);
    cursor = range.end;
  }
  parts.push(renderInlinePreviewLinksHtml(source.slice(cursor)));
  return parts.join('');
}

function normalizeCommaListText(input) {
  return String(input || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .join(', ');
}

function setLocalMarkdownPreviewDensity(panelEl, bodyEl, imageListEl, stats = {}) {
  if (!panelEl || !bodyEl) return;
  const contentCount = Number(stats?.contentCount || 0);
  const imageBlockCount = Number(stats?.imageBlockCount || 0);
  const imageResolvedCount = Number(stats?.imageResolvedCount || 0);
  const bodyHasRenderableContent = contentCount > 0 && !bodyEl.querySelector('.local-markdown-empty');
  const hasImages = imageBlockCount > 0 || imageResolvedCount > 0;

  panelEl.classList.toggle('is-expanded', bodyHasRenderableContent);
  panelEl.classList.toggle('is-compact', !bodyHasRenderableContent);

  const imageSection = imageListEl?.closest('.local-markdown-preview-section');
  if (imageSection) {
    imageSection.classList.toggle('is-hidden', !hasImages);
  }
}

