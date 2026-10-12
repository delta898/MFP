function siteHostingCreateRequirementsMet() {
  const name = String(document.getElementById('site-name')?.value || '').trim();
  if (siteHostingEditingImportedSite) {
    if (!name || name.length > 80 || !siteHostingSelectedProject) return false;
    return [...document.querySelectorAll('#site-navigation-fields [data-site-menu-row]')].every((row) => {
      const label = String(row.querySelector('[data-site-menu-label]')?.value || '').trim();
      const href = row.querySelector('[data-site-menu-href]');
      if (!label || label.length > 30 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label)) return false;
      try { siteHostingNormalizeMenuPath(href?.value, '', label); return true; }
      catch (_error) { return false; }
    });
  }
  const templateId = String(document.getElementById('site-template-id')?.value || '');
  const template = siteHostingCreateTemplates.find((item) => item.id === templateId);
  if (!name || !template || !siteHostingSelectedProject) return false;

  for (const item of Array.isArray(template.setup_inputs) ? template.setup_inputs : []) {
    const configured = siteHostingCreateSetupInputs[item.id] || {};
    if (item?.type === 'directory' && item?.purpose === 'knowledge_collection' && item.required
      && !String(siteHostingCreateSetupInputs[item.id] || '').trim()) return false;
    if (item?.type === 'frontmatter_match' && item?.purpose === 'publication_filter' && item.required) {
      const mode = [...document.querySelectorAll('[data-site-setup-mode]')]
        .find((control) => control.dataset.siteSetupId === item.id && control.checked)?.value
        || (configured.mode === 'all' ? 'all' : 'frontmatter');
      if (mode === 'frontmatter' && (!String(configured.field || '').trim() || !String(configured.value ?? '').trim())) return false;
    }
  }

  const navigationDefaults = template.customization?.find((field) => field.key === 'navigation')?.default;
  if (Array.isArray(navigationDefaults)) {
    const rows = [...document.querySelectorAll('#site-navigation-fields [data-site-menu-row]')];
    for (const row of rows) {
      const label = String(row.querySelector('[data-site-menu-label]')?.value || '').trim();
      const href = row.querySelector('[data-site-menu-href]');
      if (!label || label.length > 30 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label)) return false;
      const fallback = href?.dataset.defaultHref || (href?.dataset.hasDefault === 'true' ? '' : siteHostingSuggestMenuPath(label));
      try { siteHostingNormalizeMenuPath(href?.value, fallback, label); }
      catch (_error) { return false; }
    }
  }

  for (const key of Object.keys(SITE_PROFILE_IMAGE_LABELS)) {
    const file = document.getElementById(siteHostingProfileImageOptions(key)?.inputId)?.files?.[0];
    if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024)) return false;
  }
  return true;
}
function siteHostingUpdateCreateSubmitState() {
  const submit = document.querySelector('#site-create-form [type="submit"]');
  const zipPanel = document.getElementById('site-create-zip-panel');
  if (submit && document.getElementById('site-create-dialog')?.classList.contains('is-zip-import-mode')) {
    const name = String(document.getElementById('site-import-name')?.value || '').trim();
    submit.disabled = siteHostingImportStep !== 'settings' || !name || !zipPanel?.dataset.archiveToken || !siteHostingImportAnalysis
      || !siteHostingSelectedProject || submit.classList.contains('is-loading');
    return;
  }
  if (submit && !submit.classList.contains('is-loading')) {
    const settingsUnchanged = siteHostingCreateMode === 'settings'
      && Boolean(siteHostingCreateInitialSnapshot)
      && siteHostingCreateFormSnapshot() === siteHostingCreateInitialSnapshot;
    submit.disabled = !siteHostingCreateRequirementsMet() || settingsUnchanged;
  }
}
