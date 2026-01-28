process.env.TZ = 'Asia/Seoul';
const crypto = require('crypto');
const BrowserLauncher = require('./browser-launcher');

if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
}

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
const License = require('./license');
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
        await page.waitForURL('https://www.naver.com/', { timeout: 300000, waitUntil: 'domcontentloaded' });
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

// 1️⃣ Login Command
program.command('login').description('🔐 [로그인]').action(async () => { await performLogin(); });

// 2️⃣ Generate Command (gen)
program
    .command('generate').alias('gen')
    .description('📝 [생성] 단일 주제 콘텐츠/이미지 생성 (발행X)')
    .option('-f, --file <path>', '작업 파일', 'topic.json')
    .option('-d, --dir <path>', '출력 폴더')
    .action(async (opts) => {
        try {
            const check = await License.verifyLicense();
            if (!check.success) process.exit(1);
            await ensureAuth(false);
            const filePath = path.resolve(process.cwd(), opts.file);
            const topicData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const result = await Core.generateContent(topicData, opts.dir);
            await Core.prepareImages(result.targetDir, topicData);
            console.log(`\n🏁 완료: ${result.targetDir}`);
        } catch (e) { console.error('❌ 에러:', e); }
    });

// 3️⃣ Auto Command (단일 건 생성부터 발행까지) - 💡 다시 살려냈습니다!
program
    .command('auto')
    .description('🚀 [자동] 단일 주제 생성부터 발행까지 논스톱 실행')
    .option('-f, --file <path>', '작업 파일', 'topic.json')
    .option('-d, --dir <path>', '출력 폴더')
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Auto Mode] 작업을 시작합니다...");
            const check = await License.verifyLicense();
            if (!check.success) process.exit(1);
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
    .command('batch', { hidden: false })
    .description('📚 [배치] topics.xlsx 대량 포스팅')
    .option('-f, --file <path>', '엑셀 파일', 'topics.xlsx')
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Batch Mode] 작업을 시작합니다...");
            const check = await License.verifyLicense();
            if (!check.success) process.exit(1);
            await ensureAuth(true);

            const excelPath = path.resolve(process.cwd(), opts.file);
            const topics = await Utils.readExcelTopics(excelPath);
            
            if (topics.length === 0) {
                console.log("📂 처리할 새로운 주제가 없습니다.");
                return;
            }

            console.log(`📂 총 ${topics.length}개의 주제를 발견했습니다.`);

            for (let i = 0; i < topics.length; i++) {
                const topicData = topics[i];
                const rowIndex = topicData.rowIndex;

                try {
                    console.log(`\n[작업 ${i + 1}/${topics.length}] 주제: ${topicData.subject || '자동 생성 중'}`);
                    Utils.updateExcelStatus(excelPath, rowIndex, 'processing', '작업 시작');

                    const result = await Core.generateContent(topicData);
                    await Core.prepareImages(result.targetDir, topicData);
                    await Core.publishToBlog(result.targetDir);

                    Utils.updateExcelStatus(excelPath, rowIndex, 'completed', '성공적으로 발행되었습니다.');
                } catch (err) {
                    console.error(`❌ 실패: ${err.message}`);
                    Utils.updateExcelStatus(excelPath, rowIndex, 'failed', err.message);
                }

                if (i < topics.length - 1) {
                    const delay = CONFIG.BATCH_INTERVAL_SECONDS || 30;
                    console.log(`⏱️ ${delay}초 대기 중...`);
                    await Utils.sleep(delay * 1000);
                }
            }
        } catch (e) { console.error('❌ 에러:', e); }
    });

// 5️⃣ Publish Command
program
    .command('publish').alias('pub')
    .description('📤 [발행] 폴더 업로드')
    .requiredOption('-d, --dir <path>', '폴더 경로')
    .action(async (opts) => {
        try {
            await ensureAuth(true);
            await Core.publishToBlog(path.resolve(opts.dir));
        } catch (e) { console.error('❌ 에러:', e); }
    });

program.parse(process.argv);
