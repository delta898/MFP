const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

// ✅ 모듈 불러오기
const CONFIG = require('./config-loader');   // 사용자 설정
const Constants = require('./constants');    // 🔥 [필수] 기본 설정 상수 (이게 있어야 우선순위 로직 작동)
const Utils = require('./utils');
const Logger = require('./logger');
const BrowserLauncher = require('./browser-launcher');
const WordPressClient = require('./wordpress-client');
const { marked } = require('marked');

const IS_MAC = process.platform === 'darwin';
const CMD_KEY = IS_MAC ? 'Meta' : 'Control';
const SAFE_EDITOR_VIEWPORT = { width: 1280, height: 800 };
const PUBLISH_EDITOR_READY_TIMEOUT_MS = 45000;

async function autoScrollAndClick(locator) {
	try {
		if (await locator.count() > 0 && await locator.first().isVisible()) {
			await locator.first().scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
			await locator.first().click({ force: true });
			return true;
		}
	} catch (e) {
		Logger.warn(`⚠️ 요소 스크롤/클릭 실패: ${e.message}`);
	}
	return false;
}

async function clickIfVisible(locator) {
	return await autoScrollAndClick(locator);
}

async function dismissEditorPopups(page) {
	let dismissedCount = 0;
	for (let i = 0; i < 8; i++) {
		let dismissedThisRound = false;

		// 1) Help 패널 닫기
		const helpDismissSelectors = [
			'button.se-help-panel-close-button',
			'.se-help-panel button[aria-label*="닫기"]',
			'.se-help-panel button[title*="닫기"]',
			'.se-help-panel button:has-text("닫기")',
			'button[aria-label*="도움"]',
			'button[title*="도움"]'
		];
		for (const selector of helpDismissSelectors) {
			const clicked = await clickIfVisible(page.locator(selector).first());
			if (clicked) {
				dismissedThisRound = true;
				break;
			}
		}
		if (!dismissedThisRound) {
			dismissedThisRound = await clickIfVisible(page.getByRole('button', { name: /help|도움말/i })) || dismissedThisRound;
		}

		// 2) "이전 글이 있습니다. 로드하시겠습니까?" 류 팝업 닫기(취소/아니오 우선)
		const popupDismissSelectors = [
			'.se-popup-button-cancel',
			'.se-popup button:has-text("취소")',
			'.se-popup-container button:has-text("취소")',
			'.se-popover button:has-text("취소")',
			'[role="dialog"] button:has-text("취소")',
			'.se-popup button:has-text("아니오")',
			'.se-popup-container button:has-text("아니오")',
			'.se-popover button:has-text("아니오")',
			'[role="dialog"] button:has-text("아니오")',
			'.se-popup button:has-text("불러오지 않기")',
			'.se-popup-container button:has-text("불러오지 않기")',
			'.se-popover button:has-text("불러오지 않기")',
			'.se-popup button:has-text("닫기")',
			'.se-popup-container button:has-text("닫기")',
			'.se-popover button:has-text("닫기")'
		];
		for (const selector of popupDismissSelectors) {
			const clicked = await clickIfVisible(page.locator(selector).first());
			if (clicked) {
				dismissedThisRound = true;
				break;
			}
		}

		// 3) Windows 환경에서 렌더 타이밍 차이로 클릭 타이밍을 놓치면 ESC로 한 번 더 시도
		if (!dismissedThisRound) {
			let hasOverlay = false;
			const overlaySelectors = [
				'.se-help-panel',
				'.se-popup',
				'.se-popup-container',
				'.se-popover',
				'[role="dialog"]'
			];
			for (const selector of overlaySelectors) {
				try {
					const overlay = page.locator(selector).first();
					if (await overlay.count() > 0 && await overlay.isVisible()) {
						hasOverlay = true;
						break;
					}
				} catch (e) { }
			}

			if (hasOverlay) {
				try {
					await page.keyboard.press('Escape');
					await Utils.sleep(120);
					dismissedThisRound = true;
				} catch (e) { }
			}
		}

		if (!dismissedThisRound) break;
		dismissedCount++;
		await Utils.sleep(300);
	}

	if (dismissedCount > 0) {
		Logger.info(`   🧹 에디터 팝업 정리 완료 (${dismissedCount}회)`);
	}
}

async function focusLatestEditorImage(page) {
	const imageSelectors = [
		'.se-component-content img',
		'.se-module-image img',
		'.se-image-resource img',
		'img'
	];

	for (const selector of imageSelectors) {
		const images = page.locator(selector);
		const count = await images.count();
		if (count === 0) continue;

		for (let i = count - 1; i >= 0; i--) {
			const candidate = images.nth(i);
			try {
				if (!(await candidate.isVisible())) continue;
				await autoScrollAndClick(candidate);
				await Utils.sleep(150);
				return true;
			} catch (e) { }
		}
	}
	return false;
}

async function getEditorImageCount(page) {
	const selectors = [
		'.se-component-content img',
		'.se-module-image img',
		'.se-image-resource img',
		'img'
	];
	let maxCount = 0;
	for (const selector of selectors) {
		try {
			const count = await page.locator(selector).count();
			if (count > maxCount) maxCount = count;
		} catch (e) { }
	}
	return maxCount;
}

async function waitForNewImageSlot(page, beforeCount, timeoutMs = 4500) {
	const startedAt = Date.now();
	while ((Date.now() - startedAt) < timeoutMs) {
		const nowCount = await getEditorImageCount(page);
		if (nowCount > beforeCount) {
			return true;
		}
		await Utils.sleep(120);
	}
	return false;
}

async function focusLatestEditorImageWithRetry(page, maxAttempts = 10, delayMs = 220) {
	for (let i = 0; i < maxAttempts; i++) {
		const focused = await focusLatestEditorImage(page);
		if (focused) return true;
		await Utils.sleep(delayMs);
	}
	return false;
}

async function focusLatestOglinkCard(page) {
	const selectors = [
		'.se-component.se-oglink',
		'.se-module-oglink',
		'.se-oglink',
		'.se-component[class*="oglink"]'
	];

	for (const selector of selectors) {
		const cards = page.locator(selector);
		const count = await cards.count();
		if (count === 0) continue;

		for (let i = count - 1; i >= 0; i--) {
			const candidate = cards.nth(i);
			try {
				if (!(await candidate.isVisible())) continue;

				const clickTargets = [
					candidate.locator('.se-oglink-frame').first(),
					candidate.locator('.se-oglink-info').first(),
					candidate.locator('.se-component-content').first(),
					candidate
				];
				for (const target of clickTargets) {
					try {
						if (await target.count() > 0 && await target.isVisible()) {
							await autoScrollAndClick(target);
							await Utils.sleep(120);
							return true;
						}
					} catch (e) { }
				}
			} catch (e) { }
		}
	}
	return false;
}

async function getVisibleImageToolbars(page) {
	const selectors = [
		'.se-image-toolbar',
		'.se-context-toolbar',
		'.se-l-property-toolbar',
		'.se-property-toolbar',
		'.se-toolbar'
	];
	const toolbars = [];
	for (const selector of selectors) {
		const locator = page.locator(selector);
		const count = await locator.count();
		for (let i = count - 1; i >= 0; i--) {
			const toolbar = locator.nth(i);
			try {
				if (await toolbar.isVisible()) {
					toolbars.push(toolbar);
				}
			} catch (e) { }
		}
	}
	return toolbars;
}

async function getVisibleEditorToolbars(page) {
	const selectors = [
		'.se-image-toolbar',
		'.se-toolbar',
		'.se-toolbar-wrap',
		'.se-toolbar-group',
		'[role="toolbar"]'
	];
	const toolbars = [];

	for (const selector of selectors) {
		const locator = page.locator(selector);
		const count = await locator.count();
		for (let i = count - 1; i >= 0; i--) {
			const toolbar = locator.nth(i);
			try {
				if (await toolbar.isVisible()) {
					toolbars.push(toolbar);
				}
			} catch (e) { }
		}
	}
	return toolbars;
}

async function centerAlignFocusedImage(page, options = {}) {
	const shouldRefocusImage = options.refocusImage !== false;
	for (let attempt = 0; attempt < 4; attempt++) {
		if (attempt > 0 && shouldRefocusImage) {
			try {
				await focusLatestEditorImage(page);
			} catch (e) { }
			await Utils.sleep(120);
		}

		const toolbars = await getVisibleImageToolbars(page);
		if (toolbars.length === 0) continue;

		const selectors = [
			'button[data-name="cycle-align"][data-value="center"]',
			'button[data-type="cycle-toggle"][data-name="cycle-align"][data-value="center"]',
			'.se-context-toolbar-cycle-toggle-container button[data-value="center"]',
			'.se-context-toolbar-cycle-toggle-container button.se-center-tool-bar-button',
			'li.se-toolbar-item-align button[data-value="center"]',
			'li.se-toolbar-item-line-image-center button',
			'li[class*="line-image-center"] button',
			'button[data-name*="line-image-center"]',
			'button[data-name*="image-center"]',
			'button[data-name*="alignCenter"]',
			'button[data-name*="align-center"]',
			'button[class*="align-center"]',
			'button[class*="image-center"]',
			'button[class*="center"]',
			'button[aria-label*="가운데"]',
			'button[aria-label*="중앙"]',
			'button[title*="가운데"]',
			'button[title*="중앙"]',
			'button:has-text("가운데")',
			'button:has-text("중앙")'
		];
		for (const toolbar of toolbars) {
			for (const selector of selectors) {
				const clicked = await clickIfVisible(toolbar.locator(selector));
				if (clicked) {
					await Utils.sleep(120);
					return true;
				}
			}

			// 에디터 버전에 따라 정렬 버튼이 object-arrangement 그룹(좌/중/우 3버튼)으로만 노출된다.
			const arrangementGroups = toolbar.locator('li.se-toolbar-item-object-arrangement, [class*="object-arrangement"]');
			const groupCount = await arrangementGroups.count();
			for (let i = groupCount - 1; i >= 0; i--) {
				const group = arrangementGroups.nth(i);
				try {
					if (!(await group.isVisible())) continue;
					const centerByClass = group.locator('li[class*="center"] button, button[data-name*="center"], button[class*="center"]').first();
					if (await centerByClass.count() > 0 && await centerByClass.isVisible()) {
						await autoScrollAndClick(centerByClass);
						await Utils.sleep(120);
						return true;
					}

					const buttons = group.locator('button');
					const btnCount = await buttons.count();
					if (btnCount >= 2) {
						const centerBtn = buttons.nth(1); // 일반적으로 가운데 버튼이 두 번째
						if (await centerBtn.isVisible()) {
							await autoScrollAndClick(centerBtn);
							await Utils.sleep(120);
							return true;
						}
					}
				} catch (e) { }
			}
		}
	}
	return false;
}

async function setFocusedImageAsRepresentative(page) {
	// 에디터 버전에 따라 대표 버튼이 이미지 툴바 내부가 아니라 이미지 오버레이에 직접 뜨기도 한다.
	const selectors = [
		'button.se-set-rep-image-button',
		'.se-image-toolbar button.se-set-rep-image-button',
		'.se-image-toolbar button[data-name="rep-image"]',
		'button[data-name*="represent"]',
		'button[aria-label*="대표"]',
		'button[title*="대표"]',
		'button:has-text("대표")'
	];

	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			await focusLatestEditorImage(page);
		} catch (e) { }
		await Utils.sleep(120);

		for (const selector of selectors) {
			const buttons = page.locator(selector);
			const count = await buttons.count();
			for (let i = count - 1; i >= 0; i--) {
				const button = buttons.nth(i);
				try {
					if (!(await button.isVisible())) continue;

					const ariaPressed = String(await button.getAttribute('aria-pressed') || '').toLowerCase();
					if (ariaPressed === 'true') return true;

					await autoScrollAndClick(button);
					await Utils.sleep(180);
					return true;
				} catch (e) { }
			}
		}
	}
	return false;
}

async function applyLinkToFocusedImage(page, linkUrl) {
	if (!linkUrl) return false;

	const toolbars = await getVisibleEditorToolbars(page);
	if (toolbars.length === 0) return false;

	const inputSelectors = [
		'input.se-custom-layer-link-input',
		'.se-property-toolbar-custom-layer-container input.se-custom-layer-link-input',
		'.se-popover input[type="url"]',
		'.se-popover input[placeholder*="링크"]',
		'.se-popover input[placeholder*="URL"]',
		'.se-popover input[placeholder*="URL을 입력"]',
		'.se-popover input[aria-label*="링크"]',
		'.se-popup input[type="url"]',
		'.se-popup input[placeholder*="링크"]',
		'.se-popup input[placeholder*="URL"]',
		'.se-popup input[placeholder*="URL을 입력"]',
		'.se-popup input[aria-label*="링크"]',
		'input[type="url"]',
		'input[placeholder*="URL을 입력"]',
		'input[placeholder*="링크"]'
	];

	const hasVisibleLinkInput = async () => {
		for (const selector of inputSelectors) {
			const input = page.locator(selector).first();
			try {
				if (await input.count() > 0 && await input.isVisible()) return true;
			} catch (e) { }
		}
		return false;
	};

	const linkButtonSelectors = [
		'button[data-name="image-link"]',
		'button.se-link-toolbar-button',
		'li.se-toolbar-item-link button',
		'button[data-type="custom-layer-button"][data-name="image-link"]',
		'button[aria-label*="링크 입력"]',
		'button[title*="링크 입력"]',
		'button[data-name*="link"]',
		'button[class*="link"]'
	];

	const isLikelySmallLinkButton = async (target) => {
		try {
			if (await target.count() === 0 || !(await target.isVisible())) return false;
			const text = (await target.innerText()).trim();
			const aria = String(await target.getAttribute('aria-label') || '').trim();
			const title = String(await target.getAttribute('title') || '').trim();
			const dataName = String(await target.getAttribute('data-name') || '').trim();
			const className = String(await target.getAttribute('class') || '').trim();
			let tooltip = '';
			try {
				const tooltipNode = target.locator('.se-toolbar-tooltip').first();
				if (await tooltipNode.count() > 0 && await tooltipNode.isVisible()) {
					tooltip = String(await tooltipNode.innerText()).trim();
				}
			} catch (e) { }

			const signature = `${text} ${aria} ${title} ${dataName} ${className} ${tooltip}`.toLowerCase();
			if (signature.includes('image-link')) return true;
			if (signature.includes('se-link-toolbar-button')) return true;
			if (signature.includes('링크 입력')) return true;
			if (signature.includes('링크 입력 열기')) return true;

			// "링크" 텍스트형(미리보기용) 버튼은 제외한다.
			if (/^\s*링크\s*$/.test(text) && !signature.includes('image-link')) return false;

			return false;
		} catch (e) {
			return false;
		}
	};

	let opened = false;
	for (const toolbar of toolbars) {
		for (const selector of linkButtonSelectors) {
			const targets = toolbar.locator(selector);
			const count = await targets.count();
			for (let i = 0; i < count; i++) {
				const target = targets.nth(i);
				const smallButton = await isLikelySmallLinkButton(target);
				if (!smallButton) continue;
				const clicked = await clickIfVisible(target);
				if (!clicked) continue;
				await Utils.sleep(180);
				if (await hasVisibleLinkInput()) {
					opened = true;
					break;
				}
				try { await page.keyboard.press('Escape'); } catch (e) { }
			}
			if (opened) break;
		}
		if (opened) break;
	}
	if (!opened) return false;

	for (const selector of inputSelectors) {
		const input = page.locator(selector).first();
		try {
			if (await input.count() > 0 && await input.isVisible()) {
				await input.fill(linkUrl);
				await Utils.sleep(100);
				let applied =
					await clickIfVisible(input.locator('xpath=following-sibling::button[1]')) ||
					await clickIfVisible(input.locator('xpath=parent::*//button[contains(@class, "check") or contains(@class, "confirm")]').first()) ||
					await clickIfVisible(page.locator('.se-property-toolbar-custom-layer-container button[class*="check"], .se-property-toolbar-custom-layer-container button[class*="confirm"]')) ||
					await clickIfVisible(page.locator('.se-property-toolbar-custom-layer-container button[aria-label*="확인"], .se-property-toolbar-custom-layer-container button[title*="확인"]'));
				if (!applied) {
					applied =
						await clickIfVisible(page.locator('.se-popover button:has-text("적용"), .se-popup button:has-text("적용")')) ||
						await clickIfVisible(page.locator('.se-popover button:has-text("등록"), .se-popup button:has-text("등록")')) ||
						await clickIfVisible(page.locator('.se-popover button:has-text("확인"), .se-popup button:has-text("확인")')) ||
						await clickIfVisible(page.locator('.se-toolbar button[aria-label*="확인"], [role="toolbar"] button[aria-label*="확인"]')) ||
						await clickIfVisible(page.locator('.se-toolbar button[aria-label*="적용"], [role="toolbar"] button[aria-label*="적용"]')) ||
						await clickIfVisible(page.locator('.se-toolbar button[title*="확인"], [role="toolbar"] button[title*="확인"]')) ||
						await clickIfVisible(page.locator('.se-toolbar button[title*="적용"], [role="toolbar"] button[title*="적용"]')) ||
						await clickIfVisible(page.locator('.se-toolbar button[class*="check"], [role="toolbar"] button[class*="check"]')) ||
						await clickIfVisible(page.locator('.se-toolbar button[class*="confirm"], [role="toolbar"] button[class*="confirm"]'));
				}
				if (!applied) {
					await page.keyboard.press('Enter');
				}
				// 실제 반영 여부를 보수적으로 확인: 링크 입력창이 닫혀야 성공으로 간주
				let closed = false;
				try {
					await input.waitFor({ state: 'hidden', timeout: 1200 });
					closed = true;
				} catch (e) { }
				if (!closed) {
					try { await page.keyboard.press('Escape'); } catch (e) { }
					return false;
				}
				return true;
			}
		} catch (e) { }
	}
	return false;
}

function isUrlOnlyParagraph(text) {
	const raw = String(text || '').trim();
	if (!raw) return false;
	return /^https?:\/\/[^\s]+$/i.test(raw);
}

async function closeVisibleOglinkPopup(page, maxAttempts = 8) {
	const popup = page.locator('div.se-popup-oglink').first();
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		let visible = false;
		try {
			visible = await popup.count() > 0 && await popup.isVisible();
		} catch (e) { }
		if (!visible) return true;

		let closed = false;
		const closeSelectors = [
			'div.se-popup-oglink button.se-popup-close-button',
			'div.se-popup-oglink button[aria-label*="닫기"]',
			'div.se-popup-oglink button[title*="닫기"]',
			'div.se-popup-oglink button:has-text("닫기")',
			'div.se-popup-oglink .se-popup-dim'
		];
		for (const selector of closeSelectors) {
			try {
				const btn = page.locator(selector).first();
				if (await btn.count() > 0 && await btn.isVisible()) {
					await btn.click({ force: true });
					await Utils.sleep(120);
					try {
						await popup.waitFor({ state: 'hidden', timeout: 500 });
						closed = true;
						break;
					} catch (e) { }
				}
			} catch (e) { }
		}
		if (closed) return true;

		try { await page.keyboard.press('Escape'); } catch (e) { }
		try {
			await popup.waitFor({ state: 'hidden', timeout: 500 });
			return true;
		} catch (e) { }
	}
	return false;
}

async function focusEditorTypingArea(page) {
	const paragraphSelectors = [
		'.se-component.se-text .se-text-paragraph',
		'.se-component-content.se-component-content-normal .se-text-paragraph',
		'.se-component-content.se-component-content-text p',
		'.se-module-text p',
		'.se-text-paragraph',
		'.se-section-text .se-text-paragraph',
		'.se-component-content [contenteditable="true"]'
	];

	for (const selector of paragraphSelectors) {
		const nodes = page.locator(selector);
		const count = await nodes.count();
		for (let i = count - 1; i >= 0; i--) {
			const node = nodes.nth(i);
			try {
				if (!(await node.isVisible())) continue;
				try { await node.scrollIntoViewIfNeeded(); } catch (e) { }
				// 제목 영역(.se-documentTitle)은 제외하고 본문 입력 영역을 우선 포커스한다.
				const inTitleSection = await node.evaluate((el) => !!el.closest('.se-component.se-documentTitle, .se-section-documentTitle, .se-documentTitle'));
				if (inTitleSection) continue;
				await node.click({ force: true });
				await Utils.sleep(80);
				return true;
			} catch (e) { }
		}
	}

	try {
		const editor = page.locator('.se-container, .se-main-container, #mainFrame').first();
		if (await editor.count() > 0 && await editor.isVisible()) {
			try { await editor.scrollIntoViewIfNeeded(); } catch (e) { }
			const box = await editor.boundingBox();
			if (box && box.width > 0 && box.height > 0) {
				const clickX = Math.max(12, Math.floor(box.width * 0.18));
				const clickY = Math.max(12, Math.floor(box.height * 0.42));
				await editor.click({ force: true, position: { x: clickX, y: clickY } });
			} else {
				await editor.click({ force: true });
			}
			await Utils.sleep(80);
			return true;
		}
	} catch (e) { }
	return false;
}

async function focusEditorBottomAnchor(page) {
	const selectors = [
		'.se-canvas-bottom',
		'.se-main-container',
		'.se-container'
	];

	for (const selector of selectors) {
		const node = page.locator(selector).first();
		try {
			if (await node.count() === 0 || !(await node.isVisible())) continue;
			try { await node.scrollIntoViewIfNeeded(); } catch (e) { }
			const box = await node.boundingBox();
			if (box && box.width > 0 && box.height > 0) {
				const clickX = Math.max(12, Math.floor(box.width * 0.08));
				const clickY = Math.max(12, Math.floor(box.height * 0.95));
				await node.click({ force: true, position: { x: clickX, y: clickY } });
			} else {
				await node.click({ force: true });
			}
			await Utils.sleep(100);
			return true;
		} catch (e) { }
	}
	return false;
}

async function placeCaretAtDocumentEnd(page, options = {}) {
	const opts = options || {};
	const skipRange = !!opts.skipRangeSelection;

	// 1) Primary: force DOM selection to the last visible editable node.
	if (!skipRange) {
		try {
			const movedByRange = await page.evaluate(() => {
				const root =
					document.querySelector('.se-main-container') ||
					document.querySelector('.se-container') ||
					document.body;
				if (!root) return false;

				const isVisible = (el) => {
					if (!el) return false;
					const rect = el.getBoundingClientRect();
					const style = window.getComputedStyle(el);
					return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
				};

				const candidates = Array.from(
					root.querySelectorAll(
						'.se-component-content [contenteditable="true"], .se-module-text p, .se-text-paragraph, [contenteditable="true"]'
					)
				).filter((el) => {
					if (!(el instanceof HTMLElement)) return false;
					if (el.closest('.se-component.se-documentTitle, .se-section-documentTitle, .se-documentTitle')) return false;
					if (el.closest('.se-toolbar, .se-popup, .se-layer, [role="dialog"]')) return false;
					return isVisible(el);
				});

				const target = candidates.length > 0 ? candidates[candidates.length - 1] : null;
				if (!target) return false;
				try {
					target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				} catch (e) { }

				const selection = window.getSelection();
				if (!selection) return false;
				const range = document.createRange();
				range.selectNodeContents(target);
				range.collapse(false); // move caret to the end
				selection.removeAllRanges();
				selection.addRange(range);
				(target).focus?.();
				return true;
			});
			if (movedByRange) {
				await Utils.sleep(80);
				return true;
			}
		} catch (e) { }
	}

	// 2) Fallback: bottom anchor click path
	const movedByAnchor = await focusEditorBottomAnchor(page);
	if (movedByAnchor) return true;

	// 3) Last fallback key
	try {
		await page.keyboard.press('End');
		await Utils.sleep(80);
		return true;
	} catch (e) { }
	return false;
}

function normalizeEditorText(value) {
	return String(value || '').replace(/\s+/g, ' ').trim();
}

async function waitForBlogEditorReady(page, timeoutMs = 30000) {
	const startedAt = Date.now();
	let stableCount = 0;
	let popupDismissRound = 0;

	const hasVisible = async (selector) => {
		try {
			const el = page.locator(selector).first();
			return (await el.count()) > 0 && await el.isVisible();
		} catch (e) {
			return false;
		}
	};

	while ((Date.now() - startedAt) < timeoutMs) {
		// 로그인 페이지로 튄 경우는 즉시 실패 처리 (기존 상위 로직과 동일한 의도)
		const currentUrl = String(page.url() || '');
		if (currentUrl.includes('nid.naver.com') || currentUrl.includes('login')) {
			throw new Error("Login Session Expired - Please run 'npm run login' to re-authenticate");
		}

		const titleReady = await hasVisible(
			'.se-component.se-documentTitle .se-text-paragraph, ' +
			'.se-section-documentTitle .se-text-paragraph, ' +
			'.se-documentTitle .se-text-paragraph, ' +
			'.se-component.se-documentTitle .se-placeholder, ' +
			'.se-section-documentTitle .se-placeholder, ' +
			'.se-documentTitle .se-placeholder, ' +
			'.se-documentTitle'
		);
		const editorReady = await hasVisible(
			'.se-main-container, .se-container, ' +
			'.se-component.se-text .se-text-paragraph, ' +
			'.se-component-content.se-component-content-normal .se-text-paragraph, ' +
			'.se-component-content, .se-module-text, .se-canvas-bottom'
		);
		const loadingVisible = await hasVisible('.se-progressbar, .se-loading, .se-spinner, .u_loading, .ly_loading');
		const elapsed = Date.now() - startedAt;
		const readyByTimeoutFallback = editorReady && !loadingVisible && elapsed > 12000;

		if ((titleReady && editorReady && !loadingVisible) || readyByTimeoutFallback) {
			stableCount++;
			if (stableCount >= 2) {
				const elapsedMs = Date.now() - startedAt;
				if (elapsedMs >= 1500) {
					Logger.info(`   ✅ 에디터 입력 준비 완료 (${Math.round(elapsedMs / 1000)}초)`);
				}
				return true;
			}
		} else {
			stableCount = 0;
		}

		if (popupDismissRound % 6 === 0) {
			try { await dismissEditorPopups(page); } catch (e) { }
		}
		popupDismissRound++;
		await Utils.sleep(220);
	}

	throw new Error(`에디터 로드 대기 시간 초과 (${timeoutMs}ms)`);
}

async function inputBlogTitleWithVerification(page, title, getRandomTypingDelay, maxAttempts = 3) {
	const titleSelector =
		'.se-component.se-documentTitle .se-text-paragraph, ' +
		'.se-section-documentTitle .se-text-paragraph, ' +
		'.se-documentTitle .se-text-paragraph, ' +
		'.se-component.se-documentTitle .se-placeholder, ' +
		'.se-section-documentTitle .se-placeholder, ' +
		'.se-documentTitle .se-placeholder, ' +
		'.se-documentTitle';

	const waitStartedAt = Date.now();
	while ((Date.now() - waitStartedAt) < 25000) {
		const titleAreaProbe = page.locator(titleSelector).first();
		try {
			if (await titleAreaProbe.count() > 0 && await titleAreaProbe.isVisible()) break;
		} catch (e) { }
		await Utils.sleep(220);
	}
	const titleArea = page.locator(titleSelector).first();
	await titleArea.waitFor({ state: 'visible', timeout: 12000 });

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		await dismissEditorPopups(page);
		try { await titleArea.scrollIntoViewIfNeeded(); } catch (e) { }
		await titleArea.click({ force: true });
		await Utils.sleep(80);

		try { await page.keyboard.press(`${CMD_KEY}+A`); } catch (e) { }
		await Utils.sleep(50);
		try { await page.keyboard.press('Backspace'); } catch (e) { }
		try { await page.keyboard.press('Delete'); } catch (e) { }
		await Utils.sleep(50);

		await page.keyboard.type(title, { delay: getRandomTypingDelay() });
		await Utils.sleep(180);

		let typedTitle = '';
		try {
			typedTitle = normalizeEditorText(await titleArea.innerText());
		} catch (e) {
			try { typedTitle = normalizeEditorText(await titleArea.textContent()); } catch (e2) { }
		}

		const isMatched =
			typedTitle === normalizeEditorText(title) ||
			typedTitle.includes(normalizeEditorText(title));

		if (isMatched) {
			// 수동 편집과 동일: 제목 입력 후 Enter 1회로 본문 첫 줄로 이동.
			// 여기서 추가 포커스 이동을 하지 않는다(초기 빈 줄 생성 방지).
			await page.keyboard.press('Enter');
			return true;
		}

		if (attempt < maxAttempts) {
			Logger.warn(`   ⚠️ 제목 입력 검증 실패(${attempt}/${maxAttempts}) - 재시도합니다.`);
			await Utils.sleep(220);
		}
	}

	throw new Error('제목 입력 검증에 실패했습니다. 네트워크/PC 성능 상태를 확인해주세요.');
}

async function applyTextFormatAtCursor(page, formatName, options = {}) {
	const strict = options?.strict === true;
	try {
		const toolbarBtn = page.locator('button[data-name="text-format"]').first();
		if (await toolbarBtn.count() === 0 || !(await toolbarBtn.isVisible())) return false;
		const textIncludesFormat = async () => {
			try {
				const chunks = [
					String(await toolbarBtn.innerText() || ''),
					String(await toolbarBtn.getAttribute('aria-label') || ''),
					String(await toolbarBtn.getAttribute('title') || '')
				].join(' ').toLowerCase();
				return chunks.includes(String(formatName || '').toLowerCase());
			} catch (e) { }
			return false;
		};

		const clickPreferredOption = async () => {
			const preferredSelectors = formatName === '인용구'
				? [
					'button.se-toolbar-option-text-format-quotation',
					'button[class*="text-format-quotation"]'
				]
				: formatName === '소제목'
					? [
						'button.se-toolbar-option-text-format-subtitle',
						'button[class*="text-format-subtitle"]'
					]
					: [];

			for (const selector of preferredSelectors) {
				const options = page.locator(selector);
				const count = await options.count();
				for (let i = 0; i < count; i++) {
					const option = options.nth(i);
					try {
						if (!(await option.isVisible())) continue;
						await autoScrollAndClick(option);
						return true;
					} catch (e) { }
				}
			}

			// 옵션 버튼군 내부에서만 이름 매칭 (상단 토글 버튼 오인 방지)
			const optionButtons = page.locator('button.se-toolbar-option-text-button');
			const optionCount = await optionButtons.count();
			for (let i = 0; i < optionCount; i++) {
				const option = optionButtons.nth(i);
				try {
					if (!(await option.isVisible())) continue;
					const signature = [
						String(await option.innerText() || ''),
						String(await option.getAttribute('aria-label') || ''),
						String(await option.getAttribute('title') || ''),
						String(await option.getAttribute('class') || '')
					].join(' ').toLowerCase();
					if (!signature.includes(String(formatName || '').toLowerCase())) continue;
					await option.click({ force: true });
					return true;
				} catch (e) { }
			}

			// 마지막 fallback
			const byRole = page.getByRole('button', { name: new RegExp(formatName) }).first();
			if (await byRole.count() > 0 && await byRole.isVisible()) {
				await autoScrollAndClick(byRole);
				return true;
			}
			return false;
		};

		const isApplied = async () => {
			if (await textIncludesFormat()) return true;
			if (formatName === '인용구') {
				return await isCaretInsideQuoteBlock(page);
			}
			return false;
		};

		for (let attempt = 0; attempt < 3; attempt++) {
			await toolbarBtn.click({ force: true });
			await Utils.sleep(180);

			const clicked = await clickPreferredOption();
			await Utils.sleep(140);

			if (clicked && await isApplied()) return true;

			// 포맷 라벨 검증이 실패해도 클릭은 되었을 수 있으므로 한 번 더 시도한다.
			if (!strict && clicked && attempt === 2) return true;
		}
	} catch (e) { }
	try { await page.keyboard.press('Escape'); } catch (e) { }
	return false;
}

async function isCaretInsideQuoteBlock(page) {
	try {
		return await page.evaluate(() => {
			const sel = window.getSelection?.();
			if (!sel || sel.rangeCount === 0) return false;
			const range = sel.getRangeAt(0);
			const node = range.startContainer;
			const element = node instanceof Element ? node : node?.parentElement;
			if (!element) return false;
			return Boolean(
				element.closest(
					'blockquote, [class*="quotation"], [class*="quote"], .se-quotation, .se-module-quotation, .se-text-quotation'
				)
			);
		});
	} catch (e) {
		return false;
	}
}

async function ensureCaretOutsideQuoteBlock(page, maxTries = 4, options = {}) {
	const allowEnter = options.allowEnter !== false;
	// 먼저 문서 하단 기준으로 커서를 내린다(quote 내부 editable 재포커스 방지).
	await placeCaretAtDocumentEnd(page, { skipRangeSelection: true });
	for (let i = 0; i < maxTries; i++) {
		const inQuote = await isCaretInsideQuoteBlock(page);
		if (!inQuote) return true;
		if (allowEnter) {
			try { await page.keyboard.press('Enter'); } catch (e) { }
		} else {
			try { await page.keyboard.press('ArrowDown'); } catch (e) { }
			await collapseEditorSelectionToCaretEnd(page);
		}
		await Utils.sleep(90);
		await placeCaretAtDocumentEnd(page, { skipRangeSelection: true });
		await Utils.sleep(60);
	}
	return !(await isCaretInsideQuoteBlock(page));
}

async function collapseEditorSelectionToCaretEnd(page) {
	try {
		return await page.evaluate(() => {
			const sel = window.getSelection?.();
			if (!sel || sel.rangeCount === 0) return false;
			if (sel.isCollapsed) return true;
			const range = sel.getRangeAt(0).cloneRange();
			range.collapse(false);
			sel.removeAllRanges();
			sel.addRange(range);
			return true;
		});
	} catch (e) {
		return false;
	}
}

async function escapeQuoteBlockByUserFlow(page, maxTries = 2) {
	// 수동 편집 UX를 그대로 모사:
	// 1) 인용구 적용 후 ArrowDown 2회 (출처/블록 선택 이동)
	// 2) Enter는 기본적으로 치지 않고(임의 줄바꿈 방지), 필요 시 fallback에서만 사용
	for (let i = 0; i < maxTries; i++) {
		try { await page.keyboard.press('ArrowDown'); } catch (e) { }
		await Utils.sleep(70);
		try { await page.keyboard.press('ArrowDown'); } catch (e) { }
		await Utils.sleep(70);
		await collapseEditorSelectionToCaretEnd(page);
		await Utils.sleep(100);
		if (!(await isCaretInsideQuoteBlock(page))) return true;
	}
	return false;
}

async function selectCurrentParagraphContents(page) {
	try {
		return await page.evaluate(() => {
			const sel = window.getSelection?.();
			if (!sel || sel.rangeCount === 0) return false;
			const range = sel.getRangeAt(0);
			const node = range.startContainer;
			const el = node instanceof Element ? node : node?.parentElement;
			if (!el) return false;
			const paragraph =
				el.closest('.se-text-paragraph') ||
				el.closest('p') ||
				el.closest('[contenteditable="true"]');
			if (!paragraph) return false;
			const next = document.createRange();
			next.selectNodeContents(paragraph);
			sel.removeAllRanges();
			sel.addRange(next);
			return true;
		});
	} catch (e) {
		return false;
	}
}

function resolvePublishViewport() {
	return { ...SAFE_EDITOR_VIEWPORT };
}

async function getEditorLinkSnapshot(page, targetUrl = '') {
	try {
		return await page.evaluate((rawUrl) => {
			const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const normalize = (value) => {
				const v = String(value || '').trim();
				if (!v) return '';
				try {
					const u = new URL(v, window.location.href);
					u.hash = '';
					const path = u.pathname.replace(/\/+$/, '');
					return `${u.origin}${path}${u.search}`;
				} catch (e) {
					return v.replace(/\/+$/, '');
				}
			};

			const target = normalize(rawUrl);
			const editorRoot =
				document.querySelector('.se-main-container') ||
				document.querySelector('.se-container') ||
				document.querySelector('.se-component-content') ||
				document.body;

			const anchors = Array.from(editorRoot.querySelectorAll('a[href]'))
				.filter(a => !a.closest('.se-popup-oglink'));
			const allAnchorCount = anchors.length;

			const targetAnchorCount = anchors.filter(a => {
				const href = normalize(a.getAttribute('href'));
				if (!target || !href) return false;
				return href === target || href.startsWith(target) || target.startsWith(href);
			}).length;

			const oglinkRaw = [];
			const oglinkSelectors = [
				'.se-component.se-oglink',
				'.se-module-oglink',
				'.se-oglink',
				'[class*="se-oglink"]'
			];
			for (const selector of oglinkSelectors) {
				const nodes = editorRoot.querySelectorAll(selector);
				for (const node of nodes) oglinkRaw.push(node);
			}
			const oglinkModules = Array.from(new Set(oglinkRaw))
				.filter(el => !el.closest('.se-popup-oglink'));
			const oglinkModuleCount = oglinkModules.length;

			const targetWithoutProtocol = target.replace(/^https?:\/\//i, '');
			const targetOglinkCount = oglinkModules.filter(module => {
				if (!target) return false;
				const hrefMatched = Array.from(module.querySelectorAll('a[href]')).some(anchor => {
					const href = normalize(anchor.getAttribute('href'));
					return href && (href === target || href.startsWith(target) || target.startsWith(href));
				});
				if (hrefMatched) return true;
				const text = String(module.textContent || '');
				return Boolean(targetWithoutProtocol && text.includes(targetWithoutProtocol));
			}).length;

			const oglinkSignature = oglinkModules
				.map(module => {
					const hrefs = Array.from(module.querySelectorAll('a[href]'))
						.map(anchor => normalize(anchor.getAttribute('href')))
						.filter(Boolean)
						.slice(0, 2)
						.join('|');
					const title =
						String(module.querySelector('.se-oglink-title, .se-oglink-info-title, .se-oglink-info')?.textContent || '')
							.replace(/\s+/g, ' ')
							.trim()
							.slice(0, 80);
					return `${hrefs}::${title}`;
				})
				.join('||');

			const targetMentionCount = (() => {
				if (!target) return 0;
				const text = String(editorRoot.textContent || '');
				const patterns = [
					new RegExp(escapeRegExp(target), 'gi'),
					new RegExp(escapeRegExp(targetWithoutProtocol), 'gi')
				];
				let count = 0;
				for (const pattern of patterns) {
					const matched = text.match(pattern);
					if (matched?.length) count += matched.length;
				}
				return count;
			})();

			return {
				targetAnchorCount,
				oglinkModuleCount,
				targetOglinkCount,
				oglinkSignature,
				allAnchorCount,
				targetMentionCount
			};
		}, targetUrl);
	} catch (e) {
		return {
			targetAnchorCount: 0,
			oglinkModuleCount: 0,
			targetOglinkCount: 0,
			oglinkSignature: '',
			allAnchorCount: 0,
			targetMentionCount: 0
		};
	}
}

async function insertOglinkCardAtCursor(page, linkUrl) {
	const url = String(linkUrl || '').trim();
	if (!/^https?:\/\//i.test(url)) return false;

	const moveCaretToCardInsertPoint = async () => {
		// 링크 카드는 일반 본문 문단 포커스보다 "문서 하단 앵커" 기준이 안정적이다.
		// (패키징 환경에서 본문 문단 포커스로 되돌아가며 카드가 역순/상단에 삽입되는 현상 방지)
		if (await focusEditorBottomAnchor(page)) return true;
		if (await placeCaretAtDocumentEnd(page)) return true;
		return await focusEditorTypingArea(page);
	};

	const beforeSnapshot = await getEditorLinkSnapshot(page, url);
	await closeVisibleOglinkPopup(page);
	await moveCaretToCardInsertPoint();

	const openButtonSelectors = [
		'li.se-toolbar-item-oglink button[data-name="oglink"]',
		'button[data-name="oglink"]',
		'button.se-text-icon-toolbar-button[data-name="oglink"]',
		'button[title*="링크 추가"]',
		'button[aria-label*="링크 추가"]'
	];
	let opened = false;
	for (const selector of openButtonSelectors) {
		const buttons = page.locator(selector);
		const count = await buttons.count();
		for (let i = 0; i < count; i++) {
			const btn = buttons.nth(i);
			try {
				if (!(await btn.isVisible())) continue;
				await autoScrollAndClick(btn);
				await Utils.sleep(220);
				const input = page.locator('input.se-popup-oglink-input, .se-popup-oglink input.se-popup-oglink-input').first();
				if (await input.count() > 0 && await input.isVisible()) {
					opened = true;
					break;
				}
			} catch (e) { }
		}
		if (opened) break;
	}
	if (!opened) return false;

	const popup = page.locator('div.se-popup-oglink').first();
	const input = page.locator('input.se-popup-oglink-input, .se-popup-oglink input.se-popup-oglink-input').first();
	const searchButtons = page.locator('button.se-popup-oglink-button');
	const loading = page.locator('.se-popup-oglink-loading').first();
	const confirmSelectors = [
		'button.se-popup-button-confirm',
		'.se-popup-button-container button.se-popup-button-confirm',
		'.se-popup-button-container button:has-text("확인")'
	];

	const isEnabled = async (locator) => {
		try {
			if (await locator.count() === 0 || !(await locator.isVisible())) return false;
			const disabledAttr = await locator.getAttribute('disabled');
			const ariaDisabled = String(await locator.getAttribute('aria-disabled') || '').toLowerCase();
			const className = String(await locator.getAttribute('class') || '').toLowerCase();
			if (disabledAttr !== null) return false;
			if (ariaDisabled === 'true') return false;
			if (className.includes('disabled')) return false;
			return true;
		} catch (e) {
			return false;
		}
	};

	const clickVisibleSearchButton = async () => {
		try {
			const count = await searchButtons.count();
			for (let i = 0; i < count; i++) {
				const btn = searchButtons.nth(i);
				if (!(await btn.isVisible())) continue;
				await autoScrollAndClick(btn);
				return true;
			}
		} catch (e) { }
		return false;
	};

	const clickEnabledConfirmButton = async () => {
		for (const selector of confirmSelectors) {
			const buttons = page.locator(selector);
			const count = await buttons.count();
			for (let i = 0; i < count; i++) {
				const btn = buttons.nth(i);
				if (!(await isEnabled(btn))) continue;
				await autoScrollAndClick(btn);
				return true;
			}
		}
		return false;
	};

	try {
		await autoScrollAndClick(input);
		await input.fill('');
		await input.fill(url);
		await Utils.sleep(150);

		// 1) URL 분석(돋보기) 버튼 클릭
		let searched = await clickVisibleSearchButton();
		if (!searched) {
			try { await input.press('Enter'); } catch (e) { }
		}

		// 2) 확인 버튼 클릭은 "팝업이 닫힐 때까지" 재시도한다.
		let closed = false;
		let confirmAttempted = false;
		for (let i = 0; i < 60; i++) {
			try {
				if (await popup.count() === 0 || !(await popup.isVisible())) {
					closed = true;
					break;
				}
			} catch (e) { }

			// 링크 미리보기 로딩 중에는 확인 버튼 활성화를 잠시 기다린다.
			try {
				if (await loading.count() > 0 && await loading.isVisible()) {
					await Utils.sleep(150);
					continue;
				}
			} catch (e) { }

			const clicked = await clickEnabledConfirmButton();
			if (!clicked) {
				// fallback: 엔터로 확인 시도
				try {
					await input.press('Enter');
					confirmAttempted = true;
				} catch (e) { }
			} else {
				confirmAttempted = true;
			}

			try {
				await popup.waitFor({ state: 'hidden', timeout: 250 });
				closed = true;
				break;
			} catch (e) { }
			await Utils.sleep(150);
		}

		if (!closed) {
			closed = await closeVisibleOglinkPopup(page);
		}
		if (!closed) {
			return false;
		}

		let inserted = false;
		const verifyMaxAttempts = 5;
		const verifyDelayMs = 180;
		for (let i = 0; i < verifyMaxAttempts; i++) {
			const nowSnapshot = await getEditorLinkSnapshot(page, url);
			if (
				nowSnapshot.targetAnchorCount > beforeSnapshot.targetAnchorCount ||
				nowSnapshot.targetOglinkCount > beforeSnapshot.targetOglinkCount ||
				nowSnapshot.oglinkModuleCount > beforeSnapshot.oglinkModuleCount ||
				nowSnapshot.oglinkSignature !== beforeSnapshot.oglinkSignature ||
				nowSnapshot.allAnchorCount > beforeSnapshot.allAnchorCount ||
				nowSnapshot.targetMentionCount > beforeSnapshot.targetMentionCount
			) {
				inserted = true;
				break;
			}
			await Utils.sleep(verifyDelayMs);
		}
		if (!inserted) {
			// pkg 환경(런타임/렌더 타이밍 차이)에서 실제 삽입됐는데도 스냅샷 검증이 늦게 반영되는 경우가 있어
			// 중복 URL 텍스트 입력을 막기 위해 "팝업 정상 닫힘 + 확인 시도"는 성공으로 간주한다.
			if (closed && confirmAttempted) {
				Logger.warn(`       ⚠️ 링크 카드 삽입 검증 지연: 성공으로 간주(중복 URL 대체 방지): ${url}`);
				inserted = true;
			}
		}
		if (!inserted) {
			return false;
		}

		// 링크 카드를 선택한 뒤 가운데 정렬을 시도한다.
		for (let i = 0; i < 6; i++) {
			const focused = await focusLatestOglinkCard(page);
			if (!focused) {
				await Utils.sleep(180);
				continue;
			}
			const centered = await centerAlignFocusedImage(page, { refocusImage: false });
			if (centered) {
				Logger.info(`       ↔️ 링크 카드 가운데 정렬 적용: ${url}`);
				break;
			}
			await Utils.sleep(180);
		}

		await moveCaretToCardInsertPoint();
		return true;
	} catch (e) {
		await closeVisibleOglinkPopup(page);
		await moveCaretToCardInsertPoint();
		return false;
	}
}

function buildRelatedPostsSectionMarkdown(relatedPosts, heading, includeHeading = true) {
	const title = String(heading || '함께 보면 좋은 글').trim() || '함께 보면 좋은 글';
	const lines = [];
	if (includeHeading) {
		lines.push(`## ${title}`);
	}
	// [Policy] RSS 등에서 수집된 본인의 다른 글만 포함하며, 참고 URL 등 외부 링크는 절대 포함하지 않음
	const validPosts = (Array.isArray(relatedPosts) ? relatedPosts : []).filter(post => {
		const postUrl = String(post?.url || '').trim();
		return /^https?:\/\//i.test(postUrl);
	});

	if (validPosts.length === 0) {
		lines.push('https://blog.naver.com/여기에_링크_추가_1');
		lines.push('https://blog.naver.com/여기에_링크_추가_2');
		lines.push('https://blog.naver.com/여기에_링크_추가_3');
		return lines.join('\n').trim();
	}

	validPosts.slice(0, 3).forEach(post => {
		const postUrl = String(post?.url || '').trim();
		lines.push(postUrl);
	});
	return lines.join('\n').trim();
}

function stripAiRelatedPostsSection(markdown = '') {
	if (!markdown) return '';
	// AI가 생성한 "함께/같이/이어서/관련/추천/정보... 보면 좋은 글/포스트/링크" 섹션은 제거하고, 후처리로 일관되게 재삽입한다.
	// 제목 기호(#)가 없을 때도 대응하며, 가변적 헤딩, 영문 키워드(Related) 등 대응 강화
	const patterns = [
		// 헤딩이 있는 경우 (더 안전함)
		/(?:^|\n)[#\s]+(?:함께|같이|이어서|관련|추천|정보|참고|보충|더|또|계속)\s*(?:하면|보면|읽어볼|읽어|더)\s*(?:좋은|볼만한|유익한|괜찮은)\s*(?:글|포스트|링크|정보|내용|기사|아티클)[\s\S]*?(?=\n[#\s]+|$)/gi,
		// 헤딩이 없더라도 특정 키워드 뭉치로 시작하는 경우 (조금 더 공격적)
		/(?:^|\n)(?:함께|같이|이어서|관련|추천|참고)\s*보면\s*좋은\s*글[\s\S]*?$/gi,
		// 영문 패턴
		/(?:^|\n)[#\s]+(?:Related|More|Interesting|Recommended)\s*(?:Posts|Links|Articles|Readings|Content)[\s\S]*?(?=\n[#\s]+|$)/gi,
		// 고정 키워드 패턴
		/(?:^|\n)[#\s]*(?:관련[ \t]*(?:글|포스팅|링크|포스트)|함께[ \t]*(?:읽기|보기)|추천[ \t]*(?:정보|포스팅)|이전[ \t]*포스팅)[\s\S]*?(?=\n[#\s]+|$)/gi
	];

	let cleaned = String(markdown);
	for (const p of patterns) {
		cleaned = cleaned.replace(p, '\n');
	}
	return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeHashtagTokens(rawHashtags, maxCount = 20) {
	const source = Array.isArray(rawHashtags) ? rawHashtags : [rawHashtags];
	const normalized = [];
	const seen = new Set();

	for (const item of source) {
		if (item === null || item === undefined) continue;
		const tokens = String(item).split(/[\s,]+/);
		for (const tokenRaw of tokens) {
			const token = String(tokenRaw || '')
				.trim()
				.replace(/^[#＃]+/, '')
				.replace(/^[^0-9A-Za-z가-힣_]+/, '')
				.replace(/[^0-9A-Za-z가-힣_]+$/, '');
			if (!token) continue;
			const key = token.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			normalized.push(token);
			if (normalized.length >= maxCount) return normalized;
		}
	}

	return normalized;
}




const Core = {
	buildRelatedPostsSectionMarkdown,
	stripAiRelatedPostsSection,
	dismissEditorPopups,
	waitForBlogEditorReady,

	/**
	 * 텔레그램 자연어 요청 파싱 (Phase 2)
	 * @param {string} messageText 사용자 메시지 원문
	 * @returns {Promise<Object>} 파싱된 JSON 객체
	 */
	parseTelegramRequest: async function (messageText, context = null) {
		const prompt = `당신은 블로그 자동화 시스템의 모든 것을 관리하는 전지전능한 '유니버설 에이전트'입니다.
사용자가 보낸 자연어 메시지를 분석하여 의도(intent)를 분류하고 필요한 파라미터를 JSON 형태로 추출하세요.

[Capability (능력) 분류 규칙]
사용자의 의도를 분석하여 실행할 행동(Action)들의 조합을 배열(Array)로 구성하세요.
1. register_topic: 새로운 글감을 대기열(시트)에 등록합니다. (예: "~에 대해 글 써줘", "주제 추가해줘")
2. publish_article: 특정 플랫폼으로 글 발행 프로세스를 시작합니다. (예: "지금 네이버에 발행해", "등록하고 바로 발행까지 해줘")
3. update_config: 시스템 설정을 변경합니다. (예: "발행 주기를 20분으로 바꿔줘", "이미지 생성 꺼줘")
4. run_job: 특정 백그라운드 작업을 실행합니다. (예: "트렌드 지금 수집해줘", "RSS 수집 시작해")
5. query_data: 데이터 요약, 통계, 로그 등을 조회합니다. (예: "지금 대기 중인 글은?", "나에 대해 요약해줘")

[Action 파라미터 추출 규칙]
- 각 Capability에 맞는 params 객체를 구성하세요.
1. register_topic 파라미터:
   - theme(문자열), keywords(배열), platforms(배열) 필수/선택 확보.
   - options 내부: schedule_date, instruction, reference_urls, category, post_status, image_gen, external_reference.
   - **[중요]** 플랫폼별 카테고리 지정 시(예: "네이버는 A, 워드는 B"), 'naver_category', 'wordpress_category'로 분리.
2. publish_article 파라미터:
   - target: "all" 또는 특정 플랫폼 ("naver", "wordpress"). (단순히 "발행"만 언급 시 빈 객체도 가능)
3. update_config 파라미터 (config_updates 객체 구성):
   - PUBLISH_AUTO_INTERVAL_MIN, PUBLISH_AUTO_ENABLED, PUBLISH_AUTO_HEADLESS, image_gen, NAVER_ID, TYPING_SPEED 등.
4. run_job 파라미터:
   - job_name: "trends", "rss", "shopping" 등.
5. query_data 파라미터:
   - query_type: ("status", "logs", "topics", "shopping", "stats", "insight")
   - query_params: 조회 필터 (예: {"category": "기술", "limit": 5})

[조합 및 추론 핵심 지침]
- **액션의 분리**: 사용자가 "저장만 해줘", "등록하고 발행은 미뤄" 라고 하면 'register_topic' 한 개만 반환하세요.
- **동시 처리**: 사용자가 "네이버에 테슬라 글 발행해" 라고 하면, 대기열에 없으므로 'register_topic' + 'publish_article' 2개의 액션을 순서대로 반환해야 합니다.
- **메타 데이터**: 어떤 파라미터를 사용자가 '직접' 명시했는지 'meta'의 'explicit_params' 배열에 기록하세요.

[대화 맥락 (Context)]
${(() => {
				let contextStr = '';
				if (context) {
					if (context.user_insight) {
						contextStr += `* 사용자 성향 인사이트: "${context.user_insight}"\n`;
					}
					if (context.last_topic) {
						contextStr += `* 직전 발행 주제: "${context.last_topic}"\n`;
					}
					if (context.history && context.history.length > 0) {
						contextStr += `* 최근 대화 기록:\n`;
						context.history.reverse().forEach(h => {
							contextStr += `  - [${h.intent}] ${h.text}\n`;
						});
					}
				}
				return contextStr || '이전 대화 정보가 없습니다.';
			})()}

[지침]
- 현재 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (KST)
- 사용자의 모든 특수 요청(예: "이번만 카테고리 없이 저장만")은 PUBLISH 인텐트의 options.instruction에 상세히 담으세요.
- 멀티 플랫폼 카테고리 예시: "네이버는 '기술', 워드프레스는 'Tech'로 해줘" -> options: { naver_category: "기술", wordpress_category: "Tech" }
- 의도가 불분명할 경우 가장 근접한 인텐트를 선택하고, 파라미터가 없으면 빈 객체 {}를 반환하세요.

[사용자 메시지]
${messageText}

[출력 형식]
{
  "actions": [
    {
      "action": "register_topic | publish_article | update_config | run_job | query_data",
      "params": { ... 추출된 파라미터 ... }
    }
  ],
  "meta": { "explicit_params": ["image_gen", "category", ...] }
}`;

		Logger.info("🧠 [Core] 텔레그램 메시지 AI 분석 요청 중...");
		const rawResult = await Utils.callTelegramChatModel(prompt);
		if (!rawResult) throw new Error("AI 응답이 비어있습니다.");

		try {
			const jsonString = rawResult.replace(/```json/gi, '').replace(/```/g, '').trim();
			const parsed = JSON.parse(jsonString);
			Logger.debug("✅ [Core] 텔레그램 메시지 해석 완료: " + JSON.stringify(parsed));
			return parsed;
		} catch (e) {
			Logger.error("❌ [Core] 텔레그램 메시지 AI 파싱(JSON) 실패: " + e.message + "\\n원문 응답: " + rawResult);
			throw new Error("메시지를 정확히 해석하지 못했습니다. (JSON 변환 실패)");
		}
	},
	/**
	 * 간단한 AI 인사이트 생성 (Agent memory model 활용)
	 */
	generateSimpleInsight: async function (prompt) {
		const Utils = require('./utils');
		Logger.info("🧠 [Core] Agent memory 인사이트 분석 요청 중...");
		const result = await Utils.callAgentMemoryModel(prompt);
		return (result || '').trim();
	},
	/**
	 * 1. 콘텐츠 생성 (Generate)
	 */
	generateContent: async function (jobData, customDir = null, runtimeOptions = {}) {
		Logger.info("🚀 [Core] 콘텐츠 생성 프로세스 시작");

		const hasSubject = !!jobData.subject;
		const hasKeywords = jobData.keywords && jobData.keywords.length > 0;
		const hasInstructions = jobData.content_guide?.additional_instructions;
		const hasRef = jobData.content_guide?.reference_urls && jobData.content_guide.reference_urls.length > 0;
		const useExternalRef = jobData.use_external_ref === true;

		// 📋 요청 파라미터 요약 로그 (디버깅용)
		Logger.info("┌─────────────────────────────────────────");
		Logger.info(`│ 📌 주제       : ${jobData.subject || '(없음)'}`);
		Logger.info(`│ 🏷️  키워드     : ${hasKeywords ? jobData.keywords.join(', ') : '(없음)'}`);
		Logger.info(`│ 🔗 참고 URL   : ${hasRef ? jobData.content_guide.reference_urls.join(', ') : '(없음)'}`);
		Logger.info(`│ 🌐 외부 참고  : ${useExternalRef ? '✅ 예' : '❌ 아니오'}`);
		Logger.info(`│ 🖼️  이미지 생성: ${jobData.image_options?.generate !== false ? '✅ 예' : '❌ 아니오'}`);
		Logger.info(`│ 📤 발행 옵션  : ${jobData.post_status || runtimeOptions.postStatus || '임시저장'}`);
		Logger.info("└─────────────────────────────────────────");

		if (!hasSubject && !hasKeywords && !hasRef && !hasInstructions) {
			throw new Error("❌ [Error] 주제, 키워드, 지시사항, URL 중 적어도 하나는 필요합니다.");
		}

		// 1) 외부 참고 블로그 인기글 수집 (use_external_ref === true일 때)
		let scrapedContext = "";
		let refSourceCount = 0;
		const scrapedTitles = [];

		if (useExternalRef) {
			// 검색 키워드 결정: keywords 중 첫번째 또는 subject
			const searchKeyword = (hasKeywords ? jobData.keywords[0] : jobData.subject) || '';
			if (searchKeyword) {
				Logger.info(`🔍 [외부 참고] 인기글 수집 및 분석 시작: '${searchKeyword}'`);
				const relatedPosts = await Utils.fetchNaverBlogTopPosts(searchKeyword);

				for (let i = 0; i < relatedPosts.length; i++) {
					const post = relatedPosts[i];
					const text = await Utils.fetchReferenceContent(post.link);
					if (text) {
						refSourceCount++;
						scrapedContext += `\n[인기 참고글 ${refSourceCount} - ${post.title}]:\n${text}\n`;

						const rawTitle = String(post.title || '').replace(/\s+/g, ' ').trim();
						const previewTitle = rawTitle.length > 7 ? rawTitle.slice(0, 7) + '...' : rawTitle;
						scrapedTitles.push(` - ${previewTitle}`);
					}
					await Utils.sleep(1000);
				}
				Logger.info(`🔍 [외부 참고] 인기글 스크래핑 완료: ${refSourceCount}건 성공`);
				if (scrapedTitles.length > 0) {
					scrapedTitles.forEach(t => Logger.info(t));
				}
			}
		}

		// 2) 수동 참고 URL 스크래핑 (기존 로직 유지)
		if (hasRef) {
			const refUrls = jobData.content_guide.reference_urls;
			Logger.info(`📚 수동 참고 자료(${refUrls.length}개) 분석 중...`);
			for (let i = 0; i < refUrls.length; i++) {
				const url = refUrls[i];
				// 네이버 블로그 URL이면 모바일 변환
				const convertedUrl = Utils.convertToMobileNaverBlogUrl(url);
				Logger.info(`   🔗 [참고 자료] URL 분석 중 (${i + 1}/${refUrls.length}): ${convertedUrl}`);
				const text = await Utils.fetchReferenceContent(convertedUrl);
				if (text) {
					refSourceCount++;
					scrapedContext += `\n[수동 참고글 ${refSourceCount} - ${convertedUrl}]:\n${text}\n`;
				}
				await Utils.sleep(1000);
			}
		}

		// 3) 프롬프트 로딩 (Priority: Config > Constants)
		const promptPath = CONFIG.BLOG_PROMPT_PATH || Constants.PROMPT_FILE;
		if (!promptPath || !fs.existsSync(promptPath)) {
			throw new Error(`시스템 프롬프트 파일이 없습니다: ${promptPath}`);
		}
		const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

		// 4) 참고 컨텍스트 구성
		let referenceSection = "(No reference provided)";
		if (scrapedContext) {
			referenceSection = `아래는 해당 주제와 관련된 참고 블로그 글의 내용입니다.
이 자료는 문장을 베끼기 위한 원문이 아니라, 사실관계와 핵심 논지를 추출하기 위한 참고 컨텍스트입니다.
이 글들의 핵심 인사이트, 정보, 관점을 참고하여 독창적인 글을 작성하세요.
단, 원문을 그대로 복사하지 말고, 여러 글의 정보를 종합하여 새로운 시각과 가치를 제공하는 글을 작성하세요.
특히 다음 규칙을 반드시 지키세요.
- 원문 문장, 문단 순서, 표현을 거의 그대로 옮기지 마세요.
- 먼저 내용을 충분히 이해한 뒤, 한국어로 자연스럽고 새롭게 재구성해서 다시 쓰세요.
- 외국어 기사인 경우 직역투를 피하고, 한국 독자가 읽기 쉬운 문장으로 정확하게 풀어쓰세요.
- 참고자료에 있는 중요한 배경, 변화점, 수치, 사례, 비교 포인트, 주의사항이 있다면 빠뜨리지 말고 본문에 녹여 쓰세요.
- 내용이 풍부한 원문이라면 글도 충분히 풍성해야 합니다. 핵심 디테일이 빠진 얕은 요약문처럼 쓰지 마세요.
- 단순 줄거리 요약이 아니라, 핵심 주장과 맥락이 살아 있는 해설형 글처럼 재서술하세요.
${scrapedContext}`;
		}

		const userPrompt = `
				 [INPUT DATA]
				 - Subject: ${jobData.subject || "(Context에 기반해 멋진 제목을 지어주세요)"}
			 - Keywords: ${jobData.keywords?.join(', ') || "(핵심 키워드 5개를 추출해주세요)"}
			 - Instructions: ${jobData.content_guide?.additional_instructions || "None"}
			 [REFERENCE CONTEXT]
				 ${referenceSection}
			 `;

		// 3) Gemini 호출
		Logger.info("📝 AI에게 글 작성을 요청합니다...");
		const rawResult = await Utils.callGeminiText(systemPrompt + '\n' + userPrompt);
		if (!rawResult) throw new Error("API 응답이 비어있습니다.");

		// 4) JSON 파싱
		let parsedData;
		try {
			const jsonString = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
			parsedData = JSON.parse(jsonString);
		} catch (e) {
			// 🔧 [Fixed] 디버깅을 위해 원본 AI 응답 로깅
			const preview = rawResult.substring(0, 500);
			Logger.error(`❌ JSON 파싱 실패. 원본 응답 (처음 500자):\n${preview}...`);
			throw new Error(`JSON 파싱 에러: ${e.message}. AI 응답이 올바른 JSON 형식이 아닙니다.`);
		}

		const finalSubject = parsedData.title || parsedData.subject || jobData.subject || "제목 없음";
		const finalContent = parsedData.content || "";
		const finalHashtags = normalizeHashtagTokens(parsedData.hashtags || [], 20);
		// 5) 관련 글 수집 및 생성 (Platform에 따른 하이브리드 지원)
		const enableRelatedPostsAutoLink = runtimeOptions.enableRelatedPostsAutoLink !== false;
		const platform = String(runtimeOptions.platform || 'naver').toLowerCase();
		let relatedPostsMarkdown = "";

		if (enableRelatedPostsAutoLink) {
			if (platform === 'wordpress') {
				Logger.info("🔎 [WordPress] 하이브리드 관련 글 수집 중...");
				try {
					const wpRandomPosts = await Utils.fetchWordPressRandomPosts(CONFIG.WORDPRESS_URL, 2);
					const naverRandomPosts = await Utils.fetchOwnBlogRandomPosts(2);
					const combinedPosts = Utils._shuffleArray([...wpRandomPosts, ...naverRandomPosts]).slice(0, 3);

					if (combinedPosts.length > 0) {
						relatedPostsMarkdown = Utils.generateRelatedPostsMarkdown(combinedPosts);
						Logger.info(`🔗 [WordPress] 관련 글 ${combinedPosts.length}개 자동 생성 완료`);
					}
				} catch (e) {
					Logger.error(`⚠️ [WordPress] 관련 글 수집 중 오류: ${e.message}`);
				}
			} else {
				Logger.info("🔎 [Blog] 네이버 관련 글 자동 수집 중...");
				const relatedPosts = await Utils.fetchOwnBlogRandomPosts(3);
				if (relatedPosts.length > 0) {
					const relatedHeading = Utils.pickRelatedPostsHeading();
					relatedPostsMarkdown = "\n\n" + Core.buildRelatedPostsSectionMarkdown(relatedPosts, relatedHeading, true);
					Logger.info(`🔗 [Blog] 관련 글 자동 수집 완료 (${relatedPosts.length}건)`);
				} else {
					Logger.info("ℹ️ [Blog] 관련 글 수집 결과 없음");
				}
			}
		} else {
			Logger.info("ℹ️ [Core] 관련 글 자동 링크 기능 비활성화");
		}

		// 5) 결과 저장
		let targetDir;
		const safeSubject = Utils.sanitizeFileName(String(finalSubject));
		if (customDir) {
			targetDir = path.resolve(customDir);
		} else {
			const wsDir = Utils.resolvePlatformWorkspaceDir(runtimeOptions.platform);
			const timestamp = moment().tz('Asia/Seoul').format('YYYYMMDD_HHmmss');
			targetDir = path.join(wsDir, `${timestamp}_${safeSubject}`);
		}

		if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

		let pureContent = finalContent.replace(/^#\s+.+\n?/, "").trim();
		pureContent = Core.stripAiRelatedPostsSection(pureContent);

		const hashtagLine = finalHashtags.length > 0 ? "\n\n\n" + finalHashtags.map(tag => `#${tag}`).join(' ') : "";

		// [위치 조정] 관련 글 섹션은 해시태그 "위"에 배치
		const fullFileContent = `# ${finalSubject}\n${pureContent}${relatedPostsMarkdown}${hashtagLine}`;

		fs.writeFileSync(path.join(targetDir, 'contents.md'), fullFileContent, 'utf-8');
		return { targetDir, finalSubject };
	},

	/**
	 * 2. 이미지 준비 (Prepare)
	 */
	prepareImages: async function (dirPath, jobData, runtimeOptions = {}) {
		if (runtimeOptions.imageGenerationEnabled === false) {
			Logger.info("🖼️ 이미지 생성 기능이 플랜 정책으로 비활성화되어 건너뜁니다.");
			return;
		}
		if (jobData.image_options?.generate === false) {
			Logger.info("🖼️ 이미지 생성 옵션이 false입니다. 가이드만 유지합니다.");
			return;
		}
		const contentFile = path.join(dirPath, 'contents.md');
		if (!fs.existsSync(contentFile)) return;

		const { contents } = Utils.parseMarkdown(fs.readFileSync(contentFile, 'utf-8'));
		let lastCall = 0;

		for (const item of contents) {
			if (item.type !== 'image') continue;

			const prefix = String(item.index).padStart(2, '0');
			const now = Date.now();
			if (lastCall > 0 && (now - lastCall) < 1000) await Utils.sleep(1000);

			Logger.info(`   🎨 이미지 생성 중 (Index ${item.index})`);

			// Priority: 1.작업파일 > 2.Config > 3.Default
			const style = jobData.image_options?.style || CONFIG.IMAGE_STYLE || 'photorealistic';
			const prompt = `${item.prompt}, ${style}, high quality, no text`;

			try {
				await Utils.callGeminiImage(prompt, path.join(dirPath, `${prefix}_image`));
			} catch (imageErr) {
				Logger.warn(`⚠️ 이미지 생성 실패 (Index ${item.index}): ${imageErr.message}. 백업 프롬프트를 유지하고 다음으로 넘어갑니다.`);
			}
			lastCall = Date.now();
		}
	},

	/**
	* 3. 블로그 발행 (Publish)
	*/
	publishToBlog: async function (dirPath, options = {}) {
		Logger.info(`🚀 [Step 5] 발행 시작: ${path.basename(dirPath)}`);

		const authPath = CONFIG.AUTH_FILE_PATH || Constants.AUTH_FILE_PATH;
		if (!fs.existsSync(authPath)) throw new Error('naver_auth.json 없음');

		const contentFile = path.join(dirPath, 'contents.md');
		if (!fs.existsSync(contentFile)) throw new Error(`콘텐츠 파일 없음: contents.md`);

		const markdownRaw = fs.readFileSync(contentFile, 'utf-8');
		const { title, contents } = Utils.parseMarkdown(markdownRaw);
		const primaryAffiliateUrl = String(options.affiliateUrl || '').trim();
		const requireAffiliateUrl = options.requireAffiliateUrl === true;
		if (requireAffiliateUrl && !/^https?:\/\//i.test(primaryAffiliateUrl)) {
			throw new Error('스프레드시트 URL이 비어있거나 형식이 올바르지 않아 작업을 중단합니다.');
		}

		// Config 우선순위 적용 (Constants 필수)
		const speedKey = String(CONFIG.TYPING_SPEED || 'NORMAL').trim().toUpperCase();
		const typingPreset = Constants.TYPING_PRESETS[speedKey] || Constants.TYPING_PRESETS.NORMAL;

		const viewport = resolvePublishViewport();

		const browser = await BrowserLauncher.launchBrowser({ headless: options.headless });
		const context = await browser.newContext({
			storageState: authPath,
			viewport: viewport,
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		});
		try {
			await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://blog.naver.com' });
			await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://m.blog.naver.com' });
		} catch (e) {
			Logger.warn(`⚠️ 클립보드 권한 사전 부여 실패: ${e.message}`);
		}

		const page = await context.newPage();
		const dialogHandler = async dialog => {
			if (dialog.type() === 'beforeunload') {
				// 사용자의 수동 종료 의사를 존중하여 허용
				await dialog.accept();
			} else {
				await dialog.dismiss();
			}
		};
		page.on('dialog', dialogHandler);

		try {
			Logger.info("   🔄 블로그 에디터 접속 중...");
			const writeUrl = CONFIG.WRITE_URL || `https://blog.naver.com/${CONFIG.NAVER_ID}/postwrite`;
			Logger.info(`   🔗 접속 URL: ${writeUrl}`);
			await page.goto(writeUrl, { waitUntil: 'domcontentloaded' });

			const loadWait = CONFIG.WAIT_LOAD || Constants.WAIT.LOAD;
			await Utils.sleep(loadWait);

			// 🔧 [Fixed] 세션 만료 처리 개선 (더 명확한 안내)
			if (page.url().includes('nid.naver.com') || page.url().includes('login')) {
				Logger.error("🚨 [Critical] 로그인 정보가 만료되었습니다.");
				Logger.info("   💡 해결 방법: 터미널에서 'npm run login' 명령어를 실행하여 다시 로그인하세요.");
				await browser.close();
				throw new Error("Login Session Expired - Please run 'npm run login' to re-authenticate");
			}

			await waitForBlogEditorReady(page, PUBLISH_EDITOR_READY_TIMEOUT_MS);

			// 팝업 제거 (Help / 이전글 로드)
			await this.dismissEditorPopups(page);
			await waitForBlogEditorReady(page, PUBLISH_EDITOR_READY_TIMEOUT_MS);
			await Utils.sleep(300);

			// 🔧 [Fixed] 타이핑할 때마다 랜덤 속도 계산 (봇 감지 회피)
			const getRandomTypingDelay = () => {
				return Math.floor(Math.random() * (typingPreset.MAX - typingPreset.MIN + 1)) + typingPreset.MIN;
			};

			// ✍️ 제목 입력
			Logger.info(`   ✍️ 제목 입력: ${title}`);
			await inputBlogTitleWithVerification(page, title, getRandomTypingDelay);

			// ✍️ 카테고리 설정
			const requestedCategory = String(options.category || '').trim();
			if (requestedCategory) {
				Logger.info(`   📁 카테고리 설정 예약: ${requestedCategory}`);
				// 발행 팝업에서 처리하므로 여기서는 로깅만 수행
			}

			// 🔧 [Fixed] 디렉토리 스캔 최적화 (한 번만 스캔)
			const allFiles = fs.readdirSync(dirPath);

			// ✍️ 본문 입력 루프
			let inListMode = false;
			let currentListType = null;
			let needsExtraGapAfterList = false;
			let isFirstBodyBlock = true;
			let representativeImageSet = false;
			let representativeAttemptCount = 0;
			const representativeMaxAttempts = 3;
			let hasImageWarnings = false;
			if (options.imageGeneration === false) {
				hasImageWarnings = true;
			}

			for (const item of contents) {
				if (item.type !== 'image') {
					await this.dismissEditorPopups(page);
					await closeVisibleOglinkPopup(page);
					if (!inListMode) {
						// 첫 본문 블록은 제목 Enter 직후 위치를 그대로 사용한다.
						// (초기 빈 줄 생성 방지)
						if (!isFirstBodyBlock) {
							const movedToEnd = await placeCaretAtDocumentEnd(page, { skipRangeSelection: true });
							if (!movedToEnd) {
								await focusEditorTypingArea(page);
							}
							const escapedQuote = await ensureCaretOutsideQuoteBlock(page, 3);
							if (!escapedQuote) {
								Logger.warn('       ⚠️ 커서가 인용구 블록에 남아있을 수 있습니다.');
							}
						}
						// 소제목/인용구 처리 후 남은 텍스트 선택(range)으로 다음 입력이 덮어쓰이는 현상 방지
						await collapseEditorSelectionToCaretEnd(page);
					}
				}
				if (item.type !== 'list-item' && inListMode) {
					// 에디터 자동 리스트 종료: 빈 항목 Enter 한 번으로 리스트 모드를 해제한다.
					await page.keyboard.press('Enter');
					// 리스트 뒤 문단/빈줄은 한 줄 공백이 보이도록 다음 블록에서 Enter 1회를 추가한다.
					needsExtraGapAfterList = (item.type === 'paragraph' || item.type === 'newline' || item.type === 'quote');
					inListMode = false;
					currentListType = null;
				}
				if (needsExtraGapAfterList && item.type !== 'paragraph' && item.type !== 'newline' && item.type !== 'quote') {
					needsExtraGapAfterList = false;
				}

				if (item.type === 'header-h2') {
					// 📌 수동 편집 플로우와 동일하게 처리:
					// 텍스트 입력 -> 소제목 적용 -> Enter 1회
					Logger.info(`       📌 소제목: ${item.text}`);
					await placeCaretAtDocumentEnd(page, { skipRangeSelection: true });
					await ensureCaretOutsideQuoteBlock(page, 3);
					await page.keyboard.type(item.text, { delay: getRandomTypingDelay() });
					await Utils.sleep(300);
					const subtitleApplied = await applyTextFormatAtCursor(page, '소제목', { strict: true });
					if (!subtitleApplied) {
						Logger.warn(`       ⚠️ 소제목 서식 적용 실패: ${item.text}`);
					}
					// 툴바 적용 후 남는 선택 상태를 키 이동으로 확실히 해제한다.
					try { await page.keyboard.press('ArrowRight'); } catch (e) { }
					await collapseEditorSelectionToCaretEnd(page);
					await Utils.sleep(80);
					await page.keyboard.press('Enter'); // 다음 줄(본문)로 이동
				}
				else if (item.type === 'quote') {
					const quoteText = String(item.text || '').trim();
					if (quoteText) {
						Logger.info(`       💬 인용구: ${quoteText}`);
						if (needsExtraGapAfterList) {
							await page.keyboard.press('Enter');
						}
						needsExtraGapAfterList = false;

						await placeCaretAtDocumentEnd(page, { skipRangeSelection: true });
						await page.keyboard.type(quoteText, { delay: getRandomTypingDelay() });
						await Utils.sleep(260);

						let quoteApplied = await applyTextFormatAtCursor(page, '인용구', { strict: true });
						if (!quoteApplied) {
							// 간헐적으로 커서 기준 적용이 누락되면 현재 문단 선택 후 1회 복구 재시도
							const selected = await selectCurrentParagraphContents(page);
							if (selected) {
								quoteApplied = await applyTextFormatAtCursor(page, '인용구', { strict: true });
								if (quoteApplied) {
									Logger.info(`       ✅ 인용구 서식 복구 성공: ${quoteText}`);
								}
							}
						}
						if (!quoteApplied) {
							Logger.warn(`       ⚠️ 인용구 서식 적용 실패: ${quoteText}`);
						}

						// 인용구 적용 직후에는 사용자 수동 편집과 동일하게 탈출한다.
						// (커서 유지 -> ArrowDown x2)
						await Utils.sleep(100);
						const escapedByUserFlow = await escapeQuoteBlockByUserFlow(page, 3);
						if (!escapedByUserFlow) {
							// 실패 시에만 문서 끝 기준 강제 탈출 fallback
							const movedToBottom = await placeCaretAtDocumentEnd(page, { skipRangeSelection: true });
							if (!movedToBottom) {
								await focusEditorTypingArea(page);
							}
							await ensureCaretOutsideQuoteBlock(page, 4, { allowEnter: false });
						}
						await collapseEditorSelectionToCaretEnd(page);
					}
				}
				else if (item.type === 'list-item') {
					const listType = item.listType === 'ordered' ? 'ordered' : 'unordered';
					const listText = String(item.text || '')
						.replace(/^(?:[-*]\s+|\d+[.)]\s+)/, '')
						.trim();
					if (!listText) {
						await page.keyboard.press('Enter');
						inListMode = false;
						currentListType = null;
					} else {
						// 리스트 종류가 바뀌면 기존 자동 리스트를 종료한 뒤 새 리스트를 시작한다.
						if (inListMode && currentListType !== listType) {
							await page.keyboard.press('Enter');
							inListMode = false;
							currentListType = null;
						}

						// 첫 항목만 마커를 입력하고, 이후 항목은 에디터 자동 마커를 사용한다.
						const textToType = inListMode
							? listText
							: (listType === 'ordered' ? `1. ${listText}` : `- ${listText}`);
						await page.keyboard.type(textToType, { delay: getRandomTypingDelay() });
						if (textToType.includes('http')) await page.keyboard.press('Space');
						await page.keyboard.press('Enter');
						inListMode = true;
						currentListType = listType;
					}
				}
				else if (item.type === 'paragraph') {
					const paragraphText = String(item.text || '');
					if (needsExtraGapAfterList && paragraphText.trim()) {
						await page.keyboard.press('Enter');
					}
					needsExtraGapAfterList = false;
					let ogLinkInserted = false;
					if (isUrlOnlyParagraph(paragraphText)) {
						ogLinkInserted = await insertOglinkCardAtCursor(page, paragraphText.trim());
						if (ogLinkInserted) {
							Logger.info(`       🔗 링크 카드 삽입: ${paragraphText.trim()}`);
						} else {
							await closeVisibleOglinkPopup(page);
							const movedToEnd = await placeCaretAtDocumentEnd(page);
							if (!movedToEnd) {
								await focusEditorTypingArea(page);
							}
							Logger.warn(`       ⚠️ 링크 카드 삽입 실패(일반 URL 텍스트로 대체): ${paragraphText.trim()}`);
							await page.keyboard.type(paragraphText, { delay: getRandomTypingDelay() });
							await page.keyboard.press('Space');
						}
					} else {
						await page.keyboard.type(paragraphText, { delay: getRandomTypingDelay() });
						if (paragraphText.includes('http')) await page.keyboard.press('Space');
					}

					// 링크 카드가 삽입된 경우 에디터가 자동으로 다음 줄로 넘어가므로 추가 Enter를 생략한다.
					if (!ogLinkInserted) {
						await page.keyboard.press('Enter');
					}
				}
				else if (item.type === 'newline') {
					needsExtraGapAfterList = false;
					await page.keyboard.press('Enter');
				}
				else if (item.type === 'image') {
					await this.dismissEditorPopups(page);
					const file = Utils.findImageByPrefix(dirPath, item.index);

					if (file) {
						const fileNameOnly = path.basename(file);
						Logger.info(`       🖼️ 이미지 업로드: ${fileNameOnly}`);
						const fileChooserPromise = page.waitForEvent('filechooser');
						const photoBtn = page.locator('button.se-image-toolbar-button, button:has-text("사진")').first();

						if (await photoBtn.isVisible()) {
							const imageCountBefore = await getEditorImageCount(page);
							await photoBtn.click();
							const chooser = await fileChooserPromise;
							const ImageService = require('./image-service');
							const optimizedFile = await ImageService.optimizeImageForPlatform(file, 'naver');
							await chooser.setFiles(optimizedFile);

							const uploadWait = CONFIG.WAIT_UPLOAD || Constants.WAIT.UPLOAD;
							await Utils.sleep(uploadWait);

							// 큰 이미지 업로드 시 렌더 반영이 느릴 수 있어 슬롯 증가와 포커스를 재시도한다.
							const appeared = await waitForNewImageSlot(page, imageCountBefore, 4500);
							const imageFocused = await focusLatestEditorImageWithRetry(page, appeared ? 10 : 14, 220);
							if (!imageFocused) {
								Logger.warn('       ⚠️ 방금 업로드한 이미지를 포커스하지 못했습니다.');
							}

							// 가운데 정렬은 공정위/CTA 이미지만 시도한다. (일반 상품 이미지는 스킵)
							const shouldTryCenterAlign =
								/_ftc_disclosure/i.test(file) ||
								/_cta_image/i.test(file);
							const centered = (imageFocused && shouldTryCenterAlign)
								? await centerAlignFocusedImage(page)
								: false;
							if (centered) {
								Logger.info("       ↔️ 이미지 가운데 정렬 적용");
							} else if (imageFocused && shouldTryCenterAlign) {
								Logger.warn("       ⚠️ 이미지 가운데 정렬 버튼을 찾지 못했습니다.");
							}

							// 대표 이미지는 공정위/CTA 이미지를 제외한 첫 일반 이미지로 지정한다.
							const shouldSetRepresentative =
								imageFocused &&
								!representativeImageSet &&
								representativeAttemptCount < representativeMaxAttempts &&
								!/_ftc_disclosure/i.test(file) &&
								!/_cta_image/i.test(file);
							if (shouldSetRepresentative) {
								representativeAttemptCount++;
								const repSet = await setFocusedImageAsRepresentative(page);
								if (repSet) {
									representativeImageSet = true;
									Logger.info("       🏷️ 대표 이미지 지정 완료");
								} else if (representativeAttemptCount >= representativeMaxAttempts) {
									Logger.warn("       ⚠️ 대표 이미지 버튼을 찾지 못했습니다.");
								} else {
									Logger.info("       ℹ️ 대표 이미지 지정 재시도 예정");
								}
							}

							// CTA 이미지는 클릭 시 제휴 URL로 이동하도록 링크를 건다.
							if (
								imageFocused &&
								/_cta_image\.(png|jpg|jpeg|webp)$/i.test(file) &&
								/^https?:\/\//i.test(primaryAffiliateUrl)
							) {
								const linked = await applyLinkToFocusedImage(page, primaryAffiliateUrl);
								if (linked) {
									Logger.info(`       🔗 CTA 이미지 링크 적용: ${primaryAffiliateUrl}`);
								} else {
									Logger.warn("       ⚠️ CTA 이미지 링크 버튼을 찾지 못했습니다.");
								}
							}

							// 사람이 편집하는 흐름과 동일하게 이미지 업로드 후
							// Enter 1회만 입력하여 다음 본문 입력 위치로 이동한다.
							// 추가 줄바꿈은 contents.md의 newline 블록을 그대로 따른다.
							if (imageFocused) {
								try {
									await page.keyboard.press('Enter');
									await Utils.sleep(70);
									Logger.info('       ↩️ 이미지 뒤 커서 이동(Enter x1)');
								} catch (e) { }
							}
						}
					} else {
						// 📌 [유지] 이미지 없을 때 원본 마크다운 그대로 입력 (사람 속도로)
						const prefix = String(item.index).padStart(2, '0');
						Logger.warn(`⚠️ 이미지 파일을 찾을 수 없습니다: ${prefix}_*.(png|jpg|jpeg|webp)`);
						Logger.info(`       📝 이미지 블록(원본) 입력 (Index ${item.index})`);
						const rawBlock = `[[IMAGE_${item.index}\ntitle: ${item.text}\nprompt: ${item.prompt}\n]]`;
						await page.keyboard.type(rawBlock, { delay: getRandomTypingDelay() });
						await page.keyboard.press('Enter');
						hasImageWarnings = true;
					}
				}

				if (item.type !== 'image' && isFirstBodyBlock) {
					isFirstBodyBlock = false;
				}
				await Utils.sleep(50);
			}

			Logger.info("   ✅ 본문 작성 완료");

			// 💾 [Safeguard] 이미지 누락/미생성 시 Draft 강제 전환
			if (hasImageWarnings && options.postStatus !== 'draft') {
				Logger.info("ℹ️ [Naver] 이미지 누락/미생성으로 인해 Draft(저장) 모드로 자동 전환합니다.");
				options.postStatus = 'draft';
			}

			// [REMOVED] early draft saving exit to ensure we always reach the publish modal for category setting

			// 💾 임시 저장 (안전을 위해 공통 시도)
			try {
				Logger.info("   💾 안전을 위해 임시저장을 시도합니다...");
				const saveBtn = page.locator('button.se-save-button, button:has-text("저장")').first();
				if (await saveBtn.isVisible()) {
					await saveBtn.click();
					await Utils.sleep(2000);
					Logger.info("   ✅ 임시저장 완료");

					// [REMOVED] redundant draft check to allow proceeding to publish modal
				}
			} catch (e) {
				Logger.warn("   ⚠️ 임시저장 버튼을 찾지 못해 건너뜁니다");
			}

			// 팝업/도움말 패널 닫기 (클릭 방해 방지)
			try {
				const dismissSelectors = [
					'.se-help-panel-close-button',
					'.se-popup-button-cancel',
					'.se-help-panel-close',
					'button:has-text("닫기")'
				];
				for (const sel of dismissSelectors) {
					const btn = page.locator(sel).first();
					if (await btn.count() > 0 && await btn.isVisible()) {
						await btn.click();
						await Utils.sleep(500);
					}
				}
			} catch (e) { }

			// 🚀 [발행] 버튼 클릭 (설정창 오픈 - 에디터 상단 버튼)
			let publishBtnClicked = false;
			const topPublishBtnSelectors = [
				'button[class*="publish_btn"]', // 해시값이 변경될 수 있으므로 부분 일치 사용
				'button.se-publish-button',   // 네이버 이전 기본 클래스
				'header button:has-text("발행")', // 명시적인 header 태그 내부
				'[class*="header"] button:has-text("발행")', // 헤더 래퍼 내부
				'button:has-text("발행")' // 최후의 수단 (예약 발행 등이 잘못 눌릴 위험 대비 텍스트 필터링 필수)
			];

			for (const selector of topPublishBtnSelectors) {
				const btns = page.locator(selector);
				const count = await btns.count();
				for (let i = 0; i < count; i++) {
					const btn = btns.nth(i);
					if (await btn.isVisible()) {
						const text = (await btn.innerText()).trim();
						// '예약 발행'이 아닌 정확히 '발행'만 포함하거나 매칭되는지 확인
						if (text === '발행' || (text.includes('발행') && !text.includes('예약'))) {
							await btn.click();
							Logger.info(`   🚀 [설정 열기] 상단 '발행' 버튼 클릭 성공 (${selector})`);
							publishBtnClicked = true;
							break;
						}
					}
				}
				if (publishBtnClicked) break;
			}

			if (publishBtnClicked) {
				// 🕒 설정 레이어가 완전히 뜰 때까지 대기
				let settingsLayerOpened = false;
				try {
					// 🔧 [Updated] 더 강력한 셀렉터 조합 (클래스 + 텍스트 + 최종 버튼)
					const layerSelector = [
						'.se-publish-setting-panel',
						'.se-publish-setting-layer',
						'.se-publish-setting-container',
						'[class*="publish_setting"]',
						'[class*="SettingPanel"]',
						'button.confirm_btn__WEaBq', // 최종 발행 버튼 (스크린샷 확인됨)
						'xpath=//h3[contains(text(), "카테고리")]',
						'xpath=//label[contains(text(), "카테고리")]'
					].join(', ');

					Logger.info("   🕒 발행 설정창 대기 중...");
					try {
						await page.waitForSelector(layerSelector, { timeout: 15000, state: 'attached' });
						settingsLayerOpened = true;
					} catch (e) {
						// ⚠️ [Fallback] 클래스로 못 찾더라도 화면에 '카테고리' 텍스트나 특정 버튼이 보이면 진행 시도
						const hasCategoryLabel = await page.locator('text="카테고리"').count() > 0;
						const hasFinalBtn = await page.locator('button.confirm_btn__WEaBq').count() > 0;
						if (hasCategoryLabel || hasFinalBtn) {
							Logger.info("   ℹ️ 클래스 감지에는 실패했으나 화면상에서 설정 요소가 확인되어 계속 진행합니다.");
							settingsLayerOpened = true;
						} else {
							throw e;
						}
					}

					if (settingsLayerOpened) {
						await Utils.sleep(2000);
					}
				} catch (e) {
					Logger.error("   ❌ [오류] 발행 설정창이 제한 시간 내에 나타나지 않았습니다. 발행을 중단합니다.");
					// 디버깅을 위해 현재 페이지의 일부 텍스트 로그 출력
					try {
						const bodyText = (await page.innerText('body')).slice(0, 500).replace(/\n/g, ' ');
						Logger.info(`   🔍 현재 페이지 텍스트 요약: ${bodyText}...`);
					} catch (err) { }
					return { success: false, message: 'Publish settings panel failed to open' };
				}

				// 📂 1단계: 카테고리 설정
				let hasCategoryError = false;
				if (requestedCategory) {
					const categorySuccess = await this.selectNaverBlogCategory(page, requestedCategory);
					if (!categorySuccess) {
						Logger.warn("   ⚠️ 카테고리 설정에 실패하여 발행을 중단하고 임시저장으로 전환합니다.");
						hasCategoryError = true;
					}
				} else {
					Logger.info("   📂 카테고리 미지정: 네이버 기본 설정 카테고리로 발행을 진행합니다.");
				}

				// ⏰ 2단계: 예약 발행 설정
				if (!hasCategoryError && options.postStatus === 'schedule') {
					await this.setNaverBlogSchedule(page, options.scheduleDate);
				}

				// 🚀 3단계: 최종 발행 또는 에러 시 상시 저장 처리
				if (hasCategoryError) {
					// 설정창 닫기 (다시 에디터로 돌아가서 저장하기 위함)
					try {
						Logger.info("      🚪 설정창 닫기 시도...");
						await page.keyboard.press('Escape');
						await Utils.sleep(1000);
					} catch (e) { }

					// Draft 모드로 강제 전환하여 아래 로직에서 저장 처리되게 함
					options.postStatus = 'draft';
					// 여기서 바로 저장 로직을 타기 위해 루프를 타거나 return 하지 않고 흐름을 계속하게 하되, 발행 버튼 클릭은 건너뜀
				}

				const finalPublishBtnSelectors = [
					'button.confirm_btn__WEaBq',
					'button[data-testid="seOnePublishBtn"]',
					'.se-publish-submit-button',
					'.se-publish-setting-layer button:has-text("발행")',
					'.se-popup button:has-text("발행")'
				];

				let finalClicked = false;
				const isDraftMode = options.postStatus === 'draft';

				if (!isDraftMode && !hasCategoryError) {
					for (const selector of finalPublishBtnSelectors) {
						const btn = page.locator(selector).first();
						if (await btn.isVisible()) {
							await btn.click();
							Logger.info(`   ✅ [최종 발행] 버튼 클릭 성공 (${selector})`);
							finalClicked = true;
							break;
						}
					}
				} else {
					// Draft 모드이거나 카테고리 설정 오류 발생 시: 설정창 닫고 에디터의 '저장' 클릭
					Logger.info(isDraftMode
						? "   💾 [Draft] 모드이므로 발행 대신 저장 처리를 진행합니다."
						: "   💾 카테고리 설정 실패로 인해 '발행' 대신 '저장' 모드로 실행합니다.");

					try {
						// 1. 설정창 닫기 (Esc)
						await page.keyboard.press('Escape');
						await Utils.sleep(1000);

						// 2. 에디터 상단 '저장' 버튼 클릭
						const saveBtn = page.locator('button.se-save-button, button:has-text("저장")').first();
						if (await saveBtn.isVisible()) {
							await saveBtn.click();
							await Utils.sleep(3000);
							Logger.info("   ✅ 임시저장 완료 (카테고리 설정 포함)");
							return { success: true, message: isDraftMode ? 'Saved as draft' : 'Saved as draft due to category failure' };
						}
					} catch (e) {
						Logger.warn(`   ⚠️ 최종 저장 시도 중 오류: ${e.message}`);
					}
				}

				if (finalClicked) {
					// 🔗 4단계: 발행 완료 후 URL 캡처 (logNo 추출용)
					try {
						await page.waitForURL(url => url.href.includes('logNo=') && !url.href.includes('PostList.naver'), { timeout: 20000 });
						const postUrl = page.url();
						Logger.info(`   📝 [Naver] 발행 완료 확인 (본문 URL): ${postUrl}`);
						await Utils.sleep(2000);
						return { success: true, message: 'Published to Naver Blog', postUrl };
					} catch (e) {
						const fallbackUrl = page.url();
						Logger.warn(`   ⚠️ 발행 완료 후 본문 URL 캡처 실패 (PostList 가능성): ${fallbackUrl}`);
						return { success: true, message: 'Published to Naver Blog (URL capture fallback)', postUrl: fallbackUrl };
					}
				} else {
					Logger.info("   ✅ [Naver] 최종 발행 버튼을 찾지 못했습니다. 설정창만 열린 상태에서 중단합니다.");
					await Utils.sleep(3000);
					return { success: true, message: 'Naver settings window opened' };
				}
			}

			if (!publishBtnClicked) {
				Logger.warn("   ⚠️ [발행] 버튼을 클릭하지 못했습니다. 수동 확인이 필요할 수 있습니다.");
				return { success: false, message: 'Failed to click top publish button' };
			}

		} catch (e) {
			Logger.error(`❌ 에러 발생: ${e.message}`);
			throw e;
		} finally {
			// 🔧 [Fixed] 브라우저 종료 로직 개선 (좀비 프로세스 방지 + 마지막 글 유지 기능)
			const closeDelaySeconds = parseInt(CONFIG.CLOSE_DELAY_SECONDS, 10) || 10;
			const closeDelayMs = closeDelaySeconds * 1000;
			const isHeadless = options.headless === true;
			const isLast = options.isLast === true;

			// 헤드리스 모드가 아니면서 마지막 글인 경우, 사용자가 검토할 수 있도록 브라우저를 닫지 않음
			if (!isHeadless && isLast) {
				// 🔧 [Fixed] 자동화 종료 후 사용자의 수동 브라우저 닫기를 방해하지 않도록 리스너 제거
				if (page) page.off('dialog', dialogHandler);
				Logger.info("   📌 마지막 발행 건이므로 브라우저를 닫지 않고 대기합니다. (이제 수동 종료가 가능합니다)");
				return;
			}

			// CLOSE_DELAY_SECONDS=0 이면 브라우저를 닫지 않고 유지 (모든 건에 대해)
			if (closeDelayMs === 0) {
				Logger.info("   🔒 브라우저를 닫지 않고 유지합니다.");
				return;
			}

			// 비헤드리스 모드(브라우저가 보이는 모드)에서는 사용자가 볼 수 있도록 대기
			if (!isHeadless && closeDelayMs > 0) {
				Logger.info(`   👋 (${closeDelaySeconds}초 뒤 브라우저를 닫습니다...)`);
				await Utils.sleep(closeDelayMs);
			}

			// 모든 경우에 브라우저 닫기 (위의 리턴 조건에 걸리지 않은 경우)
			if (browser) {
				await browser.close();
				Logger.info("   🔒 브라우저 세션 종료");
			}
		}
	},

	/**
	 * WordPress 발행 (Publish)
	 */
	publishToWordPress: async function (dirPath, options = {}) {
		Logger.info(`🚀 [WordPress] 발행 시작: ${path.basename(dirPath)}`);

		const wpClient = new WordPressClient({
			url: CONFIG.WORDPRESS_URL,
			userId: CONFIG.WORDPRESS_USER_ID,
			appPassword: CONFIG.WORDPRESS_APP_PASSWORD
		});

		if (!wpClient.isConfigured()) {
			throw new Error('WordPress 설정이 올바르지 않습니다.');
		}

		const contentFile = path.join(dirPath, 'contents.md');
		if (!fs.existsSync(contentFile)) throw new Error(`콘텐츠 파일 없음: contents.md`);

		const markdownRaw = fs.readFileSync(contentFile, 'utf-8');
		const { title: postTitle, contents: parsedContents } = Utils.parseMarkdown(markdownRaw);

		// 1. 이미지 처리 및 업로드
		const warnings = [];
		let featuredMediaId = null;
		let finalMarkdown = markdownRaw;
		const uploadResults = new Map(); // index -> { id, url, alt }

		// [[IMAGE_N\ntitle: ...\nprompt: ...\n]] 포맷 파싱
		const imageRegex = /\[\[IMAGE_(\d+)\n\s*title:\s*(.+)\n\s*prompt:\s*([\s\S]+?)\n\]\]/g;
		let match;
		const imageBlocks = [];
		while ((match = imageRegex.exec(markdownRaw)) !== null) {
			imageBlocks.push({
				fullTag: match[0],
				index: parseInt(match[1]),
				title: match[2].trim(),
				prompt: match[3].trim()
			});
		}

		Logger.info(`🖼️ [WordPress] 이미지 업로드 프로세스 시작 (총 ${imageBlocks.length}개)`);

		for (const block of imageBlocks) {
			// 🚀 [WordPress Asset Caching] FTC/CTA 이미지인 경우 영구 URL 재사용 확인
			let permanentUrl = null;
			let permanentKey = null;

			const promptUrl = String(block.prompt || '').trim();
			if (promptUrl && promptUrl === String(CONFIG.FTC_DISCLOSURE_IMAGE_URL || '').trim()) {
				permanentKey = 'WP_PERMANENT_FTC_URL';
			} else if (promptUrl && promptUrl === String(CONFIG.SHOPPING_CTA_IMAGE_URL1 || '').trim()) {
				permanentKey = 'WP_PERMANENT_CTA_URL1';
			} else if (promptUrl && promptUrl === String(CONFIG.SHOPPING_CTA_IMAGE_URL2 || '').trim()) {
				permanentKey = 'WP_PERMANENT_CTA_URL2';
			} else if (promptUrl && promptUrl === String(CONFIG.SHOPPING_CTA_IMAGE_URL3 || '').trim()) {
				permanentKey = 'WP_PERMANENT_CTA_URL3';
			}

			if (permanentKey && CONFIG[permanentKey]) {
				permanentUrl = CONFIG[permanentKey];
				Logger.info(`♻️ [WordPress] 영구 자산 재사용 (Key: ${permanentKey}, URL: ${permanentUrl})`);
			}

			if (permanentUrl) {
				uploadResults.set(block.index, { url: permanentUrl, alt: block.title });
				// Markdown 치환
				const mdImageTag = `![${block.title}](${permanentUrl})`;
				finalMarkdown = finalMarkdown.replace(block.fullTag, mdImageTag);
				continue;
			}

			const imagePath = Utils.findImageByPrefix(dirPath, block.index);

			if (!imagePath || !fs.existsSync(imagePath)) {
				const prefix = String(block.index).padStart(2, '0');
				Logger.warn(`⚠️ [WordPress] 이미지 파일을 찾을 수 없음 (Index: ${prefix})`);
				warnings.push(`이미지 ${block.index}번 누락`);
				continue;
			}

			// 🔧 [Fixed] Open Graph 렌더링 호환성 + 워드프레스 파일명 길이 제한(100자 이내) 완벽 차단
			// 외부 연동(n8n 등)에서 검증된 영숫자 + 타임스탬프 + 랜덤 파일명 로직 적용
			const extension = path.extname(imagePath);
			const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

			const slug = block.title.normalize('NFC')
				.replace(/[a-zA-Z0-9]+/g, match => match.toLowerCase())
				.replace(/[^a-zA-Z0-9]+/g, '_')
				.replace(/_{2,}/g, '_')
				.replace(/^_|_$/g, '') || 'image';

			const maxSlugLength = 100 - uniqueSuffix.length - extension.length - 1; // 언더바 1개 포함
			const trimmedSlug = slug.slice(0, maxSlugLength);
			const fileName = `${trimmedSlug}_${uniqueSuffix}${extension}`;

			const ImageService = require('./image-service');
			const optimizedFilePath = await ImageService.optimizeImageForPlatform(imagePath, 'wordpress');
			const optimizedExt = path.extname(optimizedFilePath).slice(1) || path.extname(fileName).slice(1);
			const optimizedBuffer = fs.readFileSync(optimizedFilePath);

			// 확장자가 변경된 경우 파일명 보정 (WP 업로드용)
			let finalFileName = fileName;
			if (optimizedExt && !fileName.toLowerCase().endsWith('.' + optimizedExt)) {
				const baseName = path.basename(fileName, path.extname(fileName));
				finalFileName = `${baseName}.${optimizedExt}`;
			}

			// 로컬 보존용 파일명 보정 (원본명 그대로 사용: 00_image.png -> 00_image.avif)
			const originalBaseName = path.basename(imagePath, extension);
			const localSaveFileName = `${originalBaseName}.${optimizedExt || extension.slice(1)}`;

			const uploadRes = await wpClient.uploadMedia(optimizedBuffer, finalFileName, block.title);

			if (uploadRes) {
				// 워드프레스 업로드 후, 원본 보존을 위해 변환된 이미지를 해당 폴더에 파일로 저장 (Memory -> Upload -> Save)
				try {
					const savePath = path.join(dirPath, localSaveFileName);
					if (!fs.existsSync(savePath) && optimizedBuffer) {
						fs.writeFileSync(savePath, optimizedBuffer);
						Logger.info(`💾 [WordPress] 변환된 이미지 로컬 보존 완료: ${localSaveFileName}`);
					}
				} catch (e) {
					Logger.warn(`⚠️ [WordPress] 변환된 이미지 로컬 보존 실패: ${e.message}`);
				}

				uploadResults.set(block.index, {
					id: uploadRes.id,
					url: uploadRes.url,
					alt: block.title
				});

				// 영구 자산인 경우 URL 캐싱
				if (permanentKey) {
					Utils.updateConfigValue(permanentKey, uploadRes.url);
					Logger.info(`💾 [WordPress] 영구 자산 캐싱 완료 (Key: ${permanentKey})`);
				}

				// 대표 이미지는 제품 이미지만 대상으로 함 (FTC/CTA 제외)
				if (featuredMediaId === null && !permanentKey) {
					featuredMediaId = uploadRes.id;
				}

				// Markdown 치환
				const mdImageTag = `![${block.title}](${uploadRes.url})`;
				finalMarkdown = finalMarkdown.replace(block.fullTag, mdImageTag);
			} else {
				warnings.push(`이미지 ${block.index}번 업로드 실패`);
			}
		}

		// 2. 상태 결정 (이미지 생성 실패 시 Draft 강제)
		let finalStatus = options.postStatus || 'draft';
		if (options.imageGeneration === false) {
			if (finalStatus !== 'draft') {
				Logger.info("ℹ️ [WordPress] 이미지 미생성 옵션으로 인해 Draft로 강제 전환합니다.");
				finalStatus = 'draft';
				warnings.push("이미지 미생성으로 Draft 저장됨");
			}
		} else if (warnings.length > 0) {
			if (finalStatus !== 'draft') {
				Logger.info(`ℹ️ [WordPress] 이미지 누락/실패(${warnings.length}건)로 인해 Draft로 강제 전환합니다.`);
				finalStatus = 'draft';
				warnings.push("이미지 처리 이슈로 Draft 저장됨");
			}
		}

		// 3. 카테고리 처리
		let categoryIds = [];
		if (options.category) {
			// Try to find the category By Name or ID
			const catList = await wpClient.listCategories();
			const targetCat = String(options.category).trim().toLowerCase();

			// 정확한 ID 매칭 또는 이름 매칭 (Trim 후 소문자 비교)
			let foundCat = catList.find(c =>
				String(c.id) === targetCat ||
				String(c.name).trim().toLowerCase() === targetCat ||
				String(c.slug).toLowerCase() === targetCat
			);

			if (foundCat) {
				categoryIds = [foundCat.id];
				Logger.info(`   ✅ 워드프레스 카테고리 매칭 성공: ${foundCat.name} (ID: ${foundCat.id})`);
			} else {
				Logger.warn(`⚠️ [WordPress] 지정된 카테고리('${options.category}')가 사이트에 존재하지 않습니다. Draft 상태로 강제 전환합니다.`);
				warnings.push(`카테고리 '${options.category}' 없음 (Draft 저장)`);
				finalStatus = 'draft';
			}
		}

		// 4. HTML 변환 및 최종 발행
		// h1 제거 (WP는 Title 필드가 별도 존재)
		const bodyMarkdown = finalMarkdown.replace(/^#\s+.+\n?/, "").trim();
		const htmlContent = marked(bodyMarkdown);

		const postData = {
			title: postTitle || 'Untitled Post',
			content: htmlContent,
			status: finalStatus === 'schedule' ? 'future' : finalStatus,
			categories: categoryIds,
			featured_media: featuredMediaId
		};

		if (finalStatus === 'schedule' && options.wpScheduleDate) {
			postData.date = options.wpScheduleDate;
		}

		const result = await wpClient.createPost(postData);

		if (!result) {
			throw new Error('WordPress 포스트 생성 요청이 실패했습니다.');
		}

		return {
			success: true,
			postId: result.id,
			postUrl: result.link,
			status: finalStatus,
			warnings: warnings.length > 0 ? warnings : null
		};
	},

	/**
	 * 네이버 블로그 카테고리 선택 (발행 팝업 내)
	 */
	selectNaverBlogCategory: async function (page, categoryName) {
		try {
			Logger.info(`   📁 카테고리 설정 시도: [${categoryName}]`);
			const dropdownBtn = page.locator('button.selectbox_button__jb1Dt, button[aria-label="카테고리 목록 버튼"], .se-publish-setting-item--category button').first();

			if (await dropdownBtn.isVisible()) {
				const currentText = await dropdownBtn.innerText();
				Logger.info(`      🔍 현재 선택된 카테고리: ${currentText.trim()}`);
				if (currentText.trim().includes(categoryName)) {
					Logger.info(`      ✅ 이미 '${categoryName}' 카테고리가 선택되어 있습니다.`);
					return true;
				}

				Logger.info("      🖱️ 카테고리 드롭다운 클릭 시도 (Human-like)...");
				await dropdownBtn.scrollIntoViewIfNeeded();
				await dropdownBtn.hover();
				await Utils.sleep(200);
				await dropdownBtn.click({ force: true });
				await Utils.sleep(1200);

				// 카테고리 목록 패널 대기
				// 스크린샷 상의 클래스: .selectbox_list__SD2nT, .option_list_layer__YX1Tq
				const listSelector = '.selectbox_list__SD2nT, .selectbox-list, .se-category-list-container, [class*="selectbox_list"], [class*="option_list_layer"]';
				const listPanel = page.locator(listSelector).first();

				if (!(await listPanel.isVisible())) {
					Logger.warn("      ⚠️ 카테고리 목록 패널이 나타나지 않았습니다. JS 클릭으로 재시도...");
					await page.evaluate((sel) => {
						const btns = document.querySelectorAll(sel);
						if (btns.length > 0) btns[0].click();
					}, 'button.selectbox_button__jb1Dt, button[aria-label="카테고리 목록 버튼"]');
					await Utils.sleep(1500);
				}

				if (await listPanel.isVisible()) {
					const itemSelectors = ['label.radio_label__mB6ia', '[class*="radio_label"]', 'button', 'li'];
					let categoryItem = null;

					for (const selector of itemSelectors) {
						const items = listPanel.locator(selector);
						const foundCount = await items.count();
						if (foundCount > 0) {
							for (let i = 0; i < foundCount; i++) {
								const item = items.nth(i);
								let itemText = await item.innerText();
								itemText = itemText.replace(/\u00A0/g, ' ').trim();

								if (itemText === categoryName || itemText.includes(categoryName)) {
									Logger.info(`      🎯 매칭 항목 발견: "${itemText}"`);
									categoryItem = item;
									break;
								}
							}
						}
						if (categoryItem) break;
					}

					if (categoryItem) {
						Logger.info(`      🖱️ 항목 [${categoryName}] 선택 중 (Hover -> Click)...`);
						await categoryItem.scrollIntoViewIfNeeded();
						await Utils.sleep(300);
						await categoryItem.hover().catch(() => { });
						await Utils.sleep(200);
						await categoryItem.click({ force: true });

						// 선택 후 드롭다운이 닫히며 텍스트가 반영될 때까지 대기
						await Utils.sleep(1500);
						const confirmedText = await dropdownBtn.innerText();
						if (confirmedText.includes(categoryName)) {
							Logger.info(`   ✅ 카테고리 변경 확인 완료: ${confirmedText.trim()}`);
							return true;
						} else {
							Logger.warn(`   ⚠️ 클릭을 시도했으나 버튼 텍스트가 미변경되었습니다. (현재: ${confirmedText.trim()})`);
							return false;
						}
					} else {
						Logger.warn(`   ⚠️ 목록에서 '${categoryName}'을 찾지 못했습니다.`);
						await dropdownBtn.click({ force: true }).catch(() => { });
						return false;
					}
				} else {
					Logger.warn("   ⚠️ 카테고리 목록 패널이 끝내 열리지 않았습니다.");
					return false;
				}
			} else {
				Logger.warn("   ⚠️ 카테고리 드롭다운 버튼을 찾지 못했습니다.");
				return false;
			}
		} catch (e) {
			Logger.warn(`   ⚠️ 카테고리 설정 도중 오류 발생: ${e.message}`);
			return false;
		}
	},

	/**
	 * 네이버 블로그 예약 시간 설정 (발행 팝업 내)
	 */
	setNaverBlogSchedule: async function (page, scheduleDate) {
		try {
			Logger.info(`   ⏰ 예약 발행 설정 시도: ${scheduleDate || '기본값'}`);

			// '예약' 라디오 버튼 클릭
			const scheduleSelectors = [
				'label:has-text("예약")',
				'label.radio_label__mB6ia:has-text("예약")',
				'label[for="radio_time2"]',
				'input[value="schedule"]'
			];

			let scheduleBtn = null;
			for (const sel of scheduleSelectors) {
				const loc = page.locator(sel).first();
				if (await loc.isVisible()) {
					Logger.info(`      🖱️ 예약 옵션 선택 시도 (셀렉터: ${sel})`);
					scheduleBtn = loc;
					break;
				}
			}

			if (scheduleBtn) {
				await scheduleBtn.scrollIntoViewIfNeeded();
				await scheduleBtn.click({ force: true });
				await Utils.sleep(1200);

				// 클릭이 먹혔는지 확인 (input 상태 체크)
				const isChecked = await page.evaluate(() => {
					const radios = document.querySelectorAll('input[name="publish-time"], input[type="radio"], input[name="publish-type"]');
					for (const r of radios) {
						if (r.nextElementSibling && r.nextElementSibling.textContent.includes('예약')) {
							return r.checked;
						}
						const label = document.querySelector(`label[for="${r.id}"]`);
						if (label && label.textContent.includes('예약')) return r.checked;
						if (r.value === 'schedule') return r.checked;
					}
					return false;
				});

				if (!isChecked) {
					Logger.warn("      ⚠️ 라디오 버튼이 선택되지 않았습니다. JS 직접 조작 시들...");
					await page.evaluate(() => {
						const labels = Array.from(document.querySelectorAll('label'));
						const targetLabel = labels.find(l => l.textContent.trim() === '예약' || l.textContent.includes('예약'));
						if (targetLabel) {
							targetLabel.click();
							const inputId = targetLabel.getAttribute('for');
							if (inputId) {
								const input = document.getElementById(inputId);
								if (input) {
									input.checked = true;
									input.dispatchEvent(new Event('change', { bubbles: true }));
								}
							}
						}
					});
					await Utils.sleep(1500);
				}

				if (scheduleDate) {
					try {
						const dateInput = page.locator('input.input_date__QmA0s, input[aria-label="날짜 입력"], .input_date__S9V_r').first();
						const hourSelect = page.locator('select.hour_option__J_heO, input[aria-label="시간 입력"], .input_time__R3iOQ').first();
						const minuteSelect = page.locator('select.minute_option__Vb3xB, input[aria-label="분 입력"]').first();

						if (await dateInput.isVisible()) {
							const dateMatch = scheduleDate.match(/\d{4}\.\s*\d{2}\.\s*\d{2}\./);
							const targetDateStr = dateMatch ? dateMatch[0] : scheduleDate.split(' ')[0];

							const selectAllKey = IS_MAC ? 'Meta+A' : 'Control+A';
							await dateInput.click();
							await page.keyboard.press(selectAllKey);
							await page.keyboard.press('Backspace');
							await dateInput.type(targetDateStr);
							await page.keyboard.press('Enter');
						}

						const timeMatch = scheduleDate.match(/(\d{1,2}):(\d{2})/);
						const requestedHour = timeMatch ? timeMatch[1].padStart(2, '0') : '09';
						let requestedMin = timeMatch ? timeMatch[2].padStart(2, '0') : '00';

						// ✅ 네이버 예약은 10분 단위만 허용 (내림 처리)
						const rawMin = parseInt(requestedMin, 10);
						if (!isNaN(rawMin)) {
							const roundedMin = Math.floor(rawMin / 10) * 10;
							requestedMin = String(roundedMin).padStart(2, '0');
							if (rawMin !== roundedMin) {
								Logger.info(`      🕒 분 단위 조정: ${rawMin}분 -> ${requestedMin}분 (네이버 10분 단위 제약 반영)`);
							}
						}

						if (await hourSelect.isVisible()) {
							const tagName = await hourSelect.evaluate(el => el.tagName.toLowerCase());
							if (tagName === 'select') {
								await hourSelect.selectOption(requestedHour);
							} else {
								await hourSelect.click();
								await page.keyboard.press(IS_MAC ? 'Meta+A' : 'Control+A');
								await page.keyboard.press('Backspace');
								await hourSelect.type(requestedHour);
							}
						}

						if (await minuteSelect.isVisible()) {
							const tagName = await minuteSelect.evaluate(el => el.tagName.toLowerCase());
							if (tagName === 'select') {
								await minuteSelect.selectOption(requestedMin);
							} else {
								await minuteSelect.click();
								await page.keyboard.press(IS_MAC ? 'Meta+A' : 'Control+A');
								await page.keyboard.press('Backspace');
								await minuteSelect.type(requestedMin);
							}
						}

						await Utils.sleep(500);
						Logger.info(`   ✅ 예약 일시 설정 완료: ${scheduleDate}`);
					} catch (dateErr) {
						Logger.warn(`   ⚠️ 상세 날짜/시간 입력 필드 조작 실패: ${dateErr.message}`);
					}
				}
			} else {
				Logger.warn("   ⚠️ 예약 라디오 버튼을 찾지 못했습니다.");
			}
		} catch (e) {
			Logger.warn(`   ⚠️ 예약 설정 실패: ${e.message}`);
		}
	}
};

// 🧹 하단에서 module.exports = Core; 만 남김
module.exports = Core;
