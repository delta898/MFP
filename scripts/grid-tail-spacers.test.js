const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

class FakeGridItem {
  constructor(className = '') {
    this.className = className;
    this.attributes = new Map();
    this.removed = false;
  }

  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  matches(selector) { return this.className.split(/\s+/).includes(selector.slice(1)); }
  remove() {
    this.removed = true;
    this.parent.children = this.parent.children.filter((item) => item !== this);
  }
}

class FakeGrid extends FakeGridItem {
  constructor(itemCount, columns) {
    super();
    this.columns = columns;
    this.children = Array.from({ length: itemCount }, () => new FakeGridItem('result-item'));
    this.children.forEach((child) => { child.parent = this; });
  }

  append(item) {
    item.parent = this;
    this.children.push(item);
  }

  querySelectorAll(selector) {
    assert.equal(selector, ':scope > [data-ui-grid-spacer]');
    return this.children.filter((item) => item.hasAttribute('data-ui-grid-spacer'));
  }
}

test('decorative grid tail cells complete only the current row and respond to column changes', () => {
  const observers = [];
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
  }
  const source = fs.readFileSync(path.join(repoRoot, 'ui/scripts/shared/grid-tail-spacers.js'), 'utf8');
  const spacers = vm.runInNewContext(`${source}\nUiGridTailSpacers`, {
    document: { createElement: () => new FakeGridItem() },
    getComputedStyle: (grid) => ({ gridTemplateColumns: Array(grid.columns).fill('1fr').join(' ') }),
    ResizeObserver: FakeResizeObserver
  });
  const grid = new FakeGrid(5, 3);

  spacers.sync(grid, { itemSelector: '.result-item', spacerClass: 'ui-grid-tail-spacer' });
  assert.equal(grid.querySelectorAll(':scope > [data-ui-grid-spacer]').length, 1);
  assert.equal(grid.children.at(-1).getAttribute('aria-hidden'), 'true');
  assert.equal(grid.children.at(-1).hasAttribute('inert'), true);

  grid.columns = 4;
  observers[0].callback();
  assert.equal(grid.querySelectorAll(':scope > [data-ui-grid-spacer]').length, 3);

  grid.columns = 1;
  observers[0].callback();
  assert.equal(grid.querySelectorAll(':scope > [data-ui-grid-spacer]').length, 0);

  grid.columns = 3;
  const removedItem = grid.children.find((item) => item.matches('.result-item'));
  grid.children = grid.children.filter((item) => item !== removedItem);
  spacers.sync(grid, { itemSelector: '.result-item', spacerClass: 'ui-grid-tail-spacer' });
  assert.equal(grid.querySelectorAll(':scope > [data-ui-grid-spacer]').length, 2);
});
