#!/bin/bash

# ==========================================
# 🔧 설정 (여기만 바꾸면 됩니다)
# ==========================================
APP_NAME="BlogGenius"
VERSION="0.1.0"
NODE_TARGET="node18" 
# ==========================================

# 1. 기존 빌드 폴더 청소
echo "🧹 기존 dist 폴더를 정리합니다..."
rm -rf dist
mkdir -p dist

# 2. 공통 자산 복사 함수
copy_assets() {
    TARGET_DIR=$1
    
    mkdir -p "$TARGET_DIR/config"
    
    # 설정/작업 파일 복사
    cp config/settings.js.sample "$TARGET_DIR/config/settings.js"
    cp config/system_prompt.md.sample "$TARGET_DIR/config/system_prompt.md"
    cp jobs.xlsx.sample "$TARGET_DIR/jobs.xlsx"
    cp job.json.sample "$TARGET_DIR/job.json"
    
    # [설명서 교체] 개발자용 README 대신 고객용 README_USER를 복사
    if [ -f "README_USER.md" ]; then
        cp README_USER.md "$TARGET_DIR/README.md"
    else
        cp README.md "$TARGET_DIR/README.md"
    fi

    # [Windows 전용] 더블클릭 실행 파일(.bat) 생성
    if [[ "$TARGET_DIR" == *"win-x64"* ]]; then
        
        # 1) 로그인 배치 파일
        cat > "$TARGET_DIR/실행하기_로그인.bat" << 'EOF'
@echo off
chcp 65001 > nul
title BlogGenius Login
echo.
echo [BlogGenius] 네이버 로그인을 시작합니다...
echo 브라우저가 뜨면 로그인을 진행해주세요.
echo.
BlogGenius.exe login
pause
EOF

        # 2) 일괄 발행 배치 파일
        cat > "$TARGET_DIR/실행하기_일괄발행.bat" << 'EOF'
@echo off
chcp 65001 > nul
title BlogGenius Batch Mode
echo.
echo [BlogGenius] 엑셀 대량 발행(Batch)을 시작합니다...
echo jobs.xlsx 파일을 읽어옵니다.
echo.
BlogGenius.exe batch
pause
EOF

        # 3) 단건 테스트 배치 파일
        cat > "$TARGET_DIR/실행하기_단건테스트.bat" << 'EOF'
@echo off
chcp 65001 > nul
title BlogGenius Auto Mode
echo.
echo [BlogGenius] 단건 테스트(Auto)를 시작합니다...
echo job.json 설정을 사용합니다.
echo.
BlogGenius.exe auto
pause
EOF
    fi
    
    echo "   📄 필수 파일 및 실행 스크립트 복사 완료"
}

echo "🚀 [Build] ${APP_NAME} v${VERSION} 패키징을 시작합니다..."
echo "---------------------------------------------------"

# ------------------------------------------
# 1️⃣ MacOS (Apple Silicon / M1, M2...)
# ------------------------------------------
DIR_NAME="${APP_NAME}-v${VERSION}-mac-arm64"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🍎 MacOS (Apple Silicon) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
pkg src/main.js --targets ${NODE_TARGET}-macos-arm64 --output "${OUTPUT_DIR}/${APP_NAME}"
echo "   ✅ 빌드 완료: ${DIR_NAME}"
echo ""

# ------------------------------------------
# 2️⃣ MacOS (Intel / x64)
# ------------------------------------------
DIR_NAME="${APP_NAME}-v${VERSION}-mac-intel"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🍎 MacOS (Intel) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
pkg src/main.js --targets ${NODE_TARGET}-macos-x64 --output "${OUTPUT_DIR}/${APP_NAME}"
echo "   ✅ 빌드 완료: ${DIR_NAME}"
echo ""

# ------------------------------------------
# 3️⃣ Windows (x64)
# ------------------------------------------
DIR_NAME="${APP_NAME}-v${VERSION}-win-x64"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🪟 Windows (x64) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
pkg src/main.js --targets ${NODE_TARGET}-win-x64 --output "${OUTPUT_DIR}/${APP_NAME}.exe"
echo "   ✅ 빌드 완료: ${DIR_NAME}"
echo ""

# ------------------------------------------
# 4️⃣ Linux (x64)
# ------------------------------------------
DIR_NAME="${APP_NAME}-v${VERSION}-linux-x64"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🐧 Linux (x64) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
pkg src/main.js --targets ${NODE_TARGET}-linux-x64 --output "${OUTPUT_DIR}/${APP_NAME}"
echo "   ✅ 빌드 완료: ${DIR_NAME}"
echo ""

echo "---------------------------------------------------"
echo "🎉 모든 작업이 완료되었습니다!"
echo "📂 dist 폴더를 확인하세요."
