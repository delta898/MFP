(() => {
  const storageKey = 'bloggenius.ui.style';
  const cacheKey = 'bloggenius.ui.style-catalog-cache';
  const contractVersion = '1.1';
  const isSafeTokenValue = (value) => {
    const normalized = String(value || '').trim();
    return Boolean(normalized)
      && normalized.length <= 500
      && !/[;{}<>]/.test(normalized)
      && !/(?:url|expression|image-set|cross-fade|element|paint)\s*\(|@import|javascript:|data:|https?:\/\//i.test(normalized);
  };

  try {
    const storedStyleId = String(window.localStorage?.getItem(storageKey) || '').trim().toLowerCase();
    const styles = JSON.parse(window.localStorage?.getItem(cacheKey) || '[]');
    const style = Array.isArray(styles)
      ? styles.find((item) => item?.id === storedStyleId && item?.contractVersion === contractVersion && item?.selectable === true)
      : null;
    if (!style || !style.tokens || typeof style.tokens !== 'object' || Array.isArray(style.tokens)) return;
    const entries = Object.entries(style.tokens);
    if (!entries.length || entries.some(([name, value]) => !/^--ui-[a-z0-9-]+$/.test(name) || !isSafeTokenValue(value))) return;
    const root = document.documentElement;
    root.dataset.style = storedStyleId;
    entries.forEach(([name, value]) => root.style.setProperty(name, String(value).trim()));
  } catch (error) {
    // Keep the HTML default when storage is unavailable.
  }
})();
