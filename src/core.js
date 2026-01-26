const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('../config/settings');
const Utils = require('./utils');

// 🔥 [호환성 패치] OS에 따른 단축키 modifier 설정
// Mac('darwin')이면 'Meta'(Command), Windows/Linux면 'Control'
const IS_MAC = process.platform === 'darwin';
const CMD_KEY = IS_MAC ? 'Meta' : 'Control';

async function generateContent(jobData, customDir = null) {
    console.log("📂 [Step 1] 작업 공간 확인...");
    
    let targetDir;

    // 1. 폴더 경로 결정
    if (customDir) {
        targetDir = path.resolve(customDir);
        console.log(`   👉 사용자 지정 폴더 사용: ${targetDir}`);
        if (!fs.existsSync(targetDir)) {
            console.log(`   ✨ 폴더가 없어서 새로 생성합니다.`);
            fs.mkdirSync(targetDir, { recursive: true });
        }
    } else {
        const now = new Date();
        const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g,'');
        const safeSubject = Utils.sanitizeFileName(jobData.subject);
        targetDir = path.join(CONFIG.WORKSPACE_DIR, `${dateStr}_${timeStr}_${safeSubject}`);
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`   ✨ 새 작업 폴더 생성: ${targetDir}`);
    }
    
    // 2. contents.md 존재 여부 체크 (Overwrite 금지)
    const contentFile = path.join(targetDir, 'contents.md');
    if (fs.existsSync(contentFile)) { 
        console.log(`   ⚠️ [Skip] contents.md 파일이 이미 존재합니다.`);
        console.log(`   👉 기존 글을 유지하고 이미지 생성 단계로 넘어갑니다.`);
        return targetDir; 
    }

    // 3. 글 작성
    const systemPrompt = fs.readFileSync(CONFIG.PROMPT_FILE, 'utf-8');
    let refText = "";
    if (jobData.content_guide?.reference_urls) {
        console.log(`📚 참고 자료 스크래핑...`);
        for (const url of jobData.content_guide.reference_urls) {
            const txt = await Utils.fetchReferenceContent(url);
            if(txt) refText += `\n[Ref: ${url}]\n${txt}\n`;
        }
    }
    
    let imageCountInstruction = "";
    if (jobData.image_options?.count) {
        imageCountInstruction = `\n- **[중요/Override]**: 본문에 삽입할 IMAGE 블록의 개수는 정확히 **${jobData.image_options.count}개**로 맞춰주세요. (기본 설정 무시)`;
    }

    const userPrompt = `[주제]: ${jobData.subject}
[키워드]: ${jobData.keywords.join(', ')}
[지침]: ${jobData.content_guide?.additional_instructions || ''}${imageCountInstruction}
[참고]: ${refText}`;
    
    console.log('\n📮 [Debug] Gemini에게 전송되는 User Prompt (Raw):');
    console.log('===================================================');
    console.log(userPrompt);
    console.log('===================================================\n');

    console.log('📝 Gemini 글 작성 중...');
    
    let text = await Utils.callGeminiText(systemPrompt + '\n' + userPrompt);
    if (!text) throw new Error('API 응답 없음');
    
    fs.writeFileSync(contentFile, text.replace(/^```markdown\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, ''), 'utf-8');
    console.log(`✅ 글 저장 완료: contents.md`);
    
    return targetDir;
}

async function prepareImages(dirPath, jobData) {
    if (jobData.image_options?.generate === false) return;
    
    const contentFile = path.join(dirPath, 'contents.md');
    if (!fs.existsSync(contentFile)) return;

    const { contents } = Utils.parseMarkdown(fs.readFileSync(contentFile, 'utf-8'));
    console.log('🖼️ 이미지 준비 중...');
    let lastCall = 0;
    
    for (const item of contents) {
        if (item.type !== 'image') continue;
        const prefix = String(item.index).padStart(2,'0');
        
        const exist = fs.readdirSync(dirPath).find(f => f.startsWith(`${prefix}_`) && /\.(png|jpg|jpeg|webp)$/i.test(f));
        
        if (exist) {
            console.log(`   ✅ [Skip] 기존 이미지 존재: ${exist}`);
            continue;
        }
        
        const now = Date.now();
        if (lastCall > 0 && (now - lastCall) < CONFIG.API_CALL_INTERVAL) await Utils.sleep(CONFIG.API_CALL_INTERVAL - (now - lastCall));
        
        console.log(`   🎨 생성 중 (Index ${item.index})`);
        
        const finalImagePrompt = `${item.prompt}, ${jobData.image_options?.style || ''}`;
        console.log(`      👉 Request Prompt: "${finalImagePrompt}"`);

        const saved = await Utils.callGeminiImage(finalImagePrompt, path.join(dirPath, `${prefix}_image`));
        if (saved) lastCall = Date.now();
    }
}

async function publishToBlog(dirPath) {
    console.log(`🚀 [Step 5] 발행 시작: ${dirPath}`);
    
    // OS 정보 출력
    const osName = IS_MAC ? "macOS" : "Windows/Linux";
    console.log(`   🖥️  OS 감지: ${osName} (Modifier Key: ${CMD_KEY})`);

    if (CONFIG.HEADLESS) console.log("   👻 Headless 모드로 실행 중 (브라우저 화면이 보이지 않습니다)");

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

        try {
            const cancelBtn = page.locator('.se-popup-button-cancel');
            if (await cancelBtn.count() > 0 && await cancelBtn.first().isVisible()) await cancelBtn.first().click();
            const closeHelp = page.locator('button.se-help-panel-close-button');
            if (await closeHelp.count() > 0 && await closeHelp.first().isVisible()) await closeHelp.first().click();
        } catch(e) {}
        await Utils.sleep(1000);

        console.log(`   ✍️ 제목: ${title}`);
        await page.locator('.se-documentTitle').click({ force: true });
        await page.keyboard.type(title);
        
        await Utils.sleep(500);
        await page.keyboard.press('Enter'); 
        console.log("      -> [Enter] 키로 본문 영역 이동");
        await Utils.sleep(500);

        for (const item of contents) {
            if (item.type === 'header-h2') {
                console.log(`      📌 소제목: ${item.text}`);
                await page.keyboard.press('Enter'); 
                await Utils.sleep(100);
                await page.keyboard.type(item.text); 
                await Utils.sleep(300);

                try {
                    const toolbarBtn = page.locator('button[data-name="text-format"]');
                    if (await toolbarBtn.isVisible()) {
                        await toolbarBtn.click();
                        await Utils.sleep(200); 
                        const subTitleBtn = page.getByRole('button', { name: '소제목' });
                        if (await subTitleBtn.isVisible()) {
                            await subTitleBtn.click();
                            console.log("         -> 스타일 적용 완료");
                        } else {
                             // 🔥 [수정] OS에 맞는 키 조합 사용
                             await page.keyboard.press(`${CMD_KEY}+B`); 
                             console.log(`         -> 볼드체 적용 (${CMD_KEY}+B)`);
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
                    console.log(`      🖼️ 이미지: ${file}`);
                    const fileChooserPromise = page.waitForEvent('filechooser');
                    const photoBtn = page.locator('button:has-text("사진")').first();
                    if (await photoBtn.isVisible()) {
                        await photoBtn.click();
                        const chooser = await fileChooserPromise;
                        await chooser.setFiles(path.join(dirPath, file));
                        await Utils.sleep(CONFIG.WAIT.UPLOAD);
                    }
                } else {
                    await page.keyboard.type(`[이미지 없음]`);
                    await page.keyboard.press('Enter');
                }
            }
            await Utils.sleep(50);
        }

        console.log("   ✅ 본문 작성 완료.");

        try {
            console.log("   💾 [임시 저장] 시도...");
            const saveBtn = page.locator('button.se-save-button, button:has-text("저장")');
            if (await saveBtn.count() > 0) {
                await saveBtn.first().click();
                console.log("      -> 저장 버튼 클릭 완료!");
                await Utils.sleep(2000); 
            } else {
                console.warn("      ⚠️ 저장 버튼을 찾을 수 없습니다.");
            }
        } catch (e) {
            console.warn("      ⚠️ 저장 중 오류 (무시하고 진행):", e.message);
        }

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
