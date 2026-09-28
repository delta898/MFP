import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Fragment } from '@tiptap/pm/model';
import './style.css';
import './stage0.css';

const FILES_BY_SOURCE_KEY = Object.freeze({ '0': '00_coast.png', '1': '01_morning.png' });
const SAMPLE_MARKDOWN = `# 제주 아침 풍경\n\n아침 바람을 맞으며 해안 길을 천천히 걷습니다.\n\n[[IMAGE_0\ntitle: 송악산 해안 길\nprompt: 맑은 아침 햇살이 비치는 제주 해안 절벽과 푸른 바다, 사진처럼 자연스러운 여행 풍경, 이미지 안에 글자 없음\n]]\n\n## 천천히 발견한 장면\n\n파도 소리를 들으며 익숙한 길에서도 새로운 풍경을 만납니다.\n\n[[IMAGE_1\ntitle: 아침 산책길\nprompt: 제주 해안 산책로를 걷는 이른 아침, 부드러운 빛과 고요한 바다, 이미지 안에 글자 없음\n]]\n\n- 서두르지 않고 걷기\n- 마음에 드는 풍경에서 쉬기`;

const sourceInput = document.querySelector('#source-markdown');
const editorElement = document.querySelector('#stage0-editor');
const markdownOutput = document.querySelector('#markdown-output');
const toolbar = document.querySelector('.editor-toolbar');
const editorStatus = document.querySelector('#editor-status');

function setCheck(name, state, message) {
  document.querySelector(`#check-${name}`).className = `check-dot ${state}`;
  document.querySelector(`#check-${name}-note`).textContent = message;
}

function makeId() {
  return `mb-${crypto.randomUUID()}`;
}

function parseFields(raw) {
  const fields = { id: '' };
  let currentField = '';
  for (const line of String(raw || '').split('\n')) {
    const fieldMatch = line.match(/^(id|title|prompt):\s*(.*)$/);
    if (fieldMatch) {
      currentField = fieldMatch[1];
      fields[currentField] = fieldMatch[2];
    } else if (currentField === 'prompt') {
      fields.prompt += `\n${line}`;
    }
  }
  return fields;
}

const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      sourceKey: { default: '' },
      blockId: { default: '' },
      title: { default: '' },
      prompt: { default: '' },
      sourceFile: { default: '' }
    };
  },
  parseHTML() { return [{ tag: 'div[data-image-block]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', { ...HTMLAttributes, 'data-image-block': '' }]; },
  markdownTokenizer: {
    name: 'imageBlock',
    level: 'block',
    start(source) { return source.indexOf('[[IMAGE_'); },
    tokenize(source) {
      const match = source.match(/^\[\[IMAGE_(\d+)\s*\n([\s\S]*?)\n\]\](?:\n)?/);
      if (!match) return undefined;
      const fields = parseFields(match[2]);
      return {
        type: 'imageBlock',
        raw: match[0],
        sourceKey: match[1],
        blockId: fields.id,
        title: fields.title || '',
        prompt: fields.prompt || ''
      };
    }
  },
  parseMarkdown(token) {
    const sourceKey = String(token.sourceKey);
    return {
      type: 'imageBlock',
      attrs: {
        sourceKey,
        blockId: token.blockId || makeId(),
        title: token.title || '',
        prompt: token.prompt || '',
        sourceFile: FILES_BY_SOURCE_KEY[sourceKey] || ''
      }
    };
  },
  renderMarkdown({ attrs }) {
    const sourceKey = String(attrs.sourceKey);
    const title = String(attrs.title || '').replace(/[\r\n]+/g, ' ').trim();
    const prompt = String(attrs.prompt || '').replace(/\r/g, '').trim();
    return `[[IMAGE_${sourceKey}\nid: ${attrs.blockId}\ntitle: ${title}\nprompt: ${prompt}\n]]`;
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node;
      const card = document.createElement('article');
      card.className = 'stage0-image-block';
      card.contentEditable = 'false';

      const preview = document.createElement('div');
      preview.className = 'stage0-image-preview';
      preview.innerHTML = '<span aria-hidden="true">▧</span><small>이미지 asset</small>';

      const details = document.createElement('div');
      details.className = 'stage0-image-details';
      const heading = document.createElement('div');
      heading.className = 'stage0-image-heading';
      const title = document.createElement('strong');
      const source = document.createElement('code');
      const identity = document.createElement('small');
      const promptLabel = document.createElement('label');
      promptLabel.textContent = '이미지 prompt';
      const prompt = document.createElement('textarea');
      prompt.rows = 2;
      prompt.setAttribute('aria-label', '이미지 prompt 편집');
      const status = document.createElement('small');
      status.className = 'stage0-image-mapping';
      const actions = document.createElement('div');
      actions.className = 'stage0-image-actions';

      function move(direction) {
        const position = getPos();
        const target = editor.state.doc.nodeAt(position);
        if (!target) return;
        const topLevelIndex = editor.state.doc.resolve(position).index(0);
        const content = editor.state.doc.content.content;
        const otherIndex = topLevelIndex + direction;
        if (otherIndex < 0 || otherIndex >= content.length) return;
        const pairStart = direction < 0 ? position - content[otherIndex].nodeSize : position;
        const pairEnd = direction < 0 ? position + target.nodeSize : position + target.nodeSize + content[otherIndex].nodeSize;
        const reordered = direction < 0 ? [target, content[otherIndex]] : [content[otherIndex], target];
        const transaction = editor.state.tr.replaceWith(pairStart, pairEnd, Fragment.fromArray(reordered));
        editor.view.dispatch(transaction);
      }

      for (const [label, direction] of [['위로 이동', -1], ['아래로 이동', 1]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button tiny secondary';
        button.textContent = label;
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => move(direction));
        actions.append(button);
      }

      promptLabel.append(prompt);
      heading.append(title, source);
      details.append(heading, identity, promptLabel, status, actions);
      card.append(preview, details);

      function render(nextNode) {
        currentNode = nextNode;
        const attrs = currentNode.attrs;
        card.dataset.blockId = attrs.blockId;
        card.dataset.sourceKey = attrs.sourceKey;
        title.textContent = attrs.title || '제목 없는 이미지';
        source.textContent = `IMAGE_${attrs.sourceKey}`;
        identity.textContent = `blockId: ${attrs.blockId}`;
        prompt.value = attrs.prompt || '';
        status.textContent = attrs.sourceFile
          ? `폴더 매핑: ${attrs.sourceFile} · 편집 중에도 이 연결을 유지합니다.`
          : '연결된 파일 없음 · 내부 blockId로 이미지 자산을 연결합니다.';
        preview.innerHTML = '';
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = attrs.sourceFile ? '▧' : '＋';
        const caption = document.createElement('small');
        caption.textContent = attrs.sourceFile ? attrs.sourceFile : '이미지 선택 또는 생성';
        preview.append(icon, caption);
      }

      prompt.addEventListener('change', () => {
        const position = getPos();
        const current = editor.state.doc.nodeAt(position);
        if (!current) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...current.attrs, prompt: prompt.value }));
      });

      render(currentNode);
      return {
        dom: card,
        update(nextNode) {
          if (nextNode.type !== currentNode.type) return false;
          render(nextNode);
          return true;
        },
        stopEvent(event) { return event.target === prompt || Boolean(event.target.closest('button')); }
      };
    };
  }
});

const editor = new Editor({
  element: editorElement,
  extensions: [StarterKit.configure({ codeBlock: false, horizontalRule: false }), Markdown, ImageBlock],
  content: '# 원고를 가져오세요',
  contentType: 'markdown',
  onUpdate: ({ editor: currentEditor }) => {
    markdownOutput.textContent = currentEditor.getMarkdown();
    editorStatus.textContent = '수정됨 · 로컬 prototype';
    checkKorean(currentEditor.getText());
  }
});

markdownOutput.textContent = editor.getMarkdown();

function checkKorean(text) {
  const hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(text);
  setCheck('korean', hasKorean ? 'passed' : '', hasKorean ? '본문에서 한글 입력을 확인했습니다.' : '본문에 한글을 입력해 주세요.');
}

function readImageSummary(currentEditor) {
  const images = [];
  currentEditor.state.doc.descendants((node) => {
    if (node.type.name === 'imageBlock') images.push(node.attrs);
  });
  return images;
}

function importSource() {
  const inputMarkdown = sourceInput.value;
  try {
    editor.commands.setContent(inputMarkdown, { contentType: 'markdown' });
    const images = readImageSummary(editor);
    const keys = images.map((image) => image.sourceKey);
    const ids = images.map((image) => image.blockId);
    if (images.length !== 2 || new Set(keys).size !== keys.length || new Set(ids).size !== ids.length) {
      throw new Error('이미지 marker 개수나 key/ID가 기대값과 다릅니다.');
    }
    setCheck('import', 'passed', `${images.length}개 marker · sourceKey ${keys.join(', ')}`);
    const mapped = images.every((image) => image.sourceFile === FILES_BY_SOURCE_KEY[image.sourceKey]);
    setCheck('files', mapped ? 'passed' : 'failed', mapped ? images.map((image) => `${image.sourceKey}→${image.sourceFile}`).join(' · ') : '일부 파일 매핑이 없습니다.');
    editorStatus.textContent = '가져오기 완료';
    markdownOutput.textContent = editor.getMarkdown();
  } catch (error) {
    setCheck('import', 'failed', error.message);
    editorStatus.textContent = '가져오기 실패';
  }
}

document.querySelector('#import-markdown').addEventListener('click', importSource);
document.querySelector('#roundtrip-markdown').addEventListener('click', () => {
  const before = readImageSummary(editor).map(({ sourceKey, blockId, title, prompt, sourceFile }) => ({ sourceKey, blockId, title, prompt, sourceFile }));
  const serialized = editor.getMarkdown();
  markdownOutput.textContent = serialized;
  try {
    editor.commands.setContent(serialized, { contentType: 'markdown' });
    const after = readImageSummary(editor).map(({ sourceKey, blockId, title, prompt, sourceFile }) => ({ sourceKey, blockId, title, prompt, sourceFile }));
    const passed = JSON.stringify(before) === JSON.stringify(after);
    setCheck('roundtrip', passed ? 'passed' : 'failed', passed ? `${after.length}개 이미지의 sourceKey·blockId·prompt·파일 연결 보존` : '왕복 과정에서 image block 속성이 바뀌었습니다.');
    editorStatus.textContent = passed ? 'Markdown 왕복 보존' : '왕복 결과 확인 필요';
    markdownOutput.textContent = editor.getMarkdown();
  } catch (error) {
    setCheck('roundtrip', 'failed', error.message);
  }
});

document.querySelector('#add-image-block').addEventListener('click', () => {
  const images = readImageSummary(editor);
  const usedKeys = new Set(images.map((image) => image.sourceKey));
  let sourceKey = 0;
  while (usedKeys.has(String(sourceKey))) sourceKey += 1;
  editor.chain().focus().insertContent({
    type: 'imageBlock',
    attrs: { sourceKey: String(sourceKey), blockId: makeId(), title: '새 이미지', prompt: '원하는 이미지 장면을 설명하세요.', sourceFile: '' }
  }).run();
});

toolbar.addEventListener('mousedown', (event) => event.preventDefault());
toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-command]');
  if (!button) return;
  const chain = editor.chain().focus();
  if (button.dataset.command === 'bold') chain.toggleBold().run();
  if (button.dataset.command === 'heading') chain.toggleHeading({ level: 2 }).run();
  if (button.dataset.command === 'bulletList') chain.toggleBulletList().run();
  if (button.dataset.command === 'blockquote') chain.toggleBlockquote().run();
});

sourceInput.value = SAMPLE_MARKDOWN;
importSource();
window.addEventListener('beforeunload', () => editor.destroy());
