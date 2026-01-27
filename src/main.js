const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// 모듈 로딩 시점에도 로그를 찍고 싶지만, require가 최상단이라 
// 실행 되자마자 바로 아래 로그가 뜨도록 합니다.
console.log("⏳ 시스템 모듈을 로딩하고 있습니다..."); 

const Core = require('./core');
const CONFIG = require('../config/settings');

const program = new Command();

program
    .name('node src/main.js')
    .usage('[command] [options]')
    .version('1.0.0')
    .description('🤖 네이버 블로그 자동 포스팅 봇 CLI');

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function ensureAuth(isStrict = true) {
    // 시작하자마자 확인 로그
    if (fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
        // console.log("✅ 인증 파일 확인됨"); // 너무 시끄러우면 주석 처리
        return true;
    }

    console.log("\n⚠️  [인증 확인] 네이버 로그인 정보(auth.json)가 없습니다.");
    if (isStrict) console.log("   🚨 이 작업을 위해서는 네이버 로그인이 필수입니다.");

    const answer = await askQuestion("   🚀 지금 브라우저를 띄워 로그인 하시겠습니까? (Y/n): ");
    
    if (answer.toLowerCase() === 'y' || answer === '') {
        try {
            console.log("\n   🔄 로그인 프로세스를 시작합니다...");
            execSync('node src/login.js', { stdio: 'inherit' });
            if (fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
                console.log("\n   ✅ 로그인 성공! 작업을 계속 진행합니다.\n");
                return true;
            } else {
                console.error("\n   ❌ 로그인 정보가 저장되지 않았습니다.");
                process.exit(1);
            }
        } catch (e) {
            console.error("\n   ❌ 로그인 중 오류:", e.message);
            process.exit(1);
        }
    } else {
        if (isStrict) {
            console.log("   ❌ 작업을 중단합니다.");
            process.exit(1);
        }
        return false;
    }
}

// ---------------------------------------------------
// 1️⃣ Login
// ---------------------------------------------------
program
    .command('login')
    .description('🔐 [로그인] 네이버 계정 인증')
    .action(() => {
        const loginScript = path.join(__dirname, 'login.js');
        execSync(`node "${loginScript}"`, { stdio: 'inherit' });
    });

// ---------------------------------------------------
// 2️⃣ Generate (gen)
// ---------------------------------------------------
program
    .command('generate')
    .alias('gen')
    .description('📝 [생성] 글과 이미지 생성 (발행 X)')
    .requiredOption('-f, --file <path>', '작업 지시서 파일', 'job.json')
    .option('-d, --dir <path>', '커스텀 출력 폴더')
    .option('-p, --publish', '생성 후 즉시 발행', false)
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Generate] 작업을 시작합니다...");
            await ensureAuth(opts.publish);
            
            if (!fs.existsSync(opts.file)) {
                console.error(`❌ 파일 없음: ${opts.file}`);
                process.exit(1);
            }
            const jobData = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
            console.log(`   📂 입력 파일 로드 완료: ${opts.file}`);
            
            const result = await Core.generateContent(jobData, opts.dir);
            const targetDir = result.targetDir;

            await Core.prepareImages(targetDir, jobData);
            
            if (opts.publish) {
                await Core.publishToBlog(targetDir);
            } else {
                console.log(`\n🏁 작업 완료! 경로: ${targetDir}`);
                console.log(`   발행하려면: node src/main.js pub -d "${targetDir}"`);
            }
        } catch (e) { console.error('❌ 에러:', e); }
    });

// ---------------------------------------------------
// 3️⃣ Auto (default)
// ---------------------------------------------------
program
    .command('auto')
    .description('🚀 [자동] 생성부터 발행까지 논스톱 실행')
    .option('-f, --file <path>', '작업 지시서 파일', 'job.json')
    .option('-d, --dir <path>', '커스텀 출력 폴더')
    .action(async (opts) => {
        try {
            console.log("\n▶️ [Auto Mode] 자동화 작업을 시작합니다...");
            await ensureAuth(true);

            if (!fs.existsSync(opts.file)) {
                console.error(`❌ 파일 없음: ${opts.file}`);
                process.exit(1);
            }
            const jobData = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
            console.log(`   📂 입력 파일 로드 완료: ${opts.file}`);
            console.log(`   🔥 Core 엔진 구동 중... (잠시만 기다려주세요)`);
            
            const result = await Core.generateContent(jobData, opts.dir);
            const targetDir = result.targetDir;

            await Core.prepareImages(targetDir, jobData);
            await Core.publishToBlog(targetDir);
        } catch (e) { console.error('❌ 에러:', e); }
    });

// ---------------------------------------------------
// 4️⃣ Publish (pub)
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
