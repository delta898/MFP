#!/bin/bash

# ==========================================
# 🔧 설정 (build.yml과 동기화)
# ==========================================
APP_NAME="BlogGenius"
VERSION=$(node -p "require('./package.json').version")
NODE_TARGET="node20"   # build.yml: node20
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
# 2. @yao-pkg/pkg 확인 (npx로 실행하므로 별도 전역 설치 불필요)
# ---------------------------------------------------
PKG_CMD="npx --yes @yao-pkg/pkg"
echo "   ✅ pkg 실행: npx @yao-pkg/pkg (node20 지원)"

# ---------------------------------------------------
# 3. 필수 비밀 파일(secret.js) 확인
# ---------------------------------------------------
if [ ! -f "src/config/secret.js" ]; then
    echo ""
    echo "🚨 [Error] 치명적인 문제 발생!"
    echo "   'src/config/secret.js' 파일이 없습니다."
    echo "   Git에는 보안상 이 파일이 올라가지 않습니다."
    echo "   👉 기존 컴퓨터에서 이 파일을 복사해오거나, 새로 만드셔야 합니다."
    echo ""
    exit 1
fi

# ---------------------------------------------------
# 4. 빌드 시작
# ---------------------------------------------------
echo ""
echo "🧹 기존 dist 폴더를 정리합니다..."
rm -rf dist
mkdir -p dist

# ---------------------------------------------------
# 📦 공통 자산 복사 함수 (build.yml Prepare Assets 와 동일)
# ---------------------------------------------------
copy_assets() {
    TARGET_DIR=$1

    mkdir -p "$TARGET_DIR/config"
    mkdir -p "$TARGET_DIR/config/images"
    mkdir -p "$TARGET_DIR/scripts"

    if [ -f "config/config.txt.sample" ]; then
        cp config/config.txt.sample "$TARGET_DIR/config/config.txt.sample"
    else
        echo "⚠️ [Warning] config.txt.sample 파일이 없습니다! 설정 파일이 누락될 수 있습니다."
    fi

    if [ -d "config/images" ]; then
        find config/images -maxdepth 1 -type f ! -name '.*' -exec cp {} "$TARGET_DIR/config/images/" \;
    else
        echo "⚠️ [Warning] config/images 폴더가 없습니다! 기본 쇼핑 이미지가 누락될 수 있습니다."
    fi

    if [ -f "scripts/google_apps_script.js" ]; then
        cp scripts/google_apps_script.js "$TARGET_DIR/scripts/google_apps_script.js"
    else
        echo "⚠️ [Warning] scripts/google_apps_script.js 파일이 없습니다!"
    fi

    # README 복사 (build.yml fallback과 동일)
    if [ -f "README_USER.md" ]; then
        echo "   📄 README_USER.md를 발견하여 복사합니다."
        cp README_USER.md "$TARGET_DIR/README.md"
    else
        echo "   ⚠️ README_USER.md가 없어 기본 README를 생성합니다."
        {
            echo "# BlogGenius 사용자 가이드"
            echo "1. config/config.txt.sample을 복사해 config/config.txt를 만든 뒤 설정하세요."
            echo "2. 프로그램을 실행하세요."
            echo ""
            echo "[Mac 사용자 필수 주의사항 - Gatekeeper 우회 방법]"
            echo "애플의 보안 정책(Gatekeeper)으로 인해 브라우저에서 다운로드한 앱은 실행이 차단될 수 있습니다."
            echo "다음 3가지 방법 중 하나를 선택하여 실행하세요:"
            echo ""
            echo "방법 1 (가장 추천 - 격리 해제 명령어):"
            echo "터미널을 열고 다음 명령어를 입력하세요:"
            echo "xattr -cr ./*"
            echo ""
            echo "방법 2 (터미널 다운로드 - 경고창 방지):"
            echo "터미널에서 직접 다운로드하면 보안 경고가 뜨지 않습니다:"
            echo "curl -LO <릴리즈 ZIP 주소> && unzip <ZIP 파일명>"
            echo ""
            echo "방법 3 (마우스 우클릭):"
            echo "BlogGenius-mac-* 파일을 '우클릭' 후 [열기]를 선택하세요."
        } > "$TARGET_DIR/README.md"
    fi

    # [Windows 전용] 더블클릭 실행 파일(.bat) 생성
    if [[ "$TARGET_DIR" == *"win-x64"* ]]; then
        create_win_bat() {
            local file_name="$1"
            local title="$2"
            local message="$3"
            local command="$4"
            {
                printf '@echo off\r\n'
                printf 'chcp 65001 > nul\r\n'
                printf 'title %s\r\n' "$title"
                printf 'echo.\r\n'
                printf 'echo [BlogGenius] %s\r\n' "$message"
                printf 'BlogGenius.exe %s\r\n' "$command"
                printf 'pause\r\n'
            } > "$TARGET_DIR/${file_name}"
        }

        create_win_bat "실행하기_로그인.bat"           "BlogGenius Login"           "네이버 로그인을 시작합니다..."           "login"
        create_win_bat "실행하기_트렌드수집.bat"       "BlogGenius Trends Mode"     "트렌드 수집(Trends)을 시작합니다..."     "trends"
        create_win_bat "실행하기_일괄발행.bat"         "BlogGenius Batch Mode"      "엑셀 대량 발행(Batch)을 시작합니다..."   "batch"
        create_win_bat "실행하기_쇼핑발행.bat"         "BlogGenius Shopping Mode"   "쇼핑 발행(Shopping)을 시작합니다..."    "shopping"
        create_win_bat "실행하기_라이선스상태.bat"     "BlogGenius License Status"  "라이선스 상태 조회를 시작합니다..."     "license status"
        create_win_bat "실행하기_라이선스등록.bat"     "BlogGenius License Register" "라이선스 이메일 등록을 시작합니다..."  "license register"
        create_win_bat "실행하기_라이선스복구.bat"     "BlogGenius License Recover"  "라이선스 복구를 시작합니다..."         "license recover"
        create_win_bat "실행하기_라이선스업그레이드.bat" "BlogGenius License Upgrade" "라이선스 업그레이드를 시작합니다..."  "license upgrade"
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
$PKG_CMD package.json --targets ${NODE_TARGET}-macos-arm64 --output "${OUTPUT_DIR}/${APP_NAME}"
# Ad-hoc 코드사인 (build.yml 동일 - Apple Silicon 실행 필수)
codesign --sign - --force "${OUTPUT_DIR}/${APP_NAME}" 2>/dev/null && echo "   🔏 코드사인 완료" || echo "   ⚠️ 코드사인 생략 (codesign 없음)"
echo "   ✅ 빌드 완료"
echo ""

# 2️⃣ MacOS (Intel)
DIR_NAME="${APP_NAME}-v${VERSION}-mac-intel"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🍎 MacOS (Intel) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
$PKG_CMD package.json --targets ${NODE_TARGET}-macos-x64 --output "${OUTPUT_DIR}/${APP_NAME}"
codesign --sign - --force "${OUTPUT_DIR}/${APP_NAME}" 2>/dev/null && echo "   🔏 코드사인 완료" || echo "   ⚠️ 코드사인 생략 (codesign 없음)"
echo "   ✅ 빌드 완료"
echo ""

# 3️⃣ Windows (x64)
DIR_NAME="${APP_NAME}-v${VERSION}-win-x64"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🪟 Windows (x64) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
$PKG_CMD package.json --targets ${NODE_TARGET}-win-x64 --output "${OUTPUT_DIR}/${APP_NAME}.exe"
echo "   ✅ 빌드 완료"
echo ""

# 4️⃣ Linux (x64)
DIR_NAME="${APP_NAME}-v${VERSION}-linux-x64"
OUTPUT_DIR="dist/${DIR_NAME}"
echo "🐧 Linux (x64) 빌드 중..."
mkdir -p "$OUTPUT_DIR"
copy_assets "$OUTPUT_DIR"
$PKG_CMD package.json --targets ${NODE_TARGET}-linux-x64 --output "${OUTPUT_DIR}/${APP_NAME}"
echo "   ✅ 빌드 완료"
echo ""

# ---------------------------------------------------
# 5. ZIP 생성 (build.yml Create Platform ZIP 와 동일)
# ---------------------------------------------------
echo "📦 ZIP 파일 생성 중..."
cd dist
for platform_dir in */; do
    platform_dir="${platform_dir%/}"
    zip_name="${platform_dir}.zip"
    zip -r "../${zip_name}" "$platform_dir" -x "*.DS_Store"
    echo "   ✅ ${zip_name} 생성 완료"
done
cd -

echo ""
echo "---------------------------------------------------"
echo "🎉 모든 작업이 완료되었습니다!"
echo "📂 dist 폴더 및 ZIP 파일을 확인하세요."
