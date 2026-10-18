const BLOG_NEXT_TABS = Object.freeze(['quick', 'trend-posting', 'queue', 'smart-comment']);
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

  if (target === 'queue'
    && (typeof blogNextActiveManagementTab === 'undefined' || blogNextActiveManagementTab !== 'automation')
    && typeof loadBlogNextQueue === 'function') {
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
}

async function requestActivateBlogNextTab(tabName) {
  const target = BLOG_NEXT_TABS.includes(String(tabName || '').trim())
    ? String(tabName).trim()
    : 'quick';
  if (blogNextActiveTab === 'queue'
    && typeof blogNextActiveManagementTab !== 'undefined'
    && blogNextActiveManagementTab === 'automation'
    && target !== 'queue'
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
  if (String(modeName || 'ai').trim() !== 'ai') return false;
  blogNextActiveInputMode = 'ai';
  document.querySelectorAll('[data-blog-next-mode-panel]').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.blogNextModePanel === 'ai');
    panel.hidden = panel.dataset.blogNextModePanel !== 'ai';
  });
  if (typeof mountBlogNextPublishSettings === 'function') mountBlogNextPublishSettings('ai');
  if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState();
  return true;
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
        void handleUiTabNavigationKeydown(event, {
          selector: '[data-blog-next-tab]',
          dataKey: 'blogNextTab',
          activate: requestActivateBlogNextTab
        });
      });
    });
    blogNextShellBound = true;
  }

  activateBlogNextTab(blogNextActiveTab);
  activateBlogNextInputMode('ai');
}
