export function headingSlug(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, '$2')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function headingAnchors(markdown) {
  const result = new Map();
  const counts = new Map();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const heading = match[1].trim();
    const slug = headingSlug(heading);
    if (!slug) continue;
    const count = counts.get(slug) || 0;
    counts.set(slug, count + 1);
    if (!result.has(heading.toLocaleLowerCase())) result.set(heading.toLocaleLowerCase(), count === 0 ? slug : `${slug}-${count}`);
  }
  return result;
}

export function createHeadingResolver(markdown) {
  const anchors = headingAnchors(markdown);
  return (fragment) => {
    const requested = fragment.trim().replace(/^#/, '');
    if (!requested) return '';
    if (requested.startsWith('^')) return requested.slice(1);
    return anchors.get(requested.toLocaleLowerCase()) || headingSlug(requested);
  };
}

export function resolveHeadingAnchor(markdown, fragment) {
  return createHeadingResolver(markdown)(fragment);
}

function maskCode(markdown, transform) {
  const code = [];
  const protect = (value) => {
    const marker = `\uE000FOOTNOTE_CODE_${code.length}\uE001`;
    code.push(value);
    return marker;
  };
  let masked = markdown.replace(/^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, protect);
  masked = masked.replace(/(`+)([^`\n]*?)\1/g, protect);
  const transformed = masked.replace(/\uE000FOOTNOTE_CODE_\d+\uE001|[^\uE000]+/g, (part) =>
    part.startsWith('\uE000FOOTNOTE_CODE_') ? part : transform(part),
  );
  return transformed.replace(/\uE000FOOTNOTE_CODE_(\d+)\uE001/g, (_match, index) => code[Number(index)]);
}

export function renderObsidianFootnotes(markdown, marked) {
  const lines = markdown.split(/\r?\n/);
  const definitions = new Map();
  const content = [];
  let fence = null;
  let activeDefinition = null;
  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      activeDefinition = null;
      content.push(line);
      continue;
    }
    const definition = !fence && line.match(/^\[\^([^\]]+)\]:[ \t]*(.*)$/);
    if (definition) {
      activeDefinition = definition[1];
      definitions.set(activeDefinition, definition[2]);
      continue;
    }
    if (!fence && activeDefinition && /^(?: {2,}|\t).+$/.test(line)) {
      definitions.set(activeDefinition, `${definitions.get(activeDefinition)}\n${line.trimStart()}`);
      continue;
    }
    activeDefinition = null;
    content.push(line);
  }
  if (!definitions.size) return content.join('\n');

  const referenceCount = new Map();
  const body = maskCode(content.join('\n'), (plain) => plain.replace(/\[\^([^\]]+)\]/g, (literal, key) => {
    if (!definitions.has(key)) return literal;
    const count = (referenceCount.get(key) || 0) + 1;
    referenceCount.set(key, count);
    const safeKey = encodeURIComponent(key).replace(/%/g, '-');
    const refId = `fnref-${safeKey}${count > 1 ? `-${count}` : ''}`;
    const number = [...definitions.keys()].indexOf(key) + 1;
    return `<sup class="footnote-ref" id="${refId}"><a href="#fn-${safeKey}">${number}</a></sup>`;
  }));

  const items = [...definitions].filter(([key]) => referenceCount.has(key)).map(([key, note], index) => {
    const safeKey = encodeURIComponent(key).replace(/%/g, '-');
    const backrefs = Array.from({ length: referenceCount.get(key) }, (_unused, i) =>
      `<a class="footnote-backref" href="#fnref-${safeKey}${i ? `-${i + 1}` : ''}" aria-label="각주 ${index + 1}로 돌아가기">↩</a>`,
    ).join(' ');
    return `<li id="fn-${safeKey}">${marked.parse(note)} ${backrefs}</li>`;
  }).join('\n');
  return `${body}\n\n<section class="footnotes" aria-label="각주"><hr /><ol>${items}</ol></section>`;
}

export function createObsidianRenderer(marked) {
  const counts = new Map();
  const renderer = new marked.Renderer();
  renderer.heading = function ({ text, tokens, depth }) {
      const slug = headingSlug(text) || 'section';
      const count = counts.get(slug) || 0;
      counts.set(slug, count + 1);
      const id = count === 0 ? slug : `${slug}-${count}`;
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    };
  renderer.blockquote = function (token) {
      const directive = token.raw.match(/^>\s*\[!([\w-]+)\]([+-])?\s*(.*?)\s*(?:\r?\n|$)/);
      if (!directive) return false;
      const [, rawType, fold, rawTitle] = directive;
      const type = rawType.toLocaleLowerCase();
      const title = rawTitle || type.replace(/-/g, ' ');
      const inner = token.raw
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.replace(/^> ?/, ''))
        .join('\n')
        .trim();
      const content = inner ? marked.parse(inner, { renderer: createObsidianRenderer(marked) }) : '';
      const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (fold) {
        return `<details class="callout callout-${type}" data-callout="${type}"${fold === '+' ? ' open' : ''}><summary>${escapedTitle}</summary><div class="callout-content">${content}</div></details>\n`;
      }
      return `<aside class="callout callout-${type}" data-callout="${type}"><div class="callout-title">${escapedTitle}</div><div class="callout-content">${content}</div></aside>\n`;
    };
  return renderer;
}
