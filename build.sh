#!/bin/bash

# ==========================================
# 🔧 설정 (build.yml과 동기화)
# ==========================================
APP_NAME="BlogGenius"
VERSION=$(node -p "require('./package.json').version")
NODE_TARGET="node20"   # build.yml: node20
# ==========================================

# 📥 인수 처리
BUILD_ONLY=false
for arg in "$@"; do
    if [ "$arg" == "--build-only" ]; then
        BUILD_ONLY=true
    fi
done

if [ "$BUILD_ONLY" == "true" ]; then
    echo "🏗 [Mode] 빌드 전용 모드 활성화 (업로드 스킵)"
fi

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
# 4. dist 폴더 정리 (항상 Clean Build)
# ---------------------------------------------------
echo "🧹 [Clean] 항상 클린 빌드를 수행하기 위해 기존 dist 폴더를 정리합니다..."
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
    mkdir -p "$TARGET_DIR/data"

    if [ -f "config/config.json.sample" ]; then
        cp config/config.json.sample "$TARGET_DIR/config/config.json.sample"
    else
        echo "⚠️ [Warning] config.json.sample 파일이 없습니다! 설정 파일이 누락될 수 있습니다."
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
            echo "1. config/config.json.sample을 복사해 config/config.json를 만든 뒤 설정하세요."
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

    # 📄 필수 파일 복사 (이미 dist/ 에 복사됨)
    echo "   📄 필수 파일 복사 완료"
}

echo "🚀 [Build] ${APP_NAME} v${VERSION} 패키징을 시작합니다..."
echo "---------------------------------------------------"

# ---------------------------------------------------
# 📦 통합 빌드 함수 (CLI + GUI)
# ---------------------------------------------------
build_platform() {
    local plat=$1      # node target용 (macos, win, linux)
    local e_plat=$2    # electron용 (darwin, win32, linux)
    local arch=$3      # x64, arm64
    local suffix=$4    # 폴더명 접미사 (mac-arm64 등)
    
    local ROOT_DIR_NAME="${APP_NAME}-v${VERSION}-${suffix}"
    local ROOT_OUT="dist/${ROOT_DIR_NAME}"
    
    echo "---------------------------------------------------"
    echo "🚀 [Build] ${suffix} 통합 패키징 시작..."

    # 실제 빌드 과정 시작
    mkdir -p "${ROOT_OUT}"

    # 1. 공통 자산 복사
    copy_assets "${ROOT_OUT}"

    # 2. CLI 빌드 (BlogGenius-cli)
    echo "   💻 CLI 빌드 중..."
    local cli_suffix=""
    if [ "$e_plat" == "win32" ]; then cli_suffix=".exe"; fi
    $PKG_CMD package.json --targets ${NODE_TARGET}-${plat}-${arch} --output "${ROOT_OUT}/${APP_NAME}-cli${cli_suffix}"
    
    # macOS 코드사인 (CLI)
    if [ "$e_plat" == "darwin" ]; then
        codesign --sign - --force "${ROOT_OUT}/${APP_NAME}-cli" 2>/dev/null && echo "   🔏 CLI 코드사인 완료"
    fi

    # 3. GUI 빌드 (BlogGenius)
    echo "   📦 GUI 빌드 중..."
    
    local SKIP_GUI=false
    ICON_OPT="--icon=assets/icons/icon"
    # Windows 빌드 시 Wine이 없으면 빌드 불가
    if [ "$e_plat" == "win32" ]; then
        if ! command -v wine64 &> /dev/null && ! command -v wine &> /dev/null; then
            echo "   ⚠️ [Warning] Wine이 설치되어 있지 않아 Windows GUI 빌드를 건너뜁니다. (CLI만 포함)"
            SKIP_GUI=true
        fi
    fi

    if [ "$SKIP_GUI" == "false" ]; then
        npx electron-packager . "${APP_NAME}" \
            --platform=${e_plat} --arch=${arch} \
            --out=dist/gui-temp --overwrite \
            --asar.unpack="**/{node_modules/sharp,node_modules/@img}/**/*" \
            $ICON_OPT \
            --ignore="^/([.]git|dist|logs|assets|Videos|workspace|NaverAutoBlog|supabase|temp|docs|tmp|tmp_update|NaverBlogAutoTool|BlogGenius.app|BlogGenius-cli|BlogGenius-cli.exe)($|/)|(?:[.]zip|[.]tar[.]gz|[.]bak|[.]numbers|[.]dmg|[.]old|[.]build_stamp_.*)$|/node_modules/(electron|electron-packager|[.]cache)($|/)" \
            --quiet

        # GUI 결과물 이동
        local TEMP_NAME="${APP_NAME}-${e_plat}-${arch}"
        if [ "$e_plat" == "win32" ]; then TEMP_NAME="${APP_NAME}-win32-${arch}"; fi
        
        # macOS의 경우 .app 번들 자체를 이동, 나머지는 내용물을 이동
        if [ "$e_plat" == "darwin" ]; then
            mv "dist/gui-temp/${TEMP_NAME}/${APP_NAME}.app" "${ROOT_OUT}/"
        elif [ "$e_plat" == "linux" ]; then
            # Linux: 부속 파일이 많으므로 lib/ 폴더로 격리 (Clean Look)
            echo "   🧹 Linux GUI 파일 격리 및 바이너리 이름 최적화 중..."
            mkdir -p "${ROOT_OUT}/lib"
            cp -a dist/gui-temp/${TEMP_NAME}/* "${ROOT_OUT}/lib/"
            
            # 실제 바이너리 이름을 -bin으로 변경하여 런처와 구분
            mv "${ROOT_OUT}/lib/${APP_NAME}" "${ROOT_OUT}/lib/${APP_NAME}-bin"
            chmod +x "${ROOT_OUT}/lib/${APP_NAME}-bin"

            # 루트에 런처 스크립트 생성 (내부 -bin 바이너리 실행)
            cat <<EOF > "${ROOT_OUT}/${APP_NAME}"
#!/bin/bash
# BlogGenius Launcher Script
HERE="\$(dirname "\$(readlink -f "\$0")")"
export LD_LIBRARY_PATH="\$HERE/lib:\$LD_LIBRARY_PATH"
# \$@ 를 통해 인자 전달
"\$HERE/lib/${APP_NAME}-bin" "\$@"
EOF
            chmod +x "${ROOT_OUT}/${APP_NAME}"
        else
            # Windows: 전체 파일 이동
            if [ -d "dist/gui-temp/${TEMP_NAME}" ]; then
                cp -a dist/gui-temp/${TEMP_NAME}/* "${ROOT_OUT}/"
            fi
        fi
        rm -rf dist/gui-temp
    fi

    echo "   ✅ ${suffix} 빌드 완료"
}

# ---------------------------------------------------
# 5. 플랫폼별 빌드 실행
# ---------------------------------------------------
# build_platform <pkg_os> <electron_os> <arch> <suffix>
build_platform "macos" "darwin" "arm64" "mac-arm64"
# build_platform "macos" "darwin" "x64"   "mac-intel"
build_platform "win"   "win32"  "x64"   "win-x64"
# build_platform "linux" "linux"  "x64"   "linux-x64"

# ---------------------------------------------------
# 5. ZIP 생성 (플랫폼 폴더 내부에 생성)
# ---------------------------------------------------
echo "📦 각 플랫폼 폴더 내부에 ZIP 파일 생성 중..."
cd dist
for platform_dir in */; do
    platform_dir="${platform_dir%/}"
    zip_name="${platform_dir}.zip"
    # 폴더 내부로 들어가서 그 내용물만 ZIP으로 압축하여 폴더 바로 안에 저장
    (cd "$platform_dir" && zip -r "${zip_name}" . -x "*.DS_Store")
    echo "   ✅ ${platform_dir}/${zip_name} 생성 완료"
done
cd -

# 📄 자가 업데이트용 update.json 생성 중...
UPDATE_JSON="dist/update.json"
PUBLISHED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Prerelease 여부 판별 (버전에 - 접미사가 있는 경우)
IS_PRERELEASE=false
if [[ $VERSION == *"-"* ]]; then
    IS_PRERELEASE=true
    echo "🧪 [Prerelease] 버전이 감지되었습니다. (${VERSION})"
fi

# 📂 [Optimization] ZIP 파일들을 dist/ 루트로 이동 (구조 단순화)
echo "📂 ZIP 파일들을 dist/ 루트로 모으는 중..."
# 각 플랫폼 하위 폴더에 생성된 ZIP들을 dist/ 바로 아래로 이동시킵니다.
mv dist/*/*.zip dist/ 2>/dev/null || true

cat <<EOF > "${UPDATE_JSON}"
{
  "tag_name": "v${VERSION}",
  "published_at": "${PUBLISHED_AT}",
  "prerelease": ${IS_PRERELEASE},
  "body": "BlogGenius v${VERSION} Release (Built at $(date))",
  "assets": [
EOF

FIRST_ASSET=true
# dist 루트에 있는 모든 ZIP 파일을 기반으로 에셋 목록 구성 (SHA-256 체크섬 포함)
cd dist
for zip_file in *.zip; do
    if [ ! -f "$zip_file" ]; then continue; fi
    if [ "$FIRST_ASSET" = "false" ]; then
        echo "," >> "../${UPDATE_JSON}"
    fi
    FIRST_ASSET=false
    
    FILE_NAME=$(basename "$zip_file")
    FILE_SHA256=$(shasum -a 256 "$zip_file" | awk '{print $1}')
    FILE_SIZE=$(stat -f%z "$zip_file" 2>/dev/null || stat --printf="%s" "$zip_file" 2>/dev/null || echo "0")
    echo "    {" >> "../${UPDATE_JSON}"
    echo "      \"name\": \"${FILE_NAME}\"," >> "../${UPDATE_JSON}"
    echo "      \"browser_download_url\": \"${FILE_NAME}\"," >> "../${UPDATE_JSON}"
    echo "      \"sha256\": \"${FILE_SHA256}\"," >> "../${UPDATE_JSON}"
    echo "      \"size\": ${FILE_SIZE}" >> "../${UPDATE_JSON}"
    echo "    }" >> "../${UPDATE_JSON}"
    echo "   🔐 ${FILE_NAME}: SHA-256=${FILE_SHA256} (${FILE_SIZE} bytes)"
done
cd -

cat <<EOF >> "${UPDATE_JSON}"
  ]
}
EOF
echo "   ✅ ${UPDATE_JSON} 생성 완료"

# 🚀 [Deploy] 서버 자동 업로드 (SCP)
if [ "$BUILD_ONLY" == "true" ]; then
    echo ""
    echo "⏭ [Skip] --build-only 옵션에 의해 업로드를 스킵합니다."
else
    UPLOAD_TARGET="hangadac:/usr/local/www/com/hangadac/wordpress/dist/BlogGenius/"
    echo ""
    echo "🚀 서버로 업로드 중... (target: ${UPLOAD_TARGET})"

    # ZIP 파일들과 update.json을 한 번에 업로드
    scp dist/*.zip "${UPDATE_JSON}" "${UPLOAD_TARGET}"

    if [ $? -eq 0 ]; then
        echo "   ✅ 서버 업로드 완료!"
        # 🧹 [Cleanup] 서버 용량 관리를 위해 각 플랫폼별 최신 3개만 남기고 삭제
        echo "   🧹 [Cleanup] 구버전 파일 정리 중 (최신 3개 유지)..."
        ssh hangadac "cd /usr/local/www/com/hangadac/wordpress/dist/BlogGenius/ && for suffix in mac-arm64 mac-intel win-x64 linux-x64; do ls -t *-\$suffix.zip 2>/dev/null | tail -n +4 | xargs -I {} rm -- {} 2>/dev/null; done"
        echo "   ✅ 서버 정리 완료"
    else
        echo "   ❌ [Error] 서버 업로드 실패 (SSH 설정을 확인하세요)"
        echo "   💡 Tip: dist/upload.sh를 생성했으니 나중에 수동으로 시도할 수 있습니다."
    fi
fi

# 🛠 [Utility] 수동 업로드용 스크립트 생성
UPLOAD_SH="dist/upload.sh"
cat <<EOF > "${UPLOAD_SH}"
#!/bin/bash
echo "🚀 [Manual] 서버로 업로드 중..."
scp ./*.zip ./update.json "${UPLOAD_TARGET}"
if [ \$? -eq 0 ]; then
    echo "✅ 업로드 성공!"
    echo "🧹 구버전 파일 정리 중..."
    ssh hangadac "cd /usr/local/www/com/hangadac/wordpress/dist/BlogGenius/ && for suffix in mac-arm64 mac-intel win-x64 linux-x64; do ls -t *-\$suffix.zip 2>/dev/null | tail -n +4 | xargs -I {} rm -- {} 2>/dev/null; done"
else
    echo "❌ 업로드 실패!"
fi
EOF
chmod +x "${UPLOAD_SH}"
echo "   ✅ 수동 업로드용 스크립트 생성 완료: ${UPLOAD_SH}"

echo ""
echo "---------------------------------------------------"
echo "🎉 모든 작업이 완료되었습니다!"
echo "📂 dist 폴더의 내용을 확인하세요."
