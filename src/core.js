const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

// ✅ 모듈 불러오기
const CONFIG = require('./config-loader');   // 사용자 설정
const Constants = require('./constants');    // 🔥 [필수] 기본 설정 상수 (이게 있어야 우선순위 로직 작동)
const Utils = require('./utils');
const Logger = require('./logger');
const BrowserLauncher = require('./browser-launcher');

const IS_MAC = process.platform === 'darwin';
const CMD_KEY = IS_MAC ? 'Meta' : 'Control';

async function clickIfVisible(locator) {
	try {
		if (await locator.count() > 0 && await locator.first().isVisible()) {
			await locator.first().click({ force: true });
			return true;
		}
	} catch (e) { }
	return false;
}

async function dismissEditorPopups(page) {
	let dismissedCount = 0;
	for (let i = 0; i < 5; i++) {
		let dismissedThisRound = false;

		// 1) Help 패널 닫기
		dismissedThisRound = await clickIfVisible(page.locator('button.se-help-panel-close-button')) || dismissedThisRound;
		dismissedThisRound = await clickIfVisible(page.getByRole('button', { name: /help|도움말/i })) || dismissedThisRound;

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
				await candidate.click({ force: true });
				await Utils.sleep(150);
				return true;
			} catch (e) { }
		}
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
							await target.click({ force: true });
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

async function centerAlignFocusedImage(page) {
	for (let attempt = 0; attempt < 4; attempt++) {
		if (attempt > 0) {
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
						await centerByClass.click({ force: true });
						await Utils.sleep(120);
						return true;
					}

					const buttons = group.locator('button');
					const btnCount = await buttons.count();
					if (btnCount >= 2) {
						const centerBtn = buttons.nth(1); // 일반적으로 가운데 버튼이 두 번째
						if (await centerBtn.isVisible()) {
							await centerBtn.click({ force: true });
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

					await button.click({ force: true });
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
		'.se-component-content.se-component-content-text p',
		'.se-module-text p',
		'.se-text-paragraph'
	];

	for (const selector of paragraphSelectors) {
		const nodes = page.locator(selector);
		const count = await nodes.count();
		for (let i = count - 1; i >= 0; i--) {
			const node = nodes.nth(i);
			try {
				if (!(await node.isVisible())) continue;
				await node.click({ force: true });
				await Utils.sleep(80);
				return true;
			} catch (e) { }
		}
	}

	try {
		const editor = page.locator('.se-container, .se-main-container, #mainFrame').first();
		if (await editor.count() > 0 && await editor.isVisible()) {
			await editor.click({ force: true, position: { x: 80, y: 220 } });
			await Utils.sleep(80);
			return true;
		}
	} catch (e) { }
	return false;
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

			const oglinkCount = Array.from(editorRoot.querySelectorAll('*'))
				.filter(el => !el.closest('.se-popup-oglink') && /\boglink\b/i.test(String(el.className || '')))
				.length;

			const targetMentionCount = (() => {
				if (!target) return 0;
				const text = String(editorRoot.textContent || '');
				const targetWithoutProtocol = target.replace(/^https?:\/\//i, '');
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

			return { targetAnchorCount, oglinkCount, allAnchorCount, targetMentionCount };
		}, targetUrl);
	} catch (e) {
		return { targetAnchorCount: 0, oglinkCount: 0, allAnchorCount: 0, targetMentionCount: 0 };
	}
}

async function insertOglinkCardAtCursor(page, linkUrl) {
	const url = String(linkUrl || '').trim();
	if (!/^https?:\/\//i.test(url)) return false;

	const beforeSnapshot = await getEditorLinkSnapshot(page, url);
	await closeVisibleOglinkPopup(page);
	await focusEditorTypingArea(page);

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
				await btn.click({ force: true });
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
				await btn.click({ force: true });
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
				await btn.click({ force: true });
				return true;
			}
		}
		return false;
	};

	try {
		await input.click({ force: true });
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
				try { await input.press('Enter'); } catch (e) { }
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
		for (let i = 0; i < 40; i++) {
			const nowSnapshot = await getEditorLinkSnapshot(page, url);
			if (
				nowSnapshot.targetAnchorCount > beforeSnapshot.targetAnchorCount ||
				nowSnapshot.oglinkCount > beforeSnapshot.oglinkCount ||
				nowSnapshot.allAnchorCount > beforeSnapshot.allAnchorCount ||
				nowSnapshot.targetMentionCount > beforeSnapshot.targetMentionCount
			) {
				inserted = true;
				break;
			}
			await Utils.sleep(200);
		}
		if (!inserted) {
			return false;
		}

		// 링크 카드를 선택한 뒤 가운데 정렬을 시도한다.
		for (let i = 0; i < 3; i++) {
			const focused = await focusLatestOglinkCard(page);
			if (!focused) {
				await Utils.sleep(120);
				continue;
			}
			const centered = await centerAlignFocusedImage(page);
			if (centered) {
				Logger.info(`       ↔️ 링크 카드 가운데 정렬 적용: ${url}`);
				break;
			}
			await Utils.sleep(120);
		}

		await focusEditorTypingArea(page);
		return true;
	} catch (e) {
		await closeVisibleOglinkPopup(page);
		await focusEditorTypingArea(page);
		return false;
	}
}

function buildRelatedPostsSectionMarkdown(relatedPosts, heading, includeHeading = true) {
	const title = String(heading || '함께 보면 좋은 글').trim() || '함께 보면 좋은 글';
	const lines = [];
	if (includeHeading) {
		lines.push(`## ${title}`);
	}
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
	// AI가 생성한 "함께/같이/이어서 보면 좋은 글" 섹션은 제거하고, 후처리로 일관되게 재삽입한다.
	const pattern = /(?:^|\n)##\s*(?:함께|같이|이어서)\s*보면\s*좋은\s*글[\s\S]*?(?=\n##\s+|$)/g;
	return String(markdown).replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const Core = {
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

		if (!hasSubject && !hasKeywords && !hasRef && !hasInstructions) {
			throw new Error("❌ [Error] 주제, 키워드, 지시사항, URL 중 적어도 하나는 필요합니다.");
		}

		// 1) 외부 참고 블로그 인기글 수집 (use_external_ref === true일 때)
		let scrapedContext = "";
		let refSourceCount = 0;

		if (useExternalRef) {
			// 검색 키워드 결정: keywords 중 첫번째 또는 subject
			const searchKeyword = (hasKeywords ? jobData.keywords[0] : jobData.subject) || '';
			if (searchKeyword) {
				Logger.debug(`🔍 [외부 참고] 인기글 수집 시작: '${searchKeyword}'`);
				const relatedPosts = await Utils.fetchNaverBlogTopPosts(searchKeyword);

				for (let i = 0; i < relatedPosts.length; i++) {
					const post = relatedPosts[i];
					const rawTitle = String(post.title || '').replace(/\s+/g, ' ').trim();
					const previewTitle = rawTitle.slice(0, 5);
					Logger.info(`   📖 [외부 참고] 관련 글 ${i + 1} 분석 중...: ${previewTitle}`);
					const text = await Utils.fetchReferenceContent(post.link);
					if (text) {
						refSourceCount++;
						scrapedContext += `\n[인기 참고글 ${refSourceCount} - ${post.title}]:\n${text}\n`;
					}
					await Utils.sleep(1000);
				}
				Logger.debug(`🔍 [외부 참고] 인기글 스크래핑 완료: ${refSourceCount}건 성공`);
			}
		}

		// 2) 수동 참고 URL 스크래핑 (기존 로직 유지)
		if (hasRef) {
			Logger.debug("📚 수동 참고 자료(URL) 분석 중...");
			for (const url of jobData.content_guide.reference_urls) {
				// 네이버 블로그 URL이면 모바일 변환
				const convertedUrl = Utils.convertToMobileNaverBlogUrl(url);
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
		if (!fs.existsSync(promptPath)) {
			throw new Error(`시스템 프롬프트 파일이 없습니다: ${promptPath}`);
		}
		const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

		// 4) 참고 컨텍스트 구성
		let referenceSection = "(No reference provided)";
		if (scrapedContext) {
			referenceSection = `아래는 해당 주제와 관련된 참고 블로그 글의 내용입니다.
이 글들의 핵심 인사이트, 정보, 관점을 참고하여 독창적인 글을 작성하세요.
단, 원문을 그대로 복사하지 말고, 여러 글의 정보를 종합하여 새로운 시각과 가치를 제공하는 글을 작성하세요.
${scrapedContext}`;
		}

		const userPrompt = `
				 [INPUT DATA]
				 - Subject: ${jobData.subject || "(Context에 기반해 멋진 제목을 지어주세요)"}
			 - Keywords: ${jobData.keywords?.join(', ') || "(핵심 키워드 5개를 추출해주세요)"}
			 - Instructions: ${jobData.content_guide?.additional_instructions || "None"}
			 - Image Count: ${jobData.image_options?.count || 4}
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
		const finalHashtags = parsedData.hashtags || [];
		const enableRelatedPostsAutoLink = runtimeOptions.enableRelatedPostsAutoLink !== false;
		let relatedPosts = [];
		let relatedHeading = Utils.pickRelatedPostsHeading();
		if (enableRelatedPostsAutoLink) {
			Logger.info("🔎 [Blog] 관련 글 자동 수집 중...");
			relatedPosts = await Utils.fetchOwnBlogRandomPosts(3);
			if (relatedPosts.length > 0) {
				Logger.info(`🔗 [Blog] 관련 글 자동 수집 완료 (${relatedPosts.length}건, 랜덤)`);
			} else {
				Logger.info("ℹ️ [Blog] 관련 글 자동 수집 실패/없음: placeholder 삽입");
			}
		} else {
			Logger.info("ℹ️ [Blog] 관련 글 자동 링크 기능 비활성화 (플랜 정책)");
		}

		// 5) 결과 저장
		let targetDir;
		const safeSubject = Utils.sanitizeFileName(String(finalSubject));
		if (customDir) {
			targetDir = path.resolve(customDir);
		} else {
			const wsDir = CONFIG.WORKSPACE_DIR || Constants.WORKSPACE_DIR;
			const timestamp = moment().tz('Asia/Seoul').format('YYYYMMDD_HHmmss');
			targetDir = path.join(wsDir, `${timestamp}_${safeSubject}`);
		}

		if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

		let pureContent = finalContent.replace(/^#\s+.+\n?/, "").trim();
		pureContent = stripAiRelatedPostsSection(pureContent);
		if (enableRelatedPostsAutoLink) {
			const relatedSection = buildRelatedPostsSectionMarkdown(relatedPosts, relatedHeading, true);
			pureContent = `${pureContent}\n\n${relatedSection}`.trim();
		}
		const hashtagLine = finalHashtags.length > 0 ? "\n\n\n" + finalHashtags.map(tag => `#${tag}`).join(' ') : "";
		const fullFileContent = `# ${finalSubject}\n\n${pureContent}${hashtagLine}`;

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

			await Utils.callGeminiImage(prompt, path.join(dirPath, `${prefix}_image`));
			lastCall = Date.now();
		}
	},

	/**
 * 3. 블로그 발행 (Publish)
 */
	publishToBlog: async function (dirPath, options = {}) {
		Logger.info(`🚀 [Step 5] 발행 시작: ${path.basename(dirPath)}`);

		const authPath = CONFIG.AUTH_FILE_PATH || Constants.AUTH_FILE_PATH;
		if (!fs.existsSync(authPath)) throw new Error('auth.json 없음');

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

		// 🔧 [Fixed] parseInt 기본값 처리 개선
		const getIntOrDefault = (value, defaultValue) => {
			const parsed = parseInt(value, 10);
			return isNaN(parsed) ? defaultValue : parsed;
		};

		const viewport = {
			width: getIntOrDefault(CONFIG.VIEWPORT_WIDTH, 1280),
			height: getIntOrDefault(CONFIG.VIEWPORT_HEIGHT, 1024)
		};

		const browser = await BrowserLauncher.launchBrowser();
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
		page.on('dialog', async dialog => await dialog.dismiss());

		try {
			Logger.info("   🔄 블로그 에디터 접속 중...");
			Logger.info(`   🔗 접속 URL: ${CONFIG.WRITE_URL}`);
			await page.goto(CONFIG.WRITE_URL, { waitUntil: 'domcontentloaded' });

			const loadWait = CONFIG.WAIT_LOAD || Constants.WAIT.LOAD;
			await Utils.sleep(loadWait);

			// 🔧 [Fixed] 세션 만료 처리 개선 (더 명확한 안내)
			if (page.url().includes('nid.naver.com') || page.url().includes('login')) {
				Logger.error("🚨 [Critical] 로그인 정보가 만료되었습니다.");
				Logger.info("   💡 해결 방법: 터미널에서 'npm run login' 명령어를 실행하여 다시 로그인하세요.");
				await browser.close();
				throw new Error("Login Session Expired - Please run 'npm run login' to re-authenticate");
			}

			// 팝업 제거 (Help / 이전글 로드)
			await dismissEditorPopups(page);
			await Utils.sleep(1000);

			// 🔧 [Fixed] 타이핑할 때마다 랜덤 속도 계산 (봇 감지 회피)
			const getRandomTypingDelay = () => {
				return Math.floor(Math.random() * (typingPreset.MAX - typingPreset.MIN + 1)) + typingPreset.MIN;
			};

			// ✍️ 제목 입력
			Logger.info(`   ✍️ 제목 입력: ${title}`);
			const titleArea = page.locator('.se-documentTitle, .se-ff-title');
			await dismissEditorPopups(page);
			await titleArea.click({ force: true });
			await page.keyboard.type(title, { delay: getRandomTypingDelay() });
			await page.keyboard.press('Enter');

			// 🔧 [Fixed] 디렉토리 스캔 최적화 (한 번만 스캔)
			const allFiles = fs.readdirSync(dirPath);

				// ✍️ 본문 입력 루프
				let inListMode = false;
				let currentListType = null;
				let needsExtraGapAfterList = false;
				let representativeImageSet = false;
				let representativeAttemptCount = 0;
				const representativeMaxAttempts = 3;
				for (const item of contents) {
					if (item.type !== 'image') {
						await closeVisibleOglinkPopup(page);
						if (!inListMode) {
							await focusEditorTypingArea(page);
						}
					}
					if (item.type !== 'list-item' && inListMode) {
						// 에디터 자동 리스트 종료: 빈 항목 Enter 한 번으로 리스트 모드를 해제한다.
						await page.keyboard.press('Enter');
						// 리스트 뒤 문단/빈줄은 한 줄 공백이 보이도록 다음 블록에서 Enter 1회를 추가한다.
						needsExtraGapAfterList = (item.type === 'paragraph' || item.type === 'newline');
						inListMode = false;
						currentListType = null;
					}
					if (needsExtraGapAfterList && item.type !== 'paragraph' && item.type !== 'newline') {
						needsExtraGapAfterList = false;
					}

				if (item.type === 'header-h2') {
					// 📌 [복구됨] 어제 성공했던 방식 (커서만 두고 메뉴 클릭)
					Logger.info(`       📌 소제목: ${item.text}`);
					await page.keyboard.press('Enter');
					await page.keyboard.type(item.text, { delay: getRandomTypingDelay() });
					await Utils.sleep(300);

					try {
						const toolbarBtn = page.locator('button[data-name="text-format"]');
						if (await toolbarBtn.isVisible()) {
							await toolbarBtn.click();
							await Utils.sleep(200);
							const subTitleBtn = page.getByRole('button', { name: '소제목' });
							if (await subTitleBtn.isVisible()) {
								await subTitleBtn.click();
							} else {
								await page.keyboard.press(`${CMD_KEY}+B`);
							}
						}
					} catch (e) { }


					await Utils.sleep(100);
					await page.keyboard.press('Enter'); // 다음 줄로 이동
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
							if (isUrlOnlyParagraph(paragraphText)) {
								const inserted = await insertOglinkCardAtCursor(page, paragraphText.trim());
								if (inserted) {
									Logger.info(`       🔗 링크 카드 삽입: ${paragraphText.trim()}`);
								} else {
									await closeVisibleOglinkPopup(page);
									await focusEditorTypingArea(page);
									Logger.warn(`       ⚠️ 링크 카드 삽입 실패(일반 URL 텍스트로 대체): ${paragraphText.trim()}`);
									await page.keyboard.type(paragraphText, { delay: getRandomTypingDelay() });
									await page.keyboard.press('Space');
								}
							} else {
							await page.keyboard.type(paragraphText, { delay: getRandomTypingDelay() });
							if (paragraphText.includes('http')) await page.keyboard.press('Space');
						}
						await page.keyboard.press('Enter');
					}
				else if (item.type === 'newline') {
					needsExtraGapAfterList = false;
					await page.keyboard.press('Enter');
				}
				else if (item.type === 'image') {
					const prefix = String(item.index).padStart(2, '0');
					// 🔧 [Fixed] 미리 스캔한 파일 목록 사용
					const file = allFiles.find(f => f.startsWith(`${prefix}_`) && /\.(png|jpg|jpeg|webp)$/i.test(f));

					if (file) {
						Logger.info(`       🖼️ 이미지 업로드: ${file}`);
						const fileChooserPromise = page.waitForEvent('filechooser');
						const photoBtn = page.locator('button.se-image-toolbar-button, button:has-text("사진")').first();

						if (await photoBtn.isVisible()) {
							await photoBtn.click();
							const chooser = await fileChooserPromise;
							await chooser.setFiles(path.join(dirPath, file));

							const uploadWait = CONFIG.WAIT_UPLOAD || Constants.WAIT.UPLOAD;
							await Utils.sleep(uploadWait);

							const imageFocused = await focusLatestEditorImage(page);
							if (!imageFocused) {
								Logger.warn('       ⚠️ 방금 업로드한 이미지를 포커스하지 못했습니다.');
							}

								// 가운데 정렬은 공정위/CTA 이미지만 시도한다. (일반 상품 이미지는 스킵)
								const shouldTryCenterAlign =
									/_ftc_disclosure\.(png|jpg|jpeg|webp)$/i.test(file) ||
									/_cta_image\.(png|jpg|jpeg|webp)$/i.test(file);
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
									!/_ftc_disclosure\.(png|jpg|jpeg|webp)$/i.test(file) &&
									!/_cta_image\.(png|jpg|jpeg|webp)$/i.test(file);
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
						}
					} else {
						// 📌 [유지] 이미지 없을 때 원본 마크다운 그대로 입력 (사람 속도로)
						Logger.warn(`⚠️ 이미지 파일을 찾을 수 없습니다: ${prefix}_*.(png|jpg|jpeg|webp)`);
						Logger.info(`       📝 이미지 블록(원본) 입력 (Index ${item.index})`);
						const rawBlock = `[[IMAGE_${item.index}\ntitle: ${item.text}\nprompt: ${item.prompt}\n]]`;
						await page.keyboard.type(rawBlock, { delay: getRandomTypingDelay() });
						await page.keyboard.press('Enter');
						await page.keyboard.press('Enter');
					}
				}
				await Utils.sleep(50);
			}

			Logger.info("   ✅ 본문 작성 완료");

			// 💾 임시 저장
			try {
				Logger.info("   💾 안전을 위해 임시저장을 시도합니다...");
				const saveBtn = page.locator('button.se-save-button, button:has-text("저장")').first();
				if (await saveBtn.isVisible()) {
					await saveBtn.click();
					await Utils.sleep(2000);
					Logger.info("   ✅ 임시저장 완료");
				}
			} catch (e) {
				Logger.warn("   ⚠️ 임시저장 버튼을 찾지 못해 건너뜁니다");
			}

			const publishBtns = page.locator('button').filter({ hasText: /발행/ });
			if (await publishBtns.count() > 0) {
				for (let i = 0; i < await publishBtns.count(); i++) {
					const btn = publishBtns.nth(i);
					if (await btn.isVisible() && (await btn.innerText()).includes('발행')) {
						await btn.click();
						Logger.info("   🚀 [발행] 버튼 클릭 성공 (설정창 오픈)");
						break;
					}
				}
			}

		} catch (e) {
			Logger.error(`❌ 에러 발생: ${e.message}`);
			throw e;
		} finally {
			// 🔧 [Fixed] 브라우저 종료 로직 개선 (좀비 프로세스 방지)
			const closeDelaySeconds = parseInt(CONFIG.CLOSE_DELAY_SECONDS, 10) || 10;
			const closeDelayMs = closeDelaySeconds * 1000;

			// CLOSE_DELAY_SECONDS=0 이면 브라우저를 닫지 않고 유지
			if (closeDelayMs === 0) {
				Logger.info("   🔒 브라우저를 닫지 않고 유지합니다.");
				return;
			}

			// 비헤드리스 모드에서는 사용자가 볼 수 있도록 대기
			if (!CONFIG.HEADLESS && closeDelayMs > 0) {
				Logger.info(`   👋 (${closeDelaySeconds}초 뒤 브라우저를 닫습니다...)`);
				await Utils.sleep(closeDelayMs);
			}

			// 모든 경우에 브라우저 닫기 (closeDelayMs === 0이 아닌 경우)
			if (browser) {
				await browser.close();
				Logger.info("   🔒 브라우저 세션 종료");
			}
		}
	}
};

module.exports = Core;
