// Creates screen-owned instances of the shared topic, content, and publishing settings.
function getBlogNextSettingsElement(id) {
  const editor = document.getElementById('blog-next-editor-settings-form');
  if (typeof blogNextEditingRowIndex !== 'undefined' && blogNextEditingRowIndex !== null && editor) {
    const escaped = globalThis.CSS?.escape ? CSS.escape(String(id)) : String(id).replaceAll('"', '\\"');
    const instance = editor.querySelector(`[data-blog-next-setting-key="${escaped}"]`);
    return instance || null;
  }
  return document.getElementById(id);
}

function resetBlogNextEditorSettingsInstance() {
  const editor = document.getElementById('blog-next-editor-settings-form');
  if (!editor) return;
  editor.querySelectorAll('input, textarea, select').forEach((control) => {
    if (control.type === 'radio' || control.type === 'checkbox') control.checked = control.defaultChecked;
    else if (control.tagName === 'SELECT') {
      const defaultOption = [...control.options].findIndex((option) => option.defaultSelected);
      control.selectedIndex = defaultOption >= 0 ? defaultOption : 0;
    } else control.value = control.defaultValue ?? '';
  });
}

function namespaceBlogNextSettingsInstance(root, suffix) {
  const nodes = [root, ...root.querySelectorAll('[id]')];
  const idMap = new Map();
  nodes.forEach((node) => {
    if (!node.id) return;
    const originalId = node.id;
    node.dataset.blogNextSettingKey = originalId;
    idMap.set(originalId, `${originalId}-${suffix}`);
    node.id = `${originalId}-${suffix}`;
  });
  root.querySelectorAll('[for], [aria-describedby], [aria-labelledby], [aria-controls], [aria-errormessage]').forEach((node) => {
    ['for', 'aria-describedby', 'aria-labelledby', 'aria-controls', 'aria-errormessage'].forEach((attribute) => {
      const value = node.getAttribute(attribute);
      if (!value) return;
      node.setAttribute(attribute, value.split(/\s+/).map((token) => idMap.get(token) || token).join(' '));
    });
  });
  root.querySelectorAll('[name]').forEach((node) => { node.name = `${node.name}-${suffix}`; });
}

function createBlogNextEditorSettingsInstance() {
  const editor = document.getElementById('blog-next-editor-settings-form');
  const quickForm = document.getElementById('blog-next-topic-form');
  if (!editor || !quickForm || editor.dataset.settingsMounted === 'true') return editor;
  const sources = [
    ['topic', getBlogNextSettingsElement('blog-next-topic-settings')],
    ['content', getBlogNextSettingsElement('blog-next-content-settings')],
    ['publishing', getBlogNextSettingsElement('blog-next-publish-settings')]
  ];
  sources.forEach(([slotName, source]) => {
    const slot = editor.querySelector(`[data-blog-next-editor-settings-slot="${slotName}"]`);
    if (!slot || !source) return;
    const instance = source.cloneNode(true);
    namespaceBlogNextSettingsInstance(instance, 'editor');
    // Never carry the quick-writing form's current values into the independent editor instance.
    slot.appendChild(instance);
  });
  resetBlogNextEditorSettingsInstance();
  editor.querySelector('[data-blog-next-setting-key="blog-next-topic-settings"]')?.setAttribute('open', '');
  editor.querySelector('[data-blog-next-setting-key="blog-next-content-settings"]')?.removeAttribute('open');
  editor.querySelector('[data-blog-next-setting-key="blog-next-publish-settings"]')?.setAttribute('open', '');
  editor.dataset.settingsMounted = 'true';
  bindBlogNextEditorSettingsInstance(editor);
  return editor;
}

function bindBlogNextEditorSettingsInstance(editor) {
  if (!editor || editor.dataset.settingsBound === 'true') return;
  editor.dataset.settingsBound = 'true';
  const onChange = (event) => {
    const id = event.target?.dataset.blogNextSettingKey || '';
    if (['blog-next-target-naver', 'blog-next-target-wordpress', 'blog-next-target-site-hosting'].includes(id)) {
      syncBlogNextProviderDependentFields();
      if (id === 'blog-next-target-site-hosting' && event.target.checked) {
        const select = getBlogNextSettingsElement('blog-next-site-hosting-select');
        if (!select || select.options.length <= 1 || select.dataset.loadFailed === 'true') {
          void loadBlogNextSiteHostingTargets({ preserveSelection: true });
        }
      }
    }
    if (id === 'blog-next-site-hosting-select') syncBlogNextDraftProviderFields('ai');
    if (id === 'blog-next-post-status') syncBlogNextScheduleField();
    if (id === 'blog-next-category' && typeof captureBlogNextPublishingTargetSettings === 'function') {
      captureBlogNextPublishingTargetSettings('ai');
    }
    if (['blog-next-post-status', 'blog-next-schedule-date'].includes(id)
      && typeof captureBlogNextPublishingTargetSettings === 'function') {
      captureBlogNextPublishingTargetSettings('ai');
    }
    syncBlogNextQuickFlowSummaries();
    syncBlogNextTopicActionAvailability();
  };
  editor.addEventListener('input', onChange);
  editor.addEventListener('change', onChange);
  editor.addEventListener('click', (event) => {
    const id = event.target?.closest?.('[data-blog-next-setting-key]')?.dataset.blogNextSettingKey;
    if (id === 'blog-next-topic-recommend') {
      setQuickDiscoveryInputTarget('blogNext');
      const query = document.getElementById('quick-topic-recommendations-query');
      if (query) query.value = getBlogNextSettingsElement('blog-next-subject')?.value || '';
      setQuickDiscoveryTab('topic');
      setQuickDiscoveryModalOpen(true);
    } else if (id === 'blog-next-keyword-recommend') {
      setQuickDiscoveryInputTarget('blogNext');
      const query = document.getElementById('quick-keyword-discovery-query');
      if (query) query.value = getBlogNextSettingsElement('blog-next-keywords')?.value || '';
      syncQuickKeywordDiscoveryControls();
      setQuickDiscoveryTab('keyword');
      setQuickDiscoveryModalOpen(true);
    } else if (id === 'blog-next-title-recommend') {
      // The modal owns the discovery flow; triggering its original opener keeps
      // the existing behavior while the selection target resolves to this form.
      document.getElementById('blog-next-title-recommend')?.click();
    } else if (id === 'blog-next-writing-settings-open') {
      void navigateTo('settings-next', 'writing');
    }
  });
}
