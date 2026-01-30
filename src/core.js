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

const Core = {
	/**
	 * 1. 콘텐츠 생성 (Generate)
	 */
generateContent: async function(jobData, customDir = null) {
			 Logger.info("🚀 [Core] 콘텐츠 생성 프로세스 시작");

			 const hasSubject = !!jobData.subject;
			 const hasKeywords = jobData.keywords && jobData.keywords.length > 0;
			 const hasInstructions = jobData.content_guide?.additional_instructions;
			 const hasRef = jobData.content_guide?.reference_urls && jobData.content_guide.reference_urls.length > 0;

			 if (!hasSubject && !hasKeywords && !hasRef && !hasInstructions) {
				 throw new Error("❌ [Error] 주제, 키워드, 지시사항, URL 중 적어도 하나는 필요합니다.");
			 }

			 // 1) 참고 자료 스크래핑
			 let scrapedContext = "";
			 if (hasRef) {
				 Logger.info("📚 참고 자료(URL) 분석 중...");
				 for (const url of jobData.content_guide.reference_urls) {
					 const text = await Utils.fetchReferenceContent(url);
					 if (text) scrapedContext += `\n[Reference from ${url}]:\n${text}\n`;
					 await Utils.sleep(1000); 
				 }
			 }

			 // 2) 프롬프트 로딩 (Priority: Config > Constants)
			 const promptPath = CONFIG.SYSTEM_PROMPT_PATH || Constants.PROMPT_FILE;
			 if (!fs.existsSync(promptPath)) {
				 throw new Error(`시스템 프롬프트 파일이 없습니다: ${promptPath}`);
			 }
			 const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

			 const userPrompt = `
				 [INPUT DATA]
				 - Subject: ${jobData.subject || "(Context에 기반해 멋진 제목을 지어주세요)"}
			 - Keywords: ${jobData.keywords?.join(', ') || "(핵심 키워드 5개를 추출해주세요)"}
			 - Instructions: ${jobData.content_guide?.additional_instructions || "None"}
			 - Image Count: ${jobData.image_options?.count || 4}
			 [REFERENCE CONTEXT]
				 ${scrapedContext || "(No reference provided)"}
			 `;

			 // 3) Gemini 호출
			 Logger.info("📝 Gemini에게 글 작성을 요청합니다...");
			 const rawResult = await Utils.callGeminiText(systemPrompt + '\n' + userPrompt);
			 if (!rawResult) throw new Error("API 응답이 비어있습니다.");

			 // 4) JSON 파싱
			 let parsedData;
			 try {
				 const jsonString = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
				 parsedData = JSON.parse(jsonString);
			 } catch (e) {
				 throw new Error("JSON 파싱 에러: AI 응답 형식이 올바르지 않습니다.");
			 }

			 const finalSubject = parsedData.title || parsedData.subject || jobData.subject || "제목 없음";
			 const finalContent = parsedData.content || "";
			 const finalHashtags = parsedData.hashtags || [];

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

			 const pureContent = finalContent.replace(/^#\s+.+\n?/, "").trim();
			 const hashtagLine = finalHashtags.length > 0 ? "\n\n\n" + finalHashtags.map(tag => `#${tag}`).join(' ') : "";
			 const fullFileContent = `# ${finalSubject}\n\n${pureContent}${hashtagLine}`;

			 fs.writeFileSync(path.join(targetDir, 'contents.md'), fullFileContent, 'utf-8');
			 return { targetDir, finalSubject };
		 },

		 /**
		  * 2. 이미지 준비 (Prepare)
		  */
prepareImages: async function(dirPath, jobData) {
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

			       const prefix = String(item.index).padStart(2,'0');
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
publishToBlog: async function(dirPath) {
		       Logger.info(`🚀 [Step 5] 발행 시작: ${path.basename(dirPath)}`);

		       const authPath = CONFIG.AUTH_FILE_PATH || Constants.AUTH_FILE_PATH;
		       if (!fs.existsSync(authPath)) throw new Error('auth.json 없음');

		       const contentFile = path.join(dirPath, 'contents.md');
		       if (!fs.existsSync(contentFile)) throw new Error(`콘텐츠 파일 없음: contents.md`);

		       const { title, contents } = Utils.parseMarkdown(fs.readFileSync(contentFile, 'utf-8'));

		       // Config 우선순위 적용 (Constants 필수)
		       const speedKey = CONFIG.TYPING_SPEED || 'NORMAL'; 
		       const typingPreset = Constants.TYPING_PRESETS[speedKey] || Constants.TYPING_PRESETS.NORMAL;

		       const viewport = {
width: parseInt(CONFIG.VIEWPORT_WIDTH) || 1280,
       height: parseInt(CONFIG.VIEWPORT_HEIGHT) || 1024
		       };

		       const browser = await BrowserLauncher.launchBrowser();
		       const context = await browser.newContext({ 
storageState: authPath, 
viewport: viewport,
userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
});

const page = await context.newPage();
page.on('dialog', async dialog => await dialog.dismiss());

try {
	Logger.info("   🔄 블로그 에디터 접속 중...");
	Logger.info(`   🔗 접속 URL: ${CONFIG.WRITE_URL}`);
	await page.goto(CONFIG.WRITE_URL, { waitUntil: 'domcontentloaded' });

	const loadWait = CONFIG.WAIT_LOAD || Constants.WAIT.LOAD;
	await Utils.sleep(loadWait);

	if (page.url().includes('nid.naver.com') || page.url().includes('login')) {
		Logger.error("🚨 [Critical] 로그인 정보가 만료되었습니다. 다시 로그인해주세요.");
		throw new Error("Login Session Expired");
	}

	// 팝업 제거
	try {
		const cancelBtn = page.locator('.se-popup-button-cancel');
		if (await cancelBtn.count() > 0 && await cancelBtn.first().isVisible()) await cancelBtn.first().click();
		const closeHelp = page.locator('button.se-help-panel-close-button');
		if (await closeHelp.count() > 0 && await closeHelp.first().isVisible()) await closeHelp.first().click();
	} catch(e) {}
	await Utils.sleep(1000);

	const typingDelay = Math.floor(Math.random() * (typingPreset.MAX - typingPreset.MIN + 1)) + typingPreset.MIN;
	// ✍️ 제목 입력
	Logger.info(`   ✍️ 제목 입력: ${title}`);
	const titleArea = page.locator('.se-documentTitle, .se-ff-title');
	await titleArea.click({ force: true });
	await page.keyboard.type(title, { delay: typingDelay });
	await page.keyboard.press('Enter'); 

	// ✍️ 본문 입력 루프
	for (const item of contents) {

		if (item.type === 'header-h2') {
			// 📌 [복구됨] 어제 성공했던 방식 (커서만 두고 메뉴 클릭)
			Logger.info(`       📌 소제목: ${item.text}`);
			await page.keyboard.press('Enter'); 
			await page.keyboard.type(item.text, { delay: typingDelay });
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
			} catch (e) {}


			await Utils.sleep(100);
			await page.keyboard.press('Enter'); // 다음 줄로 이동
		}
		else if (item.type === 'paragraph') {
			await page.keyboard.type(item.text, { delay: typingDelay });
			if (item.text.includes('http')) await page.keyboard.press('Space');
			await page.keyboard.press('Enter');
		}
		else if (item.type === 'newline') {
			await page.keyboard.press('Enter');
		}
		else if (item.type === 'image') {
			const prefix = String(item.index).padStart(2,'0');
			const file = fs.readdirSync(dirPath).find(f => f.startsWith(`${prefix}_`) && /\.(png|jpg|jpeg|webp)$/i.test(f));

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
				}
			} else {
				// 📌 [유지] 이미지 없을 때 원본 마크다운 그대로 입력 (사람 속도로)
				Logger.info(`       📝 이미지 블록(원본) 입력 (Index ${item.index})`);
				const rawBlock = `[[IMAGE_${item.index}\ntitle: ${item.text}\nprompt: ${item.prompt}\n]]`;
				await page.keyboard.type(rawBlock, { delay: typingDelay });
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

	// 🚀 발행 버튼 클릭 (설정창 진입까지만)
	Logger.info("   🚀 발행 설정창 오픈 중...");
	const publishBtn = page.locator('button.publish_btn, button:has-text("발행")').first();

	if (await publishBtn.isVisible()) {
		await publishBtn.click();
		await Utils.sleep(2000); 
		Logger.info("   🚀 [발행] 설정창 오픈 완료");
	}

} catch (e) {
	Logger.error(`❌ 에러 발생: ${e.message}`);
	throw e;
} finally {
	// 종료 대기 (Priority: Config > Default)
	let closeDelaySeconds = 10; 
	if (CONFIG.CLOSE_DELAY_SECONDS !== undefined) {
		closeDelaySeconds = parseInt(CONFIG.CLOSE_DELAY_SECONDS);
	}
	const closeDelayMs = closeDelaySeconds * 1000;

	if (!CONFIG.HEADLESS && closeDelayMs > 0) {
		Logger.info(`   👋 (${closeDelaySeconds}초 뒤 브라우저를 닫습니다...)`);
		await Utils.sleep(closeDelayMs);
		if (browser) {
			await browser.close();
			Logger.info("   🔒 브라우저 세션 종료");
		}
	} else if (closeDelayMs === 0) {
		Logger.info("   🔒 브라우저를 닫지 않고 유지합니다.");
	} else {
		if (browser) await browser.close();
	}
}
}
};

module.exports = Core;
