// setup.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("🚀 [Setup] 네이버 블로그 봇 설치를 시작합니다...");

// 1. [설정 파일 복사] settings.sample.js -> settings.js
const settingsSample = path.join(__dirname, 'config', 'settings.sample.js');
const settingsTarget = path.join(__dirname, 'config', 'settings.js');

// 샘플이 없으면 현재 settings.js를 샘플로 만들어둠 (역방향 백업)
if (fs.existsSync(settingsTarget) && !fs.existsSync(settingsSample)) {
    fs.copyFileSync(settingsTarget, settingsSample);
    console.log("ℹ️  현재 설정을 'config/settings.sample.js'로 백업했습니다.");
}

if (!fs.existsSync(settingsTarget) && fs.existsSync(settingsSample)) {
    fs.copyFileSync(settingsSample, settingsTarget);
    console.log("✅ config/settings.js 생성 완료!");
}

// 2. [엑셀 파일 복사] jobs_sample.xlsx -> jobs.xlsx
const jobsSample = path.join(__dirname, 'jobs_sample.xlsx');
const jobsTarget = path.join(__dirname, 'jobs.xlsx');

if (!fs.existsSync(jobsTarget) && fs.existsSync(jobsSample)) {
    fs.copyFileSync(jobsSample, jobsTarget);
    console.log("✅ jobs.xlsx 생성 완료!");
}

// 3. [라이브러리 설치] npm install & playwright install
console.log("📦 라이브러리를 설치합니다 (npm install)...");
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
console.log("👉 'config/settings.js'에 아이디와 API 키를 넣어주세요.");
console.log("👉 그 다음 'npm run login'으로 로그인하세요.");
