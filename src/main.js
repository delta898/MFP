const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const Core = require('./core');
const CONFIG = require('../config/settings');

const program = new Command();

program
    .name('node src/main.js')
    .usage('[command] [options]')
    .version('1.0.0')
    .description('🤖 네이버 블로그 자동 포스팅 봇 CLI');

// 🛡️ [Helper] 사용자에게 질문하기 (Y/n)
function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// 🛡️ [Core] 인증 파일 체크 및 로그인 유도
async function ensureAuth(isStrict = true) {
    // 1. 파일이 있으면 통과
    if (fs.existsSync(CONFIG.AUTH_FILE_PATH)) return true;

    console.log("\n⚠️  [인증 확인] 네이버 로그인 정보(auth.json)가 없습니다.");
    
    // 2. 파일이 없을 때 처리
    if (!isStrict) {
        // Generate 명령어인 경우: 경고만 하고 넘어갈지 물어봄
        console.log("   (글 생성(Generate)은 로그인이 없어도 가능하지만, 나중에 발행하려면 필요합니다.)");
    } else {
        console.log("   🚨 이 작업을 위해서는 네이버 로그인이 필수입니다.");
    }

    const answer = await askQuestion("   🚀 지금 브라우저를 띄워 로그인 하시겠습니까? (Y/n): ");
    
    if (answer.toLowerCase() === 'y' || answer === '') {
        try {
            console.log("\n   🔄 로그인 프로세스를 시작합니다...");
            // npm run login 명령어를 동기적으로 실행 (로그인 완료될 때까지 대기)
            execSync('npm run login', { stdio: 'inherit' });
            
            // 로그인 후 다시 확인
            if (fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
                console.log("\n   ✅ 로그인 성공! 원래 작업을 계속 진행합니다.\n");
                return true;
            } else {
                console.error("\n   ❌ 로그인 정보가 저장되지 않았습니다. 작업을 중단합니다.");
                process.exit(1);
            }
        } catch (e) {
            console.error("\n   ❌ 로그인 중 오류가 발생했습니다.", e.message);
            process.exit(1);
        }
    } else {
        if (isStrict) {
            console.log("   ❌ 로그인을 취소하여 작업을 중단합니다.");
            process.exit(1);
        } else {
            console.log("   ⚠️  로그인 없이 진행합니다.\n");
            return false;
        }
    }
}

// 1. Generate 명령
program
    .command('generate')
    .description('📝 [생성] job.json을 읽어 글과 이미지를 생성합니다. (발행 X)')
    .requiredOption('-f, --file <path>', '작업 지시서 파일', 'job.json')
    .option('-d, --dir <path>', '커스텀 출력 폴더')
    .option('-p, --publish', '생성 후 즉시 발행', false)
    .action(async (opts) => {
        try {
            // 발행 옵션이 있으면 Strict 모드, 아니면 느슨한 모드
            await ensureAuth(opts.publish); 

            if (!fs.existsSync(opts.file)) {
                console.error(`❌ 파일을 찾을 수 없습니다: ${opts.file}`);
                process.exit(1);
            }
            const jobData = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
            console.log(`🚀 [Generate] 주제: ${jobData.subject}`);
            
            const dir = await Core.generateContent(jobData, opts.dir);
            await Core.prepareImages(dir, jobData);
            
            if (opts.publish) {
                await Core.publishToBlog(dir);
            } else {
                console.log(`\n🏁 작업 완료! 결과물 경로: ${dir}`);
                console.log(`   발행하려면: npm run pub -- -d "${dir}"`);
            }
        } catch (e) { console.error('❌ 에러 발생:', e); }
    });

// 2. Auto 명령
program
    .command('auto')
    .description('🚀 [자동] 생성부터 발행까지 논스톱 실행 (기본값: job.json)')
    .option('-f, --file <path>', '작업 지시서 파일', 'job.json')
    .option('-d, --dir <path>', '커스텀 출력 폴더')
    .action(async (opts) => {
        try {
            await ensureAuth(true); // 🔥 필수 체크

            if (!fs.existsSync(opts.file)) {
                console.error(`❌ 파일을 찾을 수 없습니다: ${opts.file}`);
                process.exit(1);
            }
            const jobData = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
            console.log(`🚀 [Auto Mode] 주제: ${jobData.subject}`);
            
            const dir = await Core.generateContent(jobData, opts.dir);
            await Core.prepareImages(dir, jobData);
            await Core.publishToBlog(dir);
            
        } catch (e) { console.error('❌ 에러 발생:', e); }
    });

// 3. Publish 명령
program
    .command('publish')
    .description('📤 [발행] 만들어진 폴더를 블로그에 올립니다.')
    .requiredOption('-d, --dir <path>', '발행할 폴더 경로 (workspace/...)')
    .action(async (opts) => {
        try {
            await ensureAuth(true); // 🔥 필수 체크

            const targetDir = path.resolve(opts.dir);
            if (!fs.existsSync(targetDir)) {
                console.error(`❌ 폴더를 찾을 수 없습니다: ${targetDir}`);
                process.exit(1);
            }
            await Core.publishToBlog(targetDir);
        } catch (e) { console.error('❌ 에러 발생:', e); }
    });

program.addHelpText('after', `
---------------------------------------------------
💡 사용 예시
---------------------------------------------------
  1. 최초 로그인 (브라우저 인증)
     $ npm run login

  2. 자동 실행 (로그인 정보 없으면 물어봄)
     $ npm run auto
`);

program.parse(process.argv);
