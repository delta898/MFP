const BLOG_NEXT_TABS = Object.freeze(['quick', 'queue', 'auto-topic', 'automation']);
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
  if (target === 'auto-topic' && typeof loadBlogNextAutoTopicPlan === 'function') {
    loadBlogNextAutoTopicPlan();
  }
  if (target === 'automation' && typeof loadBlogNextRunnerStatus === 'function') {
    loadBlogNextRunnerStatus();
  }
  if (target === 'automation' && typeof loadBlogNextAutomationSettings === 'function') {
    loadBlogNextAutomationSettings();
  }
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
  if (!blogNextShellBound) {
    document.querySelectorAll('[data-blog-next-tab]').forEach((button) => {
      button.addEventListener('click', () => activateBlogNextTab(button.dataset.blogNextTab));
    });
    document.querySelectorAll('[data-blog-next-input-mode]').forEach((button) => {
      button.addEventListener('click', () => activateBlogNextInputMode(button.dataset.blogNextInputMode));
    });
    blogNextShellBound = true;
  }

  activateBlogNextTab(blogNextActiveTab);
  activateBlogNextInputMode(blogNextActiveInputMode);
}
