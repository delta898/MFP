'use strict';

const PACKAGE_VERSION = require('./package.json').version;

class NaverPublisherError extends Error {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'NaverPublisherError';
        this.code = options.code || 'NAVER_PUBLISHER_ERROR';
    }
}

function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value.trim();
}

function throwIfAborted(signal) {
    if (!signal?.aborted) return;
    throw new NaverPublisherError('Naver publishing was cancelled.', { code: 'ABORTED' });
}

function createPlugin(options = {}) {
    if (typeof options.createAuthenticatedNaverSession !== 'function') {
        throw new TypeError('Naver Publisher requires createAuthenticatedNaverSession().');
    }
    if (typeof options.getSettings !== 'function') {
        throw new TypeError('Naver Publisher requires getSettings().');
    }
    const logger = options.logger || {};
    const sleep = typeof options.sleep === 'function'
        ? options.sleep
        : (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    function report(context, phase, stage, current, total) {
        context?.reportProgress?.({ phase, stage, current, total });
    }

    async function visible(page, selector) {
        try {
            const element = page.locator(selector).first();
            return await element.count() > 0 && await element.isVisible();
        } catch (_) { return false; }
    }

    async function dismissEditorPopups(page) {
        let dismissed = 0;
        const helpSelectors = [
            'button.se-help-panel-close-button',
            '.se-help-panel button[aria-label*="닫기"]',
            '.se-help-panel button[title*="닫기"]',
            '.se-help-panel button:has-text("닫기")',
            'button[aria-label*="도움"]',
            'button[title*="도움"]'
        ];
        const cancelSelectors = [
            '.se-popup-button-cancel', '.se-popup button:has-text("취소")',
            '.se-popup-container button:has-text("취소")', '.se-popover button:has-text("취소")',
            '[role="dialog"] button:has-text("취소")', '.se-popup button:has-text("아니오")',
            '.se-popup-container button:has-text("아니오")', '.se-popover button:has-text("아니오")',
            '[role="dialog"] button:has-text("아니오")', '.se-popup button:has-text("불러오지 않기")',
            '.se-popup-container button:has-text("불러오지 않기")', '.se-popover button:has-text("불러오지 않기")'
        ];
        for (let round = 0; round < 8; round++) {
            let clicked = await clickFirstVisible(page, helpSelectors);
            if (!clicked) clicked = await clickFirstVisible(page, cancelSelectors);
            if (!clicked) {
                let overlayVisible = false;
                for (const selector of ['.se-help-panel', '.se-popup', '.se-popup-container', '.se-popover', '[role="dialog"]']) {
                    if (await visible(page, selector)) { overlayVisible = true; break; }
                }
                if (overlayVisible) {
                    await page.keyboard.press('Escape').catch(() => {});
                    await sleep(120);
                    clicked = true;
                }
            }
            if (!clicked) break;
            dismissed += 1;
            await sleep(300);
        }
        if (dismissed) logger.info?.(`[Naver Publisher] Editor overlays dismissed (rounds=${dismissed})`);
        return dismissed;
    }

    async function waitForEditor(page, settings, signal) {
        const timeoutMs = Number(settings.editorReadyTimeoutMs) || 45000;
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            throwIfAborted(signal);
            const url = String(page.url() || '');
            if (/nid\.naver\.com|login/i.test(url)) {
                throw new NaverPublisherError('네이버 로그인 세션이 만료되었습니다. 설정에서 다시 로그인해 주세요.', {
                    code: 'NAVER_SESSION_EXPIRED'
                });
            }
            const titleReady = await visible(page, '.se-documentTitle, .se-section-documentTitle .se-text-paragraph');
            const bodyReady = await visible(page, '.se-main-container, .se-container, .se-canvas-bottom');
            if (titleReady && bodyReady) return;
            await sleep(250);
        }
        throw new NaverPublisherError('네이버 블로그 에디터가 준비되지 않았습니다.', { code: 'NAVER_EDITOR_NOT_READY' });
    }

    function normalizeEditorText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    async function readText(locator) {
        try { return await locator.innerText(); } catch (_) {
            try { return await locator.textContent(); } catch (_) { return ''; }
        }
    }

    async function enterTitle(page, title, signal, settings) {
        const selector = [
            '.se-component.se-documentTitle .se-text-paragraph',
            '.se-section-documentTitle .se-text-paragraph',
            '.se-documentTitle .se-text-paragraph',
            '.se-component.se-documentTitle .se-placeholder',
            '.se-section-documentTitle .se-placeholder',
            '.se-documentTitle'
        ].join(', ');
        const titleArea = page.locator(selector).first();
        await titleArea.waitFor({ state: 'visible', timeout: Number(settings.editorReadyTimeoutMs) || 45000 });
        const expected = normalizeEditorText(title);
        const attempts = Math.max(1, Math.min(5, Number(settings.titleInputAttempts) || 3));
        for (let attempt = 1; attempt <= attempts; attempt++) {
            throwIfAborted(signal);
            await page.keyboard.press('Escape').catch(() => {});
            try { await titleArea.scrollIntoViewIfNeeded(); } catch (_) { /* Older editor builds may not support scrolling. */ }
            await titleArea.click({ force: true });
            await sleep(80);
            await page.keyboard.press(`${settings.commandKey || 'Meta'}+A`).catch(() => {});
            await page.keyboard.press('Backspace').catch(() => {});
            await page.keyboard.press('Delete').catch(() => {});
            await page.keyboard.type(title, { delay: Number(settings.typingDelayMs) || 12 });
            await sleep(180);
            const actual = normalizeEditorText(await readText(titleArea));
            if (actual === expected || actual.includes(expected)) {
                await page.keyboard.press('Enter');
                return;
            }
            if (attempt < attempts) await sleep(220);
        }
        throw new NaverPublisherError('네이버 에디터에 제목이 입력되지 않았습니다. 발행을 중단했습니다.', {
            code: 'NAVER_TITLE_INPUT_FAILED'
        });
    }

    async function applyTextFormat(page, formatName) {
        const toolbar = page.locator('button[data-name="text-format"]').first();
        if (!(await toolbar.count()) || !(await toolbar.isVisible())) return false;
        const selector = formatName === '소제목'
            ? 'button.se-toolbar-option-text-format-subtitle, button[class*="text-format-subtitle"]'
            : 'button.se-toolbar-option-text-format-quotation, button[class*="text-format-quotation"]';
        const labelMatches = async () => {
            const signature = normalizeEditorText([
                await readText(toolbar),
                await toolbar.getAttribute('aria-label').catch(() => ''),
                await toolbar.getAttribute('title').catch(() => '')
            ].join(' ')).toLowerCase();
            return signature.includes(formatName.toLowerCase());
        };
        for (let attempt = 0; attempt < 3; attempt++) {
            if (await labelMatches()) return true;
            await toolbar.click({ force: true });
            await sleep(180);
            let clicked = false;
            const preferred = page.locator(selector);
            for (let index = 0; index < await preferred.count(); index++) {
                const option = preferred.nth(index);
                if (!(await option.isVisible())) continue;
                await option.click({ force: true });
                clicked = true;
                break;
            }
            if (!clicked) {
                const options = page.locator('button.se-toolbar-option-text-button');
                for (let index = 0; index < await options.count(); index++) {
                    const option = options.nth(index);
                    if (!(await option.isVisible())) continue;
                    const signature = normalizeEditorText([
                        await readText(option),
                        await option.getAttribute('aria-label').catch(() => ''),
                        await option.getAttribute('title').catch(() => ''),
                        await option.getAttribute('class').catch(() => '')
                    ].join(' ')).toLowerCase();
                    if (!signature.includes(formatName.toLowerCase())) continue;
                    await option.click({ force: true });
                    clicked = true;
                    break;
                }
            }
            await sleep(180);
            if (clicked && await labelMatches()) return true;
        }
        await page.keyboard.press('Escape').catch(() => {});
        return false;
    }

    async function collapseEditorSelectionToCaretEnd(page) {
        try {
            return await page.evaluate(() => {
                const selection = window.getSelection?.();
                if (!selection || selection.rangeCount === 0) return false;
                if (selection.isCollapsed) return true;
                const range = selection.getRangeAt(0).cloneRange();
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                return true;
            });
        } catch (_) {
            return false;
        }
    }

    async function enterTextBlock(page, block, signal, settings, warnings = []) {
        throwIfAborted(signal);
        const text = String(block.text || '');
        if (block.type === 'newline') {
            await page.keyboard.press('Enter');
            return;
        }
        if (block.type === 'separator') {
            const separator = page.locator('button[data-name*="horizontal-line"], button[aria-label*="구분선"]').first();
            if (await separator.count() && await separator.isVisible()) {
                await separator.click({ force: true });
            } else {
                await page.keyboard.type('────────────', { delay: Number(settings.typingDelayMs) || 12 });
                await page.keyboard.press('Enter');
            }
            return;
        }
        if (block.type === 'list-item') {
            const marker = block.listType === 'ordered' ? '1. ' : '- ';
            await page.keyboard.type(marker, { delay: Number(settings.typingDelayMs) || 12 });
            await typeWithBoldRanges(page, text, block.boldRanges, settings);
            await page.keyboard.press('Enter');
            return;
        }
        if (block.type === 'paragraph' && /^https?:\/\/\S+$/i.test(text.trim())) {
            if (await insertOglinkCard(page, text.trim(), warnings)) return;
        }
        if (text) await typeWithBoldRanges(page, text, block.boldRanges, settings);
        let requiredFormat = null;
        if (block.type === 'heading') requiredFormat = block.level === 3 ? '인용구' : '소제목';
        if (block.type === 'quote') requiredFormat = '인용구';
        if (block.type === 'heading') await sleep(300);
        if (requiredFormat && !(await applyTextFormat(page, requiredFormat))) {
            // Recover once by selecting the current line, as the legacy editor path does.
            await page.keyboard.press('Shift+Home').catch(() => {});
            const recovered = await applyTextFormat(page, requiredFormat);
            if (!recovered) warnings.push(`${requiredFormat} 서식을 적용하지 못했습니다: ${text}`);
        }
        if (requiredFormat) {
            // Naver may keep the heading text selected after applying a format.
            // Mirror the legacy editor flow: move to the text end, collapse the
            // actual DOM selection, then let Enter create the following body paragraph.
            await page.keyboard.press('ArrowRight').catch(() => {});
            await collapseEditorSelectionToCaretEnd(page);
            await sleep(80);
            const editorText = normalizeEditorText(await readText(page.locator('.se-main-container, .se-container').first()));
            if (text && editorText && !editorText.includes(normalizeEditorText(text))) {
                warnings.push(`${requiredFormat} 텍스트가 에디터에서 확인되지 않습니다: ${text}`);
                await focusEditorBottom(page);
                await page.keyboard.type(text, { delay: Number(settings.typingDelayMs) || 12 });
            }
        }
        await page.keyboard.press('Enter');
    }

    async function typeWithBoldRanges(page, text, ranges, settings) {
        const validRanges = (Array.isArray(ranges) ? ranges : [])
            .map((range) => ({ start: Number(range?.start), end: Number(range?.end) }))
            .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end)
                && range.start >= 0 && range.end > range.start && range.end <= text.length)
            .sort((left, right) => left.start - right.start);
        const delay = Number(settings.typingDelayMs) || 12;
        const shortcut = `${settings.commandKey || 'Meta'}+B`;
        let cursor = 0;
        for (const range of validRanges) {
            if (range.start < cursor) continue;
            if (range.start > cursor) await page.keyboard.type(text.slice(cursor, range.start), { delay });
            await page.keyboard.press(shortcut);
            await page.keyboard.type(text.slice(range.start, range.end), { delay });
            await page.keyboard.press(shortcut);
            cursor = range.end;
        }
        if (cursor < text.length) await page.keyboard.type(text.slice(cursor), { delay });
    }

    async function insertOglinkCard(page, url, warnings = []) {
        const popup = page.locator('div.se-popup-oglink').first();
        const anchorSelector = '.se-main-container a[href], .se-container a[href]';
        const before = await page.locator(anchorSelector).count().catch(() => 0);
        const opened = await clickFirstVisible(page, [
            'li.se-toolbar-item-oglink button[data-name="oglink"]',
            'button[data-name="oglink"]',
            'button.se-text-icon-toolbar-button[data-name="oglink"]',
            'button[title*="링크 추가"]', 'button[aria-label*="링크 추가"]'
        ]);
        if (!opened) return false;
        try {
            const input = page.locator('input.se-popup-oglink-input, .se-popup-oglink input.se-popup-oglink-input').first();
            await input.waitFor({ state: 'visible', timeout: 3000 });
            await input.fill('');
            await input.fill(url);
            const search = page.locator('button.se-popup-oglink-button').first();
            if (await search.count() && await search.isVisible()) await search.click({ force: true });
            const confirmation = page.locator('button.se-popup-button-confirm, .se-popup-button-container button:has-text("확인")').first();
            let confirmAttempted = false;
            let closed = false;
            for (let attempt = 0; attempt < 60; attempt++) {
                if (!(await popup.count().catch(() => 0)) || !(await popup.isVisible().catch(() => false))) {
                    closed = true;
                    break;
                }
                const loading = page.locator('.se-popup-oglink-loading').first();
                if (await loading.count().catch(() => 0) && await loading.isVisible().catch(() => false)) {
                    await sleep(150);
                    continue;
                }
                const enabled = await confirmation.count().catch(() => 0)
                    && await confirmation.isVisible().catch(() => false)
                    && await confirmation.getAttribute('disabled').catch(() => null) === null
                    && String(await confirmation.getAttribute('aria-disabled').catch(() => '')).toLowerCase() !== 'true';
                if (enabled) {
                    await confirmation.click({ force: true });
                    confirmAttempted = true;
                    try {
                        await popup.waitFor({ state: 'hidden', timeout: 250 });
                        closed = true;
                        break;
                    } catch (_) { /* Naver may need another render cycle. */ }
                }
                await sleep(150);
            }
            if (!closed) {
                await page.keyboard.press('Escape').catch(() => {});
                try { await popup.waitFor({ state: 'hidden', timeout: 1200 }); closed = true; } catch (_) { /* Plain-URL fallback below. */ }
            }
            if (!closed) return false;
            for (let attempt = 0; attempt < 5; attempt++) {
                const after = await page.locator(anchorSelector).count().catch(() => 0);
                if (after > before) {
                    const centered = await centerAlignLatestOglink(page);
                    if (!centered) warnings.push(`연관글 링크 카드를 가운데 정렬하지 못했습니다: ${url}`);
                    await focusEditorBottom(page);
                    return true;
                }
                await sleep(180);
            }
            // Confirmation plus a closed popup is treated as success to prevent a
            // duplicate URL paragraph when the card render is delayed.
            if (confirmAttempted) {
                const centered = await centerAlignLatestOglink(page);
                if (!centered) warnings.push(`연관글 링크 카드 가운데 정렬 결과를 확인하지 못했습니다: ${url}`);
                await focusEditorBottom(page);
            }
            return confirmAttempted;
        } catch (_) {
            await page.keyboard.press('Escape').catch(() => {});
            return false;
        }
    }

    async function uploadImage(page, asset, signal, settings, imageOptions = {}) {
        throwIfAborted(signal);
        const photoButton = page.locator('button.se-image-toolbar-button, button:has-text("사진")').first();
        await photoButton.waitFor({ state: 'visible', timeout: 10000 });
        const chooserPromise = page.waitForEvent('filechooser');
        await photoButton.click();
        const chooser = await chooserPromise;
        await chooser.setFiles({
            name: asset.filename,
            mimeType: asset.mimeType,
            buffer: Buffer.from(asset.bytesBase64, 'base64')
        });
        await sleep(Number(settings.waitUploadMs) || 3000);
        throwIfAborted(signal);
        const editorImages = page.locator('.se-component-content img, .se-module-image img, .se-image-resource img');
        const imageCount = await editorImages.count();
        if (imageCount > 0) {
            const latestImage = editorImages.nth(imageCount - 1);
            try { await latestImage.click({ force: true }); } catch (_) { /* Keep upload success even if image focus is unavailable. */ }
            await sleep(120);
            const specialImage = /_(?:ftc_disclosure|cta_image)/i.test(asset.filename);
            if (specialImage) await applyImageAlignment(page, 'center');
            if (!specialImage && !imageOptions.representativeImageSet && await setRepresentativeImage(page)) {
                imageOptions.onRepresentativeImageSet?.();
            }
            if (/_cta_image\.(?:png|jpe?g|webp|avif)$/i.test(asset.filename) && /^https?:\/\//i.test(String(imageOptions.affiliateUrl || ''))) {
                const linked = await applyAffiliateImageLink(page, imageOptions.affiliateUrl);
                if (!linked) imageOptions.onWarning?.('제휴 CTA 이미지에 링크를 적용하지 못했습니다.');
            }
        }
        await page.keyboard.press('Enter').catch(() => {});
    }

    async function clickFirstVisible(page, selectors) {
        for (const selector of selectors) {
            const target = page.locator(selector).first();
            try {
                if (await target.count() && await target.isVisible()) {
                    await target.click({ force: true });
                    return true;
                }
            } catch (_) { /* Try the next editor-version selector. */ }
        }
        return false;
    }

    async function clickFirstVisibleWithin(root, selectors) {
        for (const selector of selectors) {
            const target = root.locator(selector).last();
            try {
                if (await target.count() && await target.isVisible()) {
                    await target.click({ force: true });
                    return true;
                }
            } catch (_) { /* Try another editor-version selector. */ }
        }
        return false;
    }

    async function focusEditorBottom(page) {
        for (const selector of ['.se-canvas-bottom', '.se-main-container', '.se-container']) {
            const editor = page.locator(selector).first();
            try {
                if (!(await editor.count()) || !(await editor.isVisible())) continue;
                try { await editor.scrollIntoViewIfNeeded(); } catch (_) { /* Optional Playwright capability. */ }
                const box = await editor.boundingBox().catch(() => null);
                if (box && box.width > 0 && box.height > 0) {
                    await editor.click({ force: true, position: {
                        x: Math.max(12, Math.floor(box.width * 0.08)),
                        y: Math.max(12, Math.floor(box.height * 0.95))
                    } });
                } else {
                    await editor.click({ force: true });
                }
                await sleep(100);
                return true;
            } catch (_) { /* Try the next editor anchor. */ }
        }
        return false;
    }

    async function centerAlignLatestOglink(page) {
        const cardSelectors = ['.se-component.se-oglink', '.se-module-oglink', '.se-oglink', '.se-component[class*="oglink"]'];
        const centerSelectors = [
            'button[data-name="cycle-align"][data-value="center"]',
            'button[data-type="cycle-toggle"][data-name="cycle-align"][data-value="center"]',
            '.se-context-toolbar-cycle-toggle-container button[data-value="center"]',
            '.se-context-toolbar-cycle-toggle-container button.se-center-tool-bar-button',
            'li.se-toolbar-item-align button[data-value="center"]',
            'li.se-toolbar-item-line-image-center button',
            'li[class*="line-image-center"] button',
            'button[data-name*="line-image-center"]', 'button[data-name*="image-center"]',
            'button[data-name*="alignCenter"]', 'button[data-name*="align-center"]',
            'button[class*="align-center"]', 'button[class*="image-center"]',
            'button[aria-label*="가운데"]', 'button[aria-label*="중앙"]',
            'button[title*="가운데"]', 'button[title*="중앙"]'
        ];
        const alignmentTriggers = [
            'li.se-toolbar-item-align button[data-name="align-drop-down-with-justify"]',
            'button[data-name="align-drop-down-with-justify"]', 'button[title*="정렬"]', 'button[aria-label*="정렬"]'
        ];
        for (let attempt = 0; attempt < 6; attempt++) {
            let focused = false;
            for (const selector of cardSelectors) {
                const cards = page.locator(selector);
                for (let index = await cards.count() - 1; index >= 0; index--) {
                    const card = cards.nth(index);
                    if (!(await card.isVisible().catch(() => false))) continue;
                    for (const targetSelector of ['.se-oglink-frame', '.se-oglink-info', '.se-component-content', '']) {
                        const target = targetSelector ? card.locator(targetSelector).first() : card;
                        if (!(await target.count().catch(() => 0)) || !(await target.isVisible().catch(() => false))) continue;
                        try {
                            await target.scrollIntoViewIfNeeded();
                            await target.click({ force: true });
                            focused = true;
                            break;
                        } catch (_) { /* Try another card target. */ }
                    }
                    if (focused) break;
                }
                if (focused) break;
            }
            if (focused) {
                await sleep(120);
                const toolbars = page.locator('.se-image-toolbar, .se-context-toolbar, .se-l-property-toolbar, .se-property-toolbar, .se-toolbar');
                for (let index = await toolbars.count() - 1; index >= 0; index--) {
                    const toolbar = toolbars.nth(index);
                    if (!(await toolbar.isVisible().catch(() => false))) continue;
                    if (await clickFirstVisibleWithin(toolbar, centerSelectors)) return true;
                    if (await clickFirstVisibleWithin(toolbar, alignmentTriggers)) {
                        await sleep(120);
                        if (await clickFirstVisibleWithin(toolbar, centerSelectors)) return true;
                    }
                    const groups = toolbar.locator('li.se-toolbar-item-object-arrangement, [class*="object-arrangement"]');
                    for (let groupIndex = await groups.count() - 1; groupIndex >= 0; groupIndex--) {
                        const group = groups.nth(groupIndex);
                        const center = group.locator('li[class*="center"] button, button[data-name*="center"], button[class*="center"]').first();
                        if (await center.count() && await center.isVisible().catch(() => false)) {
                            await center.click({ force: true });
                            return true;
                        }
                        const buttons = group.locator('button');
                        if (await buttons.count() >= 2 && await buttons.nth(1).isVisible().catch(() => false)) {
                            await buttons.nth(1).click({ force: true });
                            return true;
                        }
                    }
                }
            }
            await sleep(180);
        }
        return false;
    }

    async function setRepresentativeImage(page) {
        return clickFirstVisible(page, [
            'button.se-set-rep-image-button', '.se-image-toolbar button[data-name="rep-image"]',
            'button[data-name*="represent"]', 'button[aria-label*="대표"]', 'button[title*="대표"]'
        ]);
    }

    async function applyImageAlignment(page, alignment) {
        await clickFirstVisible(page, [
            `button.se-toolbar-option-align-${alignment}-button[data-value="${alignment}"]`,
            `.se-toolbar-option-align button[data-value="${alignment}"]`,
            `button[data-value="${alignment}"][title*="가운데"]`,
            `button[data-value="${alignment}"][aria-label*="가운데"]`
        ]);
    }

    async function applyAffiliateImageLink(page, url) {
        const opened = await clickFirstVisible(page, [
            'button[data-name="image-link"]', 'button.se-link-toolbar-button',
            'button[aria-label*="링크 입력"]', 'button[title*="링크 입력"]'
        ]);
        if (!opened) return false;
        const inputSelectors = [
            'input.se-custom-layer-link-input', '.se-popover input[type="url"]',
            '.se-popup input[type="url"]', 'input[type="url"]',
            'input[placeholder*="링크"]', 'input[placeholder*="URL"]'
        ];
        for (const selector of inputSelectors) {
            const input = page.locator(selector).first();
            try {
                if (!(await input.count()) || !(await input.isVisible())) continue;
                await input.fill(url);
                const applied = await clickFirstVisible(page, [
                    '.se-property-toolbar-custom-layer-container button[class*="check"]',
                    '.se-popover button:has-text("적용")', '.se-popup button:has-text("적용")',
                    '.se-popover button:has-text("확인")', '.se-popup button:has-text("확인")'
                ]);
                if (!applied) await page.keyboard.press('Enter');
                return true;
            } catch (_) { return false; }
        }
        return false;
    }

    async function chooseCategory(page, category) {
        if (!category) return true;
        const button = page.locator('button.selectbox_button__jb1Dt, button[aria-label="카테고리 목록 버튼"], .se-publish-setting-item--category button').first();
        if (!(await button.count()) || !(await button.isVisible())) return false;
        if (normalizeEditorText(await button.innerText()).includes(normalizeEditorText(category))) return true;
        const panel = page.locator('.selectbox_list__SD2nT, .selectbox-list, .se-category-list-container, [class*="selectbox_list"], [class*="option_list_layer"]').first();
        for (let attempt = 1; attempt <= 3; attempt++) {
            try { await button.scrollIntoViewIfNeeded(); } catch (_) { /* Optional. */ }
            try { await button.hover(); } catch (_) { /* Click can still open the list. */ }
            await sleep(200);
            await button.click({ force: true });
            await sleep(1200);
            if (!(await panel.isVisible().catch(() => false))) {
                try {
                    await page.evaluate((selector) => document.querySelector(selector)?.click(),
                        'button.selectbox_button__jb1Dt, button[aria-label="카테고리 목록 버튼"]');
                    await sleep(1500);
                } catch (_) { /* Continue to the next UI retry. */ }
            }
            if (!(await panel.isVisible().catch(() => false))) continue;
            let matched = null;
            for (const selector of ['label.radio_label__mB6ia', '[class*="radio_label"]', 'button', 'li']) {
                const candidates = panel.locator(selector);
                for (let index = 0; index < await candidates.count(); index++) {
                    const candidate = candidates.nth(index);
                    const candidateText = normalizeEditorText((await readText(candidate)).replace(/\u00a0/g, ' '));
                    if (candidateText.includes(normalizeEditorText(category))) {
                        matched = candidate;
                        break;
                    }
                }
                if (matched) break;
            }
            if (!matched) {
                await page.keyboard.press('Escape').catch(() => {});
                return false;
            }
            try { await matched.scrollIntoViewIfNeeded(); } catch (_) { /* Optional. */ }
            try { await matched.hover(); } catch (_) { /* Click is the authoritative action. */ }
            await sleep(200);
            await matched.click({ force: true });
            await sleep(1500);
            const confirmed = normalizeEditorText(await button.innerText());
            if (confirmed.includes(normalizeEditorText(category))) {
                logger.info?.(`[Naver Publisher] Category selected (${category})`);
                return true;
            }
            logger.warn?.(`[Naver Publisher] Category selection did not reflect in editor (attempt=${attempt}/3, requested=${category}, actual=${confirmed})`);
        }
        return false;
    }

    async function setSchedule(page, scheduleDate) {
        const schedule = page.locator('label:has-text("예약"), label[for="radio_time2"], input[value="schedule"]').first();
        await schedule.waitFor({ state: 'visible', timeout: 5000 });
        await schedule.click({ force: true });
        if (!scheduleDate) return;
        const dateMatch = scheduleDate.match(/\d{4}\.\s*\d{2}\.\s*\d{2}\./);
        const isoDateMatch = scheduleDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const dateText = dateMatch ? dateMatch[0]
            : isoDateMatch ? `${isoDateMatch[1]}.${isoDateMatch[2]}.${isoDateMatch[3]}.`
                : scheduleDate.split(' ')[0];
        const dateInput = page.locator('input.input_date__QmA0s, input[aria-label="날짜 입력"], .input_date__S9V_r').first();
        if (await dateInput.count() && await dateInput.isVisible()) {
            await dateInput.fill(dateText);
            await page.keyboard.press('Enter');
        }
        const timeMatch = scheduleDate.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            const hour = timeMatch[1].padStart(2, '0');
            const minute = String(Math.floor(Number(timeMatch[2]) / 10) * 10).padStart(2, '0');
            const hourInput = page.locator('select.hour_option__J_heO').first();
            const minuteInput = page.locator('select.minute_option__Vb3xB').first();
            if (await hourInput.count() && await hourInput.isVisible()) await hourInput.selectOption(hour);
            if (await minuteInput.count() && await minuteInput.isVisible()) await minuteInput.selectOption(minute);
        }
    }

    async function execute(input, context = {}) {
        const title = requireText(input.title, 'Title');
        const settings = await options.getSettings();
        const headless = input.headless ?? settings.headless ?? true;
        let session;
        try {
            throwIfAborted(context.signal);
            session = await options.createAuthenticatedNaverSession({ headless, signal: context.signal });
            if (!session?.page || typeof session.close !== 'function') {
                throw new NaverPublisherError('네이버 브라우저 세션을 준비하지 못했습니다.', { code: 'NAVER_SESSION_UNAVAILABLE' });
            }
            const page = session.page;
            report(context, 'preparing', 'editor', 0, 1);
            await page.goto(settings.writeUrl, { waitUntil: 'domcontentloaded' });
            await waitForEditor(page, settings, context.signal);
            await dismissEditorPopups(page);
            logger.info?.(`[Naver Publisher] Publication requested (status=${input.status}, category=${String(input.category || '').trim() || '(default)'})`);
            await enterTitle(page, title, context.signal, settings);

            const assets = new Map(input.assets.map((asset) => [asset.key, asset]));
            const warnings = [];
            let representativeImageSet = false;
            const totalBlocks = input.blocks.length;
            let completedBlocks = 0;
            const imageIndexes = input.blocks.map((block, index) => block.type === 'image' ? index : -1).filter((index) => index >= 0);
            let imageDone = 0;
            for (let index = 0; index < totalBlocks; index++) {
                throwIfAborted(context.signal);
                const block = input.blocks[index];
                if (block.type === 'image') {
                    imageDone += 1;
                    const asset = assets.get(block.assetKey);
                    if (!asset) throw new NaverPublisherError(`이미지 자산을 찾지 못했습니다: ${block.assetKey}`, { code: 'NAVER_IMAGE_ASSET_NOT_FOUND' });
                    report(context, 'uploading', 'image', imageDone - 1, imageIndexes.length);
                    await uploadImage(page, asset, context.signal, settings, {
                        affiliateUrl: input.affiliateUrl,
                        representativeImageSet,
                        onRepresentativeImageSet() { representativeImageSet = true; },
                        onWarning(warning) { warnings.push(warning); }
                    });
                    report(context, 'uploading', 'image', imageDone, imageIndexes.length);
                } else {
                    report(context, 'working', 'body', completedBlocks, totalBlocks);
                    await dismissEditorPopups(page);
                    await enterTextBlock(page, block, context.signal, settings, warnings);
                }
                completedBlocks += 1;
            }

            report(context, 'finalizing', 'settings', 0, 1);
            const safeSave = page.locator('button.se-save-button, button:has-text("저장")').first();
            if (await safeSave.count() && await safeSave.isVisible()) {
                await safeSave.click();
                await sleep(Number(settings.safeSaveWaitMs) || 1000);
            }
            await dismissEditorPopups(page);
            const publishButtons = page.locator('button[class*="publish_btn"], button.se-publish-button, header button:has-text("발행"), button:has-text("발행")');
            let opened = false;
            for (let index = 0; index < await publishButtons.count(); index++) {
                const button = publishButtons.nth(index);
                if (!(await button.isVisible())) continue;
                const text = String(await button.innerText()).trim();
                if (!text.includes('발행') || text.includes('예약')) continue;
                await button.click();
                opened = true;
                break;
            }
            if (!opened) throw new NaverPublisherError('네이버 발행 설정을 열지 못했습니다.', { code: 'NAVER_PUBLISH_SETTINGS_FAILED' });
            const finalButtonSelector = 'button.confirm_btn__WEaBq, button[data-testid="seOnePublishBtn"], .se-publish-submit-button, .se-publish-setting-layer button:has-text("발행")';
            await page.locator(finalButtonSelector).first().waitFor({ state: 'visible', timeout: 15000 });
            let finalStatus = input.status;
            const categoryOk = await chooseCategory(page, String(input.category || '').trim());
            if (!categoryOk) {
                finalStatus = 'draft';
                warnings.push('카테고리를 선택하지 못해 임시저장했습니다.');
                logger.warn?.(`[Naver Publisher] Category selection failed; publication downgraded to draft (requestedStatus=${input.status})`);
            }
            if (finalStatus === 'schedule') await setSchedule(page, input.scheduleDate);

            throwIfAborted(context.signal);
            report(context, 'finalizing', 'submitting', 0, 1);
            if (finalStatus === 'draft') {
                logger.info?.('[Naver Publisher] Final action: save draft; publish button will not be clicked.');
                await page.keyboard.press('Escape').catch(() => {});
                const settingsSubmitButtons = page.locator(finalButtonSelector);
                let submitButtonStillVisible = false;
                for (let attempt = 0; attempt < 50; attempt++) {
                    submitButtonStillVisible = false;
                    for (let index = 0; index < await settingsSubmitButtons.count(); index++) {
                        if (await settingsSubmitButtons.nth(index).isVisible().catch(() => false)) {
                            submitButtonStillVisible = true;
                            break;
                        }
                    }
                    if (!submitButtonStillVisible) break;
                    await sleep(100);
                }
                if (submitButtonStillVisible) {
                    throw new NaverPublisherError('발행 설정창을 닫지 못해 임시저장을 안전하게 중단했습니다.', {
                        code: 'NAVER_DRAFT_SETTINGS_CLOSE_FAILED'
                    });
                }
                const saveButton = page.locator('button.se-save-button, button:has-text("저장")').first();
                await saveButton.waitFor({ state: 'visible', timeout: 10000 });
                await saveButton.click();
                await sleep(Number(settings.draftSaveWaitMs) || 1500);
            } else {
                logger.info?.(`[Naver Publisher] Final action: ${finalStatus === 'schedule' ? 'schedule' : 'publish'} (requestedStatus=${input.status})`);
                await page.locator(finalButtonSelector).first().click();
            }
            report(context, 'finalizing', 'verifying', 1, 1);
            let postUrl = '';
            if (finalStatus !== 'draft') {
                try {
                    await page.waitForURL((url) => url.href.includes('logNo=') && !url.href.includes('PostList.naver'), { timeout: 20000 });
                    postUrl = String(page.url() || '');
                } catch (_) {
                    const fallback = String(page.url() || '');
                    if (/^https?:\/\//i.test(fallback)) postUrl = fallback;
                    warnings.push('발행 결과 URL을 확인하지 못했습니다.');
                }
            }
            try {
                await session.persistAuthState?.();
            } catch (error) {
                warnings.push('네이버 로그인 세션 갱신을 저장하지 못했습니다. 다음 작업 전에 설정을 확인해 주세요.');
                logger.warn?.(`[Naver Publisher] Session persistence failed (code=${String(error?.code || 'NAVER_SESSION_PERSIST_FAILED')})`);
            }
            return { status: finalStatus, ...(postUrl ? { postUrl } : {}), warnings };
        } catch (error) {
            if (context.signal?.aborted || error?.code === 'ABORTED') {
                throw new NaverPublisherError('네이버 발행을 중지했습니다. 이미 저장·발행된 결과는 되돌리지 않습니다.', { code: 'ABORTED', cause: error });
            }
            if (error instanceof NaverPublisherError) throw error;
            logger.error?.(`[Naver Publisher] posts.publish failed (code=${String(error?.code || 'NAVER_PUBLISH_FAILED')}, message=${String(error?.message || error)})`);
            throw new NaverPublisherError(String(error?.message || '네이버 발행에 실패했습니다.'), {
                code: error?.code || 'NAVER_PUBLISH_FAILED', cause: error
            });
        } finally {
            if (session) {
                const keepOpen = !headless && (input.isLast === true || settings.closeDelaySeconds === 0) && !context.signal?.aborted;
                if (!headless && !keepOpen && !context.signal?.aborted && Number(settings.closeDelaySeconds) > 0) {
                    await sleep(Number(settings.closeDelaySeconds) * 1000);
                }
                try { await session.close({ keepOpen }); } catch (_) { /* Preserve the publishing result. */ }
            }
        }
    }

    return Object.freeze({
        operations: Object.freeze({ 'posts.publish': Object.freeze({ execute }) })
    });
}

module.exports = { PACKAGE_VERSION, NaverPublisherError, createPlugin };
