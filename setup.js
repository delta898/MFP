const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("🚀 [Setup] 네이버 블로그 봇 설치를 시작합니다...");

// ✅ 처리할 파일 목록 정의 (Source -> Target)
const filesToCopy = [
    {
        name: '설정 파일 (config.txt)',
        src: path.join(__dirname, 'config', 'config.txt.sample'),
        dest: path.join(__dirname, 'config', 'config.txt')
    }
];

// 1. [파일 복사 루프]
console.log("\n📂 필수 파일들을 준비합니다...");

filesToCopy.forEach(file => {
    // 1) Source(샘플)가 없으면 경고
    if (!fs.existsSync(file.src)) {
        console.warn(`⚠️  [Skip] 샘플 파일을 찾을 수 없습니다: ${path.basename(file.src)}`);
        return;
    }

    // 2) Target(실제파일)이 이미 있으면 스킵 (덮어쓰기 방지)
    if (fs.existsSync(file.dest)) {
        console.log(`ℹ️  [Skip] 이미 존재합니다: ${path.basename(file.dest)}`);
    } else {
        // 3) 복사 수행
        fs.copyFileSync(file.src, file.dest);
        console.log(`✅ [생성] ${file.name} 복사 완료!`);
    }
});


// 2. [라이브러리 설치] npm install & playwright install
console.log("\n📦 라이브러리를 설치합니다 (npm install)...");
try {
    // 윈도우/맥 호환을 위해 shell 옵션 사용
    execSync('npm install', { stdio: 'inherit', shell: true });
    console.log("✅ 기본 라이브러리 설치 완료!");

    console.log("🌍 브라우저 드라이버를 설치합니다 (npx playwright install)...");
    execSync('npx playwright install', { stdio: 'inherit', shell: true });
    console.log("✅ 브라우저 드라이버 설치 완료!");

} catch (e) {
    console.error("❌ 설치 중 오류 발생:", e.message);
    console.log("👉 (팁) 'npm install'을 직접 실행해보세요.");
}

console.log("\n🎉 설치가 완료되었습니다!");
console.log("👉 'config/config.txt' 파일을 열어 아이디와 라이선스 키를 설정해주세요.");
console.log("👉 그 다음 'npm run login' 후 'npm run batch' 또는 'npm run shopping'을 실행하세요.");
