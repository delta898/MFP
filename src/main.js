const { Command } = require('commander');
const fs = require('fs');
const Core = require('./core');
const path = require('path');

const program = new Command();

program
    .name('node src/main.js')
    .usage('[command] [options]')
    .version('1.0.0')
    .description('🤖 네이버 블로그 자동 포스팅 봇 CLI');

// 1. Generate 명령
program
    .command('generate')
    .description('📝 [생성] job.json을 읽어 글과 이미지를 생성합니다. (발행 X)')
    .requiredOption('-f, --file <path>', '작업 지시서 파일', 'job.json')
    .option('-d, --dir <path>', '커스텀 출력 폴더 (지정 시 해당 폴더 사용)') // 🔥 추가
    .option('-p, --publish', '생성 후 즉시 발행', false)
    .action(async (opts) => {
        try {
            if (!fs.existsSync(opts.file)) {
                console.error(`❌ 파일을 찾을 수 없습니다: ${opts.file}`);
                process.exit(1);
            }
            const jobData = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
            console.log(`🚀 [Generate] 주제: ${jobData.subject}`);
            
            // 🔥 dir 옵션 전달
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
    .option('-d, --dir <path>', '커스텀 출력 폴더 (지정 시 해당 폴더 사용)') // 🔥 추가
    .action(async (opts) => {
        try {
            if (!fs.existsSync(opts.file)) {
                console.error(`❌ 파일을 찾을 수 없습니다: ${opts.file}`);
                process.exit(1);
            }
            const jobData = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
            console.log(`🚀 [Auto Mode] 주제: ${jobData.subject}`);
            
            // 🔥 dir 옵션 전달
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
  1. 자동 실행 (기본)
     $ npm run auto

  2. 특정 폴더 지정하여 실행 (기존 파일 유지, 이미지만 채우기 등)
     $ npm run auto -- -d "workspace/내_수동_폴더"

  3. 글 생성만 하기 (커스텀 폴더)
     $ npm run gen -- -d "workspace/내_수동_폴더"
`);

program.parse(process.argv);
