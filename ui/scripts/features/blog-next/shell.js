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
    });
    document.querySelectorAll('[data-blog-next-input-mode]').forEach((button) => {
      button.addEventListener('click', () => activateBlogNextInputMode(button.dataset.blogNextInputMode));
    });
    blogNextShellBound = true;
  }

  activateBlogNextTab(blogNextActiveTab);
  activateBlogNextInputMode(blogNextActiveInputMode);
}
