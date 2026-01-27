const crypto = require('crypto');
const BrowserLauncher = require('./browser-launcher');

// 1. [필수] Node 18 및 pkg 환경에서 WebCrypto 강제 활성화 (Supabase 에러 해결)
if (!globalThis.crypto) {
    globalThis.crypto = crypto.webcrypto;
}

// 2. [필수] 경고 메시지 무시 (Supabase Deprecation 경고 숨김)
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
const { chromium } = require('playwright'); // 🔥 로그인 직접 실행을 위해 추가
const License = require('./license');
const Core = require('./core');

// 🔥 [중요] config-loader를 사용해야 경로 문제(/snapshot 에러)가 해결됩니다.
const CONFIG = require('./config-loader'); 

console.log("⏳ 시스템 모듈을 로딩하고 있습니다...");

const program = new Command();

program
    .name('BlogGenius')
    .usage('[command] [options]')
    .version('1.0.0')
    .description('🤖 네이버 블로그 자동 포스팅 봇 CLI');

// 📌 [함수] 사용자 입력 받기
function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// 📌 [함수] 로그인 로직 (pkg 호환성을 위해 main.js 내부에 통합)
async function performLogin() {
    console.log("\n🚀 [Login Mode] 네이버 로그인 브라우저를 엽니다...");

    const browser = await BrowserLauncher.launchBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto('https://nid.naver.com/nidlogin.login');
        console.log("🔑 브라우저가 뜨면 사용자가 직접 로그인해주세요. (2단계 인증 포함)");
        console.log("⏳ 로그인이 완료되어 네이버 메인으로 이동하면 자동으로 저장하고 종료됩니다.");

        // 네이버 메인으로 이동할 때까지 대기 (최대 5분)
        await page.waitForURL('https://www.naver.com/', { timeout: 300000, waitUntil: 'domcontentloaded' });
        
        // 🔥 [핵심] config-loader가 알려준 '진짜 경로'에 저장 (에러 해결)
        await context.storageState({ path: CONFIG.AUTH_FILE_PATH });
        console.log(`\n✅ 로그인 정보 저장 완료: ${CONFIG.AUTH_FILE_PATH}`);
        
        await browser.close();
        return true;
    } catch (e) {
        console.error(`\n❌ 로그인 실패 또는 시간 초과: ${e.message}`);
        await browser.close();
        return false;
    }
}

// 📌 [함수] 인증 확인 (없으면 로그인 유도)
async function ensureAuth(isStrict = true) {
    if (fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
        return true;
    }

    console.log("\n⚠️  [인증 확인] 네이버 로그인 정보(auth.json)가 없습니다.");
    if (isStrict) console.log("   🚨 이 작업을 위해서는 네이버 로그인이 필수입니다.");

    const answer = await askQuestion("   🚀 지금 브라우저를 띄워 로그인 하시겠습니까? (Y/n): ");
    
    if (answer.toLowerCase() === 'y' || answer === '') {
        const success = await performLogin();
        if (success) return true;
        process.exit(1);
    } else {
        if (isStrict) {
            console.log("   ❌ 작업을 중단합니다.");
            process.exit(1);
        }
        return false;
    }
}

// ---------------------------------------------------
// 1️⃣ Login Command
// ---------------------------------------------------
program
    .command('login')
    .description('🔐 [로그인] 네이버 계정 인증')
    .action(async () => {
        await performLogin();
    });

// ---------------------------------------------------
// 2️⃣ Generate Command (gen)
// ---------------------------------------------------
program
    .command('generate')
    .alias('gen')
    .description('📝 [생성] 글과 이미지 생성 (발행 X)')
    .requiredOption('-f, --file <path>', '작업 지시서 파일', CONFIG.PATHS.job || 'job.json')
    .option('-d, --dir <path>', '커스텀 출력 폴더')
    .option('-p, --publish', '생성 후 즉시 발행', false)
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Generate] 작업을 시작합니다...");

            // 🔥 [1] 라이선스 체크
            const check = await License.verifyLicense();
            if (!check.success) {
                console.error(`🚨 라이선스 차단: ${check.message}`);
                process.exit(1);
            }
            console.log(`💳 승인됨 (남은 횟수: ${check.remaining}회)`);

            // 🔥 [2] 인증 체크
            await ensureAuth(opts.publish);
            
            // 파일 로드
            if (!fs.existsSync(opts.file)) {
                // 상대 경로로 못 찾으면 ROOT_DIR 기준으로 한 번 더 시도
                const absPath = path.join(process.cwd(), opts.file);
                if(fs.existsSync(absPath)) opts.file = absPath;
                else {
                    console.error(`❌ 파일 없음: ${opts.file}`);
                    process.exit(1);
                }
            }
            const jobData = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
            console.log(`   📂 입력 파일 로드 완료: ${path.basename(opts.file)}`);
            
            // 코어 실행
            const result = await Core.generateContent(jobData, opts.dir);
            const targetDir = result.targetDir;

            await Core.prepareImages(targetDir, jobData);
            
            if (opts.publish) {
                await Core.publishToBlog(targetDir);
            } else {
                console.log(`\n🏁 작업 완료! 경로: ${targetDir}`);
                console.log(`   발행하려면: BlogGenius publish -d "${targetDir}"`);
            }
        } catch (e) { console.error('❌ 에러:', e); }
    });

// ---------------------------------------------------
// 3️⃣ Auto Command (auto)
// ---------------------------------------------------
program
    .command('auto')
    .description('🚀 [자동] 생성부터 발행까지 논스톱 실행')
    .option('-f, --file <path>', '작업 지시서 파일', CONFIG.PATHS.job || 'job.json')
    .option('-d, --dir <path>', '커스텀 출력 폴더')
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Auto Mode] 자동화 작업을 시작합니다...");

            // 🔥 [1] 라이선스 체크
            const check = await License.verifyLicense();
            if (!check.success) {
                console.error(`🚨 라이선스 차단: ${check.message}`);
                process.exit(1);
            }
            console.log(`💳 승인됨 (남은 횟수: ${check.remaining}회)`);

            // 🔥 [2] 인증 체크
            await ensureAuth(true);

            // 파일 로드
            if (!fs.existsSync(opts.file)) {
                const absPath = path.join(process.cwd(), opts.file);
                if(fs.existsSync(absPath)) opts.file = absPath;
                else {
                    console.error(`❌ 파일 없음: ${opts.file}`);
                    process.exit(1);
                }
            }
            const jobData = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
            
            console.log(`   📂 입력 파일 로드 완료: ${path.basename(opts.file)}`);
            console.log(`   🔥 Core 엔진 구동 중... (잠시만 기다려주세요)`);
            
            // 코어 실행
            const result = await Core.generateContent(jobData, opts.dir);
            const targetDir = result.targetDir;

            await Core.prepareImages(targetDir, jobData);
            await Core.publishToBlog(targetDir);

        } catch (e) { console.error('❌ 에러:', e); }
    });

// ---------------------------------------------------
// 4️⃣ Publish Command (pub)
// ---------------------------------------------------
program
    .command('publish')
    .alias('pub')
    .description('📤 [발행] 생성된 폴더를 블로그에 업로드')
    .requiredOption('-d, --dir <path>', '발행할 폴더 경로')
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Publish] 발행 작업을 시작합니다...");
            await ensureAuth(true);
            
            const targetDir = path.resolve(opts.dir);
            if (!fs.existsSync(targetDir)) {
                console.error(`❌ 폴더 없음: ${targetDir}`);
                process.exit(1);
            }
            await Core.publishToBlog(targetDir);
        } catch (e) { console.error('❌ 에러:', e); }
    });

program.parse(process.argv);
