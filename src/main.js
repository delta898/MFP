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
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
    const warningCode =
        (warning && typeof warning === 'object' && warning.code)
            ? String(warning.code)
            : String(args.find(v => typeof v === 'string' && /^DEP\d+$/i.test(v)) || '');
    if (warningCode === 'DEP0040') return;
    return originalEmitWarning(warning, ...args);
};

const { Command } = require('commander');
const readline = require('readline/promises');
const fs = require('fs');
const path = require('path');
const { version: APP_VERSION } = require('../package.json');

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

program.configureHelp({
    subcommandTerm: (cmd) => {
        const names = [cmd.name(), ...cmd.aliases()];
        const namePart = names.join(' | ');
        const optionPart = cmd.options && cmd.options.length > 0 ? ' [options]' : '';
        return `${namePart}${optionPart}`;
    }
});

// --- Helper Functions ---

function isNaverLoginCompletedUrl(urlLike) {
    const urlStr = String(urlLike || '');
    return /naver\.com/i.test(urlStr) && !/nid\.naver\.com|nidlogin\.login/i.test(urlStr);
}

async function waitForNaverLoginCompleted(page, context, timeoutMs = 300000) {
    const start = Date.now();
    const pollIntervalMs = 500;

    // 1) 현재 탭 URL 변경 감지
    const samePageWait = page.waitForURL(url => isNaverLoginCompletedUrl(url), { timeout: timeoutMs })
        .then(() => 'same-page-url')
        .catch(() => null);

    // 2) 컨텍스트 내 모든 탭 URL 감지 + 인증 쿠키 감지
    const pollWait = (async () => {
        while (Date.now() - start < timeoutMs) {
            // 새 탭/리다이렉트 탭에서 로그인 완료 감지
            for (const p of context.pages()) {
                try {
                    if (isNaverLoginCompletedUrl(p.url())) {
                        return 'any-page-url';
                    }
                } catch (e) { }
            }

            // 인증 쿠키가 생기면 로그인 완료로 간주
            try {
                const cookies = await context.cookies([
                    'https://www.naver.com',
                    'https://naver.com',
                    'https://nid.naver.com'
                ]);
                const hasAuthCookie = cookies.some(c =>
                    c && (c.name === 'NID_AUT' || c.name === 'NID_SES')
                );
                if (hasAuthCookie) {
                    return 'auth-cookie';
                }
            } catch (e) { }

            await Utils.sleep(pollIntervalMs);
        }
        return null;
    })();

    const reason = await Promise.race([samePageWait, pollWait]);
    if (!reason) {
        throw new Error('네이버 로그인 완료를 확인하지 못했습니다. 다시 시도해 주세요.');
    }
    return reason;
}

async function closeBrowserResources(context, browser) {
    try { if (context) await context.close(); } catch (e) { }
    try { if (browser) await browser.close(); } catch (e) { }
}

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

        // 로그인 성공 감지:
        // - 현재 탭 URL
        // - 새로 열린 탭 URL
        // - 인증 쿠키(NID_AUT/NID_SES)
        // 중 하나라도 만족하면 성공으로 간주
        const detectedBy = await waitForNaverLoginCompleted(page, context, 300000);
        Logger.info(`✅ 로그인 완료 감지 (${detectedBy})`);

        // 인증 정보 저장
        await context.storageState({ path: CONFIG.AUTH_FILE_PATH });
        Logger.info(`✅ 로그인 정보 저장 완료: ${CONFIG.AUTH_FILE_PATH}`);

        await closeBrowserResources(context, browser);
        process.exit(0);
    } catch (e) {
        console.error(`\n❌ 로그인 프로세스 실패: ${e.message}`);
        await closeBrowserResources(context, browser);
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
        (normalized.includes('test 플랜') && normalized.includes('종료')) ||
        (normalized.toLowerCase().includes('license register')) ||
        (normalized.toLowerCase().includes('license upgrade'));

    if (isTestEnded) {
        console.log("💡 테스트 이용이 종료되었습니다. 계속 이용하려면 `./BlogGenius license upgrade`를 실행해 주세요.");
        console.log("💡 업그레이드 중 이메일 등록이 필요하면 자동으로 등록 절차가 이어집니다.");
    }
}

async function askUserInput(promptText) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await rl.question(promptText);
        return String(answer || '').trim();
    } finally {
        rl.close();
    }
}

async function askUserInputWithTimeout(promptText, timeoutSeconds) {
    const timeoutMs = Math.max(1, parseInt(timeoutSeconds, 10) || 300) * 1000;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        const answer = await rl.question(promptText, { signal: abortController.signal });
        return { value: String(answer || '').trim(), timedOut: false };
    } catch (e) {
        if (e && e.name === 'AbortError') {
            return { value: '', timedOut: true };
        }
        throw e;
    } finally {
        clearTimeout(timer);
        rl.close();
    }
}

function isCancelInput(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['q', 'quit', 'cancel', 'exit'].includes(normalized);
}

function formatDateTimeKst(rawDateTime) {
    const raw = String(rawDateTime || '').trim();
    if (!raw) return '';
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';

    const parts = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false
    }).formatToParts(dt);

    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    if (!map.year || !map.month || !map.day || !map.hour || !map.minute || !map.second) return '';
    return `${map.year}년 ${map.month}월 ${map.day}일 ${map.hour}시 ${map.minute}분 ${map.second}초`;
}

async function resolveEmailInput(initialEmail = '') {
    let email = String(initialEmail || '').trim();
    if (!email) {
        email = await askUserInput('📧 이메일을 입력하세요: ');
    }
    if (!email) {
        return { canceled: true, email: '' };
    }
    if (isCancelInput(email)) {
        return { canceled: true, email: '' };
    }
    return { canceled: false, email };
}

async function requestAndPromptVerificationCode(requestFn, email) {
    const requested = await requestFn(email);
    if (!requested.success) {
        return { success: false, message: requested.message || '인증 코드 요청에 실패했습니다.' };
    }

    console.log('✅ 인증 코드가 전송되었습니다. 메일함을 확인해 주세요.');
    if (process.env.DEBUG && requested.verificationCode) {
        console.log(`ℹ️ 개발모드 인증 코드: ${requested.verificationCode}`);
    }

    const ttlSeconds = Math.max(1, parseInt(requested.ttlSeconds, 10) || 300);
    const ttlMinutes = Math.max(1, Math.ceil(ttlSeconds / 60));
    const expiresAtText = formatDateTimeKst(requested.expiresAt);
    if (expiresAtText) {
        console.log(`⏱️ 인증 코드 유효시간: ${ttlMinutes}분 (${ttlSeconds}초. ${expiresAtText}까지)`);
    } else {
        console.log(`⏱️ 인증 코드 유효시간: ${ttlMinutes}분 (${ttlSeconds}초)`);
    }
    console.log('↩️ 취소하려면 q 입력 후 Enter를 누르세요.');

    const codeInput = await askUserInputWithTimeout('🔢 인증 코드를 입력하세요: ', ttlSeconds);
    if (codeInput.timedOut) {
        return { success: false, message: '인증 코드 입력 시간이 초과되었습니다. 다시 시도해 주세요.' };
    }
    const code = String(codeInput.value || '').trim();
    if (!code || isCancelInput(code)) {
        return { success: false, message: '라이선스 등록/복구가 취소되었습니다.', canceled: true };
    }

    return { success: true, code };
}

async function executeRegisterFlow(initialEmail = '') {
    const resolved = await resolveEmailInput(initialEmail);
    if (resolved.canceled) {
        return { success: false, canceled: true, message: '라이선스 등록이 취소되었습니다.' };
    }

    const codeResult = await requestAndPromptVerificationCode(License.requestLicenseRegistration, resolved.email);
    if (!codeResult.success) return codeResult;

    return await License.verifyLicenseRegistration(resolved.email, codeResult.code);
}

async function executeRecoveryFlow(initialEmail = '') {
    const resolved = await resolveEmailInput(initialEmail);
    if (resolved.canceled) {
        return { success: false, canceled: true, message: '라이선스 복구가 취소되었습니다.' };
    }

    const codeResult = await requestAndPromptVerificationCode(License.requestLicenseRecovery, resolved.email);
    if (!codeResult.success) return codeResult;

    return await License.verifyLicenseRecovery(resolved.email, codeResult.code);
}

function shouldRunRegisterBeforeUpgrade(message = '') {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('이메일') && normalized.includes('등록');
}

const UPGRADE_PLAN_CATALOG = [
    {
        code: 'free',
        name: 'Free Plan',
        summary: '월 15회 사용',
        note: '일부 고급 기능 제한',
        enabled: true
    },
    {
        code: 'pro',
        name: 'Pro Plan',
        summary: '월 정기 구독 (준비중)',
        note: '전체 기능 + 넉넉한 사용량(예정)',
        enabled: false
    },
    {
        code: 'ultra',
        name: 'Ultra Plan',
        summary: '월 정기 구독 (준비중)',
        note: '전체 기능 + 무제한 사용량(예정)',
        enabled: false
    }
];

function getUpgradePlanMeta(planCode = '') {
    const normalized = String(planCode || '').trim().toLowerCase();
    return UPGRADE_PLAN_CATALOG.find(plan => plan.code === normalized) || null;
}

function printUpgradePlanGuide() {
    console.log('\n📦 선택 가능한 플랜 안내');
    UPGRADE_PLAN_CATALOG.forEach(plan => {
        const status = plan.enabled ? '가능' : '준비중';
        console.log(`- ${plan.code} (${plan.name}) [${status}]`);
        console.log(`  · ${plan.summary}`);
        console.log(`  · ${plan.note}`);
    });
}

async function resolveUpgradePlanInput(initialPlan = '') {
    const planArg = String(initialPlan || '').trim().toLowerCase();
    if (planArg) {
        if (isCancelInput(planArg)) {
            return { canceled: true, plan: '' };
        }
        return { canceled: false, plan: planArg };
    }

    printUpgradePlanGuide();
    const answer = await askUserInput('\n🎯 업그레이드할 플랜 코드를 입력하세요 (예: free, 취소: q): ');
    const selected = String(answer || '').trim().toLowerCase();
    if (!selected || isCancelInput(selected)) {
        return { canceled: true, plan: '' };
    }
    return { canceled: false, plan: selected };
}

// --- Commands ---

// 1️⃣ Login Command
program.command('login').description('🔐 [네이버 로그인]').action(async () => { await performLogin(); });

program
    .command('license')
    .description('🔑 [라이선스] 등록/조회')
    .addCommand(
        new Command('status')
            .description('📋 [상태] 현재 라이선스 상태 조회')
            .action(async () => {
                try {
                    const status = await License.checkLicenseStatus();
                    if (!status.success) {
                        console.error(`⛔ ${status.message}`);
                        printLicenseNextAction(status.message);
                        return;
                    }

                    const planLabel = status.planDisplayName || status.planCode || 'Unknown plan';
                    const remainingLabel =
                        (typeof status.remaining === 'number' && status.remaining < 0)
                            ? '무제한'
                            : `${status.remaining ?? 'N/A'}회`;
                    const startedAtLabel = status.createdAt
                        ? new Date(status.createdAt).toLocaleString('ko-KR', { hour12: false })
                        : 'N/A';
                    const usageLimitLabel =
                        (typeof status.usageLimit === 'number' && status.usageLimit < 0)
                            ? '무제한'
                            : `${status.usageLimit ?? 'N/A'}회`;
                    const usageCountLabel =
                        (typeof status.usageCount === 'number')
                            ? `${status.usageCount}회`
                            : 'N/A';

                    console.log('✅ 라이선스 상태');
                    console.log(`- 플랜: ${planLabel}`);
                    console.log(`- 시작 일시: ${startedAtLabel}`);
                    console.log(`- 총 한도: ${usageLimitLabel}`);
                    console.log(`- 사용: ${usageCountLabel}`);
                    console.log(`- 잔여: ${remainingLabel}`);
                } catch (e) {
                    console.error(`❌ 에러: ${e.message}`);
                    if (process.env.DEBUG) console.error('Stack:', e.stack);
                }
            })
    )
    .addCommand(
        new Command('register')
            .description('📨 [등록] 이메일 인증으로 라이선스 등록')
            .option('--email <email>', '등록할 이메일')
            .action(async (opts) => {
                try {
                    const verified = await executeRegisterFlow(String(opts.email || '').trim());
                    if (!verified.success) {
                        if (verified.canceled) {
                            console.log(`ℹ️ ${verified.message || '라이선스 등록이 취소되었습니다.'}`);
                            return;
                        }
                        console.error(`⛔ ${verified.message}`);
                        return;
                    }

                    const remainingLabel =
                        (typeof verified.remaining === 'number' && verified.remaining < 0)
                            ? '무제한'
                            : `${verified.remaining ?? 'N/A'}회`;
                    console.log(`✅ 등록 완료 (${verified.planDisplayName || verified.planCode || 'Unknown plan'} 잔여: ${remainingLabel})`);
                    console.log('💡 플랜을 변경하려면 `./BlogGenius license upgrade`를 실행하세요.');
                } catch (e) {
                    console.error(`❌ 에러: ${e.message}`);
                    if (process.env.DEBUG) console.error('Stack:', e.stack);
                }
            })
    )
    .addCommand(
        new Command('recover')
            .description('♻️ [복구] 이메일 인증으로 라이선스 복구')
            .option('--email <email>', '복구할 이메일')
            .action(async (opts) => {
                try {
                    const recovered = await executeRecoveryFlow(String(opts.email || '').trim());
                    if (!recovered.success) {
                        if (recovered.canceled) {
                            console.log(`ℹ️ ${recovered.message || '라이선스 복구가 취소되었습니다.'}`);
                            return;
                        }
                        console.error(`⛔ ${recovered.message}`);
                        return;
                    }

                    const remainingLabel =
                        (typeof recovered.remaining === 'number' && recovered.remaining < 0)
                            ? '무제한'
                            : `${recovered.remaining ?? 'N/A'}회`;
                    console.log(`✅ 복구 완료 (${recovered.planDisplayName || recovered.planCode || 'Unknown plan'} 잔여: ${remainingLabel})`);
                } catch (e) {
                    console.error(`❌ 에러: ${e.message}`);
                    if (process.env.DEBUG) console.error('Stack:', e.stack);
                }
            })
    )
    .addCommand(
        new Command('upgrade')
            .description('⬆️ [업그레이드] 플랜 업그레이드')
            .option('--plan <plan>', '대상 플랜 코드 (예: free)')
            .option('--email <email>', '미등록 시 자동 등록에 사용할 이메일')
            .action(async (opts) => {
                try {
                    const resolvedPlan = await resolveUpgradePlanInput(opts.plan);
                    if (resolvedPlan.canceled) {
                        console.log('ℹ️ 라이선스 업그레이드가 취소되었습니다.');
                        return;
                    }
                    const targetPlan = resolvedPlan.plan;
                    let email = String(opts.email || '').trim();

                    const planMeta = getUpgradePlanMeta(targetPlan);
                    if (!planMeta) {
                        console.error(`⛔ 알 수 없는 플랜 코드입니다: ${targetPlan}`);
                        printUpgradePlanGuide();
                        return;
                    }
                    if (!planMeta.enabled) {
                        console.log(`ℹ️ ${planMeta.name}은(는) 아직 준비 중입니다.`);
                        console.log('💡 현재 즉시 전환 가능한 플랜은 free 입니다.');
                        return;
                    }

                    let upgraded = await License.upgradeLicense(targetPlan, email);
                    if (!upgraded.success && shouldRunRegisterBeforeUpgrade(upgraded.message)) {
                        console.log('ℹ️ 업그레이드 전에 이메일 등록이 필요합니다. 등록 절차를 이어서 진행합니다.');
                        const registered = await executeRegisterFlow(email);
                        if (!registered.success) {
                            if (registered.canceled) {
                                console.log(`ℹ️ ${registered.message || '라이선스 등록이 취소되었습니다.'}`);
                                return;
                            }
                            console.error(`⛔ ${registered.message}`);
                            return;
                        }
                        email = email || '';
                        upgraded = await License.upgradeLicense(targetPlan, email);
                    }

                    if (!upgraded.success) {
                        console.error(`⛔ ${upgraded.message}`);
                        return;
                    }

                    const remainingLabel =
                        (typeof upgraded.remaining === 'number' && upgraded.remaining < 0)
                            ? '무제한'
                            : `${upgraded.remaining ?? 'N/A'}회`;
                    console.log(`✅ 업그레이드 완료 (${upgraded.planDisplayName || upgraded.planCode || 'Unknown plan'} 잔여: ${remainingLabel})`);
                } catch (e) {
                    console.error(`❌ 에러: ${e.message}`);
                    if (process.env.DEBUG) console.error('Stack:', e.stack);
                }
            })
    );

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
    .description('📤 [발행] 폴더 내 콘텐츠 기반 발행')
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
    .option('--date <date>', '트렌드 기준일 (YYYYMMDD / -Nd)')
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
    console.log('  $ ./BlogGenius license status');
    console.log('  $ ./BlogGenius license register --email=you@example.com');
    console.log('  $ ./BlogGenius license recover --email=you@example.com');
    console.log('  $ ./BlogGenius license upgrade');
    console.log('  $ ./BlogGenius gen');
    console.log('  $ ./BlogGenius trends --date=-1d');
    console.log('  $ ./BlogGenius trends --date=20260130');
    console.log('  $ ./BlogGenius pub -d "workspace/콘텐츠_폴더"');
    console.log('  $ ./BlogGenius batch');
    console.log('  $ ./BlogGenius shopping');
});

program.parse(process.argv);
