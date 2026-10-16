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

    async function editorPress(page, key, target = 'editor') {
        return page.keyboard.press(key);
    }

    async function editorType(page, value, options = {}, target = 'editor') {
        const text = String(value);
        return page.keyboard.type(text, options);
    }

    async function visible(page, selector) {
        try {
            const element = page.locator(selector).first();
            return await element.count() > 0 && await element.isVisible();
        } catch (_) { return false; }
    }

    async function dismissEditorPopups(page) {
        const helpCloseSelectors = [
            'button.se-help-panel-close-button',
            '.se-help-panel button[aria-label*="닫기"]',
            '.se-help-panel button[title*="닫기"]',
            '.se-help-panel button:has-text("닫기")'
        ];
        const previousPostPromptSelectors = [
            'text=작성 중인 글이 있습니다',
            'text=이전 글이 있습니다'
        ];
        const previousPostCancelSelectors = [
            '.se-popup-button-cancel',
            '.se-popup button:has-text("취소")',
            '.se-popup-container button:has-text("취소")',
            '.se-popover button:has-text("취소")',
            '[role="dialog"] button:has-text("취소")',
            '[role="alertdialog"] button:has-text("취소")',
            '.se-popup button:has-text("아니오")',
            '.se-popup-container button:has-text("아니오")',
            '.se-popover button:has-text("아니오")',
            '[role="dialog"] button:has-text("아니오")',
            '[role="alertdialog"] button:has-text("아니오")',
            '.se-popup button:has-text("불러오지 않기")',
            '.se-popup-container button:has-text("불러오지 않기")'
        ];

        // Only close known startup UI. Generic editor popovers include formatting
        // menus and toolbars; Escape/global Cancel can alter the user's formatting
        // state or move focus while body text is being entered.
        if (await clickFirstVisible(page, helpCloseSelectors)) {
            await sleep(150);
            logger.info?.('[Naver Publisher] Help panel closed');
        }

        let promptVisible = false;
        for (const selector of previousPostPromptSelectors) {
            if (await visible(page, selector)) { promptVisible = true; break; }
        }
        if (!promptVisible) return 0;

        let dismissed = await clickFirstVisible(page, previousPostCancelSelectors);
        if (!dismissed) {
            // Escape is a last resort only while the explicit previous-draft
            // prompt is visible, never for arbitrary editor overlays.
            await editorPress(page, 'Escape', 'previous-draft-prompt').catch(() => {});
            await sleep(150);
        }
        for (const selector of previousPostPromptSelectors) {
            if (await visible(page, selector)) return 0;
        }
        logger.info?.('[Naver Publisher] Previous-draft prompt dismissed');
        return 1;
    }

    async function waitForEditor(page, settings, signal) {
        const timeoutMs = Number(settings.editorReadyTimeoutMs) || 45000;
        const started = Date.now();
        let readyRounds = 0;
        let popupSince = 0;
        let readinessChecks = 0;
        const overlaySelectors = [
            '.se-help-panel', 'button.se-help-panel-close-button',
            'text=작성 중인 글이 있습니다', 'text=이전 글이 있습니다'
        ];
        while (Date.now() - started < timeoutMs) {
            throwIfAborted(signal);
            const url = String(page.url() || '');
            if (/nid\.naver\.com|login/i.test(url)) {
                throw new NaverPublisherError('네이버 로그인 세션이 만료되었습니다. 설정에서 다시 로그인해 주세요.', {
                    code: 'NAVER_SESSION_EXPIRED'
                });
            }
            const titleReady = await visible(page,
                '.se-component.se-documentTitle .se-text-paragraph, .se-section-documentTitle .se-text-paragraph, '
                + '.se-documentTitle .se-text-paragraph, .se-component.se-documentTitle .se-placeholder, '
                + '.se-section-documentTitle .se-placeholder, .se-documentTitle .se-placeholder, .se-documentTitle');
            const bodyReady = await visible(page,
                '.se-main-container, .se-container, .se-component.se-text .se-text-paragraph, '
                + '.se-component-content.se-component-content-normal .se-text-paragraph, .se-component-content, .se-module-text, .se-canvas-bottom');
            const loading = await visible(page, '.se-progressbar, .se-loading, .se-spinner, .u_loading, .ly_loading');
            const now = Date.now();
            if (titleReady && bodyReady && !loading) {
                readyRounds += 1;
            } else {
                readyRounds = 0;
            }

            // The previous-draft prompt may appear after the title and editor
            // elements are already visible. Keep dismissing it during a short
            // stabilization window before any keystrokes reach the editor.
            if (readinessChecks % 2 === 0) await dismissEditorPopups(page);
            readinessChecks += 1;

            let overlayVisible = false;
            for (const selector of overlaySelectors) {
                if (await visible(page, selector)) { overlayVisible = true; break; }
            }
            if (overlayVisible) {
                if (!popupSince) popupSince = now;
                if (now - popupSince >= 5000) {
                    throw new NaverPublisherError('네이버 에디터의 이전 글/도움말 팝업을 닫지 못했습니다. 발행을 중단했습니다.', {
                        code: 'NAVER_EDITOR_POPUP_BLOCKED'
                    });
                }
                readyRounds = 0;
            } else {
                popupSince = 0;
                if (readyRounds >= 8) return;
            }
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
            await dismissEditorPopups(page);
            await editorPress(page, 'Escape', 'title').catch(() => {});
            try { await titleArea.scrollIntoViewIfNeeded(); } catch (_) { /* Older editor builds may not support scrolling. */ }
            await titleArea.click({ force: true });
            await sleep(80);
            const titleHasFocus = await titleArea.evaluate((element) => {
                const titleRegion = element.closest('.se-component.se-documentTitle, .se-section-documentTitle, .se-documentTitle') || element;
                const active = document.activeElement;
                const selection = window.getSelection?.();
                return Boolean((active && (active === titleRegion || titleRegion.contains(active)))
                    || (selection?.anchorNode && titleRegion.contains(selection.anchorNode)));
            }).catch(() => false);
            if (!titleHasFocus) {
                throw new NaverPublisherError('네이버 제목 입력란에 포커스가 없어 본문을 안전하게 보존하려고 입력을 중단했습니다.', {
                    code: 'NAVER_TITLE_FOCUS_FAILED'
                });
            }
            await editorPress(page, `${settings.commandKey || 'Meta'}+A`, 'title').catch(() => {});
            await editorPress(page, 'Backspace', 'title').catch(() => {});
            await editorPress(page, 'Delete', 'title').catch(() => {});
            await editorType(page, title, { delay: Number(settings.typingDelayMs) || 12 }, 'title');
            await sleep(180);
            const actual = normalizeEditorText(await readText(titleArea));
            if (actual === expected || actual.includes(expected)) {
                await editorPress(page, 'Enter', 'title');
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
        await editorPress(page, 'Escape', 'text-format').catch(() => {});
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

    async function isCaretInsideQuoteBlock(page) {
        try {
            return await page.evaluate(() => {
                const selection = window.getSelection?.();
                if (!selection || selection.rangeCount === 0) return false;
                const node = selection.getRangeAt(0).startContainer;
                const element = node instanceof Element ? node : node?.parentElement;
                return Boolean(element?.closest('blockquote, [class*="quotation"], [class*="quote"], .se-quotation, .se-module-quotation, .se-text-quotation'));
            });
        } catch (_) {
            return false;
        }
    }

    async function leaveQuoteBlock(page) {
        // Match the proven legacy Naver editor gesture: ArrowDown twice moves
        // from the quotation text through its source/footer and out of the block.
        await sleep(100);
        for (let attempt = 1; attempt <= 3; attempt++) {
            await editorPress(page, 'ArrowDown', 'quote-exit');
            await sleep(70);
            await editorPress(page, 'ArrowDown', 'quote-exit');
            await sleep(70);
            await collapseEditorSelectionToCaretEnd(page);
            await sleep(100);
            if (!(await isCaretInsideQuoteBlock(page))) {
                logger.info?.(`[Naver Publisher] Quote block exited (method=ArrowDownx2, attempt=${attempt})`);
                await editorPress(page, 'Enter', 'quote-exit');
                await sleep(80);
                await collapseEditorSelectionToCaretEnd(page);
                return true;
            }
        }

        // Legacy fallback puts focus on the document bottom and nudges the
        // caret down without creating a line inside the quotation.
        for (let attempt = 1; attempt <= 4; attempt++) {
            await focusEditorBottom(page);
            if (!(await isCaretInsideQuoteBlock(page))) {
                await editorPress(page, 'Enter', 'quote-exit-fallback');
                await sleep(80);
                await collapseEditorSelectionToCaretEnd(page);
                logger.info?.(`[Naver Publisher] Quote block exited (method=document-bottom, attempt=${attempt})`);
                return true;
            }
            await editorPress(page, 'ArrowDown', 'quote-exit-fallback');
            await sleep(90);
        }
        logger.warn?.('[Naver Publisher] Quote caret remains inside quotation after legacy exit attempts');
        return false;
    }

    async function enterTextBlock(page, block, signal, settings, warnings = []) {
        throwIfAborted(signal);
        const text = String(block.text || '');
        if (block.type === 'newline') {
            await editorPress(page, 'Enter', 'newline-block');
            return;
        }
        if (block.type === 'separator') {
            const separator = page.locator('button[data-name*="horizontal-line"], button[aria-label*="구분선"]').first();
            if (await separator.count() && await separator.isVisible()) {
                await separator.click({ force: true });
            } else {
                await editorType(page, '────────────', { delay: Number(settings.typingDelayMs) || 12 }, 'separator');
                await editorPress(page, 'Enter', 'separator');
            }
            return;
        }
        if (block.type === 'list-item') {
            const marker = block.listType === 'ordered' ? '1. ' : '- ';
            await editorType(page, marker, { delay: Number(settings.typingDelayMs) || 12 }, 'list-marker');
            await typeWithBoldRanges(page, text, block.boldRanges, settings, 'list-item');
            await editorPress(page, 'Enter', 'list-item');
            return;
        }
        if (block.type === 'paragraph' && /^https?:\/\/\S+$/i.test(text.trim())) {
            if (await insertOglinkCard(page, text.trim(), warnings)) return;
        }
        if (text) await typeWithBoldRanges(page, text, block.boldRanges, settings, block.type);
        let requiredFormat = null;
        if (block.type === 'heading') requiredFormat = block.level === 3 ? '인용구' : '소제목';
        if (block.type === 'quote') requiredFormat = '인용구';
        if (block.type === 'heading') await sleep(300);
        if (requiredFormat && !(await applyTextFormat(page, requiredFormat))) {
            // Recover once by selecting the current line, as the legacy editor path does.
            await editorPress(page, 'Shift+Home', 'format-recovery').catch(() => {});
            const recovered = await applyTextFormat(page, requiredFormat);
            if (!recovered) warnings.push(`${requiredFormat} 서식을 적용하지 못했습니다: ${text}`);
        }
        if (requiredFormat) {
            // Naver may keep the heading text selected after applying a format.
            // Mirror the legacy editor flow: move to the text end, collapse the
            // actual DOM selection, then let Enter create the following body paragraph.
            await editorPress(page, 'ArrowRight', 'format-recovery').catch(() => {});
            await collapseEditorSelectionToCaretEnd(page);
            await sleep(80);
            const editorText = normalizeEditorText(await readText(page.locator('.se-main-container, .se-container').first()));
            if (text && editorText && !editorText.includes(normalizeEditorText(text))) {
                warnings.push(`${requiredFormat} 텍스트가 에디터에서 확인되지 않습니다: ${text}`);
                await focusEditorBottom(page);
                await editorType(page, text, { delay: Number(settings.typingDelayMs) || 12 }, 'format-recovery');
            }
        }
        if (requiredFormat === '인용구') {
            const quoteExited = await leaveQuoteBlock(page);
            if (!quoteExited) {
                throw new NaverPublisherError('네이버 에디터의 인용구 영역을 벗어나지 못해 본문 입력을 중단했습니다.', {
                    code: 'NAVER_QUOTE_EXIT_FAILED'
                });
            }
            return;
        }
        if (block.type === 'heading') {
            // The next manuscript newline block owns the move into the next
            // editor paragraph. Do not add an implicit Enter here.
            return;
        }
        await editorPress(page, 'Enter', block.type);
    }

    async function typeWithBoldRanges(page, text, ranges, settings, target = 'body') {
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
            if (range.start > cursor) await editorType(page, text.slice(cursor, range.start), { delay }, target);
            await editorPress(page, shortcut, `${target}-bold`);
            await editorType(page, text.slice(range.start, range.end), { delay }, target);
            await editorPress(page, shortcut, `${target}-bold`);
            cursor = range.end;
        }
        if (cursor < text.length) await editorType(page, text.slice(cursor), { delay }, target);
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
                await editorPress(page, 'Escape', 'oglink-dialog').catch(() => {});
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
            await editorPress(page, 'Escape', 'oglink-dialog').catch(() => {});
            return false;
        }
    }

    async function uploadImage(page, asset, signal, settings, imageOptions = {}) {
        throwIfAborted(signal);
        const editorImageSelector = [
            '.se-component-content img', '.se-module-image img', '.se-image-resource img',
            '.se-section img', '.se-component img', '.se-main-container img', '.se-container img'
        ].join(', ');
        const editorImages = page.locator(editorImageSelector);
        const imageCountBefore = await editorImages.count().catch(() => 0);
        const activeSectionBefore = await selectedImageSection(page);
        const activeSectionIdentityBefore = activeSectionBefore
            ? await activeSectionBefore.getAttribute('id').catch(() => null)
            : null;
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
        let imageCount = await editorImages.count().catch(() => 0);
        for (let attempt = 0; imageCount <= imageCountBefore && attempt < 20; attempt++) {
            await sleep(120);
            throwIfAborted(signal);
            imageCount = await editorImages.count().catch(() => 0);
        }
        logger.info?.(`[Naver Publisher] Image upload reflected in editor (before=${imageCountBefore}, after=${imageCount})`);
        if (imageCount > imageCountBefore) {
            let imageSection = null;
            for (let attempt = 0; attempt < 15; attempt++) {
                const selectedSection = await selectedImageSection(page);
                const selectedIdentity = selectedSection
                    ? await selectedSection.getAttribute('id').catch(() => null)
                    : null;
                if (selectedSection && selectedIdentity !== activeSectionIdentityBefore) {
                    imageSection = selectedSection;
                    break;
                }
                if (attempt < 14) await sleep(100);
            }
            if (imageSection) {
                logger.info?.('[Naver Publisher] Current insertion image selected by editor (source=active-image-section)');
            } else {
                // Fallback for editor builds that do not expose selected-state
                // classes: image count confirms insertion, then focus the last
                // image in the insertion flow and resolve its own section.
                const latestImage = editorImages.nth(imageCount - 1);
                try { await latestImage.click({ force: true }); } catch (_) { /* Keep upload success if focus is unavailable. */ }
                imageSection = latestImage.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " se-section ")][1]');
            }
            const sectionReady = await imageSection?.count().catch(() => 0);
            if (!sectionReady) {
                logger.warn?.(`[Naver Publisher] Inserted image section unavailable (uploadCount=${imageCountBefore}->${imageCount}, activeSection=${Boolean(imageSection)})`);
                throw new NaverPublisherError('삽입한 이미지의 편집 영역을 찾지 못했습니다.', { code: 'NAVER_IMAGE_SECTION_NOT_FOUND' });
            }
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
            if (String(imageOptions.caption || '').trim()) {
                await enterImageCaption(page, String(imageOptions.caption).trim(), settings, imageSection);
            } else {
                await advanceAfterImage(page, 'none');
            }
        } else {
            throw new NaverPublisherError('이미지 업로드 후 네이버 에디터에서 새 이미지 블록을 확인하지 못했습니다.', {
                code: 'NAVER_IMAGE_INSERT_FAILED'
            });
        }
    }

    async function advanceAfterImage(page, captionState) {
        try {
            await editorPress(page, 'Enter', captionState === 'entered' ? 'image-caption' : 'image');
            await sleep(70);
            logger.info?.(`[Naver Publisher] Next body position prepared after image (caption=${captionState}, method=Enter)`);
        } catch (error) {
            throw new NaverPublisherError('이미지 다음 본문 입력 위치로 이동하지 못했습니다.', {
                code: 'NAVER_IMAGE_NEXT_BLOCK_FOCUS_FAILED',
                cause: error
            });
        }
    }

    async function enterImageCaption(page, caption, settings, insertedImage) {
        // The current insertion's active image section is supplied by uploadImage;
        // do not rescan the document and accidentally bind to a previous image.
        const section = insertedImage;
        const sectionCount = await section?.count().catch(() => 0);
        if (!sectionCount) {
            logger.warn?.('[Naver Publisher] Current insertion image section not found (source=active-image-section)');
            throw new NaverPublisherError('삽입한 이미지의 설명 영역을 찾지 못했습니다.', {
                code: 'NAVER_IMAGE_CAPTION_NOT_FOUND'
            });
        }
        // `se-is-on-caption` is an editor interaction state, not a stable
        // structural marker. It can be absent while Naver is still activating
        // the image after upload. Prefer the actual empty caption placeholder
        // and retry briefly for the editor's asynchronous render.
        let captionModule = section.locator('.se-module.se-module-text').filter({
            hasText: '사진 설명을 입력하세요'
        }).last();
        let captionArea;
        for (let attempt = 0; attempt < 20; attempt++) {
            const moduleReady = await captionModule.count().catch(() => 0)
                && await captionModule.isVisible().catch(() => false);
            if (moduleReady) {
                captionArea = captionModule.locator('.se-text-paragraph').last();
                if (await captionArea.count().catch(() => 0)
                    && await captionArea.isVisible().catch(() => false)) break;
            }
            captionArea = null;
            if (attempt < 19) await sleep(100);
        }
        if (!captionArea) {
            logger.warn?.('[Naver Publisher] Image caption placeholder not found after image activation (section=.se-section, module=.se-module-text:has-text("사진 설명을 입력하세요"))');
            throw new NaverPublisherError('네이버 에디터에서 이미지 설명 입력 위치를 찾지 못했습니다.', {
                code: 'NAVER_IMAGE_CAPTION_NOT_FOUND'
            });
        }

        // Captions can start below the viewport after a tall image upload. Scroll
        // them into view first, then hit-test several points so the fixed 글감
        // search bar or a floating toolbar never receives the caption keystrokes.
        let clickTarget = null;
        let lastCaptionGeometry = null;
        for (let attempt = 0; attempt < 3 && !clickTarget; attempt++) {
            try { await captionArea.scrollIntoViewIfNeeded(); } catch (_) { /* DOM scroll fallback below. */ }
            if (attempt > 0) {
                await captionArea.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
            }
            await sleep(100);
            const hitTest = await captionArea.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                const candidates = [
                    { x: rect.left + 3, y: rect.top + rect.height / 2 },
                    { x: rect.right - 3, y: rect.top + rect.height / 2 },
                    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
                    { x: rect.left + 3, y: rect.top + 3 },
                    { x: rect.right - 3, y: rect.bottom - 3 }
                ];
                const geometry = {
                    top: Math.round(rect.top), bottom: Math.round(rect.bottom),
                    left: Math.round(rect.left), right: Math.round(rect.right),
                    viewportHeight: window.innerHeight
                };
                for (const point of candidates) {
                    if (point.x < 0 || point.y < 0 || point.x >= window.innerWidth || point.y >= window.innerHeight) continue;
                    const hit = document.elementFromPoint(point.x, point.y);
                    if (hit && (hit === element || element.contains(hit))) {
                        return { position: { x: point.x - rect.left, y: point.y - rect.top }, geometry };
                    }
                }
                const visiblePoint = candidates.find((point) => point.x >= 0 && point.y >= 0
                    && point.x < window.innerWidth && point.y < window.innerHeight);
                const obstruction = visiblePoint ? document.elementFromPoint(visiblePoint.x, visiblePoint.y) : null;
                return {
                    position: null,
                    geometry,
                    obstruction: obstruction ? `${obstruction.tagName.toLowerCase()}.${String(obstruction.className || '').toString().trim().replace(/\s+/g, '.')}` : 'outside-viewport'
                };
            }).catch(() => null);
            if (hitTest?.position) clickTarget = hitTest;
            else if (hitTest) lastCaptionGeometry = hitTest;
        }
        if (!clickTarget) {
            const geometry = lastCaptionGeometry?.geometry;
            logger.warn?.(`[Naver Publisher] Caption click target still obscured after scroll (rect=${geometry ? `${geometry.left},${geometry.top}-${geometry.right},${geometry.bottom}` : 'unavailable'}, viewportHeight=${geometry?.viewportHeight ?? 'unknown'}, obstruction=${lastCaptionGeometry?.obstruction || 'unknown'})`);
            throw new NaverPublisherError('네이버 이미지 설명 위치가 화면에 나타나지 않아 입력을 중단했습니다.', {
                code: 'NAVER_IMAGE_CAPTION_FOCUS_FAILED'
            });
        }
        await captionArea.click({ force: true, position: clickTarget.position });
        await sleep(80);
        const captionFocused = await captionModule.evaluate((element) => {
            const active = document.activeElement;
            const selection = window.getSelection?.();
            return Boolean(active && element.contains(active))
                || Boolean(selection?.anchorNode && element.contains(selection.anchorNode))
                || Boolean(element.querySelector('[class*="placeholder-focused"]'));
        }).catch(() => false);
        if (!captionFocused) {
            throw new NaverPublisherError('네이버 이미지 설명 입력란에 포커스가 없어 입력을 중단했습니다.', {
                code: 'NAVER_IMAGE_CAPTION_FOCUS_FAILED'
            });
        }
        await editorType(page, caption, { delay: Number(settings.typingDelayMs) || 12 }, 'image-caption');
        logger.info?.(`[Naver Publisher] Image caption typing completed (characters=${caption.length}); advancing without DOM text verification`);
        // Keep this Enter inside the caption workflow: focus is still in the
        // caption paragraph, so this is the exact transition to the next block.
        await advanceAfterImage(page, 'entered');
    }

    async function selectedImageSection(page) {
        const selectors = [
            '.se-section.se-section-image.se-is-selected',
            '.se-section.se-section-image.se-is-activated',
            '.se-section.se-is-selected:has(.se-module-image img, .se-image-resource img)',
            '.se-section.se-is-activated:has(.se-module-image img, .se-image-resource img)'
        ];
        for (const selector of selectors) {
            const candidates = page.locator(selector);
            for (let index = await candidates.count() - 1; index >= 0; index--) {
                const candidate = candidates.nth(index);
                if (await candidate.isVisible().catch(() => false)) return candidate;
            }
        }
        return null;
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
                if (!applied) await editorPress(page, 'Enter', 'image-link');
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
                await editorPress(page, 'Escape', 'category-dialog').catch(() => {});
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

    async function findScheduleCombobox(page, accessibleName) {
        const byRole = typeof page.getByRole === 'function'
            ? page.getByRole('combobox', { name: accessibleName }).filter({ visible: true }).first()
            : null;
        if (byRole && await byRole.count().catch(() => 0)) return byRole;

        // Keep a semantic fallback for Playwright-compatible page adapters
        // that do not expose getByRole; do not couple this to generated CSS.
        const selects = page.locator('select');
        const metadata = await selects.evaluateAll((elements) => elements.map((element, index) => ({
            index,
            visible: Boolean(element.getClientRects().length),
            accessibleName: [
                element.getAttribute('aria-label'),
                element.getAttribute('title'),
                ...Array.from(element.labels || []).map((label) => label.textContent)
            ].filter(Boolean).join(' ')
        })));
        const match = metadata.find((item) => item.visible && accessibleName.test(item.accessibleName));
        if (match) return selects.nth(match.index);

        throw new NaverPublisherError(`네이버 예약 설정에서 ${accessibleName.source} 콤보박스를 찾지 못했습니다.`, {
            code: 'NAVER_SCHEDULE_CONTROL_NOT_FOUND'
        });
    }

    async function setSchedule(page, scheduleDate) {
        const schedule = page.locator('label:has-text("예약"), label[for="radio_time2"], input[value="schedule"]').first();
        await schedule.waitFor({ state: 'visible', timeout: 5000 });
        await schedule.click({ force: true });
        if (!scheduleDate) {
            logger.info?.('[Naver Publisher] Scheduled time not provided; keeping Naver default schedule time');
            return;
        }
        const dateParts = scheduleDate.match(/^(\d{4})-(\d{2})-(\d{2})[T ]/)
            || scheduleDate.match(/^(\d{4})\.\s*(\d{2})\.\s*(\d{2})\./);
        const timeMatch = scheduleDate.match(/[T ](\d{1,2}):(\d{2})/)
            || scheduleDate.match(/(\d{1,2}):(\d{2})/);
        if (!dateParts || !timeMatch) {
            throw new NaverPublisherError(`예약 일시 형식을 확인할 수 없습니다: ${scheduleDate}`, {
                code: 'NAVER_SCHEDULE_DATE_INVALID'
            });
        }
        const requestedDateText = `${dateParts[1]}. ${dateParts[2]}. ${dateParts[3]}.`;
        const requestedHour = Number(timeMatch[1]);
        const requestedMinute = Number(timeMatch[2]);
        if (requestedHour > 23 || requestedMinute > 59) {
            throw new NaverPublisherError(`예약 시각 범위를 확인해 주세요: ${scheduleDate}`, {
                code: 'NAVER_SCHEDULE_DATE_INVALID'
            });
        }
        // Naver accepts 10-minute intervals. Round upward so a requested time
        // is never scheduled earlier than the user selected. Carry across the
        // hour/day boundary (for example, 23:57 becomes 00:00 next day).
        const roundedTotalMinutes = Math.ceil((requestedHour * 60 + requestedMinute) / 10) * 10;
        const requestedDate = new Date(Date.UTC(
            Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]), 0, roundedTotalMinutes
        ));
        const selectedHourTarget = requestedDate.getUTCHours();
        const selectedMinuteTarget = requestedDate.getUTCMinutes();
        const targetDateParts = [
            String(requestedDate.getUTCFullYear()).padStart(4, '0'),
            String(requestedDate.getUTCMonth() + 1).padStart(2, '0'),
            String(requestedDate.getUTCDate()).padStart(2, '0')
        ];
        const dateText = `${targetDateParts[0]}. ${targetDateParts[1]}. ${targetDateParts[2]}.`;
        const requestedClock = `${String(requestedHour).padStart(2, '0')}:${String(requestedMinute).padStart(2, '0')}`;
        const selectedClockTarget = `${String(selectedHourTarget).padStart(2, '0')}:${String(selectedMinuteTarget).padStart(2, '0')}`;
        logger.info?.(`[Naver Publisher] Applying requested schedule (requested=${requestedDateText} ${requestedClock}, Naver time=${dateText} ${selectedClockTarget})`);
        const allInputs = page.locator('input');
        const inputMetadata = await allInputs.evaluateAll((inputs) => inputs.map((element, index) => ({
            index,
            value: element.value || '',
            ariaLabel: element.getAttribute('aria-label') || '',
            placeholder: element.getAttribute('placeholder') || '',
            className: typeof element.className === 'string' ? element.className : '',
            readOnly: Boolean(element.readOnly),
            visible: Boolean(element.getClientRects().length)
        })));
        const dateMeta = inputMetadata.find((input) => input.visible
            && (/^\d{4}\.\s*\d{2}\.\s*\d{2}\.?$/.test(input.value)
                || /날짜/.test(`${input.ariaLabel} ${input.placeholder}`)
                || (input.readOnly && /^\d{4}[.\-/ ]/.test(input.value))));
        const dateInput = dateMeta
            ? allInputs.nth(dateMeta.index)
            : page.locator('input[readonly]').filter({ visible: true }).first();
        await dateInput.waitFor({ state: 'visible', timeout: 5000 });
        const existingDate = String(await dateInput.inputValue()).replace(/\D/g, '');
        if (existingDate === targetDateParts.join('')) {
            logger.info?.(`[Naver Publisher] Schedule date already matches requested date (${dateText}); leaving the read-only date field unchanged`);
        } else {
            // Naver exposes the date as a read-only textbox that opens a
            // calendar. Use its accessible calendar controls rather than
            // trying to fill it or relying on generated CSS-module classes.
            await dateInput.click();
            const targetYear = Number(targetDateParts[0]);
            const targetMonth = Number(targetDateParts[1]);
            const targetDay = Number(targetDateParts[2]);
            for (let attempt = 0; attempt < 24; attempt++) {
                const headings = page.getByText(/\d{4}\s*년\s*\d{1,2}\s*월/).filter({ visible: true });
                const headingCount = await headings.count().catch(() => 0);
                let calendarHeading = null;
                let currentMonth;
                for (let index = 0; index < headingCount; index++) {
                    const candidate = headings.nth(index);
                    const match = normalizeEditorText(await readText(candidate)).match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
                    if (match) {
                        calendarHeading = candidate;
                        currentMonth = { year: Number(match[1]), month: Number(match[2]) };
                        break;
                    }
                }
                if (!calendarHeading) break;
                const currentMonthIndex = currentMonth.year * 12 + currentMonth.month - 1;
                const targetMonthIndex = targetYear * 12 + targetMonth - 1;
                if (currentMonthIndex === targetMonthIndex) break;

                const direction = currentMonthIndex < targetMonthIndex ? 1 : -1;
                const directionName = direction > 0 ? /다음\s*(달|월)|next\s*month/i : /이전\s*(달|월)|prev(ious)?\s*month/i;
                let navigationButton = page.getByRole('button', { name: directionName }).filter({ visible: true }).first();
                if (!(await navigationButton.count().catch(() => 0))) {
                    // Naver's calendar arrows may have no accessible label.
                    // Identify the two visible header buttons by their position
                    // relative to the month heading, not by CSS module names.
                    const headingBox = await calendarHeading.boundingBox().catch(() => null);
                    const buttons = page.getByRole('button').filter({ visible: true });
                    const buttonCount = await buttons.count().catch(() => 0);
                    const nearby = [];
                    for (let index = 0; headingBox && index < buttonCount; index++) {
                        const button = buttons.nth(index);
                        const box = await button.boundingBox().catch(() => null);
                        if (box && Math.abs((box.y + box.height / 2) - (headingBox.y + headingBox.height / 2)) <= 18) {
                            nearby.push({ index, x: box.x + box.width / 2 });
                        }
                    }
                    nearby.sort((left, right) => left.x - right.x);
                    const selected = direction > 0 ? nearby[nearby.length - 1] : nearby[0];
                    if (!selected || nearby.length < 2) {
                        throw new NaverPublisherError('네이버 날짜 선택기에서 월 이동 버튼을 찾지 못했습니다.', {
                            code: 'NAVER_SCHEDULE_CALENDAR_NAVIGATION_NOT_FOUND'
                        });
                    }
                    navigationButton = buttons.nth(selected.index);
                }
                await navigationButton.click();
                await sleep(100);
            }

            const targetDateName = new RegExp(`^${targetYear}\\s*년\\s*${targetMonth}\\s*월\\s*${targetDay}일?$`);
            let targetDateButton = page.getByRole('button', { name: targetDateName }).filter({ visible: true }).first();
            if (!(await targetDateButton.count().catch(() => 0))) {
                const dayButtons = page.getByRole('button', { name: new RegExp(`^${targetDay}(일)?$`) }).filter({ visible: true });
                const dayCount = await dayButtons.count().catch(() => 0);
                for (let index = 0; index < dayCount; index++) {
                    const candidate = dayButtons.nth(index);
                    if (await candidate.isEnabled().catch(() => false)) {
                        targetDateButton = candidate;
                        break;
                    }
                }
            }
            if (!(await targetDateButton.count().catch(() => 0))) {
                // Some calendar implementations expose grid cells rather than
                // buttons. Match the day label semantically within the open UI.
                const dayText = page.getByText(new RegExp(`^${targetDay}$`)).filter({ visible: true }).first();
                if (!(await dayText.count().catch(() => 0))) {
                    throw new NaverPublisherError(`네이버 날짜 선택기에서 ${dateText} 날짜를 찾지 못했습니다.`, {
                        code: 'NAVER_SCHEDULE_DATE_NOT_FOUND'
                    });
                }
                await dayText.click();
            } else {
                await targetDateButton.click();
            }
            await sleep(150);
            const appliedDate = String(await dateInput.inputValue()).replace(/\s/g, '');
            if (appliedDate.replace(/\D/g, '') !== targetDateParts.join('')) {
                throw new NaverPublisherError(`네이버 예약 날짜 입력을 확인하지 못했습니다 (requested=${dateText}, actual=${await dateInput.inputValue()})`, {
                    code: 'NAVER_SCHEDULE_DATE_NOT_APPLIED'
                });
            }
        }

        const hourInput = await findScheduleCombobox(page, /예약\s*발행\s*시간\s*선택|시간\s*선택/);
        const minuteInput = await findScheduleCombobox(page, /예약\s*발행\s*분\s*선택|분\s*선택/);
        const hourOptions = await hourInput.locator('option').evaluateAll((options) => options.map((option) => ({
            value: option.value,
            label: (option.label || option.textContent || '').trim()
        })));
        const hourOption = hourOptions.find((option) => Number(option.value) === selectedHourTarget
            || Number(option.label.match(/\d+/)?.[0]) === selectedHourTarget);
        if (!hourOption) {
            throw new NaverPublisherError(`네이버 예약 시간 목록에 ${selectedHourTarget}시가 없습니다.`, {
                code: 'NAVER_SCHEDULE_HOUR_UNAVAILABLE'
            });
        }
        await hourInput.selectOption(hourOption.value);

        const minuteOptions = await minuteInput.locator('option').evaluateAll((options) => options.map((option) => ({
            value: option.value,
            label: (option.label || option.textContent || '').trim(),
            minute: Number((option.label || option.textContent || '').match(/\d+/)?.[0] ?? option.value)
        })).filter((option) => Number.isFinite(option.minute)));
        const minuteOption = minuteOptions.find((option) => option.minute === selectedMinuteTarget);
        if (!minuteOption) {
            throw new NaverPublisherError(`네이버 예약 분 목록에 ${selectedMinuteTarget}분이 없습니다.`, {
                code: 'NAVER_SCHEDULE_MINUTE_UNAVAILABLE'
            });
        }
        await minuteInput.selectOption(minuteOption.value);
        const selectedHour = String(await hourInput.inputValue());
        const selectedMinute = String(await minuteInput.inputValue());
        const actualHour = hourOptions.find((option) => option.value === selectedHour)?.label.match(/\d+/)?.[0] ?? selectedHour;
        const actualMinute = minuteOptions.find((option) => option.value === selectedMinute)?.minute ?? Number(selectedMinute);
        if (Number(actualHour) !== selectedHourTarget || Number(actualMinute) !== selectedMinuteTarget) {
            throw new NaverPublisherError(`네이버 예약 시각 입력을 확인하지 못했습니다 (requested=${requestedHour}:${String(requestedMinute).padStart(2, '0')}, selected=${selectedHour}:${selectedMinute})`, {
                code: 'NAVER_SCHEDULE_TIME_NOT_APPLIED'
            });
        }
        const selectedClock = `${String(Number(actualHour)).padStart(2, '0')}:${String(Number(actualMinute)).padStart(2, '0')}`;
        if (selectedClock !== selectedClockTarget) {
            throw new NaverPublisherError(`네이버 예약 시각이 올바르게 적용되지 않았습니다 (requested=${selectedClockTarget}, actual=${selectedClock})`, {
                code: 'NAVER_SCHEDULE_TIME_NOT_APPLIED'
            });
        }
        if (selectedClock !== requestedClock || dateText !== requestedDateText) {
            logger.info?.(`[Naver Publisher] Schedule rounded up to Naver's 10-minute interval (requested=${requestedDateText} ${requestedClock}, applied=${dateText} ${selectedClock})`);
        }
        logger.info?.(`[Naver Publisher] Schedule inputs applied (requested=${requestedDateText} ${requestedClock}, selected=${await dateInput.inputValue()} ${selectedClock})`);
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
            const bodyTotal = input.blocks.filter((block) => !['image', 'newline'].includes(block.type)).length;
            let bodyDone = 0;
            const imageIndexes = input.blocks.map((block, index) => block.type === 'image' ? index : -1).filter((index) => index >= 0);
            let imageDone = 0;
            for (let index = 0; index < input.blocks.length; index++) {
                throwIfAborted(context.signal);
                const block = input.blocks[index];
                if (block.type === 'image') {
                    imageDone += 1;
                    const asset = assets.get(block.assetKey);
                    if (!asset) throw new NaverPublisherError(`이미지 자산을 찾지 못했습니다: ${block.assetKey}`, { code: 'NAVER_IMAGE_ASSET_NOT_FOUND' });
                    report(context, 'uploading', 'image', imageDone, imageIndexes.length);
                    await uploadImage(page, asset, context.signal, settings, {
                        caption: block.caption,
                        affiliateUrl: input.affiliateUrl,
                        representativeImageSet,
                        onRepresentativeImageSet() { representativeImageSet = true; },
                        onWarning(warning) { warnings.push(warning); }
                    });
                } else {
                    if (block.type !== 'newline') {
                        bodyDone += 1;
                        report(context, 'working', 'body', bodyDone, bodyTotal);
                    }
                    await enterTextBlock(page, block, context.signal, settings, warnings);
                }
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
                await editorPress(page, 'Escape', 'publish-dialog').catch(() => {});
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
