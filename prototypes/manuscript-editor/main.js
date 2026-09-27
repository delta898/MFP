import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { commandsCtx } from '@milkdown/kit/core';
import {
  isMarkSelectedCommand,
  strongSchema,
  toggleStrongCommand,
  toggleEmphasisCommand,
  emphasisSchema
} from '@milkdown/kit/preset/commonmark';
import '@milkdown/crepe/theme/classic.css';
import './style.css';

const sampleResponse = await fetch('./sample.md');
if (!sampleResponse.ok) throw new Error('샘플 원고를 불러오지 못했습니다.');
const initialMarkdown = await sampleResponse.text();

const tiptapElement = document.querySelector('[data-tiptap-editor]');
const tiptapMarkdownOutput = document.querySelector('[data-tiptap-markdown]');
const crepeElement = document.querySelector('[data-crepe-editor]');
const crepeMarkdownOutput = document.querySelector('[data-crepe-markdown]');
const toolbar = document.querySelector('.editor-toolbar');

const tiptap = new Editor({
  element: tiptapElement,
  extensions: [
    StarterKit.configure({ codeBlock: false, horizontalRule: false }),
    Markdown
  ],
  content: initialMarkdown,
  contentType: 'markdown',
  onUpdate: ({ editor }) => {
    tiptapMarkdownOutput.textContent = editor.getMarkdown();
  }
});

toolbar.addEventListener('mousedown', (event) => event.preventDefault());
toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-command]');
  if (!button) return;
  const chain = tiptap.chain().focus();
  const command = button.dataset.command;
  if (command === 'bold') chain.toggleBold().run();
  if (command === 'italic') chain.toggleItalic().run();
  if (command === 'heading') chain.toggleHeading({ level: 2 }).run();
  if (command === 'bulletList') chain.toggleBulletList().run();
  if (command === 'blockquote') chain.toggleBlockquote().run();
  updateToolbarState();
});

function updateToolbarState() {
  toolbar.querySelectorAll('[data-command]').forEach((button) => {
    const command = button.dataset.command;
    const active = command === 'heading'
      ? tiptap.isActive('heading', { level: 2 })
      : tiptap.isActive(command === 'bulletList' ? 'bulletList' : command);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

tiptap.on('selectionUpdate', updateToolbarState);
tiptapMarkdownOutput.textContent = tiptap.getMarkdown();

const crepeConfig = {
  defaultValue: initialMarkdown,
  features: {
    [CrepeFeature.CodeMirror]: false,
    [CrepeFeature.ImageBlock]: false,
    [CrepeFeature.Table]: false,
    [CrepeFeature.Latex]: false,
    [CrepeFeature.AI]: false,
    [CrepeFeature.TopBar]: false,
    [CrepeFeature.Toolbar]: true,
    [CrepeFeature.BlockEdit]: true,
    [CrepeFeature.LinkTooltip]: true,
    [CrepeFeature.ListItem]: true,
    [CrepeFeature.Cursor]: true,
    [CrepeFeature.Placeholder]: true
  },
  featureConfigs: {
    [CrepeFeature.BlockEdit]: {
      textGroup: {
        text: null,
        h1: null,
        h2: { label: '소제목' },
        h3: null,
        h4: null,
        h5: null,
        h6: null,
        quote: { label: '인용' },
        divider: null
      },
      listGroup: {
        bulletList: { label: '글머리 목록' },
        orderedList: { label: '번호 목록' },
        taskList: null
      },
      advancedGroup: null
    },
    [CrepeFeature.Toolbar]: {
      buildToolbar(builder) {
        builder.clear();
        const formatting = builder.addGroup('formatting', '서식');
        formatting.addItem('bold', {
          label: '굵게',
          icon: '<svg viewBox="0 0 24 24"><text x="5" y="19" font-size="20" font-weight="700">B</text></svg>',
          active: (ctx) => ctx.get(commandsCtx).call(isMarkSelectedCommand.key, strongSchema.type(ctx)),
          onRun: (ctx) => ctx.get(commandsCtx).call(toggleStrongCommand.key)
        });
        formatting.addItem('italic', {
          label: '기울임',
          icon: '<svg viewBox="0 0 24 24"><text x="8" y="19" font-size="20" font-style="italic">I</text></svg>',
          active: (ctx) => ctx.get(commandsCtx).call(isMarkSelectedCommand.key, emphasisSchema.type(ctx)),
          onRun: (ctx) => ctx.get(commandsCtx).call(toggleEmphasisCommand.key)
        });
      }
    }
  }
};

let crepe;

async function mountCrepe() {
  crepe = new Crepe({ ...crepeConfig, root: crepeElement });
  await crepe.create();
  crepeMarkdownOutput.textContent = crepe.getMarkdown();
  crepe.on((listener) => listener.markdownUpdated((_, markdown) => {
    crepeMarkdownOutput.textContent = markdown;
  }));
}

await mountCrepe();

document.querySelector('#reset-sample').addEventListener('click', async () => {
  document.querySelectorAll('[data-title]').forEach((input) => {
    input.value = '제주 일주일 살기, 천천히 발견한 아침의 풍경';
  });
  tiptap.commands.setContent(initialMarkdown, { contentType: 'markdown' });
  tiptapMarkdownOutput.textContent = tiptap.getMarkdown();
  await crepe.destroy();
  crepeElement.replaceChildren();
  await mountCrepe();
});

document.querySelectorAll('[data-title]').forEach((input) => {
  input.addEventListener('input', () => {
    document.querySelectorAll('[data-title]').forEach((peer) => {
      if (peer !== input) peer.value = input.value;
    });
  });
});

window.addEventListener('beforeunload', () => {
  tiptap.destroy();
  void crepe.destroy();
});
