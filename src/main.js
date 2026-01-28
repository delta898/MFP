#!/usr/bin/env node

process.env.TZ = 'Asia/Seoul';
const crypto = require('crypto');
const BrowserLauncher = require('./browser-launcher');

// WebCrypto 폴리필 (Node.js 구버전 호환)
if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
}

// 경고 메시지 억제
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

// 모듈 로드
const License = require('./license'); // 수정한 license.js
const Core = require('./core');
const Utils = require('./utils'); 
const CONFIG = require('./config-loader'); 

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
    const browser = await BrowserLauncher.launchBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto('https://nid.naver.com/nidlogin.login');
        console.log("🔑 직접 로그인 완료 후 네이버 메인 이동 시 자동 저장됩니다.");
        await page.waitForURL(url => url.includes('naver.com') && !url.includes('nid.naver.com'), { timeout: 300000, waitUntil: 'domcontentloaded' });
        await context.storageState({ path: CONFIG.AUTH_FILE_PATH });
        console.log(`\n✅ 로그인 정보 저장 완료: ${CONFIG.AUTH_FILE_PATH}`);
        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error(`\n❌ 로그인 실패: ${e.message}`);
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
            // 주의: generate도 check_and_use_license를 호출하므로 횟수가 차감될 수 있습니다.
            // 차감을 원치 않으시면 서버 쪽에 '조회 전용' RPC를 따로 만드셔야 합니다.
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
            
            // 1. 라이선스 체크 및 차감
            const check = await License.verifyLicense();
            if (!check.success) { console.error(`⛔ ${check.message}`); process.exit(1); }

            await ensureAuth(true);

            const filePath = path.resolve(process.cwd(), opts.file);
            const topicData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            
            const result = await Core.generateContent(topicData, opts.dir);
            await Core.prepareImages(result.targetDir, topicData);
            await Core.publishToBlog(result.targetDir);

            console.log(`\n✅ 자동 발행 완료!`);
        } catch (e) { console.error('❌ 에러:', e); }
    });

// 4️⃣ Batch Command
program
    .command('batch', { hidden: false }) // 💡 배포용이므로 hidden: true 권장
    .description('📚 [배치] topics.xlsx 대량 포스팅')
    .option('-f, --file <path>', '엑셀 파일', 'topics.xlsx')
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Batch Mode] 작업을 시작합니다...");
            // 배치 시작 전 계정 인증 확인
            await ensureAuth(true);

            const excelPath = path.resolve(process.cwd(), opts.file);
            const topics = Utils.readExcelTopics(excelPath);
            
            if (topics.length === 0) {
                console.log("📭 처리할 새로운 주제가 없습니다.");
                return;
            }

            console.log(`📂 총 ${topics.length}개의 주제를 발견했습니다.`);

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < topics.length; i++) {
                const topicData = topics[i];
                const rowIndex = topicData.rowIndex;

                console.log(`\n---------------------------------------------------`);
                console.log(`[작업 ${i + 1}/${topics.length}] 라이선스 확인 중...`);

                // 🔥 [중요 수정] 배치 루프 안에서 매번 라이선스 검증(차감)을 수행해야 함
                // 만약 루프 밖에서 한 번만 하면, 1회 차감으로 100개를 발행하는 허점이 생김
                const check = await License.verifyLicense();
                if (!check.success) {
                    console.error(`\n⛔ [중단] 라이선스 문제 발생: ${check.message}`);
                    console.log(`👉 남은 ${topics.length - i}건은 처리되지 않았습니다.`);
                    break; // 루프 탈출
                }

                try {
                    console.log(`[진행] 주제: ${topicData.subject || '자동 생성 중'} (Row ${rowIndex+1})`);
                    Utils.updateExcelStatus(excelPath, rowIndex, 'processing', '작업 시작');

                    const result = await Core.generateContent(topicData);
                    await Core.prepareImages(result.targetDir, topicData);
                    await Core.publishToBlog(result.targetDir);

                    Utils.updateExcelStatus(excelPath, rowIndex, 'completed', '성공적으로 발행되었습니다.');
                    successCount++;
                    console.log(`✅ 발행 성공!`);
                } catch (err) {
                    console.error(`❌ 실패: ${err.message}`);
                    Utils.updateExcelStatus(excelPath, rowIndex, 'failed', err.message);
                    failCount++;
                }

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
            // Publish도 발행 행위이므로 라이선스 차감
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
