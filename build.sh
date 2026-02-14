#!/bin/bash

# ==========================================
# 🔧 설정
# ==========================================
APP_NAME="BlogGenius"
VERSION="0.1.9"  # 💡 버전도 최신으로 살짝 올렸습니다
NODE_TARGET="node18" 
# ==========================================

echo "🔍 [Check] 빌드 환경을 점검합니다..."

# ---------------------------------------------------
# 1. 라이브러리(node_modules) 설치 확인
# ---------------------------------------------------
if [ ! -d "node_modules" ]; then
    echo "   📦 라이브러리가 없습니다. 지금 설치합니다... (npm install)"
    npm install
    
    echo "   🎭 Playwright 브라우저를 다운로드합니다..."
    npx playwright install
else
    echo "   ✅ 라이브러리가 이미 설치되어 있습니다."
fi

# ---------------------------------------------------
# 2. 필수 비밀 파일(secret.js) 확인
# ---------------------------------------------------
if [ ! -f "src/config/secret.js" ]; then
    echo ""
    echo "🚨 [Error] 치명적인 문제 발생!"
    echo "   'src/config/secret.js' 파일이 없습니다."
    echo "   Git에는 보안상 이 파일이 올라가지 않습니다."
    echo "   👉 기존 컴퓨터에서 이 파일을 복사해오거나, 새로 만드셔야 합니다."
    echo ""
    exit 1  # 스크립트 강제 종료
fi

# ---------------------------------------------------
# 3. 빌드 시작
# ---------------------------------------------------
echo ""
echo "🧹 기존 dist 폴더를 정리합니다..."
rm -rf dist
mkdir -p dist

# ---------------------------------------------------
# 📦 공통 자산 복사 함수 (여기가 핵심 수정됨!)
# ---------------------------------------------------
copy_assets() {
    TARGET_DIR=$1
    
    mkdir -p "$TARGET_DIR/config"
    mkdir -p "$TARGET_DIR/scripts"
    
    # 🔥 [수정됨] settings.js 대신 config.txt 복사
    # (sample 파일을 복사해서 사용자가 바로 쓸 수 있는 config.txt로 이름을 바꿉니다)
    if [ -f "config/config.txt.sample" ]; then
        cp config/config.txt.sample "$TARGET_DIR/config/config.txt"
    else
        echo "⚠️ [Warning] config.txt.sample 파일이 없습니다! 설정 파일이 누락될 수 있습니다."
    fi

    # 프롬프트 및 엑셀 파일
    cp config/system_prompt.md.sample "$TARGET_DIR/config/system_prompt.md"

    if [ -f "scripts/google_apps_script.js" ]; then
        cp scripts/google_apps_script.js "$TARGET_DIR/scripts/google_apps_script.js"
    else
        echo "⚠️ [Warning] scripts/google_apps_script.js 파일이 없습니다! Apps Script 안내 파일이 누락될 수 있습니다."
    fi
    
    # README 교체 (README_USER.md가 없으면 생성)
    if [ -f "README_USER.md" ]; then
        echo "   📄 README_USER.md를 발견하여 복사합니다."
        cp README_USER.md "$TARGET_DIR/README.md"
    else
        echo "   ⚠️ README_USER.md가 없어 기본 README.md를 사용합니다."
        cp README.md "$TARGET_DIR/README.md"
    fi

    # [Windows 전용] 더블클릭 실행 파일(.bat) 생성
    if [[ "$TARGET_DIR" == *"win-x64"* ]]; then
        # 1) 로그인
        cat > "$TARGET_DIR/실행하기_로그인.bat" << 'EOF'
@echo off
chcp 65001 > nul
title BlogGenius Login
echo.
echo [BlogGenius] 네이버 로그인을 시작합니다...
BlogGenius.exe login
pause
EOF
        # 2) 일괄 발행
        cat > "$TARGET_DIR/실행하기_일괄발행.bat" << 'EOF'
@echo off
chcp 65001 > nul
title BlogGenius Batch Mode
echo.
echo [BlogGenius] 엑셀 대량 발행(Batch)을 시작합니다...
BlogGenius.exe batch
pause
EOF
        # 3) 쇼핑 발행
        cat > "$TARGET_DIR/실행하기_쇼핑발행.bat" << 'EOF'
@echo off
chcp 65001 > nul
title BlogGenius Shopping Mode
echo.
echo [BlogGenius] 쇼핑 발행(Shopping)을 시작합니다...
BlogGenius.exe shopping
pause
EOF
    fi
    
    echo "   📄 필수 파일 복사 완료"
}

echo "🚀 [Build] ${APP_NAME} v${VERSION} 패키징을 시작합니다..."
echo "---------------------------------------------------"

# 1️⃣ MacOS (Apple Silicon) - M1/M2/M3
DIR_NAME="${APP_NAME}-v${VERSION}-mac-arm64"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🍎 MacOS (Apple Silicon) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
pkg src/main.js --targets ${NODE_TARGET}-macos-arm64 --output "${OUTPUT_DIR}/${APP_NAME}"
echo "   ✅ 빌드 완료"
echo ""

# 2️⃣ MacOS (Intel)
DIR_NAME="${APP_NAME}-v${VERSION}-mac-intel"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🍎 MacOS (Intel) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
pkg src/main.js --targets ${NODE_TARGET}-macos-x64 --output "${OUTPUT_DIR}/${APP_NAME}"
echo "   ✅ 빌드 완료"
echo ""

# 3️⃣ Windows (x64)
DIR_NAME="${APP_NAME}-v${VERSION}-win-x64"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🪟 Windows (x64) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
pkg src/main.js --targets ${NODE_TARGET}-win-x64 --output "${OUTPUT_DIR}/${APP_NAME}.exe"
echo "   ✅ 빌드 완료"
echo ""

# 4️⃣ Linux (x64)
DIR_NAME="${APP_NAME}-v${VERSION}-linux-x64"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🐧 Linux (x64) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
pkg src/main.js --targets ${NODE_TARGET}-linux-x64 --output "${OUTPUT_DIR}/${APP_NAME}"
echo "   ✅ 빌드 완료"
echo ""

echo "---------------------------------------------------"
echo "🎉 모든 작업이 완료되었습니다!"
echo "📂 dist 폴더를 확인하세요."
