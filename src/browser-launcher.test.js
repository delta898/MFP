const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_BROWSER_ARGS,
    buildBrowserLaunchOptions
} = require('./browser-launcher');

test('Playwright stays outside the initial application module graph', () => {
    assert.equal(require.cache[require.resolve('playwright')], undefined);
});

test('browser launch options keep default sandbox args when no overrides are provided', () => {
    const options = buildBrowserLaunchOptions({ headless: true });

    assert.equal(options.headless, true);
    assert.deepEqual(options.args, DEFAULT_BROWSER_ARGS);
});

test('browser launch options append window-size for headed workflows', () => {
    const options = buildBrowserLaunchOptions({
        headless: false,
        windowSize: { width: 1680, height: 1200 }
    });

    assert.equal(options.headless, false);
    assert.deepEqual(options.args, [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1680,1200'
    ]);
});

test('browser launch options replace stale window sizing args when overrides are provided', () => {
    const options = buildBrowserLaunchOptions({
        headless: false,
        args: ['--foo', '--window-size=800,600', '--start-maximized'],
        windowSize: { width: 1440, height: 960 }
    });

    assert.equal(options.headless, false);
    assert.deepEqual(options.args, [
        '--foo',
        '--window-size=1440,960'
    ]);
});
