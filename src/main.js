#!/usr/bin/env node

process.env.TZ = 'Asia/Seoul';

// --------------------------------------------------------
// 🛠️ [Fix 1] Crypto Polyfill (Node 버전 호환성 확보)
// --------------------------------------------------------
const crypto = require('crypto');
if (!globalThis.crypto) {
    if (crypto.webcrypto) {
        globalThis.crypto = crypto.webcrypto;
    } else {
        globalThis.crypto = {
            getRandomValues: (buffer) => crypto.randomFillSync(buffer),
            subtle: {} 
        };
    }
}

// 불필요한 경고 메시지 숨기기 (punycode deprecated 등)
process.env.NODE_NO_WARNINGS = '1';
const originalWarn = console.warn;
console.warn = (...args) => {
    if (args[0] && args[0].includes && args[0].includes('deprecated')) return;
    originalWarn.apply(console, args);
};

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ✅ 분리된 모듈 불러오기
const License = require('./license');
const Core = require('./core');
const Utils = require('./utils'); 
const CONFIG = require('./config-loader'); 
const BrowserLauncher = require('./browser-launcher');
const Constants = require('./constants'); // 🔥 [필수] 상수를 수정하기 위해 불러옴

// --------------------------------------------------------
// 🛠️ [Fix 2] config.txt 설정을 읽어 API 모델 적용 (핵심!)
// --------------------------------------------------------
// 사용자가 config.txt에 'gemini-2.0-flash'라고 적으면, 
// 이를 실제 API 호출 주소(URL)로 변환하여 상수를 덮어씁니다.
const BASE_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

if (CONFIG.TEXT_MODEL) {
    Constants.GEMINI_TEXT_ENDPOINT = `${BASE_API_URL}/${CONFIG.TEXT_MODEL}:generateContent`;
    // console.log(`🧠 텍스트 모델 적용: ${CONFIG.TEXT_MODEL}`);
}

if (CONFIG.IMAGE_MODEL) {
    Constants.GEMINI_IMAGE_ENDPOINT = `${BASE_API_URL}/${CONFIG.IMAGE_MODEL}:generateContent`;
    // console.log(`🎨 이미지 모델 적용: ${CONFIG.IMAGE_MODEL}`);
}

// 타이핑 속도나 대기 시간 등 기타 설정은 Core나 BrowserLauncher에서 
// 직접 CONFIG를 참조하므로 여기서는 모델 URL만 처리하면 충분합니다.


console.log("⏳ BlogGenius 시스템 모듈을 로딩하고 있습니다...");

const program = new Command();

program
    .name('BlogGenius')
    .usage('[command] [options]')
    .version('0.2.0-alpha')
    .description('🤖 네이버 블로그 자동 포스팅 봇 - Topic 기반 엔진 (v0.2.0)');

// --- Helper Functions ---

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function performLogin() {
    console.log("\n🚀 [Login Mode] 네이버 로그인 브라우저를 엽니다...");
    
    // 브라우저 실행
    let browser;
    try {
        browser = await BrowserLauncher.launchBrowser();
    } catch (e) {
        console.error("❌ [Error] 브라우저 실행 실패:", e);
        return;
    }

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto('https://nid.naver.com/nidlogin.login');
        console.log("🔑 직접 로그인 완료 후 네이버 메인 이동 시 자동 저장됩니다.");
        
        // 로그인 성공 감지: URL이 nid.naver.com이 아니고 naver.com을 포함할 때
        await page.waitForURL(url => {
            const urlStr = url.toString(); 
            return urlStr.includes('naver.com') && !urlStr.includes('nid.naver.com');
        }, { timeout: 300000 }); // 5분 대기

        // 인증 정보 저장
        await context.storageState({ path: CONFIG.AUTH_FILE_PATH });
        console.log(`\n✅ 로그인 정보 저장 완료: ${CONFIG.AUTH_FILE_PATH}`);
        
        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error(`\n❌ 로그인 프로세스 실패: ${e.message}`);
        if (browser) await browser.close();
        process.exit(1);
    }
}

async function ensureAuth(isStrict = true) {
    if (fs.existsSync(CONFIG.AUTH_FILE_PATH)) return true;
    console.log("\n⚠️ [인증 확인] auth.json이 없습니다.");
    const answer = await askQuestion("   🚀 지금 로그인 하시겠습니까? (Y/n): ");
    if (answer.toLowerCase() === 'y' || answer === '') {
        await performLogin();
    } else if (isStrict) {
        process.exit(1);
    }
    return false;
}

// --- Commands ---

// 1️⃣ Login Command
program.command('login').description('🔐 [로그인]').action(async () => { await performLogin(); });

// 2️⃣ Generate Command
program
    .command('generate').alias('gen')
    .description('📝 [생성] 단일 주제 콘텐츠/이미지 생성 (발행X)')
    .option('-f, --file <path>', '작업 파일', 'topic.json')
    .option('-d, --dir <path>', '출력 폴더')
    .action(async (opts) => {
        try {
            const check = await License.verifyLicense();
            if (!check.success) { console.error(`⛔ ${check.message}`); process.exit(1); }

            await ensureAuth(false);
            const filePath = path.resolve(process.cwd(), opts.file);
            const topicData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            
            const result = await Core.generateContent(topicData, opts.dir);
            await Core.prepareImages(result.targetDir, topicData);
            
            console.log(`\n🏁 완료: ${result.targetDir}`);
        } catch (e) { console.error('❌ 에러:', e); }
    });

// 3️⃣ Auto Command
program
    .command('auto')
    .description('🚀 [자동] 단일 주제 생성부터 발행까지 논스톱 실행')
    .option('-f, --file <path>', '작업 파일', 'topic.json')
    .option('-d, --dir <path>', '출력 폴더')
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Auto Mode] 작업을 시작합니다...");
            
            const check = await License.verifyLicense();
            if (!check.success) { console.error(`⛔ ${check.message}`); process.exit(1); }

            await ensureAuth(true);

            const filePath = path.resolve(process.cwd(), opts.file);
            const topicData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            
            // 1. 콘텐츠 및 이미지 생성
            const result = await Core.generateContent(topicData, opts.dir);
            await Core.prepareImages(result.targetDir, topicData);
            
            // 2. 블로그 발행
            await Core.publishToBlog(result.targetDir);

            console.log(`\n✅ 자동 발행 완료!`);
        } catch (e) { console.error('❌ 에러:', e); }
    });

// 4️⃣ Batch Command
program
    .command('batch', { hidden: true })
    .description('📚 [배치] topics.xlsx 대량 포스팅')
    .option('-f, --file <path>', '엑셀 파일', 'topics.xlsx')
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Batch Mode] 작업을 시작합니다...");
            await ensureAuth(true);

	    // [New] 데이터 소스 분기 처리
            let topics = [];
            const isGoogle = (CONFIG.DATA_SOURCE === 'GOOGLE'); // config-loader에서 읽어온 값

            if (isGoogle) {
                console.log(`📡 구글 스프레드시트 모드로 실행합니다.`);
                topics = await Utils.readGoogleSheetTopics();
            } else {
                console.log(`📂 로컬 엑셀 모드로 실행합니다.`);
                const excelPath = path.resolve(process.cwd(), opts.file);
                topics = Utils.readExcelTopics(excelPath);
            }

            console.log(`📂 총 ${topics.length}개의 주제를 발견했습니다.`);

            if (topics.length === 0) {
                console.log("📭 처리할 새로운 주제가 없습니다.");
                return;
            }

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < topics.length; i++) {
                const topicData = topics[i];
                const rowIndex = topicData.rowIndex;

                console.log(`\n---------------------------------------------------`);
                console.log(`[작업 ${i + 1}/${topics.length}] 라이선스 확인 중...`);

                const check = await License.verifyLicense();
                if (!check.success) {
                    console.error(`\n⛔ [중단] 라이선스 문제 발생: ${check.message}`);
                    console.log(`👉 남은 ${topics.length - i}건은 처리되지 않았습니다.`);
                    break;
                }

                try {
                    console.log(`[진행] 주제: ${topicData.subject || '자동 생성 중'} (Row ${rowIndex+1})`);
		    // [New] 상태 업데이트 분기
                    if (isGoogle) await Utils.updateGoogleSheetStatus(rowIndex, '발행 중', '작업 시작');
                    else Utils.updateExcelStatus(path.resolve(process.cwd(), opts.file), rowIndex, '발행 중', '작업 시작');

                    // 생성 -> 이미지 -> 발행 순차 진행
                    const result = await Core.generateContent(topicData);
                    await Core.prepareImages(result.targetDir, topicData);
                    await Core.publishToBlog(result.targetDir);

		    // [New] 완료 상태 업데이트 분기
                    if (isGoogle) await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 완료', '발행 완료');
                    else Utils.updateExcelStatus(path.resolve(process.cwd(), opts.file), rowIndex, '블로그 발행 완료', '성공적으로 발행되었습니다.');

                    successCount++;

                    console.log(`✅ 발행 성공!`);
                } catch (err) {
                    console.error(`❌ 실패: ${err.message}`);
		    // [New] 실패 상태 업데이트 분기
                    if (isGoogle) await Utils.updateGoogleSheetStatus(rowIndex, '실패', err.message);
                    else Utils.updateExcelStatus(path.resolve(process.cwd(), opts.file), rowIndex, '실패', err.message);

                    failCount++;
                }

                // 다음 작업 전 대기 (config.txt 설정값 사용)
                if (i < topics.length - 1) {
                    const delay = CONFIG.BATCH_INTERVAL_SECONDS || 30;
                    console.log(`⏳ ${delay}초 대기 중...`);
                    await Utils.sleep(delay * 1000);
                }
            }
            
            console.log(`\n===================================================`);
            console.log(`🎉 배치 작업 종료`);
            console.log(`📊 결과: 성공 ${successCount} / 실패 ${failCount}`);
            console.log(`===================================================`);

        } catch (e) { console.error('❌ 에러:', e); }
    });

// 5️⃣ Publish Command
program
    .command('publish').alias('pub')
    .description('📤 [발행] 폴더 업로드')
    .requiredOption('-d, --dir <path>', '폴더 경로')
    .action(async (opts) => {
        try {
            const check = await License.verifyLicense();
            if (!check.success) { console.error(`⛔ ${check.message}`); process.exit(1); }

            await ensureAuth(true);
            await Core.publishToBlog(path.resolve(opts.dir));
            console.log("\n🎉 발행 완료.");
        } catch (e) { console.error('❌ 에러:', e); }
    });

program.on('--help', () => {
    console.log('');
    console.log('📖 사용 예시:');
    console.log('  $ ./BlogGenius login');
    console.log('  $ ./BlogGenius auto -f topic.json');
});

program.parse(process.argv);
