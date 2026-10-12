import { Editor, Extension, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Fragment } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';

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
const manuscriptImageSlashPluginKey = new PluginKey('manuscriptImageSlash');
const IMAGE_SLASH_ITEM = Object.freeze({
  id: 'image',
  label: '이미지 블록',
  description: '현재 위치에 이미지 블록을 추가합니다.',
  aliases: Object.freeze(['image', '이미지'])
});

function nextImageSourceKey(editor) {
  const used = new Set();
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'manuscriptImage') used.add(Number(node.attrs.sourceKey));
  });
  let sourceKey = 0;
  while (used.has(sourceKey)) sourceKey += 1;
  return String(sourceKey);
}

function insertManuscriptImage(editor, range = null) {
  const image = {
    type: 'manuscriptImage',
    attrs: { sourceKey: nextImageSourceKey(editor), blockId: newBlockId(), title: '', prompt: '' }
  };
  if (range) {
    const $from = editor.state.doc.resolve(range.from);
    return editor.chain().focus().insertContentAt({ from: $from.before(), to: $from.after() }, image).run();
  }
  return editor.chain().focus().insertContent(image).run();
}

function filterImageSlashItems(query = '') {
  const normalized = String(query || '').trim().toLocaleLowerCase();
  if (!normalized) return [IMAGE_SLASH_ITEM];
  const searchable = [IMAGE_SLASH_ITEM.label, ...IMAGE_SLASH_ITEM.aliases]
    .join(' ')
    .toLocaleLowerCase();
  return searchable.includes(normalized) ? [IMAGE_SLASH_ITEM] : [];
}

function createImageSlashMenuRenderer() {
  let menu = null;
  let unmount = null;
  let currentProps = null;
  let selectedIndex = 0;

  const selectItem = (item) => {
    if (!item || !currentProps) return;
    currentProps.command(item);
  };

  const renderMenu = (props) => {
    if (!menu) return;
    currentProps = props;
    const items = Array.isArray(props.items) ? props.items : [];
    selectedIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0;
    menu.replaceChildren();
    menu.hidden = items.length === 0;
    items.forEach((item, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'manuscript-slash-menu-option';
      option.id = `manuscript-slash-${item.id}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === selectedIndex));
      option.tabIndex = -1;
      const label = document.createElement('strong');
      label.textContent = item.label;
      const description = document.createElement('small');
      description.textContent = item.description;
      option.append(label, description);
      option.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        selectItem(item);
      });
      menu.append(option);
    });
  };

  const moveSelection = (direction) => {
    const items = currentProps?.items || [];
    if (items.length === 0) return false;
    selectedIndex = (selectedIndex + direction + items.length) % items.length;
    renderMenu(currentProps);
    return true;
  };

  return {
    onStart(props) {
      menu = document.createElement('div');
      menu.className = 'manuscript-slash-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', '원고 블록 추가');
      renderMenu(props);
      unmount = props.mount(menu);
    },
    onUpdate(props) { renderMenu(props); },
    onKeyDown({ event }) {
      if (event.key === 'ArrowDown') return moveSelection(1);
      if (event.key === 'ArrowUp') return moveSelection(-1);
      if (event.key === 'Enter') {
        const item = currentProps?.items?.[selectedIndex];
        if (!item) return false;
        selectItem(item);
        return true;
      }
      return false;
    },
    onExit() {
      unmount?.();
      unmount = null;
      menu = null;
      currentProps = null;
      selectedIndex = 0;
    }
  };
}

function createImageSlashCommand() {
  return Extension.create({
    name: 'manuscriptImageSlash',
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          const state = manuscriptImageSlashPluginKey.getState(this.editor.state);
          if (!state?.active || filterImageSlashItems(state.query).length === 0) return false;
          return insertManuscriptImage(this.editor, state.range);
        },
        ArrowDown: () => Boolean(manuscriptImageSlashPluginKey.getState(this.editor.state)?.active),
        ArrowUp: () => Boolean(manuscriptImageSlashPluginKey.getState(this.editor.state)?.active)
      };
    },
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [Suggestion({
        editor,
        pluginKey: manuscriptImageSlashPluginKey,
        char: '/',
        startOfLine: true,
        allowedPrefixes: null,
        shouldResetDismissed: ({ match, transaction }) => (
          transaction.docChanged && match.text === '/'
        ),
        items: ({ query }) => filterImageSlashItems(query),
        allow: ({ state, range }) => {
          if (!editor.isEditable) return false;
          const $from = state.doc.resolve(range.from);
          return $from.depth === 1
            && $from.parent.type.name === 'paragraph'
            && range.from === $from.start()
            && range.to - range.from === $from.parent.content.size;
        },
        command: ({ editor: current, range }) => insertManuscriptImage(current, range),
        render: createImageSlashMenuRenderer
      })];
    }
  });
}

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
        const blockLabel = document.createElement('span');
        blockLabel.className = 'manuscript-image-block-label';
        blockLabel.textContent = '이미지 블록';
        const structuralActions = document.createElement('div');
        structuralActions.className = 'manuscript-image-block-structure-actions';
        const title = document.createElement('input');
        title.type = 'text';
        title.placeholder = '이미지 제목';
        title.className = 'manuscript-image-block-title';
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
        for (const [icon, direction] of [['↑', -1], ['↓', 1]]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'secondary compact manuscript-image-block-move';
          button.textContent = icon;
          button.setAttribute('aria-label', `${direction < 0 ? '위로' : '아래로'} 이동`);
          button.title = `${direction < 0 ? '위로' : '아래로'} 이동`;
          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', () => onMove(editor, getPos, direction));
          structuralActions.append(button);
        }
        structuralActions.append(deleteBlock);
        header.append(blockLabel, structuralActions);
        const media = document.createElement('div');
        media.className = 'manuscript-image-block-media';
        const artwork = document.createElement('div');
        artwork.className = 'manuscript-image-block-artwork';
        const dropHint = document.createElement('div');
        dropHint.className = 'manuscript-image-block-drop-hint';
        dropHint.setAttribute('aria-hidden', 'true');
        dropHint.innerHTML = '<span aria-hidden="true">＋</span><strong>이미지를 놓아 추가</strong>';
        const mediaFeedback = document.createElement('div');
        mediaFeedback.className = 'manuscript-image-block-media-feedback';
        mediaFeedback.setAttribute('role', 'status');
        mediaFeedback.setAttribute('aria-live', 'polite');
        mediaFeedback.hidden = true;
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
        const main = document.createElement('div');
        main.className = 'manuscript-image-block-main';
        const fields = document.createElement('div');
        fields.className = 'manuscript-image-block-fields';
        const titleLabel = document.createElement('label');
        titleLabel.textContent = '이미지 제목';
        titleLabel.append(title);
        const promptLabel = document.createElement('label');
        promptLabel.textContent = '이미지 프롬프트';
        const prompt = document.createElement('textarea');
        prompt.rows = 5;
        prompt.placeholder = '어떤 이미지를 만들지 설명합니다.';
        prompt.setAttribute('aria-label', '이미지 생성 프롬프트 편집');
        promptLabel.append(prompt);
        fields.append(titleLabel, promptLabel);
        main.append(media, fields);
        const promptGeneration = document.createElement('div');
        promptGeneration.className = 'manuscript-image-block-prompt-generation';
        const promptGuidanceLabel = document.createElement('label');
        promptGuidanceLabel.className = 'manuscript-image-block-prompt-guidance-label';
        promptGuidanceLabel.textContent = '추가 요청';
        const optional = document.createElement('span');
        optional.textContent = '선택';
        promptGuidanceLabel.append(optional);
        const promptGuidance = document.createElement('input');
        promptGuidance.type = 'text';
        promptGuidance.className = 'manuscript-image-block-prompt-guidance';
        promptGuidance.placeholder = '예: 따뜻한 색감, 사람은 나오지 않게';
        promptGuidance.setAttribute('aria-label', '프롬프트 생성 추가 요청');
        const generatePrompt = document.createElement('button');
        generatePrompt.type = 'button';
        generatePrompt.className = 'ui-text-action compact manuscript-image-block-generate-prompt';
        setUiAiActionButton(generatePrompt, '프롬프트 만들기');
        generatePrompt.disabled = typeof options.onPromptGenerate !== 'function';
        generatePrompt.title = '글쓰기 모델로 이미지 제목과 프롬프트 생성';
        generatePrompt.setAttribute('aria-label', '프롬프트 만들기 (글쓰기 모델)');
        const promptGenerationHelpId = `manuscript-image-prompt-generation-help-${crypto.randomUUID()}`;
        generatePrompt.setAttribute('aria-describedby', promptGenerationHelpId);
        const promptGenerationHelp = document.createElement('small');
        promptGenerationHelp.id = promptGenerationHelpId;
        promptGenerationHelp.className = 'manuscript-image-block-prompt-generation-help';
        promptGenerationHelp.textContent = '글쓰기 모델이 원고 맥락, 현재 내용과 추가 요청을 참고합니다.';
        promptGenerationHelp.hidden = true;
        promptGenerationHelp.setAttribute('role', 'status');
        promptGenerationHelp.setAttribute('aria-live', 'polite');
        generatePrompt.addEventListener('mousedown', (event) => event.preventDefault());
        generatePrompt.addEventListener('click', async () => {
          if (generatePrompt.disabled || typeof options.onPromptGenerate !== 'function') return;
          generatePrompt.disabled = true;
          setUiAiActionButton(generatePrompt, '프롬프트 만드는 중…');
          [title, prompt, promptGuidance].forEach((field) => { field.disabled = true; });
          promptGenerationHelp.hidden = false;
          promptGenerationHelp.textContent = '글쓰기 모델로 제목과 프롬프트를 만드는 중…';
          promptGenerationHelp.removeAttribute('data-error');
          try {
            const result = await options.onPromptGenerate({
              blockId: currentNode.attrs.blockId,
              slotId: currentNode.attrs.slotId,
              title: title.value,
              prompt: prompt.value,
              instruction: promptGuidance.value
            });
            if (!result?.title || !result?.prompt) throw new Error('생성 결과가 비어 있습니다.');
            title.value = result.title;
            prompt.value = result.prompt;
            const position = getPos();
            const existing = editor.state.doc.nodeAt(position);
            if (existing) {
              editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
                ...existing.attrs,
                title: result.title,
                prompt: result.prompt
              }));
            }
            promptGuidance.value = '';
            promptGenerationHelp.hidden = true;
          } catch (error) {
            promptGenerationHelp.textContent = error?.message || '생성에 실패했습니다. 기존 제목과 프롬프트는 유지됩니다.';
            promptGenerationHelp.dataset.error = 'true';
          } finally {
            [title, prompt, promptGuidance].forEach((field) => { field.disabled = false; });
            generatePrompt.disabled = typeof options.onPromptGenerate !== 'function';
            setUiAiActionButton(generatePrompt, '프롬프트 만들기');
          }
        });
        promptGeneration.append(promptGuidanceLabel, promptGuidance, generatePrompt, promptGenerationHelp);
        const mediaActions = document.createElement('div');
        mediaActions.className = 'manuscript-image-block-media-actions';
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
        const generate = actionButton('이미지', 'generate');
        setUiAiActionButton(generate, '이미지');
        const pick = actionButton('＋', 'pick');
        pick.className = 'secondary compact manuscript-image-block-pick';
        pick.setAttribute('aria-label', '내 이미지에서 선택');
        pick.title = '내 이미지에서 선택';
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
        const validateImageFile = (file) => {
          if (!file) return '이미지 파일을 선택해 주세요.';
          const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
          const type = String(file.type || '').toLowerCase();
          const extension = String(file.name || '').split('.').pop().toLowerCase();
          if (type ? !allowedTypes.has(type) : !['png', 'jpg', 'jpeg', 'webp', 'avif'].includes(extension)) {
            return 'PNG, JPEG, WebP 또는 AVIF 이미지를 선택해 주세요.';
          }
          if (file.size > 20 * 1024 * 1024) return '이미지는 최대 20MB까지 선택할 수 있습니다.';
          return '';
        };
        let dragDepth = 0;
        const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
        const setMediaFeedback = (message) => {
          mediaFeedback.textContent = message;
          mediaFeedback.hidden = !message;
        };
        const handleImageFile = (file) => {
          const error = validateImageFile(file);
          if (error) {
            setMediaFeedback(error);
            return false;
          }
          if (!currentNode.attrs.slotId) {
            setMediaFeedback('이미지 영역이 준비된 뒤 다시 시도해 주세요.');
            return false;
          }
          setMediaFeedback('');
          const transfer = new DataTransfer();
          transfer.items.add(file);
          fileInput.files = transfer.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };
        fileInput.addEventListener('change', () => {
          const error = validateImageFile(fileInput.files?.[0]);
          if (error) {
            setMediaFeedback(error);
            fileInput.value = '';
            return;
          }
          setMediaFeedback('');
          options.onImageFile?.(currentNode.attrs.slotId, fileInput);
        });
        media.addEventListener('dragenter', (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth += 1;
          if (!currentNode.attrs.imageBusy) media.classList.add('is-drag-over');
        });
        media.addEventListener('dragover', (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = currentNode.attrs.imageBusy ? 'none' : 'copy';
        });
        media.addEventListener('dragleave', (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth = Math.max(0, dragDepth - 1);
          if (dragDepth === 0) media.classList.remove('is-drag-over');
        });
        media.addEventListener('drop', (event) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth = 0;
          media.classList.remove('is-drag-over');
          if (currentNode.attrs.imageBusy) {
            setMediaFeedback('이미지 작업이 끝난 뒤 다시 시도해 주세요.');
            return;
          }
          const files = Array.from(event.dataTransfer?.files || []);
          if (files.length !== 1) {
            setMediaFeedback('한 번에 이미지 한 장씩 추가해 주세요.');
            return;
          }
          handleImageFile(files[0]);
        });
        fileInput.addEventListener('cancel', () => setMediaFeedback(''));
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.className = 'secondary compact manuscript-image-block-expand';
        const expandIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M4 4l6 6M16 4h4v4m0-4-6 6M4 16v4h4m-4 0 6-6m10 2v4h-4m4 0-6-6"/></svg>';
        const collapseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M4 4l6 6m10-1V4h-5m5 0-6 6M4 15v5h5m-5 0 6-6m10 1v5h-5m5 0-6-6"/></svg>';
        const syncExpandToggle = () => {
          const expanded = card.classList.contains('is-media-expanded');
          expand.innerHTML = expanded ? collapseIcon : expandIcon;
          expand.setAttribute('aria-pressed', String(expanded));
          expand.setAttribute('aria-label', expanded ? '이미지 편집 화면으로 돌아가기' : '이미지 영역 확대');
          expand.title = expanded ? '이미지 편집 화면으로 돌아가기' : '이미지 영역 확대';
        };
        expand.addEventListener('mousedown', (event) => event.preventDefault());
        expand.addEventListener('click', () => {
          card.classList.toggle('is-media-expanded');
          syncExpandToggle();
        });
        media.append(artwork, mediaStatus, dropHint, mediaFeedback, mediaActions, expand, fileInput);
        card.append(header, main, promptGeneration);
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
          if (!value.attrs.imageExists) card.classList.remove('is-media-expanded');
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
          setUiAiActionButton(generate, isBusy ? generateLabel : '이미지', { ai: !isBusy });
          generate.className = `compact ui-ai-action-button ${isBusy ? (operationState === 'mutating' ? 'secondary' : 'ghost ui-danger-action') : value.attrs.imageExists ? 'secondary' : 'primary'}`;
          pick.textContent = '＋';
          pick.title = value.attrs.imageExists ? '내 이미지로 교체' : '내 이미지에서 선택';
          pick.setAttribute('aria-label', pick.title);
          continueButton.hidden = !stopConfirming;
          // Keep the active generate/stop control available like the legacy image cards.
          // The stop handler owns the operation-state guard and provides its two-step confirmation.
          generate.disabled = isBusy
            ? operationState === 'mutating'
            : !String(value.attrs.prompt || '').trim();
          if (!isBusy && generate.disabled) generate.title = '이미지 프롬프트를 입력하면 생성할 수 있습니다.';
          else generate.removeAttribute('title');
          pick.disabled = removeImage.disabled = isBusy;
          const topLevelIndex = editor.state.doc.resolve(getPos()).index(0);
          structuralActions.querySelectorAll('.manuscript-image-block-move').forEach((button, index) => {
            button.disabled = isBusy || (index === 0
              ? topLevelIndex === 0
              : topLevelIndex >= editor.state.doc.childCount - 1);
          });
          mediaActions.classList.toggle('is-empty', !value.attrs.imageExists);
          mediaActions.classList.toggle('is-present', Boolean(value.attrs.imageExists));
          mediaActions.classList.toggle('is-working', Boolean(isBusy));
          expand.hidden = !value.attrs.imageExists;
          syncExpandToggle();
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
          stopEvent(event) { return event.target === prompt || event.target === title || event.target === promptGuidance || event.target === fileInput || Boolean(event.target.closest('button')); }
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
  const imageSlashCommand = createImageSlashCommand();
  let editor;
  editor = new Editor({
    element: root,
    extensions: [StarterKit.configure({ codeBlock: false }), Markdown, imageNode, imageSlashCommand],
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
        return insertManuscriptImage(editor);
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
