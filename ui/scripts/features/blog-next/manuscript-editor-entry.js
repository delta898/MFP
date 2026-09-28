import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Fragment } from '@tiptap/pm/model';

function newBlockId() {
  return `mb-${crypto.randomUUID()}`;
}

function parseImageFields(raw) {
  const fields = { id: '', title: '', prompt: '' };
  let current = '';
  for (const line of String(raw || '').split('\n')) {
    const match = line.match(/^(id|title|prompt):\s*(.*)$/i);
    if (match) {
      current = match[1].toLowerCase();
      fields[current] = match[2];
    } else if (current === 'prompt') {
      fields.prompt += `${fields.prompt ? '\n' : ''}${line}`;
    }
  }
  return fields;
}

let nextMissingIndex = 0;
const usedImageIndexes = new Set();

function createImageBlock(onMove) {
  return Node.create({
    name: 'manuscriptImage',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        sourceKey: { default: '' },
        blockId: { default: '' },
        title: { default: '' },
        prompt: { default: '' }
      };
    },
    parseHTML() { return [{ tag: 'div[data-manuscript-image]' }]; },
    renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-manuscript-image': '' }]; },
    markdownTokenizer: {
      name: 'manuscriptImage',
      level: 'block',
      start(source) { return source.indexOf('[[IMAGE'); },
      tokenize(source) {
        const match = source.match(/^\[\[IMAGE(?:_(\d+))?\s*\n([\s\S]*?)\n\]\](?:\n)?/);
        if (!match) return undefined;
        for (const explicit of source.matchAll(/^\[\[IMAGE_(\d+)/gm)) usedImageIndexes.add(Number(explicit[1]));
        const fields = parseImageFields(match[2]);
        let sourceKey;
        if (match[1] === undefined) {
          while (usedImageIndexes.has(nextMissingIndex)) nextMissingIndex += 1;
          sourceKey = String(nextMissingIndex++);
          usedImageIndexes.add(Number(sourceKey));
        } else {
          sourceKey = match[1];
          usedImageIndexes.add(Number(sourceKey));
        }
        return {
          type: 'manuscriptImage', raw: match[0], sourceKey,
          blockId: fields.id, title: fields.title, prompt: fields.prompt
        };
      }
    },
    parseMarkdown(token) {
      return {
        type: 'manuscriptImage',
        attrs: {
          sourceKey: String(token.sourceKey),
          blockId: token.blockId || newBlockId(),
          title: token.title || '',
          prompt: token.prompt || ''
        }
      };
    },
    renderMarkdown({ attrs }) {
      const title = String(attrs.title || '').replace(/[\r\n]+/g, ' ').trim();
      const prompt = String(attrs.prompt || '').replace(/\r/g, '').trim();
      return `[[IMAGE_${attrs.sourceKey}\nid: ${attrs.blockId}\ntitle: ${title}\nprompt: ${prompt}\n]]`;
    },
    addNodeView() {
      return ({ node, editor, getPos }) => {
        let currentNode = node;
        const card = document.createElement('article');
        card.className = 'manuscript-image-block';
        card.contentEditable = 'false';
        const header = document.createElement('div');
        header.className = 'manuscript-image-block-header';
        const title = document.createElement('strong');
        const badge = document.createElement('span');
        badge.textContent = '이미지 블록';
        header.append(title, badge);
        const promptLabel = document.createElement('label');
        promptLabel.textContent = '이미지 설명';
        const prompt = document.createElement('textarea');
        prompt.rows = 2;
        prompt.setAttribute('aria-label', '이미지 생성 프롬프트 편집');
        promptLabel.append(prompt);
        const note = document.createElement('small');
        note.textContent = '이미지 생성과 교체는 다음 단계에서 연결합니다.';
        const actions = document.createElement('div');
        actions.className = 'manuscript-image-block-actions';
        for (const [label, direction] of [['위로', -1], ['아래로', 1]]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'secondary';
          button.textContent = label;
          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', () => onMove(editor, getPos, direction));
          actions.append(button);
        }
        card.append(header, promptLabel, note, actions);
        const render = (value) => {
          currentNode = value;
          title.textContent = value.attrs.title || '제목 없는 이미지';
          prompt.value = value.attrs.prompt || '';
          card.dataset.blockId = value.attrs.blockId;
          card.dataset.sourceKey = value.attrs.sourceKey;
        };
        prompt.addEventListener('change', () => {
          const position = getPos();
          const existing = editor.state.doc.nodeAt(position);
          if (existing) editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...existing.attrs, prompt: prompt.value }));
        });
        render(node);
        return {
          dom: card,
          update(value) { if (value.type.name !== currentNode.type.name) return false; render(value); return true; },
          stopEvent(event) { return event.target === prompt || Boolean(event.target.closest('button')); }
        };
      };
    }
  });
}

function moveTopLevelNode(editor, getPos, direction) {
  const position = getPos();
  const node = editor.state.doc.nodeAt(position);
  if (!node) return;
  const index = editor.state.doc.resolve(position).index(0);
  const content = editor.state.doc.content.content;
  const neighborIndex = index + direction;
  if (neighborIndex < 0 || neighborIndex >= content.length) return;
  const neighbor = content[neighborIndex];
  const start = direction < 0 ? position - neighbor.nodeSize : position;
  const ordered = direction < 0 ? [node, neighbor] : [neighbor, node];
  editor.view.dispatch(editor.state.tr.replaceWith(start, start + node.nodeSize + neighbor.nodeSize, Fragment.fromArray(ordered)));
}

function mount(root, options = {}) {
  let isImporting = false;
  const imageNode = createImageBlock(moveTopLevelNode);
  let editor;
  editor = new Editor({
    element: root,
    extensions: [StarterKit.configure({ codeBlock: false }), Markdown, imageNode],
    content: '',
    contentType: 'markdown',
    editorProps: {
      handlePaste(_view, event) {
        const markdown = event.clipboardData?.getData('text/plain') || '';
        if (!markdown || !/(^#|\[\[IMAGE|^[-*]\s|^\d+[.)]\s|^>\s)/m.test(markdown)) return false;
        event.preventDefault();
        nextMissingIndex = 0;
        usedImageIndexes.clear();
        editor.commands.setContent(markdown, { contentType: 'markdown' });
        return true;
      }
    },
    onUpdate({ editor: current }) {
      if (isImporting) return;
      options.onChange?.(current.getMarkdown());
    }
  });
  return {
    getMarkdown() { return editor.getMarkdown(); },
    setMarkdown(markdown) {
      isImporting = true;
      nextMissingIndex = 0;
      usedImageIndexes.clear();
      editor.commands.setContent(String(markdown || ''), { contentType: 'markdown' });
      isImporting = false;
    },
    setEditable(value) { editor.setEditable(Boolean(value)); },
    focus() { editor.commands.focus(); },
    command(name) {
      const chain = editor.chain().focus();
      if (name === 'paragraph') chain.setParagraph();
      else if (name === 'heading') chain.toggleHeading({ level: 2 });
      else if (name === 'bold') chain.toggleBold();
      else if (name === 'italic') chain.toggleItalic();
      else if (name === 'bulletList') chain.toggleBulletList();
      else if (name === 'orderedList') chain.toggleOrderedList();
      else if (name === 'blockquote') chain.toggleBlockquote();
      else if (name === 'undo') chain.undo();
      else if (name === 'redo') chain.redo();
      else return false;
      return chain.run();
    },
    destroy() { editor.destroy(); }
  };
}

window.BlogGeniusManuscriptEditor = { mount };
