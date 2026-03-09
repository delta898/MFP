const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log('LOG:', msg.text()));

    try {
        await page.goto('http://127.0.0.1:4577', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        // Evaluate in page to log clicks globally
        await page.evaluate(() => {
            document.addEventListener('click', (e) => {
                let path = [];
                let cur = e.target;
                while (cur && cur !== document.body) {
                    path.push(cur.tagName + (cur.id ? '#' + cur.id : '') + (cur.className ? '.' + cur.className.replace(/ /g, '.') : ''));
                    cur = cur.parentElement;
                }
                console.log(`[PLAYWRIGHT_CLICK] Path: ${path.join(' -> ')}`);
            }, true);
        });

        // Switch to the Auto Collect Tab
        console.log('Switching tab...');
        await page.click('[data-blog-tab="collect"]', { force: true });
        await page.waitForTimeout(500);

        // Try to click the first RSS trigger
        console.log('Attempting to click #rss-category-trigger-0...');
        await page.evaluate(() => {
            const el = document.getElementById('rss-category-trigger-0');
            if (el) el.scrollIntoView();
        });

        // Click exactly on the trigger
        await page.click('#rss-category-trigger-0', { force: true });
        await page.waitForTimeout(500);

        // Print container classes to see if 'open' is added
        const classList = await page.evaluate(() => {
            const container = document.getElementById('rss-category-container-0');
            return container ? container.className : 'null';
        });
        console.log('Container classes after click:', classList);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await browser.close();
    }
})();
