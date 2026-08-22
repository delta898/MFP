function activateBlogTab(tabName, options = {}) {
  console.log("=== activateBlogTab CALLED ===", tabName);
  const allowed = ['quick', 'trend-posting', 'trends', 'topics', 'comment-draft', 'collect', 'auto'];
  const target = allowed.includes(String(tabName)) ? String(tabName) : 'quick';
  blogActiveTab = target;

  const tabButtons = Array.from(document.querySelectorAll('.blog-tab-btn'));
  const tabPanels = Array.from(document.querySelectorAll('.blog-tab-panel'));
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.blogTab === target));
  tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === `blog-tab-${target}`));
  syncScopedMajorSaveActions();

  const forceReload = options.forceReload !== false;
  if (!forceReload) return;

  if (target === 'quick') {
    return;
  }

  if (target === 'trend-posting') {
    void loadTrendPostingMeta();
    return;
  }
  if (target === 'trends') {
    loadBlogTrends();
    return;
  }
  if (target === 'topics') {
    console.log("activateBlogTab: calling loadBlogTopics()");
    loadBlogTopics();
    console.log("activateBlogTab: loading categories");
    fetchWpCategories().then((categories) => {
      populateFilterWpCategoryDropdown('blog-status-filter-wp-category', categories || categoryCache || []);
      console.log("activateBlogTab: categories populated");
    }).catch(e => console.error("WP Category Load Error:", e));
    return;
  }
  if (target === 'comment-draft') {
    loadNaverCommentDraftSettings();
    return;
  }
  if (target === 'collect') {
    loadBlogCollectSettings();
    return;
  }
  if (target === 'auto') {
    loadBlogAutoSettings();
    return;
  }
}
