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

/**
 * 1. 콘텐츠 생성 (Generate)
 * - AI에게 JSON 입력을 요청하여 제목, 키워드, 해시태그, 본문을 한 번에 받아옵니다.
 */
async function generateContent(jobData, customDir = null) {
    Logger.info("🚀 [Core] 콘텐츠 생성 프로세스 시작");

    const hasSubject = !!jobData.subject;
    const hasKeywords = jobData.keywords && jobData.keywords.length > 0;
    const hasRef = jobData.content_guide?.reference_urls && jobData.content_guide.reference_urls.length > 0;

    if (!hasSubject && !hasKeywords && !hasRef) {
        throw new Error("❌ [Error] 주제, 키워드, 참고 URL 중 적어도 하나는 제공되어야 합니다.");
    }

    let scrapedContext = "";
    if (hasRef) {
        Logger.info("📚 참고 자료(URL) 분석 중...");
        for (const url of jobData.content_guide.reference_urls) {
            const text = await Utils.fetchReferenceContent(url);
            if (text) {
                scrapedContext += `\n[Reference Content from ${url}]:\n${text}\n`;
            }
        }
    }

    const promptPath = CONFIG.SYSTEM_PROMPT_PATH || CONFIG.PROMPT_FILE;
    const systemPrompt = fs.readFileSync(promptPath, 'utf-8');
    
    const userPrompt = `
    [INPUT DATA]
    - **Subject**: ${jobData.subject || "(Empty - Please create a catchy title based on context)"}
    - **Keywords**: ${jobData.keywords?.join(', ') || "(Empty - Please extract 5 keywords)"}
    - **Additional Instructions**: ${jobData.content_guide?.additional_instructions || "None"}
    - **Image Count**: ${jobData.image_options?.count || 4}

    [REFERENCE CONTEXT]
    ${scrapedContext || "(No reference provided)"}
    
    Now, generate the output in strict JSON format.
    `;

    Logger.info("📝 Gemini에게 글 작성을 요청합니다... (One-Shot JSON)");
    
    const rawResult = await Utils.callGeminiText(systemPrompt + '\n' + userPrompt);
    if (!rawResult) throw new Error("API 응답이 비어있습니다.");

    let parsedData;
    try {
        const jsonString = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedData = JSON.parse(jsonString);
    } catch (e) {
        Logger.error("❌ JSON 파싱 실패. AI 응답을 확인하세요.");
        Logger.error(`원본 응답: ${rawResult}`);
        throw new Error("Content Generation Failed (JSON Parse Error)");
    }

    // 💡 [데이터 추출] 다중 키 체크 및 방어 로직
    const finalSubject = parsedData.title || parsedData.subject || jobData.subject || "제목 없음";
    const finalKeywords = parsedData.keywords || [];
    const finalHashtags = parsedData.hashtags || []; 
    const finalContent = parsedData.content || "";

    Logger.info(`✨ [Result] 제목 확정: "${finalSubject}"`);

    let targetDir;
    const safeSubject = Utils.sanitizeFileName(String(finalSubject));

    if (customDir) {
        targetDir = path.resolve(customDir);
    } else {
        const timestamp = moment().tz('Asia/Seoul').format('YYYYMMDD_HHmmss');
        targetDir = path.join(CONFIG.WORKSPACE_DIR, `${timestamp}_${safeSubject}`);
    }

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        Logger.info(`📂 작업 폴더 생성: ${targetDir}`);
    }

    // 💡 [본문 정제] AI가 본문에 제목(#)을 중복 포함했을 경우 제거
    // ^#\s+.+ 는 줄 시작의 '# 제목' 형태를 찾아내며, \n?로 줄바꿈까지 포함해 도려냅니다.
    const pureContent = finalContent.replace(/^#\s+.+\n?/, "").trim();

    // 💡 [본문 재구성] # 제목 + 정제된 본문 + 해시태그 순서로 결합
    const hashtagLine = finalHashtags.length > 0 
        ? "\n\n\n" + finalHashtags.map(tag => `#${tag}`).join(' ') 
        : "";
    
    // 파일의 완전성을 위해 첫 줄에 # 제목 삽입
    const fullFileContent = `# ${finalSubject}\n\n${pureContent}${hashtagLine}`;

    const contentFile = path.join(targetDir, 'contents.md');
    fs.writeFileSync(contentFile, fullFileContent, 'utf-8');
    Logger.info(`✅ 제목과 해시태그를 포함하여 contents.md 저장 완료 (중복 제목 방지 적용)`);

    return {
        targetDir: targetDir,
        finalSubject: finalSubject,
        finalKeywords: finalKeywords,
        finalHashtags: finalHashtags
    };
}

/**
 * 2. 이미지 생성 (Prepare Images)
 */
async function prepareImages(dirPath, jobData) {
    if (jobData.image_options?.generate === false) {
        Logger.info("🖼️ [Info] 이미지 생성 옵션이 false입니다. (Placeholder 유지)");
        return;
    }
    const contentFile = path.join(dirPath, 'contents.md');
    if (!fs.existsSync(contentFile)) return;

    // Utils.parseMarkdown이 파일 첫 줄(# 제목)을 자동으로 분리하여 contents에는 본문만 남깁니다.
    const { contents } = Utils.parseMarkdown(fs.readFileSync(contentFile, 'utf-8'));
    Logger.info('🖼️ 이미지 준비 중...');
    let lastCall = 0;
    for (const item of contents) {
        if (item.type !== 'image') continue;
        const prefix = String(item.index).padStart(2,'0');
        const exist = fs.readdirSync(dirPath).find(f => f.startsWith(`${prefix}_`) && /\.(png|jpg|jpeg|webp)$/i.test(f));
        if (exist) {
            Logger.info(`   ✅ [Skip] 기존 이미지 존재: ${exist}`);
            continue;
        }
        const now = Date.now();
        if (lastCall > 0 && (now - lastCall) < CONFIG.API_CALL_INTERVAL) await Utils.sleep(CONFIG.API_CALL_INTERVAL - (now - lastCall));
        Logger.info(`   🎨 생성 중 (Index ${item.index})`);
        const selectedStyle = jobData.image_options?.style || CONFIG.IMAGE_STYLE || 'photorealistic';
        const finalImagePrompt = `${item.prompt}, ${selectedStyle}, professional composition, high resolution, strictly no text, no letters, no watermark`;
        const savePath = path.join(dirPath, `${prefix}_image`);
        await Utils.callGeminiImage(finalImagePrompt, savePath);
        lastCall = Date.now();
    }
}

/**
 * 3. 블로그 발행 (Publish)
 */
async function publishToBlog(dirPath) {
    Logger.info(`🚀 [Step 5] 발행 시작: ${path.basename(dirPath)}`);
    const osName = IS_MAC ? "macOS" : "Windows/Linux";
    
    if (!fs.existsSync(CONFIG.AUTH_FILE_PATH)) throw new Error('auth.json 없음');
    
    const contentFile = path.join(dirPath, 'contents.md');
    if (!fs.existsSync(contentFile)) throw new Error(`콘텐츠 파일 없음: contents.md`);

    // 💡 여기서 파일의 첫 줄(# 제목)은 title로, 나머지는 contents 배열로 깔끔하게 분리됩니다.
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

        try {
            const cancelBtn = page.locator('.se-popup-button-cancel');
            if (await cancelBtn.count() > 0 && await cancelBtn.first().isVisible()) await cancelBtn.first().click();
            const closeHelp = page.locator('button.se-help-panel-close-button');
            if (await closeHelp.count() > 0 && await closeHelp.first().isVisible()) await closeHelp.first().click();
        } catch(e) {}
        await Utils.sleep(1000);

        // ✍️ 제목 입력 (정확하게 분리된 title만 입력)
        Logger.info(`   ✍️ 제목 입력: ${title}`);
        await page.locator('.se-documentTitle').click({ force: true });
        await page.keyboard.type(title, { 
            delay: Math.floor(Math.random() * (CONFIG.TYPING.MAX - CONFIG.TYPING.MIN + 1)) + CONFIG.TYPING.MIN 
        });
        
        await Utils.sleep(500);
        await page.keyboard.press('Enter'); 

        // ✍️ 본문 입력 (순수 본문 contents 배열 순회)
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
                    Logger.info(`      🖼️ 이미지 업로드: ${file}`);
                    const fileChooserPromise = page.waitForEvent('filechooser');
                    const photoBtn = page.locator('button:has-text("사진")').first();
                    if (await photoBtn.isVisible()) {
                        await photoBtn.click();
                        const chooser = await fileChooserPromise;
                        await chooser.setFiles(path.join(dirPath, file));
                        await Utils.sleep(CONFIG.WAIT.UPLOAD);
                    }
                }
            }
            await Utils.sleep(50);
        }

        Logger.info("   ✅ 본문 작성 완료.");

        // 임시 저장 및 발행 버튼 로직
        try {
            const saveBtn = page.locator('button.se-save-button, button:has-text("저장")');
            if (await saveBtn.count() > 0) {
                await saveBtn.first().click();
                await Utils.sleep(2000); 
            }
        } catch (e) {}

        const publishBtns = page.locator('button').filter({ hasText: /발행/ });
        if (await publishBtns.count() > 0) {
            for (let i = 0; i < await publishBtns.count(); i++) {
                const btn = publishBtns.nth(i);
                if (await btn.isVisible() && (await btn.innerText()).includes('발행')) {
                    await btn.click();
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

module.exports = { generateContent, prepareImages, publishToBlog };
