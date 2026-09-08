async function handleUiTabNavigationKeydown(event, options = {}) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const selector = String(options.selector || '').trim();
  const dataKey = String(options.dataKey || '').trim();
  if (!selector || !dataKey || typeof options.activate !== 'function') return;

  const buttons = Array.from(document.querySelectorAll(selector));
  const currentIndex = buttons.indexOf(event.currentTarget);
  if (currentIndex < 0 || buttons.length === 0) return;

  event.preventDefault();
  let targetIndex = currentIndex;
  if (event.key === 'Home') targetIndex = 0;
  if (event.key === 'End') targetIndex = buttons.length - 1;
  if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + buttons.length) % buttons.length;
  if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % buttons.length;

  const targetButton = buttons[targetIndex];
  const activated = await options.activate(targetButton.dataset[dataKey]);
  if (activated !== false) targetButton.focus();
  else buttons[currentIndex].focus();
}
