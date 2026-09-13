const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('modal text inputs share one token-driven premium input', () => {
  const widgets = read('ui/styles/components/form-widgets.css');
  const overlays = read('ui/partials/overlays.html');

  assert.match(widgets, /\.premium-input\s*\{[^}]*background:\s*var\(--ui-surface\)/s);
  assert.match(widgets, /\.premium-input:focus\s*\{[^}]*border-color:\s*var\(--ui-border-focus\)/s);
  assert.match(widgets, /\.premium-input:focus\s*\{[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
  assert.match(widgets, /\.premium-input::placeholder\s*\{[^}]*color:\s*var\(--ui-text-muted\)/s);
  for (const id of ['keyword-modal-input', 'quick-topic-recommendations-query', 'quick-keyword-discovery-query']) {
    assert.match(overlays, new RegExp(`id="${id}"[^>]*class="premium-input"`));
  }
});
