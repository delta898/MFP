const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('app footer uses a compact vertical footprint to leave more room for client views', () => {
    const chrome = fs.readFileSync(path.join(repoRoot, 'ui/styles/components/app-chrome.css'), 'utf8');
    const responsive = fs.readFileSync(path.join(repoRoot, 'ui/styles/layout/responsive-footer.css'), 'utf8');
    const footer = chrome.match(/\.app-footer\s*\{([^}]*)\}/)?.[1] || '';
    const link = chrome.match(/\.app-footer-link\s*\{([^}]*)\}/)?.[1] || '';

    assert.match(footer, /margin-top:\s*16px/);
    assert.match(footer, /padding:\s*12px 4px 0/);
    assert.match(link, /width:\s*30px/);
    assert.match(link, /height:\s*30px/);
    assert.match(responsive, /margin-top:\s*14px/);
    assert.match(responsive, /padding:\s*10px 0 0/);
    assert.match(responsive, /\.app-footer-link\s*\{\s*width:\s*28px;\s*height:\s*28px;/);
});
