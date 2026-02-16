#!/usr/bin/env node

process.env.TZ = 'Asia/Seoul';

// --------------------------------------------------------
// 🛠️ [Fix 1] Crypto Polyfill (Node 버전 호환성 확보)
// --------------------------------------------------------
const crypto = require('crypto');
if (!globalThis.crypto) {
    if (crypto.webcrypto) {
        globalThis.crypto = crypto.webcrypto;
    } else {
        globalThis.crypto = {
            getRandomValues: (buffer) => crypto.randomFillSync(buffer),
            subtle: {}
        };
    }
}

// 불필요한 경고 메시지 숨기기 (punycode deprecated 등)
process.env.NODE_NO_WARNINGS = '1';
const originalWarn = console.warn;
console.warn = (...args) => {
    if (args[0] && args[0].includes && args[0].includes('deprecated')) return;
    originalWarn.apply(console, args);
};

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const APP_VERSION = require('./version');

// ✅ 분리된 모듈 불러오기
const License = require('./license');
const Core = require('./core');
const Utils = require('./utils');
const CONFIG = require('./config-loader');
const BrowserLauncher = require('./browser-launcher');
const KeywordManager = require('./keyword-manager'); // [New]
const TrendManager = require('./trend-manager'); // Add this
const ShoppingManager = require('./shopping-manager'); // Add this
const Logger = require('./logger'); // Add this
const Constants = require('./constants'); // 🔥 [필수] 상수를 수정하기 위해 불러옴

// --------------------------------------------------------
// 🛠️ [Fix 2] config.txt 설정을 읽어 API 모델 적용 (핵심!)
// --------------------------------------------------------
// 사용자가 config.txt에 'gemini-2.0-flash'라고 적으면, 
// 이를 실제 API 호출 주소(URL)로 변환하여 상수를 덮어씁니다.
const BASE_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

if (CONFIG.TEXT_MODEL) {
    Constants.GEMINI_TEXT_ENDPOINT = `${BASE_API_URL}/${CONFIG.TEXT_MODEL}:generateContent`;
    // console.log(`🧠 텍스트 모델 적용: ${CONFIG.TEXT_MODEL}`);
}

if (CONFIG.IMAGE_MODEL) {
    Constants.GEMINI_IMAGE_ENDPOINT = `${BASE_API_URL}/${CONFIG.IMAGE_MODEL}:generateContent`;
    // console.log(`🎨 이미지 모델 적용: ${CONFIG.IMAGE_MODEL}`);
}

// 타이핑 속도나 대기 시간 등 기타 설정은 Core나 BrowserLauncher에서 
// 직접 CONFIG를 참조하므로 여기서는 모델 URL만 처리하면 충분합니다.


console.log("⏳ BlogGenius 시스템 모듈을 로딩하고 있습니다...");

const program = new Command();

program
    .name('BlogGenius')
    .usage('[command] [options]')
    .version(APP_VERSION)
    .description(`🤖 네이버 블로그 자동 포스팅 봇 - Topic 기반 엔진 (v${APP_VERSION})`);

// --- Helper Functions ---

async function performLogin() {
    console.log("\n🚀 [Login Mode] 네이버 로그인 브라우저를 엽니다...");

    // 브라우저 실행
    let browser;
    try {
        // 로그인은 사용자의 수동 입력이 필요하므로 HEADLESS 설정과 무관하게 항상 UI를 표시한다.
        browser = await BrowserLauncher.launchBrowser({ headless: false });
    } catch (e) {
        console.error("❌ [Error] 브라우저 실행 실패:", e);
        return;
    }

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        await page.goto('https://nid.naver.com/nidlogin.login');
        console.log("🔑 직접 로그인 완료 후 네이버 메인 이동 시 자동 저장됩니다.");

        // 로그인 성공 감지: URL이 nid.naver.com이 아니고 naver.com을 포함할 때
        await page.waitForURL(url => {
            const urlStr = url.toString();
            return urlStr.includes('naver.com') && !urlStr.includes('nid.naver.com');
        }, { timeout: 300000 }); // 5분 대기

        // 인증 정보 저장
        await context.storageState({ path: CONFIG.AUTH_FILE_PATH });
        console.log(`\n✅ 로그인 정보 저장 완료: ${CONFIG.AUTH_FILE_PATH}`);

        await browser.close();
        process.exit(0);
    } catch (e) {
        console.error(`\n❌ 로그인 프로세스 실패: ${e.message}`);
        if (browser) await browser.close();
        process.exit(1);
    }
}

async function checkAuthSessionValid() {
    const authPath = CONFIG.AUTH_FILE_PATH;
    if (!authPath || !fs.existsSync(authPath)) {
        return { ok: false, reason: 'missing_auth' };
    }

    let browser = null;
    let context = null;
    try {
        browser = await BrowserLauncher.launchBrowser({ headless: true });
        context = await browser.newContext({
            storageState: authPath,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        const checkUrl = CONFIG.WRITE_URL || `https://blog.naver.com/${CONFIG.NAVER_ID}/postwrite`;

        await page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await Utils.sleep(400);

        const currentUrl = String(page.url() || '');
        if (/nid\.naver\.com/i.test(currentUrl) || /nidlogin\.login/i.test(currentUrl)) {
            return { ok: false, reason: 'expired' };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: 'check_failed', message: e.message };
    } finally {
        try { if (context) await context.close(); } catch (e) { }
        try { if (browser) await browser.close(); } catch (e) { }
    }
}

async function ensureAuth(isStrict = true) {
    if (!fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
        if (!isStrict) return false;
        console.error("\n⛔ [인증 필요] 로그인 정보(auth.json)를 찾을 수 없습니다.");
        console.error("👉 아래 명령으로 먼저 로그인해 주세요:");
        console.error("   ./BlogGenius login");
        process.exit(1);
    }

    if (!isStrict) return true;

    console.log("🔎 [인증 확인] 네이버 세션 유효성 점검 중...");
    const session = await checkAuthSessionValid();
    if (session.ok) return true;

    if (session.reason === 'expired') {
        console.error("\n⛔ [인증 만료] 로그인 세션이 만료되었습니다.");
    } else if (session.reason === 'missing_auth') {
        console.error("\n⛔ [인증 필요] 로그인 정보(auth.json)가 없습니다.");
    } else {
        console.error(`\n⛔ [인증 확인 실패] 세션 확인 중 오류가 발생했습니다: ${session.message || 'unknown error'}`);
    }
    console.error("👉 아래 명령으로 다시 로그인 후 재실행해 주세요:");
    console.error("   ./BlogGenius login");
    process.exit(1);
}

function parseMaxPosts(value, fallback = 3) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) return fallback;
    return parsed;
}

function resolveMaxBlogPostsPerRun() {
    return parseMaxPosts(CONFIG.MAX_BLOG_POSTS_PER_RUN, 3);
}

function resolveMaxShoppingPostsPerRun() {
    return parseMaxPosts(CONFIG.MAX_SHOPPING_POSTS_PER_RUN, 3);
}

function toFeatureMap(rawFeatures) {
    return (rawFeatures && typeof rawFeatures === 'object' && !Array.isArray(rawFeatures))
        ? rawFeatures
        : {};
}

function getFeatureBool(features, key, fallback = true) {
    const map = toFeatureMap(features);
    if (!(key in map)) return fallback;
    const value = map[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'off'].includes(v)) return false;
    }
    return fallback;
}

function getFeatureInt(features, key, fallback = null) {
    const map = toFeatureMap(features);
    if (!(key in map)) return fallback;
    const num = parseInt(map[key], 10);
    if (Number.isNaN(num) || num < 0) return fallback;
    return num;
}

function getEnableRelatedPostsAutoLink(features) {
    const map = toFeatureMap(features);
    return getFeatureBool(map, 'enable_related_posts_auto_link', true);
}

function getEnableTrendsDateOverride(features, planCode = '') {
    const map = toFeatureMap(features);
    // 명시된 feature가 있으면 그 값을 우선
    if (Object.prototype.hasOwnProperty.call(map, 'enable_trends_date_override')) {
        return getFeatureBool(map, 'enable_trends_date_override', false);
    }
    // 하위 호환: feature 미정의 시 free만 기본 비활성, 나머지는 활성
    return String(planCode || '').toLowerCase() !== 'free';
}

function isCommandEnabled(features, command) {
    const keyMap = {
        pub: 'cmd_pub',
        batch: 'cmd_batch',
        trends: 'cmd_trends',
        shopping: 'cmd_shopping'
    };
    const key = keyMap[command];
    if (!key) return true;
    return getFeatureBool(features, key, true);
}

function printLicenseNextAction(message = '') {
    const normalized = String(message || '').trim();
    if (!normalized) return;

    const isTestEnded =
        normalized.includes('test 플랜 1회 사용이 이미 종료되었습니다') ||
        (normalized.includes('test 플랜') && normalized.includes('종료'));

    if (isTestEnded) {
        console.log("💡 테스트 이용해주셔서 감사합니다. 계속 이용하시려면 Pro 등의 상품을 구독해주시기 바랍니다.");
    }
}

// --- Commands ---

// 1️⃣ Login Command
program.command('login').description('🔐 [로그인]').action(async () => { await performLogin(); });

// 2️⃣ Generate Command
program
    .command('generate').alias('gen')
    .description('📝 [생성] 구글 시트 기반 콘텐츠/이미지 생성 (발행X)')
    .action(async () => {
        try {
            await ensureAuth(false);
            await Utils.ensureAllSheetsExist();

            console.log("\n▶️ [Gen Mode] 시트 기반 콘텐츠 생성을 시작합니다...");
            console.log(`📡 구글 스프레드시트에서 주제를 읽어옵니다...`);

            const topics = await Utils.readGoogleSheetTopics();
            const maxPostsPerRun = resolveMaxBlogPostsPerRun();
            let targetTopics = maxPostsPerRun === 0 ? topics : topics.slice(0, maxPostsPerRun);

            console.log(`📂 총 ${topics.length}개의 주제를 발견했습니다.`);
            console.log(`⚙️ 이번 실행 최대 처리 건수: ${maxPostsPerRun === 0 ? '무제한' : maxPostsPerRun}`);

            if (targetTopics.length === 0) {
                console.log("📭 생성할 주제가 없습니다. (상태: 블로그 발행 준비 완료)");
                return;
            }

            console.log("🔐 [라이선스] 실행 전 사전 유효성 확인...");
            const precheck = await License.checkLicenseStatus();
            if (!precheck.success) {
                console.error(`\n⛔ [중단] 라이선스 확인 결과: ${precheck.message}`);
                printLicenseNextAction(precheck.message);
                console.log("👉 라이선스 확인 실패로 작업 시작 전 종료합니다.");
                return;
            }
            const featureMap = toFeatureMap(precheck.features);
            const imageGenerationEnabled = getFeatureBool(featureMap, 'image_generation', true);
            const enableRelatedPostsAutoLink = getEnableRelatedPostsAutoLink(featureMap);

            const planMaxBlogPosts = getFeatureInt(featureMap, 'max_blog_posts_per_run', null);
            if (planMaxBlogPosts !== null && planMaxBlogPosts > 0 && targetTopics.length > planMaxBlogPosts) {
                console.log(`ℹ️ 플랜 제한(max_blog_posts_per_run=${planMaxBlogPosts})에 따라 ${planMaxBlogPosts}건만 생성합니다.`);
                targetTopics = targetTopics.slice(0, planMaxBlogPosts);
            }
            if (planMaxBlogPosts === 0) {
                console.log("ℹ️ 플랜 정책상 max_blog_posts_per_run=0(무제한)으로 처리합니다.");
            }

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < targetTopics.length; i++) {
                const topicData = targetTopics[i];
                const rowIndex = topicData.rowIndex;

                console.log(`\n---------------------------------------------------`);
                console.log(`[작업 ${i + 1}/${targetTopics.length}] 생성 중...`);

                try {
                    console.log(`[진행] 주제: ${topicData.subject || '자동 생성 중'} (Row ${rowIndex + 1})`);
                    const result = await Core.generateContent(topicData, null, {
                        enableRelatedPostsAutoLink
                    });
                    await Core.prepareImages(result.targetDir, topicData, {
                        imageGenerationEnabled
                    });
                    console.log(`✅ 생성 완료: ${result.targetDir}`);
                    successCount++;
                } catch (err) {
                    console.error(`❌ 생성 실패: ${err.message}`);
                    failCount++;
                }

                if (i < targetTopics.length - 1) {
                    const delay = CONFIG.BATCH_INTERVAL_SECONDS || 30;
                    console.log(`⏳ ${delay}초 대기 중...`);
                    await Utils.sleep(delay * 1000);
                }
            }

            console.log(`\n===================================================`);
            console.log(`🎉 생성 작업 종료 (미발행)`);
            console.log(`📊 결과: 성공 ${successCount} / 실패 ${failCount}`);
            console.log(`===================================================`);
        } catch (e) {
            console.error('❌ 에러:', e.message);
            if (process.env.DEBUG) console.error('Stack:', e.stack);
        }
    });

// 3️⃣ Batch Command
program
    .command('batch')
    .description('📚 [배치] 구글 시트 대량 포스팅')
    .action(async () => {
        try {
            console.log("\n▶️ [Batch Mode] 작업을 시작합니다...");
            await ensureAuth(true);

            // [New] 필수 시트 존재 여부 확인 및 생성
            await Utils.ensureAllSheetsExist();

            // 구글 스프레드시트에서 주제 읽기
            console.log(`📡 구글 스프레드시트에서 주제를 읽어옵니다...`);
            const topics = await Utils.readGoogleSheetTopics();
            const maxPostsPerRun = resolveMaxBlogPostsPerRun();
            let targetTopics = maxPostsPerRun === 0 ? topics : topics.slice(0, maxPostsPerRun);

            console.log(`📂 총 ${topics.length}개의 주제를 발견했습니다.`);
            console.log(`⚙️ 이번 실행 최대 처리 건수: ${maxPostsPerRun === 0 ? '무제한' : maxPostsPerRun}`);

            if (targetTopics.length === 0) {
                console.log("📭 처리할 새로운 주제가 없습니다.");
                return;
            }

            console.log("🔐 [라이선스] 실행 전 사전 유효성 확인...");
            const precheck = await License.checkLicenseStatus();
            if (!precheck.success) {
                console.error(`\n⛔ [중단] 라이선스 확인 결과: ${precheck.message}`);
                printLicenseNextAction(precheck.message);
                console.log("👉 라이선스 확인 실패로 작업 시작 전 종료합니다.");
                return;
            }
            const featureMap = toFeatureMap(precheck.features);
            if (!isCommandEnabled(featureMap, 'batch')) {
                console.error("\n⛔ [중단] 현재 플랜에서 batch 기능이 비활성화되어 있습니다. (cmd_batch=false)");
                return;
            }
            const imageGenerationEnabled = getFeatureBool(featureMap, 'image_generation', true);
            const enableRelatedPostsAutoLink = getEnableRelatedPostsAutoLink(featureMap);

            const planMaxBlogPosts = getFeatureInt(featureMap, 'max_blog_posts_per_run', null);
            if (planMaxBlogPosts !== null && planMaxBlogPosts > 0 && targetTopics.length > planMaxBlogPosts) {
                console.log(`ℹ️ 플랜 제한(max_blog_posts_per_run=${planMaxBlogPosts})에 따라 ${planMaxBlogPosts}건만 진행합니다.`);
                targetTopics = targetTopics.slice(0, planMaxBlogPosts);
            }

            if (precheck.precheckUnavailable) {
                console.log("ℹ️ 사전 검증 RPC가 없어 잔여 횟수 기반 선제 제한은 건너뜁니다.");
            }
            const precheckAllowedCount = (typeof precheck.remaining === 'number' && precheck.remaining >= 0)
                ? precheck.remaining
                : Number.POSITIVE_INFINITY;
            if (Number.isFinite(precheckAllowedCount) && precheckAllowedCount <= 0) {
                console.log("📭 현재 라이선스 잔여 횟수가 0회입니다. 이번 실행은 진행하지 않습니다.");
                return;
            }
            if (Number.isFinite(precheckAllowedCount) && targetTopics.length > precheckAllowedCount) {
                console.log(`ℹ️ 현재 라이선스 잔여 기준으로 이번 실행은 ${precheckAllowedCount}건만 진행합니다. (후보 ${targetTopics.length}건)`);
                targetTopics = targetTopics.slice(0, precheckAllowedCount);
            }

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < targetTopics.length; i++) {
                const topicData = targetTopics[i];
                const rowIndex = topicData.rowIndex;

                console.log(`\n---------------------------------------------------`);
                console.log(`[작업 ${i + 1}/${targetTopics.length}] 준비 중...`);

                try {
                    console.log(`[진행] 주제: ${topicData.subject || '자동 생성 중'} (Row ${rowIndex + 1})`);

                    // 생성 -> 이미지 -> 발행 순차 진행
                    const result = await Core.generateContent(topicData, null, {
                        enableRelatedPostsAutoLink
                    });
                    await Core.prepareImages(result.targetDir, topicData, {
                        imageGenerationEnabled
                    });

                    console.log("🔐 [라이선스] 블로그 발행 직전 확인...");
                    const check = await License.verifyLicense();
                    if (!check.success) {
                        console.error(`\n⛔ [중단] 라이선스 확인 결과: ${check.message}`);
                        printLicenseNextAction(check.message);
                        await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 준비 완료', '라이선스 부족으로 발행 보류');
                        console.log(`👉 남은 ${targetTopics.length - i}건은 처리되지 않았습니다.`);
                        break;
                    }

                    await Utils.updateGoogleSheetStatus(rowIndex, '발행 중', '발행 시작');
                    await Core.publishToBlog(result.targetDir);

                    // 완료 상태 업데이트
                    await Utils.updateGoogleSheetStatus(rowIndex, '블로그 발행 완료', '발행 완료');

                    successCount++;

                    console.log(`✅ 발행 성공!`);
                } catch (err) {
                    console.error(`❌ 실패: ${err.message}`);
                    // 실패 상태 업데이트
                    await Utils.updateGoogleSheetStatus(rowIndex, '실패', err.message);

                    failCount++;
                }

                // 다음 작업 전 대기 (config.txt 설정값 사용)
                if (i < targetTopics.length - 1) {
                    const delay = CONFIG.BATCH_INTERVAL_SECONDS || 30;
                    console.log(`⏳ ${delay}초 대기 중...`);
                    await Utils.sleep(delay * 1000);
                }
            }

            if (maxPostsPerRun !== 0 && topics.length > targetTopics.length) {
                console.log(`ℹ️ 설정된 MAX_BLOG_POSTS_PER_RUN(${maxPostsPerRun})에 따라 이번 실행은 ${targetTopics.length}건만 처리했습니다.`);
            }

            console.log(`\n===================================================`);
            console.log(`🎉 배치 작업 종료`);
            console.log(`📊 결과: 성공 ${successCount} / 실패 ${failCount}`);
            console.log(`===================================================`);

        } catch (e) {
            console.error('❌ 에러:', e.message);
            if (process.env.DEBUG) console.error('Stack:', e.stack);
        }
    });

// 4️⃣ Publish Command
program
    .command('publish').alias('pub')
    .description('📤 [발행] 폴더 업로드')
    .requiredOption('-d, --dir <path>', '폴더 경로')
    .action(async (opts) => {
        try {
            await ensureAuth(true);
            console.log("🔐 [라이선스] 실행 전 사전 유효성 확인...");
            const precheck = await License.checkLicenseStatus();
            if (!precheck.success) {
                console.error(`\n⛔ [중단] 라이선스 확인 결과: ${precheck.message}`);
                printLicenseNextAction(precheck.message);
                process.exit(1);
            }
            const featureMap = toFeatureMap(precheck.features);
            if (!isCommandEnabled(featureMap, 'pub')) {
                console.error("⛔ [중단] 현재 플랜에서 pub 기능이 비활성화되어 있습니다. (cmd_pub=false)");
                process.exit(1);
            }
            console.log("🔐 [라이선스] 블로그 발행 직전 확인...");
            const check = await License.verifyLicense();
            if (!check.success) {
                console.error(`⛔ ${check.message}`);
                printLicenseNextAction(check.message);
                process.exit(1);
            }
            await Core.publishToBlog(path.resolve(opts.dir));
            console.log("\n🎉 발행 완료.");
        } catch (e) {
            console.error('❌ 에러:', e.message);
            if (process.env.DEBUG) console.error('Stack:', e.stack);
        }

    });

// 5️⃣ Keywords Command [New]
program
    .command('keywords')
    .alias('kw')
    .description('🔍 [키워드] 연관검색어 추출 및 토픽 등록')
    .action(async () => {
        try {
            // 필수 시트 존재 여부 확인 및 생성
            await Utils.ensureAllSheetsExist();

            // 키워드 작업은 브라우저 인증이 필수적이지 않을 수 있으나, 
            // 시트 접근을 위해 Service Account가 아닌 Token 방식을 쓴다면 필요할 수도 있음.
            // Utils.js가 어떤 Auth를 쓰느냐에 따름 (현재는 Key 파일 기반이므로 ensureAuth 불필요할 수도 있으나 안전하게 유지)
            // await ensureAuth(false); 

            await KeywordManager.processKeywords();
        } catch (e) {
            console.error('❌ 에러:', e.message);
            if (process.env.DEBUG) console.error('Stack:', e.stack);
        }
    });

// 6️⃣ Trends Command [New]
program
    .command('trends')
    .description('📈 [트렌드] 크리에이터 어드바이저 트렌드 수집')
    .option('--date <date>', '트렌드 기준일 (YYYY-MM-DD / YYYYMMDD / yesterday / -Nd)')
    .action(async (options) => {
        try {
            console.log("\n▶️ [Trend Mode] 트렌드 키워드 수집을 시작합니다...");
            await ensureAuth(true); // 로그인 필요

            // 필수 시트 존재 여부 확인 및 생성
            await Utils.ensureAllSheetsExist();

            console.log("🔐 [라이선스] 실행 전 사전 유효성 확인...");
            const precheck = await License.checkLicenseStatus();
            if (!precheck.success) {
                console.error(`\n⛔ [중단] 라이선스 확인 결과: ${precheck.message}`);
                printLicenseNextAction(precheck.message);
                return;
            }
            const featureMap = toFeatureMap(precheck.features);
            if (!isCommandEnabled(featureMap, 'trends')) {
                console.error("⛔ [중단] 현재 플랜에서 trends 기능이 비활성화되어 있습니다. (cmd_trends=false)");
                return;
            }
            const enableTrendsDateOverride = getEnableTrendsDateOverride(featureMap, precheck.planCode);
            if (options.date && !enableTrendsDateOverride) {
                console.error("⛔ [중단] 현재 플랜에서 날짜 지정 트렌드(--date) 기능이 비활성화되어 있습니다. (enable_trends_date_override=false)");
                return;
            }

            // 1. 트렌드 키워드 수집
            const trendResult = await TrendManager.fetchTrends({ date: options.date });
            const trendKeywords = Array.isArray(trendResult)
                ? trendResult
                : (trendResult?.keywords || []);
            const trendDate = (!Array.isArray(trendResult) && trendResult?.date)
                ? trendResult.date
                : null;

            if (!trendKeywords || trendKeywords.length === 0) {
                console.log('⚠️ 수집된 트렌드 키워드가 없습니다.');
            } else {
                console.log("🔐 [라이선스] 트렌드 시트 반영 직전 확인...");
                const check = await License.verifyLicense();
                if (!check.success) {
                    console.error(`⛔ ${check.message}`);
                    printLicenseNextAction(check.message);
                    process.exit(1);
                }
                console.log(`📥 수집된 ${trendKeywords.length}개의 키워드를 구글 시트에 추가합니다...`);
                await Utils.appendGoogleSheetTrends(trendKeywords, trendDate);
                console.log('✅ 트렌드 키워드 추가 완료!');
            }
        } catch (e) {
            console.error('❌ 에러:', e.message);
            if (process.env.DEBUG) console.error('Stack:', e.stack);
        }
    });

// 7️⃣ Shopping Command [New]
program
    .command('shopping')
    .description('🛍️ [쇼핑] 쇼핑커넥트 URL 기반 리뷰/추천 포스팅')
    .action(async () => {
        try {
            console.log("\n▶️ [Shopping Mode] 쇼핑 포스팅 작업을 시작합니다...");
            await ensureAuth(true); // 발행 작업이므로 로그인 필요
            await Utils.ensureAllSheetsExist();

            const jobs = await Utils.readGoogleSheetShopping();
            const maxPostsPerRun = resolveMaxShoppingPostsPerRun();
            let targetJobs = maxPostsPerRun === 0 ? jobs : jobs.slice(0, maxPostsPerRun);
            console.log(`📂 총 ${jobs.length}개의 쇼핑 URL을 발견했습니다.`);
            console.log(`⚙️ 이번 실행 최대 처리 건수: ${maxPostsPerRun === 0 ? '무제한' : maxPostsPerRun}`);

            if (targetJobs.length === 0) {
                console.log("📭 처리할 쇼핑 URL이 없습니다. (상태: 발행 준비 완료)");
                return;
            }

            console.log("🔐 [라이선스] 실행 전 사전 유효성 확인...");
            const precheck = await License.checkLicenseStatus();
            if (!precheck.success) {
                console.error(`\n⛔ [중단] 라이선스 확인 결과: ${precheck.message}`);
                printLicenseNextAction(precheck.message);
                console.log("👉 라이선스 확인 실패로 작업 시작 전 종료합니다.");
                return;
            }
            const featureMap = toFeatureMap(precheck.features);
            if (!isCommandEnabled(featureMap, 'shopping')) {
                console.error("\n⛔ [중단] 현재 플랜에서 shopping 기능이 비활성화되어 있습니다. (cmd_shopping=false)");
                return;
            }
            const enableRelatedPostsAutoLink = getEnableRelatedPostsAutoLink(featureMap);

            const planMaxShoppingPosts = getFeatureInt(featureMap, 'max_shopping_posts_per_run', null);
            if (planMaxShoppingPosts !== null && planMaxShoppingPosts > 0 && targetJobs.length > planMaxShoppingPosts) {
                console.log(`ℹ️ 플랜 제한(max_shopping_posts_per_run=${planMaxShoppingPosts})에 따라 ${planMaxShoppingPosts}건만 진행합니다.`);
                targetJobs = targetJobs.slice(0, planMaxShoppingPosts);
            }

            if (precheck.precheckUnavailable) {
                console.log("ℹ️ 사전 검증 RPC가 없어 잔여 횟수 기반 선제 제한은 건너뜁니다.");
            }
            const precheckAllowedCount = (typeof precheck.remaining === 'number' && precheck.remaining >= 0)
                ? precheck.remaining
                : Number.POSITIVE_INFINITY;
            if (Number.isFinite(precheckAllowedCount) && precheckAllowedCount <= 0) {
                console.log("📭 현재 라이선스 잔여 횟수가 0회입니다. 이번 실행은 진행하지 않습니다.");
                return;
            }
            if (Number.isFinite(precheckAllowedCount) && targetJobs.length > precheckAllowedCount) {
                console.log(`ℹ️ 현재 라이선스 잔여 기준으로 이번 실행은 ${precheckAllowedCount}건만 진행합니다. (후보 ${targetJobs.length}건)`);
                targetJobs = targetJobs.slice(0, precheckAllowedCount);
            }

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < targetJobs.length; i++) {
                const job = targetJobs[i];
                const rowIndex = job.rowIndex;

                console.log(`\n---------------------------------------------------`);
                console.log(`[작업 ${i + 1}/${targetJobs.length}] 쇼핑 콘텐츠 준비 중...`);

                try {
                    console.log(`[진행] 쇼핑 URL 처리 (Row ${rowIndex + 1})`);

                    await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 중', false);
                    const result = await ShoppingManager.buildPostFromShortUrl(job.shortUrl, {
                        enableRelatedPostsAutoLink
                    });

                    console.log("🔐 [라이선스] 블로그 발행 직전 확인...");
                    const check = await License.verifyLicense();
                    if (!check.success) {
                        console.error(`\n⛔ [중단] 라이선스 확인 결과: ${check.message}`);
                        printLicenseNextAction(check.message);
                        await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 준비 완료');
                        console.log(`👉 남은 ${targetJobs.length - i}건은 처리되지 않았습니다.`);
                        break;
                    }

                    await Core.publishToBlog(result.targetDir, {
                        affiliateUrl: job.shortUrl,
                        requireAffiliateUrl: true
                    });
                    await Utils.updateGoogleSheetShoppingStatus(rowIndex, '발행 완료');
                    successCount++;
                    console.log('✅ 쇼핑 포스팅 발행 버튼 처리 완료');
                } catch (err) {
                    console.error(`❌ 쇼핑 URL 처리 실패: ${err.message}`);
                    await Utils.updateGoogleSheetShoppingStatus(rowIndex, '실패');
                    failCount++;
                }

                if (i < targetJobs.length - 1) {
                    const delay = CONFIG.BATCH_INTERVAL_SECONDS || 30;
                    console.log(`⏳ ${delay}초 대기 중...`);
                    await Utils.sleep(delay * 1000);
                }
            }

            if (maxPostsPerRun !== 0 && jobs.length > targetJobs.length) {
                console.log(`ℹ️ 설정된 MAX_SHOPPING_POSTS_PER_RUN(${maxPostsPerRun})에 따라 이번 실행은 ${targetJobs.length}건만 처리했습니다.`);
            }

            console.log(`\n===================================================`);
            console.log(`🎉 쇼핑 작업 종료`);
            console.log(`📊 결과: 성공 ${successCount} / 실패 ${failCount}`);
            console.log(`===================================================`);

        } catch (e) {
            console.error('❌ 에러:', e.message);
            if (process.env.DEBUG) console.error('Stack:', e.stack);
        }
    });

program.on('--help', () => {
    console.log('');
    console.log('📖 사용 예시:');
    console.log('  $ ./BlogGenius login');
    console.log('  $ ./BlogGenius gen');
    console.log('  $ ./BlogGenius trends --date=-1d');
    console.log('  $ ./BlogGenius trends --date=yesterday');
    console.log('  $ ./BlogGenius trends --date=2026-01-30');
    console.log('  $ ./BlogGenius trends --date=20260130');
    console.log('  $ ./BlogGenius pub -d "workspace/내_원고_폴더"');
    console.log('  $ ./BlogGenius batch');
    console.log('  $ ./BlogGenius shopping');
});

program.parse(process.argv);
