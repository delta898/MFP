(() => {
  const storageKey = 'bloggenius.ui.style';
  const selectableStyleIds = new Set([
    'warm-editorial',
    'quiet-sage-studio',
    'autumn-night-library',
    'hanji-dancheong',
    'retro-terminal',
    'minimalism'
  ]);

  try {
    const storedStyleId = String(window.localStorage?.getItem(storageKey) || '').trim().toLowerCase();
    if (selectableStyleIds.has(storedStyleId)) {
      document.documentElement.dataset.style = storedStyleId;
    }
  } catch (error) {
    // Keep the HTML default when storage is unavailable.
  }
})();
