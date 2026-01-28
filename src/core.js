const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('./config-loader');
const Utils = require('./utils');
const Logger = require('./logger'); 
const BrowserLauncher = require('./browser-launcher');
const moment = require('moment-timezone');

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

        let scrapedContext = "";
        if (hasRef) {
            Logger.info("📚 참고 자료(URL) 분석 중...");
            for (const url of jobData.content_guide.reference_urls) {
                const text = await Utils.fetchReferenceContent(url);
                if (text) scrapedContext += `\n[Reference from ${url}]:\n${text}\n`;
            }
        }

        const promptPath = CONFIG.SYSTEM_PROMPT_PATH || CONFIG.PROMPT_FILE;
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

        Logger.info("📝 Gemini에게 글 작성을 요청합니다...");
        const rawResult = await Utils.callGeminiText(systemPrompt + '\n' + userPrompt);
        if (!rawResult) throw new Error("API 응답이 비어있습니다.");

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

        let targetDir;
        const safeSubject = Utils.sanitizeFileName(String(finalSubject));
        if (customDir) {
            targetDir = path.resolve(customDir);
        } else {
            const timestamp = moment().tz('Asia/Seoul').format('YYYYMMDD_HHmmss');
            targetDir = path.join(CONFIG.WORKSPACE_DIR, `${timestamp}_${safeSubject}`);
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
            const style = jobData.image_options?.style || 'photorealistic';
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
        
        if (!fs.existsSync(CONFIG.AUTH_FILE_PATH)) throw new Error('auth.json 없음');
        
        const contentFile = path.join(dirPath, 'contents.md');
        if (!fs.existsSync(contentFile)) throw new Error(`콘텐츠 파일 없음: contents.md`);

        const { title, contents } = Utils.parseMarkdown(fs.readFileSync(contentFile, 'utf-8'));

        const browser = await BrowserLauncher.launchBrowser();
        const context = await browser.newContext({ 
            storageState: CONFIG.AUTH_FILE_PATH, 
            viewport: CONFIG.VIEWPORT,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        });

        const page = await context.newPage();
        page.on('dialog', async dialog => await dialog.dismiss());

        try {
            Logger.info("   🔄 블로그 에디터 접속 중...");
            await page.goto(CONFIG.WRITE_URL, { waitUntil: 'domcontentloaded' });
            await Utils.sleep(CONFIG.WAIT.LOAD);

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

            // ✍️ 제목 입력 (랜덤 타이핑 속도 적용)
            Logger.info(`   ✍️ 제목 입력: ${title}`);
            await page.locator('.se-documentTitle').click({ force: true });
            await page.keyboard.type(title, { 
                delay: Math.floor(Math.random() * (CONFIG.TYPING.MAX - CONFIG.TYPING.MIN + 1)) + CONFIG.TYPING.MIN 
            });
            await page.keyboard.press('Enter'); 

            // ✍️ 본문 입력 루프
            for (const item of contents) {
		    if (item.type === 'header-h2') {
			    Logger.info(`      📌 소제목: ${item.text}`);
			    await page.keyboard.press('Enter'); 
			    await page.keyboard.type(item.text, { 
delay: Math.floor(Math.random() * (CONFIG.TYPING.MAX - CONFIG.TYPING.MIN + 1)) + CONFIG.TYPING.MIN 
});
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
await page.keyboard.press('Enter'); 
}
                else if (item.type === 'paragraph') {
                    await page.keyboard.type(item.text, { 
                        delay: Math.floor(Math.random() * (CONFIG.TYPING.MAX - CONFIG.TYPING.MIN + 1)) + CONFIG.TYPING.MIN 
                    });
                    if (item.text.includes('http')) await page.keyboard.press('Space'); // 링크 활성화
                    await page.keyboard.press('Enter');
                }
                else if (item.type === 'newline') {
                    await page.keyboard.press('Enter');
                }
                else if (item.type === 'image') {
                    const prefix = String(item.index).padStart(2,'0');
                    const file = fs.readdirSync(dirPath).find(f => f.startsWith(`${prefix}_`) && /\.(png|jpg|jpeg|webp)$/i.test(f));
                    
                    if (file) {
                        Logger.info(`      🖼️ 이미지 업로드: ${file}`);
                        const fileChooserPromise = page.waitForEvent('filechooser');
                        const photoBtn = page.locator('button:has-text("사진")').first();
                        if (await photoBtn.isVisible()) {
                            await photoBtn.click();
                            const chooser = await fileChooserPromise;
                            await chooser.setFiles(path.join(dirPath, file));
                            await Utils.sleep(CONFIG.WAIT.UPLOAD);
                        }
                    } else {
                        // 이미지 없을 시 가이드 텍스트 입력
                        Logger.info(`      📝 이미지 가이드 입력 (Index ${item.index})`);
                        const guideText = `\n[ 이미지 가이드 ${item.index}번 ]\n(추천 프롬프트: ${item.prompt})\n`;
                        await page.keyboard.type(guideText, { delay: 30 });
                        await page.keyboard.press('Enter');
                    }
                }
                await Utils.sleep(50);
            }

            Logger.info("   ✅ 본문 작성 완료");

	    // 💾 [추가됨] 임시 저장 로직 (사용자 요청 반영)
            try {
                Logger.info("   💾 안전을 위해 임시저장을 시도합니다...");
                // '저장' 버튼 찾기 (클래스명 또는 텍스트 기반)
                const saveBtn = page.locator('button.se-save-button, button:has-text("저장")').first();
                if (await saveBtn.isVisible()) {
                    await saveBtn.click();
                    await Utils.sleep(2000); // 저장 완료 대기
                    Logger.info("   ✅ 임시저장 완료");
                }
            } catch (e) {
                Logger.warn("   ⚠️ 임시저장 버튼을 찾지 못해 건너뜁니다 (치명적이지 않음)");
            }

            // 🚀 발행 버튼 클릭
            Logger.info("   🚀 발행 설정창 오픈 중...");
            const publishBtns = page.locator('button').filter({ hasText: /발행/ });
            if (await publishBtns.count() > 0) {
                for (let i = 0; i < await publishBtns.count(); i++) {
                    const btn = publishBtns.nth(i);
                    if (await btn.isVisible() && (await btn.innerText()).includes('발행')) {
                        await btn.click();
                        await Utils.sleep(2000); 
                        Logger.info("   🚀 [발행] 설정창 오픈 완료");
                        break;
                    }
                }
            }

        } catch (e) {
            Logger.error(`❌ 에러 발생: ${e.message}`);
            throw e;
        } finally {
            if (!CONFIG.HEADLESS) {
                Logger.info(`   👋 (${CONFIG.CLOSE_DELAY / 1000}초 뒤 브라우저를 닫습니다...)`);
                await Utils.sleep(CONFIG.CLOSE_DELAY);
            }
            if (browser) {
                await browser.close();
                Logger.info("   🔒 브라우저 세션 종료");
            }
        }
    }
};

module.exports = Core;
