const UiGridTailSpacers = Object.freeze({
  observers: new WeakMap(),

  sync(grid, { itemSelector, spacerClass }) {
    if (!grid || !itemSelector || !spacerClass) return;

    const update = () => {
      const items = Array.from(grid.children).filter((item) => (
        !item.hasAttribute('data-ui-grid-spacer') && item.matches(itemSelector)
      ));
      const template = getComputedStyle(grid).gridTemplateColumns || '';
      const columns = Math.max(1, template.split(/\s+/).filter(Boolean).length);
      const required = items.length ? (columns - (items.length % columns)) % columns : 0;
      const spacers = Array.from(grid.querySelectorAll(':scope > [data-ui-grid-spacer]'));

      spacers.slice(required).forEach((spacer) => spacer.remove());
      for (let index = spacers.length; index < required; index += 1) {
        const spacer = document.createElement('div');
        spacer.className = spacerClass;
        spacer.setAttribute('data-ui-grid-spacer', '');
        spacer.setAttribute('aria-hidden', 'true');
        spacer.setAttribute('inert', '');
        grid.append(spacer);
      }
    };

    update();
    if (this.observers.has(grid) || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => window.requestAnimationFrame(update));
    observer.observe(grid);
    this.observers.set(grid, observer);
  }
});
