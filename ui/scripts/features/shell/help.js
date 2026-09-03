function initHelpView() {
  const view = document.getElementById('view-help');
  if (!view || view.dataset.initialized === 'true') return;

  view.querySelectorAll('[data-help-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      void navigateTo(button.dataset.helpNav, button.dataset.helpTab || undefined);
    });
  });

  view.dataset.initialized = 'true';
}
