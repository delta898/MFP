// src/core.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('../config/settings');
const Utils = require('./utils');

// OS 감지 (단축키 설정용)
const IS_MAC = process.platform === 'darwin';
const CMD_KEY = IS_MAC ? 'Meta' : 'Control';

/**
 * 1. 콘텐츠 생성 (Generate)
 * - AI에게 JSON 입력을 요청하여 제목, 키워드, 본문을 한 번에 받아옵니다.
 */
async function generateContent(jobData, customDir = null) {
    console.log("\n🚀 [Core] 콘텐츠 생성 프로세스 시작");

    // 1. 최소 요건 검증
    const hasSubject = !!jobData.subject;
    const hasKeywords = jobData.keywords && jobData.keywords.length > 0;
    const hasRef = jobData.content_guide?.reference_urls && jobData.content_guide.reference_urls.length > 0;

    if (!hasSubject && !hasKeywords && !hasRef) {
        throw new Error("❌ [Error] 주제, 키워드, 참고 URL 중 적어도 하나는 제공되어야 합니다.");
    }

    // 2. 참고 자료 스크래핑 (URL이 있는 경우)
    let scrapedContext = "";
    if (hasRef) {
        console.log("📚 참고 자료(URL) 분석 중...");
        for (const url of jobData.content_guide.reference_urls) {
            const text = await Utils.fetchReferenceContent(url);
            if (text) {
                scrapedContext += `\n[Reference Content from ${url}]:\n${text}\n`;
            }
        }
    }

    // 3. 프롬프트 구성
    const systemPrompt = fs.readFileSync(CONFIG.PROMPT_FILE, 'utf-8');
    
    // AI에게 "빈칸은 네가 채워라"고 지시하는 User Prompt
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

    console.log("📝 Gemini에게 글 작성을 요청합니다... (One-Shot JSON)");
    
    // 4. API 호출
    const rawResult = await Utils.callGeminiText(systemPrompt + '\n' + userPrompt);
    if (!rawResult) throw new Error("API 응답이 비어있습니다.");

    // 5. JSON 파싱
    let parsedData;
    try {
        // 마크다운 코드블록 제거 (```json ... ```)
        const jsonString = rawResult.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedData = JSON.parse(jsonString);
    } catch (e) {
        console.error("❌ JSON 파싱 실패. AI 응답을 확인하세요.", e);
        console.error("원본 응답:", rawResult);
        throw new Error("Content Generation Failed (JSON Parse Error)");
    }

    // 6. 결과 추출
    const finalSubject = parsedData.subject;
    const finalKeywords = parsedData.keywords || [];
    const finalContent = parsedData.content;

    console.log(`\n✨ [Result] 제목 확정: "${finalSubject}"`);
    console.log(`   [Result] 키워드: ${finalKeywords.join(', ')}`);

    // 7. 폴더 생성 (확정된 제목 사용)
    let targetDir;
    if (customDir) {
        targetDir = path.resolve(customDir);
    } else {
        const now = new Date();
        const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g,'');
        const safeSubject = Utils.sanitizeFileName(finalSubject);
        targetDir = path.join(CONFIG.WORKSPACE_DIR, `${dateStr}_${timeStr}_${safeSubject}`);
    }

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`📂 작업 폴더 생성: ${targetDir}`);
    }

    // 8. 파일 저장
    const contentFile = path.join(targetDir, 'contents.md');
    fs.writeFileSync(contentFile, finalContent, 'utf-8');
    console.log(`✅ 본문 저장 완료: contents.md`);

    // 🔥 Batch 업데이트를 위해 결과 반환
    return {
        targetDir: targetDir,
        finalSubject: finalSubject,
        finalKeywords: finalKeywords
    };
}

/**
 * 2. 이미지 생성 (Prepare Images)
 */
async function prepareImages(dirPath, jobData) {
    if (jobData.image_options?.generate === false) {
        console.log("🖼️ [Info] 이미지 생성 옵션이 false입니다. (Placeholder 유지)");
        return;
    }
    
    const contentFile = path.join(dirPath, 'contents.md');
    if (!fs.existsSync(contentFile)) return;

    // 파싱 함수를 통해 이미지 위치 확인
    const { contents } = Utils.parseMarkdown(fs.readFileSync(contentFile, 'utf-8'));
    console.log('🖼️ 이미지 준비 중...');
    let lastCall = 0;
    
    for (const item of contents) {
        if (item.type !== 'image') continue;
        const prefix = String(item.index).padStart(2,'0');
        
        // 이미 생성된 파일이 있는지 확인
        const exist = fs.readdirSync(dirPath).find(f => f.startsWith(`${prefix}_`) && /\.(png|jpg|jpeg|webp)$/i.test(f));
        
        if (exist) {
            console.log(`   ✅ [Skip] 기존 이미지 존재: ${exist}`);
            continue;
        }
        
        const now = Date.now();
        if (lastCall > 0 && (now - lastCall) < CONFIG.API_CALL_INTERVAL) await Utils.sleep(CONFIG.API_CALL_INTERVAL - (now - lastCall));
        
        console.log(`   🎨 생성 중 (Index ${item.index})`);
        
        // 스타일 적용
        const finalImagePrompt = `${item.prompt}, ${jobData.image_options?.style || 'photorealistic'}`;
        const savePath = path.join(dirPath, `${prefix}_image`);

        await Utils.callGeminiImage(finalImagePrompt, savePath);
        lastCall = Date.now();
    }
}

/**
 * 3. 블로그 발행 (Publish)
 */
async function publishToBlog(dirPath) {
    console.log(`🚀 [Step 5] 발행 시작: ${dirPath}`);
    
    const osName = IS_MAC ? "macOS" : "Windows/Linux";
    console.log(`   🖥️  OS 감지: ${osName} (Modifier Key: ${CMD_KEY})`);

    if (CONFIG.HEADLESS) console.log("   👻 Headless 모드로 실행 중 (화면 숨김)");

    if (!fs.existsSync(CONFIG.AUTH_FILE_PATH)) throw new Error('auth.json 없음');
    
    const contentFile = path.join(dirPath, 'contents.md');
    if (!fs.existsSync(contentFile)) throw new Error(`콘텐츠 파일 없음: contents.md`);

    const { title, contents } = Utils.parseMarkdown(fs.readFileSync(contentFile, 'utf-8'));

    const browser = await chromium.launch({ headless: CONFIG.HEADLESS });
    const context = await browser.newContext({ storageState: CONFIG.AUTH_FILE_PATH, viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    page.on('dialog', async dialog => await dialog.dismiss());

    try {
        await page.goto(CONFIG.WRITE_URL, { waitUntil: 'domcontentloaded' });
        await Utils.sleep(CONFIG.WAIT.LOAD);

        // 팝업 닫기
        try {
            const cancelBtn = page.locator('.se-popup-button-cancel');
            if (await cancelBtn.count() > 0 && await cancelBtn.first().isVisible()) await cancelBtn.first().click();
            const closeHelp = page.locator('button.se-help-panel-close-button');
            if (await closeHelp.count() > 0 && await closeHelp.first().isVisible()) await closeHelp.first().click();
        } catch(e) {}
        await Utils.sleep(1000);

        // 제목 입력
        console.log(`   ✍️ 제목: ${title}`);
        await page.locator('.se-documentTitle').click({ force: true });
        await page.keyboard.type(title);
        
        await Utils.sleep(500);
        await page.keyboard.press('Enter'); 
        await Utils.sleep(500);

        // 본문 입력
        for (const item of contents) {
            if (item.type === 'header-h2') {
                console.log(`      📌 소제목: ${item.text}`);
                await page.keyboard.press('Enter'); 
                await Utils.sleep(100);
                await page.keyboard.type(item.text); 
                await Utils.sleep(300);

                // 소제목 스타일링
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
                } catch (e) {
                    console.warn("         ⚠️ 스타일 적용 실패 (패스)");
                }
                
                await Utils.sleep(200);
                await page.keyboard.press('Enter'); 
                await Utils.sleep(100);
            }
            else if (item.type === 'paragraph') {
                console.log(`      ✏️ 본문: ${item.text.substring(0, 15)}...`);
                await page.keyboard.type(item.text);
                // URL 자동 링크 방지용 공백
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
                    console.log(`      🖼️ 이미지 업로드: ${file}`);
                    const fileChooserPromise = page.waitForEvent('filechooser');
                    const photoBtn = page.locator('button:has-text("사진")').first();
                    if (await photoBtn.isVisible()) {
                        await photoBtn.click();
                        const chooser = await fileChooserPromise;
                        await chooser.setFiles(path.join(dirPath, file));
                        await Utils.sleep(CONFIG.WAIT.UPLOAD);
                    }
                } else {
                    // 🔥 [중요] 이미지가 없을 때 Placeholder 텍스트 입력
                    console.log(`      📝 이미지 없음 -> Placeholder 입력`);
                    await page.keyboard.type(`[[IMAGE_${item.index} : ${item.prompt}]]`);
                    await page.keyboard.press('Enter');
                }
            }
            await Utils.sleep(50);
        }

        console.log("   ✅ 본문 작성 완료.");

        // 임시 저장
        try {
            console.log("   💾 [임시 저장] 시도...");
            const saveBtn = page.locator('button.se-save-button, button:has-text("저장")');
            if (await saveBtn.count() > 0) {
                await saveBtn.first().click();
                await Utils.sleep(2000); 
            }
        } catch (e) { console.warn("      ⚠️ 저장 실패 (무시):", e.message); }

        // 발행 버튼 클릭 (최종 발행은 사용자가 확인 후 하도록 창만 띄움)
        const publishBtns = page.locator('button').filter({ hasText: /발행/ });
        if (await publishBtns.count() > 0) {
            for (let i = 0; i < await publishBtns.count(); i++) {
                const btn = publishBtns.nth(i);
                if (await btn.isVisible() && (await btn.innerText()).includes('발행')) {
                    await btn.click();
                    console.log("   🚀 [발행] 버튼 클릭 성공 (설정창 오픈)");
                    break;
                }
            }
        }

    } catch (e) {
        console.error('❌ 에러:', e);
    }
}

module.exports = { generateContent, prepareImages, publishToBlog };
