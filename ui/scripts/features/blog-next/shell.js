const BLOG_NEXT_TABS = Object.freeze(['quick', 'trend-posting', 'queue', 'smart-comment', 'automation']);
const BLOG_NEXT_INPUT_MODES = Object.freeze(['ai', 'folder', 'paste']);

let blogNextActiveTab = 'quick';
let blogNextActiveInputMode = 'ai';
let blogNextShellBound = false;

function activateBlogNextTab(tabName) {
  const target = BLOG_NEXT_TABS.includes(String(tabName || '').trim())
    ? String(tabName).trim()
    : 'quick';
  blogNextActiveTab = target;

  document.querySelectorAll('[data-blog-next-tab]').forEach((button) => {
    const active = button.dataset.blogNextTab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.blog-next-panel').forEach((panel) => {
    const active = panel.id === `blog-next-panel-${target}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });

  if (typeof syncBlogNextTopicFormHostForTab === 'function') {
    syncBlogNextTopicFormHostForTab(target);
  }

  if (target === 'queue' && typeof loadBlogNextQueue === 'function') {
    loadBlogNextQueue();
  }
  if (target === 'queue' && typeof loadBlogNextRunnerStatus === 'function') {
    loadBlogNextRunnerStatus();
  } else if (typeof syncBlogNextRunnerWatchForTab === 'function') {
    syncBlogNextRunnerWatchForTab();
  }
  if (target === 'trend-posting' && typeof loadBlogNextTrendMeta === 'function') {
    loadBlogNextTrendMeta();
  }
  if (target === 'smart-comment' && typeof loadBlogNextSmartCommentSettings === 'function') {
    loadBlogNextSmartCommentSettings();
  }
  if (target === 'automation' && typeof loadBlogNextRunnerStatus === 'function') {
    loadBlogNextRunnerStatus();
  }
  if (target === 'automation' && typeof loadBlogNextAutomationSettings === 'function') {
    loadBlogNextAutomationSettings();
  }
}

async function handleBlogNextTabKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

  const buttons = Array.from(document.querySelectorAll('[data-blog-next-tab]'));
  const currentIndex = buttons.indexOf(event.currentTarget);
  if (currentIndex < 0 || buttons.length === 0) return;

  event.preventDefault();
  let targetIndex = currentIndex;
  if (event.key === 'Home') targetIndex = 0;
  if (event.key === 'End') targetIndex = buttons.length - 1;
  if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % buttons.length;

  const targetButton = buttons[targetIndex];
  const activated = await requestActivateBlogNextTab(targetButton.dataset.blogNextTab);
  if (activated) {
    targetButton.focus();
  } else {
    buttons[currentIndex].focus();
  }
}

async function requestActivateBlogNextTab(tabName) {
  const target = BLOG_NEXT_TABS.includes(String(tabName || '').trim())
    ? String(tabName).trim()
    : 'quick';
  if (blogNextActiveTab === 'automation'
    && target !== 'automation'
    && typeof confirmDiscardUnsavedBlogNextAutomationSettings === 'function') {
    const canLeave = await confirmDiscardUnsavedBlogNextAutomationSettings();
    if (!canLeave) return false;
  }
  if (blogNextActiveTab === 'smart-comment'
    && target !== 'smart-comment'
    && typeof confirmDiscardUnsavedBlogNextSmartCommentSettings === 'function') {
    const canLeave = await confirmDiscardUnsavedBlogNextSmartCommentSettings();
    if (!canLeave) return false;
  }
  activateBlogNextTab(target);
  return true;
}

function activateBlogNextInputMode(modeName) {
  const target = BLOG_NEXT_INPUT_MODES.includes(String(modeName || '').trim())
    ? String(modeName).trim()
    : 'ai';
  blogNextActiveInputMode = target;

  document.querySelectorAll('[data-blog-next-input-mode]').forEach((button) => {
    const active = button.dataset.blogNextInputMode === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-blog-next-mode-panel]').forEach((panel) => {
    const active = panel.dataset.blogNextModePanel === target;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function initBlogNextShell() {
  if (typeof initBlogNextTrendPosting === 'function') initBlogNextTrendPosting();
  if (typeof initBlogNextSmartComment === 'function') initBlogNextSmartComment();
  if (!blogNextShellBound) {
    document.querySelectorAll('[data-blog-next-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        void requestActivateBlogNextTab(button.dataset.blogNextTab);
      });
      button.addEventListener('keydown', (event) => {
        void handleBlogNextTabKeydown(event);
      });
    });
    document.querySelectorAll('[data-blog-next-input-mode]').forEach((button) => {
      button.addEventListener('click', () => activateBlogNextInputMode(button.dataset.blogNextInputMode));
    });
    blogNextShellBound = true;
  }

  activateBlogNextTab(blogNextActiveTab);
  activateBlogNextInputMode(blogNextActiveInputMode);
}
