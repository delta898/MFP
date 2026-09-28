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

function createImageBlock(onMove, options = {}) {
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
        prompt: { default: '' },
        sourceUrl: { default: '' },
        slotId: { default: '' },
        imageExists: { default: false },
        imageBusy: { default: false },
        imageOperationState: { default: '' },
        imageStopConfirming: { default: false },
        imageProgressText: { default: '' }
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
        const title = document.createElement('input');
        title.type = 'text';
        title.placeholder = '이미지 제목';
        title.setAttribute('aria-label', '이미지 제목 편집');
        const deleteBlock = document.createElement('button');
        deleteBlock.type = 'button';
        deleteBlock.className = 'manuscript-image-block-delete';
        deleteBlock.textContent = '×';
        deleteBlock.setAttribute('aria-label', '이미지 블록 삭제');
        deleteBlock.title = '이미지 블록 삭제';
        deleteBlock.addEventListener('mousedown', (event) => event.preventDefault());
        deleteBlock.addEventListener('click', () => {
          const position = getPos();
          editor.view.dispatch(editor.state.tr.delete(position, position + currentNode.nodeSize));
        });
        header.append(title, deleteBlock);
        const media = document.createElement('div');
        media.className = 'manuscript-image-block-media';
        const artwork = document.createElement('div');
        artwork.className = 'manuscript-image-block-artwork';
        const mediaStatus = document.createElement('div');
        mediaStatus.className = 'manuscript-image-block-status';
        mediaStatus.setAttribute('role', 'status');
        mediaStatus.setAttribute('aria-live', 'polite');
        const statusCopy = document.createElement('div');
        statusCopy.className = 'manuscript-image-block-status-copy';
        const statusMessage = document.createElement('div');
        statusMessage.className = 'manuscript-image-block-status-message';
        const statusSpinner = document.createElement('span');
        statusSpinner.className = 'local-markdown-image-spinner manuscript-image-block-status-spinner';
        statusSpinner.setAttribute('aria-hidden', 'true');
        const statusMessageText = document.createElement('span');
        statusMessage.append(statusSpinner, statusMessageText);
        const statusDescriptionSlot = document.createElement('small');
        statusDescriptionSlot.className = 'manuscript-image-block-status-description-slot';
        statusDescriptionSlot.setAttribute('aria-hidden', 'true');
        statusCopy.append(statusMessage, statusDescriptionSlot);
        mediaStatus.append(statusCopy);
        const promptLabel = document.createElement('label');
        promptLabel.textContent = '이미지 설명';
        const prompt = document.createElement('textarea');
        prompt.rows = 2;
        prompt.setAttribute('aria-label', '이미지 생성 프롬프트 편집');
        promptLabel.append(prompt);
        const actionGroups = document.createElement('div');
        actionGroups.className = 'manuscript-image-block-action-groups';
        const mediaActions = document.createElement('div');
        mediaActions.className = 'manuscript-image-block-media-actions';
        const structuralActions = document.createElement('div');
        structuralActions.className = 'manuscript-image-block-structure-actions';
        const actionButton = (label, action) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'secondary compact';
          button.textContent = label;
          button.dataset.imageAction = action;
          if (action === 'generate') button.dataset.manuscriptImageAction = action;
          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', () => {
            const current = currentNode.attrs;
            if (!current.slotId || (current.imageBusy && action !== 'generate')) return;
            if (action === 'pick') fileInput.click();
            else options.onImageAction?.(action, current.slotId);
          });
          return button;
        };
        const generate = actionButton('AI로 만들기', 'generate');
        const pick = actionButton('내 이미지 선택', 'pick');
        const continueButton = document.createElement('button');
        continueButton.type = 'button';
        continueButton.className = 'secondary compact';
        continueButton.textContent = '계속 진행';
        continueButton.dataset.manuscriptImageContinue = '';
        continueButton.hidden = true;
        continueButton.addEventListener('mousedown', (event) => event.preventDefault());
        continueButton.addEventListener('click', () => options.onImageAction?.('continue', currentNode.attrs.slotId));
        // Keep the two-step stop decision together; image-management actions follow it.
        mediaActions.append(generate, continueButton, pick);
        const removeImage = actionButton('이미지 제거', 'remove');
        mediaActions.append(removeImage);
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png,image/jpeg,image/webp,image/avif';
        fileInput.hidden = true;
        fileInput.addEventListener('change', () => options.onImageFile?.(currentNode.attrs.slotId, fileInput));
        media.append(artwork, mediaStatus, mediaActions);
        for (const [label, direction] of [['위로', -1], ['아래로', 1]]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'secondary';
          button.textContent = label;
          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', () => onMove(editor, getPos, direction));
          structuralActions.append(button);
        }
        actionGroups.append(structuralActions);
        card.append(header, media, promptLabel, actionGroups, fileInput);
        const render = (value) => {
          currentNode = value;
          if (title.value !== (value.attrs.title || '')) title.value = value.attrs.title || '';
          if (prompt.value !== (value.attrs.prompt || '')) prompt.value = value.attrs.prompt || '';
          card.dataset.blockId = value.attrs.blockId;
          card.dataset.sourceKey = value.attrs.sourceKey;
          generate.dataset.slotId = value.attrs.slotId || '';
          const shared = window.BlogGeniusManuscriptImageCard;
          const image = options.getImage?.(value.attrs.blockId, value.attrs.sourceKey, value.attrs) || {};
          const operationState = value.attrs.imageOperationState || '';
          const isGenerating = value.attrs.imageBusy && operationState !== 'mutating';
          const isBusy = value.attrs.imageBusy;
          const stopConfirming = value.attrs.imageStopConfirming;
          artwork.innerHTML = shared?.renderMedia
            // This node view owns the single inline generation status; don't render a second one inside the placeholder.
            ? shared.renderMedia({ ...image, exists: Boolean(value.attrs.imageExists), imageUrl: value.attrs.sourceUrl, generating: false }, { compact: true })
            : (value.attrs.imageExists && value.attrs.sourceUrl
              ? `<img class="manuscript-image-block-image" src="${String(value.attrs.sourceUrl).replace(/[&<>\"']/g, '')}" alt="">`
              : '<div class="manuscript-image-block-placeholder">이미지 없음</div>');
          removeImage.hidden = !value.attrs.imageExists;
          const generateLabel = operationState === 'mutating' ? '적용 중…'
            : operationState === 'starting' ? '준비 중…'
              : operationState === 'cancel_requested' ? '중지 요청 중…'
                : stopConfirming ? '중지 확인' : '중지';
          generate.textContent = isBusy ? generateLabel : value.attrs.imageExists ? 'AI 재생성' : 'AI로 만들기';
          generate.className = `compact ${isBusy ? (operationState === 'mutating' ? 'secondary' : 'ghost ui-danger-action') : value.attrs.imageExists ? 'secondary' : 'primary'}`;
          pick.textContent = value.attrs.imageExists ? '이미지 교체' : '내 이미지 선택';
          continueButton.hidden = !stopConfirming;
          // Keep the active generate/stop control available like the legacy image cards.
          // The stop handler owns the operation-state guard and provides its two-step confirmation.
          generate.disabled = isBusy && operationState === 'mutating';
          pick.disabled = removeImage.disabled = isBusy;
          structuralActions.querySelectorAll('button').forEach((button) => { button.disabled = isBusy; });
          mediaActions.classList.toggle('is-empty', !value.attrs.imageExists);
          mediaStatus.hidden = !isBusy;
          statusSpinner.hidden = !isGenerating;
          statusMessageText.textContent = value.attrs.imageProgressText || '이미지 작업 중';
        };
        const updateField = (field, attribute) => {
          const position = getPos();
          const existing = editor.state.doc.nodeAt(position);
          if (existing && existing.attrs[attribute] !== field.value) {
            editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, { ...existing.attrs, [attribute]: field.value }));
          }
        };
        prompt.addEventListener('input', () => updateField(prompt, 'prompt'));
        title.addEventListener('input', () => updateField(title, 'title'));
        render(node);
        return {
          dom: card,
          update(value) { if (value.type.name !== currentNode.type.name) return false; render(value); return true; },
          stopEvent(event) { return event.target === prompt || event.target === title || event.target === fileInput || Boolean(event.target.closest('button')); }
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
  let lastMarkdown = '';
  const imageNode = createImageBlock(moveTopLevelNode, options);
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
      const markdown = current.getMarkdown();
      if (markdown === lastMarkdown) return;
      lastMarkdown = markdown;
      options.onChange?.(markdown);
    }
  });
  return {
    getMarkdown() { return editor.getMarkdown(); },
    setMarkdown(markdown) {
      isImporting = true;
      nextMissingIndex = 0;
      usedImageIndexes.clear();
      editor.commands.setContent(String(markdown || ''), { contentType: 'markdown' });
      lastMarkdown = editor.getMarkdown();
      isImporting = false;
    },
    setEditable(value) { editor.setEditable(Boolean(value)); },
    syncImages(images = [], operation = null, mutationSlotId = '') {
      const busySlotId = operation?.slotId || mutationSlotId || '';
      const progressText = mutationSlotId && !operation ? '이미지 작업을 적용하고 있습니다.'
        : operation ? 'AI 이미지 생성 중' : '';
      const byBlockId = new Map(images.filter((image) => image.blockId).map((image) => [image.blockId, image]));
      const byIndex = new Map(images.map((image) => [Number(image.index), image]));
      const transaction = editor.state.tr;
      let changed = false;
      editor.state.doc.descendants((node, position) => {
        if (node.type.name !== 'manuscriptImage') return;
        const image = byBlockId.get(node.attrs.blockId) || byIndex.get(Number(node.attrs.sourceKey));
        if (!image) return;
        const next = {
          ...node.attrs,
          slotId: image.slotId || '',
          sourceUrl: image.exists ? (image.imageUrl || '') : '',
          imageExists: Boolean(image.exists),
          imageBusy: Boolean(busySlotId && image.slotId === busySlotId),
          imageOperationState: busySlotId && image.slotId === busySlotId ? (operation?.state || (mutationSlotId ? 'mutating' : '')) : '',
          imageStopConfirming: Boolean(busySlotId && image.slotId === busySlotId && operation?.confirmingStop),
          imageProgressText: busySlotId && image.slotId === busySlotId ? progressText : ''
        };
        if (node.attrs.slotId === next.slotId && node.attrs.sourceUrl === next.sourceUrl
          && node.attrs.imageExists === next.imageExists && node.attrs.imageBusy === next.imageBusy
          && node.attrs.imageOperationState === next.imageOperationState
          && node.attrs.imageStopConfirming === next.imageStopConfirming
          && node.attrs.imageProgressText === next.imageProgressText) return;
        transaction.setNodeMarkup(position, undefined, next);
        changed = true;
      });
      if (changed) editor.view.dispatch(transaction.setMeta('addToHistory', false));
    },
    focus() { editor.commands.focus(); },
    command(name) {
      const chain = editor.chain().focus();
      if (name === 'image') {
        const used = new Set();
        editor.state.doc.descendants((node) => { if (node.type.name === 'manuscriptImage') used.add(Number(node.attrs.sourceKey)); });
        let sourceKey = 0;
        while (used.has(sourceKey)) sourceKey += 1;
        return editor.chain().focus().insertContent({
          type: 'manuscriptImage',
          attrs: { sourceKey: String(sourceKey), blockId: newBlockId(), title: '', prompt: '' }
        }).run();
      }
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
