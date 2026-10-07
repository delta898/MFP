#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const cheerio = require('cheerio');
const { chromium } = require('playwright');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');
const { createCssCompositionRuntime } = require('../src/ui-runtime/css-composition-runtime');
const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');
const { getDefaultContentWritingProfile, DEFAULT_CONTENT_WRITING_PROFILE_METADATA } = require('../src/content/writing-profile');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const MANUSCRIPT_DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const PASTE_MANUSCRIPT_DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const smokeProgress = { phase: 'preparing fixtures', phaseStartedAt: Date.now(), pageUrl: '' };

function instrumentPageActions(page) {
    const mark = (action) => {
        const caller = new Error().stack?.split('\n')[3]?.trim() || 'unknown caller';
        smokeProgress.lastAction = `${action} (${caller})`;
    };
    const pageMethods = ['evaluate', 'evaluateHandle', 'waitForFunction', 'waitForSelector', 'goto', 'reload'];
    for (const method of pageMethods) {
        const original = page[method].bind(page);
        page[method] = (...args) => {
            mark(`page.${method}`);
            return original(...args);
        };
    }

    const locatorPrototype = Object.getPrototypeOf(page.locator('html'));
    const locatorMethods = [
        'click', 'dblclick', 'fill', 'type', 'press', 'check', 'uncheck', 'selectOption', 'setInputFiles',
        'waitFor', 'waitForFunction', 'textContent', 'innerText', 'inputValue', 'isVisible', 'isHidden',
        'isEnabled', 'isDisabled', 'count', 'evaluate', 'evaluateAll', 'screenshot'
    ];
    for (const method of locatorMethods) {
        const original = locatorPrototype[method];
        if (typeof original !== 'function' || original.__uiSmokeInstrumented) continue;
        const wrapped = function (...args) {
            mark(`locator.${method} ${this.toString?.() || ''}`);
            return original.apply(this, args);
        };
        wrapped.__uiSmokeInstrumented = true;
        locatorPrototype[method] = wrapped;
    }
}

function reportSmokePhase(phase) {
    smokeProgress.phase = phase;
    smokeProgress.phaseStartedAt = Date.now();
    smokeProgress.lastAction = '';
    console.log(`[ui-smoke] ${new Date().toISOString()} ${phase}`);
}

async function awaitSmokeCheck(phase, check, timeoutMs = 20000) {
    reportSmokePhase(phase);
    let timeout;
    try {
        await Promise.race([
            check,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`Smoke phase watchdog expired after ${timeoutMs}ms: ${phase}`)), timeoutMs);
            })
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function getContentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
    }[extension] || 'application/octet-stream';
}

function createAccountOverviewFixture() {
    return {
        identity: { email: 'ui-smoke@example.com', email_verified: true },
        subscription: { plan_code: 'free', plan_name: 'Free', status: 'active' },
        usage: { mode: 'metered', cycle: 'monthly', used: 2, limit: 10, remaining: 8 },
        connections: {
            naver: { status: 'connected', message: 'fixture' },
            google_account: { status: 'configured', message: 'fixture' },
            google_sheets: { status: 'connected', message: 'fixture' },
            wordpress: { status: 'not_configured', message: 'fixture' },
            buffer: { status: 'not_configured', message: 'fixture' }
        },
        setup: {
            ready: true,
            ai: { configured: true, text_configured: true, image_configured: true },
            google: { configured: true, account_connected: true, spreadsheet_configured: true },
            publishing_channel: { configured: true, naver_configured: true, wordpress_configured: false }
        },
        actions: [],
        smart_usage: {
            cycle: 'monthly',
            items: [{
                capability: 'content_idea',
                label: '글감 추천',
                limit: 20,
                used: 0,
                remaining: 20,
                requestLimit: 2,
                requestsRemaining: null
            }]
        }
    };
}

function createWritingProfileFixture(profile = getDefaultContentWritingProfile()) {
    return {
        schema_version: 1,
        active_profile: 'custom',
        default_profile_overrides: {
            writing_strategy: profile.common.writing_strategy,
            writing_mode: profile.common.voice.writing_mode,
            speech_level: profile.common.voice.speech_level
        },
        custom_profile: {
            based_on_default_version: DEFAULT_CONTENT_WRITING_PROFILE_METADATA.profile_version,
            ...profile
        },
        effective_profile: profile,
        default_profile: getDefaultContentWritingProfile(),
        default_profile_metadata: DEFAULT_CONTENT_WRITING_PROFILE_METADATA,
        source: 'custom', warnings: [], updated_at: null
    };
}

function getApiFixture(pathname) {
    // Keep health versionless so config/status must initialize every version display.
    // This guards the startup race where health can be temporarily unavailable.
    if (pathname === '/api/v1/health') return { status: 'ok' };
    if (pathname === '/api/v1/config/status') {
        return {
            ready: true,
            isEssentialSet: true,
            isNaverSet: true,
            isWpSet: true,
            runtimeEnvironment: {
                environment: 'development',
                status: 'active',
                configured: true,
                endpointHost: 'fixture.supabase.co',
                selectionSource: 'fixture'
            },
            setup: {
                ready: true,
                ai: { configured: true, text_configured: true, image_configured: true },
                google: { configured: true, account_connected: true, spreadsheet_configured: true },
                publishing_channel: { configured: true, naver_configured: true, wordpress_configured: false }
            },
            version: '0.2.0',
            message: ''
        };
    }
    if (pathname.startsWith('/api/v1/account/overview')) return createAccountOverviewFixture();
    if (pathname === '/api/v1/dashboard/summary') return {};
    if (pathname === '/api/v1/dashboard/logs') return { logs: [] };
    if (pathname === '/api/v1/dashboard/activities') return { activities: [] };
    if (pathname === '/api/v1/dashboard/external-content') return {};
    if (pathname === '/api/v1/continuous-publishing/dashboard-overview') {
        return {
            schema_version: 2,
            generated_at: '2026-09-02T01:00:00.000Z',
            flow: {
                state: 'idle', busy: false, subject: '', message: '',
                started_at: null, finished_at: null, result_status: '', source: null
            },
            automation: {
                enabled: true, effective_enabled: true, status: 'scheduled', interval_minutes: 30,
                next_processing_at: '2026-09-02T01:30:00.000Z'
            },
            queue: {
                ready_count: 2,
                saved_count: 1,
                running_count: 0,
                next_items: [{
                    row_index: 1,
                    row_number: 3,
                    subject: 'Dashboard Beta 다음 글감',
                    targets: ['naver'],
                    post_status: 'draft',
                    processing_estimate_at: '2026-09-02T01:30:00.000Z'
                }]
            }
        };
    }
    if (pathname === '/api/v1/continuous-publishing/dashboard-result-stats') {
        return {
            schema_version: 3,
            generated_at: '2026-09-02T01:00:00.000Z',
            timezone: 'Asia/Seoul',
            available: true,
            periods: {
                today: {
                    from: '2026-09-01T15:00:00.000Z', to: '2026-09-02T15:00:00.000Z', processed_count: 3, published_count: 1,
                    trend_unit: 'hour',
                    trend_series: Array.from({ length: 11 }, (_unused, index) => ({
                        bucket_start: new Date(Date.UTC(2026, 8, 1, 15 + index)).toISOString(),
                        processed_count: index % 4 === 1 ? 1 : 0, published_count: index === 9 ? 1 : 0
                    })),
                    recent_results: [{
                        id: 'dashboard-result-today', occurred_at: '2026-09-02T00:50:00.000Z',
                        subject: '오늘 발행 결과', platform: 'wordpress', post_status: 'publish',
                        result_url: 'https://example.com/dashboard-result', navigation_url: 'https://example.com/dashboard-result',
                        navigation_kind: 'result'
                    }]
                },
                week: {
                    from: '2026-08-30T15:00:00.000Z', to: '2026-09-06T15:00:00.000Z', processed_count: 8, published_count: 4,
                    trend_unit: 'day',
                    trend_series: Array.from({ length: 7 }, (_unused, index) => ({
                        bucket_start: new Date(Date.UTC(2026, 7, 30 + index, 15)).toISOString(),
                        processed_count: index % 3, published_count: index % 2
                    })),
                    recent_results: [{
                        id: 'dashboard-result-week', occurred_at: '2026-08-31T01:00:00.000Z',
                        subject: '이번 주 임시 저장 결과', platform: 'naver', post_status: 'draft',
                        result_url: null, navigation_url: 'https://blog.naver.com/fixture', navigation_kind: 'platform_home'
                    }]
                },
                month: {
                    from: '2026-08-03T15:00:00.000Z', to: '2026-09-02T15:00:00.000Z', processed_count: 19, published_count: 9,
                    trend_unit: 'day',
                    trend_series: Array.from({ length: 30 }, (_unused, index) => ({
                        bucket_start: new Date(Date.UTC(2026, 7, 3 + index, 15)).toISOString(),
                        processed_count: index % 4, published_count: index % 3 === 0 ? 1 : 0
                    })),
                    recent_results: [{
                        id: 'dashboard-result-month', occurred_at: '2026-08-20T01:00:00.000Z',
                        subject: '30일 발행 결과', platform: 'wordpress', post_status: 'publish',
                        result_url: 'https://example.com/month-result', navigation_url: 'https://example.com/month-result', navigation_kind: 'result'
                    }]
                }
            }
        };
    }
    if (pathname === '/api/v1/recommendations') {
        return {
            schema_version: 1,
            generated_at: new Date().toISOString(),
            count: 1,
            store: { mode: 'persistent', reason: '' },
            items: [{
                schema_version: 1,
                recommendation_id: 'recommendation:ui-smoke:1',
                kind: 'content_opportunity',
                lane: 'serendipity',
                hint: '지금 떠오르는 키워드',
                title: 'WordPress 설정을 확인해보세요',
                summary: '발행 채널 설정을 마치면 다음 작업으로 이어갈 수 있습니다.',
                explanation: '현재 설정 상태를 근거로 한 안내입니다.',
                evidence: [{
                    evidence_id: 'evidence:ui-smoke:1',
                    kind: 'system_state',
                    stage: 'observed',
                    strength: 'strong',
                    summary: 'WordPress 연결 정보가 확인되지 않았습니다.',
                    observed_at: new Date().toISOString(),
                    source: { label: '앱 설정 상태', url: '', timestamp: new Date().toISOString() }
                }],
                status: 'available',
                available_at: new Date().toISOString(),
                snoozed_until: null,
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                action: {
                    type: 'presentation', label: 'WordPress 설정 보기',
                    target: { surface: 'settings.wordpress', view: 'settings', tab: 'naver-blog' },
                    payload: { section: 'wordpress' }
                }
            }]
        };
    }
    if (pathname === '/api/v1/recommendations/interaction') {
        return {
            ok: true,
            status: 'presentation',
            recommendation_id: 'recommendation:ui-smoke:1',
            action: {
                type: 'presentation', label: 'WordPress 설정 보기',
                target: { surface: 'settings.wordpress', view: 'settings', tab: 'naver-blog' },
                payload: { section: 'wordpress' }
            }
        };
    }
    if (pathname === '/api/v1/recommendations/discover') {
        const now = new Date().toISOString();
        return {
            schema_version: 1,
            generated_at: now,
            count: 1,
            rotated_count: 1,
            items: [{
                schema_version: 1,
                recommendation_id: 'recommendation:ui-smoke:discovery',
                kind: 'content_opportunity',
                lane: 'serendipity',
                hint: '지금 떠오르는 키워드',
                title: '로컬 여행',
                summary: '새로운 소재나 관점을 발견할 수 있습니다.',
                explanation: '외부 Trends에서 관찰된 주제에 근거한 제안입니다.',
                evidence: [{
                    evidence_id: 'evidence:ui-smoke:discovery',
                    kind: 'trends',
                    stage: 'observed',
                    strength: 'weak',
                    summary: '최근 트렌드에서 관찰된 여행 주제입니다.',
                    observed_at: now,
                    source: { label: '네이버 트렌드', url: '', timestamp: now }
                }],
                status: 'available',
                available_at: now,
                snoozed_until: null,
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                action: {
                    type: 'presentation', label: 'WordPress 설정 보기',
                    target: { surface: 'settings.wordpress', view: 'settings', tab: 'naver-blog' },
                    payload: { section: 'wordpress' }
                }
            }]
        };
    }
    if (pathname === '/api/v1/surface-content/dashboard') {
        return {
            regions: {
                supporting: {
                    blocks: [{
                        id: 'developer-support-dashboard',
                        kind: 'support',
                        presentation: 'compact_card',
                        title: '개발자 응원하기',
                        icon: 'heart',
                        media: null,
                        targetUrl: 'https://example.com/support',
                        ctaLabel: '후원 페이지 열기',
                        disclosure: '',
                        sortOrder: 300
                    }]
                },
                recommendations: {
                    blocks: [{
                        id: 'bloggenius-tip-1',
                        kind: 'resource',
                        presentation: 'compact_card',
                        title: 'BlogGenius로 꾸준한 글쓰기 흐름 만들기',
                        icon: 'sparkles',
                        media: null,
                        targetUrl: 'https://example.com/bloggenius-tip',
                        ctaLabel: '팁 보기',
                        disclosure: '',
                        sortOrder: 100
                    }]
                }
            }
        };
    }
    if (pathname === '/api/v1/surface-content/help') {
        const block = (id, kind, title, targetUrl, ctaLabel, icon = 'book', sortOrder = 100) => ({
            id, kind, presentation: 'compact_card', title, icon, media: null,
            targetUrl, ctaLabel, disclosure: '', sortOrder
        });
        return {
            schemaVersion: 1,
            policyRevision: 1,
            surface: 'help',
            generatedAt: new Date().toISOString(),
            regions: {
                getting_started: { blocks: [
                    block('remote-help-install', 'resource', '원격 설치 가이드', 'https://example.com/help/install', '설치 방법 보기')
                ] },
                writing: { blocks: [
                    block('remote-help-writing', 'resource', '원격 글쓰기 가이드', 'https://example.com/help/writing', '작성 방법 보기'),
                    block('remote-help-ai', 'resource', 'AI 설정 가이드', 'https://m.blog.naver.com/amadejjs/224368506082', 'AI 설정 방법 보기')
                ] },
                automation: { blocks: [
                    block('remote-help-automation', 'resource', '원격 자동화 가이드', 'https://example.com/help/automation', '자동화 방법 보기'),
                    block('remote-help-buffer', 'resource', 'Buffer로 SNS 발행 준비', 'https://m.blog.naver.com/amadejjs/223940980574', 'Buffer 도움말 보기', 'sparkles', 200)
                ] },
                supporting: { blocks: [
                    block('remote-help-support', 'support', '개발자 응원하기', 'https://example.com/help/support', '후원 페이지 열기', 'heart')
                ] }
            }
        };
    }
    if (pathname.startsWith('/api/v1/surface-content/')) return { regions: {} };
    if (pathname === '/api/v1/auto/status') return { enabled: false };
    if (pathname === '/api/v1/system/update/check') return { available: false };
    if (pathname === '/api/v1/system/update/failure') return { pending: false };
    if (pathname === '/api/v1/system/update/completion') return { pending: false };
    if (pathname === '/api/v1/sheets/ensure') return { ready: true };
    if (pathname === '/api/v1/social/manual/config') {
        return { configured: false, local_media_available: true, channels: [], ai: { available: false, model_name: '' } };
    }
    if (pathname === '/api/v1/card-news/image-models') {
        return {
            default: { provider: 'direct', code: 'fixture-image', name: 'Fixture Image', configured: true },
            providers: [
                {
                    provider: 'google',
                    name: 'Google',
                    models: [{ provider: 'google', code: 'gemini-3.1-flash-image', name: 'Gemini Image', identity: 'google:gemini-3.1-flash-image' }]
                },
                {
                    provider: 'openai',
                    name: 'OpenAI',
                    models: [{ provider: 'openai', code: 'gpt-image-1', name: 'GPT Image', identity: 'openai:gpt-image-1' }]
                },
                {
                    provider: 'kie',
                    name: 'KIE.ai',
                    models: [{ provider: 'kie', code: 'nano-banana-pro', name: 'Nano Banana Pro', identity: 'kie:nano-banana-pro' }]
                }
            ]
        };
    }
    if (pathname === '/api/v1/settings/major') {
        return {
            configPath: 'fixture/config.json',
            fields: {
                GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/fixture-sheet-id/edit',
                GOOGLE_SHEET_AUTHORIZED_FILE_ID: 'fixture-sheet-id',
                TEXT_MODEL_PROVIDER: 'direct', TEXT_MODEL_NAME: 'fixture-text', TEXT_MODEL_BASE_URL: 'https://ai.fixture.example/v1', TEXT_MODEL_API_KEY: 'fixture-text-key',
                IMAGE_MODEL_PROVIDER: 'direct', IMAGE_MODEL_NAME: 'fixture-image', IMAGE_MODEL_BASE_URL: 'https://image.fixture.example/v1', IMAGE_MODEL_API_KEY: 'fixture-image-key',
                CHAT_MODEL_SOURCE: 'writing', CHAT_MODEL_PROVIDER: 'direct', CHAT_MODEL_NAME: 'fixture-text', CHAT_MODEL_BASE_URL: 'https://ai.fixture.example/v1', CHAT_MODEL_API_KEY: 'fixture-text-key'
            },
            aiPresets: { text: [], image: [], chat: [] },
            aiProviderProfiles: { text: {}, image: {}, chat: {} },
            shoppingImageDefaults: {},
            shoppingImageSlots: {}
        };
    }
    if (pathname === '/api/v1/settings/core-connections') {
        return { fields: {
            GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/fixture-sheet-id/edit',
            GOOGLE_SHEET_AUTHORIZED_FILE_ID: 'fixture-sheet-id'
        } };
    }
    if (pathname === '/api/v1/settings/ai-roles') {
        return {
            fields: {
                TEXT_MODEL_PROVIDER: 'direct', TEXT_MODEL_NAME: 'fixture-text', TEXT_MODEL_BASE_URL: 'https://ai.fixture.example/v1', TEXT_MODEL_API_KEY_CONFIGURED: true,
                IMAGE_MODEL_PROVIDER: 'direct', IMAGE_MODEL_NAME: 'fixture-image', IMAGE_MODEL_BASE_URL: 'https://image.fixture.example/v1', IMAGE_MODEL_API_KEY_CONFIGURED: true,
                CHAT_MODEL_SOURCE: 'writing', CHAT_MODEL_PROVIDER: 'direct', CHAT_MODEL_NAME: 'fixture-text', CHAT_MODEL_BASE_URL: 'https://ai.fixture.example/v1', CHAT_MODEL_API_KEY_CONFIGURED: true
            },
            aiPresets: {
                text: [{ provider: 'openai', code: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', base_url: 'https://api.openai.com/v1' }],
                image: [], chat: [], providers: { text: [{ id: 'google', name: 'Google' }, { id: 'openai', name: 'OpenAI' }], image: [], chat: [] }
            },
            aiProviderProfiles: {
                text: { openai: { provider: 'openai', code: 'gpt-5.6-sol', name: '', base_url: '', api_key_configured: true } },
                image: {}, chat: {}
            }
        };
    }
    if (pathname === '/api/v1/settings/ai-roles/test') return { display_name: 'fixture model', latency_ms: 8 };
    if (pathname === '/api/v1/settings/optional-services') {
        return { fields: {
            BUFFER_API_KEY_CONFIGURED: true,
            BUFFER_ORGANIZATION_ID: 'fixture-buffer-org',
            BUFFER_CONNECTION_VERIFICATION: {
                status: 'connected', checked_at: '2026-09-25T00:00:00.000Z', trusted: true, message: ''
            },
            NOTIFY_TELEGRAM_BOT_TOKEN_CONFIGURED: true,
            NOTIFY_TELEGRAM_CHAT_ID: 'fixture-chat',
            NOTIFY_SLACK_WEBHOOK_URL_CONFIGURED: true,
            NOTIFY_BITLY_TOKEN_CONFIGURED: true
        } };
    }
    if (pathname === '/api/v1/settings/writing-profile') {
        return createWritingProfileFixture();
    }
    if (pathname === '/api/v1/settings/writing-profile/references/analyze') {
        return {
            sample_text: { value: 'fixture reference', status: 'analyzed' }, blog_urls: [],
            fingerprint: {
                surface: { writing_mode: 'written', speech_level: 'polite', tone: 'calm', information_density: 'balanced' },
                settings: { length_preset: 'standard', opening: 'contextual', development: 'explanatory', ending: 'summary', heading_density: 'balanced' },
                summary: '차분한 설명형 문체'
            },
            fingerprint_input_hash: 'fixture', analyzed_at: '2026-09-09T00:00:00.000Z', analyzer_version: 'fixture',
            analyzer_model: { provider: 'fixture', code: 'fixture', name: 'fixture' }
        };
    }
    if (pathname === '/api/v1/settings/writing-profile/preview') {
        return {
            kind: 'blog', topic: 'fixture topic', strategy: 'search', sample_length: 24,
            outline: { opening: '문제 제시', sections: [{ heading: '핵심', role: '설명' }], ending: '요약' },
            sample: '현재 기본값을 적용한 미리보기입니다.'
        };
    }
    if (pathname === '/api/v1/session/naver') return { status: 'logged_in', valid: true };
    if (pathname === '/api/v1/session/wordpress-verify') return { success: true, message: '연동 성공' };
    if (pathname === '/api/v1/logs/files') return { files: [] };
    if (pathname === '/api/v1/trends/items') return { items: [], total: 0, limit: 50, offset: 0 };
    if (pathname === '/api/v1/blog/topics') return { items: [], total: 0, limit: 50, offset: 0 };
    if (pathname === '/api/v1/shopping/items') return { items: [], total: 0, limit: 50, offset: 0 };
    if (pathname === '/api/v1/shopping/preview') {
        return {
            shortUrl: 'https://naver.me/fixture',
            finalUrl: 'https://smartstore.naver.com/fixture/products/1234567890',
            title: 'UI 회귀 테스트 상품',
            productNameSuggestion: 'UI 회귀 테스트 상품',
            thumbnailUrl: '',
            resolvedSource: 'short_url',
            imageCount: 4,
            commerce: {
                salePrice: 19900,
                originalPrice: 29900,
                discountRate: 33,
                salePriceText: '19,900원',
                originalPriceText: '29,900원'
            }
        };
    }
    if (pathname === '/api/v1/blog/auto/categories') return { categories: [] };
    if (pathname === '/api/v1/trend-posting/meta') {
        return { categories: ['여행'], dateRange: { min: '2026-08-20', max: '2026-08-30' } };
    }
    if (pathname === '/api/v1/trend-posting/keywords') {
        return {
            count: 1,
            items: [{
                id: 'trend-beta-1', keyword: '제주 가을 여행', latestTrendDate: '2026-08-30',
                categories: ['여행'], change: { type: 'up', amount: 12, raw: '12↑' }
            }]
        };
    }
    if (pathname === '/api/v1/trend-posting/recent-topics') return { items: [] };
    return {};
}

function startFixtureServer(requests) {
    const composedUiShellSource = createHtmlCompositionRuntime({ fs, path })
        .composeHtmlFile({ uiRoot }).html;
    const composedUiShellDocument = cheerio.load(composedUiShellSource);
    // Browser smoke covers the active product surfaces. Keep the retired views
    // out of the fixture entirely so their markup/scripts cannot be exercised
    // or trigger unrelated external requests (for example the old RSS widget).
    composedUiShellDocument('#view-dashboard, #view-settings, #view-blog').remove();
    composedUiShellDocument('.nav-btn[data-view="dashboard"], .nav-btn[data-view="blog"], .nav-btn[data-view="settings"]').remove();
    const composedUiShell = composedUiShellDocument.html();
    const composedUiStyles = createCssCompositionRuntime({ fs, path })
        .composeCssFile({ uiRoot }).css;
    const composedUiScript = createJsCompositionRuntime({ fs, path })
        .composeJsFile({ uiRoot }).js;
    const topicRecommendationCallsBySession = new Map();
    const siteHostingProjects = [];
    const siteHostingSites = new Map();
    const siteHostingSettings = new Map();
    const continuousPublishingQueue = [];
    const continuousSavedTopics = [];
    let continuousTopicSequence = 10;
    let continuousAutomationSettings = {
        schema_version: 1,
        enabled: false,
        allowed_start_time: '00:00',
        allowed_end_time: '23:59',
        interval_minutes: 60,
        notification_enabled: false,
        updated_at: null
    };
    let continuousRunnerStatus = {
        state: 'idle',
        message: '실행 대기 중',
        rowIndex: null,
        rowNumber: null,
        subject: '',
        resultStatus: '',
        progressStage: '',
        completionLinks: [],
        busy: false
    };
    let continuousRunnerPollsRemaining = 0;
    let localMarkdownPublishing = false;
    let manuscriptDraftRevision = 0;
    let manuscriptDraftPostStatus = 'publish';
    let manuscriptDraftTarget = 'naver';
    let manuscriptContentVersion = 1;
    let manuscriptPublishedHistory = [];
    let manuscriptDraftSourceKind = 'folder';
    let manuscriptDraftTitle = '폴더 원고';
    let manuscriptDraftImages = [
        { index: 0, slotId: 'image-0', title: '첫 이미지', prompt: '푸른 하늘', exists: true, excluded: false, assetOrigin: 'folder', canRestore: false },
        { index: 1, slotId: 'image-1', title: '둘째 이미지', prompt: '초록 숲', exists: false, excluded: false, assetOrigin: '', canRestore: false }
    ];
    const aiGenerationOperations = new Map();
    let aiGenerationSequence = 0;
    const manuscriptImageOperations = new Map();
    let manuscriptImageOperationSequence = 0;
    let pasteManuscriptDraftRevision = 0;
    let pasteManuscriptDraftPostStatus = 'publish';
    let pasteManuscriptMarkdown = '';
    let pasteManuscriptDraftImages = [
        { index: 0, slotId: 'image-0', title: '붙여넣기 이미지', prompt: '따뜻한 분위기의 이미지', exists: false, excluded: false, assetOrigin: '', canRestore: false }
    ];
    const buildManuscriptDraftFixture = () => {
        const images = manuscriptDraftImages.map((image) => ({
            ...image,
            imageUrl: image.exists ? `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/images/${image.slotId}?revision=${manuscriptDraftRevision}` : '',
            imagePath: '',
            fileName: image.exists ? `${String(image.index).padStart(2, '0')}_fixture.png` : ''
        }));
        return {
            draftId: MANUSCRIPT_DRAFT_ID,
            revision: manuscriptDraftRevision,
            contentVersion: String(manuscriptContentVersion),
            publishedTargets: [...new Set(manuscriptPublishedHistory
                .filter((entry) => entry.contentVersion === manuscriptContentVersion)
                .map((entry) => entry.target))],
            sourceKind: manuscriptDraftSourceKind,
            source: manuscriptDraftSourceKind === 'ai'
                ? { type: 'generated_quick_post', folderName: '' }
                : { type: 'local_markdown', folderName: 'browser-manuscript' },
            title: manuscriptDraftTitle,
            rawMarkdown: manuscriptDraftSourceKind === 'folder' || manuscriptDraftSourceKind === 'ai'
                ? `# ${manuscriptDraftTitle}\n\n${manuscriptDraftSourceKind === 'folder' ? '폴더 본문' : 'AI 본문'}\n\n[[IMAGE_0\ntitle: ${manuscriptDraftImages[0]?.title || '첫 이미지'}\nprompt: ${manuscriptDraftImages[0]?.prompt || '푸른 하늘'}\n]]\n\n[[IMAGE_1\ntitle: ${manuscriptDraftImages[1]?.title || '둘째 이미지'}\nprompt: ${manuscriptDraftImages[1]?.prompt || '초록 숲'}\n]]`
                : `# ${manuscriptDraftTitle}`,
            bodyPreview: '폴더 본문',
            contentItems: [
                { type: 'header-h2', text: '폴더 미리보기' },
                { type: 'paragraph', text: '원고 폴더 본문입니다.' },
                ...images.filter((image) => !image.excluded).map((image) => ({ type: 'image', index: image.index, slotId: image.slotId, text: image.title, prompt: image.prompt, exists: image.exists, imageUrl: image.imageUrl }))
            ],
            images,
            stats: {
                contentCount: 4,
                imageBlockCount: images.length,
                imageResolvedCount: images.filter((image) => image.exists).length,
                imageExcludedCount: images.filter((image) => image.excluded).length,
                imageTargetCount: images.filter((image) => !image.excluded).length,
                imageMissingCount: images.filter((image) => !image.excluded && !image.exists).length
            },
            validation: { ok: true, errors: [], warnings: [] }
        };
    };
    const buildPasteManuscriptDraftFixture = () => {
        const images = pasteManuscriptDraftImages.map((image) => ({
            ...image,
            imageUrl: image.exists ? `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/images/${image.slotId}?revision=${pasteManuscriptDraftRevision}` : '',
            imagePath: '',
            fileName: image.exists ? `${String(image.index).padStart(2, '0')}_paste.png` : ''
        }));
        return {
            draftId: PASTE_MANUSCRIPT_DRAFT_ID,
            revision: pasteManuscriptDraftRevision,
            sourceKind: 'paste',
            source: { type: 'pasted_markdown', folderName: '붙여넣기' },
            title: pasteManuscriptMarkdown.match(/^#\s+(.+)$/m)?.[1] || '제목 없음',
            rawMarkdown: pasteManuscriptMarkdown,
            bodyPreview: pasteManuscriptMarkdown,
            contentItems: [
                { type: 'header-h2', text: '미리보기 소제목' },
                { type: 'paragraph', text: pasteManuscriptMarkdown.includes('마지막 편집 내용입니다') ? '마지막 편집 내용입니다' : 'Markdown 본문입니다.', boldRanges: [{ start: 0, end: 8 }] },
                ...(pasteManuscriptMarkdown.includes('## 함께 보면 좋은 글') ? [
                    { type: 'header-h2', text: '함께 보면 좋은 글' },
                    { type: 'list-item', listType: 'unordered', text: '[추천 글](https://example.com/related)' }
                ] : []),
                ...images.filter((image) => !image.excluded).map((image) => ({ type: 'image', index: image.index, slotId: image.slotId, text: image.title, prompt: image.prompt, exists: image.exists, imageUrl: image.imageUrl }))
            ],
            images,
            stats: {
                contentCount: 3,
                imageBlockCount: images.length,
                imageResolvedCount: images.filter((image) => image.exists).length,
                imageExcludedCount: images.filter((image) => image.excluded).length,
                imageTargetCount: images.filter((image) => !image.excluded).length,
                imageMissingCount: images.filter((image) => !image.excluded && !image.exists).length
            },
            validation: { ok: true, errors: [], warnings: [] }
        };
    };
    const buildContinuousQueueResponse = () => {
        const firstRunAt = '2026-08-31T01:00:00.000Z';
        const intervalMs = continuousAutomationSettings.interval_minutes * 60 * 1000;
        const items = continuousPublishingQueue.map((item, index) => ({
            ...item,
            queue_runtime_state: continuousRunnerStatus.state === 'running'
                && Number(continuousRunnerStatus.rowIndex) === Number(item.rowIndex)
                ? 'running'
                : undefined,
            processing_estimate_at: continuousAutomationSettings.enabled
                ? new Date(new Date(firstRunAt).getTime() + (intervalMs * index)).toISOString()
                : null
        }));
        return {
            items,
            saved_items: continuousSavedTopics,
            total: items.length,
            limit: 50,
            offset: 0,
            automation_schedule: {
                enabled: continuousAutomationSettings.enabled,
                effective_enabled: continuousAutomationSettings.enabled,
                status: continuousAutomationSettings.enabled ? 'scheduled' : 'disabled',
                interval_minutes: continuousAutomationSettings.interval_minutes,
                next_processing_at: continuousAutomationSettings.enabled ? firstRunAt : null,
                basis: 'current_queue_order'
            },
            status_summary: { saved: continuousSavedTopics.length, ready: items.length }
        };
    };
    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const requestRecord = { method: req.method || 'GET', pathname: url.pathname };
        requests.push(requestRecord);

        if (url.pathname === '/api/v1/site-hosting/projects' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ success: true, data: siteHostingProjects }));
            return;
        }
        if (url.pathname === '/api/v1/site-hosting/projects' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const timestamp = '2026-10-02T00:00:00.000Z';
                const project = {
                    id: 'site-project-smoke', name: requestRecord.body.name, root_domain: '',
                    root_path: '/fixture/workspace/site-hosting/projects/site-project-smoke',
                    created_at: timestamp, updated_at: timestamp, site_count: 0
                };
                siteHostingProjects.push(project);
                siteHostingSites.set(project.id, []);
                res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: project }));
            });
            return;
        }
        if (url.pathname === '/api/v1/site-hosting/templates' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ success: true, data: [{
                id: 'minimal-homepage', version: '1.3.0', name: '간단한 홈페이지', description: 'Astro 사이트 시작 템플릿',
                customization: [{ key: 'navigation', type: 'navigation', label: '메뉴', default: [{ label: '홈', href: '/' }, { label: '블로그', href: '/blog/' }] }],
                pages: { max_items: 5 }, publishing: { routes: { listing: '/blog/' } }
            }] }));
            return;
        }
        const siteHostingPreviewDraftsMatch = url.pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/preview-drafts(?:\/([^/]+))?$/);
        if (url.pathname === '/preview-fixture/' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end('<!doctype html><title>Garden preview fixture</title><main>Preview fixture</main>');
            return;
        }
        if (siteHostingPreviewDraftsMatch && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: {
                    id: 'site-preview-smoke', url: `http://127.0.0.1:${server.address().port}/preview-fixture/`,
                    knowledge_collection: {
                        source_markdown_count: 4, published_note_count: 2, excluded_note_count: 2,
                        copied_resource_count: 1, unresolved_link_count: 3, missing_resource_count: 1,
                        selection_configured: true
                    }
                } }));
            });
            return;
        }
        if (siteHostingPreviewDraftsMatch && siteHostingPreviewDraftsMatch[2] && req.method === 'DELETE') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ success: true, data: { removed: true } }));
            return;
        }
        const siteHostingSitesMatch = url.pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites$/);
        const siteHostingSettingsMatch = url.pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)$/);
        const siteHostingDisconnectMatch = url.pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/custom-domain-disconnect$/);
        const siteHostingWorkerDisconnectMatch = url.pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/worker-disconnect$/);
        const siteHostingDeletePlanMatch = url.pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/delete-plan$/);
        const siteHostingDeleteMatch = url.pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/delete$/);
        if (siteHostingDeletePlanMatch && req.method === 'POST') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ success: true, data: { id: 'site-delete-plan-smoke', ready: true, site_name: '설정 변경 사이트', steps: [{ kind: 'archive', label: '사이트 파일을 site-hosting/archive에 보관' }] } }));
            return;
        }
        if (siteHostingDeleteMatch && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const projectId = decodeURIComponent(siteHostingDeleteMatch[1]);
                const siteId = decodeURIComponent(siteHostingDeleteMatch[2]);
                const sites = siteHostingSites.get(projectId) || [];
                const siteIndex = sites.findIndex((item) => item.id === siteId);
                if (siteIndex >= 0) sites.splice(siteIndex, 1);
                res.writeHead(siteIndex >= 0 ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(siteIndex >= 0
                    ? { success: true, data: { archived: true, completed: true, archived_path: '/fixture/workspace/site-hosting/archive/site-smoke-1-20261006T000000Z' } }
                    : { success: false, error: { message: '사이트를 찾을 수 없습니다.' } }));
            });
            return;
        }
        if (siteHostingDisconnectMatch && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const projectId = decodeURIComponent(siteHostingDisconnectMatch[1]);
                const siteId = decodeURIComponent(siteHostingDisconnectMatch[2]);
                const site = (siteHostingSites.get(projectId) || []).find((item) => item.id === siteId);
                if (site) {
                    site.custom_domain_binding = null;
                    site.deployment = { worker_name: 'bg-site-smoke-1', url: 'https://bg-site-smoke-1.example.workers.dev/', worker_account_id: 'a'.repeat(32), worker_created_on: '2026-10-02T00:00:00Z', managed_by_app: true };
                }
                res.writeHead(site ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(site
                    ? { success: true, data: { hostname: 'blog.example.com', custom_domain_binding: null, disconnected: true } }
                    : { success: false, error: { message: '사이트를 찾을 수 없습니다.' } }));
            });
            return;
        }
        if (siteHostingWorkerDisconnectMatch && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const projectId = decodeURIComponent(siteHostingWorkerDisconnectMatch[1]);
                const siteId = decodeURIComponent(siteHostingWorkerDisconnectMatch[2]);
                const site = (siteHostingSites.get(projectId) || []).find((item) => item.id === siteId);
                if (site && !site.custom_domain_binding?.hostname) site.deployment = null;
                res.writeHead(site && !site.custom_domain_binding?.hostname ? 200 : 409, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(site && !site.custom_domain_binding?.hostname
                    ? { success: true, data: { worker_name: 'bg-site-smoke-1', disconnected: true } }
                    : { success: false, error: { message: '먼저 연결 도메인을 해지해 주세요.' } }));
            });
            return;
        }
        if (siteHostingSettingsMatch && ['GET', 'PUT'].includes(req.method)) {
            const projectId = decodeURIComponent(siteHostingSettingsMatch[1]);
            const siteId = decodeURIComponent(siteHostingSettingsMatch[2]);
            const key = `${projectId}:${siteId}`;
            if (req.method === 'GET') {
                const settings = siteHostingSettings.get(key);
                res.writeHead(settings ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify(settings ? { success: true, data: settings } : { success: false, error: { message: '사이트를 찾을 수 없습니다.' } }));
                return;
            }
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const settings = siteHostingSettings.get(key);
                if (!settings) {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, error: { message: '사이트를 찾을 수 없습니다.' } }));
                    return;
                }
                Object.assign(settings, requestRecord.body);
                const site = (siteHostingSites.get(projectId) || []).find((item) => item.id === siteId);
                if (site) site.name = settings.name;
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: {
                    id: siteId, project_id: projectId, name: settings.name,
                    screenshot: { build_id: 'settings-build-smoke' }, screenshot_error: '', build_error: ''
                } }));
            });
            return;
        }
        if (siteHostingSitesMatch && req.method === 'GET') {
            const projectId = decodeURIComponent(siteHostingSitesMatch[1]);
            const sites = siteHostingSites.get(projectId);
            res.writeHead(sites ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(sites ? { success: true, data: sites } : { success: false, error: { message: '프로젝트를 찾을 수 없습니다.' } }));
            return;
        }
        if (siteHostingSitesMatch && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const projectId = decodeURIComponent(siteHostingSitesMatch[1]);
                const sites = siteHostingSites.get(projectId);
                const project = siteHostingProjects.find((item) => item.id === projectId);
                if (!sites || !project) {
                    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(JSON.stringify({ success: false, error: { message: '프로젝트를 찾을 수 없습니다.' } }));
                    return;
                }
                const timestamp = '2026-10-02T00:00:00.000Z';
                const site = {
                    id: `site-smoke-${sites.length + 1}`, project_id: projectId, name: requestRecord.body.name,
                    template: { id: requestRecord.body.template_id, version: '0.1.0' },
                    template_name: '간단한 홈페이지', template_status: 'available', hostname: '',
                    created_at: timestamp, updated_at: timestamp
                };
                sites.push(site);
                siteHostingSettings.set(`${projectId}:${site.id}`, {
                    id: site.id, name: site.name, template_id: requestRecord.body.template_id,
                    customization: requestRecord.body.customization || {}, setup_inputs: requestRecord.body.setup_inputs || {}
                });
                project.site_count = sites.length;
                res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: site }));
            });
            return;
        }
        const siteProjectMatch = url.pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)$/);
        if (siteProjectMatch && req.method === 'GET') {
            const project = siteHostingProjects.find((item) => item.id === decodeURIComponent(siteProjectMatch[1]));
            res.writeHead(project ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify(project
                ? { success: true, data: project }
                : { success: false, error: { message: '프로젝트를 찾을 수 없습니다.' } }));
            return;
        }

        if (url.pathname === '/api/v1/continuous-publishing/automation/settings') {
            const respond = () => {
                const body = JSON.stringify({
                    success: true,
                    data: {
                        settings: continuousAutomationSettings,
                        source: continuousAutomationSettings.updated_at ? 'saved' : 'default',
                        warnings: [],
                        runtime: {
                            environment: 'development',
                            environment_allows_automation: true,
                            automation_mode: 'development_draft',
                            effective_enabled: continuousAutomationSettings.enabled,
                            status: continuousAutomationSettings.enabled ? 'scheduled' : 'disabled',
                            next_run_at_preview: continuousAutomationSettings.enabled ? '2026-08-31T01:00:00.000Z' : null,
                            scheduler: { state: continuousAutomationSettings.enabled ? 'scheduled' : 'stopped', test_scheduled: false }
                        }
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            };
            if (req.method === 'GET') return respond();
            if (req.method === 'POST') {
                const chunks = [];
                req.on('data', (chunk) => chunks.push(chunk));
                req.on('end', () => {
                    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                    requestRecord.body = payload;
                    continuousAutomationSettings = { ...continuousAutomationSettings, ...payload, updated_at: '2026-08-30T12:00:00.000Z' };
                    respond();
                });
                return;
            }
        }

        if (url.pathname === '/api/v1/keywords/analyze' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const keyword = Array.isArray(payload.keywords) && payload.keywords[0] ? payload.keywords[0] : payload.subject;
                const body = JSON.stringify({
                    success: true,
                    data: {
                        input_keywords: [{
                            keyword,
                            is_input_keyword: true,
                            monthly_search_volume: { total: 1200, mobile: 900, pc: 300 },
                            estimated_weekly_search_volume: 280,
                            weekly_new_blog_documents: { count: 20, capped: false },
                            competition_strength: { level: '낮음' },
                            opportunity: { estimated_weekly_searches_per_new_document: 14 }
                        }],
                        related_candidates: []
                    }
                });
                setTimeout(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(body);
                }, 80);
            });
            return;
        }

        if (url.pathname === '/api/v1/keywords/suggest-titles' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const body = JSON.stringify({
                    success: true,
                    data: {
                        titles: [{ title: '제주 아침 산책에서 뜻밖에 마주친 것', role: '클릭 유도형' }],
                        smart_usage_session_id: payload.smart_usage_session_id || '',
                        smart_usage: { capability: 'title_recommendation', limit: 20, used: 1, remaining: 19 }
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname === '/api/v1/trend-posting/topics' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const body = JSON.stringify({
                    success: true,
                    data: { ...payload, source: 'naver_trend', status: '대기', rowNumber: 2, rowIndex: 0 }
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname === '/api/v1/continuous-publishing/topics' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const queued = payload.action === 'enqueue';
                const rowIndex = continuousTopicSequence++;
                const item = {
                    rowIndex,
                    rowNumber: rowIndex + 2,
                    status: queued ? '발행 준비 완료' : '대기',
                    subject: payload.subject,
                    title: payload.title,
                    keywordsRaw: payload.keywords,
                    postStatus: payload.postStatus,
                    writing_strategy: payload.writingStrategy,
                    image_mode: payload.imageMode,
                    external_reference: payload.externalReference,
                    content_guide: { additional_instructions: payload.instruction, reference_urls: payload.referenceUrl ? [payload.referenceUrl] : [] },
                    options: {
                        platforms: payload.platforms,
                        naver_category: payload.naverCategory,
                        wordpress_category: payload.wordpressCategory
                    }
                };
                (queued ? continuousPublishingQueue : continuousSavedTopics).push(item);
                const body = JSON.stringify({
                    success: true,
                    data: { action: payload.action, status: item.status, rowNumber: item.rowNumber, rowIndex }
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname === '/api/v1/continuous-publishing/topics/update' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const source = payload.sourceStatus === '대기' ? continuousSavedTopics : continuousPublishingQueue;
                const itemIndex = source.findIndex(candidate => candidate.rowIndex === payload.rowIndex);
                const item = source[itemIndex];
                if (item) {
                    item.subject = payload.subject;
                    item.title = payload.title;
                    item.keywordsRaw = payload.keywords;
                    item.postStatus = payload.postStatus;
                    item.writing_strategy = payload.writingStrategy;
                    item.image_mode = payload.imageMode;
                    item.external_reference = payload.externalReference;
                    item.options = {
                        ...item.options,
                        platforms: payload.platforms,
                        naver_category: payload.naverCategory,
                        wordpress_category: payload.wordpressCategory
                    };
                    if (payload.action === 'enqueue' && source === continuousSavedTopics) {
                        source.splice(itemIndex, 1);
                        item.status = '발행 준비 완료';
                        continuousPublishingQueue.push(item);
                    }
                }
                const body = JSON.stringify({
                    success: true,
                    data: { rowIndex: payload.rowIndex, status: payload.action === 'enqueue' ? '발행 준비 완료' : '대기' }
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname === '/api/v1/continuous-publishing/topics/delete' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const itemIndex = continuousSavedTopics.findIndex(candidate => candidate.rowIndex === payload.rowIndex);
                if (itemIndex >= 0) continuousSavedTopics.splice(itemIndex, 1);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: { rowIndex: payload.rowIndex, deleted: true } }));
            });
            return;
        }

        if (url.pathname === '/api/v1/continuous-publishing/queue/remove' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const itemIndex = continuousPublishingQueue.findIndex(candidate => candidate.rowIndex === payload.rowIndex);
                if (itemIndex >= 0) {
                    const [item] = continuousPublishingQueue.splice(itemIndex, 1);
                    item.status = '대기';
                    continuousSavedTopics.push(item);
                }
                const body = JSON.stringify({ success: true, data: { rowIndex: payload.rowIndex, status: '대기' } });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname === '/api/v1/continuous-publishing/queue/reorder' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const sourceIndex = continuousPublishingQueue.findIndex(candidate => candidate.rowIndex === payload.rowIndex);
                const targetIndex = payload.direction === 'up' ? sourceIndex - 1 : sourceIndex + 1;
                if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= continuousPublishingQueue.length) {
                    res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(JSON.stringify({ success: false, error: { message: '대기열 경계를 벗어났습니다.' } }));
                    return;
                }
                [continuousPublishingQueue[sourceIndex], continuousPublishingQueue[targetIndex]] = [
                    continuousPublishingQueue[targetIndex],
                    continuousPublishingQueue[sourceIndex]
                ];
                const body = JSON.stringify({
                    success: true,
                    data: {
                        ...buildContinuousQueueResponse()
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname === '/api/v1/continuous-publishing/runner/start' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const requestedRowIndex = Number(payload.rowIndex);
                const item = Number.isInteger(requestedRowIndex)
                    ? continuousPublishingQueue.find(candidate => candidate.rowIndex === requestedRowIndex) || null
                    : continuousPublishingQueue[0] || null;
                continuousRunnerStatus = item
                    ? {
                        state: 'running', message: '글감을 생성하고 발행하고 있습니다.',
                        rowIndex: item.rowIndex, rowNumber: item.rowNumber, subject: item.subject,
                        resultStatus: '', progressStage: 'writing', completionLinks: [], busy: true
                    }
                    : {
                        state: 'empty', message: '발행 준비된 글감이 없습니다.',
                        rowIndex: null, rowNumber: null, subject: '', resultStatus: '',
                        progressStage: '', completionLinks: [], busy: false
                    };
                continuousRunnerPollsRemaining = item ? 4 : 0;
                const body = JSON.stringify({ success: true, data: { accepted: true, ...continuousRunnerStatus } });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname === '/api/v1/blog/manuscript-drafts/folder' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                manuscriptDraftRevision = 1;
                manuscriptContentVersion += 1;
                manuscriptDraftPostStatus = requestRecord.body.postStatus || 'publish';
                manuscriptDraftSourceKind = 'folder';
                manuscriptDraftTitle = '폴더 원고';
                manuscriptDraftImages = [
                    { index: 0, slotId: 'image-0', title: '첫 이미지', prompt: '푸른 하늘', exists: true, excluded: false, assetOrigin: 'folder', canRestore: false },
                    { index: 1, slotId: 'image-1', title: '둘째 이미지', prompt: '초록 숲', exists: false, excluded: false, assetOrigin: '', canRestore: false }
                ];
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: buildManuscriptDraftFixture() }));
            });
            return;
        }

        if (url.pathname === '/api/v1/blog/manuscript-drafts/ai/operations/current' && req.method === 'GET') {
            const current = [...aiGenerationOperations.values()].find((item) => item.busy) || null;
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ success: true, data: current }));
            return;
        }

        const aiOperationMatch = url.pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/ai\/operations\/([^/]+)(\/cancel)?$/);
        if (aiOperationMatch) {
            const operation = aiGenerationOperations.get(aiOperationMatch[1]);
            if (!operation) {
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: '작업 없음' } }));
                return;
            }
            if (aiOperationMatch[2] && req.method === 'POST') {
                operation.state = 'cancel_requested';
                operation.canCancel = false;
                operation.polls = 0;
            } else if (req.method === 'GET') {
                operation.polls += 1;
                if (operation.slow && operation.state === 'running') operation.stage = 'images';
                if (operation.state === 'cancel_requested' && operation.polls >= 2) {
                    operation.state = 'canceled';
                    operation.busy = false;
                    operation.finishedAt = new Date().toISOString();
                } else if (operation.state === 'running' && !operation.slow && operation.polls >= 2) {
                    const payload = operation.payload;
                manuscriptDraftRevision = 1;
                manuscriptDraftPostStatus = payload.postStatus || 'publish';
                manuscriptDraftTarget = payload.targets?.[0] || 'naver';
                manuscriptContentVersion = 1;
                manuscriptPublishedHistory = [];
                    manuscriptDraftSourceKind = 'ai';
                    manuscriptDraftTitle = String(payload.title || payload.subject || 'AI 원고');
                    manuscriptDraftImages = payload.imageMode === 'none' ? [] : [
                        { index: 0, slotId: 'image-0', title: '첫 이미지', prompt: '푸른 하늘', exists: true, excluded: false, assetOrigin: 'generated', canRestore: false },
                        { index: 1, slotId: 'image-1', title: '둘째 이미지', prompt: '초록 숲', exists: false, excluded: false, assetOrigin: '', canRestore: false }
                    ];
                    operation.state = 'completed';
                    operation.busy = false;
                    operation.canCancel = false;
                    operation.result = buildManuscriptDraftFixture();
                    operation.finishedAt = new Date().toISOString();
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ success: true, data: { ...operation, payload: undefined, slow: undefined, polls: undefined } }));
            return;
        }

        if (url.pathname === '/api/v1/blog/manuscript-drafts/ai/operations' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const operation = {
                    operationId: `fixture-ai-${++aiGenerationSequence}`, state: 'running', stage: 'writing',
                    busy: true, canCancel: true, subject: requestRecord.body.subject || 'AI 원고',
                    remoteJobPossible: requestRecord.body.imageMode === 'generate',
                    payload: requestRecord.body, slow: aiGenerationSequence === 3,
                    polls: 0, finishedAt: ''
                };
                aiGenerationOperations.set(operation.operationId, operation);
                res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: { ...operation, payload: undefined, slow: undefined, polls: undefined } }));
            });
            return;
        }

        if (url.pathname === '/api/v1/blog/manuscript-drafts/image-operations' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const input = requestRecord.body;
                const pasteDraft = input.draftId === PASTE_MANUSCRIPT_DRAFT_ID;
                const images = pasteDraft ? pasteManuscriptDraftImages : manuscriptDraftImages;
                const targets = input.action === 'generate-missing'
                    ? images.filter((image) => !image.exists && !image.excluded && image.prompt)
                    : images.filter((image) => image.slotId === input.slotId);
                const sequence = ++manuscriptImageOperationSequence;
                const slow = sequence === 1 || (pasteDraft && input.action === 'generate');
                const completeOperation = () => {
                    targets.forEach((image) => {
                        image.exists = true;
                        image.excluded = false;
                        image.assetOrigin = 'generated';
                        image.canRestore = image.index === 0;
                    });
                    if (pasteDraft) pasteManuscriptDraftRevision += Math.max(1, targets.length);
                    else {
                        manuscriptDraftRevision += Math.max(1, targets.length);
                        manuscriptContentVersion += Math.max(1, targets.length);
                    }
                    return pasteDraft ? buildPasteManuscriptDraftFixture() : buildManuscriptDraftFixture();
                };
                const operation = {
                    operationId: `fixture-image-${sequence}`,
                    source: 'manuscript_image_generation', state: slow ? 'running' : 'completed', busy: slow,
                    canCancel: slow, remoteJobPossible: true, slow, polls: 0, input,
                    progress: { current: 1, total: targets.length, slotId: targets[0]?.slotId || '', phase: 'generating' }
                };
                if (!slow) {
                    operation.result = completeOperation();
                    operation.progress = { current: targets.length, total: targets.length, slotId: targets.at(-1)?.slotId || '', phase: 'completed' };
                }
                operation.complete = completeOperation;
                manuscriptImageOperations.set(operation.operationId, operation);
                res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                const { complete: _complete, input: _input, polls: _polls, slow: _slow, ...snapshot } = operation;
                res.end(JSON.stringify({ success: true, data: snapshot }));
            });
            return;
        }

        const imageOperationMatch = url.pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/image-operations\/([^/]+)(\/cancel)?$/);
        if (imageOperationMatch && req.method === (imageOperationMatch[2] ? 'POST' : 'GET')) {
            const operation = manuscriptImageOperations.get(decodeURIComponent(imageOperationMatch[1]));
            if (operation && imageOperationMatch[2]) {
                operation.state = 'canceled';
                operation.busy = false;
                operation.result = undefined;
            } else if (operation?.state === 'running') {
                operation.polls += 1;
                if (operation.slow && operation.polls >= 30) {
                    operation.state = 'completed';
                    operation.busy = false;
                    operation.canCancel = false;
                    operation.result = operation.complete();
                    operation.progress = { current: 1, total: 1, slotId: operation.progress.slotId, phase: 'completed' };
                }
            }
            res.writeHead(operation ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            if (operation) {
                const { complete: _complete, input: _input, polls: _polls, slow: _slow, ...snapshot } = operation;
                res.end(JSON.stringify({ success: true, data: snapshot }));
            } else res.end(JSON.stringify({ success: false, message: 'operation missing' }));
            return;
        }

        const manuscriptDraftMatch = url.pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)$/);
        if (manuscriptDraftMatch && req.method === 'GET') {
            const draft = decodeURIComponent(manuscriptDraftMatch[1]) === PASTE_MANUSCRIPT_DRAFT_ID
                ? buildPasteManuscriptDraftFixture() : buildManuscriptDraftFixture();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ success: true, data: draft }));
            return;
        }

        if (url.pathname === '/api/v1/blog/manuscript-drafts/paste' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                pasteManuscriptDraftRevision = 1;
                pasteManuscriptDraftPostStatus = requestRecord.body.postStatus || 'publish';
                pasteManuscriptMarkdown = String(requestRecord.body.markdownText || '');
                if (!pasteManuscriptMarkdown.includes('## 함께 보면 좋은 글')) {
                    pasteManuscriptMarkdown = `${pasteManuscriptMarkdown.trimEnd()}\n\n## 함께 보면 좋은 글\n\n- [추천 글](https://example.com/related)\n`;
                }
                pasteManuscriptDraftImages = pasteManuscriptDraftImages.map((image) => ({ ...image, exists: false, excluded: false, assetOrigin: '', canRestore: false }));
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: buildPasteManuscriptDraftFixture() }));
            });
            return;
        }

        const manuscriptImageMatch = url.pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)\/images\/(image-[0-9]+)$/);
        if (manuscriptImageMatch && req.method === 'GET') {
            const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Length': png.length });
            res.end(png);
            return;
        }

        const manuscriptSlotMatch = url.pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)\/image-slots\/(image-[0-9]+)\/(import|generate|exclude|restore|remove)$/);
        if (manuscriptSlotMatch && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const pasteDraft = manuscriptSlotMatch[1] === PASTE_MANUSCRIPT_DRAFT_ID;
                const images = pasteDraft ? pasteManuscriptDraftImages : manuscriptDraftImages;
                const slot = images.find((image) => image.slotId === manuscriptSlotMatch[2]);
                const action = manuscriptSlotMatch[3];
                if (action === 'exclude') {
                    slot.exists = false;
                    slot.excluded = true;
                    slot.assetOrigin = '';
                    slot.canRestore = true;
                    slot.restoreLabel = '다시 포함';
                } else if (action === 'restore') {
                    slot.exists = true;
                    slot.excluded = false;
                    slot.assetOrigin = pasteDraft ? 'user' : 'folder';
                    slot.canRestore = false;
                } else if (action === 'remove') {
                    slot.exists = false;
                    slot.excluded = false;
                    slot.assetOrigin = '';
                    slot.canRestore = false;
                } else {
                    slot.exists = true;
                    slot.excluded = false;
                    slot.assetOrigin = action === 'import' ? 'user' : 'generated';
                    slot.canRestore = slot.index === 0;
                }
                if (pasteDraft) pasteManuscriptDraftRevision += 1;
                else {
                    manuscriptDraftRevision += 1;
                    manuscriptContentVersion += 1;
                }
                requestRecord.responseRevision = pasteDraft ? pasteManuscriptDraftRevision : manuscriptDraftRevision;
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: pasteDraft ? buildPasteManuscriptDraftFixture() : buildManuscriptDraftFixture() }));
            });
            return;
        }

        if (url.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/settings` && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                manuscriptDraftPostStatus = requestRecord.body.postStatus || manuscriptDraftPostStatus;
                manuscriptDraftTarget = requestRecord.body.targets?.[0] || manuscriptDraftTarget;
                manuscriptDraftRevision += 1;
                requestRecord.responseRevision = manuscriptDraftRevision;
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: buildManuscriptDraftFixture() }));
            });
            return;
        }

        if (url.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/markdown` && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const markdownText = String(requestRecord.body.markdownText || '');
                if (manuscriptDraftSourceKind === 'ai') {
                    if (markdownText !== buildManuscriptDraftFixture().rawMarkdown) manuscriptContentVersion += 1;
                    const heading = markdownText.match(/^#\s+(.+)$/m);
                    if (heading) manuscriptDraftTitle = heading[1].trim();
                    for (const match of markdownText.matchAll(/^\[\[IMAGE_(\d+)\s*\ntitle:\s*(.*)\n(?:prompt:\s*(.*)\n)?\]\]/gm)) {
                        const image = manuscriptDraftImages.find((item) => Number(item.index) === Number(match[1]));
                        if (image) {
                            image.title = match[2].trim();
                            image.prompt = (match[3] || '').trim();
                        }
                    }
                }
                manuscriptDraftPostStatus = requestRecord.body.postStatus || manuscriptDraftPostStatus;
                manuscriptDraftTarget = requestRecord.body.targets?.[0] || manuscriptDraftTarget;
                manuscriptDraftRevision += 1;
                requestRecord.responseRevision = manuscriptDraftRevision;
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: buildManuscriptDraftFixture() }));
            });
            return;
        }

        if (url.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/markdown` && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                pasteManuscriptMarkdown = String(requestRecord.body.markdownText || pasteManuscriptMarkdown);
                const imageIndexes = new Set(Array.from(pasteManuscriptMarkdown.matchAll(/^\[\[IMAGE_(\d+)/gm), (match) => Number(match[1])));
                pasteManuscriptDraftImages = pasteManuscriptDraftImages.filter((image) => imageIndexes.has(Number(image.index)));
                pasteManuscriptDraftPostStatus = requestRecord.body.postStatus || pasteManuscriptDraftPostStatus;
                pasteManuscriptDraftRevision += 1;
                requestRecord.responseRevision = pasteManuscriptDraftRevision;
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: buildPasteManuscriptDraftFixture() }));
            });
            return;
        }

        if (url.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish` && req.method === 'POST') {
            localMarkdownPublishing = true;
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const automaticTargets = [];
                const unresolvedImageCount = manuscriptDraftImages.filter((image) => !image.excluded && !image.exists && image.prompt).length;
                const forcedDraft = unresolvedImageCount > 0 && manuscriptDraftPostStatus !== 'draft';
                const effectivePostStatus = forcedDraft ? 'draft' : manuscriptDraftPostStatus;
                manuscriptPublishedHistory.push({ contentVersion: manuscriptContentVersion, target: manuscriptDraftTarget });
                const manuscriptPreview = buildManuscriptDraftFixture();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                setTimeout(() => {
                    localMarkdownPublishing = false;
                    res.end(JSON.stringify({ success: true, data: {
                        status: effectivePostStatus === 'draft' ? '임시 저장 완료' : '발행 완료',
                        postStatus: effectivePostStatus,
                        completionLinks: [],
                        revision: manuscriptDraftRevision,
                        publishPolicy: {
                            requestedPostStatus: manuscriptDraftPostStatus,
                            effectivePostStatus,
                            unresolvedImageCount,
                            autoGenerationTargetCount: automaticTargets.length,
                            autoGeneratedCount: automaticTargets.length,
                            autoGenerationFailedCount: 0,
                            forcedDraft: false
                        },
                        manuscriptPreview
                    } }));
                }, 100);
            });
            return;
        }

        if (url.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish` && req.method === 'POST') {
            localMarkdownPublishing = true;
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const unresolvedImageCount = pasteManuscriptDraftImages.filter((image) => !image.excluded && !image.exists).length;
                const forcedDraft = unresolvedImageCount > 0 && pasteManuscriptDraftPostStatus !== 'draft';
                const effectivePostStatus = forcedDraft ? 'draft' : pasteManuscriptDraftPostStatus;
                const manuscriptPreview = buildPasteManuscriptDraftFixture();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                setTimeout(() => {
                    localMarkdownPublishing = false;
                    res.end(JSON.stringify({ success: true, data: {
                        status: effectivePostStatus === 'draft' ? '임시 저장 완료' : '발행 완료',
                        postStatus: effectivePostStatus,
                        completionLinks: [],
                        revision: pasteManuscriptDraftRevision,
                        publishPolicy: {
                            requestedPostStatus: pasteManuscriptDraftPostStatus,
                            effectivePostStatus,
                            unresolvedImageCount,
                            autoGenerationTargetCount: 0,
                            autoGeneratedCount: 0,
                            autoGenerationFailedCount: 0,
                            forcedDraft
                        },
                        manuscriptPreview
                    } }));
                }, 100);
            });
            return;
        }

        if (url.pathname === '/api/v1/blog/local-markdown/preview' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const markdown = String(payload.markdownText || payload.selectedFiles?.find(item => /\.md$/i.test(item.name || ''))?.textContent || '');
                const title = markdown.match(/^#\s+(.+)$/m)?.[1] || '제목 없음';
                const body = JSON.stringify({
                    success: true,
                    data: {
                        source: { type: payload.markdownText !== undefined ? 'pasted_markdown' : 'local_markdown', folderName: payload.folderName || '붙여넣기' },
                        title,
                        rawMarkdown: markdown,
                        bodyPreview: markdown,
                        contentItems: [
                            { type: 'header-h2', text: '미리보기 소제목' },
                            { type: 'paragraph', text: 'Markdown 본문입니다.', boldRanges: [{ start: 0, end: 8 }] },
                            { type: 'image', index: 0, text: '미리보기 이미지', prompt: '따뜻한 분위기의 이미지' }
                        ],
                        images: [{ index: 0, title: '미리보기 이미지', prompt: '따뜻한 분위기의 이미지', exists: false, imagePath: '', fileName: '' }],
                        stats: { contentCount: 3, imageBlockCount: 1, imageResolvedCount: 0 },
                        validation: { ok: true, errors: [], warnings: [] }
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname === '/api/v1/blog/local-markdown/publish' && req.method === 'POST') {
            localMarkdownPublishing = true;
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const body = JSON.stringify({
                    success: true,
                    data: {
                        status: payload.postStatus === 'draft' ? '임시 저장 완료' : '발행 완료',
                        postStatus: payload.postStatus || 'publish',
                        completionLinks: payload.postStatus === 'draft'
                            ? [{ platform: 'naver', kind: 'home', label: '네이버 블로그 열기', url: 'https://blog.naver.com/fixture' }]
                            : [{ platform: 'naver', kind: 'post', label: '네이버 글 보기', url: 'https://blog.naver.com/fixture/123' }]
                    }
                });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                setTimeout(() => {
                    localMarkdownPublishing = false;
                    res.end(body);
                }, 350);
            });
            return;
        }

        if (url.pathname === '/api/v1/system/ui-event' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ success: true, data: { logged: true } }));
            });
            return;
        }

        if (url.pathname === '/api/v1/settings/writing-profile' && req.method === 'PUT') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const { based_on_default_version: _version, ...profile } = payload.custom_profile || {};
                const body = JSON.stringify({ success: true, data: createWritingProfileFixture(profile) });
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
            });
            return;
        }

        if (url.pathname.startsWith('/api/v1/')) {
            let data = getApiFixture(url.pathname);
            if (url.pathname === '/api/v1/continuous-publishing/queue') {
                data = buildContinuousQueueResponse();
            }
            if (url.pathname === '/api/v1/continuous-publishing/status-summary') {
                if (localMarkdownPublishing || ['selecting', 'running'].includes(continuousRunnerStatus.state)) {
                    data = {
                        state: 'running',
                        subject: localMarkdownPublishing ? '원고 붙여넣기' : continuousRunnerStatus.subject,
                        message: localMarkdownPublishing
                            ? '원고 포스팅을 처리하고 있습니다.'
                            : continuousRunnerStatus.message,
                        result_status: '',
                        next_processing_at: null
                    };
                } else if (['failed', 'needs_attention', 'blocked'].includes(continuousRunnerStatus.state)) {
                    data = {
                        state: 'attention',
                        subject: continuousRunnerStatus.subject,
                        message: continuousRunnerStatus.message,
                        result_status: continuousRunnerStatus.resultStatus,
                        next_processing_at: null
                    };
                } else if (continuousAutomationSettings.enabled && continuousPublishingQueue.length > 0) {
                    data = {
                        state: 'scheduled',
                        subject: '',
                        message: '',
                        result_status: '',
                        next_processing_at: '2026-08-31T01:00:00.000Z'
                    };
                } else {
                    data = {
                        state: 'idle', subject: '', message: '', result_status: '', next_processing_at: null
                    };
                }
                data = {
                    ...data,
                    last_completion_at: continuousRunnerStatus.state === 'completed'
                        ? continuousRunnerStatus.finishedAt || null
                        : null,
                    last_result_status: continuousRunnerStatus.state === 'completed'
                        ? continuousRunnerStatus.resultStatus || ''
                        : ''
                };
            }
            if (url.pathname === '/api/v1/continuous-publishing/runner/status') {
                if (localMarkdownPublishing) {
                    data = {
                        state: 'running',
                        busy: true,
                        source: 'local_markdown',
                        subject: '원고 붙여넣기',
                        message: '원고 포스팅을 처리하고 있습니다.'
                    };
                } else {
                if (continuousRunnerStatus.state === 'running') {
                    if (continuousRunnerPollsRemaining > 0) continuousRunnerPollsRemaining -= 1;
                    else {
                        const itemIndex = continuousPublishingQueue.findIndex(candidate => candidate.rowIndex === continuousRunnerStatus.rowIndex);
                        const completedItem = itemIndex >= 0 ? continuousPublishingQueue[itemIndex] : null;
                        if (itemIndex >= 0) continuousPublishingQueue.splice(itemIndex, 1);
                        continuousRunnerStatus = {
                            ...continuousRunnerStatus,
                            state: 'completed',
                            message: '다음 글감 한 건을 처리했습니다.',
                            resultStatus: '임시 저장 완료',
                            progressStage: '',
                            completionLinks: (completedItem?.options?.platforms || ['naver']).map((platform) => ({
                                platform,
                                kind: 'home',
                                label: platform === 'wordpress' ? '워드프레스 열기' : '네이버 블로그 열기',
                                url: platform === 'wordpress' ? 'https://example.com/' : 'https://blog.naver.com/fixture'
                            })),
                            finishedAt: new Date().toISOString(),
                            busy: false
                        };
                    }
                }
                data = continuousRunnerStatus;
                }
            }
            if (url.pathname === '/api/v1/blog/topic-recommendations') {
                const sessionId = url.searchParams.get('session_id') || 'anonymous';
                const topicRecommendationCalls = (topicRecommendationCallsBySession.get(sessionId) || 0) + 1;
                topicRecommendationCallsBySession.set(sessionId, topicRecommendationCalls);
                data = {
                    ideas: [{
                        id: `topic-${topicRecommendationCalls}`,
                        title: `추천 글감 ${topicRecommendationCalls}`,
                        keywords: ['테스트'],
                        summary: '추천 흐름 테스트',
                        reason: '테스트 근거'
                    }],
                    smart_usage_session_id: url.searchParams.get('session_id') || '',
                    smart_usage: {
                        capability: 'content_idea',
                        limit: 20,
                        used: 1,
                        remaining: 19,
                        request_limit: 2,
                        requests_remaining: Math.max(0, 2 - topicRecommendationCalls)
                    }
                };
            }
            const body = JSON.stringify({ success: true, data });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(body);
            return;
        }

        const requestedPath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const fullPath = path.resolve(uiRoot, requestedPath);
        const rootPrefix = `${uiRoot}${path.sep}`;
        if (!fullPath.startsWith(rootPrefix) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        res.writeHead(200, { 'Content-Type': getContentType(fullPath), 'Cache-Control': 'no-store' });
        const body = requestedPath === 'index.html'
            ? composedUiShell
            : (requestedPath === 'styles.css'
                ? composedUiStyles
                : (requestedPath === 'app.js' ? composedUiScript : fs.readFileSync(fullPath)));
        res.end(body);
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
    });
}

function resolveBrowserLaunchOptions() {
    const configuredPath = String(process.env.BLOGGENIUS_TEST_BROWSER || '').trim();
    const bundledPath = chromium.executablePath();
    const knownPaths = [
        configuredPath,
        bundledPath,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ].filter(Boolean);
    const executablePath = knownPaths.find((candidate) => fs.existsSync(candidate));
    if (!executablePath) {
        throw new Error('UI smoke test browser not found. Set BLOGGENIUS_TEST_BROWSER or install Playwright Chromium.');
    }
    const headlessSetting = String(process.env.UI_BROWSER_HEADLESS || 'true').trim().toLowerCase();
    const headless = !['false', '0', 'no'].includes(headlessSetting);
    return { executablePath, headless };
}

async function closeServer(server) {
    await new Promise((resolve) => server.close(resolve));
}

async function createUiDemoVideo(browser, baseUrl, outputPath) {
    const outputDirectory = path.dirname(path.resolve(outputPath));
    const recordingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-ui-demo-video-'));
    fs.mkdirSync(outputDirectory, { recursive: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        recordVideo: { dir: recordingDirectory, size: { width: 1440, height: 1000 } }
    });
    const fixtureOrigin = new URL(baseUrl).origin;
    await context.addInitScript(() => {
        localStorage.setItem('bloggenius.ui.style', 'warm-editorial');
        localStorage.removeItem('sidebar-collapsed');
    });
    await context.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin === fixtureOrigin) return route.continue();
        return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        await page.waitForTimeout(900);
        await page.locator('#sidebar-toggle-btn').click();
        await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('collapsed'));
        await page.waitForTimeout(850);
        await page.locator('#sidebar-toggle-btn').click();
        await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('collapsed'));
        await page.waitForTimeout(700);
        await page.locator('.nav-btn[data-view="settings-next"]').click();
        await page.waitForFunction(() => document.getElementById('view-settings-next')?.classList.contains('active'));
        await page.locator('[data-settings-next-tab="app"]').click();
        await page.locator('#settings-next-app-tab-appearance').click();
        await page.waitForFunction(() => document.getElementById('settings-next-app-panel-appearance')?.hidden === false);
        await page.waitForTimeout(700);
        await page.locator('[data-appearance-style="quiet-sage-studio"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.style === 'quiet-sage-studio');
        await page.waitForTimeout(1600);
    } finally {
        const video = page.video();
        await context.close();
        if (video) fs.copyFileSync(await video.path(), path.resolve(outputPath));
        fs.rmSync(recordingDirectory, { recursive: true, force: true });
    }
}

async function createUiOverviewDemoVideo(browser, baseUrl, outputPath) {
    const outputDirectory = path.dirname(path.resolve(outputPath));
    const recordingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-overview-demo-'));
    fs.mkdirSync(outputDirectory, { recursive: true });
    const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        recordVideo: { dir: recordingDirectory, size: { width: 1600, height: 1000 } }
    });
    const fixtureOrigin = new URL(baseUrl).origin;
    await context.addInitScript(() => {
        localStorage.setItem('bloggenius.ui.style', 'warm-editorial');
        localStorage.removeItem('sidebar-collapsed');
    });
    await context.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin === fixtureOrigin) return route.continue();
        return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(30000);
    const wait = (ms = 1100) => page.waitForTimeout(ms);
    let demoArtworkBase64 = '';
    const caption = async (eyebrow, title, detail = '') => {
        await page.evaluate(({ eyebrow, title, detail }) => {
            let box = document.getElementById('bloggenius-demo-caption');
            if (!box) {
                box = document.createElement('div');
                box.id = 'bloggenius-demo-caption';
                box.innerHTML = '<span class="demo-eyebrow"></span><strong></strong><small></small><i></i>';
                Object.assign(box.style, {
                    position: 'fixed', zIndex: '2147483647', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
                    width: 'min(760px, calc(100vw - 64px))', padding: '18px 24px 20px', borderRadius: '18px',
                    color: '#fff8ed', background: 'rgba(28, 24, 22, .94)', border: '1px solid rgba(255,255,255,.17)',
                    boxShadow: '0 16px 55px rgba(0,0,0,.36)', backdropFilter: 'blur(12px)',
                    display: 'grid', gap: '5px', fontFamily: 'inherit', opacity: '0', transition: 'opacity .2s ease'
                });
                const style = document.createElement('style');
                style.textContent = '#bloggenius-demo-caption .demo-eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#e9a66d;font-weight:800}#bloggenius-demo-caption strong{font-size:26px;line-height:1.2}#bloggenius-demo-caption small{font-size:15px;color:#d4c6b2}#bloggenius-demo-caption i{position:absolute;bottom:0;left:24px;right:24px;height:3px;border-radius:3px;background:linear-gradient(90deg,#e28443,#ffd08b)}';
                document.head.appendChild(style);
                document.body.appendChild(box);
            }
            box.querySelector('.demo-eyebrow').textContent = eyebrow;
            box.querySelector('strong').textContent = title;
            box.querySelector('small').textContent = detail;
            box.style.opacity = '1';
        }, { eyebrow, title, detail });
    };
    const go = async (view, tab) => {
        await page.evaluate(({ view, tab }) => navigateTo(view, tab), { view, tab });
        await page.waitForFunction((view) => document.getElementById(`view-${view}`)?.classList.contains('active'), view);
        await wait(500);
    };
    const makeDemoArtwork = async () => page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 960; canvas.height = 720;
        const ctx = canvas.getContext('2d');
        const sky = ctx.createLinearGradient(0, 0, 0, 720);
        sky.addColorStop(0, '#86c8ec'); sky.addColorStop(.62, '#ffe0a0'); sky.addColorStop(1, '#f6a36b');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, 960, 720);
        ctx.fillStyle = 'rgba(255,245,195,.95)'; ctx.beginPath(); ctx.arc(735, 270, 82, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8aa584'; ctx.beginPath(); ctx.moveTo(0, 450); ctx.quadraticCurveTo(185, 290, 355, 438); ctx.quadraticCurveTo(610, 230, 960, 440); ctx.lineTo(960, 720); ctx.lineTo(0, 720); ctx.fill();
        ctx.fillStyle = '#587c68'; ctx.beginPath(); ctx.moveTo(0, 520); ctx.quadraticCurveTo(250, 370, 470, 520); ctx.quadraticCurveTo(710, 370, 960, 510); ctx.lineTo(960, 720); ctx.lineTo(0, 720); ctx.fill();
        ctx.fillStyle = '#e9b666'; ctx.beginPath(); ctx.moveTo(0, 615); ctx.quadraticCurveTo(270, 540, 510, 650); ctx.quadraticCurveTo(690, 710, 960, 600); ctx.lineTo(960, 720); ctx.lineTo(0, 720); ctx.fill();
        for (let i = 0; i < 38; i++) { const x = (i * 173) % 960; const y = 530 + ((i * 79) % 175); ctx.fillStyle = i % 2 ? '#fff1cf' : '#d58f55'; ctx.beginPath(); ctx.arc(x, y, 3 + i % 5, 0, Math.PI * 2); ctx.fill(); }
        return canvas.toDataURL('image/png').split(',')[1];
    });

    try {
        await page.route('**/api/v1/social/manual/config', (route) => route.fulfill({
            status: 200, contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ success: true, data: { configured: true, local_media_available: true, organizations: [], channels: [], image_ai: { available: true, model_name: 'Demo Image Model' } } })
        }));
        await page.route('**/api/v1/social/manual/image', (route) => route.fulfill({
            status: 200, contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ success: true, data: { operationId: 'overview-demo-image', state: 'running', canCancel: true, remoteJobPossible: false } })
        }));
        await page.route('**/api/v1/social/manual/image-operations/overview-demo-image', (route) => route.fulfill({
            status: 200, contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ success: true, data: { operationId: 'overview-demo-image', state: 'completed', canCancel: false, remoteJobPossible: false, result: { file_name: 'demo-sns-image.png', mime_type: 'image/png', base64_data: demoArtworkBase64, model_name: 'Demo Image Model' } } })
        }));
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        demoArtworkBase64 = await makeDemoArtwork();
        await page.locator('.ui-toast-close').evaluateAll((buttons) => buttons.forEach((button) => button.click()));
        await caption('BlogGenius · QUICK TOUR', '아이디어에서 발행까지', '블로그·카드뉴스·SNS를 한 흐름으로');
        await wait(1800);

        await caption('01 · DASHBOARD', '오늘 할 일을 한눈에', '콘텐츠 작업의 시작점');
        await wait(1300);
        await page.locator('#sidebar-toggle-btn').click(); await wait(550);
        await page.locator('#sidebar-toggle-btn').click(); await wait(650);

        await caption('02 · FOCUS', '집중 타이머로 리듬을 만들고', '대시보드에서 바로 실행');
        const dashboardClock = page.locator('#view-dashboard-beta .clock-style-button');
        await dashboardClock.click(); await wait(300);
        await page.locator('#view-dashboard-beta .clock-style-menu').locator('[data-clock-mode="timer"]').click(); await wait(300);
        await page.locator('#view-dashboard-beta .clock-style-menu').locator('[data-timer-action="start-focus"]').click(); await wait(1000);

        await caption('03 · YOUR SPACE', '취향에 맞게 분위기를 바꾸고', '스타일은 화면마다 자연스럽게 이어집니다');
        await go('settings-next');
        await page.locator('[data-settings-next-tab="app"]').click();
        await page.locator('#settings-next-app-tab-appearance').click();
        await page.locator('[data-appearance-style="quiet-sage-studio"]').click(); await wait(450);
        await go('dashboard-beta'); await wait(450);
        await caption('STYLE A · DASHBOARD', '차분한 대시보드', '스타일 A'); await wait(950);
        await go('settings-next'); await page.locator('[data-settings-next-tab="app"]').click(); await page.locator('#settings-next-app-tab-appearance').click();
        await page.locator('[data-appearance-style="autumn-night-library"]').click(); await wait(400);
        await go('blog-next', 'quick');
        await caption('STYLE B · BLOG', '블로그 작업도 다른 분위기로', '스타일 B'); await wait(1050);
        await go('settings-next'); await page.locator('[data-settings-next-tab="app"]').click(); await page.locator('#settings-next-app-tab-appearance').click();
        await page.locator('[data-appearance-style="hanji-dancheong"]').click(); await wait(400);
        await go('card-news');
        await caption('STYLE C · CARD NEWS', '카드뉴스까지 한결같이', '스타일 C'); await wait(1200);

        await caption('04 · DISCOVER', '지금 주목받는 주제를 찾고', '트렌드 탐색으로 다음 글감을 발견');
        await go('blog-next', 'trend-posting');
        await page.locator('[data-blog-next-tab="trend-posting"]').click(); await wait(700);
        await page.evaluate(() => {
            const categories = ['여행', '맛집', '라이프'];
            const latestTrendDate = '2026-09-29';
            blogNextTrendState.meta = { categories, dateRange: { min: '2026-09-23', max: latestTrendDate } };
            blogNextTrendState.queryRange = { dateFrom: '2026-09-23', dateTo: latestTrendDate };
            renderBlogNextTrendCategories(categories, ['여행']);
            renderBlogNextTrendResults([
                { id: 'demo-trend-jeju', keyword: '제주 가을 여행', latestTrendDate, categories: ['여행'], change: { type: 'up', amount: 38, raw: '38↑' } },
                { id: 'demo-trend-walk', keyword: '가을 산책 코스', latestTrendDate, categories: ['여행'], change: { type: 'up', amount: 21, raw: '21↑' } },
                { id: 'demo-trend-cafe', keyword: '제주 감성 카페', latestTrendDate, categories: ['여행', '맛집'], change: { type: 'new', raw: '신규' } }
            ]);
            const period = document.getElementById('blog-next-trend-period');
            const latestOption = period?.querySelector('option[value="latest"]');
            if (period) period.value = 'latest';
            if (latestOption) latestOption.textContent = '최신 데이터 (9월 29일)';
            ['from', 'to'].forEach((side) => {
                const input = document.getElementById(`blog-next-trend-date-${side}`);
                if (input) input.value = side === 'from' ? '2026-09-23' : latestTrendDate;
            });
            const badge = document.getElementById('blog-next-trend-latest-badge');
            if (badge) { badge.dataset.state = 'ready'; badge.textContent = '최신 데이터 9월 29일'; }
        });
        await wait(1700);

        await caption('05 · IDEAS', 'AI가 글감을 제안하고', '관심 주제에서 시작하는 글쓰기');
        await page.locator('[data-blog-next-tab="quick"]').click(); await wait(400);
        await page.locator('#blog-next-topic-recommend').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        await wait(1400);
        await page.keyboard.press('Escape'); await wait(250);

        await caption('06 · KEYWORDS', '키워드를 살펴 제목을 고르고', '검색 수요와 경쟁도를 함께 확인');
        await page.locator('#blog-next-subject').fill('제주 봄 여행의 작은 발견');
        await page.locator('#blog-next-keyword-recommend').click(); await wait(1400);
        await page.keyboard.press('Escape'); await wait(350);

        await caption('07 · WRITE', '원고는 블록으로 다듬고', '이미지 블록도 글 안에서 함께 준비');
        await page.evaluate(() => {
            const root = document.getElementById('blog-next-ai-editor');
            const workspace = document.querySelector('[data-ai-editor-workspace]');
            const rail = document.querySelector('[data-ai-editor-rail]');
            const markdown = document.getElementById('blog-next-ai-markdown');
            const text = '# 제주 봄 여행의 작은 발견\n\n벚꽃길을 따라 걷다 보면 익숙한 풍경도 새롭게 보입니다.\n\n[[IMAGE_0\ntitle: 햇살 아래 봄 산책\nprompt: 벚꽃길을 걷는 장면, 따뜻한 봄 햇살의 수채화풍\n]]\n\n천천히 걷고 오래 기억할 하루를 만나보세요.';
            blogNextDraftState.ai.editor?.setMarkdown(text);
            if (markdown) markdown.value = text;
            if (workspace) workspace.hidden = false;
            if (rail) rail.hidden = false;
            if (root) root.hidden = false;
            document.querySelector('[data-blog-next-ai-step="preview"]')?.removeAttribute('hidden');
        });
        await wait(1700);
        await page.evaluate(() => document.querySelector('[aria-label="이미지 생성 프롬프트 편집"]')?.scrollIntoView({ block: 'center' }));
        await wait(700);

        await caption('08 · NAVER', '네이버 임시 저장도 준비 완료', '실제 발행 없이 설정 화면만 시연합니다');
        await page.locator('#blog-next-publish-settings').evaluate((element) => { element.hidden = false; element.open = true; });
        await page.locator('#blog-next-post-status').selectOption('draft').catch(() => {});
        await page.locator('#blog-next-runner-headless').check().catch(() => {});
        await wait(1400);

        await caption('09 · CARD NEWS', '블로그 원고를 카드뉴스로', '구성부터 이미지까지 한 번에 이어서');
        await go('card-news');
        await page.evaluate((base64) => {
            const imageUrl = `data:image/png;base64,${base64}`;
            renderCardNewsGeneration({
                id: 'overview-demo-generation', title: '제주 봄 여행의 작은 발견', image_mode: 'generate', status: 'completed',
                settings: { aspect_ratio: '4:5' }, cards: [
                    { index: 1, headline: '벚꽃길을 따라 만난 봄', body: '익숙한 길도 천천히 걸으면 새로운 풍경이 됩니다.', image_prompt: '제주 봄 풍경', image_url: imageUrl, download_url: imageUrl },
                    { index: 2, headline: '햇살 아래 잠깐의 쉼', body: '따뜻한 바람과 함께 하루를 채워 보세요.', image_prompt: '햇살 가득한 산책', image_url: imageUrl, download_url: imageUrl },
                    { index: 3, headline: '기억하고 싶은 하루', body: '좋은 순간은 나누면 더 오래 남습니다.', image_prompt: '봄날의 기록', image_url: imageUrl, download_url: imageUrl }
                ]
            }, { scroll: false });
        }, demoArtworkBase64);
        await page.evaluate(() => document.getElementById('card-news-result-panel')?.scrollIntoView({ block: 'start' }));
        await wait(1800);

        await caption('10 · SOCIAL', 'SNS 글에 어울리는 이미지까지', '본문과 추가 요청을 함께 반영하는 생성 흐름');
        await go('social');
        await page.evaluate(() => {
            manualSnsConfig = { ...manualSnsConfig, local_media_available: true, image_ai: { available: true, model_name: 'Demo Image Model' } };
            syncManualSnsComposerState();
        });
        await page.locator('#manual-sns-text').fill('고향의 봄, 천천히 걷고 싶은 오늘');
        await wait(450);
        await page.locator('#manual-sns-image-grid .social-local-image-ai-trigger').click();
        await wait(450);
        await page.locator('#manual-sns-image-instruction').fill('벚꽃길을 걷는 장면, 따뜻한 봄 햇살의 수채화풍');
        await page.locator('#manual-sns-image-generate-btn').click();
        await page.waitForFunction(() => document.querySelectorAll('.social-local-image-tile img').length > 0, null, { timeout: 7000 }).catch(() => {});
        await wait(1300);

        await caption('11 · READY TO SHARE', '만든 이미지는 저장하고, 다시 활용하고', '소중한 콘텐츠 자산을 내 것으로'); await wait(1200);

        await page.evaluate(() => {
            const veil = document.createElement('div');
            veil.id = 'bloggenius-demo-finale';
            veil.innerHTML = '<div class="demo-fireworks">✦　✧　✦　✧　✦<br>🎆　✦　🎇　✧　🎆</div><strong>BlogGenius</strong><span>아이디어에서 발행까지, 한 곳에서.</span><small>데모 화면 · 외부 서비스 요청 없음</small>';
            Object.assign(veil.style, { position: 'fixed', inset: '0', zIndex: '2147483647', display: 'grid', placeContent: 'center', textAlign: 'center', gap: '14px', color: '#fff6e8', background: 'radial-gradient(circle at 50% 45%, rgba(167,86,47,.94), rgba(24,20,21,.98) 65%)', fontFamily: 'inherit' });
            const style = document.createElement('style');
            style.textContent = '#bloggenius-demo-finale strong{font-size:60px;letter-spacing:-.04em}#bloggenius-demo-finale span{font-size:25px;color:#f1d5b5}#bloggenius-demo-finale small{font-size:14px;opacity:.72}.demo-fireworks{font-size:48px;line-height:1.35;color:#ffd48e;animation:demo-pop .7s ease-in-out infinite alternate}@keyframes demo-pop{to{transform:scale(1.08);filter:brightness(1.4)}}';
            document.head.appendChild(style); document.body.appendChild(veil);
        });
        await wait(2600);
    } finally {
        const video = page.video();
        await context.close();
        if (video) fs.copyFileSync(await video.path(), path.resolve(outputPath));
        fs.rmSync(recordingDirectory, { recursive: true, force: true });
    }
}

async function run() {
    const requests = [];
    const consoleErrors = [];
    const pageErrors = [];
    const failedResponses = [];
    const failedRequests = [];
    const blockedExternalRequests = [];
    const manuscriptFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-next-manuscript-browser-'));
    const manuscriptFixtureImage = path.join(manuscriptFixtureDir, '00_existing.png');
    fs.writeFileSync(path.join(manuscriptFixtureDir, 'contents.md'), '# 폴더 원고\n\n[[IMAGE_0\ntitle: 첫 이미지\nprompt: 푸른 하늘\n]]\n\n본문\n\n[[IMAGE_1\ntitle: 둘째 이미지\nprompt: 초록 숲\n]]');
    fs.writeFileSync(manuscriptFixtureImage, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const { server, baseUrl } = await startFixtureServer(requests);
    let browser;
    let heartbeat;

    try {
        const launchOptions = resolveBrowserLaunchOptions();
        const browserMode = launchOptions.headless ? 'headless' : 'headed';
        reportSmokePhase(`Launching ${browserMode} Chromium`);
        heartbeat = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - smokeProgress.phaseStartedAt) / 1000);
            console.log(`[ui-smoke] still waiting: ${smokeProgress.phase} (${elapsedSeconds}s), action=${smokeProgress.lastAction || 'between actions'}, URL=${smokeProgress.pageUrl || 'not opened'}, fixtureRequests=${requests.length}, pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}`);
        }, 20000);
        heartbeat.unref();
        browser = await chromium.launch(launchOptions);
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const fixtureOrigin = new URL(baseUrl).origin;
        await context.route('**/*', async (route) => {
            const requestUrl = new URL(route.request().url());
            if (requestUrl.origin === fixtureOrigin) {
                await route.continue();
                return;
            }
            blockedExternalRequests.push(`${route.request().method()} ${requestUrl.origin}${requestUrl.pathname}`);
            console.log(`[ui-smoke] blocked external request: ${route.request().method()} ${requestUrl.origin}${requestUrl.pathname}`);
            await route.abort('blockedbyclient');
        });
        const page = await context.newPage();
        instrumentPageActions(page);
        smokeProgress.pageUrl = page.url();
        page.setDefaultTimeout(5000);
        page.setDefaultNavigationTimeout(30000);
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(`${message.text()} @ ${JSON.stringify(message.location())}`);
        });
        page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
        page.on('response', (response) => {
            if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
        });
        page.on('requestfailed', (request) => {
            if (new URL(request.url()).origin !== fixtureOrigin) return;
            failedRequests.push(`${request.method()} ${request.url()} (${request.failure()?.errorText || 'unknown error'})`);
            console.log(`[ui-smoke] request failed: ${request.method()} ${request.url()} (${request.failure()?.errorText || 'unknown error'})`);
        });

        reportSmokePhase('Opening app (waiting for DOMContentLoaded; navigation timeout 30s)');
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        smokeProgress.pageUrl = page.url();
        await awaitSmokeCheck('Waiting for app navigation API', page.waitForFunction(() => typeof window.navigateTo === 'function'));
        await awaitSmokeCheck('Waiting for Dashboard Beta activation', page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active')));
        await awaitSmokeCheck('Waiting for Dashboard Beta initial flow state', page.waitForFunction(() => document.getElementById('dashboard-beta-flow-subject')?.textContent === '현재 실행 중인 글이 없습니다.'));
        if (process.env.UI_BROWSER_DEMO_VIDEO_PATH) {
            const scenario = process.env.UI_BROWSER_DEMO_SCENARIO || 'sidebar-style';
            if (scenario === 'overview-a-to-z') {
                await createUiOverviewDemoVideo(browser, baseUrl, process.env.UI_BROWSER_DEMO_VIDEO_PATH);
            } else {
                await createUiDemoVideo(browser, baseUrl, process.env.UI_BROWSER_DEMO_VIDEO_PATH);
            }
            console.log(`✅ UI demo video saved: ${path.resolve(process.env.UI_BROWSER_DEMO_VIDEO_PATH)}`);
            await context.close();
            return;
        }
        assert.equal(await page.locator('.main').evaluate((element) => getComputedStyle(element).paddingLeft), '20px');
        assert.equal(await page.locator('.main').evaluate((element) => getComputedStyle(element).paddingRight), '20px');
        reportSmokePhase('Checking dashboard navigation, onboarding, and discovery');
        const blogNavItem = page.locator('.nav-btn[data-view="blog-next"]');
        assert.equal(await page.locator('#sidebar').evaluate((element) => Math.round(element.getBoundingClientRect().width)), 224);
        const longestSidebarLabelFits = await page.evaluate(() => {
            const region = document.getElementById('sidebar-utility-region');
            const item = createSidebarDynamicBlock({
                id: 'developer-support-width-check',
                kind: 'support',
                title: '개발자 응원하기',
                icon: 'heart',
                media: null,
                targetUrl: 'https://example.com/support',
                disclosure: '',
                sortOrder: 999
            });
            region.appendChild(item);
            syncCollapsedSidebarTooltips();
            const label = item.querySelector('.nav-label');
            const fits = label.scrollWidth <= label.clientWidth;
            item.remove();
            return fits;
        });
        assert.equal(longestSidebarLabelFits, true);
        assert.notEqual(await blogNavItem.getAttribute('title'), '블로그');
        assert.equal(await blogNavItem.getAttribute('aria-label'), '블로그');
        await page.locator('#sidebar-toggle-btn').click();
        await page.waitForFunction(() => document.getElementById('sidebar')?.classList.contains('collapsed'));
        await blogNavItem.hover();
        await page.waitForFunction(() => !document.getElementById('sidebar-menu-tooltip')?.hidden);
        assert.equal((await page.locator('#sidebar-menu-tooltip').textContent())?.trim(), '블로그');
        await page.locator('#sidebar-toggle-btn').click();
        await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('collapsed'));
        assert.equal(await page.locator('#sidebar-menu-tooltip').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#dashboard-beta-ready-count').textContent(), '2건');
        await page.waitForFunction(() => document.getElementById('dashboard-beta-processed-count')?.textContent === '3건');
        assert.equal(await page.locator('#dashboard-beta-published-count').textContent(), '1건');
        assert.equal((await page.locator('#dashboard-beta-recent-results-list').textContent()).includes('오늘 발행 결과'), true);
        assert.equal((await page.locator('#dashboard-beta-readiness-items').textContent()).includes('Free · 이번 달 2/10회 사용 · 8회 남음'), true);
        const naverConnectionChip = page.locator('#dashboard-beta-readiness-items [data-dashboard-beta-channel="naver"]');
        assert.equal((await naverConnectionChip.locator('.dashboard-beta-channel-name').textContent())?.trim(), '네이버 블로그');
        assert.equal(await naverConnectionChip.locator('.dashboard-beta-channel-status').textContent(), '');
        assert.match(await naverConnectionChip.getAttribute('aria-label') || '', /네이버 로그인 확인됨/);
        await naverConnectionChip.focus();
        assert.equal(await naverConnectionChip.evaluate((element) => getComputedStyle(element, '::after').visibility), 'visible');
        await naverConnectionChip.click();
        await page.waitForFunction(() => (
            document.getElementById('view-settings-next')?.classList.contains('active')
            && document.getElementById('settings-next-core-panel-publishing')?.hidden === false
            && document.getElementById('settings-next-naver-form')?.getBoundingClientRect().height > 0
        ));
        await page.evaluate(() => navigateTo('dashboard-beta'));
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        assert.equal(await page.locator('#dashboard-beta-onboarding').evaluate(element => element.hidden), true);
        const operationsRequestCountBeforeSetupCheck = requests.filter((request) => (
            request.pathname === '/api/v1/continuous-publishing/dashboard-overview'
        )).length;
        const accountFailureRoute = async (route) => route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ success: false, error: { message: '라이선스 상태를 확인하지 못했습니다.' } })
        });
        const setupRequiredRoute = async (route) => route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
                success: true,
                data: {
                    ready: true,
                    isEssentialSet: false,
                    setup: {
                        ready: false,
                        ai: { configured: true, text_configured: true, image_configured: true },
                        google: { configured: false, account_connected: false, spreadsheet_configured: false },
                        publishing_channel: { configured: false, naver_configured: false, wordpress_configured: false }
                    }
                }
            })
        });
        await page.route('**/api/v1/account/overview?quiet=1', accountFailureRoute);
        await page.route('**/api/v1/config/status', setupRequiredRoute);
        await page.evaluate(() => loadDashboardBeta({ force: true }));
        assert.equal(await page.locator('#dashboard-beta-onboarding').evaluate(element => element.hidden), false);
        assert.equal((await page.locator('#dashboard-beta-onboarding-progress').textContent()).trim(), '1/3 준비됨');
        assert.equal((await page.locator('#dashboard-beta-onboarding-action').textContent()).trim(), 'Google 연결하기');
        assert.equal((await page.locator('#dashboard-beta-flow-subject').textContent()).trim(), 'Google 연결 후 발행 현황을 확인할 수 있습니다.');
        assert.equal(requests.filter((request) => (
            request.pathname === '/api/v1/continuous-publishing/dashboard-overview'
        )).length, operationsRequestCountBeforeSetupCheck);
        assert.equal(consoleErrors.some((item) => item.includes('/api/v1/account/overview?quiet=1')), true);
        for (let index = consoleErrors.length - 1; index >= 0; index -= 1) {
            if (consoleErrors[index].includes('/api/v1/account/overview?quiet=1')) consoleErrors.splice(index, 1);
        }
        await page.locator('#dashboard-beta-onboarding-action').click();
        await page.waitForFunction(() => document.getElementById('view-settings-next')?.classList.contains('active'));
        assert.equal(await page.locator('#settings-next-tab-core').getAttribute('aria-selected'), 'true');
        await page.waitForFunction(() => document.getElementById('settings-next-content-form')?.classList.contains('settings-navigation-target'));
        await page.unroute('**/api/v1/account/overview?quiet=1', accountFailureRoute);
        await page.unroute('**/api/v1/config/status', setupRequiredRoute);
        await page.evaluate(() => navigateTo('dashboard-beta'));
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        await page.evaluate(() => loadDashboardBeta({ force: true }));
        await page.waitForFunction(() => document.getElementById('dashboard-beta-onboarding')?.hidden === true);
        await page.locator('[data-dashboard-beta-period="week"]').click();
        assert.equal(await page.locator('#dashboard-beta-processed-count').textContent(), '8건');
        assert.equal(await page.locator('#dashboard-beta-published-count').textContent(), '4건');
        assert.equal((await page.locator('#dashboard-beta-recent-results-list').textContent()).includes('이번 주 임시 저장 결과'), true);
        assert.equal(await page.locator('#dashboard-beta-recent-results-list a').textContent(), '블로그 열기');
        assert.equal(await page.locator('#dashboard-beta-trend-bars .dashboard-beta-trend-day').count(), 7);
        await page.locator('[data-dashboard-beta-period="month"]').click();
        assert.equal(await page.locator('#dashboard-beta-processed-count').textContent(), '19건');
        assert.equal(await page.locator('#dashboard-beta-published-count').textContent(), '9건');
        assert.equal((await page.locator('#dashboard-beta-recent-results-list').textContent()).includes('30일 발행 결과'), true);
        assert.equal(await page.locator('#dashboard-beta-trend').evaluate(element => element.hidden), false);
        assert.equal(await page.locator('#dashboard-beta-trend-bars .dashboard-beta-trend-day').count(), 30);
        const monthAxisLabels = (await page.locator('#dashboard-beta-trend-bars small').allTextContents()).filter(Boolean);
        assert.equal(monthAxisLabels.length, 5);
        assert.equal(monthAxisLabels.every(label => /^\d+일$/.test(label)), true);
        assert.equal(await page.locator('#dashboard-beta-tips-section').evaluate(element => element.hidden), false);
        assert.equal((await page.locator('#dashboard-beta-tips-region').textContent()).includes('BlogGenius로 꾸준한 글쓰기 흐름 만들기'), true);
        assert.equal(await page.locator('#dashboard-beta-tips-region a').getAttribute('href'), 'https://example.com/bloggenius-tip');
        await page.waitForFunction(() => document.querySelector('#dashboard-beta-support-teaser-region .surface-supporting-card-support'));
        assert.equal(await page.locator('#dashboard-beta-support-teaser').evaluate(element => element.hidden), false);
        assert.equal((await page.locator('#dashboard-beta-support-teaser-region').textContent()).includes('개발자 응원하기'), true);
        assert.equal(await page.locator('#dashboard-beta-support-teaser-region a').getAttribute('href'), 'https://example.com/support');
        await page.evaluate(() => initDashboardBetaSupportTeaser({ operationallyEligible: true }));
        assert.equal(await page.locator('#dashboard-beta-support-teaser').evaluate(element => element.hidden), false);
        await page.waitForFunction(() => document.querySelector('#dashboard-beta-discovery-list .recommendation-card h3')?.textContent?.trim() === '로컬 여행');
        assert.equal((await page.locator('#dashboard-beta-discovery-title').textContent())?.trim(), '새로운 발견');
        assert.equal((await page.locator('#dashboard-beta-discovery-count').textContent())?.trim(), '1');
        assert.equal((await page.locator('#dashboard-beta-discovery-refresh').textContent())?.trim(), '새 소재 찾기');
        assert.equal(await page.locator('#dashboard-beta-discovery-list .recommendation-card').count(), 1);
        assert.equal(
            await page.locator('.nav-btn[data-view="dashboard-beta"] .nav-label').evaluate((element) => element.childNodes[0]?.textContent?.trim()),
            '대시보드'
        );
        assert.equal(await page.locator('.nav-btn[data-view="dashboard-beta"] .nav-new-badge').count(), 0);
        assert.equal((await page.locator('.nav-btn[data-view="help"] .nav-label').textContent()).trim(), '도움말');
        await page.evaluate(() => {
            void showUiDialog({ title: '진행 중인 작업', message: '현재 결정을 먼저 완료해 주세요.' });
        });
        await page.waitForFunction(() => document.getElementById('ui-dialog-backdrop')?.getAttribute('aria-hidden') === 'false');
        assert.equal(await page.evaluate(() => navigateToBlogQuickCreate()), false);
        assert.equal(await page.locator('#view-dashboard-beta').evaluate((element) => element.classList.contains('active')), true);
        await page.locator('#ui-dialog-confirm').click();
        await page.evaluate(() => navigateToBlogQuickCreate());
        await page.waitForFunction(() => document.getElementById('view-blog-next')?.classList.contains('active'));
        assert.equal(await page.locator('[data-blog-next-tab="quick"]').getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('[data-blog-next-mode-panel="ai"]').evaluate((element) => element.hidden), false);
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-subject');
        await page.locator('[data-blog-next-tab="quick"]').focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-tab-trend-posting');
        assert.equal(await page.locator('[data-blog-next-tab="trend-posting"]').getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('[data-blog-next-tab="quick"]').getAttribute('tabindex'), '-1');
        assert.equal(await page.locator('[data-blog-next-tab="trend-posting"]').getAttribute('tabindex'), '0');
        await page.keyboard.press('End');
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-tab-smart-comment');
        await page.keyboard.press('Home');
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-tab-quick');
        const panelAnatomy = await page.evaluate(() => {
            const names = ['quick', 'trend-posting', 'queue', 'smart-comment'];
            return names.map((name) => {
                activateBlogNextTab(name);
                const panel = document.getElementById(`blog-next-panel-${name}`);
                const lead = panel.querySelector('.blog-next-panel-lead');
                const panelBox = panel.getBoundingClientRect();
                const leadBox = lead.getBoundingClientRect();
                return { name, panelLeft: panelBox.left, leadLeft: leadBox.left, leadHeight: leadBox.height };
            });
        });
        assert.equal(panelAnatomy.every((item) => Math.abs(item.panelLeft - panelAnatomy[0].panelLeft) < 1), true);
        assert.equal(panelAnatomy.every((item) => Math.abs(item.leadLeft - panelAnatomy[0].leadLeft) < 1), true);
        assert.equal(panelAnatomy.every((item) => item.leadHeight >= 64), true);
        assert.equal(await page.locator('#view-blog-next .blog-next-panel > .blog-next-panel-intro').count(), 4);
        assert.equal(await page.locator('#view-blog-next .blog-next-segmented-nav').count(), 1);
        const segmentedSelectionStyles = await page.evaluate(() => {
            const queue = getComputedStyle(document.querySelector('.blog-next-management-tab.active'));
            const track = getComputedStyle(document.querySelector('.blog-next-segmented-nav'));
            return {
                queue: queue.backgroundColor,
                track: track.backgroundColor,
                selectedShadow: queue.boxShadow
            };
        });
        assert.notEqual(segmentedSelectionStyles.queue, segmentedSelectionStyles.track);
        assert.notEqual(segmentedSelectionStyles.selectedShadow, 'none');
        await page.evaluate(() => {
            activateBlogNextTab('queue');
            activateBlogNextManagementTab('automation');
        });
        await page.locator('#blog-next-automation-enabled').focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'blog-next-automation-enabled');
        assert.equal(await page.locator('#blog-next-automation-enabled').evaluate((element) => {
            const style = getComputedStyle(element);
            return style.outlineStyle === 'none' && style.boxShadow !== 'none';
        }), true);
        const scrollBeforeTabSwitch = await page.evaluate(() => {
            activateBlogNextTab('quick');
            window.scrollTo(0, 160);
            return window.scrollY;
        });
        const scrollAfterTabSwitch = await page.evaluate(() => {
            activateBlogNextTab('queue');
            return window.scrollY;
        });
        assert.equal(scrollAfterTabSwitch, scrollBeforeTabSwitch);
        await page.evaluate(() => activateBlogNextTab('quick'));
        await page.evaluate(() => navigateTo('dashboard-beta'));
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        assert.equal(await page.locator('#dashboard-beta-queue-list').textContent().then(text => text.includes('Dashboard Beta 다음 글감')), true);
        await page.locator('[data-dashboard-beta-period="today"]').click();
        await page.waitForFunction(() => document.getElementById('dashboard-beta-trend-title')?.textContent === '오늘 시간대별 추이');
        assert.equal(await page.locator('#dashboard-beta-trend').evaluate(element => element.hidden), false);
        assert.equal(await page.locator('#dashboard-beta-trend-bars .dashboard-beta-trend-day').count(), 11);
        assert.deepEqual(
            (await page.locator('#dashboard-beta-trend-bars small').allTextContents()).filter(Boolean),
            ['0시', '3시', '6시', '9시']
        );
        assert.equal(await page.locator('#dashboard-beta-trend-bars small').evaluateAll((labels) => (
            new Set(labels.map(label => label.getBoundingClientRect().height)).size
        )), 1);
        assert.equal(await page.locator('#dashboard-beta-trend-bars .dashboard-beta-trend-bar-pair').evaluateAll((bars) => (
            new Set(bars.map(bar => Math.round(bar.getBoundingClientRect().bottom))).size
        )), 1);
        await page.locator('[data-dashboard-beta-period="week"]').click();
        assert.equal(await page.locator('#dashboard-beta-trend-title').textContent(), '이번 주 일별 추이');
        assert.equal(await page.locator('#dashboard-beta-trend-bars .dashboard-beta-trend-day').count(), 7);
        await page.locator('[data-dashboard-beta-period="today"]').click();
        await page.locator('#dashboard-beta-tips-section [data-dashboard-beta-nav="help"]').click();
        assert.equal(await page.locator('#view-help').evaluate(element => element.classList.contains('active')), true);
        assert.equal(await page.locator('#view-help [data-clock-display]').count(), 1);
        assert.notEqual((await page.locator('#view-help [data-clock-display]').innerHTML()).trim(), '');
        await page.waitForFunction(() => document.querySelector('#help-getting-started-region strong')?.textContent === '원격 설치 가이드');
        assert.equal(await page.locator('#view-help .help-start-list a').count(), 1);
        assert.equal(await page.locator('#view-help .help-topic-card').count(), 2);
        assert.equal(await page.locator('#help-supporting-section').evaluate(element => element.hidden), false);
        assert.equal((await page.locator('#help-supporting-region').textContent()).includes('개발자 응원하기'), true);
        assert.equal(await page.locator('#view-help .help-contact-card .ui-button-link').getAttribute('href'), 'https://open.kakao.com/o/gZWL25Zh');
        assert.equal(requests.some(request => request.pathname === '/api/v1/continuous-publishing/dashboard-overview'), true);
        assert.equal(requests.some(request => request.pathname === '/api/v1/continuous-publishing/dashboard-result-stats'), true);
        assert.equal(await page.evaluate(() => recommendationCenterToastMessage([
            { title: '경찰 계급도' }, { title: '두 번째 소재' }, { title: '세 번째 소재' }
        ])), '경찰 계급도 외 2건');

        const discoverySourceTitle = `뜻밖의 발견 전체 제목 ${'끝까지 전달되어야 합니다 '.repeat(12)}원문 끝`;
        await page.evaluate(async (sourceTitle) => {
            activateBlogNextInputMode('paste');
            await openRecommendationPresentation({
                target: { surface: 'blog.quick' },
                payload: { query: '발견 카드의 짧은 표시값', original_title: sourceTitle }
            });
        }, discoverySourceTitle);
        assert.equal(await page.locator('#blog-next-subject').inputValue(), discoverySourceTitle);
        await page.evaluate(() => {
            void openRecommendationPresentation({
                target: { surface: 'blog.quick' },
                payload: { query: '"산림재난 정책 성공위한 \'재난에 강한 마을\' 설계해야 한다"' }
            });
        });
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden')
            && document.getElementById('ui-dialog-message')?.textContent?.includes('작성 중인 내용'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => (
            document.querySelector('[data-blog-next-mode-panel="ai"]')?.hidden === false
            && document.getElementById('blog-next-subject')?.value === '산림재난 정책 성공위한 \'재난에 강한 마을\' 설계해야 한다'
        ));
        assert.equal(await page.locator('#view-blog-next').evaluate((element) => element.classList.contains('active')), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="ai"]').evaluate((element) => element.hidden), false);
        assert.equal(
            await page.locator('#blog-next-subject').inputValue(),
            '산림재난 정책 성공위한 \'재난에 강한 마을\' 설계해야 한다'
        );
        await page.evaluate((sourceTitle) => {
            activateBlogNextInputMode('paste');
            void openRecommendationPresentation({
                target: { surface: 'blog.quick' },
                payload: { query: '잘린 카드 표시값', original_title: sourceTitle }
            });
        }, discoverySourceTitle);
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden')
            && document.getElementById('ui-dialog-message')?.textContent?.includes('작성 중인 내용'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction((sourceTitle) => (
            document.querySelector('[data-blog-next-mode-panel="ai"]')?.hidden === false
            && document.getElementById('blog-next-subject')?.value === sourceTitle
        ), discoverySourceTitle);
        assert.equal(await page.locator('[data-blog-next-mode-panel="ai"]').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-subject').inputValue(), discoverySourceTitle);
        const legacyDiscoverySourceTitle = '원본 뉴스의 전체 제목은 이 근거에서 복구되어야 합니다';
        assert.equal(await page.evaluate((sourceTitle) => recommendationSourceTitle({
            lane: 'serendipity',
            action: { payload: { query: sourceTitle.slice(0, 8) } },
            evidence: [{ summary: `언론사 관련 보도: ${sourceTitle}` }]
        }), legacyDiscoverySourceTitle), legacyDiscoverySourceTitle);
        assert.equal(await page.evaluate((sourceTitle) => recommendationSourceTitle({
            lane: 'serendipity',
            action: { payload: { query: sourceTitle.slice(0, 8), original_title: sourceTitle.slice(0, 15) } },
            evidence: [{ summary: `언론사 관련 보도: ${sourceTitle}` }]
        }), legacyDiscoverySourceTitle), legacyDiscoverySourceTitle);
        assert.equal(await page.evaluate(() => recommendationPresentationQuery('“겹따옴표 소재”')), '겹따옴표 소재');
        assert.equal(await page.evaluate(() => recommendationActionLabel({
            lane: 'serendipity', action: { type: 'presentation', label: '소재 살펴보기' }
        })), '소재 적용하기');
        await page.evaluate(() => navigateTo('settings'));
        await page.waitForFunction(() => document.getElementById('view-settings-next')?.classList.contains('active'));
        assert.equal(await page.locator('#settings-next-tab-core').getAttribute('aria-selected'), 'true');

        await page.locator('.nav-btn[data-view="settings-next"]').click();
        await page.waitForFunction(() => document.getElementById('view-settings-next')?.classList.contains('active'));
        await page.waitForFunction(() => document.querySelector('#view-settings-next [data-clock-display]')?.children.length > 0);
        await page.locator('[data-settings-next-core-tab="content"]').click();
        assert.equal(await page.locator('#settings-next-content-status').textContent(), '연결됨');
        assert.equal(await page.locator('#settings-next-sheet-readiness').textContent(), '연결됨');
        assert.equal(await page.locator('#settings-next-google-sheet-create').isVisible(), true);
        assert.equal(await page.locator('#settings-next-google-sheet-pick').isVisible(), true);
        assert.equal(await page.locator('#settings-next-google-connect').count(), 0);
        const settingsTopTab = page.locator('[data-settings-next-tab="core"]');
        await settingsTopTab.focus();
        await settingsTopTab.press('ArrowRight');
        assert.equal(await page.locator('[data-settings-next-tab="ai"]').getAttribute('aria-selected'), 'true');
        await page.waitForFunction(() => document.querySelector('#settings-next-ai-text-form [data-ai-field="provider"]')?.value === 'direct');
        for (const targetId of [
            'settings-next-ai-text-form',
            'settings-next-ai-image-form',
            'settings-next-ai-chat-form'
        ]) {
            await page.locator(`[data-settings-card-target="${targetId}"]`).click();
            await page.waitForFunction((id) => {
                const scroller = document.querySelector('.main');
                const target = document.getElementById(id);
                if (!scroller || !target) return false;
                const scrollerRect = scroller.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                const scrollerCenter = scrollerRect.top + scroller.clientHeight / 2;
                const targetCenter = targetRect.top + targetRect.height / 2;
                return Math.abs(targetCenter - scrollerCenter) < 120;
            }, targetId);
            assert.equal(await page.evaluate((id) => document.activeElement?.id === id, targetId), true);
        }
        assert.equal(await page.locator('#settings-next-ai-chat-status').textContent(), '글쓰기 모델 사용');
        assert.equal(await page.locator('#settings-next-ai-text-form [data-ai-field="apiKey"]').inputValue(), '');
        assert.equal(await page.locator('#settings-next-ai-text-form [data-ai-field="apiKey"]').getAttribute('placeholder'), '직접 입력 API Key 등록됨');
        assert.equal(
            await page.locator('#settings-next-ai-text-form [data-ai-field="provider"]').evaluate((element) => getComputedStyle(element.closest('.ui-settings-field')).fontSize),
            await page.locator('#settings-next-naver-id').evaluate((element) => getComputedStyle(element.closest('.ui-settings-field')).fontSize)
        );
        await page.locator('#settings-next-ai-text-feedback').evaluate((element) => {
            element.textContent = '이전 연결 확인 결과';
            element.dataset.tone = 'danger';
        });
        await page.locator('#settings-next-ai-text-form [data-ai-field="provider"]').selectOption('google');
        assert.equal((await page.locator('#settings-next-ai-text-feedback').textContent())?.trim(), '');
        assert.equal(await page.locator('#settings-next-ai-text-form [data-ai-field="baseUrl"]').inputValue(), 'https://generativelanguage.googleapis.com/v1beta');
        await page.locator('#settings-next-ai-text-form [data-ai-field="provider"]').selectOption('openai');
        assert.equal(await page.locator('#settings-next-ai-text-form [data-ai-field="presetCode"]').inputValue(), 'gpt-5.6-sol');
        assert.equal(await page.locator('#settings-next-ai-text-form [data-ai-field="apiKey"]').getAttribute('placeholder'), 'OpenAI API Key 등록됨');
        assert.equal((await page.locator('#settings-next-ai-text-form [data-ai-key-hint]').textContent())?.trim(), 'OpenAI API Key가 등록되어 있습니다. 변경할 때만 새 값을 입력하세요.');
        await page.locator('#settings-next-ai-text-form [data-ai-field="provider"]').selectOption('direct');
        assert.equal(await page.locator('#settings-next-ai-text-form [data-ai-field="baseUrl"]').inputValue(), 'https://ai.fixture.example/v1');
        assert.equal(await page.locator('[data-settings-next-ai-fields="chat"]').isHidden(), true);
        assert.equal((await page.locator('#settings-next-ai-chat-inherited').textContent())?.includes('fixture-text'), true);
        await page.locator('#settings-next-ai-text-form [data-ai-field="name"]').fill('fixture-text-b');
        assert.equal((await page.locator('#settings-next-ai-chat-inherited').textContent())?.includes('fixture-text-b'), true);
        const aiRoleLoadsBeforeDiscard = requests.filter((request) => (
            request.method === 'GET' && request.pathname === '/api/v1/settings/ai-roles'
        )).length;
        const settingsNextDiscardNavigation = page.evaluate(() => navigateTo('dashboard-beta'));
        await page.waitForFunction(() => document.getElementById('ui-dialog-backdrop')?.getAttribute('aria-hidden') === 'false');
        assert.equal((await page.locator('#ui-dialog-message').textContent())?.includes('글쓰기 모델'), true);
        await page.locator('#ui-dialog-tertiary').click();
        await settingsNextDiscardNavigation;
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        assert.equal(await page.evaluate(() => hasPendingSettingsNextChanges()), false);
        assert.equal(await page.locator('#settings-next-ai-text-form [data-ai-field="name"]').inputValue(), 'fixture-text');
        assert.equal(requests.filter((request) => (
            request.method === 'GET' && request.pathname === '/api/v1/settings/ai-roles'
        )).length, aiRoleLoadsBeforeDiscard);
        await page.locator('.nav-btn[data-view="settings-next"]').click();
        await page.waitForFunction(() => document.getElementById('view-settings-next')?.classList.contains('active'));
        await page.waitForFunction(() => document.querySelector('#settings-next-ai-text-form [data-ai-field="name"]')?.value === 'fixture-text');
        await page.locator('input[name="settings-next-ai-chat-source"][value="dedicated"]').check();
        await page.evaluate(() => settingsNextClearScopeDirty('ai-chat'));
        assert.equal(await page.locator('[data-settings-next-ai-fields="chat"]').isHidden(), false);
        assert.equal(
            await page.locator('#settings-next-ai-chat-form .ui-settings-choice-group legend').evaluate((element) => getComputedStyle(element).fontSize),
            await page.locator('#settings-next-naver-id').evaluate((element) => getComputedStyle(element.closest('.ui-settings-field')).fontSize)
        );
        assert.equal(
            await page.locator('#settings-next-ai-chat-form .ui-settings-choice-group label').first().evaluate((element) => getComputedStyle(element).fontSize),
            await page.locator('#settings-next-naver-id').evaluate((element) => getComputedStyle(element.closest('.ui-settings-field')).fontSize)
        );
        await page.locator('[data-settings-next-tab="writing"]').click();
        await page.waitForFunction(() => document.getElementById('settings-next-writing-voice-summary')?.textContent !== '불러오는 중');
        const writingStrategyBefore = await page.evaluate(() => settingsNextWritingDraft.common.writing_strategy);
        await page.locator('#settings-next-writing-mode').selectOption('written');
        await page.locator('#settings-next-writing-length').selectOption('long');
        assert.equal((await page.locator('#settings-next-writing-voice-summary').textContent())?.includes('문어체'), true);
        assert.equal((await page.locator('#settings-next-writing-structure-summary').textContent())?.includes('길게'), true);
        assert.equal(await page.locator('#settings-next-writing-apply').isEnabled(), true);
        const writingStayNavigation = page.evaluate(() => navigateTo('dashboard-beta'));
        await page.waitForFunction(() => document.getElementById('ui-dialog-backdrop')?.getAttribute('aria-hidden') === 'false');
        assert.equal((await page.locator('#ui-dialog-message').textContent())?.includes('글쓰기 기본값'), true);
        await page.locator('#ui-dialog-cancel').click();
        await writingStayNavigation;
        assert.equal(await page.locator('#view-settings-next').evaluate((element) => element.classList.contains('active')), true);
        await page.locator('#settings-next-writing-apply').click();
        await page.waitForFunction(() => !settingsNextDirtyScopes.has('writing'));
        const writingApplyRequest = requests.filter((request) => (
            request.pathname === '/api/v1/settings/writing-profile' && request.method === 'PUT'
        )).at(-1);
        assert.equal(writingApplyRequest.body.active_profile, 'custom');
        assert.equal(writingApplyRequest.body.custom_profile.common.writing_strategy, writingStrategyBefore);
        assert.equal(writingApplyRequest.body.custom_profile.common.voice.writing_mode, 'written');
        assert.equal(writingApplyRequest.body.custom_profile.channels.blog.length.preset, 'long');
        await page.locator('[data-settings-next-tab="extras"]').click();
        assert.equal((await page.locator('#settings-next-buffer-status').textContent())?.trim(), '최근 확인됨');
        assert.match((await page.locator('#settings-next-buffer-footer-detail').textContent()) || '', /최근 연결 확인됨/);
        assert.deepEqual(
            await page.locator('[data-settings-next-extras-tab]').allTextContents(),
            ['SNS 배포', '메시지·알림', '링크 단축']
        );
        assert.equal(await page.locator('#settings-next-buffer-api-key').inputValue(), '');
        assert.equal((await page.locator('#settings-next-buffer-secret-help').textContent()).includes('등록되어 있습니다'), true);
        await page.locator('[data-settings-next-extras-tab="messaging"]').click();
        assert.equal(await page.locator('#settings-next-telegram-status').textContent(), '확인 필요');
        await page.locator('[data-settings-card-target="settings-next-slack-form"]').click();
        await page.waitForFunction(() => document.activeElement?.id === 'settings-next-slack-form');
        await page.locator('#settings-next-slack-webhook').fill('new-secret');
        await page.locator('[data-settings-next-secret-toggle="settings-next-slack-webhook"]').click();
        assert.equal(await page.locator('#settings-next-slack-webhook').getAttribute('type'), 'text');
        await page.evaluate(() => settingsNextClearScopeDirty('optional-slack'));
        await page.locator('[data-settings-next-extras-tab="links"]').click();
        await page.locator('#settings-next-bitly-form button[type="submit"]').click();
        await page.waitForFunction(() => document.getElementById('settings-next-bitly-status')?.textContent === '연결됨');
        const bitlyRequests = requests.filter((request) => request.pathname.startsWith('/api/v1/settings/optional-services')).slice(-2);
        assert.deepEqual(bitlyRequests.map(({ method, pathname }) => ({ method, pathname })), [
            { method: 'POST', pathname: '/api/v1/settings/optional-services' },
            { method: 'POST', pathname: '/api/v1/settings/optional-services/test' }
        ]);
        await page.locator('[data-settings-next-tab="ai"]').press('Home');
        assert.equal(await settingsTopTab.getAttribute('aria-selected'), 'true');
        const settingsLocalTab = page.locator('[data-settings-next-core-tab="content"]');
        await settingsLocalTab.focus();
        await settingsLocalTab.press('ArrowRight');
        assert.equal(await page.locator('[data-settings-next-core-tab="publishing"]').getAttribute('aria-selected'), 'true');
        await page.locator('[data-settings-next-core-tab="publishing"]').press('Home');
        assert.equal(await settingsLocalTab.getAttribute('aria-selected'), 'true');
        await page.locator('[data-settings-next-core-tab="publishing"]').click();
        await page.locator('[data-settings-card-target="settings-next-naver-form"]').click();
        await page.waitForFunction(() => document.activeElement?.id === 'settings-next-naver-form');

        await page.evaluate(() => {
            window.__settingsNextSmokeConfirm = showUiConfirm;
            showUiConfirm = async () => true;
        });
        reportSmokePhase('Checking current Settings, account, logs, and active-surface navigation');
        for (const viewName of ['account', 'social', 'settings', 'logs', 'shopping', 'site-hosting', 'dashboard-beta', 'blog-next']) {
            const expectedViewName = viewName === 'settings' ? 'settings-next' : viewName;
            const siteTemplateAutoCheck = viewName === 'site-hosting'
                ? page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/site-hosting/templates' && response.request().method() === 'GET')
                : null;
            if (await page.locator(`.nav-btn[data-view="${viewName}"]`).isVisible()) {
                await page.locator(`.nav-btn[data-view="${viewName}"]`).click();
            } else {
                await page.evaluate((name) => navigateTo(name), viewName);
            }
            await page.waitForFunction((name) => document.getElementById(`view-${name}`)?.classList.contains('active'), expectedViewName);
            if (viewName === 'site-hosting') {
                await siteTemplateAutoCheck;
                await page.getByRole('heading', { name: '아직 프로젝트가 없습니다.' }).waitFor();
                await page.locator('[data-site-project-create]').click();
                await page.locator('#site-project-name').fill('브라우저 검증 프로젝트');
                await page.getByRole('button', { name: '만들기', exact: true }).click();
                // The project name is represented in the project card/list, while
                // the detail view intentionally presents the site's workspace.
                await page.getByRole('heading', { name: '내 사이트' }).waitFor();
                await page.locator('.site-hosting-add-site-card[data-site-create]').waitFor();
                await page.getByText('아직 사이트가 없습니다. 사이트 추가를 눌러 첫 사이트를 만들어 주세요.').waitFor();
                assert.equal(requests.filter((request) => request.method === 'POST' && request.pathname.endsWith('/sites')).length, 0,
                    'opening an empty project must not create a Site automatically');
                await page.locator('.site-hosting-add-site-card[data-site-create]').click();
                await page.locator('[data-site-template-select]').first().waitFor();
                assert.equal(await page.locator('#site-search-indexing').isChecked(), true);
                await page.locator('#site-name').fill('취소 확인 테스트');
                await page.locator('[data-site-create-cancel]').click();
                await page.getByRole('heading', { name: '사이트 만들기를 취소할까요?' }).waitFor();
                await page.locator('#site-create-cancel-dialog [value="stay"]').click();
                assert.equal(await page.locator('#site-create-dialog').evaluate((dialog) => dialog.open), true);
                await page.locator('[data-site-create-cancel]').click();
                await page.locator('#site-create-cancel-dialog [value="confirm"]').click();
                await page.waitForFunction(() => document.getElementById('site-create-dialog')?.open === false);
                await page.locator('.site-hosting-add-site-card[data-site-create]').click();
                await page.locator('[data-site-template-select]').first().waitFor();
                await page.locator('#site-description').fill('브라우저 smoke에서 입력한 사이트 설명');
                await page.locator('#site-search-indexing').uncheck();
                await page.locator('#site-share-image').setInputFiles({
                    name: 'site-share.png', mimeType: 'image/png',
                    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/iO0AAAAASUVORK5CYII=', 'base64')
                });
                await page.waitForFunction(() => document.getElementById('site-share-image-preview')?.hidden === false);
                await page.locator('#site-name').fill('브라우저 검증 사이트');
                await page.locator('#site-navigation-fields [data-site-menu-label]').nth(1).fill('이야기');
                await page.locator('#site-navigation-fields [data-site-menu-href]').nth(1).fill('/stories/');
                await page.locator('#site-navigation-fields input[type="radio"]').nth(1).check();
                await page.locator('[data-site-create-preview]').click();
                await page.locator('#site-create-preview-frame').waitFor({ state: 'visible' });
                await page.waitForFunction(() => document.getElementById('site-create-preview-status')?.textContent
                    === '미리보기 완료 · 공개 노트 2개 · 제외 2개 · 첨부 1개 · 미해결 링크 3개 · 누락 첨부 1개');
                const previewRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/preview-drafts'));
                assert.deepEqual(previewRequest?.body?.customization?.navigation, [
                    { label: '홈', href: '/' }, { label: '이야기', href: '/stories/' }
                ]);
                assert.deepEqual(previewRequest?.body?.customization?.publishing, { post_list_navigation_index: 1 });
                assert.equal(previewRequest?.body?.customization?.site_description, '브라우저 smoke에서 입력한 사이트 설명');
                assert.equal(previewRequest?.body?.customization?.search_engine_indexing, false);
                assert.match(previewRequest?.body?.customization?.share_image || '', /^data:image\/png;base64,/);
                await page.getByRole('button', { name: '미리보기 닫기' }).click();
                await page.locator('#site-create-form [type="submit"]').click();
                await page.getByText('브라우저 검증 사이트', { exact: true }).waitFor();
                await page.locator('.site-hosting-site-more summary').click();
                await page.locator('[data-site-settings]').click();
                await page.locator('#site-create-title').getByText('사이트 설정').waitFor();
                await page.waitForFunction(() => document.getElementById('site-create-workspace')?.inert === false);
                assert.equal(await page.locator('#site-template-picker-title').textContent(), '현재 사이트');
                assert.equal(await page.locator('#site-settings-current-preview').isVisible(), true);
                assert.match(await page.locator('#site-settings-current-preview-image').getAttribute('src'), /\/sites\/site-smoke-1\/screenshot\?/);
                await page.locator('#site-name').fill('설정 변경 사이트');
                await page.locator('#site-description').fill('설정 화면에서 수정한 소개');
                assert.equal(await page.locator('[data-site-template-select]').count(), 0);
                assert.equal(await page.locator('#site-create-form [type="submit"]').isDisabled(), false);
                await page.locator('[data-site-create-preview]').click();
                await page.locator('#site-create-preview-frame').waitFor({ state: 'visible' });
                assert.equal(await page.locator('#site-create-form [type="submit"]').isDisabled(), false);
                await page.getByRole('button', { name: '미리보기 닫기' }).click();
                await page.locator('#site-create-form [type="submit"]').click();
                await page.waitForFunction(() => document.getElementById('site-create-dialog')?.open === false
                    || Boolean(document.getElementById('site-create-feedback')?.textContent), { timeout: 10000 });
                assert.equal(await page.locator('#site-create-dialog').evaluate((dialog) => dialog.open), false,
                    `site settings apply failed: ${await page.locator('#site-create-feedback').textContent()}`);
                await page.getByText('설정 변경 사이트', { exact: true }).waitFor({ timeout: 10000 });
                const settingsRequest = requests.find((request) => request.method === 'PUT' && request.pathname.endsWith('/sites/site-smoke-1'));
                assert.equal(settingsRequest?.body?.name, '설정 변경 사이트');
                assert.equal(settingsRequest?.body?.customization?.site_description, '설정 화면에서 수정한 소개');
                const createRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/sites'));
                assert.deepEqual(createRequest?.body?.customization?.navigation, [
                    { label: '홈', href: '/' }, { label: '이야기', href: '/stories/' }
                ]);
                assert.deepEqual(createRequest?.body?.customization?.publishing, { post_list_navigation_index: 1 });
                assert.equal(createRequest?.body?.customization?.site_description, '브라우저 smoke에서 입력한 사이트 설명');
                assert.equal(createRequest?.body?.customization?.search_engine_indexing, false);
                const manualTemplateCheck = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/site-hosting/templates' && response.request().method() === 'GET');
                await page.locator('[data-site-template-refresh]').click();
                await manualTemplateCheck;
                await page.getByText('템플릿 확인을 마쳤습니다.').waitFor();
                assert.match(createRequest?.body?.customization?.share_image || '', /^data:image\/png;base64,/);
                await page.getByText('설정 변경 사이트', { exact: true }).waitFor();
                await page.evaluate(() => {
                    const site = siteHostingSites.find((item) => item.id === 'site-smoke-1');
                    const operationKey = `${site.project_id}:${site.id}`;
                    site.custom_domain_binding = null;
                    siteHostingOperationStates.set(operationKey, { phase: 'running', message: '사이트를 Cloudflare에 배포 중…' });
                    siteHostingRenderProjectDetail();
                    site.deployment = { worker_name: 'bg-site-smoke-1', url: 'https://bg-site-smoke-1.example.workers.dev/', worker_account_id: 'a'.repeat(32), worker_created_on: '2026-10-02T00:00:00Z', managed_by_app: true };
                    siteHostingRenderProjectDetail();
                    window.__workerDisconnectDisabledDuringDeploy = document.querySelector('[data-site-worker-disconnect="site-smoke-1"]')?.disabled;
                    siteHostingSetSiteOperation(site.id, 'success', 'Cloudflare 배포를 마쳤습니다.');
                    window.__workerDisconnectEnabledAfterDeploy = document.querySelector('[data-site-worker-disconnect="site-smoke-1"]')?.disabled === false;
                    site.custom_domain_binding = { hostname: 'blog.example.com' };
                    siteHostingRenderProjectDetail();
                    window.__domainDisconnectConfirmCalls = [];
                    showUiConfirm = async (message, options) => {
                        window.__domainDisconnectConfirmCalls.push({ message, options });
                        return true;
                    };
                });
                assert.equal(await page.evaluate(() => window.__workerDisconnectDisabledDuringDeploy), true,
                    'Worker disconnect must remain disabled while deployment is running');
                assert.equal(await page.evaluate(() => window.__workerDisconnectEnabledAfterDeploy), true,
                    'newly created app-owned Worker must become disconnectable after deployment succeeds');
                const addressTools = page.locator('[data-site-address-tools]:has([data-site-domain-disconnect="site-smoke-1"])');
                const addressToolsToggle = addressTools.locator('[data-site-address-tools-toggle]');
                const domainAddressRow = page.locator('.site-hosting-address-row').nth(1);
                assert.equal(await domainAddressRow.locator('.site-hosting-address-value').isVisible(), true);
                assert.equal(await domainAddressRow.evaluate((row) => [...row.children].map((child) => child.classList.contains('site-hosting-address-label') ? 'label' : 'tools').join(',')), 'label,tools');
                const closedAddressGap = await domainAddressRow.evaluate((row) => {
                    const address = row.querySelector('.site-hosting-address-value').getBoundingClientRect();
                    const toggle = row.querySelector('[data-site-address-tools-toggle]').getBoundingClientRect();
                    return toggle.left - address.right;
                });
                assert.ok(closedAddressGap >= 0 && closedAddressGap <= 12, `domain should sit beside the disclosure control, gap=${closedAddressGap}`);
                assert.equal(await page.locator('.site-hosting-address-row').first().textContent().then((text) => text.includes('bg-site-smoke-1.example.workers.dev')), false);
                await addressToolsToggle.click();
                assert.equal(await addressToolsToggle.getAttribute('aria-expanded'), 'true');
                await page.waitForTimeout(300);
                assert.equal(await domainAddressRow.locator('.site-hosting-address-value').isVisible(), true);
                assert.equal(await addressTools.locator('.site-hosting-address-actions button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')).join(',')), '도메인 연결 해지,연결 도메인 복사,연결 도메인 열기');
                const expandedAddressOrder = await domainAddressRow.evaluate((row) => {
                    const bounds = (element) => element.getBoundingClientRect();
                    return [
                        bounds(row.querySelector('.site-hosting-address-value')).right,
                        bounds(row.querySelector('[data-site-domain-disconnect]')).left,
                        bounds(row.querySelector('[data-site-copy-address][data-address-type="domain"]')).left,
                        bounds(row.querySelector('[data-site-open-address][data-address-type="domain"]')).left,
                        bounds(row.querySelector('[data-site-address-tools-toggle]')).left
                    ];
                });
                assert.ok(expandedAddressOrder.every((edge, index) => index === 0 || expandedAddressOrder[index - 1] <= edge),
                    `address actions should follow address before the right-side disclosure: ${expandedAddressOrder.join(',')}`);
                assert.equal(await addressTools.locator('[data-site-open-address][data-address-type="domain"], [data-site-copy-address][data-address-type="domain"], [data-site-domain-disconnect]').count(), 3);
                await page.locator('.site-hosting-site-heading').first().click();
                assert.equal(await addressToolsToggle.getAttribute('aria-expanded'), 'false');
                await addressToolsToggle.hover();
                await page.waitForFunction(() => document.querySelector('[data-site-address-tools] [data-site-address-tools-toggle][aria-expanded="true"]'));
                await page.locator('.site-hosting-site-heading').first().hover();
                await page.waitForFunction(() => !document.querySelector('[data-site-address-tools] [data-site-address-tools-toggle][aria-expanded="true"]'));
                await addressToolsToggle.hover();
                const disconnectButton = page.locator('[data-site-domain-disconnect="site-smoke-1"]');
                await disconnectButton.waitFor({ state: 'visible' });
                await disconnectButton.hover();
                await page.locator('#site-hosting-action-tooltip').waitFor({ state: 'visible' });
                assert.equal(await page.locator('#site-hosting-action-tooltip').textContent(), '도메인 연결 해지');
                assert.equal(await page.locator('[data-site-worker-disconnect="site-smoke-1"]').isDisabled(), true,
                    'custom domain binding must block Worker disconnect');
                await disconnectButton.click();
                await page.waitForFunction(() => window.__domainDisconnectConfirmCalls?.length === 1);
                assert.match(await page.evaluate(() => window.__domainDisconnectConfirmCalls[0].message), /blog\.example\.com/);
                assert.match(await page.evaluate(() => window.__domainDisconnectConfirmCalls[0].message), /기본 주소와 Worker는 유지됩니다/);
                await page.waitForFunction(() => !document.querySelector('[data-site-domain-disconnect="site-smoke-1"]'));
                assert.deepEqual(requests.find((request) => request.method === 'POST'
                    && request.pathname.endsWith('/sites/site-smoke-1/custom-domain-disconnect'))?.body, { confirmed: true });
                assert.equal(await page.locator('[data-site-open-address="site-smoke-1"][data-address-type="worker"]').count(), 1);
                await page.waitForFunction(() => !document.querySelector('[data-site-domain-disconnect="site-smoke-1"]'));
                const readyWorkerDisconnect = page.locator('[data-site-worker-disconnect="site-smoke-1"]');
                assert.equal(await readyWorkerDisconnect.isDisabled(), false, 'verified Worker can be disconnected after domain removal');
                await page.locator('[data-site-address-tools]:has([data-site-worker-disconnect="site-smoke-1"]) [data-site-address-tools-toggle]').click();
                await readyWorkerDisconnect.waitFor({ state: 'visible' });
                await readyWorkerDisconnect.click();
                await page.waitForFunction(() => window.__domainDisconnectConfirmCalls?.length === 2);
                assert.match(await page.evaluate(() => window.__domainDisconnectConfirmCalls[1].message), /로컬 사이트 파일과 설정은 유지됩니다/);
                await page.waitForFunction(() => document.querySelector('[data-site-worker-disconnect="site-smoke-1"]')?.disabled === true);
                assert.deepEqual(requests.find((request) => request.method === 'POST'
                    && request.pathname.endsWith('/sites/site-smoke-1/worker-disconnect'))?.body, { confirmed: true });
                await page.locator('.site-hosting-site-more summary').click();
                const deletionPlanResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/sites/site-smoke-1/delete-plan'));
                await page.locator('[data-site-delete="site-smoke-1"]').click();
                await deletionPlanResponse;
                await page.getByRole('heading', { name: '사이트를 보관했습니다' }).waitFor();
                assert.deepEqual(requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/sites/site-smoke-1/delete'))?.body,
                    { confirmed: true, plan_id: 'site-delete-plan-smoke' });
                assert.match(await page.locator('#ui-dialog-message').textContent(), /site-hosting\/archive\/site-smoke-1/);
                await page.locator('#ui-dialog-confirm').click();
                await page.waitForFunction(() => !document.querySelector('[data-site-settings="site-smoke-1"]'));
            }
        }
        await page.evaluate(() => { showUiConfirm = window.__settingsNextSmokeConfirm; });

        assert.equal(
            await page.locator('.nav-btn[data-view="blog-next"] .nav-label').evaluate((element) => element.childNodes[0]?.textContent?.trim()),
            '블로그'
        );
        assert.equal(await page.locator('.nav-btn[data-view="blog-next"] .nav-new-badge').count(), 0);
        assert.equal(await page.locator('.nav-btn[data-view="card-news"] .nav-new-badge').count(), 0);
        reportSmokePhase('Checking Card News shell, source selection, and layout');
        await page.locator('.nav-btn[data-view="card-news"]').click();
        const cardNewsCreateHeaderLayout = await page.evaluate(() => {
            const view = document.getElementById('view-card-news').getBoundingClientRect();
            const topMenu = document.querySelector('.card-news-workspace-tabs').getBoundingClientRect();
            const sourceCard = document.querySelector('.card-news-source-card').getBoundingClientRect();
            const sourceMenu = document.querySelector('.card-news-source-tabs').getBoundingClientRect();
            const sourceHeadingElement = document.querySelector('.card-news-source-card .card-news-section-heading');
            const sourceHeading = sourceHeadingElement.getBoundingClientRect();
            const sourceTitle = sourceHeadingElement.querySelector('h2');
            const sourceCardStyle = getComputedStyle(document.querySelector('.card-news-source-card'));
            const rootStyle = getComputedStyle(document.documentElement);
            return {
                topUsesSharedPattern: document.querySelector('.card-news-workspace-tabs').classList.contains('ui-top-tabs'),
                topFillsView: Math.abs(view.width - topMenu.width) < 2,
                sourceUsesSharedPattern: document.querySelector('.card-news-source-tabs').classList.contains('ui-segmented-tabs'),
                sourceFitsContent: sourceMenu.width < sourceCard.width,
                stageUsesInlineRow: getComputedStyle(document.querySelector('.card-news-source-card .ui-workflow-title-row')).alignItems === 'baseline',
                legacyEyebrowCount: document.querySelectorAll('#view-card-news .card-news-eyebrow').length,
                panelUsesSharedInset: sourceCardStyle.paddingTop === rootStyle.getPropertyValue('--ui-space-5').trim(),
                titleStartsOnPanelBaseline: getComputedStyle(sourceTitle).marginTop === '0px',
                headingToMenuGap: sourceMenu.top - sourceHeading.bottom
            };
        });
        assert.deepEqual(cardNewsCreateHeaderLayout, {
            topUsesSharedPattern: true,
            topFillsView: true,
            sourceUsesSharedPattern: true,
            sourceFitsContent: true,
            stageUsesInlineRow: true,
            legacyEyebrowCount: 0,
            panelUsesSharedInset: true,
            titleStartsOnPanelBaseline: true,
            headingToMenuGap: 20
        });
        await page.waitForFunction(() => !cardNewsViewState.loadingSources);
        await page.evaluate(() => {
            renderCardNewsArticles({
                configured_sources: ['naver'],
                feed_sources: [{ source_platform: 'naver', label: '네이버' }],
                articles: [{
                    kind: 'feed_item',
                    item_key: 'existing-source',
                    title: '기존 카드뉴스 원문',
                    source_platform: 'naver',
                    management: {
                        generation_id: 'generation-existing',
                        status: '발행 대기',
                        status_key: 'ready_to_publish',
                        status_tone: 'pending'
                    }
                }]
            });
            cardNewsViewState.previewCache.set('feed:existing-source', {
                source: { kind: 'feed_item', item_key: 'existing-source', source_platform: 'naver' },
                title: '기존 카드뉴스 원문',
                text: '기존 카드뉴스 원문의 미리보기 본문',
                excerpt: '기존 카드뉴스 원문의 미리보기 본문',
                retrieved_at: '2026-09-10T00:00:00.000Z'
            });
            cardNewsViewState.managedItems = [{
                generation_id: 'generation-existing',
                title: '기존 카드뉴스 원문',
                source_platform: 'naver',
                status: '발행 대기',
                status_key: 'ready_to_publish',
                status_tone: 'pending',
                action_label: '결과 보기',
                card_count: 3,
                image_count: 3,
                local_available: true,
                channels: ['Threads'],
                post_links: ['https://threads.net/post/existing']
            }];
            renderCardNewsManagedItems();
        });
        assert.deepEqual(await page.evaluate(() => ({
            newCount: document.getElementById('card-news-create-count')?.textContent,
            managedCount: document.getElementById('card-news-managed-count')?.textContent,
            statusCounts: Object.fromEntries([...document.querySelectorAll('[data-card-news-managed-count-for]')].map((badge) => [badge.dataset.cardNewsManagedCountFor, badge.textContent])),
            generatedSourceRows: document.querySelectorAll('.card-news-feed-item').length
        })), {
            newCount: '0',
            managedCount: '1',
            statusCounts: { '전체': '1', '작업 중': '0', '발행 대기': '1', '발행 완료': '0', '확인 필요': '0' },
            generatedSourceRows: 0
        });
        await page.evaluate(() => renderCardNewsArticles({
            configured_sources: ['naver'],
            feed_sources: [{ source_platform: 'naver', label: '네이버' }],
            articles: [{
                kind: 'feed_item', item_key: 'existing-source', title: '기존 카드뉴스 원문',
                source_platform: 'naver'
            }]
        }));
        assert.deepEqual(await page.evaluate(() => ({
            feedStatus: document.querySelector('.card-news-feed-item .ui-status-badge')?.textContent,
            managedStatus: document.querySelector('.card-news-managed-status')?.textContent,
            feedState: document.querySelector('.card-news-feed-item .ui-status-badge')?.dataset.state,
            managedState: document.querySelector('.card-news-managed-status')?.dataset.state,
            managedSelectable: document.querySelector('[data-card-news-open-generation]')?.getAttribute('role'),
            managedHasNestedButton: Boolean(document.querySelector('[data-card-news-open-generation] button')),
            feedRowHeight: getComputedStyle(document.querySelector('.card-news-feed-item')).height,
            managedRowHeight: getComputedStyle(document.querySelector('.card-news-managed-item')).height,
            feedStatusArea: getComputedStyle(document.querySelector('.card-news-feed-item .card-news-entry-status')).gridArea,
            managedStatusArea: getComputedStyle(document.querySelector('.card-news-managed-item .card-news-entry-status')).gridArea,
            managedRowLinkCount: document.querySelectorAll('.card-news-managed-item a').length
        })), {
            feedStatus: undefined,
            managedStatus: '발행 대기',
            feedState: undefined,
            managedState: 'pending',
            managedSelectable: 'button',
            managedHasNestedButton: false,
            feedRowHeight: '76px',
            managedRowHeight: '76px',
            feedStatusArea: 'status',
            managedStatusArea: 'status',
            managedRowLinkCount: 0
        });
        assert.equal(await page.locator('[data-card-news-article-index="0"]').evaluate((element) => element.classList.contains('card-news-entry-item')), true);
        assert.equal(await page.locator('[data-card-news-open-generation]').evaluate((element) => element.classList.contains('card-news-entry-item')), true);
        await page.locator('[data-card-news-article-index="0"]').click();
        assert.equal(await page.locator('#card-news-preview-heading').textContent(), '기존 카드뉴스 원문');
        assert.equal(await page.locator('#card-news-preview-badge').textContent(), '확인 완료');
        await page.evaluate(() => refreshCardNewsSourcesAfterGeneration({
            id: 'generation-new-version', title: '새 카드뉴스 버전', status: 'prompt_ready', cards: [{}]
        }));
        assert.deepEqual(await page.evaluate(() => ({
            newCount: document.getElementById('card-news-create-count')?.textContent,
            managedCount: document.getElementById('card-news-managed-count')?.textContent,
            statusCounts: Object.fromEntries([...document.querySelectorAll('[data-card-news-managed-count-for]')].map((badge) => [badge.dataset.cardNewsManagedCountFor, badge.textContent])),
            remainingSourceRows: document.querySelectorAll('.card-news-feed-item').length
        })), {
            newCount: '0',
            managedCount: '2',
            statusCounts: { '전체': '2', '작업 중': '1', '발행 대기': '1', '발행 완료': '0', '확인 필요': '0' },
            remainingSourceRows: 0
        });
        const restoredGeneration = {
            id: 'generation-existing',
            project_id: 'project-existing',
            title: '복원된 카드뉴스 결과',
            image_mode: 'prompt_only',
            status: 'prompt_ready',
            settings: { aspect_ratio: '9:16' },
            cards: [{ index: 1, headline: '복원 카드', body: '복원 본문', image_prompt: '복원 프롬프트', image_url: '', download_url: '' }]
        };
        await page.route('**/api/v1/card-news/generations/generation-existing', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        generation: restoredGeneration,
                        source_snapshot: {
                            source: { kind: 'url', canonical_url: 'https://example.com/stored-source' },
                            title: '프로젝트에 보존된 원문',
                            text: '프로젝트에 보존된 원문 본문',
                            excerpt: '프로젝트에 보존된 원문 본문',
                            canonical_url: 'https://example.com/stored-source',
                            retrieved_at: '2026-09-10T00:00:00.000Z'
                        }
                    }
                })
            });
        });
        await page.evaluate(() => {
            cardNewsViewState.managedLoading = true;
            activateCardNewsWorkspace('managed');
            cardNewsViewState.managedLoading = false;
        });
        await page.locator('[data-card-news-open-generation="generation-existing"]').click();
        await page.waitForFunction(() => document.getElementById('card-news-managed-source-title')?.textContent === '프로젝트에 보존된 원문');
        assert.equal(await page.locator('#card-news-workspace-tab-managed').getAttribute('aria-selected'), 'true');
        const managedCardNewsLayout = await page.evaluate((createHeadingToMenuGap) => {
            const layout = document.querySelector('#card-news-managed-workspace .card-news-layout');
            const listCard = document.querySelector('.card-news-managed-list-card');
            const previewCard = document.getElementById('card-news-managed-source');
            const heading = listCard.querySelector('.card-news-section-heading').getBoundingClientRect();
            const filters = listCard.querySelector('.card-news-managed-filters').getBoundingClientRect();
            const columns = getComputedStyle(layout).gridTemplateColumns.split(' ').filter(Boolean);
            const listBox = listCard.getBoundingClientRect();
            const previewBox = previewCard.getBoundingClientRect();
            return {
                columnCount: columns.length,
                alignedTop: Math.abs(listBox.top - previewBox.top) < 2,
                previewOnRight: previewBox.left > listBox.left,
                filterFitsContent: filters.width < listBox.width,
                headingGapMatchesCreate: Math.abs((filters.top - heading.bottom) - createHeadingToMenuGap) < 2
            };
        }, cardNewsCreateHeaderLayout.headingToMenuGap);
        assert.deepEqual(managedCardNewsLayout, {
            columnCount: 2,
            alignedTop: true,
            previewOnRight: true,
            filterFitsContent: true,
            headingGapMatchesCreate: true
        });
        await page.route('**/api/v1/card-news/zip/preview', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        title: '가져올 카드뉴스',
                        source_url: 'https://example.com/import-source',
                        card_count: 1,
                        images: [{ index: 1, file_name: '01.png', data_url: 'data:image/png;base64,iVBORw0KGgo=' }]
                    }
                })
            });
        });
        await page.locator('#card-news-zip-file').setInputFiles({
            name: 'import.zip',
            mimeType: 'application/zip',
            buffer: Buffer.from('browser-smoke-zip')
        });
        await page.waitForFunction(() => document.getElementById('card-news-zip-dialog')?.open === true);
        assert.deepEqual(await page.evaluate(() => ({
            title: document.getElementById('card-news-zip-name')?.value,
            status: document.getElementById('card-news-zip-status')?.textContent,
            previewCount: document.querySelectorAll('.card-news-zip-preview-item').length,
            hasDuplicateClose: Boolean(document.getElementById('card-news-zip-close')),
            modalShell: document.getElementById('card-news-zip-dialog')?.classList.contains('ui-transaction-dialog')
        })), {
            title: '가져올 카드뉴스',
            status: '1장의 이미지를 파일명 순서대로 가져옵니다.',
            previewCount: 1,
            hasDuplicateClose: false,
            modalShell: true
        });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('card-news-zip-dialog')?.open === false);
        assert.deepEqual(await page.evaluate(() => ({
            pending: cardNewsViewState.zipImport,
            fileValue: document.getElementById('card-news-zip-file')?.value,
            previewCount: document.querySelectorAll('.card-news-zip-preview-item').length
        })), { pending: null, fileValue: '', previewCount: 0 });
        await page.unroute('**/api/v1/card-news/zip/preview');
        assert.equal(await page.locator('#card-news-managed-source-kind').textContent().then((text) => text.includes('웹 URL')), true);
        assert.equal(await page.locator('#card-news-managed-source-meta').textContent().then((text) => text.includes('저장')), true);
        assert.equal(await page.locator('#card-news-managed-source-link').isVisible(), true);
        assert.equal(await page.locator('#card-news-managed-source-links a').textContent(), 'Threads 열기 ↗');
        assert.equal(await page.locator('#card-news-result-title').textContent(), '복원된 카드뉴스 결과');
        assert.equal(await page.evaluate(() => cardNewsViewState.projectId), 'project-existing');
        assert.equal(await page.locator('#card-news-new-version').isVisible(), true);
        await page.evaluate(() => activateCardNewsWorkspace('create'));
        assert.equal(await page.locator('#card-news-preview-heading').textContent(), '기존 카드뉴스 원문');
        assert.equal(await page.locator('#card-news-result-panel').isHidden(), true);
        await page.evaluate(() => {
            cardNewsViewState.managedLoading = true;
            activateCardNewsWorkspace('managed');
            cardNewsViewState.managedLoading = false;
        });
        assert.equal(await page.locator('#card-news-managed-source-title').textContent(), '프로젝트에 보존된 원문');
        assert.equal(await page.locator('#card-news-result-title').textContent(), '복원된 카드뉴스 결과');
        await page.locator('#card-news-new-version').click();
        assert.equal(await page.locator('#card-news-workspace-tab-create').getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('#card-news-preview-heading').textContent(), '프로젝트에 보존된 원문');
        assert.deepEqual(await page.evaluate(() => ({
            projectId: cardNewsViewState.projectId,
            previewMatches: cardNewsPreviewMatchesCurrentSource(),
            oldResultHidden: document.getElementById('card-news-result-panel')?.hidden
        })), { projectId: '', previewMatches: true, oldResultHidden: true });
        await page.evaluate(() => {
            cardNewsViewState.managedLoading = true;
            activateCardNewsWorkspace('managed');
            cardNewsViewState.managedLoading = false;
        });
        await page.locator('[data-card-news-open-generation="generation-existing"]').click();
        await page.waitForFunction(() => cardNewsViewState.projectId === 'project-existing');
        await page.unroute('**/api/v1/card-news/generations/generation-existing');

        await page.route('**/api/v1/card-news/generations/generation-old', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        generation: { ...restoredGeneration, id: 'generation-old', project_id: '', title: '이전 카드뉴스 결과' },
                        source_snapshot: null
                    }
                })
            });
        });
        await page.evaluate(() => openManagedCardNewsGeneration('generation-old'));
        await page.waitForFunction(() => document.getElementById('card-news-result-title')?.textContent === '이전 카드뉴스 결과');
        assert.equal(await page.locator('#card-news-managed-source-content').isHidden(), true);
        assert.equal((await page.locator('#card-news-managed-source-empty').textContent()).trim(), '');
        assert.equal(await page.locator('#card-news-managed-source-badge').isHidden(), true);
        assert.equal(await page.locator('.card-news-managed-error').count(), 0);
        await page.unroute('**/api/v1/card-news/generations/generation-old');
        await page.locator('#card-news-generation-panel').evaluate((element) => { element.hidden = false; });
        await page.waitForFunction(() => !cardNewsViewState.imageModelChoiceLoading && Boolean(cardNewsViewState.imageModels));
        assert.equal(await page.locator('#card-news-image-model-control').evaluate((element) => element.parentElement?.id), 'card-news-generation-image-model-slot');
        assert.equal(await page.locator('#card-news-image-model-control-result').evaluate((element) => element.parentElement?.id), 'card-news-result-image-model-slot');
        assert.equal(await page.locator('#card-news-image-model-control').getAttribute('open'), null);
        assert.match(await page.locator('#card-news-image-model-summary').textContent(), /기본/);
        await page.evaluate(() => {
            const panel = document.getElementById('card-news-result-panel');
            panel.hidden = true;
            syncCardNewsImageModelControlLocation();
        });
        assert.equal(await page.locator('#card-news-image-model-control').evaluate((element) => element.parentElement?.id), 'card-news-generation-image-model-slot');
        assert.equal(await page.locator('#card-news-image-model-control-result').evaluate((element) => element.parentElement?.id), 'card-news-result-image-model-slot');
        await page.evaluate(() => {
            const panel = document.getElementById('card-news-result-panel');
            panel.hidden = false;
            syncCardNewsImageModelControlLocation();
        });
        const resultActionColumns = await page.evaluate(() => {
            const modelSlot = document.getElementById('card-news-result-image-model-slot').getBoundingClientRect();
            const model = document.getElementById('card-news-image-model-control-result').getBoundingClientRect();
            const buttons = document.querySelector('.card-news-result-button-group').getBoundingClientRect();
            const actionGrid = document.querySelector('.card-news-result-actions').getBoundingClientRect();
            const spacer = document.querySelector('.card-news-result-header-spacer').getBoundingClientRect();
            const signature = document.querySelector('.card-news-result-actions .card-news-signature-field').getBoundingClientRect();
            const generationSlot = document.getElementById('card-news-generation-image-model-slot').getBoundingClientRect();
            const generationModel = document.getElementById('card-news-image-model-control').getBoundingClientRect();
            const generationButtons = document.querySelector('.card-news-generation-buttons').getBoundingClientRect();
            const generationActions = document.querySelector('.card-news-generation-actions').getBoundingClientRect();
            return {
                modelLeft: model.left, modelSlotLeft: modelSlot.left, buttonsRight: buttons.right, actionGridRight: actionGrid.right,
                signatureLeft: signature.left, signatureWidth: signature.width,
                signatureTop: signature.top, spacerTop: spacer.top, modelTop: model.top, buttonsTop: buttons.top,
                generationModelLeft: generationModel.left, generationSlotLeft: generationSlot.left,
                generationButtonsRight: generationButtons.right, generationActionsRight: generationActions.right
            };
        });
        assert.ok(Math.abs(resultActionColumns.modelLeft - resultActionColumns.modelSlotLeft) < 2);
        assert.ok(Math.abs(resultActionColumns.buttonsRight - resultActionColumns.actionGridRight) < 2);
        assert.ok(Math.abs(resultActionColumns.signatureLeft - resultActionColumns.modelLeft) < 2);
        assert.ok(resultActionColumns.signatureWidth <= 362);
        assert.ok(Math.abs(resultActionColumns.signatureTop - resultActionColumns.spacerTop) < 2);
        assert.ok(resultActionColumns.modelTop > resultActionColumns.signatureTop);
        assert.ok(Math.abs(resultActionColumns.modelTop - resultActionColumns.buttonsTop) < 2);
        assert.ok(Math.abs(resultActionColumns.generationModelLeft - resultActionColumns.generationSlotLeft) < 2);
        assert.ok(Math.abs(resultActionColumns.generationButtonsRight - resultActionColumns.generationActionsRight) < 2);
        await page.locator('#card-news-image-model-control-result > summary').click();
        await page.locator('#card-news-result-title').click();
        assert.equal(await page.locator('#card-news-image-model-control-result').evaluate((element) => element.open), false);
        await page.locator('#card-news-image-model-control-result > summary').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#card-news-image-model-control-result').evaluate((element) => element.open), false);
        await page.locator('#card-news-image-model-control-result > summary').click();
        const resultModelOverlay = await page.evaluate(() => {
            const control = document.getElementById('card-news-image-model-control-result').getBoundingClientRect();
            const summary = document.querySelector('#card-news-image-model-control-result > summary').getBoundingClientRect();
            const fields = document.querySelector('#card-news-image-model-control-result .card-news-image-model-fields').getBoundingClientRect();
            return { controlHeight: control.height, summaryHeight: summary.height, fieldsTop: fields.top, summaryTop: summary.top };
        });
        assert.ok(Math.abs(resultModelOverlay.controlHeight - resultModelOverlay.summaryHeight) < 1);
        assert.ok(resultModelOverlay.fieldsTop < resultModelOverlay.summaryTop);
        assert.ok(await page.locator('#card-news-bulk-image-action').evaluate((button) => button.getBoundingClientRect().height < 60));
        assert.deepEqual(
            await page.locator('#card-news-image-provider-select-result option').evaluateAll((options) => options.map((option) => option.value)),
            ['', 'google', 'openai', 'kie']
        );
        await page.locator('#card-news-image-provider-select-result').selectOption('google');
        assert.equal(await page.locator('#card-news-image-model-select-result').inputValue(), 'gemini-3.1-flash-image');
        assert.equal(await page.locator('#card-news-image-provider-select').inputValue(), 'google');
        assert.equal(await page.locator('#card-news-image-model-select').inputValue(), 'gemini-3.1-flash-image');
        await page.locator('#card-news-image-provider-select-result').selectOption('openai');
        await page.locator('#card-news-image-model-select-result').selectOption('gpt-image-1');
        assert.equal(await page.locator('#card-news-image-provider-select').inputValue(), 'openai');
        assert.equal(await page.locator('#card-news-image-model-select').inputValue(), 'gpt-image-1');
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('bloggenius.cardNews.imageModelSelection'))), {
            provider: 'openai', code: 'gpt-image-1'
        });
        assert.equal(await page.locator('#card-news-image-provider-select').inputValue(), 'openai');
        const cardNewsGenerationLayout = await page.evaluate(() => {
            const fieldGrid = document.querySelector('.card-news-generation-field-grid');
            const request = document.getElementById('card-news-additional-request');
            const choice = document.querySelector('.card-news-text-option');
            const fieldColumns = getComputedStyle(fieldGrid).gridTemplateColumns.split(' ').filter(Boolean);
            const requestBox = request.getBoundingClientRect();
            const choiceBox = choice.getBoundingClientRect();
            return {
                fieldColumnCount: fieldColumns.length,
                requestToChoiceRatio: requestBox.width / choiceBox.width,
                sameRow: Math.abs(requestBox.bottom - choiceBox.bottom) < 2
            };
        });
        assert.equal(cardNewsGenerationLayout.fieldColumnCount, 3);
        assert.ok(cardNewsGenerationLayout.requestToChoiceRatio > 1.8 && cardNewsGenerationLayout.requestToChoiceRatio < 2.2);
        assert.equal(cardNewsGenerationLayout.sameRow, true);
        const legacyKoreanPreference = await page.evaluate(() => {
            const key = 'bloggenius.cardNews.generationSettings';
            localStorage.setItem(key, JSON.stringify({ include_korean_text: true }));
            restoreCardNewsGenerationSettings();
            const previouslyIncluded = {
                checked: document.getElementById('card-news-exclude-korean-text').checked,
                includeKoreanText: readCardNewsGenerationSettings().include_korean_text
            };
            localStorage.setItem(key, JSON.stringify({ include_korean_text: false }));
            restoreCardNewsGenerationSettings();
            const previouslyExcluded = {
                checked: document.getElementById('card-news-exclude-korean-text').checked,
                includeKoreanText: readCardNewsGenerationSettings().include_korean_text
            };
            localStorage.removeItem(key);
            restoreCardNewsGenerationSettings();
            return { previouslyIncluded, previouslyExcluded };
        });
        assert.deepEqual(legacyKoreanPreference, {
            previouslyIncluded: { checked: false, includeKoreanText: true },
            previouslyExcluded: { checked: true, includeKoreanText: false }
        });
        await page.locator('#card-news-exclude-korean-text').uncheck();
        assert.equal(await page.evaluate(() => readCardNewsGenerationSettings().include_korean_text), true);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bloggenius.cardNews.generationSettings')).include_korean_text), true);
        await page.locator('#card-news-exclude-korean-text').check();
        assert.equal(await page.evaluate(() => readCardNewsGenerationSettings().include_korean_text), false);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bloggenius.cardNews.generationSettings')).include_korean_text), false);
        await page.evaluate(() => {
            renderCardNewsGeneration({
                id: 'ui-smoke-prompt-result',
                title: 'UI smoke 카드뉴스',
                image_mode: 'prompt_only',
                status: 'prompt_ready',
                settings: { aspect_ratio: '9:16' },
                cards: [1, 2, 3].map((index) => ({
                    index,
                    headline: `${index}번째 카드`,
                    body: '결과 카드의 정보 위계와 동작을 확인합니다.',
                    image_prompt: `card ${index} prompt`
                }))
            }, { scroll: false });
        });
        const cardNewsPromptResult = await page.evaluate(() => {
            const cards = [...document.querySelectorAll('.card-news-result-item')];
            const firstAction = cards[0]?.querySelector('[data-card-news-image-action]');
            const localPicker = cards[0]?.querySelector('[data-card-news-local-picker]');
            const promptCopy = cards[0]?.querySelector('[data-card-news-prompt-copy]');
            const bulkAction = document.getElementById('card-news-bulk-image-action');
            const headingCopy = document.querySelector('.card-news-result-heading > div:first-child')?.getBoundingClientRect();
            const headingActions = document.querySelector('.card-news-result-actions')?.getBoundingClientRect();
            return {
                cardCount: cards.length,
                columnCount: getComputedStyle(document.getElementById('card-news-result-grid')).gridTemplateColumns.split(' ').filter(Boolean).length,
                firstActionPrimary: firstAction?.classList.contains('primary'),
                localPickerText: localPicker?.textContent.trim(),
                localPickerLabel: localPicker?.getAttribute('aria-label'),
                localPickerSecondary: localPicker?.classList.contains('secondary'),
                promptCopyTextAction: promptCopy?.classList.contains('ui-text-action'),
                promptCopyLabel: promptCopy?.textContent.trim(),
                promptDisclosureLabel: cards[0]?.querySelector('.card-news-prompt-details summary')?.textContent.trim(),
                bulkPrimary: bulkAction?.classList.contains('primary'),
                sequenceBadgeCount: document.querySelectorAll('.card-news-result-item .ui-sequence-badge').length,
                imageActionsInsideMedia: Boolean(cards[0]?.querySelector('.card-news-result-image-wrap .card-news-media-actions [data-card-news-image-action]')),
                promptActionsOutsideMedia: Boolean(cards[0]?.querySelector('.card-news-result-copy [data-card-news-prompt-copy]')),
                headingActionsBelow: Boolean(headingCopy && headingActions && headingActions.top > headingCopy.bottom)
            };
        });
        assert.equal(cardNewsPromptResult.cardCount, 3);
        assert.equal(cardNewsPromptResult.columnCount, 3);
        assert.equal(cardNewsPromptResult.firstActionPrimary, true);
        assert.equal(cardNewsPromptResult.localPickerText, '＋');
        assert.equal(cardNewsPromptResult.localPickerLabel, '내 이미지에서 선택');
        assert.equal(cardNewsPromptResult.localPickerSecondary, true);
        assert.equal(cardNewsPromptResult.promptCopyTextAction, true);
        assert.equal(cardNewsPromptResult.promptCopyLabel, '복사');
        assert.equal(cardNewsPromptResult.promptDisclosureLabel, '프롬프트 보기');
        assert.equal(cardNewsPromptResult.bulkPrimary, true);
        assert.equal(cardNewsPromptResult.sequenceBadgeCount, 3);
        assert.equal(cardNewsPromptResult.imageActionsInsideMedia, true);
        assert.equal(cardNewsPromptResult.promptActionsOutsideMedia, true);
        assert.equal(cardNewsPromptResult.headingActionsBelow, true);
        const progressImageUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
        let generationReadCount = 0;
        const progressGeneration = (imageCount, currentImageIndex, status = 'generating_images', failedIndex = 0) => ({
            id: 'ui-smoke-progress-result',
            project_id: '',
            title: '점진 표시 UI smoke 카드뉴스',
            image_mode: 'generate',
            status,
            current_image_index: currentImageIndex,
            settings: { aspect_ratio: '1:1' },
            cards: [1, 2, 3].map((index) => ({
                index,
                headline: `${index}번째 점진 카드`,
                body: '텍스트 구성이 먼저 표시됩니다.',
                image_prompt: `progress card ${index} prompt`,
                image_url: index <= imageCount ? progressImageUrl : '',
                download_url: index <= imageCount ? progressImageUrl : '',
                image_status: index <= imageCount ? 'ready' : (index === failedIndex ? 'failed' : 'pending'),
                image_error: index === failedIndex ? '테스트용 이미지 실패' : ''
            }))
        });
        let compositionOperationStarts = 0;
        const cardNewsImageModelSelections = [];
        const compositionOperationPolls = new Map();
        const canceledCompositionOperations = new Set();
        await page.route(/\/api\/v1\/card-news\/composition-operations(?:\/[^/]+(?:\/cancel)?)?$/, async (route) => {
            const request = route.request();
            const pathname = new URL(request.url()).pathname;
            if (request.method() === 'POST' && pathname === '/api/v1/card-news/composition-operations') {
                cardNewsImageModelSelections.push(request.postDataJSON()?.image_model_selection || null);
                compositionOperationStarts += 1;
                const operationId = `ui-smoke-composition-op-${compositionOperationStarts}`;
                compositionOperationPolls.set(operationId, 0);
                await route.fulfill({
                    status: 202,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({ success: true, data: { operationId, state: 'accepted', canCancel: true } })
                });
                return;
            }
            const isCancel = request.method() === 'POST' && pathname.endsWith('/cancel');
            const segments = pathname.split('/');
            const operationId = isCancel ? segments.at(-2) : segments.at(-1);
            if (isCancel) {
                canceledCompositionOperations.add(operationId);
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({ success: true, data: { operationId, state: 'cancel_requested', cancelOutcome: 'requested' } })
                });
                return;
            }
            const pollCount = (compositionOperationPolls.get(operationId) || 0) + 1;
            compositionOperationPolls.set(operationId, pollCount);
            const canceled = canceledCompositionOperations.has(operationId);
            const completed = compositionOperationStarts > 1 && pollCount > 1;
            const generation = { ...progressGeneration(0, 0, 'prompt_ready'), image_mode: 'prompt_only' };
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: {
                    operationId,
                    state: canceled ? 'canceled' : (completed ? 'completed' : 'running'),
                    busy: !canceled && !completed,
                    canCancel: true,
                    ...(completed ? { result: { generation } } : {})
                } })
            });
        });
        await page.route('**/api/v1/card-news/generations', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 250));
            await route.fulfill({
                status: 201,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: { generation: {
                    ...progressGeneration(0, 0, 'prompt_ready'),
                    image_mode: 'prompt_only'
                } } })
            });
        });
        let operationStarts = 0;
        const operationPolls = new Map();
        const canceledOperations = new Set();
        await page.route(/\/api\/v1\/card-news\/image-operations(?:\/[^/]+(?:\/cancel)?)?$/, async (route) => {
            const request = route.request();
            const pathname = new URL(request.url()).pathname;
            if (request.method() === 'POST' && pathname === '/api/v1/card-news/image-operations') {
                cardNewsImageModelSelections.push(request.postDataJSON()?.image_model_selection || null);
                operationStarts += 1;
                const operationId = `ui-smoke-image-op-${operationStarts}`;
                operationPolls.set(operationId, 0);
                await route.fulfill({
                    status: 202,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({ success: true, data: { operationId, state: 'accepted', remoteJobPossible: false } })
                });
                return;
            }
            const isCancel = request.method() === 'POST' && pathname.endsWith('/cancel');
            const segments = pathname.split('/');
            const operationId = isCancel ? segments.at(-2) : segments.at(-1);
            if (isCancel) {
                canceledOperations.add(operationId);
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({ success: true, data: { operationId, state: 'cancel_requested', cancelOutcome: 'requested' } })
                });
                return;
            }
            const pollCount = (operationPolls.get(operationId) || 0) + 1;
            operationPolls.set(operationId, pollCount);
            const generation = operationStarts === 1
                ? progressGeneration(2, 0, 'partial')
                : progressGeneration(2, 0, 'partial', 3);
            const canceled = canceledOperations.has(operationId);
            const completed = operationStarts === 1 && pollCount > 2;
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: {
                    operationId,
                    state: canceled ? 'canceled' : (completed ? 'completed' : 'running'),
                    busy: !canceled && !completed,
                    remoteJobPossible: false,
                    ...(completed ? { result: { generation } } : {})
                } })
            });
        });
        await page.route('**/api/v1/card-news/generations/ui-smoke-progress-result', async (route) => {
            generationReadCount += 1;
            const readyCount = generationReadCount === 1 ? 1 : 2;
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: { generation: progressGeneration(readyCount, readyCount + 1) } })
            });
        });
        await page.evaluate(() => {
            cardNewsViewState.workspace = 'create';
            cardNewsViewState.sourceKind = 'manuscript';
            document.getElementById('card-news-manuscript-title').value = '점진 표시 테스트';
            document.getElementById('card-news-manuscript-text').value = '카드뉴스 점진 표시 회귀 검사 원문입니다.';
            document.getElementById('card-news-slide-count').value = '3';
            cardNewsViewState.preview = {
                source: { kind: 'manuscript' },
                title: '점진 표시 테스트',
                text: '카드뉴스 점진 표시 회귀 검사 원문입니다.'
            };
            cardNewsViewState.previewSourceKey = cardNewsSourceKey(readCardNewsSource());
            updateCardNewsGenerationAvailability();
        });
        reportSmokePhase('Checking Card News composition/image generation and stop controls');
        await page.locator('#card-news-compose-button').click();
        await page.waitForFunction(() => document.getElementById('card-news-compose-button')?.textContent === '중지');
        assert.equal(await page.locator('#card-news-regenerate').isVisible(), true);
        assert.equal(await page.locator('#card-news-regenerate').isDisabled(), true);
        assert.equal(await page.locator('#card-news-bulk-image-action').isVisible(), true);
        assert.equal(await page.locator('#card-news-bulk-image-action').isDisabled(), true);
        assert.equal(await page.locator('#card-news-generation-status').evaluate((status) => status.parentElement?.classList.contains('card-news-result-heading')), true);
        assert.equal(await page.locator('#card-news-generation-status').isVisible(), true);
        assert.equal(await page.locator('#card-news-generation-status').evaluate((status) => status.parentElement?.parentElement?.id === 'card-news-generation-panel'), false);
        await page.locator('#card-news-compose-button').click();
        await page.waitForFunction(() => document.getElementById('card-news-compose-button')?.textContent === '중지 확인');
        assert.equal(await page.locator('[data-card-news-stop-confirmation]').isVisible(), true);
        await page.evaluate(() => setCardNewsGenerationStatus('카드 구성을 만들고 있습니다.', 'loading'));
        assert.equal(await page.locator('[data-card-news-stop-confirmation]').isVisible(), true);
        assert.equal(await page.locator('#card-news-image-continue').isVisible(), true);
        assert.equal(await page.locator('#card-news-image-continue').evaluate((button) => button.previousElementSibling?.id === 'card-news-compose-button'), true);
        const compositionStopLayout = await page.locator('#card-news-image-continue').evaluate((button) => ({
            stopTop: button.previousElementSibling.getBoundingClientRect().top,
            continueTop: button.getBoundingClientRect().top
        }));
        assert.ok(Math.abs(compositionStopLayout.stopTop - compositionStopLayout.continueTop) < 24);
        await page.locator('#card-news-image-continue').click();
        assert.equal(await page.locator('#card-news-image-continue').isVisible(), false);
        assert.equal(await page.locator('#card-news-image-continue').evaluate((button) => button.parentElement?.classList.contains('card-news-result-image-actions')), true);
        await page.locator('#card-news-compose-button').click();
        await page.waitForFunction(() => document.getElementById('card-news-compose-button')?.textContent === '중지 확인');
        await page.locator('#card-news-compose-button').click();
        await page.waitForFunction(() => !cardNewsViewState.generating);
        assert.match(await page.locator('#card-news-generation-status').textContent(), /카드 구성 생성을 중지했습니다/);
        await page.locator('#card-news-generate-button').click();
        await page.waitForFunction(() => document.getElementById('card-news-generate-button')?.textContent === '중지');
        await page.waitForFunction(() => document.querySelectorAll('.card-news-result-item.is-composing').length === 3);
        await page.waitForFunction(() => document.querySelector('.card-news-result-copy > strong')?.textContent === '1번째 점진 카드');
        await page.waitForFunction(() => Boolean(document.querySelector('[data-card-news-result-index="1"] img'))
            && !document.querySelector('[data-card-news-result-index="2"] [data-card-news-image-working]').hidden);
        assert.ok(cardNewsImageModelSelections.some((selection) => selection?.provider === 'openai' && selection?.code === 'gpt-image-1'));
        assert.equal(await page.locator('#card-news-image-model-control').evaluate((element) => element.parentElement?.id), 'card-news-generation-image-model-slot');
        assert.equal(await page.locator('#card-news-image-model-control-result').evaluate((element) => element.parentElement?.id), 'card-news-result-image-model-slot');
        assert.ok(await page.locator('#card-news-bulk-image-action').evaluate((button) => button.getBoundingClientRect().height < 60));
        assert.match(await page.locator('#card-news-image-model-summary').textContent(), /OpenAI.*GPT Image/);
        assert.equal(await page.locator('#card-news-generation-status').textContent().then((text) => /이미지/.test(text)), true);
        await page.waitForFunction(() => document.querySelectorAll('.card-news-result-item img').length === 2);
        await page.waitForFunction(() => !cardNewsViewState.generating);
        assert.equal(await page.locator('#card-news-generation-status').textContent().then((text) => text.includes('부분')), false);
        await page.unroute('**/api/v1/card-news/generations');
        await page.unroute(/\/api\/v1\/card-news\/composition-operations(?:\/[^/]+(?:\/cancel)?)?$/);
        await page.unroute('**/api/v1/card-news/generations/ui-smoke-progress-result');
        generationReadCount = 0;
        operationPolls.clear();
        await page.route('**/api/v1/card-news/generations/ui-smoke-progress-result', async (route) => {
            generationReadCount += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: { generation: progressGeneration(2, 3) } })
            });
        });
        await page.locator('#card-news-bulk-image-action').click();
        await page.waitForFunction(() => !document.querySelector('[data-card-news-result-index="3"] [data-card-news-image-working]').hidden);
        assert.equal(await page.locator('[data-card-news-result-index] [data-card-news-image-working]:not([hidden])').count(), 1);
        assert.equal(await page.locator('.card-news-result-item img').count(), 2);
        await page.locator('#card-news-bulk-image-action').click();
        await page.waitForFunction(() => document.getElementById('card-news-bulk-image-action')?.textContent === '중지 확인');
        assert.equal(await page.locator('[data-card-news-stop-confirmation]').isVisible(), true);
        await page.evaluate(() => setCardNewsGenerationStatus('이미지를 만들고 있습니다. 2/3장 완료', 'loading'));
        assert.equal(await page.locator('[data-card-news-stop-confirmation]').isVisible(), true);
        assert.equal(await page.locator('#card-news-image-continue').isVisible(), true);
        await page.locator('#card-news-image-continue').click();
        assert.equal(await page.locator('#card-news-image-continue').isVisible(), false);
        await page.locator('#card-news-bulk-image-action').click();
        await page.waitForFunction(() => document.getElementById('card-news-bulk-image-action')?.textContent === '중지 확인');
        await page.locator('#card-news-bulk-image-action').click();
        await page.waitForFunction(() => !cardNewsViewState.generating);
        assert.match(await page.locator('#card-news-generation-status').textContent(), /이미지 생성을 중지했습니다/);
        assert.equal(await page.locator('.card-news-result-item img').count(), 2);
        const missingCardAiAction = page.locator('[data-card-news-result-index="3"] [data-card-news-image-action]');
        const missingCardAiActionTop = await missingCardAiAction.evaluate((button) => (
            button.getBoundingClientRect().top - button.closest('.card-news-result-image-wrap').getBoundingClientRect().top
        ));
        await missingCardAiAction.click();
        const singleStop = page.locator('[data-card-news-result-index="3"] [data-card-news-image-stop]');
        await page.waitForFunction(() => {
            const card = document.querySelector('[data-card-news-result-index="3"]');
            return card && !card.querySelector('[data-card-news-image-working]').hidden
                && card.querySelector('.card-news-media-actions')?.classList.contains('is-working');
        });
        assert.equal(await singleStop.isVisible(), true);
        assert.equal(await singleStop.evaluate((button) => button.classList.contains('ghost') && button.classList.contains('ui-danger-action') && !button.classList.contains('primary')), true);
        const singleStopTop = await singleStop.evaluate((button) => (
            button.getBoundingClientRect().top - button.closest('.card-news-result-image-wrap').getBoundingClientRect().top
        ));
        assert.ok(Math.abs(singleStopTop - missingCardAiActionTop) < 24, `single-card stop stays beside the image action position (${singleStopTop} vs ${missingCardAiActionTop})`);
        assert.equal(await singleStop.textContent(), '중지');
        await singleStop.click();
        await page.waitForFunction(() => document.querySelector('[data-card-news-result-index="3"] [data-card-news-image-stop]')?.textContent === '중지 확인');
        const singleContinue = page.locator('[data-card-news-result-index="3"] [data-card-news-image-continue]');
        assert.equal(await singleContinue.isVisible(), true);
        await singleContinue.click();
        assert.equal(await singleContinue.isVisible(), false);
        await singleStop.click();
        await page.waitForFunction(() => document.querySelector('[data-card-news-result-index="3"] [data-card-news-image-stop]')?.textContent === '중지 확인');
        await singleStop.click();
        await page.waitForFunction(() => !cardNewsViewState.generating);
        assert.match(await page.locator('#card-news-generation-status').textContent(), /이미지 생성을 중지했습니다/);
        assert.equal(await page.locator('.card-news-result-item img').count(), 2);
        await page.unroute(/\/api\/v1\/card-news\/image-operations(?:\/[^/]+(?:\/cancel)?)?$/);
        await page.unroute('**/api/v1/card-news/generations/ui-smoke-progress-result');
        await page.route('**/api/v1/card-news/publishing/config?generation_id=*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    success: true,
                    data: {
                        generation_id: 'ui-smoke-complete-result',
                        title: '완성된 UI smoke 카드뉴스',
                        source_url: 'https://example.com/card-news',
                        default_text: '완성된 UI smoke 카드뉴스\n\nhttps://short.example/card-news',
                        card_count: 3,
                        max_channels: 3,
                        buffer_api_key_configured: true,
                        buffer_organization_configured: true,
                        buffer_channels_configured: true,
                        buffer_configured: true,
                        organizations: [{ id: 'card-news-org-1', name: 'Card News Workspace' }],
                        organization_id: 'card-news-org-1',
                        media_transport: 'google_drive',
                        url_shortening_configured: true,
                        channels: [
                            { id: 'instagram-1', name: 'Instagram', service: 'instagram', max_assets: 10, compatible: true },
                            { id: 'bluesky-1', name: 'Bluesky', service: 'bluesky', max_assets: 4, compatible: true },
                            { id: 'pinterest-1', name: 'Pinterest', service: 'pinterest', max_assets: 1, compatible: false, reason: '이미지를 최대 1장까지 지원합니다.' }
                        ]
                    }
                })
            });
        });
        await page.evaluate(() => {
            const imageUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
            renderCardNewsGeneration({
                id: 'ui-smoke-complete-result',
                title: '완성된 UI smoke 카드뉴스',
                image_mode: 'generate',
                status: 'completed',
                settings: { aspect_ratio: '1:1' },
                cards: [1, 2, 3].map((index) => ({
                    index,
                    headline: index === 1 ? '두 줄까지 이어지는 첫 번째 완성 카드 제목을 확인합니다' : `${index}번째 완성 카드`,
                    body: index === 3
                        ? '완성 후 행동 위계를 확인합니다. 내용 길이가 달라도 프롬프트 도구가 같은 하단 위치에 정렬되어야 합니다.'
                        : '완성 후 행동 위계를 확인합니다.',
                    image_prompt: `complete card ${index} prompt`,
                    image_url: imageUrl,
                    download_url: imageUrl
                }))
            }, { scroll: false });
        });
        await page.waitForFunction(() => document.getElementById('card-news-publishing-panel')?.hidden === false);
        assert.deepEqual(await page.evaluate(() => ({
            bulkSecondary: document.getElementById('card-news-bulk-image-action')?.classList.contains('secondary'),
            publishPrimary: document.getElementById('card-news-publish-open')?.classList.contains('primary'),
            publishVisible: !document.getElementById('card-news-publish-open')?.hidden,
            exportSecondary: document.getElementById('card-news-export-all')?.classList.contains('secondary'),
            exportVisible: !document.getElementById('card-news-export-all')?.hidden,
            regenerateSecondary: document.querySelector('[data-card-news-image-action]')?.classList.contains('secondary'),
            regenerateText: document.querySelector('[data-card-news-image-action]')?.textContent.trim(),
            replaceText: document.querySelector('[data-card-news-local-picker]')?.textContent.trim(),
            replaceLabel: document.querySelector('[data-card-news-local-picker]')?.getAttribute('aria-label'),
            downloadText: document.querySelector('.card-news-media-actions [download]')?.textContent.trim(),
            completedActionsInsideMedia: Boolean(document.querySelector('.card-news-result-image-wrap .card-news-media-actions [data-card-news-local-picker]')),
            downloadInsideMedia: Boolean(document.querySelector('.card-news-result-image-wrap .card-news-media-actions [download]')),
            completedActionOpacity: getComputedStyle(document.querySelector('.card-news-result-image-wrap .card-news-media-actions')).opacity
        })), {
            bulkSecondary: true,
            publishPrimary: true,
            publishVisible: true,
            exportSecondary: true,
            exportVisible: true,
            regenerateSecondary: true,
            regenerateText: '이미지 재생성',
            replaceText: '＋',
            replaceLabel: '내 이미지로 교체',
            downloadText: '받기',
            completedActionsInsideMedia: true,
            downloadInsideMedia: true,
            completedActionOpacity: '0'
        });
        const resultActionHeights = await page.locator('.card-news-result-button-group > button, .card-news-result-button-group > a, .card-news-result-image-actions > button').evaluateAll((controls) => controls
            .map((control) => Math.round(control.getBoundingClientRect().height))
            .filter((height) => height > 0));
        assert.ok(resultActionHeights.length >= 3);
        assert.equal(new Set(resultActionHeights).size, 1, `Card News result action heights differ: ${resultActionHeights.join(', ')}`);
        await page.waitForFunction(() => document.querySelectorAll('[data-card-news-publish-channel]').length === 3);
        assert.deepEqual(await page.evaluate(() => {
            const panel = document.getElementById('card-news-publishing-panel');
            const resultPanel = document.getElementById('card-news-result-panel');
            const help = panel.querySelector('.context-help-link[data-help-guide-url]');
            const heading = panel.querySelector('.card-news-publishing-heading');
            const channelHeading = panel.querySelector('.buffer-publishing-channel-heading');
            const channelGrid = document.getElementById('card-news-publishing-channels');
            const workspaceSelect = document.getElementById('card-news-publishing-workspace');
            const workspaceRefresh = document.getElementById('card-news-publishing-workspaces-load');
            const publishButton = document.getElementById('card-news-publish-button');
            const panelBox = panel.getBoundingClientRect();
            const headingBox = heading.getBoundingClientRect();
            const buttonBox = publishButton.getBoundingClientRect();
            return {
                inlineAfterResult: panel.getBoundingClientRect().top >= resultPanel.getBoundingClientRect().bottom,
                contentIsPadded: headingBox.left - panelBox.left >= 20 && headingBox.top - panelBox.top >= 20,
                actionIsPadded: panelBox.right - buttonBox.right >= 20 && panelBox.bottom - buttonBox.bottom >= 20,
                channelLabelGapIsClear: channelGrid.getBoundingClientRect().top - channelHeading.getBoundingClientRect().bottom >= 10,
                workspaceControlsHaveMatchingHeight: Math.abs(workspaceSelect.getBoundingClientRect().height - workspaceRefresh.getBoundingClientRect().height) < 1,
                stepLabel: panel.querySelector('.ui-workflow-stage')?.textContent.trim(),
            channelCount: document.querySelectorAll('.card-news-publishing-channel.ui-selectable-card').length,
            workspaceCount: document.querySelectorAll('#card-news-publishing-workspace option').length,
            workspaceValue: document.getElementById('card-news-publishing-workspace')?.value,
                limit: document.getElementById('card-news-publishing-channel-limit')?.textContent,
                preparedText: document.getElementById('card-news-publishing-text')?.value,
                providerNamed: document.getElementById('card-news-drive-notice')?.textContent.includes('Bitly'),
                externalHelp: help?.dataset.helpGuideUrl?.startsWith('https://'),
                settingsControls: Boolean(document.querySelector('#card-news-buffer-settings, #card-news-google-settings')),
                primaryDisabled: document.getElementById('card-news-publish-button')?.disabled
            };
        }), {
            inlineAfterResult: true,
            contentIsPadded: true,
            actionIsPadded: true,
            channelLabelGapIsClear: true,
            workspaceControlsHaveMatchingHeight: true,
            stepLabel: '3단계',
            channelCount: 3,
            workspaceCount: 2,
            workspaceValue: 'card-news-org-1',
            limit: '최대 3개 · 0개 선택',
            preparedText: '완성된 UI smoke 카드뉴스\n\nhttps://short.example/card-news',
            providerNamed: false,
            externalHelp: true,
            settingsControls: false,
            primaryDisabled: true
        });
        await page.locator('[data-card-news-publish-channel][value="instagram-1"]').check();
        let cardNewsPublishConfirmed = false;
        let managedItemsRequestCount = 0;
        let releaseFirstManagedRequest;
        const firstManagedRequestGate = new Promise((resolve) => { releaseFirstManagedRequest = resolve; });
        await page.route('**/api/v1/card-news/managed', async (route) => {
            managedItemsRequestCount += 1;
            const requestCount = managedItemsRequestCount;
            const confirmedAtRequest = cardNewsPublishConfirmed;
            if (requestCount === 1) await firstManagedRequestGate;
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    success: true,
                    data: {
                        items: [{
                            generation_id: 'ui-smoke-complete-result',
                            title: '완성된 UI smoke 카드뉴스',
                            status: confirmedAtRequest ? '발행 완료' : '발행 대기',
                            status_key: confirmedAtRequest ? 'published' : 'ready_to_publish',
                            status_tone: confirmedAtRequest ? 'ready' : 'pending',
                            action_label: '결과 보기',
                            card_count: 3,
                            image_count: 3,
                            local_available: true,
                            source_platform: 'naver'
                        }]
                    }
                })
            });
        });
        await page.route('**/api/v1/card-news/publishing/publish', async (route) => {
            cardNewsPublishConfirmed = true;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    success: true,
                    data: {
                        success: true,
                        confirmed: true,
                        success_count: 1,
                        failure_count: 0,
                        results: [{
                            success: true,
                            channel_id: 'instagram-1',
                            channel_name: 'Instagram',
                            service: 'instagram',
                            status: 'sent',
                            external_link: 'https://instagram.com/p/ui-smoke'
                        }]
                    }
                })
            });
        });
        const workspaceReloadRequest = page.waitForRequest((request) => request.url().includes('/api/v1/card-news/publishing/config')
            && request.url().includes('organization_id=card-news-org-1'));
        await page.locator('#card-news-publishing-workspaces-load').click();
        await workspaceReloadRequest;
        await page.waitForFunction(() => document.getElementById('card-news-publishing-workspaces-load')?.textContent === '다시 불러오기');
        assert.equal(await page.locator('#card-news-publishing-workspace').inputValue(), 'card-news-org-1');
        assert.equal(await page.locator('[data-card-news-publish-channel][value="instagram-1"]').isChecked(), true);
        await page.locator('[data-card-news-publish-channel][value="instagram-1"]').uncheck();
        if (await page.locator('#card-news-publishing-panel').isHidden()) {
            await page.locator('#card-news-publish-open').click();
        }
        await page.waitForFunction(() => document.getElementById('card-news-publishing-panel')?.hidden === false);
        await page.locator('[data-card-news-publish-channel][value="instagram-1"]').check();
        assert.equal(await page.locator('#card-news-publish-button').isEnabled(), true);
        assert.equal(await page.locator('#card-news-publishing-channel-limit').textContent(), '최대 3개 · 1개 선택');
        await page.locator('#card-news-publishing-select-all').check();
        assert.equal(await page.locator('#card-news-publishing-channel-limit').textContent(), '최대 3개 · 2개 선택');
        assert.equal(await page.locator('#card-news-publishing-select-all').isChecked(), true);
        await page.locator('#card-news-publishing-select-all').uncheck();
        assert.equal(await page.locator('#card-news-publishing-channel-limit').textContent(), '최대 3개 · 0개 선택');
        await page.locator('[data-card-news-publish-channel][value="instagram-1"]').check();
        await page.evaluate(async () => {
            window.ensureCardNewsSignaturePreviewCurrent = async () => true;
            cardNewsViewState.managedDetailOpen = true;
            cardNewsViewState.managedWorkflowContext = { generation: { id: 'ui-smoke-complete-result' } };
            void loadCardNewsManagedItems();
        });
        await page.waitForFunction(() => cardNewsViewState.managedLoading === true);
        assert.equal(managedItemsRequestCount, 1);
        await page.locator('#card-news-publish-button').click();
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => cardNewsViewState.publishing === true);
        assert.deepEqual(await page.evaluate(() => ({
            generateButtonDisabled: document.getElementById('card-news-generate-button')?.disabled,
            cardSettingsDisabled: ['card-news-slide-count', 'card-news-aspect-ratio', 'card-news-style', 'card-news-exclude-korean-text']
                .every((id) => document.getElementById(id)?.disabled),
            imageModelControlsDisabled: [...document.querySelectorAll('[data-card-news-image-model-select], [data-card-news-image-provider-select]')]
                .every((control) => control.disabled),
            signatureDisabled: document.getElementById('card-news-signature-enabled')?.disabled
                && document.getElementById('card-news-signature')?.disabled,
            publishTextDisabled: document.getElementById('card-news-publishing-text')?.disabled,
            publishButtonDisabled: document.getElementById('card-news-publish-button')?.disabled
        })), {
            generateButtonDisabled: true,
            cardSettingsDisabled: true,
            imageModelControlsDisabled: true,
            signatureDisabled: true,
            publishTextDisabled: true,
            publishButtonDisabled: true
        });
        await page.waitForFunction(() => cardNewsViewState.managedReloadRequested === true);
        releaseFirstManagedRequest();
        await page.waitForFunction(() => [...document.querySelectorAll('[data-card-news-managed-count-for]')]
                .find((item) => item.dataset.cardNewsManagedCountFor === '발행 완료')?.textContent === '1');
        assert.equal(managedItemsRequestCount, 2, 'the publish refresh should run again after the stale in-flight request settles');
        assert.deepEqual(await page.evaluate(() => ({
            publishedCount: [...document.querySelectorAll('[data-card-news-managed-count-for]')]
                .find((item) => item.dataset.cardNewsManagedCountFor === '발행 완료')?.textContent,
            itemStatus: document.querySelector('#card-news-managed-list [data-generation-id="ui-smoke-complete-result"] .card-news-managed-status')?.textContent,
            itemSummary: document.querySelector('#card-news-managed-list [data-generation-id="ui-smoke-complete-result"] .card-news-entry-summary')?.textContent,
            publishResult: document.getElementById('card-news-publishing-result')?.textContent.replace(/\s+/g, ''),
            channelCanBeSelectedAgain: !document.querySelector('[data-card-news-publish-channel][value="instagram-1"]')?.disabled,
            channelCheckedAfterPublish: document.querySelector('[data-card-news-publish-channel][value="instagram-1"]')?.checked,
            selectedItemPreserved: document.querySelector('#card-news-managed-list [data-generation-id="ui-smoke-complete-result"]')?.getAttribute('aria-pressed'),
            publishOutcome: cardNewsViewState.publishingOutcome
        })), {
            publishedCount: '1',
            itemStatus: '발행 완료',
            itemSummary: '네이버 · 카드 3장 · 이미지 3장',
            publishResult: 'Instagram발행완료게시물열기↗',
            channelCanBeSelectedAgain: true,
            channelCheckedAfterPublish: false,
            selectedItemPreserved: 'true',
            publishOutcome: 'completed'
        });
        await page.locator('[data-card-news-publish-channel][value="instagram-1"]').check();
        assert.equal(await page.locator('[data-card-news-publish-channel][value="instagram-1"]').isChecked(), true);
        await page.locator('[data-card-news-publish-channel][value="instagram-1"]').uncheck();
        reportSmokePhase('Checking Card News publishing setup and finalization states');
        await page.unroute('**/api/v1/card-news/publishing/config?generation_id=*');
        await page.route('**/api/v1/card-news/publishing/config?generation_id=*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    success: true,
                    data: {
                        generation_id: 'ui-smoke-not-ready',
                        buffer_api_key_configured: true,
                        buffer_organization_configured: false,
                        buffer_channels_configured: false,
                        buffer_configured: false,
                        organizations: [],
                        organization_id: '',
                        media_transport: 'google_drive',
                        channels: []
                    }
                })
            });
        });
        await page.evaluate(async () => {
            cardNewsViewState.generation = { ...cardNewsViewState.generation, id: 'ui-smoke-not-ready' };
            cardNewsViewState.publishingConfig = null;
            await openCardNewsPublishing({ scroll: false });
        });
        assert.deepEqual(await page.evaluate(() => ({
            panelHidden: document.getElementById('card-news-publishing-panel')?.hidden,
            publishButtonHidden: document.getElementById('card-news-publish-open')?.hidden,
            readinessState: document.getElementById('card-news-publishing-readiness')?.dataset.state,
            readinessText: document.getElementById('card-news-publishing-readiness')?.textContent,
            readinessInStatus: document.getElementById('card-news-publishing-readiness')?.closest('#card-news-generation-status') !== null
        })), {
            panelHidden: true,
            publishButtonHidden: true,
            readinessState: 'warning',
            readinessText: 'Buffer 작업 공간을 찾지 못했습니다. 연결 상태를 확인해 주세요.',
            readinessInStatus: true
        });
        await page.unroute('**/api/v1/card-news/publishing/config?generation_id=*');
        await page.locator('.card-news-result-image-wrap').first().hover();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.card-news-result-image-wrap .card-news-media-actions')).opacity === '1');
        assert.deepEqual(await page.evaluate(() => {
            const actionBar = document.querySelector('.card-news-result-image-wrap .card-news-media-actions');
            const actions = [...actionBar.querySelectorAll(':scope > button, :scope > a')];
            const cards = [...document.querySelectorAll('.card-news-result-item')];
            const actionCenters = actions.map((action) => {
                const rect = action.getBoundingClientRect();
                return rect.top + rect.height / 2;
            });
            return {
                opacity: getComputedStyle(actionBar).opacity,
                flexWrap: getComputedStyle(actionBar).flexWrap,
                singleRow: Math.max(...actionCenters) - Math.min(...actionCenters) < 1,
                cardHeightCount: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().height))).size,
                promptBottomCount: new Set(cards.map((card) => Math.round(card.querySelector('.card-news-prompt-section').getBoundingClientRect().bottom))).size
            };
        }), { opacity: '1', flexWrap: 'nowrap', singleRow: true, cardHeightCount: 1, promptBottomCount: 1 });
        await page.locator('#card-news-additional-request').fill('차분한 편집 디자인으로 구성해 주세요.');
        assert.equal(
            await page.evaluate(() => JSON.parse(localStorage.getItem('bloggenius.cardNews.generationSettings') || '{}').additional_request),
            '차분한 편집 디자인으로 구성해 주세요.'
        );
        assert.equal(await page.locator('.nav-btn[data-view="card-news"] .nav-new-badge').count(), 0);
        await page.locator('.nav-btn[data-view="blog-next"]').click();
        await page.waitForFunction(() => document.getElementById('view-blog-next')?.classList.contains('active'));
        assert.equal(await page.locator('#blog-next-panel-quick').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('html').getAttribute('data-style'), 'warm-editorial');
        assert.equal(await page.locator('#view-dashboard-beta').getAttribute('data-style-scope'), null);
        assert.equal(await page.locator('#view-blog-next').getAttribute('data-style-scope'), null);
        const dashboardStyleProbe = async () => page.locator('#view-dashboard-beta .ui-overview-card').first().evaluate((element) => {
            const style = getComputedStyle(element);
            return { borderRadius: style.borderRadius, boxShadow: style.boxShadow };
        });
        const dashboardCountProbe = async () => page.locator('#dashboard-beta-discovery-count').evaluate((element) => {
            const style = getComputedStyle(element);
            return { background: style.backgroundColor, color: style.color };
        });
        const warmDashboardStyle = await dashboardStyleProbe();
        const warmDashboardCount = await dashboardCountProbe();
        await page.locator('html').evaluate((element) => { element.dataset.style = 'quiet-sage-studio'; });
        const quietDashboardStyle = await dashboardStyleProbe();
        const quietDashboardCount = await dashboardCountProbe();
        assert.notEqual(quietDashboardStyle.borderRadius, warmDashboardStyle.borderRadius);
        assert.notEqual(quietDashboardStyle.boxShadow, warmDashboardStyle.boxShadow);
        assert.notDeepEqual(quietDashboardCount, warmDashboardCount);
        await page.locator('html').evaluate((element) => { element.dataset.style = 'autumn-night-library'; });
        assert.deepEqual(
            await page.locator('#view-dashboard-beta .ui-overview-card').first().evaluate((element) => {
                const style = getComputedStyle(element);
                const root = getComputedStyle(document.documentElement);
                return {
                    background: style.backgroundColor,
                    text: style.color,
                    surfaceToken: root.getPropertyValue('--ui-surface').trim(),
                    primaryToken: root.getPropertyValue('--ui-action-primary').trim()
                };
            }),
            {
                background: 'rgb(43, 35, 30)',
                text: 'rgb(241, 230, 213)',
                surfaceToken: '#2b231e',
                primaryToken: '#c97845'
            }
        );
        assert.equal(
            await page.evaluate(() => getSelectableDesignStyles().some((style) => style.id === 'autumn-night-library')),
            true
        );
        assert.equal(
            await page.locator('#quick-discovery-modal .modal-footer').evaluate((element) => getComputedStyle(element).backgroundColor),
            'rgb(53, 43, 36)'
        );
        const newStyleTokens = await page.evaluate(() => {
            const expected = {
                'cerulean-atelier': '#007ba7',
                'amethyst-salon': '#c39bd7',
                techwear: '#78b8ca',
                goblincore: '#586c3e'
            };
            return Object.entries(expected).map(([id, primary]) => {
                document.documentElement.dataset.style = id;
                return {
                    id,
                    registered: getSelectableDesignStyles().some((style) => style.id === id),
                    primary: getComputedStyle(document.documentElement).getPropertyValue('--ui-action-primary').trim(),
                    expected: primary
                };
            });
        });
        assert.deepEqual(newStyleTokens, [
            { id: 'cerulean-atelier', registered: true, primary: '#007ba7', expected: '#007ba7' },
            { id: 'amethyst-salon', registered: true, primary: '#c39bd7', expected: '#c39bd7' },
            { id: 'techwear', registered: true, primary: '#78b8ca', expected: '#78b8ca' },
            { id: 'goblincore', registered: true, primary: '#586c3e', expected: '#586c3e' }
        ]);
        await page.locator('html').evaluate((element) => { element.dataset.style = 'hanji-dancheong'; });
        assert.deepEqual(
            await page.locator('#view-dashboard-beta .ui-overview-card').first().evaluate((element) => {
                const style = getComputedStyle(element);
                const root = getComputedStyle(document.documentElement);
                return {
                    background: style.backgroundColor,
                    text: style.color,
                    borderRadius: style.borderRadius,
                    surfaceToken: root.getPropertyValue('--ui-surface').trim(),
                    primaryToken: root.getPropertyValue('--ui-action-primary').trim()
                };
            }),
            {
                background: 'rgb(255, 250, 240)',
                text: 'rgb(31, 41, 40)',
                borderRadius: '6px',
                surfaceToken: '#fffaf0',
                primaryToken: '#235b73'
            }
        );
        assert.equal(
            await page.evaluate(() => getSelectableDesignStyles().filter((style) => style.selectable).length),
            10
        );
        assert.deepEqual(
            await page.locator('#dashboard-beta-discovery-refresh').evaluate((element) => {
                const style = getComputedStyle(element);
                return { color: style.color, borderColor: style.borderColor };
            }),
            { color: 'rgb(64, 84, 79)', borderColor: 'rgb(174, 191, 182)' }
        );
        assert.equal(
            await page.locator('#view-dashboard-beta .recommendation-dismiss').first().evaluate((element) => getComputedStyle(element).color),
            'rgb(150, 57, 41)'
        );
        await page.locator('html').evaluate((element) => { element.dataset.style = 'retro-terminal'; });
        assert.deepEqual(
            await page.locator('#view-dashboard-beta .ui-overview-card').first().evaluate((element) => {
                const style = getComputedStyle(element);
                const root = getComputedStyle(document.documentElement);
                return {
                    background: style.backgroundColor,
                    text: style.color,
                    borderRadius: style.borderRadius,
                    surfaceToken: root.getPropertyValue('--ui-surface').trim(),
                    primaryToken: root.getPropertyValue('--ui-action-primary').trim()
                };
            }),
            {
                background: 'rgb(11, 21, 16)',
                text: 'rgb(216, 245, 223)',
                borderRadius: '4px',
                surfaceToken: '#0b1510',
                primaryToken: '#d7a84f'
            }
        );
        assert.equal(
            await page.evaluate(() => getSelectableDesignStyles().some((style) => style.id === 'retro-terminal')),
            true
        );
        await page.locator('html').evaluate((element) => { element.dataset.style = 'warm-editorial'; });
        assert.equal(
            await page.locator('#blog-next-target-naver').evaluate((element) => getComputedStyle(element).accentColor),
            'rgb(182, 95, 66)'
        );
        assert.equal(await page.locator('#blog-next-trend-refresh').getAttribute('aria-label'), '최신 데이터 새로고침');
        assert.equal(await page.locator('#blog-next-trend-refresh').getAttribute('title'), '최신 데이터 새로고침');
        assert.equal((await page.locator('#blog-next-queue-refresh').textContent())?.trim(), '새로고침');
        assert.equal(
            await page.locator('#blog-next-trend-query').evaluate((element) => getComputedStyle(element).backgroundColor),
            'rgb(182, 95, 66)'
        );
        assert.match(
            await page.locator('#quick-discovery-modal-close-footer').evaluate((element) => getComputedStyle(element).backgroundColor),
            /^rgb\((?:254|255), 253, 249\)$/
        );
        assert.deepEqual(
            await page.locator('#view-blog-next .clock-widget-main').evaluate((element) => {
                const style = getComputedStyle(element);
                return {
                    background: style.backgroundColor,
                    borderColor: style.borderTopColor,
                    borderRadius: style.borderTopLeftRadius
                };
            }),
            { background: 'rgba(255, 253, 249, 0.92)', borderColor: 'rgb(222, 213, 200)', borderRadius: '16px' }
        );
        await page.locator('.app-footer-link').nth(1).focus();
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement?.matches('.app-footer-link:last-child'));
        await page.waitForTimeout(250);
        const warmFooterFocus = await page.locator('.app-footer-link').last().evaluate((element) => getComputedStyle(element).boxShadow);
        assert.notEqual(warmFooterFocus, 'none');
        await page.evaluate(() => {
            activateBlogNextTab('queue');
            activateBlogNextManagementTab('automation');
        });
        await page.waitForFunction(() => document.getElementById('blog-next-automation-enabled')?.disabled === false);
        assert.equal(await page.locator('#blog-next-automation-start-time').isDisabled(), true);
        await page.locator('#blog-next-automation-enabled').focus();
        await page.evaluate(() => {
            document.getElementById('blog-next-automation-enabled').checked = true;
            syncBlogNextAutomationDependentFields();
        });
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-automation-start-time');
        const warmTimeFocus = await page.locator('#blog-next-automation-start-time').evaluate((element) => ({
            fieldShadow: getComputedStyle(element).boxShadow
        }));
        assert.notEqual(warmTimeFocus.fieldShadow, 'none');
        await page.evaluate(() => {
            document.getElementById('blog-next-automation-enabled').checked = false;
            syncBlogNextAutomationDependentFields();
        });
        await page.evaluate(() => activateBlogNextTab('quick'));
        await page.evaluate(() => clearBlogNextTopicContent());
        assert.equal(await page.locator('#blog-next-save-topic').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-enqueue-topic').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-publish-now').isDisabled(), true);
        await page.locator('#blog-next-subject').fill('스타일 전환 중에도 보존할 주제');
        assert.equal(await page.locator('#blog-next-save-topic').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-enqueue-topic').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-publish-now').isEnabled(), true);
        await page.evaluate(() => {
            window.__blogNextSubjectBeforeStyleChange = document.getElementById('blog-next-subject');
            applyDesignStyle('quiet-sage-studio');
        });
        assert.equal(await page.locator('html').getAttribute('data-style'), 'quiet-sage-studio');
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '스타일 전환 중에도 보존할 주제');
        assert.equal(
            await page.evaluate(() => window.__blogNextSubjectBeforeStyleChange === document.getElementById('blog-next-subject')),
            true
        );
        assert.equal(
            await page.locator('#blog-next-target-naver').evaluate((element) => getComputedStyle(element).accentColor),
            'rgb(73, 103, 90)'
        );
        await page.locator('.app-footer-link').nth(1).focus();
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement?.matches('.app-footer-link:last-child'));
        await page.waitForTimeout(250);
        const quietFooterFocus = await page.locator('.app-footer-link').last().evaluate((element) => getComputedStyle(element).boxShadow);
        await page.evaluate(() => {
            activateBlogNextTab('queue');
            activateBlogNextManagementTab('automation');
        });
        await page.waitForFunction(() => document.getElementById('blog-next-automation-enabled')?.disabled === false);
        await page.locator('#blog-next-automation-enabled').focus();
        await page.evaluate(() => {
            document.getElementById('blog-next-automation-enabled').checked = true;
            syncBlogNextAutomationDependentFields();
        });
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-automation-start-time');
        const quietTimeFocus = await page.locator('#blog-next-automation-start-time').evaluate((element) => ({
            fieldShadow: getComputedStyle(element).boxShadow
        }));
        await page.evaluate(() => {
            document.getElementById('blog-next-automation-enabled').checked = false;
            syncBlogNextAutomationDependentFields();
        });
        assert.notEqual(quietFooterFocus, 'none');
        assert.notEqual(quietTimeFocus.fieldShadow, 'none');
        assert.notEqual(warmFooterFocus, quietFooterFocus);
        assert.notEqual(warmTimeFocus.fieldShadow, quietTimeFocus.fieldShadow);
        await page.evaluate(() => activateBlogNextTab('quick'));
        await page.evaluate(() => applyDesignStyle('quiet-sage-studio'));
        assert.equal(await page.locator('html').getAttribute('data-style'), 'quiet-sage-studio');
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '스타일 전환 중에도 보존할 주제');
        assert.equal(await page.locator('#blog-next-publish-status').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-publish-status-return').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('.blog-next-ai-assist').count(), 3);
        assert.equal(await page.locator('#blog-next-content-settings').getAttribute('open'), null);
        assert.equal(await page.locator('#blog-next-publish-settings').getAttribute('open'), null);
        assert.equal(await page.locator('#blog-next-publish-settings [data-blog-next-draft-options="ai"]').isHidden(), true);
        assert.equal((await page.locator('#blog-next-content-settings-summary').textContent())?.trim(), '외부 참고 사용 · 검색 중심 · 이미지 프롬프트만 포함');
        assert.equal((await page.locator('#blog-next-publish-settings-summary').textContent())?.trim(), '네이버 블로그 · 즉시 발행 · 보이지 않게 실행');
        await page.locator('#blog-next-content-settings > summary').click();
        const writingHelpTrigger = page.locator('[aria-describedby="blog-next-help-writing-strategy"]');
        const writingHelp = page.locator('#blog-next-help-writing-strategy');
        assert.equal(await writingHelp.isVisible(), false);
        await writingHelpTrigger.focus();
        assert.equal(await writingHelp.isVisible(), true);
        assert.equal(
            await writingHelp.evaluate((element) => getComputedStyle(element).backgroundColor),
            await page.evaluate(() => {
                const probe = document.createElement('span');
                probe.style.backgroundColor = 'var(--ui-surface-emphasis)';
                document.body.appendChild(probe);
                const color = getComputedStyle(probe).backgroundColor;
                probe.remove();
                return color;
            })
        );
        await writingHelpTrigger.press('Escape');
        assert.equal(await writingHelp.isVisible(), false);
        await page.locator('#blog-next-external-reference').uncheck();
        await page.locator('#blog-next-image-mode').selectOption('generate');
        assert.equal((await page.locator('#blog-next-content-settings-summary').textContent())?.trim(), '외부 참고 안 함 · 검색 중심 · 이미지 생성');
        await page.locator('#blog-next-publish-settings > summary').click();
        assert.equal(await page.locator('#blog-next-publish-settings').isVisible(), true);
        assert.equal(await page.locator('#blog-next-publish-settings').getAttribute('open'), '');
        assert.equal(await page.locator('#blog-next-schedule-field').isVisible(), true);
        assert.equal(await page.locator('#blog-next-schedule-date').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-schedule-required').evaluate((element) => element.hidden), true);
        assert.equal(
            await page.locator('#blog-next-post-status').evaluate((element) => getComputedStyle(element.parentElement, '::after').right),
            await page.locator('#blog-next-writing-strategy').evaluate((element) => getComputedStyle(element.parentElement, '::after').right)
        );
        for (const helpId of [
            'blog-next-help-external-reference',
            'blog-next-help-writing-strategy',
            'blog-next-help-image-mode',
            'blog-next-help-publish-targets',
            'blog-next-help-post-status',
            'blog-next-help-headless'
        ]) {
            const trigger = page.locator(`[aria-describedby="${helpId}"]`);
            await trigger.focus();
            const tooltipBox = await page.locator(`#${helpId}`).boundingBox();
            const disclosureBox = await trigger.evaluate((element) => {
                const rect = element.closest('.blog-next-disclosure').getBoundingClientRect();
                const triggerRect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, triggerLeft: triggerRect.left, placement: element.dataset.helpPlacement || 'center', focused: document.activeElement === element };
            });
            assert.equal(Boolean(tooltipBox && tooltipBox.x >= disclosureBox.left - 1), true,
                `${helpId} tooltip crossed the disclosure start boundary: ${JSON.stringify({ tooltipBox, disclosureBox })}`);
            assert.equal(Boolean(tooltipBox && tooltipBox.x + tooltipBox.width <= disclosureBox.right + 1), true,
                `${helpId} tooltip crossed the disclosure end boundary: ${JSON.stringify({ tooltipBox, disclosureBox })}`);
            await trigger.press('Escape');
        }
        assert.equal(await page.locator('#blog-next-runner-headless').isEnabled(), true);
        if (!await page.locator('#blog-next-runner-headless').isChecked()) {
            await page.locator('#blog-next-runner-headless').check();
        }
        assert.equal(await page.locator('#blog-next-category').isEnabled(), true);
        await page.locator('#blog-next-category').fill('기존 네이버 카테고리');
        await page.locator('label:has(#blog-next-target-wordpress)').click();
        assert.equal(await page.locator('#blog-next-category').isEnabled(), true);
        await page.locator('#blog-next-category').fill('Existing WordPress Category');
        assert.equal(await page.locator('#blog-next-runner-headless').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), true);
        assert.equal((await page.locator('#blog-next-publish-settings-summary').textContent())?.trim(), '워드프레스 · 즉시 발행');
        await page.locator('#blog-next-target-naver').check();
        assert.equal(await page.locator('#blog-next-runner-headless').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), true);
        assert.equal(await page.locator('#blog-next-category').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-category').inputValue(), '기존 네이버 카테고리');
        assert.equal(await page.locator('#blog-next-wordpress-category').inputValue(), 'Existing WordPress Category');
        await page.locator('#blog-next-post-status').selectOption('schedule');
        assert.equal(await page.locator('#blog-next-schedule-field').isVisible(), true);
        assert.equal(await page.locator('#blog-next-schedule-date').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-save-topic').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-enqueue-topic').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-publish-now').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-schedule-date').getAttribute('required'), '');
        assert.equal(await page.locator('#blog-next-schedule-required').evaluate((element) => element.hidden), false);
        assert.equal((await page.locator('#blog-next-schedule-required').textContent())?.trim(), '(필수)');
        await page.locator('#blog-next-schedule-date').fill('2026-09-08T09:30');
        assert.equal(await page.locator('#blog-next-enqueue-topic').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-publish-now').isEnabled(), true);
        await page.locator('#blog-next-post-status').selectOption('publish');
        assert.equal(await page.locator('#blog-next-schedule-field').isVisible(), true);
        assert.equal(await page.locator('#blog-next-schedule-date').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-schedule-required').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-schedule-date').inputValue(), '2026-09-08T09:30');
        assert.deepEqual(
            await page.locator('#blog-next-publish-settings .blog-next-draft-headless').evaluate((element) => ({
                background: getComputedStyle(element).backgroundColor,
                border: getComputedStyle(element).borderTopStyle,
                labelBorder: getComputedStyle(element.querySelector('.blog-next-headless-option')).borderLeftStyle
            })),
            { background: 'rgba(0, 0, 0, 0)', border: 'none', labelBorder: 'none' }
        );
        assert.deepEqual(
            await page.locator('#view-blog-next .blog-next-form-actions button:visible').evaluateAll((buttons) => buttons.map((button) => button.textContent.trim())),
            ['글감 보관', '발행 대기열에 추가', '원고 만들기']
        );
        reportSmokePhase('Checking Blog Beta quick-create defaults and validation');
        assert.deepEqual(
            await page.locator('#view-blog-next .blog-next-form-actions').evaluate((element) => {
                const primary = getComputedStyle(element.querySelector('.primary'));
                const secondary = getComputedStyle(element.querySelector('.secondary'));
                const ideaRow = getComputedStyle(element.querySelector('[data-blog-next-ai-idea-actions]'));
                const generateRow = getComputedStyle(element.querySelector('[data-blog-next-ai-generate-action]'));
                return {
                    display: getComputedStyle(element).display,
                    ideaDisplay: ideaRow.display,
                    ideaJustify: ideaRow.justifyContent,
                    generateDisplay: generateRow.display,
                    generateJustify: generateRow.justifyContent,
                    primaryBackground: primary.backgroundColor,
                    secondaryBackground: secondary.backgroundColor,
                    secondaryBorder: secondary.borderTopStyle
                };
            }),
            {
                display: 'grid',
                ideaDisplay: 'grid',
                ideaJustify: 'normal',
                generateDisplay: 'flex',
                generateJustify: 'normal',
                primaryBackground: 'rgb(73, 103, 90)',
                secondaryBackground: 'rgb(250, 252, 250)',
                secondaryBorder: 'solid'
            }
        );
        const aiPreparationBounds = await page.locator('#view-blog-next .blog-next-ai-prepare-actions').evaluate((element) => {
            const row = element.querySelector('.blog-next-ai-action-row').getBoundingClientRect();
            const idea = element.querySelector('[data-blog-next-ai-idea-actions]').getBoundingClientRect();
            const actions = element.querySelector('.blog-next-ai-action-buttons').getBoundingClientRect();
            return { row, idea, actions };
        });
        assert.ok(aiPreparationBounds.idea.left >= aiPreparationBounds.row.left - 1);
        assert.ok(aiPreparationBounds.idea.right <= aiPreparationBounds.row.right + 1);
        assert.ok(aiPreparationBounds.actions.left >= aiPreparationBounds.row.left - 1);
        assert.ok(aiPreparationBounds.actions.right <= aiPreparationBounds.row.right + 1);
        assert.equal(await page.locator('[data-blog-next-draft-actions="ai"]').isHidden(), false);
        assert.equal(await page.locator('[data-blog-next-draft-publish="ai"]').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-publish-now').evaluate((element) => element.classList.contains('primary')), true);
        assert.equal(await page.locator('#blog-next-clear-topic').count(), 0);
        await page.evaluate(() => { void navigateToBlogQuickCreate(); });
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-cancel').click();
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '스타일 전환 중에도 보존할 주제');
        await page.evaluate(() => { void navigateToBlogQuickCreate(); });
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-subject')?.value === '');
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '');
        assert.equal(await page.locator('#blog-next-save-topic').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-enqueue-topic').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-publish-now').isDisabled(), true);

        await page.locator('[data-blog-next-tab="trend-posting"]').click();
        await page.waitForFunction(() => document.getElementById('blog-next-trend-query')?.disabled === false);
        assert.equal(await page.locator('#blog-next-trend-period').isEnabled(), true);
        await page.locator('[data-blog-next-trend-category].active').click();
        assert.equal(await page.locator('#blog-next-trend-query').isDisabled(), true);
        await page.locator('[data-blog-next-trend-category]').first().click();
        assert.equal(await page.locator('#blog-next-trend-query').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-trend-filter-keyword').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-trend-filters').getAttribute('aria-disabled'), 'true');
        assert.equal(await page.locator('#blog-next-trend-results-workspace').isHidden(), true);
        assert.equal(await page.locator('#blog-next-trend-status').isHidden(), true);
        await page.locator('#blog-next-trend-period').selectOption('custom');
        await page.locator('#blog-next-trend-date-from').fill('2026-08-29');
        await page.locator('#blog-next-trend-date-to').fill('2026-08-25');
        assert.equal(await page.locator('#blog-next-trend-query').isDisabled(), true);
        await page.locator('#blog-next-trend-date-from').fill('2026-08-25');
        await page.locator('#blog-next-trend-date-to').fill('2026-08-29');
        assert.equal(await page.locator('#blog-next-trend-query').isEnabled(), true);
        await Promise.all([
            page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/trend-posting/meta'),
            page.locator('#blog-next-trend-refresh').click()
        ]);
        assert.equal(await page.locator('#blog-next-trend-date-from').inputValue(), '2026-08-25');
        assert.equal(await page.locator('#blog-next-trend-date-to').inputValue(), '2026-08-29');
        assert.equal(await page.locator('[data-blog-next-trend-category].active').count(), 1);
        assert.equal(await page.locator('#blog-next-trend-refresh').getAttribute('aria-busy'), 'false');
        assert.equal(await page.locator('#blog-next-trend-status').isHidden(), true);
        assert.equal(requests.filter((request) => request.pathname === '/api/v1/trend-posting/meta').length >= 2, true);
        await page.locator('#blog-next-trend-period').selectOption('latest');
        assert.equal(await page.locator('#blog-next-trend-date-from').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-trend-date-to').isDisabled(), true);
        await page.locator('#blog-next-trend-query').click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-trend-results [data-blog-next-trend-select]').length === 1);
        assert.equal(await page.locator('#blog-next-trend-query').textContent(), '트렌드 조회');
        assert.equal(await page.locator('#blog-next-trend-query').getAttribute('aria-busy'), 'false');
        assert.equal(await page.locator('#blog-next-trend-results-workspace').isHidden(), false);
        assert.equal(await page.locator('#blog-next-trend-status').isHidden(), true);
        assert.equal(await page.locator('#blog-next-trend-filter-keyword').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-trend-filters').getAttribute('aria-disabled'), 'false');
        const trendTablePalette = await page.locator('.blog-next-view .trend-posting-table').evaluate((table) => {
            const header = table.querySelector('th');
            const badge = table.querySelector('.trend-category-tag');
            return {
                headerBackground: getComputedStyle(header).backgroundColor,
                badgeBackground: getComputedStyle(badge).backgroundColor
            };
        });
        assert.notEqual(trendTablePalette.headerBackground, 'rgb(241, 245, 249)');
        assert.notEqual(trendTablePalette.badgeBackground, 'rgb(241, 245, 249)');
        await page.locator('#blog-next-trend-results tr').first().hover();
        assert.notEqual(
            await page.locator('#blog-next-trend-results td').first().evaluate((cell) => getComputedStyle(cell).backgroundColor),
            'rgb(249, 252, 255)'
        );
        await page.locator('#blog-next-trend-filter-keyword').fill('결과에 없는 검색어');
        assert.equal(await page.locator('#blog-next-trend-results').getAttribute('data-state'), 'filtered-empty');
        assert.equal((await page.locator('#blog-next-trend-results').textContent()).includes('필터에 맞는 키워드가 없습니다.'), true);
        await page.locator('#blog-next-trend-filter-reset').click();
        assert.equal(await page.locator('#blog-next-trend-results').getAttribute('data-state'), 'results');
        await page.evaluate(() => renderBlogNextTrendResults([]));
        assert.equal(await page.locator('#blog-next-trend-results-workspace').isHidden(), false);
        assert.equal(await page.locator('#blog-next-trend-filters').isHidden(), true);
        assert.equal(await page.locator('#blog-next-trend-results').getAttribute('data-state'), 'empty');
        assert.equal((await page.locator('#blog-next-trend-results').textContent()).includes('조건에 맞는 키워드가 없습니다.'), true);
        await page.locator('#blog-next-trend-query').click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-trend-results [data-blog-next-trend-select]').length === 1);
        assert.equal(await page.locator('#blog-next-trend-results [data-blog-next-trend-save]').count(), 1);
        await page.locator('#blog-next-trend-results [data-blog-next-trend-save]').click();
        await page.waitForFunction(() => document.querySelector('#blog-next-trend-results [data-blog-next-trend-save]')?.textContent === '보관 완료');
        assert.equal(await page.locator('#blog-next-trend-results [data-blog-next-trend-save]').isDisabled(), true);
        const savedTrendRequest = requests.find((request) => request.pathname === '/api/v1/trend-posting/topics');
        assert.deepEqual(savedTrendRequest?.body, { keyword: '제주 가을 여행', trendDate: '2026-08-30' });
        await page.locator('#blog-next-trend-results [data-blog-next-trend-select]').click();
        assert.equal(await page.locator('#blog-next-panel-quick').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-ai-preparation').evaluate((element) => element.open), true);
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '제주 가을 여행');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '제주 가을 여행');
        assert.equal(await page.locator('#blog-next-title').inputValue(), '');
        assert.match(await page.locator('#blog-next-topic-settings-summary').textContent(), /주제: 제주 가을 여행 · 키워드: 제주 가을 여행/);
        await page.evaluate(() => clearBlogNextTopicContent());

        await page.locator('#blog-next-subject').fill('기존 주제');
        await page.locator('#blog-next-keywords').fill('기존 키워드');
        await page.locator('#blog-next-title').fill('기존 제목');
        await page.locator('#blog-next-instruction').fill('기존 경험 방향');
        await page.locator('[data-blog-next-tab="trend-posting"]').click();
        await page.locator('#blog-next-trend-results [data-blog-next-trend-select]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-cancel').click();
        assert.equal(await page.locator('#blog-next-panel-trend-posting').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '기존 주제');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '기존 키워드');
        await page.locator('#blog-next-trend-results [data-blog-next-trend-select]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-subject')?.value === '제주 가을 여행');
        assert.equal(await page.locator('#blog-next-panel-quick').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-ai-preparation').evaluate((element) => element.open), true);
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '제주 가을 여행');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '제주 가을 여행');
        assert.equal(await page.locator('#blog-next-title').inputValue(), '');
        assert.equal(await page.locator('#blog-next-instruction').inputValue(), '');
        assert.match(await page.locator('#blog-next-topic-settings-summary').textContent(), /주제: 제주 가을 여행 · 키워드: 제주 가을 여행/);
        await page.evaluate(() => clearBlogNextTopicContent());

        await page.locator('#blog-next-subject').fill('기존에 적어둔 제주 글감');
        await page.locator('#blog-next-keywords').fill('제주 산책');
        let quickDiscoveryWideWidth = 0;
        await page.locator('#blog-next-keyword-recommend').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        quickDiscoveryWideWidth = await page.locator('.quick-discovery-modal-container')
            .evaluate((element) => Math.round(element.getBoundingClientRect().width));
        assert.ok(quickDiscoveryWideWidth > 840 && quickDiscoveryWideWidth <= 1040);
        assert.equal(await page.locator('#quick-keyword-discovery-query').inputValue(), '제주 산책');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'blog-next-keyword-recommend');
        await page.evaluate(async () => {
            const originalConfirm = showUiConfirm;
            showUiConfirm = async () => true;
            try {
                setQuickDiscoveryInputTarget('blogNext');
                await applyQuickKeywordDiscovery([{ keyword: '제주 아침 산책' }]);
            } finally {
                showUiConfirm = originalConfirm;
            }
        });
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '기존에 적어둔 제주 글감');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '제주 아침 산책');
        await page.evaluate(() => clearBlogNextTopicContent());

        await page.locator('#blog-next-topic-recommend').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        const quickDiscoveryCompactWidth = await page.locator('.quick-discovery-modal-container')
            .evaluate((element) => Math.round(element.getBoundingClientRect().width));
        assert.ok(quickDiscoveryCompactWidth <= 840);
        assert.ok(quickDiscoveryCompactWidth < quickDiscoveryWideWidth);
        assert.equal((await page.locator('#quick-topic-recommendations-refresh').textContent())?.trim(), '글감 추천');
        await page.locator('#quick-topic-recommendations-refresh').click();
        await page.waitForFunction(() => document.querySelectorAll('.quick-topic-recommendation-row').length === 1);
        assert.equal((await page.locator('#quick-topic-recommendations-refresh').textContent())?.trim(), '글감 추천');
        const quickTopicButtonAlignment = await page.locator('.quick-topic-recommendation-row').evaluate((row) => {
            const refresh = document.querySelector('#quick-topic-recommendations-refresh').getBoundingClientRect();
            const actions = row.querySelector('.quick-topic-recommendation-actions').getBoundingClientRect();
            const pick = row.querySelector('[data-recommendation-action="quick"]').getBoundingClientRect();
            const dismiss = row.querySelector('.quick-topic-recommendation-dismiss').getBoundingClientRect();
            return {
                requestButtonWidth: refresh.width,
                requestButtonRight: Math.round(refresh.right),
                actionRight: Math.round(actions.right),
                pickButtonRight: Math.round(pick.right),
                dismissRight: Math.round(dismiss.right)
            };
        });
        assert.ok(quickTopicButtonAlignment.requestButtonWidth < 148);
        assert.equal(quickTopicButtonAlignment.actionRight, quickTopicButtonAlignment.requestButtonRight);
        assert.ok(quickTopicButtonAlignment.pickButtonRight < quickTopicButtonAlignment.dismissRight);
        assert.equal(quickTopicButtonAlignment.actionRight, quickTopicButtonAlignment.dismissRight);
        await page.locator('.quick-topic-recommendation-row [data-recommendation-action="quick"]').click();
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '추천 글감 1');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '테스트');

        await page.locator('#blog-next-title-recommend').click();
        await page.waitForFunction(() => !document.getElementById('keyword-research-modal')?.classList.contains('hidden'));
        const keywordResearchWidth = await page.locator('.keyword-research-modal-container')
            .evaluate((element) => Math.round(element.getBoundingClientRect().width));
        assert.ok(keywordResearchWidth > 840 && keywordResearchWidth <= 1040);
        await page.waitForFunction(() => !document.getElementById('keyword-modal-loading')?.classList.contains('hidden'));
        assert.equal((await page.locator('#keyword-modal-search-btn').textContent())?.trim(), '분석 중…');
        assert.equal(await page.locator('#keyword-modal-search-btn').getAttribute('aria-busy'), 'true');
        assert.equal(await page.locator('#keyword-modal-loading .ui-progress-indeterminate').isVisible(), true);
        await page.waitForFunction(() => document.querySelectorAll('.keyword-selection-checkbox').length === 1);
        await page.locator('.keyword-selection-checkbox').check();
        await page.locator('#keyword-generate-titles-btn').click();
        await page.waitForFunction(() => document.querySelectorAll('.title-apply-btn').length === 1);
        await page.locator('.title-apply-btn').click();
        assert.equal(await page.locator('#blog-next-title').inputValue(), '제주 아침 산책에서 뜻밖에 마주친 것');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '테스트');
        await page.evaluate(() => clearBlogNextTopicContent());

        const missingAiConfigRoute = async (route) => route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
                success: true,
                data: {
                    ready: false,
                    isEssentialSet: false,
                    isNaverSet: true,
                    isWpSet: true,
                    setup: {
                        ready: false,
                        ai: { configured: false, text_configured: false, image_configured: true },
                        google: { configured: true, account_connected: true, spreadsheet_configured: true },
                        publishing_channel: { configured: true, naver_configured: true, wordpress_configured: true }
                    }
                }
            })
        });
        await page.route('**/api/v1/config/status', missingAiConfigRoute);
        await page.locator('#blog-next-title-recommend').click();
        await page.waitForFunction(() => !document.getElementById('keyword-research-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('#keyword-modal-search-btn').isDisabled(), true);
        await page.waitForFunction(() => !document.getElementById('keyword-ai-readiness')?.classList.contains('hidden'));
        assert.equal((await page.locator('#keyword-ai-readiness').textContent())?.includes('키워드 분석은 AI 설정 없이도'), true);
        await page.locator('#keyword-modal-input').fill('AI 없는 키워드 분석');
        assert.equal(await page.locator('#keyword-modal-search-btn').isEnabled(), true);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('keyword-research-modal')?.classList.contains('hidden'));
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'blog-next-title-recommend');
        await page.locator('#blog-next-title-recommend').click();
        await page.waitForFunction(() => !document.getElementById('keyword-research-modal')?.classList.contains('hidden'));
        await page.waitForFunction(() => !document.getElementById('keyword-ai-readiness')?.classList.contains('hidden'));
        await page.evaluate(() => {
            const input = document.getElementById('blog-next-subject');
            input.value = 'AI 설정이 필요한 원고';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForFunction(() => document.getElementById('blog-next-publish-now')?.disabled === true);
        assert.equal(await page.locator('#blog-next-ai-readiness').isVisible(), true);
        await page.locator('#keyword-ai-settings-btn').click();
        await page.waitForFunction(() => document.getElementById('view-settings-next')?.classList.contains('active'));
        assert.equal(await page.locator('[data-settings-next-tab="ai"]').getAttribute('aria-selected'), 'true');
        await page.unroute('**/api/v1/config/status', missingAiConfigRoute);
        await page.evaluate(() => {
            uiAiTextReady = true;
            return navigateTo('blog-next', 'quick');
        });
        await page.waitForFunction(() => document.getElementById('view-blog-next')?.classList.contains('active'));

        await page.locator('#blog-next-writing-strategy').selectOption('discovery');
        await page.locator('#blog-next-image-mode').selectOption('none');
        await page.locator('#blog-next-writing-length').selectOption('long');
        await page.locator('#blog-next-external-reference').uncheck();
        const creationDefaults = await page.evaluate(() => JSON.parse(localStorage.getItem('blog_next_topic_defaults_v1') || '{}'));
        assert.equal(creationDefaults.writingStrategy, 'discovery');
        assert.equal(creationDefaults.imageMode, 'none');
        assert.equal(creationDefaults.writingOverrides.length, 'long');
        assert.equal(creationDefaults.externalReference, false);
        assert.equal(Object.hasOwn(creationDefaults, 'referenceUrl'), false);
        assert.equal(Object.hasOwn(creationDefaults, 'scheduleDate'), false);

        await page.locator('#blog-next-subject').fill('나중에 다듬을 제주 글감');
        await page.locator('#blog-next-save-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('글감을 보관했습니다'));
        const savedTopicRequest = requests.find((request) => (
            request.pathname === '/api/v1/continuous-publishing/topics'
            && request.body?.action === 'save'
        ));
        assert.equal(savedTopicRequest?.body?.subject, '나중에 다듬을 제주 글감');

        await page.locator('#blog-next-subject').fill('곧 발행할 제주 글감');
        if (await page.locator('#blog-next-publish-settings').isHidden()) {
            await page.locator('#blog-next-enqueue-topic').click();
        }
        await page.locator('#blog-next-post-status').selectOption('draft');
        await page.locator('#blog-next-enqueue-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('대기열에 추가했습니다'));
        const queuedTopicRequest = requests.find((request) => (
            request.pathname === '/api/v1/continuous-publishing/topics'
            && request.body?.action === 'enqueue'
        ));
        assert.deepEqual(queuedTopicRequest?.body?.platforms, ['naver']);
        assert.equal(queuedTopicRequest?.body?.postStatus, 'draft');
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '');
        assert.equal(await page.locator('#blog-next-post-status').inputValue(), 'draft');
        assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('blog_next_publish_settings_by_target_v1') || '{}').naver?.postStatus), 'draft');
        assert.equal(await page.locator('#blog-next-clear-topic').count(), 0);

        assert.equal(await page.locator('[data-blog-next-input-mode]').count(), 0);
        await page.evaluate(() => activateBlogNextInputMode('folder'));
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"]').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-publish-settings').count(), 1);
        assert.equal(await page.locator('#blog-next-publish-settings').evaluate((element) => element.closest('[data-blog-next-mode-panel]')?.dataset.blogNextModePanel), 'folder');
        if (!await page.locator('[data-blog-next-draft-settings="folder"]').evaluate((element) => element.open)) {
            await page.locator('[data-blog-next-draft-settings="folder"] summary').click();
        }
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').isDisabled(), true);
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').selectOption('schedule');
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').isEnabled(), true);
        assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('blog_next_publish_settings_by_target_v1') || '{}').naver?.postStatus), 'schedule');
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').fill('2026-09-20T11:30');
        assert.equal(await page.evaluate(() => Object.hasOwn(JSON.parse(localStorage.getItem('blog_next_topic_defaults_v1') || '{}'), 'scheduleDate')), false);
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').selectOption('publish');
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').isDisabled(), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').inputValue(), '2026-09-20T11:30');
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), true);
        await page.locator('#blog-next-runner-headless').uncheck();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('blog_next_topic_defaults_v1') || '{}').headless), false);
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="target-wordpress"]').check();
        assert.equal(await page.locator('#blog-next-runner-headless').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-category').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-category').getAttribute('placeholder'), '예: Daily');
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="target-naver"]').check();
        assert.equal(await page.locator('#blog-next-category').getAttribute('placeholder'), '비우면 기본 카테고리');
        await page.evaluate(() => activateBlogNextInputMode('paste'));
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), false);
        assert.equal(await page.locator('#blog-next-publish-settings').evaluate((element) => element.closest('[data-blog-next-mode-panel]')?.dataset.blogNextModePanel), 'paste');
        await page.evaluate(() => activateBlogNextInputMode('ai'));
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), false);
        assert.equal(await page.locator('#blog-next-publish-settings').evaluate((element) => element.closest('[data-blog-next-mode-panel]')?.dataset.blogNextModePanel), 'ai');
        await page.locator('[data-blog-next-tab="queue"]').click();
        assert.equal(await page.locator('#blog-next-panel-queue').evaluate((element) => element.hidden), false);
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 1);
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-saved-list .blog-next-queue-item').length === 1);
        assert.equal((await page.locator('#blog-next-saved-count').textContent())?.trim(), '1건');
        assert.equal((await page.locator('#blog-next-queue-count').textContent())?.trim(), '1건');
        assert.equal((await page.locator('#blog-next-saved-list .blog-next-queue-item strong').textContent())?.trim(), '나중에 다듬을 제주 글감');
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item strong').textContent())?.trim(), '곧 발행할 제주 글감');
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item').textContent()).includes('네이버 블로그 · 임시 저장'), true);

        assert.equal((await page.locator('[data-blog-next-tab="queue"]').textContent())?.trim(), '글감 관리');
        await page.locator('[data-blog-next-management-tab="ready"]').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('[data-blog-next-management-tab="saved"]').getAttribute('tabindex'), '0');
        assert.equal(await page.locator('[data-blog-next-management-tab="saved"]').evaluate((element) => element === document.activeElement), true);
        assert.equal(await page.locator('[data-blog-next-management-panel="saved"]').evaluate((element) => element.hidden), false);
        const quickPreparationWasOpenBeforeSavedEdit = await page.locator('#blog-next-ai-preparation').evaluate((element) => element.open);
        await page.locator('#blog-next-saved-list .blog-next-queue-copy').click();
        assert.equal((await page.locator('#blog-next-editor-title').textContent())?.trim(), '보관한 글감 수정');
        assert.equal(await page.locator('#blog-next-editor-modal').evaluate((element) => element.classList.contains('hidden')), false);
        assert.equal(await page.locator('#blog-next-topic-settings').evaluate((element) => element.open), true);
        assert.equal(await page.locator('#blog-next-content-settings').evaluate((element) => element.open), false);
        assert.equal((await page.locator('#blog-next-save-topic').textContent())?.trim(), '저장');
        assert.equal(await page.locator('#blog-next-enqueue-topic').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-publish-now').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-publish-settings').isHidden(), true);
        assert.equal(await page.locator('#blog-next-clear-topic').count(), 0);
        assert.equal(await page.locator('#blog-next-cancel-edit').isVisible(), true);
        await page.locator('#blog-next-subject').fill('다듬은 제주 글감');
        await page.locator('#blog-next-topic-settings > summary').click();
        await page.locator('#blog-next-content-settings > summary').click();
        await page.locator('#blog-next-save-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('보관한 글감을 수정했습니다'));
        assert.equal(await page.locator('#blog-next-ai-preparation').evaluate((element) => element.open), quickPreparationWasOpenBeforeSavedEdit);
        assert.equal(await page.locator('#blog-next-topic-settings').evaluate((element) => element.open), true);
        assert.equal(await page.locator('#blog-next-content-settings').evaluate((element) => element.open), false);
        await page.waitForFunction(() => document.querySelector('#blog-next-saved-list .blog-next-queue-item strong')?.textContent === '다듬은 제주 글감');
        await page.locator('#blog-next-saved-list .blog-next-queue-actions button', { hasText: '삭제' }).click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-saved-list .blog-next-queue-item').length === 0);
        assert.equal((await page.locator('#blog-next-saved-count').textContent())?.trim(), '0건');

        await page.locator('[data-blog-next-management-tab="ready"]').click();
        await page.locator('#blog-next-queue-list .blog-next-queue-copy').click();
        assert.equal(await page.locator('#blog-next-panel-queue').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-editor-modal').evaluate((element) => element.classList.contains('hidden')), false);
        assert.equal(await page.locator('#blog-next-topic-settings').evaluate((element) => element.open), false);
        assert.equal(await page.locator('#blog-next-content-settings').evaluate((element) => element.open), true);
        assert.equal((await page.locator('#blog-next-save-topic').textContent())?.trim(), '저장');
        assert.equal(await page.locator('#blog-next-enqueue-topic').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-publish-now').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-publish-settings').isHidden(), true);
        assert.deepEqual(
            await page.locator('#blog-next-editor-actions-slot .blog-next-form-actions button:visible')
                .evaluateAll((buttons) => buttons
                    .map((button) => ({ text: button.textContent.trim(), order: Number(getComputedStyle(button).order) }))
                    .sort((left, right) => left.order - right.order)
                    .map(({ text }) => text)),
            ['취소', '저장', '원고 만들기']
        );
        await page.locator('#blog-next-topic-settings > summary').click();
        await page.locator('#blog-next-subject').fill('수정한 제주 글감');
        await page.locator('#blog-next-save-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('발행 계획을 수정했습니다'));
        assert.equal(await page.locator('#blog-next-panel-queue').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-topic-form').evaluate((element) => element.parentElement.id), 'blog-next-ai-preparation');
        await page.waitForFunction(() => document.querySelector('#blog-next-queue-list .blog-next-queue-item strong')?.textContent === '수정한 제주 글감');
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item').textContent()).includes('네이버 블로그'), true);
        await page.locator('#blog-next-queue-list .blog-next-queue-copy').click();
        await page.waitForFunction(() => !document.getElementById('blog-next-editor-modal')?.classList.contains('hidden'));
        assert.equal(await page.evaluate(() => navigateToBlogQuickCreate()), false);
        assert.equal(await page.locator('#blog-next-editor-modal').evaluate((element) => element.classList.contains('hidden')), false);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await page.locator('#blog-next-editor-close').click();
        await page.waitForFunction(() => document.getElementById('blog-next-editor-modal')?.classList.contains('hidden'));
        await page.evaluate(() => navigateToBlogQuickCreate());
        await page.waitForFunction(() => document.getElementById('view-blog-next')?.classList.contains('active')
            && document.getElementById('blog-next-ai-preparation')?.open === true
            && document.getElementById('blog-next-topic-form')?.parentElement?.id === 'blog-next-ai-preparation');
        await page.evaluate(() => navigateTo('blog-next', 'queue'));
        await page.waitForFunction(() => document.getElementById('blog-next-panel-queue')?.hidden === false);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await page.locator('#blog-next-queue-list .blog-next-queue-actions button', { hasText: '보관으로 이동' }).click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 0, null, { timeout: 10000 });
        assert.equal((await page.locator('#blog-next-saved-count').textContent())?.trim(), '1건');
        assert.equal((await page.locator('#blog-next-queue-count').textContent())?.trim(), '0건');

        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.waitForFunction(() => document.getElementById('blog-next-panel-quick')?.hidden === false);
        await page.evaluate(() => {
            restoreBlogNextTopicFormHome();
            activateBlogNextInputMode('ai');
        });
        await page.evaluate(() => {
            document.getElementById('blog-next-ai-preparation').open = true;
            document.getElementById('blog-next-content-settings').open = true;
        });
        await page.waitForFunction(() => document.getElementById('blog-next-image-mode')?.getClientRects().length > 0);
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), false);
        await page.evaluate(() => syncPlatformUiState('wordpress', false));
        assert.equal(await page.locator('#blog-next-target-wordpress').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-target-wordpress').isChecked(), false);
        await page.evaluate(() => syncPlatformUiState('wordpress', true));
        assert.equal(await page.locator('#blog-next-target-wordpress').isDisabled(), false);

        let aiDraftAttemptCount = 0;
        const aiDraftRetryRoute = async (route) => {
            aiDraftAttemptCount += 1;
            if (aiDraftAttemptCount === 1) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({
                        success: false,
                        error: { code: 'AI_RATE_LIMITED', message: 'AI 공급자의 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' }
                    })
                });
                return;
            }
            await route.fallback();
        };
        await page.route('**/api/v1/blog/manuscript-drafts/ai/operations', aiDraftRetryRoute);
        await page.locator('#blog-next-image-mode').selectOption('none');
        await page.locator('#blog-next-subject').fill('미리 확인할 AI 원고');
        await page.locator('#blog-next-keywords').fill('단일 플랫폼, 원고 미리보기');
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'failed');
        assert.match((await page.locator('#blog-next-publish-status-message').textContent()) || '', /AI 공급자의 요청 한도/);
        assert.equal(await page.locator('[data-blog-next-draft-validation="ai"]').isHidden(), true);
        assert.doesNotMatch((await page.locator('#blog-next-topic-result').textContent()) || '', /AI 공급자의 요청 한도/);
        assert.equal(await page.locator('#blog-next-publish-status-return').isVisible(), true);
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-now')?.textContent?.trim().startsWith('원고 만드는 중'));
        assert.equal(await page.locator('#blog-next-subject').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-keywords').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-writing-strategy').isDisabled(), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"]').evaluate((element) => element.hidden), true);
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-publish-status');
        assert.equal(await page.locator('#blog-next-publish-status').evaluate((element) => document.activeElement === element), true);
        await page.locator('#blog-next-publish-status-return').click();
        assert.equal(await page.locator('[data-blog-next-ai-generate-action]').evaluate((element) => document.activeElement === element), true);
        assert.equal(await page.locator('[data-blog-next-draft-validation="ai"]').isHidden(), true);
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="ai"]')?.hidden === true
            && document.querySelector('[data-ai-editor-workspace]')?.hidden === false);
        const noneAiDraftRequest = requests.filter((request) => request.pathname === '/api/v1/blog/manuscript-drafts/ai/operations').at(-1);
        assert.equal(noneAiDraftRequest?.body?.imageMode, 'none');
        assert.equal(await page.locator('#blog-next-ai-editor').isVisible(), true);
        assert.equal((await page.locator('#blog-next-ai-editor .ProseMirror h1').textContent())?.trim(), '미리 확인할 AI 원고');
        assert.equal(await page.locator('[data-ai-formatting-toolbar]').isVisible(), true);
        await page.locator('[data-ai-workspace-mode="markdown"]').click();
        assert.equal(await page.locator('#blog-next-ai-markdown').isVisible(), true);
        assert.match(await page.locator('#blog-next-ai-markdown').inputValue(), /미리 확인할 AI 원고/);
        await page.locator('[data-ai-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="ai"]')?.hidden === false);
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-image-details]').isHidden(), true);
        assert.equal(await page.locator('#blog-next-publish-safety-hint').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-manuscript-image-slot]').count(), 0);

        await page.locator('#blog-next-image-mode').selectOption('generate');
        await page.locator('#blog-next-regenerate-draft').click();
        await page.waitForFunction(() => document.getElementById('blog-next-regenerate-draft')?.textContent?.trim().startsWith('원고 만드는 중'));
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-ai-editor .manuscript-image-block').length === 2);
        await page.unroute('**/api/v1/blog/manuscript-drafts/ai/operations', aiDraftRetryRoute);
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        assert.equal(await page.locator('#blog-next-subject').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-keywords').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-writing-strategy').isEnabled(), true);
        reportSmokePhase('Checking Blog Beta manuscript editing and publish lifecycle');
        assert.equal((await page.locator('#blog-next-publish-status-title').textContent())?.trim(), '원고 준비 완료');
        assert.equal(await page.locator('#blog-next-publish-settings').isVisible(), true);
        assert.equal(await page.locator('#blog-next-ai-editor .manuscript-image-block').count(), 2);
        assert.equal(await page.locator('[data-ai-editor-rail] [data-ai-workspace-mode="block"]').getAttribute('aria-pressed'), 'true');
        await page.locator('[data-ai-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="ai"]')?.hidden === false);
        await page.locator('#blog-next-target-naver').check();
        assert.equal((await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-title]').textContent())?.trim(), '미리 확인할 AI 원고');
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-image-details]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-manuscript-image-slot]').count(), 0);
        assert.equal(await page.locator('#blog-next-post-status').inputValue(), 'draft');
        assert.equal(await page.locator('#blog-next-post-status option[value="publish"]').evaluate((option) => option.disabled), true);
        assert.equal(await page.locator('#blog-next-post-status option[value="schedule"]').evaluate((option) => option.disabled), true);
        assert.match((await page.locator('#blog-next-publish-safety-message').textContent()) || '', /미지정 이미지 1개가 있습니다\. 지금은 임시 저장만 가능합니다\./);
        assert.equal((await page.locator('#blog-next-publish-image-action').textContent())?.trim(), '이미지 블록으로 이동 ↑');
        assert.equal(await page.locator('#blog-next-publish-image-action').isVisible(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="ai"]').textContent())?.trim(), '블로그에 임시 저장');
        await page.locator('#blog-next-publish-image-action').click();
        await page.waitForFunction(() => document.querySelector('[data-ai-workspace-mode="block"]')?.getAttribute('aria-pressed') === 'true');
        assert.equal(await page.locator('#blog-next-ai-editor .manuscript-image-block:has(.manuscript-image-block-placeholder)').count(), 1);
        await page.locator('[data-ai-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="ai"]')?.hidden === false);
        await page.locator('[data-ai-workspace-mode="block"]').click();
        const imageGenerateButton = page.locator('#blog-next-ai-editor [data-image-action="generate"][data-slot-id="image-1"]');
        await imageGenerateButton.click();
        await page.waitForFunction(() => document.querySelector('#blog-next-ai-editor [data-block-id] .manuscript-image-block-status:not([hidden])'));
        await page.waitForFunction(() => document.querySelector('#blog-next-ai-editor [data-image-action="generate"][data-slot-id="image-1"]')?.textContent?.trim() === '중지');
        assert.equal((await imageGenerateButton.textContent())?.trim(), '중지');
        await imageGenerateButton.click();
        assert.equal((await imageGenerateButton.textContent())?.trim(), '중지 확인');
        assert.equal(await page.locator('#blog-next-ai-editor [data-manuscript-image-continue]:visible').isVisible(), true);
        await page.waitForTimeout(6200);
        assert.equal((await imageGenerateButton.textContent())?.trim(), '중지 확인');
        assert.equal(await page.locator('#blog-next-ai-editor [data-manuscript-image-continue]:visible').isEnabled(), true);
        await imageGenerateButton.click();
        await page.waitForFunction(() => document.querySelector('#blog-next-ai-editor [data-image-action="generate"][data-slot-id="image-1"]')?.textContent?.trim() === '이미지');
        await imageGenerateButton.click();
        await page.waitForFunction(() => document.querySelector('#blog-next-ai-editor .manuscript-image-block[data-source-key="1"] .manuscript-image-block-image'));
        await page.locator('[data-ai-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="ai"]')?.hidden === false);
        assert.equal(await page.locator('#blog-next-post-status option[value="publish"]').evaluate((option) => option.disabled), false);
        assert.equal(await page.locator('#blog-next-post-status option[value="schedule"]').evaluate((option) => option.disabled), false);
        assert.equal(await page.locator('#blog-next-publish-safety-hint').isHidden(), true);
        await page.locator('#blog-next-post-status').selectOption('publish');
        assert.equal((await page.locator('[data-blog-next-draft-publish="ai"]').textContent())?.trim(), '즉시 발행');
        assert.equal(await page.locator('.blog-next-ai-prepare-actions').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-ai-idea-actions]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-ai-generate-action]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-ai-preview-actions]').isVisible(), true);
        assert.equal(await page.locator('#blog-next-regenerate-draft').isVisible(), true);
        await page.locator('#blog-next-regenerate-draft').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status-cancel')?.hidden === false);
        assert.equal(await page.locator('#blog-next-regenerate-draft').isDisabled(), true);
        await page.locator('[data-blog-next-tab="queue"]').click();
        await page.locator('[data-blog-next-tab="quick"]').click();
        assert.equal(await page.locator('#blog-next-publish-status-cancel').isVisible(), true);
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status-message')?.textContent?.includes('이미지를 준비'));
        await page.locator('#blog-next-publish-status-cancel').click();
        assert.equal((await page.locator('#blog-next-publish-status-cancel').textContent())?.trim(), '중지 확인');
        assert.equal(await page.locator('#blog-next-publish-status-continue').isVisible(), true);
        await page.locator('#blog-next-publish-status-continue').click();
        assert.equal((await page.locator('#blog-next-publish-status-cancel').textContent())?.trim(), '생성 중지');
        assert.equal(await page.locator('#blog-next-publish-status-continue').isHidden(), true);
        await page.locator('#blog-next-publish-status-cancel').click();
        assert.equal((await page.locator('#blog-next-publish-status-cancel').textContent())?.trim(), '중지 확인');
        await page.locator('#blog-next-publish-status-cancel').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'cancel_requested');
        assert.equal(await page.locator('#blog-next-regenerate-draft').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-publish-status-cancel').isDisabled(), true);
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'canceled');
        assert.equal((await page.locator('#blog-next-publish-status-message').textContent())?.trim(), '원고 생성을 중지했습니다.');
        assert.equal(await page.locator('#blog-next-publish-status-help').isVisible(), true);
        await page.locator('#blog-next-publish-status-help summary').hover();
        assert.equal(await page.locator('#blog-next-publish-status-help').evaluate((element) => element.open), true);
        await page.mouse.move(0, 0);
        await page.locator('#blog-next-publish-status-help summary').click();
        assert.match((await page.locator('#blog-next-publish-status-help-text').textContent()) || '', /비용이 발생할 수 있습니다/);
        assert.match((await page.locator('#blog-next-publish-status-help-text').textContent()) || '', /KIE에 접수된 이미지 작업/);
        assert.equal(await page.locator('#blog-next-regenerate-draft').isEnabled(), true);
        assert.equal((await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-title]').textContent())?.trim(), '미리 확인할 AI 원고');
        const aiDraftRequest = requests.find((request) => request.pathname === '/api/v1/blog/manuscript-drafts/ai/operations');
        assert.deepEqual(aiDraftRequest?.body?.targets, ['naver']);
        assert.equal(aiDraftRequest?.body?.subject, '미리 확인할 AI 원고');
        assert.equal(requests.some((request) => request.pathname === '/api/v1/continuous-publishing/topics' && request.body?.subject === '미리 확인할 AI 원고'), false);
        const aiPublishFailureRoute = async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: false, error: { message: '발행 요청 실패 검사' } })
            });
        };
        await page.route(`**/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`, aiPublishFailureRoute);
        await page.locator('[data-blog-next-draft-publish="ai"]').click();
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'failed');
        assert.match((await page.locator('#blog-next-publish-status-message').textContent()) || '', /발행 요청 실패 검사/);
        assert.doesNotMatch((await page.locator('[data-blog-next-draft-validation="ai"]').textContent()) || '', /발행 요청 실패 검사/);
        assert.doesNotMatch((await page.locator('#blog-next-topic-result').textContent()) || '', /발행 요청 실패 검사/);
        await page.unroute(`**/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`, aiPublishFailureRoute);
        const aiPublishDelayRoute = async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 450));
            await route.continue();
        };
        await page.route(`**/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`, aiPublishDelayRoute);
        const aiPublishResponse = page.waitForResponse((response) => (
            new URL(response.url()).pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`
        ));
        await page.locator('[data-blog-next-draft-publish="ai"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-message').textContent())?.trim(), '네이버 블로그에 지금 발행할까요?');
        assert.equal((await page.locator('#ui-dialog-confirm').textContent())?.trim(), '즉시 발행');
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-publish-status');
        assert.equal(await page.locator('#blog-next-publish-status-return').isVisible(), true);
        assert.equal(await page.locator('#blog-next-target-naver').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-post-status').isDisabled(), true);
        const aiPublishReturnScrollTop = await page.evaluate(() => blogNextStatusReturnScrollTop);
        await aiPublishResponse;
        await page.unroute(`**/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`, aiPublishDelayRoute);
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        assert.equal(await page.locator('#blog-next-publish-status-next').isVisible(), true);
        assert.equal(await page.locator('[data-blog-next-draft-publish="ai"]').isDisabled(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="ai"]').textContent())?.trim(), '네이버 처리 완료');
        assert.equal(await page.locator('#blog-next-subject').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-post-status').isEnabled(), true);
        assert.equal(await page.evaluate(() => {
            blogNextDraftState.ai.revision += 1;
            syncBlogNextDraftExecutionState();
            const blocked = document.querySelector('[data-blog-next-draft-publish="ai"]').disabled;
            blogNextDraftState.ai.revision -= 1;
            syncBlogNextDraftExecutionState();
            return blocked;
        }), true);
        await page.locator('#blog-next-publish-status-return').click();
        assert.equal(await page.locator('#blog-next-publish-settings > summary').evaluate((element) => document.activeElement === element), true);
        assert.equal(await page.locator('#blog-next-publish-settings > summary').isVisible(), true);
        assert.equal(await page.locator('.main').evaluate((element) => element.scrollTop), aiPublishReturnScrollTop);
        const aiPublishRequest = requests.find((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`);
        assert.equal(aiPublishRequest?.body?.draftId, MANUSCRIPT_DRAFT_ID);
        const lastAiDraftMutation = requests.slice(0, requests.indexOf(aiPublishRequest))
            .filter((request) => request.responseRevision != null && request.pathname.startsWith(`/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/`))
            .at(-1);
        assert.equal(aiPublishRequest?.body?.revision, lastAiDraftMutation?.responseRevision);
        assert.equal((await page.locator('[data-blog-next-draft-publish="ai"]').textContent())?.trim(), '네이버 처리 완료');
        assert.equal(await page.locator('#blog-next-subject').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-post-status').isEnabled(), true);
        await page.locator('#blog-next-subject').fill('다음 원고에 쓸 주제');
        assert.equal((await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-title]').textContent())?.trim(), '미리 확인할 AI 원고');
        await page.locator('#blog-next-post-status').selectOption('draft');
        assert.equal(await page.locator('[data-blog-next-draft-publish="ai"]').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-target-naver').isChecked(), true);
        assert.equal(await page.locator('#blog-next-target-wordpress').isDisabled(), false);
        // This scenario covers the WordPress publish path, so configure its
        // capability explicitly; the global smoke fixture intentionally starts
        // with WordPress unavailable for the setup/readiness checks.
        await page.evaluate(() => applyUiCapabilityStatus({ setup: {
            ai: { configured: true, image_configured: true },
            google: { configured: true },
            publishing_channel: { configured: true, naver_configured: true, wordpress_configured: true }
        } }));
        await page.evaluate(() => {
            const target = document.getElementById('blog-next-target-wordpress');
            window.__uiSmokeWordPressTargetEvents = [];
            window.__uiSmokeWordPressTargetNode = target;
            ['click', 'input', 'change'].forEach((type) => {
                document.addEventListener(type, (event) => {
                    if (type !== 'click' && event.target?.id !== 'blog-next-target-wordpress') return;
                    const clickTarget = type === 'click' ? event.target : null;
                    window.__uiSmokeWordPressTargetEvents.push({
                        type,
                        targetId: event.target?.id || '',
                        targetTag: event.target?.tagName || '',
                        closestRadioId: clickTarget?.closest?.('input[type="radio"]')?.id || '',
                        checked: document.getElementById('blog-next-target-wordpress')?.checked,
                        defaultPrevented: event.defaultPrevented
                    });
                }, true);
            });
        });
        // In headless Chromium, Playwright's coordinate click emitted pointer
        // and mouse down/up but no click for this native radio. DOM activation
        // exercises the same click/change handlers without that browser quirk.
        await page.locator('#blog-next-target-wordpress').evaluate((element) => element.click());
        const wordpressTargetAfterClick = await page.locator('#blog-next-target-wordpress').evaluate((element) => ({
            checked: element.checked,
            disabled: element.disabled,
            naverChecked: document.getElementById('blog-next-target-naver')?.checked,
            settingsOpen: document.getElementById('blog-next-publish-settings')?.open,
            sameNode: element === window.__uiSmokeWordPressTargetNode,
            events: window.__uiSmokeWordPressTargetEvents
        }));
        assert.equal(wordpressTargetAfterClick.checked, true, `WordPress target should stay selected after click: ${JSON.stringify(wordpressTargetAfterClick)}`);
        assert.equal(await page.locator('[data-blog-next-draft-publish="ai"]').isEnabled(), true);
        await page.locator('[data-blog-next-draft-publish="ai"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-message').textContent())?.trim(), '워드프레스에 지금 발행할까요?');
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        assert.deepEqual(await page.evaluate(() => blogNextDraftState.ai.preview.publishedTargets), ['naver', 'wordpress']);
        await page.locator('#blog-next-target-naver').check();
        assert.equal(await page.locator('[data-blog-next-draft-publish="ai"]').isDisabled(), true);
        await page.locator('#blog-next-publish-status-next').evaluate((element) => element.click());
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden')
          && document.getElementById('ui-dialog-message')?.textContent?.includes('블로그에 저장된 글은 그대로 유지됩니다'));
        assert.match((await page.locator('#ui-dialog-message').textContent()) || '', /블로그에 저장된 글은 그대로 유지됩니다/);
        await page.locator('#ui-dialog-cancel').click();
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-image-details]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-manuscript-image-slot]').count(), 0);
        assert.deepEqual(await page.evaluate(() => blogNextDraftState.ai.preview.publishedTargets), ['naver', 'wordpress']);
        await page.locator('[data-ai-workspace-mode="block"]').click();
        await page.locator('#blog-next-ai-editor .manuscript-image-block[data-source-key="1"] [aria-label="이미지 생성 프롬프트 편집"]')
            .fill('수정 후 새 버전 프롬프트');
        await page.waitForFunction(() => blogNextDraftState.ai.syncedPreviewKey === getBlogNextAiSyncKey()
            && blogNextDraftState.ai.previewSyncFailed === false);
        await page.locator('[data-ai-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="ai"]')?.hidden === false);
        assert.deepEqual(await page.evaluate(() => blogNextDraftState.ai.preview.publishedTargets), []);
        await page.locator('#blog-next-publish-status-next').evaluate((element) => element.click());
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden')
          && document.getElementById('ui-dialog-message')?.textContent?.includes('작성 중인 내용과 원고 미리보기를 지우고 새 글을 작성할까요?'));
        assert.match((await page.locator('#ui-dialog-message').textContent()) || '', /작성 중인 내용과 원고 미리보기를 지우고 새 글을 작성할까요\?/);
        await page.locator('#ui-dialog-cancel').click();
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '다음 원고에 쓸 주제');
        await page.locator('#blog-next-publish-status-next').evaluate((element) => element.click());
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-subject')?.value === ''
          && document.getElementById('blog-next-runner-headless')?.disabled === false);

        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.locator('#blog-next-subject').fill('먼저 실행할 글감');
        if (await page.locator('#blog-next-publish-settings').isHidden()) {
            await page.locator('#blog-next-enqueue-topic').click();
        }
        if (!await page.locator('#blog-next-publish-settings').evaluate((element) => element.open)) {
            await page.locator('#blog-next-publish-settings summary').click();
        }
        if (!await page.locator('#blog-next-runner-headless').isChecked()) {
            await page.locator('#blog-next-runner-headless').check();
        }
        await page.locator('#blog-next-post-status').selectOption('draft');
        await page.locator('#blog-next-enqueue-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('대기열에 추가했습니다'));
        await page.locator('#blog-next-subject').fill('나중 실행할 글감');
        if (await page.locator('#blog-next-publish-settings').isHidden()) {
            await page.locator('#blog-next-enqueue-topic').click();
        }
        await page.locator('#blog-next-enqueue-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('대기열에 추가했습니다'));
        await page.locator('[data-blog-next-tab="queue"]').click();
        await page.locator('[data-blog-next-management-tab="ready"]').click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 2);
        const readyCards = page.locator('#blog-next-queue-list .blog-next-queue-item');
        assert.equal(await readyCards.nth(0).locator('[data-blog-next-queue-move="up"]').isDisabled(), true);
        assert.equal(await readyCards.nth(0).locator('[data-blog-next-queue-move="down"]').isDisabled(), false);
        assert.equal(await readyCards.nth(1).locator('[data-blog-next-queue-move="down"]').isDisabled(), true);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await readyCards.nth(0).locator('[data-blog-next-queue-move="down"]').click();
        await page.waitForFunction(() => document.querySelector('#blog-next-queue-list .blog-next-queue-item strong')?.textContent === '나중 실행할 글감');
        assert.equal((await page.locator('#ui-toast-container').textContent()).includes('순서 변경 완료'), false);
        assert.equal(await page.locator('#blog-next-queue-list .blog-next-queue-item').nth(0).locator('[data-blog-next-queue-move="up"]').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-queue-list .blog-next-queue-item').nth(1).locator('[data-blog-next-queue-move="down"]').isDisabled(), true);
        await page.locator('#blog-next-queue-list .blog-next-queue-item').nth(1).locator('[data-blog-next-queue-move="up"]').click();
        await page.waitForFunction(() => document.querySelector('#blog-next-queue-list .blog-next-queue-item strong')?.textContent === '먼저 실행할 글감');
        assert.equal(await page.locator('#blog-next-queue-list .blog-next-queue-item').nth(0).locator('[data-blog-next-queue-move="up"]').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-queue-list .blog-next-queue-item').nth(1).locator('[data-blog-next-queue-move="down"]').isDisabled(), true);
        const reorderRequests = requests.filter((request) => request.pathname === '/api/v1/continuous-publishing/queue/reorder');
        assert.deepEqual(reorderRequests.map(request => request.body?.direction), ['down', 'up']);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await page.locator('#blog-next-queue-list .blog-next-queue-item').nth(1).locator('button', { hasText: '보관으로 이동' }).click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 1);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await page.locator('[data-blog-next-run-now]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-message').textContent())?.includes('임시 저장'), true);
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.querySelector('#blog-next-queue-list .blog-next-queue-item')?.classList.contains('is-running'));
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item').textContent()).includes('처리 중'), true);
        await page.evaluate(() => loadGlobalPublishingStatus());
        await page.waitForFunction(() => (
            document.querySelector('#view-blog-next [data-global-publishing-status]')?.textContent?.includes('발행 중')
        ));
        assert.equal(await page.locator('#blog-next-global-nav-status').isHidden(), false);
        assert.equal(await page.locator('#blog-next-global-nav-status').getAttribute('data-state'), 'running');
        assert.equal(
            await page.locator('#blog-next-global-nav-status').evaluate((element) => getComputedStyle(element).backgroundColor),
            'rgb(250, 252, 250)'
        );
        assert.equal(
            await page.locator('#blog-next-queue-list .blog-next-queue-actions button').evaluateAll(buttons => buttons.every(button => button.disabled)),
            true
        );
        assert.equal(await page.locator('#blog-next-queue-list .blog-next-queue-copy').isDisabled(), true);
        assert.equal(await page.locator('[data-blog-next-run-now]').evaluate(button => getComputedStyle(button).cursor), 'not-allowed');
        assert.equal(Number(await page.locator('[data-blog-next-run-now]').evaluate(button => getComputedStyle(button).opacity)) < 1, true);
        assert.equal(await page.locator('#blog-next-automation-test').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-automation-test').evaluate(button => getComputedStyle(button).cursor), 'not-allowed');
        assert.equal(await page.locator('.blog-next-management-actions [data-blog-next-runner-status-jump]').count(), 0);
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 0, null, { timeout: 10000 });
        await page.waitForFunction(() => document.querySelector('.app-celebration-message')?.textContent.includes('글쓰기 완료'));
        await page.waitForTimeout(100);
        const selectedRunnerRequest = requests.filter((request) => (
            request.pathname === '/api/v1/continuous-publishing/runner/start'
            && Number.isInteger(request.body?.rowIndex)
        )).at(-1);
        assert.equal(selectedRunnerRequest?.body?.headless, true);
        assert.equal(requests.some((request) => (
            request.pathname === '/api/v1/system/ui-event'
            && request.body?.event === 'posting_completion_effect'
            && request.body?.stage === 'displayed'
            && request.body?.postStatus === 'draft'
        )), true);

        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await page.locator('[data-blog-next-tab="smart-comment"]').click();
        await page.waitForFunction(() => document.getElementById('blog-next-smart-comment-run')?.disabled === false);
        assert.equal((await page.locator('#blog-next-smart-comment-settings-summary').textContent())?.trim(), '글쓰기 모델 사용');
        await page.locator('.blog-next-smart-comment-details summary').click();
        await page.locator('#blog-next-smart-comment-ai-mode').selectOption('custom');
        assert.equal((await page.locator('#blog-next-smart-comment-settings-summary').textContent())?.trim(), 'Chat Model 사용');
        assert.equal(await page.locator('#blog-next-smart-comment-save').isDisabled(), false);
        await page.locator('[data-blog-next-tab="queue"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-title').textContent())?.trim(), '스마트 댓글 설정 변경사항');
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-panel-queue')?.hidden === false);
        await page.locator('[data-blog-next-management-tab="automation"]').click();
        await page.waitForFunction(() => document.getElementById('blog-next-management-panel-automation')?.hidden === false);
        assert.equal(await page.locator('#blog-next-management-panel-automation').evaluate((element) => element.hidden), false);
        await page.waitForFunction(() => document.getElementById('blog-next-automation-form')?.dataset.loaded === 'true');
        reportSmokePhase('Checking Blog Beta automation settings and persistence');
        assert.equal(await page.locator('#blog-next-automation-status').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-automation-save').isDisabled(), true);
        assert.deepEqual(
            await page.locator('#blog-next-automation-save').evaluate((button) => ({
                cursor: getComputedStyle(button).cursor,
                visuallyMuted: Number(getComputedStyle(button).opacity) < 1
            })),
            { cursor: 'not-allowed', visuallyMuted: true }
        );
        assert.equal(await page.locator('#blog-next-automation-interval').isDisabled(), true);
        await page.locator('#blog-next-automation-enabled').check();
        assert.equal(await page.locator('#blog-next-automation-interval').isEnabled(), true);
        await page.locator('#blog-next-automation-interval').fill('61');
        assert.equal(await page.locator('#blog-next-automation-save').isDisabled(), false);
        await page.locator('[data-blog-next-management-tab="saved"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-title').textContent())?.trim(), '연속 발행 설정 변경사항');
        await page.locator('#ui-dialog-cancel').click();
        await page.waitForFunction(() => document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal(await page.locator('#blog-next-management-panel-automation').evaluate((element) => element.hidden), false);
        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-message').textContent())?.includes('저장하지 않고 이동'), true);
        await page.locator('#ui-dialog-cancel').click();
        await page.waitForFunction(() => document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal(await page.locator('#blog-next-management-panel-automation').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-automation-interval').inputValue(), '61');
        await page.locator('.nav-btn[data-view="dashboard-beta"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-cancel').click();
        await page.waitForFunction(() => document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal(await page.locator('#view-blog-next').evaluate((element) => element.classList.contains('active')), true);
        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-panel-quick')?.hidden === false);
        await page.locator('[data-blog-next-tab="queue"]').click();
        await page.locator('[data-blog-next-management-tab="automation"]').click();
        await page.waitForFunction(() => document.getElementById('blog-next-management-panel-automation')?.hidden === false);
        assert.equal(await page.locator('#blog-next-automation-interval').inputValue(), '60');
        assert.equal(await page.locator('#blog-next-automation-interval').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-automation-save').isDisabled(), true);
        await page.locator('#blog-next-automation-enabled').check();
        await page.locator('#blog-next-automation-start-time').fill('09:00');
        await page.locator('#blog-next-automation-end-time').fill('21:00');
        await page.locator('#blog-next-automation-interval').fill('90');
        await page.locator('#blog-next-automation-notify').check();
        await page.locator('#blog-next-automation-save').click();
        await page.waitForFunction(() => document.getElementById('blog-next-automation-feedback')?.dataset.state === 'success');
        assert.equal((await page.locator('#blog-next-automation-feedback').textContent())?.trim(), '설정을 저장했습니다.');
        await page.waitForFunction(() => document.getElementById('blog-next-automation-status')?.dataset.state === 'waiting');
        assert.equal(await page.locator('#blog-next-automation-save').isDisabled(), true);
        assert.equal((await page.locator('#blog-next-automation-status').textContent())?.includes('다음 실행'), true);
        assert.equal(await page.locator('#blog-next-automation-test').isVisible(), true);

        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.evaluate(() => activateBlogNextInputMode('ai'));
        await page.locator('#blog-next-subject').fill('예상 시간 표시 글감');
        if (await page.locator('#blog-next-publish-settings').isHidden()) {
            await page.locator('#blog-next-enqueue-topic').click();
        }
        await page.locator('#blog-next-post-status').selectOption('draft');
        await page.locator('#blog-next-enqueue-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('대기열에 추가했습니다'));
        await page.locator('[data-blog-next-tab="queue"]').click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 1);
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item').textContent()).includes('다음 처리'), true);
        await page.waitForFunction(() => (
            document.querySelector('#view-blog-next [data-global-publishing-status]')?.textContent?.includes('다음 처리')
        ));
        assert.equal(await page.locator('#blog-next-global-nav-status').isHidden(), true);
        await page.locator('[data-blog-next-tab="quick"]').click();
        reportSmokePhase('Checking local manuscript import and publish flows');
        await page.evaluate(() => activateBlogNextInputMode('folder'));
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').inputValue(), 'draft');
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').selectOption('publish');
        await page.locator('#blog-next-folder-input').setInputFiles(manuscriptFixtureDir);
        await page.waitForFunction(() => (
            document.querySelector('[data-folder-editor-workspace]')?.hidden === false
            && document.querySelectorAll('#blog-next-folder-editor .manuscript-image-block').length === 2
        ));
        assert.equal(await page.locator('#blog-next-folder-markdown').isHidden(), true);
        await page.locator('[data-folder-workspace-mode="markdown"]').click();
        assert.equal((await page.locator('#blog-next-folder-markdown').inputValue()).includes('[[IMAGE_1'), true);
        await page.locator('[data-folder-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="folder"]')?.hidden === false);
        assert.equal(await page.locator('[data-folder-workspace-mode="view"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-details]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-slot]').count(), 0);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').inputValue(), 'draft');
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"] option[value="publish"]').evaluate((option) => option.disabled), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"] option[value="schedule"]').evaluate((option) => option.disabled), true);
        assert.match((await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-image-safety-hint]').textContent()) || '', /미지정 이미지 1개가 있습니다\. 지금은 임시 저장만 가능합니다\./);
        await page.evaluate(() => applyUiCapabilityStatus({ setup: {
            ai: { configured: true, image_configured: false },
            google: { configured: true },
            publishing_channel: { configured: true, naver_configured: true, wordpress_configured: true }
        } }));
        assert.equal(await page.locator('#blog-next-folder-editor [data-image-action="generate"]').first().isDisabled(), true);
        assert.equal(await page.locator('[data-blog-next-draft-publish="folder"]').isEnabled(), true);
        assert.match((await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-image-safety-hint]').textContent()) || '', /미지정 이미지 1개가 있습니다\. 지금은 임시 저장만 가능합니다\./);
        await page.evaluate(() => applyUiCapabilityStatus({ setup: {
            ai: { configured: true, image_configured: true },
            google: { configured: true },
            publishing_channel: { configured: true, naver_configured: true, wordpress_configured: true }
        } }));
        await page.locator('[data-blog-next-mode-panel="folder"] [aria-describedby="blog-next-help-post-status"]').focus();
        assert.equal(await page.locator('#blog-next-help-post-status').isVisible(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '블로그에 임시 저장');
        await page.evaluate(() => {
            document.querySelector('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').value = 'draft';
            syncBlogNextDraftExecutionState();
        });
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '블로그에 임시 저장');
        await page.locator('[data-blog-next-draft-publish="folder"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-message').textContent())?.trim(), '네이버 블로그에 임시 저장할까요?');
        await page.locator('#ui-dialog-cancel').click();
        await page.locator('[data-folder-workspace-mode="block"]').click();
        await page.locator('#blog-next-folder-editor .manuscript-image-block[data-source-key="1"] input[type="file"]').setInputFiles(manuscriptFixtureImage);
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="folder"] [data-draft-preview-body] img'));
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"] option[value="publish"]').evaluate((option) => option.disabled), false);
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').selectOption('publish');
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '즉시 발행');
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-body] img').count(), 2);
        await page.locator('[data-blog-next-draft-publish="folder"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.match((await page.locator('#ui-dialog-message').textContent()) || '', /네이버 블로그에 지금 발행할까요/);
        assert.equal((await page.locator('#ui-dialog-confirm').textContent())?.trim(), '즉시 발행');
        assert.doesNotMatch((await page.locator('#ui-dialog-message').textContent()) || '', /AI로 생성합니다/);
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-details]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-body] img').count(), 2);
        const preparedFolderPublishRequest = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`).at(-1);
        const lastFolderImageImport = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/image-slots/image-1/import`).at(-1);
        const lastFolderDraftMutation = requests.slice(0, requests.indexOf(preparedFolderPublishRequest)).filter((request) => request.responseRevision != null && request.pathname.startsWith(`/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/`)).at(-1);
        assert.ok(lastFolderImageImport, 'folder image import request should be recorded');
        assert.equal(preparedFolderPublishRequest?.body?.revision, lastFolderDraftMutation?.responseRevision);
        await page.evaluate(() => document.querySelectorAll('.app-celebration').forEach((element) => element.remove()));
        await page.locator('#blog-next-folder-input').setInputFiles(manuscriptFixtureDir);
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-folder-editor .manuscript-image-block').length === 2);
        await page.locator('[data-folder-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-details]')?.hidden === true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-slot]').count(), 0);
        await page.waitForFunction(() => document.querySelector('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"] option[value="publish"]')?.disabled === true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"] option[value="publish"]').evaluate((option) => option.disabled), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').inputValue(), 'draft');
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '블로그에 임시 저장');
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-body] img').count(), 1);

        await page.evaluate(() => activateBlogNextInputMode('paste'));
        let delayedPasteMarkdownMarker = '';
        await page.route(`**/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/markdown`, async (route) => {
            if (delayedPasteMarkdownMarker && route.request().postData()?.includes(delayedPasteMarkdownMarker)) {
                delayedPasteMarkdownMarker = '';
                await new Promise((resolve) => setTimeout(resolve, 350));
            }
            await route.fallback();
        });
        const pasteWorkflowSteps = page.locator('[data-blog-next-mode-panel="paste"] .blog-next-workflow-step-head');
        assert.equal(await pasteWorkflowSteps.count(), 2);
        assert.deepEqual(await pasteWorkflowSteps.locator('strong').allTextContents(), ['원고', '발행']);
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"]').evaluate((element) => element.closest('.blog-next-paste-field') !== null), true);
        assert.deepEqual(await page.locator('[data-paste-workspace-mode]').allTextContents(), ['블록', 'Markdown', '보기']);
        const pastedManuscript = '# 붙여넣은 원고\n\nQueue를 거치지 않고 바로 실행합니다.\n\n[[IMAGE\ntitle: 붙여넣기 이미지\nprompt: 따뜻한 분위기의 이미지\n]]';
        await page.locator('#blog-next-paste-editor .ProseMirror').click();
        await page.evaluate((markdown) => {
            const target = document.querySelector('#blog-next-paste-editor .ProseMirror');
            const clipboardData = new DataTransfer();
            clipboardData.setData('text/plain', markdown);
            target.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
        }, pastedManuscript);
        await page.waitForFunction(() => (
            document.querySelector('#blog-next-paste-markdown')?.value?.startsWith('# 붙여넣은 원고')
            && document.querySelector('#blog-next-paste-editor .manuscript-image-block')?.dataset.sourceKey === '0'
            && document.querySelector('#blog-next-paste-markdown')?.value?.includes('- [추천 글](https://example.com/related)')
        ));
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block').count(), 1);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-header').getByText('이미지 블록').count(), 1);
        assert.equal(await page.locator('#blog-next-paste-editor [aria-label="이미지 제목 편집"]').inputValue(), '붙여넣기 이미지');
        assert.equal(await page.locator('#blog-next-paste-editor [aria-label="이미지 생성 프롬프트 편집"]').inputValue(), '따뜻한 분위기의 이미지');
        assert.equal(await page.locator('#blog-next-paste-editor [data-image-action="generate"]').isVisible(), true);
        assert.equal(await page.locator('#blog-next-paste-editor [data-image-action="pick"]').isVisible(), true);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-delete').getAttribute('aria-label'), '이미지 블록 삭제');
        assert.deepEqual(await page.locator('#blog-next-paste-editor .manuscript-image-block-move').allTextContents(), ['↑', '↓']);
        assert.deepEqual(await page.locator('#blog-next-paste-editor .manuscript-image-block-move').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))), ['위로 이동', '아래로 이동']);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-structure-actions [aria-label="이미지 블록 삭제"]').count(), 1);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-main').evaluate((main) => {
            const children = [...main.children];
            return children[0].classList.contains('manuscript-image-block-media')
                && children[1].classList.contains('manuscript-image-block-fields');
        }), true);
        const imageBlockVisuals = await page.locator('#blog-next-paste-editor .manuscript-image-block').evaluate((block) => {
            const main = block.querySelector('.manuscript-image-block-main');
            const media = block.querySelector('.manuscript-image-block-media');
            const fields = block.querySelector('.manuscript-image-block-fields');
            const prompt = block.querySelector('.manuscript-image-block-fields textarea');
            const guidanceLabel = block.querySelector('.manuscript-image-block-prompt-guidance-label');
            const guidanceInput = block.querySelector('.manuscript-image-block-prompt-guidance');
            const promptButton = block.querySelector('.manuscript-image-block-generate-prompt');
            const blockStyle = getComputedStyle(block);
            const mediaStyle = getComputedStyle(media);
            const tokenProbe = document.createElement('span');
            tokenProbe.style.position = 'absolute';
            tokenProbe.style.backgroundColor = 'var(--ui-surface)';
            tokenProbe.style.borderColor = 'var(--ui-border-default)';
            block.append(tokenProbe);
            const expectedMediaBackground = getComputedStyle(tokenProbe).backgroundColor;
            const expectedMediaBorder = getComputedStyle(tokenProbe).borderTopColor;
            tokenProbe.remove();
            const desktopColumns = getComputedStyle(main).gridTemplateColumns.trim().split(/\s+/).length;
            const desktopMediaRect = media.getBoundingClientRect();
            const desktopFieldsRect = fields.getBoundingClientRect();
            const promptRect = prompt.getBoundingClientRect();
            const inputRect = guidanceInput.getBoundingClientRect();
            const buttonRect = promptButton.getBoundingClientRect();
            const previousWidth = block.style.width;
            block.style.width = '480px';
            const compactColumns = getComputedStyle(main).gridTemplateColumns.trim().split(/\s+/).length;
            block.style.width = previousWidth;
            return {
                borderStyle: blockStyle.borderTopStyle,
                containerType: blockStyle.containerType,
                desktopColumns,
                compactColumns,
                mediaRatio: mediaStyle.aspectRatio,
                mediaBackground: mediaStyle.backgroundColor,
                mediaBorder: mediaStyle.borderTopColor,
                expectedMediaBackground,
                expectedMediaBorder,
                placeholderIconCount: block.querySelectorAll('.manuscript-image-block-placeholder-icon').length,
                placeholderWaveCount: block.querySelectorAll('.manuscript-image-block-placeholder-waves path').length,
                mediaBeforeFields: desktopMediaRect.left < desktopFieldsRect.left,
                mediaWiderThanFields: desktopMediaRect.width > desktopFieldsRect.width,
                promptAlignedWithMediaBottom: Math.abs(promptRect.bottom - desktopMediaRect.bottom) <= 2,
                guidanceLabelOneLine: guidanceLabel.getBoundingClientRect().height < inputRect.height,
                guidanceControlsSameHeight: Math.abs(inputRect.height - buttonRect.height) <= 1,
                guidanceControlsCentered: Math.abs((inputRect.top + inputRect.bottom) / 2 - (buttonRect.top + buttonRect.bottom) / 2) <= 1
            };
        });
        assert.equal(imageBlockVisuals.borderStyle, 'solid');
        assert.equal(imageBlockVisuals.containerType, 'inline-size');
        assert.equal(imageBlockVisuals.desktopColumns, 2);
        assert.equal(imageBlockVisuals.compactColumns, 1);
        assert.equal(imageBlockVisuals.mediaRatio, '4 / 3');
        assert.equal(imageBlockVisuals.mediaBackground, imageBlockVisuals.expectedMediaBackground);
        assert.equal(imageBlockVisuals.mediaBorder, imageBlockVisuals.expectedMediaBorder);
        assert.equal(imageBlockVisuals.placeholderIconCount, 1);
        assert.equal(imageBlockVisuals.placeholderWaveCount, 3);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-generate-prompt').getAttribute('class'), 'ui-text-action compact manuscript-image-block-generate-prompt ui-ai-action-button');
        assert.equal(imageBlockVisuals.mediaBeforeFields, true);
        assert.equal(imageBlockVisuals.mediaWiderThanFields, true);
        assert.equal(imageBlockVisuals.promptAlignedWithMediaBottom, true);
        assert.equal(imageBlockVisuals.guidanceLabelOneLine, true);
        assert.equal(imageBlockVisuals.guidanceControlsSameHeight, true);
        assert.equal(imageBlockVisuals.guidanceControlsCentered, true);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-media .manuscript-image-block-media-actions.is-empty button[data-image-action="generate"]').isVisible(), true);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-media .manuscript-image-block-pick').getAttribute('aria-label'), '내 이미지에서 선택');
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-media .manuscript-image-block-expand').isHidden(), true);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block > .manuscript-image-block-media-actions').count(), 0);
        assert.match(await page.locator('#blog-next-paste-markdown').inputValue(), /\[\[IMAGE_0/);
        assert.equal(await page.locator('#blog-next-paste-editor .ProseMirror a').textContent(), '추천 글');
        // Slash-command behavior was manually accepted; keep it out of this long browser smoke
        // so a flaky editor cursor/menu interaction cannot prevent later publish-flow checks.
        assert.equal(await page.locator('[data-paste-workspace-mode="block"]').evaluate((button) => button.closest('.manuscript-editor-sticky-rail') !== null), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] .manuscript-editor-sticky-rail').evaluate((rail) => {
            const mode = rail.querySelector('.manuscript-editor-mode');
            const toolbar = rail.querySelector('.manuscript-editor-toolbar');
            const buttons = [...mode.querySelectorAll('button')].map((button) => button.getBoundingClientRect());
            return getComputedStyle(rail).position === 'sticky'
                && toolbar.getBoundingClientRect().left > rail.getBoundingClientRect().left
                && mode.getBoundingClientRect().left > toolbar.getBoundingClientRect().right
                && mode.getBoundingClientRect().right < rail.getBoundingClientRect().right
                && buttons.every((button) => Math.abs(button.top - buttons[0].top) < 2);
        }), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] .manuscript-editor-mode').evaluate((mode) => getComputedStyle(mode).borderRadius), '9999px');
        assert.equal(await page.locator('[data-manuscript-command="bold"]').isVisible(), true);
        assert.equal(await page.locator('[data-manuscript-command="bold"]').evaluate((toolbar) => Boolean(
            toolbar.closest('.manuscript-editor-toolbar').compareDocumentPosition(document.querySelector('#blog-next-paste-editor'))
                & Node.DOCUMENT_POSITION_FOLLOWING
        )), true);
        const latestPrompt = 'prompt 저장 경합을 검증하는 최신 이미지 설명';
        delayedPasteMarkdownMarker = latestPrompt;
        await page.locator('#blog-next-paste-editor [aria-label="이미지 생성 프롬프트 편집"]').fill(latestPrompt);
        const imageOperationResponse = page.waitForResponse((response) => response.request().method() === 'POST'
            && response.url().endsWith('/api/v1/blog/manuscript-drafts/image-operations'));
        await page.locator('#blog-next-paste-editor [data-image-action="generate"]').click();
        await imageOperationResponse;
        await page.waitForFunction(() => {
            const block = document.querySelector('#blog-next-paste-editor .manuscript-image-block');
            return block?.querySelector('[data-image-action="generate"]')?.textContent === '중지'
                && !block.querySelector('.manuscript-image-block-status')?.hidden;
        });
        assert.doesNotMatch(await page.locator('#blog-next-paste-editor .manuscript-image-block-artwork').innerText(), /AI 이미지 생성 중/);
        const saveAndGenerateRequests = requests.filter((request) => (
            request.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/markdown`
            || request.pathname === '/api/v1/blog/manuscript-drafts/image-operations'
        ));
        const latestPromptSaveIndex = saveAndGenerateRequests.findLastIndex((request) => (
            request.pathname.endsWith('/markdown') && request.body?.markdownText?.includes(latestPrompt)
        ));
        const imageGenerationIndex = saveAndGenerateRequests.findLastIndex((request) => request.pathname === '/api/v1/blog/manuscript-drafts/image-operations');
        assert.ok(latestPromptSaveIndex >= 0, 'latest prompt should be persisted in the manuscript before generation');
        assert.ok(imageGenerationIndex > latestPromptSaveIndex, 'image generation should start after the latest manuscript save');
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-status .local-markdown-image-spinner').isVisible(), true);
        const generationStatusPosition = await page.locator('#blog-next-paste-editor .manuscript-image-block-status-copy').evaluate((copy) => {
            const rect = copy.getBoundingClientRect();
            const media = copy.closest('.manuscript-image-block-status').getBoundingClientRect();
            return { top: rect.top - media.top, left: rect.left - media.left, width: rect.width, height: rect.height };
        });
        await page.locator('#blog-next-paste-editor [data-image-action="generate"]').click();
        assert.equal(await page.locator('#blog-next-paste-editor [data-image-action="generate"]').textContent(), '중지 확인');
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-media-actions button').filter({ hasText: '계속 진행' }).isVisible(), true);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-status').innerText().then((text) => /\b\d+\/\d+\b/.test(text)), false);
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-status-message').innerText(), 'AI 이미지 생성 중');
        assert.deepEqual(await page.locator('#blog-next-paste-editor .manuscript-image-block-status-copy').evaluate((copy) => {
            const rect = copy.getBoundingClientRect();
            const media = copy.closest('.manuscript-image-block-status').getBoundingClientRect();
            return { top: rect.top - media.top, left: rect.left - media.left, width: rect.width, height: rect.height };
        }), generationStatusPosition, 'status copy should not move within the image area when stop confirmation appears');
        assert.equal(await page.locator('#blog-next-paste-editor .manuscript-image-block-media-actions').evaluate((actions) => {
            const buttons = [...actions.querySelectorAll('button')].filter((button) => !button.hidden);
            return buttons.findIndex((button) => button.textContent === '계속 진행')
                === buttons.findIndex((button) => button.dataset.imageAction === 'pick') - 1;
        }), true);
        await page.locator('#blog-next-paste-editor .manuscript-image-block-media-actions button').filter({ hasText: '계속 진행' }).click();
        assert.equal(await page.locator('#blog-next-paste-editor [data-image-action="generate"]').textContent(), '중지');
        await page.locator('#blog-next-paste-editor [data-image-action="generate"]').click();
        await page.locator('#blog-next-paste-editor [data-image-action="generate"]').click();
        await page.waitForFunction(() => document.querySelector('#blog-next-paste-editor .manuscript-image-block-status')?.hidden === true);
        await page.evaluate(() => window.scrollTo(0, 0));
        const modeButtonBeforeSwitch = await page.locator('[data-paste-workspace-mode="markdown"]').evaluate((button) => ({
            top: button.getBoundingClientRect().top,
            scrollY: window.scrollY
        }));
        await page.locator('[data-paste-workspace-mode="markdown"]').click();
        assert.equal(await page.evaluate(() => document.activeElement?.dataset?.pasteWorkspaceMode), 'markdown');
        assert.equal(await page.evaluate(() => window.scrollY), modeButtonBeforeSwitch.scrollY);
        assert.equal(await page.locator('[data-paste-workspace-mode="markdown"]').evaluate((button) => button.getBoundingClientRect().top), modeButtonBeforeSwitch.top);
        assert.equal(await page.locator('#blog-next-paste-markdown').isVisible(), true);
        assert.match(await page.locator('#blog-next-paste-markdown').inputValue(), /- \[추천 글\]\(https:\/\/example\.com\/related\)/);
        assert.equal(await page.locator('#blog-next-paste-editor').isVisible(), false);
        assert.equal(await page.locator('[data-manuscript-command="bold"]').isVisible(), false);
        assert.equal(await page.locator('[data-paste-workspace-mode="view"]').isVisible(), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] .manuscript-editor-sticky-rail').evaluate((rail) => {
            const mode = rail.querySelector('.manuscript-editor-mode');
            return rail.getBoundingClientRect().right - mode.getBoundingClientRect().right
                - parseFloat(getComputedStyle(rail).paddingRight) < 2;
        }), true);
        assert.equal(await page.locator('[data-paste-workspace-mode="markdown"]').getAttribute('aria-pressed'), 'true');
        await page.locator('#blog-next-paste-markdown').fill(`${await page.locator('#blog-next-paste-markdown').inputValue()}\n\nMarkdown 편집 확인 문장입니다.`);
        await page.locator('[data-paste-workspace-mode="block"]').click();
        assert.equal(await page.locator('#blog-next-paste-markdown').isVisible(), false);
        assert.equal(await page.locator('#blog-next-paste-editor').isVisible(), true);
        assert.match(await page.locator('#blog-next-paste-editor .ProseMirror').innerText(), /Markdown 편집 확인 문장입니다/);
        assert.equal(await page.locator('[data-paste-workspace-mode="block"]').getAttribute('aria-pressed'), 'true');
        await page.locator('[data-paste-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="paste"]')?.hidden === false);
        await page.locator('[data-paste-workspace-mode="markdown"]').click();
        const longManuscriptTail = Array.from({ length: 32 }, (_value, index) => `추가 원고 ${index + 1}`).join('\n\n');
        const delayedPasteMarkdown = `${await page.locator('#blog-next-paste-markdown').inputValue()}\n\n${longManuscriptTail}\n\n첫 번째 저장 요청입니다.`;
        delayedPasteMarkdownMarker = '첫 번째 저장 요청입니다.';
        const delayedPasteSync = page.waitForRequest((request) => request.method() === 'POST'
            && request.url().endsWith(`/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/markdown`));
        await page.locator('#blog-next-paste-markdown').fill(delayedPasteMarkdown);
        assert.equal(await page.locator('#blog-next-paste-markdown').evaluate((textarea) => textarea.scrollHeight <= textarea.clientHeight + 2), true);
        await delayedPasteSync;
        await page.locator('#blog-next-paste-markdown').fill(`${delayedPasteMarkdown}\n\n마지막 편집 내용입니다.`);
        await page.locator('[data-paste-workspace-mode="block"]').click();
        await page.evaluate(() => {
            const main = document.querySelector('.main');
            const rail = document.querySelector('[data-blog-next-mode-panel="paste"] .manuscript-editor-sticky-rail');
            main.scrollTop = rail.getBoundingClientRect().top + main.scrollTop + 600;
        });
        await page.waitForTimeout(30);
        await page.locator('.main').evaluate((main) => { main.scrollTop += 1200; });
        await page.waitForTimeout(30);
        const stickyRailPosition = await page.locator('[data-blog-next-mode-panel="paste"] .manuscript-editor-sticky-rail').evaluate((rail) => {
            const main = rail.closest('.main');
            return {
                top: rail.getBoundingClientRect().top,
                expectedTop: main.getBoundingClientRect().top
                    + parseFloat(getComputedStyle(main).paddingTop)
                    + parseFloat(getComputedStyle(rail).top)
            };
        });
        await page.locator('.main').evaluate((main) => { main.scrollTop += 160; });
        await page.waitForTimeout(30);
        const stickyRailTopAfterMoreScroll = await page.locator('[data-blog-next-mode-panel="paste"] .manuscript-editor-sticky-rail').evaluate((rail) => rail.getBoundingClientRect().top);
        assert.ok(Math.abs(stickyRailPosition.top - stickyRailPosition.expectedTop) < 3
            && Math.abs(stickyRailTopAfterMoreScroll - stickyRailPosition.top) < 2,
        'sticky toolbar should reach and keep its layout-derived position while scrolling');
        await page.setViewportSize({ width: 700, height: 900 });
        await page.waitForTimeout(40);
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] .manuscript-editor-sticky-rail').evaluate((rail) => {
            const main = rail.closest('.main');
            const topbar = document.querySelector('.mobile-topbar');
            const measuredHeight = parseFloat(getComputedStyle(main).getPropertyValue('--mobile-topbar-block-size'));
            return Math.abs(measuredHeight - topbar.getBoundingClientRect().height) < 1
                && Math.abs(parseFloat(getComputedStyle(rail).paddingLeft)) > 0;
        }), true);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.waitForTimeout(40);
        assert.equal(await page.locator('[data-paste-workspace-mode="view"]').isVisible(), true);
        await page.locator('[data-paste-workspace-mode="view"]').click();
        assert.equal(await page.locator('[data-paste-workspace-mode="view"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] .manuscript-editor-sticky-rail').evaluate((rail) => {
            const mode = rail.querySelector('.manuscript-editor-mode');
            return rail.getBoundingClientRect().right - mode.getBoundingClientRect().right
                - parseFloat(getComputedStyle(rail).paddingRight) < 2;
        }), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body]').evaluate((body) => getComputedStyle(body).maxHeight), 'none');
        await page.waitForFunction(() => (
            document.querySelector('[data-blog-next-draft-preview="paste"]')?.hidden === false
            && document.querySelector('[data-blog-next-draft-preview="paste"] [data-draft-preview-body]')?.textContent?.includes('마지막 편집 내용입니다')
            && document.querySelector('[data-blog-next-draft-preview="paste"] [data-draft-preview-image-details]')?.hidden === true
        ));
        const latestPasteMarkdownSync = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/markdown`).at(-1);
        assert.match(latestPasteMarkdownSync?.body?.markdownText || '', /마지막 편집 내용입니다/);
        assert.doesNotMatch((await page.locator('[data-blog-next-draft-validation="paste"]').textContent()) || '', /다른 작업으로 변경/);
        assert.equal(await page.locator('#blog-next-paste-editor').isVisible(), false);
        assert.equal(await page.locator('#blog-next-paste-markdown').isVisible(), false);
        assert.equal(await page.locator('[data-manuscript-command="bold"]').isVisible(), false);
        assert.equal(await page.locator('[data-paste-workspace-mode="view"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-blog-next-draft-validation="paste"]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] a[href="https://example.com/related"]').textContent(), '추천 글');
        assert.equal(await page.locator('#blog-next-paste-clear').count(), 0);
        assert.equal(await page.locator('#blog-next-paste-clear-undo').count(), 0);
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-title]').textContent())?.trim(), '붙여넣은 원고');
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] h2').first().textContent())?.trim(), '미리보기 소제목');
        const pasteImagePromptText = page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] .image-caption-prompt');
        assert.equal((await pasteImagePromptText.textContent())?.trim(), '따뜻한 분위기의 이미지');
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] .image-caption-title').count(), 0);
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] .local-markdown-inline-image-missing').count(), 0);
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-manuscript-image-slot]').count(), 0);
        assert.equal(await page.locator('[data-blog-next-draft-publish="paste"]').isDisabled(), false);
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"]').inputValue(), 'draft');
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"] option[value="publish"]').evaluate((option) => option.disabled), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"] option[value="schedule"]').evaluate((option) => option.disabled), true);
        assert.match((await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-image-safety-hint]').textContent()) || '', /미지정 이미지 1개가 있습니다\. 지금은 임시 저장만 가능합니다\./);
        assert.equal((await page.locator('#blog-next-publish-image-action').textContent())?.trim(), '이미지 블록으로 이동 ↑');
        assert.equal(await page.locator('#blog-next-publish-image-action').getAttribute('aria-controls'), 'blog-next-paste-editor');
        await page.locator('#blog-next-publish-image-action').click();
        assert.equal(await page.locator('[data-paste-workspace-mode="block"]').getAttribute('aria-pressed'), 'true');
        await page.waitForFunction(() => document.querySelector('#blog-next-paste-editor .manuscript-image-block .manuscript-image-block-placeholder'));
        await page.waitForFunction(() => document.querySelector('#blog-next-paste-editor .manuscript-image-block [aria-label="이미지 생성 프롬프트 편집"]') === document.activeElement);
        if (!await page.locator('[data-blog-next-draft-settings="paste"]').evaluate((element) => element.open)) {
            await page.locator('[data-blog-next-draft-settings="paste"] > summary').click();
        }
        await page.locator('[data-blog-next-mode-panel="paste"] [aria-describedby="blog-next-help-post-status"]').focus();
        assert.equal(await page.locator('#blog-next-help-post-status').isVisible(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="paste"]').textContent())?.trim(), '블로그에 임시 저장');
        await page.locator('[data-blog-next-draft-publish="paste"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.doesNotMatch((await page.locator('#ui-dialog-message').textContent()) || '', /AI로 생성합니다/);
        await page.locator('#ui-dialog-cancel').click();
        await page.locator('[data-paste-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="paste"]')?.hidden === false);
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-image-details]').isHidden(), true);
        await page.locator('[data-paste-workspace-mode="block"]').click();
        await page.locator('#blog-next-paste-editor .manuscript-image-block[data-source-key="0"] input[type="file"]').setInputFiles(manuscriptFixtureImage);
        await page.waitForFunction(() => document.querySelector('#blog-next-paste-editor .manuscript-image-block img'));
        const pasteImageBlock = page.locator('#blog-next-paste-editor .manuscript-image-block[data-source-key="0"]');
        const expandImageButton = pasteImageBlock.locator('.manuscript-image-block-expand');
        assert.equal(await expandImageButton.getAttribute('aria-label'), '이미지 영역 확대');
        await expandImageButton.click();
        assert.equal(await pasteImageBlock.evaluate((block) => block.classList.contains('is-media-expanded')), true);
        assert.equal(await expandImageButton.getAttribute('aria-label'), '이미지 편집 화면으로 돌아가기');
        assert.equal(await pasteImageBlock.locator('.manuscript-image-block-fields').isHidden(), true);
        await expandImageButton.click();
        assert.equal(await pasteImageBlock.evaluate((block) => block.classList.contains('is-media-expanded')), false);
        await page.locator('[data-paste-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] [data-manuscript-preview-image]'));
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] [data-manuscript-preview-image]').count(), 1);
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] .image-caption-title, [data-blog-next-draft-preview="paste"] [data-draft-preview-body] .image-caption-prompt').count(), 0);
        await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"]').selectOption('publish');
        await page.waitForFunction(() => document.querySelector('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"] option[value="publish"]')?.disabled === false);
        assert.equal(await page.locator('[data-blog-next-draft-publish="paste"]').isDisabled(), false);
        assert.equal((await page.locator('[data-blog-next-draft-publish="paste"]').textContent())?.trim(), '즉시 발행');
        await page.locator('[data-blog-next-draft-publish="paste"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.doesNotMatch((await page.locator('#ui-dialog-message').textContent()) || '', /AI로 생성합니다/);
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] img').count(), 1);
        const preparedPastePublishRequest = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish`).at(-1);
        const lastPasteImageImport = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/image-slots/image-0/import`).at(-1);
        const lastPasteDraftMutation = requests.slice(0, requests.indexOf(preparedPastePublishRequest)).filter((request) => request.responseRevision != null && request.pathname.startsWith(`/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/`)).at(-1);
        assert.ok(lastPasteImageImport, 'paste image import request should be recorded');
        assert.equal(preparedPastePublishRequest?.body?.revision, lastPasteDraftMutation?.responseRevision);
        await page.evaluate(() => document.querySelectorAll('.app-celebration').forEach((element) => element.remove()));
        await page.locator('[data-paste-workspace-mode="markdown"]').click();
        await page.locator('#blog-next-paste-markdown').fill('');
        await page.locator('[data-paste-workspace-mode="block"]').click();
        await page.locator('#blog-next-paste-editor .ProseMirror').click();
        await page.evaluate((markdown) => {
            const target = document.querySelector('#blog-next-paste-editor .ProseMirror');
            const clipboardData = new DataTransfer();
            clipboardData.setData('text/plain', markdown);
            target.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
        }, '# 붙여넣은 원고\n\nQueue를 거치지 않고 바로 실행합니다.\n\n[[IMAGE_0\ntitle: 붙여넣기 이미지\nprompt: 따뜻한 분위기의 이미지\n]]');
        await page.locator('[data-paste-workspace-mode="view"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="paste"] [data-draft-preview-image-details]')?.hidden === true
          && document.querySelector('#blog-next-paste-editor .manuscript-image-block:not(:has(img))'));
        await page.locator('[data-paste-workspace-mode="block"]').click();
        const droppedImageBytes = Array.from(fs.readFileSync(manuscriptFixtureImage));
        await page.locator('#blog-next-paste-editor .manuscript-image-block[data-source-key="0"] .manuscript-image-block-media').evaluate((media, bytes) => {
            const transfer = new DataTransfer();
            transfer.items.add(new File([new Uint8Array(bytes)], 'smoke-drop.png', { type: 'image/png' }));
            media.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }));
            media.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
            if (!media.classList.contains('is-drag-over')) throw new Error('image drop target did not activate');
            media.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
        }, droppedImageBytes);
        await page.waitForFunction(() => document.querySelector('#blog-next-paste-editor .manuscript-image-block img'));
        await page.locator('[data-paste-workspace-mode="view"]').click();
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] img').count(), 1);
        await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"]').selectOption('publish');
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-publish="paste"]')?.textContent?.trim() === '즉시 발행');
        await page.evaluate(() => document.querySelectorAll('.app-celebration').forEach((element) => element.remove()));
        const pastePublishDelayRoute = async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 800));
            await route.continue();
        };
        const pasteProgressRoute = async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: {
                    state: 'running', busy: true, source: 'local_markdown',
                    progressStage: 'body', postStatus: 'publish',
                    message: '본문 2/5 구간을 입력하고 있습니다.'
                } })
            });
        };
        await page.route(`**/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish`, pastePublishDelayRoute);
        await page.route('**/api/v1/continuous-publishing/runner/status', pasteProgressRoute);
        await page.locator('[data-blog-next-draft-publish="paste"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status-title')?.textContent === '원고 입력 중');
        assert.equal((await page.locator('#blog-next-publish-status-message').textContent())?.trim(), '본문 2/5 구간을 입력하고 있습니다.');
        assert.equal(await page.locator('[data-blog-next-draft-publish="folder"]').isDisabled(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="paste"]').textContent())?.trim(), '발행 중...');
        await page.locator('[data-blog-next-tab="queue"]').click();
        const pastePublishQueueState = await page.evaluate(() => ({
            running: document.getElementById('blog-next-publish-status')?.dataset.state === 'running',
            disabled: document.querySelector('[data-blog-next-run-now]')?.disabled === true
        }));
        if (pastePublishQueueState.running) assert.equal(pastePublishQueueState.disabled, true);
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        await page.unroute('**/api/v1/continuous-publishing/runner/status', pasteProgressRoute);
        await page.unroute(`**/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish`, pastePublishDelayRoute);
        assert.equal(await page.locator('[data-blog-next-run-now]').isDisabled(), false);
        await page.waitForFunction(() => document.querySelector('.app-celebration-message')?.textContent.includes('글쓰기 완료'));
        const pastedPublishRequest = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish`).at(-1);
        const lastPastedDraftMutation = requests.slice(0, requests.indexOf(pastedPublishRequest))
            .filter((request) => request.responseRevision != null && request.pathname.startsWith(`/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/`))
            .at(-1);
        assert.equal(pastedPublishRequest?.body?.draftId, PASTE_MANUSCRIPT_DRAFT_ID);
        assert.ok(lastPastedDraftMutation, 'latest pasted manuscript mutation should be recorded');
        assert.equal(pastedPublishRequest?.body?.revision, lastPastedDraftMutation.responseRevision);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());

        let retryStatusPollCount = 0;
        const retryStatusRoute = async (route) => {
            retryStatusPollCount += 1;
            const status = retryStatusPollCount === 1
                ? {
                    state: 'stopped', busy: false, source: 'local_markdown',
                    executionId: 'previous-naver-run', message: '이전 포스팅을 중지했습니다.'
                }
                : {
                    state: 'running', busy: true, source: 'local_markdown',
                    executionId: 'retried-naver-run', progressStage: 'body',
                    message: '다시 입력 중입니다.'
                };
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: status })
            });
        };
        await page.route('**/api/v1/continuous-publishing/runner/status', retryStatusRoute);
        await page.evaluate(() => {
            renderBlogNextRunnerStatus({
                state: 'stopped', busy: false, source: 'local_markdown',
                executionId: 'previous-naver-run', message: '이전 포스팅을 중지했습니다.'
            });
            startBlogNextLocalPublishProgress(() => '재시도 원고');
            renderBlogNextRunnerStatus({
                state: 'running', busy: true, source: 'local_markdown',
                message: '새 포스팅을 준비하고 있습니다.'
            });
        });
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status-message')?.textContent === '다시 입력 중입니다.');
        assert.equal(retryStatusPollCount, 2);
        await page.evaluate(() => stopBlogNextLocalPublishProgress());
        await page.unroute('**/api/v1/continuous-publishing/runner/status', retryStatusRoute);

        let naverStopRequestCount = 0;
        await page.route('**/api/v1/continuous-publishing/runner/stop', async (route) => {
            naverStopRequestCount += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: { accepted: true, state: 'stop_requested' } })
            });
        });
        await page.evaluate(() => renderBlogNextRunnerStatus({
            state: 'running', busy: true, canStop: true, source: 'local_markdown',
            subject: '중지할 네이버 원고', progressStage: 'body',
            message: '네이버 원고를 입력하고 있습니다.'
        }));
        assert.equal((await page.locator('#blog-next-publish-status-cancel').textContent())?.trim(), '포스팅 중지');
        assert.equal(await page.locator('#blog-next-publish-status-help').isVisible(), true);
        assert.match((await page.locator('#blog-next-publish-status-help-text').textContent()) || '', /이미 네이버에 저장·발행된 내용은 되돌리지 않습니다/);
        await page.locator('#blog-next-publish-status-cancel').click();
        assert.equal((await page.locator('#blog-next-publish-status-cancel').textContent())?.trim(), '중지 확인');
        assert.equal(naverStopRequestCount, 0);
        await page.locator('#blog-next-publish-status-continue').click();
        assert.equal(await page.locator('#blog-next-publish-status-continue').isHidden(), true);
        await page.locator('#blog-next-publish-status-cancel').click();
        await page.locator('#blog-next-publish-status-cancel').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'stop_requested');
        assert.equal(await page.locator('#blog-next-publish-status-cancel').isDisabled(), true);
        assert.equal(naverStopRequestCount, 1);
        await page.evaluate(() => renderBlogNextRunnerStatus({
            state: 'running', busy: true, source: 'local_markdown',
            subject: '중지할 네이버 원고', progressStage: 'submitting',
            postStatus: 'publish', message: '네이버 블로그에 발행을 요청하고 있습니다.'
        }));
        assert.equal(await page.locator('#blog-next-publish-status-cancel').isVisible(), true);
        assert.equal(await page.locator('#blog-next-publish-status-cancel').isDisabled(), true);
        assert.equal((await page.locator('#blog-next-publish-status-cancel').textContent())?.trim(), '마무리 중…');
        await page.locator('#blog-next-publish-status-stop-control').focus();
        assert.equal(await page.locator('#blog-next-publish-status-stop-note').isVisible(), true);
        assert.match((await page.locator('#blog-next-publish-status-stop-note').textContent()) || '', /외부 반영 여부가 불확실해 중지할 수 없습니다/);
        await page.unroute('**/api/v1/continuous-publishing/runner/stop');

        let manualSnsWorkspaceRequestCount = 0;
        await page.route('**/api/v1/social/manual/config', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    success: true,
                    data: {
                        configured: true,
                        local_media_available: true,
                        channels: [],
                        ai: { available: true, model_name: 'Fixture Chat Model' },
                        image_ai: { available: true, model_name: 'Fixture Image Model' }
                    }
                })
            });
        });
        await page.route('**/api/v1/social/manual/workspaces', async (route) => {
            manualSnsWorkspaceRequestCount += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    success: true,
                    data: {
                        organizations: [{ id: 'org-fixture', name: 'Fixture workspace' }],
                        organization_id: 'org-fixture',
                        channels: [{
                            id: 'channel-fixture',
                            name: 'fixture.threads',
                            display_name: 'fixture.threads',
                            service: 'threads',
                            limit: 500,
                            max_assets: 1,
                            image_required: false,
                            supported: true
                        }]
                    }
                })
            });
        });
        let manualSnsImageRequest = null;
        let manualSnsOptimizationRequest = null;
        let manualSnsOptimizationRequestCount = 0;
        let manualSnsImageOperation = null;
        let manualSnsImageOperationSequence = 0;
        await page.route('**/api/v1/social/manual/image', async (route) => {
            manualSnsImageRequest = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    success: true,
                    data: (manualSnsImageOperation = {
                        operationId: `sns-image-operation-${++manualSnsImageOperationSequence}`,
                        state: 'running',
                        canCancel: true,
                        remoteJobPossible: false,
                        pollCount: 0,
                        stopFixture: manualSnsImageRequest.text === '중지 테스트'
                    })
                })
            });
        });
        await page.route('**/api/v1/social/manual/optimize', async (route) => {
            manualSnsOptimizationRequest = route.request().postDataJSON();
            manualSnsOptimizationRequestCount += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ success: true, data: {
                    optimized_text: '테스트 문구를 더 자연스럽게 다듬었습니다.',
                    within_limit: true,
                    limit_scope: 'all_channels'
                } })
            });
        });
        await page.route('**/api/v1/social/manual/image-operations/*/cancel', async (route) => {
            if (manualSnsImageOperation) manualSnsImageOperation.state = 'canceled';
            await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({
                success: true,
                data: { ...manualSnsImageOperation, cancelOutcome: 'requested' }
            }) });
        });
        await page.route('**/api/v1/social/manual/image-operations/*', async (route) => {
            if (manualSnsImageOperation?.state === 'running') {
                manualSnsImageOperation.pollCount += 1;
                if (!manualSnsImageOperation.stopFixture && manualSnsImageOperation.pollCount >= 2) {
                    manualSnsImageOperation.state = 'completed';
                    manualSnsImageOperation.result = {
                        success: true,
                        file_name: 'sns-image-fixture.png',
                        mime_type: 'image/png',
                        base64_data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2sAAAAASUVORK5CYII=',
                        model_name: 'Fixture Image Model'
                    };
                }
            }
            await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ success: true, data: manualSnsImageOperation }) });
        });

        await page.locator('.nav-btn[data-view="social"]').click();
        assert.equal((await page.locator('#social-tab-button-compose').textContent())?.trim(), '직접 작성');
        assert.equal(await page.locator('#social-tab-button-compose').getAttribute('aria-controls'), 'social-tab-compose');
        const socialTopMenuGeometry = await page.evaluate(() => {
            const view = document.getElementById('view-social').getBoundingClientRect();
            const tabs = document.querySelector('.social-tabs').getBoundingClientRect();
            const panel = document.getElementById('social-tab-compose').getBoundingClientRect();
            const intro = document.querySelector('.social-composer-intro').getBoundingClientRect();
            return {
                tabsTop: Math.round(tabs.top - view.top),
                panelTop: Math.round(panel.top - view.top),
                introTop: Math.round(intro.top - view.top),
                leftAligned: Math.round(tabs.left) === Math.round(panel.left)
            };
        });
        assert.equal(socialTopMenuGeometry.leftAligned, true);
        assert.equal((await page.locator('.social-composer-intro h2').textContent())?.trim(), 'SNS 게시물 작성');
        await page.waitForFunction(() => document.getElementById('manual-sns-workspaces-load')?.disabled === false);
        await page.locator('#manual-sns-workspaces-load').click();
        await page.waitForFunction(() => document.querySelectorAll('[data-manual-sns-channel]').length === 1);
        assert.equal(manualSnsWorkspaceRequestCount, 1);
        assert.equal((await page.locator('#manual-sns-organization').inputValue()), 'org-fixture');
        assert.equal((await page.locator('[data-manual-sns-channel]').first().getAttribute('value')), 'channel-fixture');
        await page.locator('#manual-sns-select-all').check();
        assert.equal(await page.locator('[data-manual-sns-channel]').first().isChecked(), true);
        assert.equal(await page.locator('#manual-sns-channel-limit').textContent(), '최대 3개 · 1개 선택');
        assert.equal(await page.locator('#manual-sns-publish-btn').isDisabled(), true);
        assert.equal((await page.locator('#manual-sns-publish-btn').textContent())?.trim(), '1개 채널에 지금 발행');
        assert.equal((await page.locator('#manual-sns-publish-summary').textContent())?.trim(), '1개 채널 선택됨');
        await page.locator('#manual-sns-select-all').uncheck();
        assert.equal(await page.locator('#manual-sns-image-file').getAttribute('multiple'), '');
        assert.equal(await page.locator('#manual-sns-image-local-panel').isVisible(), true);
        assert.equal(await page.locator('#manual-sns-image-url').count(), 0);
        const snsPreviewBounds = await page.evaluate(() => {
            const preview = document.querySelector('.social-live-preview')?.getBoundingClientRect();
            const media = document.getElementById('manual-sns-preview-media')?.getBoundingClientRect();
            const footer = document.querySelector('.social-local-image-add-footer.is-idle-actions');
            const aiButton = footer?.querySelector('.social-local-image-ai-trigger');
            const plusButton = footer?.querySelector('.social-local-image-plus');
            return {
                contained: Boolean(preview && media && media.left >= preview.left && media.right <= preview.right + 1 && media.bottom <= preview.bottom + 1),
                footerBorder: footer ? getComputedStyle(footer).borderTopStyle : '',
                aiBorderColor: aiButton ? getComputedStyle(aiButton).borderTopColor : '',
                plusBorderColor: plusButton ? getComputedStyle(plusButton).borderTopColor : '',
                aiWidth: aiButton ? Math.round(aiButton.getBoundingClientRect().width) : 0,
                plusWidth: plusButton ? Math.round(plusButton.getBoundingClientRect().width) : 0
            };
        });
        assert.equal(snsPreviewBounds.contained, true);
        assert.equal(snsPreviewBounds.footerBorder, 'none');
        assert.equal(snsPreviewBounds.aiBorderColor, 'rgba(0, 0, 0, 0)');
        assert.equal(snsPreviewBounds.plusBorderColor, 'rgba(0, 0, 0, 0)');
        assert.equal(snsPreviewBounds.aiWidth, 40);
        assert.equal(snsPreviewBounds.plusWidth, 40);
        await page.locator('#manual-sns-image-file').setInputFiles([
            path.join(repoRoot, 'assets/icons/1.png'),
            path.join(repoRoot, 'assets/icons/2.png')
        ]);
        await page.waitForFunction(() => document.querySelectorAll('.social-local-image-tile').length === 2);
        assert.equal(await page.locator('.social-local-image-tile').nth(0).getAttribute('draggable'), 'true');
        assert.equal(await page.locator('.social-local-image-tile figcaption').count(), 0);
        await page.locator('.social-local-image-tile').nth(0).dragTo(page.locator('.social-local-image-tile').nth(1));
        assert.equal(await page.locator('.social-local-image-tile figcaption').count(), 0);
        await page.locator('.social-local-image-remove').nth(1).click();
        assert.equal(await page.locator('.social-local-image-tile').count(), 1);
        const imageTileWidths = await page.locator('.social-local-image-tile, .social-local-image-add-tile').evaluateAll((tiles) =>
            tiles.map((tile) => Math.round(tile.getBoundingClientRect().width)));
        assert.equal(imageTileWidths[0], imageTileWidths[1]);
        const imageCardGeometry = await page.locator('.social-local-image-tile, .social-local-image-add-tile').evaluateAll((tiles) =>
            tiles.map((tile) => ({ width: Math.round(tile.getBoundingClientRect().width), height: Math.round(tile.getBoundingClientRect().height) })));
        assert.equal(imageCardGeometry[0].height, imageCardGeometry[1].height);
        assert.equal(await page.locator('.social-local-image-tile-actions').first().evaluate((actions) => getComputedStyle(actions).opacity), '0');
        await page.locator('.social-local-image-tile').first().hover();
        await page.waitForFunction(() => Number.parseFloat(getComputedStyle(document.querySelector('.social-local-image-tile-actions')).opacity) > 0.95);
        await page.locator('#manual-sns-text').fill('테스트 문구');
        await page.waitForFunction(() => document.getElementById('manual-sns-character-count')?.textContent === '6/1,000자');
        assert.equal((await page.locator('#manual-sns-preview-text').textContent())?.trim(), '테스트 문구');
        assert.equal(await page.locator('#manual-sns-ai-optimize-btn').isVisible(), true);
        assert.equal(await page.locator('#manual-sns-ai-optimize-btn').isDisabled(), false);
        assert.match(await page.locator('#manual-sns-ai-optimize-btn').getAttribute('title'), /채널별 글자 수 제한은 발행 시 확인/);
        await page.locator('#manual-sns-ai-optimize-btn').click();
        assert.equal(await page.locator('#manual-sns-ai-confirm-btn').isVisible(), true);
        assert.equal(await page.locator('#manual-sns-ai-cancel-btn').isVisible(), true);
        assert.equal(manualSnsOptimizationRequestCount, 0);
        assert.match(await page.locator('#manual-sns-ai-status').textContent(), /적용할까요/);
        await page.locator('#manual-sns-ai-cancel-btn').click();
        assert.equal(await page.locator('#manual-sns-ai-confirm-btn').isVisible(), false);
        assert.equal(await page.locator('#manual-sns-ai-optimize-btn').isVisible(), true);
        assert.equal(manualSnsOptimizationRequestCount, 0);
        await page.locator('#manual-sns-ai-optimize-btn').click();
        await page.locator('#manual-sns-ai-confirm-btn').click();
        await page.waitForFunction(() => document.getElementById('manual-sns-text')?.value === '테스트 문구를 더 자연스럽게 다듬었습니다.');
        assert.deepEqual(manualSnsOptimizationRequest, {
            organizationId: 'org-fixture',
            channelIds: [],
            text: '테스트 문구'
        });
        assert.equal(await page.locator('#manual-sns-ai-undo-btn').isVisible(), true);
        await page.locator('#manual-sns-ai-undo-btn').click();
        assert.equal(await page.locator('#manual-sns-text').inputValue(), '테스트 문구');
        assert.equal(await page.locator('#manual-sns-publish-btn').isDisabled(), true);
        await page.locator('.social-local-image-ai-trigger').click();
        assert.equal(await page.locator('#manual-sns-image-instruction').isVisible(), true);
        await page.locator('#manual-sns-image-instruction').fill('따뜻한 자연광');
        await page.locator('#manual-sns-image-generate-btn').click();
        await page.waitForFunction(() => document.querySelectorAll('.social-local-image-tile').length === 2);
        assert.equal(await page.locator('#manual-sns-preview-pagination button').count(), 2);
        assert.equal(await page.locator('.social-live-preview-arrow').count(), 2);
        await page.locator('#manual-sns-preview-pagination button').nth(1).click();
        assert.equal(await page.locator('#manual-sns-preview-media img').getAttribute('alt'), '2번 이미지 미리보기');
        const previewArrowInsets = await page.locator('.social-live-preview-arrow').evaluateAll((arrows) => {
            const media = document.getElementById('manual-sns-preview-media').getBoundingClientRect();
            const previous = arrows.find((arrow) => arrow.classList.contains('is-previous')).getBoundingClientRect();
            const next = arrows.find((arrow) => arrow.classList.contains('is-next')).getBoundingClientRect();
            return {
                left: Math.round(previous.left - media.left),
                right: Math.round(media.right - next.right),
                mediaInsidePreview: media.right <= document.querySelector('.social-live-preview').getBoundingClientRect().right - 1
            };
        });
        assert.equal(previewArrowInsets.left, previewArrowInsets.right);
        assert.equal(previewArrowInsets.mediaInsidePreview, true);
        await page.locator('#manual-sns-preview-media').hover();
        await page.locator('.social-live-preview-arrow.is-next').click();
        assert.equal(await page.locator('#manual-sns-preview-media img').getAttribute('alt'), '1번 이미지 미리보기');
        await page.locator('.social-live-preview-arrow.is-previous').click();
        assert.equal(await page.locator('#manual-sns-preview-media img').getAttribute('alt'), '2번 이미지 미리보기');
        const previewMediaBox = await page.locator('#manual-sns-preview-media').boundingBox();
        await page.mouse.move(previewMediaBox.x + previewMediaBox.width * 0.72, previewMediaBox.y + previewMediaBox.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(previewMediaBox.x + previewMediaBox.width * 0.25, previewMediaBox.y + previewMediaBox.height * 0.5, { steps: 5 });
        await page.mouse.up();
        assert.equal(await page.locator('#manual-sns-preview-media img').getAttribute('alt'), '1번 이미지 미리보기');
        assert.equal(await page.locator('.social-local-image-ai-trigger').getAttribute('aria-label'), 'AI 이미지 생성');
        assert.deepEqual(manualSnsImageRequest, { text: '테스트 문구', instruction: '따뜻한 자연광' });
        assert.equal(await page.locator('.social-local-image-tile figcaption').count(), 0);
        const generatedCardGeometry = await page.locator('.social-local-image-tile, .social-local-image-add-tile').evaluateAll((tiles) =>
            tiles.map((tile) => ({ width: Math.round(tile.getBoundingClientRect().width), height: Math.round(tile.getBoundingClientRect().height) })));
        assert.ok(generatedCardGeometry.every((geometry) => geometry.width === generatedCardGeometry[0].width && geometry.height === generatedCardGeometry[0].height));
        const firstGeneratedImageSrc = await page.locator('.social-local-image-tile img').nth(1).getAttribute('src');
        assert.equal(await page.locator('.social-local-image-tile').nth(1).locator('a[download]').getAttribute('download'), 'sns-image-fixture.png');
        await page.locator('#manual-sns-text').fill('');
        assert.equal((await page.locator('#manual-sns-preview-text').textContent())?.trim(), '게시물 내용이 여기에 표시됩니다.');
        await page.locator('.social-local-image-tile').nth(1).hover();
        await page.locator('.social-local-image-regenerate').click();
        assert.equal(await page.locator('#manual-sns-image-instruction').inputValue(), '따뜻한 자연광');
        assert.match(await page.locator('#manual-sns-image-generation-status').textContent(), /본문을 입력한 뒤/);
        assert.equal(await page.locator('#manual-sns-image-generate-btn').isDisabled(), true);
        assert.equal(await page.locator('.social-local-image-tile').count(), 2);
        await page.locator('#manual-sns-text').fill('수정된 게시물 본문');
        assert.equal(await page.locator('#manual-sns-image-generate-btn').isDisabled(), false);
        await page.locator('#manual-sns-image-instruction').fill('봄 햇살 수채화');
        await page.locator('#manual-sns-image-generate-btn').click();
        await page.waitForFunction(() => document.querySelectorAll('.social-local-image-tile').length === 2
          && document.querySelectorAll('.social-local-image-regenerate').length === 1
          && document.getElementById('manual-sns-image-instruction') === null);
        assert.deepEqual(manualSnsImageRequest, { text: '수정된 게시물 본문', instruction: '봄 햇살 수채화' });
        assert.notEqual(await page.locator('.social-local-image-tile img').nth(1).getAttribute('src'), firstGeneratedImageSrc);
        assert.match(await page.locator('#manual-sns-image-capacity').textContent(), /이미지 2\/10장/);
        assert.match(await page.locator('#manual-sns-image-capacity').textContent(), /발행 시 확인/);
        await page.locator('#manual-sns-select-all').check();
        await page.locator('#manual-sns-text').fill('채널 이미지 제한 발행 검증');
        assert.equal(await page.locator('#manual-sns-publish-btn').isDisabled(), false);
        await page.locator('#manual-sns-publish-btn').click();
        await page.waitForFunction(() => document.getElementById('ui-dialog-title')?.textContent === '채널별 이미지 개수 확인');
        assert.match(await page.locator('#ui-dialog-message').textContent(), /최대 1장/);
        assert.match(await page.locator('#ui-dialog-message').textContent(), /발행해 주세요/);
        await page.locator('#ui-dialog-confirm').click();
        await page.locator('#manual-sns-select-all').uncheck();
        await page.locator('#manual-sns-text').fill('중지 테스트');
        await page.locator('.social-local-image-ai-trigger').click();
        await page.locator('#manual-sns-image-generate-btn').click();
        await page.getByRole('button', { name: '중지', exact: true }).waitFor({ state: 'visible' });
        assert.equal(await page.locator('.social-local-image-working').isVisible(), true);
        assert.equal(await page.locator('.social-local-image-working .ui-spinner.ui-spinner-lg.ui-spinner-accent').isVisible(), true);
        assert.equal((await page.locator('.social-local-image-working > strong').textContent())?.trim(), '이미지 만드는 중…');
        assert.equal(await page.locator('.social-local-image-add-footer #manual-sns-image-generate-btn').isVisible(), true);
        assert.equal(await page.locator('.social-local-image-add-footer').isVisible(), true);
        await page.locator('#manual-sns-image-generate-btn').click();
        assert.equal((await page.locator('#manual-sns-image-generate-btn').textContent())?.trim(), '중지 확인');
        assert.equal(await page.locator('.social-local-image-add-footer .social-local-image-cancel').isVisible(), true);
        await page.waitForTimeout(1500);
        assert.equal((await page.locator('#manual-sns-image-generate-btn').textContent())?.trim(), '중지 확인');
        assert.equal(await page.getByRole('button', { name: '계속 진행', exact: true }).isVisible(), true);
        await page.getByRole('button', { name: '계속 진행', exact: true }).click();
        await page.getByRole('button', { name: '중지', exact: true }).waitFor({ state: 'visible' });
        await page.locator('#manual-sns-image-generate-btn').click();
        await page.locator('#manual-sns-image-generate-btn').click();
        await page.waitForFunction(() => document.querySelector('#manual-sns-image-generation-status')?.textContent.includes('이미지 생성을 중지했습니다'));
        assert.equal(await page.locator('.social-local-image-tile').count(), 2);
        const imageFixture = fs.readFileSync(path.join(repoRoot, 'assets/icons/3.png'));
        await page.locator('#manual-sns-image-file').setInputFiles(Array.from({ length: 9 }, (_value, index) => ({
            name: `capacity-${index}.png`,
            mimeType: 'image/png',
            buffer: imageFixture
        })));
        await page.waitForFunction(() => document.querySelectorAll('.social-local-image-tile').length === 10);
        assert.match(await page.locator('#manual-sns-image-capacity').textContent(), /이미지 10\/10장/);
        assert.equal(await page.locator('#manual-sns-image-file').isDisabled(), true);

        await page.locator('.nav-btn[data-view="account"]').click();
        await page.locator('.nav-btn[data-view="social"]').click();
        await page.waitForFunction(() => document.querySelectorAll('[data-manual-sns-channel]').length === 1);
        assert.equal(manualSnsWorkspaceRequestCount, 1);

        await page.locator('.nav-btn[data-view="account"]').click();
        await page.waitForFunction(() => !document.getElementById('account-overview-content')?.classList.contains('hidden'));
        assert.equal((await page.locator('#account-tab-button-overview').textContent())?.trim(), '이용 현황');
        assert.equal(await page.locator('#account-tab-button-overview').getAttribute('aria-controls'), 'account-tab-overview');
        const accountTopMenuGeometry = await page.evaluate(() => {
            const view = document.getElementById('view-account').getBoundingClientRect();
            const tabs = document.querySelector('.account-tabs').getBoundingClientRect();
            const card = document.querySelector('#account-overview-content .account-overview-summary-panel').getBoundingClientRect();
            const intro = document.querySelector('.account-overview-intro').getBoundingClientRect();
            return {
                tabsTop: Math.round(tabs.top - view.top),
                panelTop: Math.round(card.top - view.top),
                introTop: Math.round(intro.top - view.top),
                leftAligned: Math.round(tabs.left) === Math.round(card.left)
            };
        });
        assert.equal(accountTopMenuGeometry.leftAligned, true);
        assert.equal(accountTopMenuGeometry.tabsTop, socialTopMenuGeometry.tabsTop);
        assert.equal(accountTopMenuGeometry.panelTop, socialTopMenuGeometry.panelTop);
        assert.ok(Math.abs(accountTopMenuGeometry.introTop - socialTopMenuGeometry.introTop) <= 1);
        assert.equal((await page.locator('.account-overview-intro h2').textContent())?.trim(), '이용 현황');
        assert.equal((await page.locator('#account-plan-name').textContent())?.trim(), 'Free');
        assert.equal(
            await page.locator('#view-account [data-clock-display]').evaluate((element) => element.children.length > 0),
            true
        );

        await page.locator('.nav-btn[data-view="logs"]').click();
        await page.locator('.logs-tab-btn[data-logs-tab="system"]').click();
        await page.waitForFunction(() => getComputedStyle(document.getElementById('logs-tab-system')).display !== 'none');
        assert.equal(
            await page.locator('.logs-tab-btn[data-logs-tab="system"]').evaluate((element) => element.classList.contains('active')),
            true
        );

        await page.locator('.nav-btn[data-view="dashboard-beta"]').click();
        assert.equal(await page.locator('#update-banner').evaluate((element) => element.classList.contains('hidden')), true);
        await page.evaluate(() => navigateTo('blog-next', 'quick'));

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.body.classList.contains('mobile-quick-mode'));
        assert.equal(await page.locator('.main').evaluate((element) => getComputedStyle(element).paddingLeft), '14px');
        assert.equal(await page.locator('#sidebar-menu-tooltip').evaluate((element) => element.hidden), true);
        await page.waitForFunction(() => document.getElementById('view-blog-next')?.classList.contains('active'));
        const blogNextNarrowLayout = await page.evaluate(() => {
            const panelNames = ['quick', 'trend-posting', 'queue', 'smart-comment'];
            const panelChecks = panelNames.map((name) => {
                activateBlogNextTab(name);
                const panel = document.getElementById(`blog-next-panel-${name}`);
                const rect = panel.getBoundingClientRect();
                return { name, left: rect.left, right: rect.right, width: rect.width };
            });
            activateBlogNextTab('quick');
            const modeChecks = ['ai', 'folder', 'paste'].map((name) => {
                activateBlogNextInputMode(name);
                const panel = document.getElementById(`blog-next-mode-panel-${name}`);
                const rect = panel.getBoundingClientRect();
                return { name, left: rect.left, right: rect.right, width: rect.width };
            });
            activateBlogNextInputMode('ai');
            return { viewportWidth: window.innerWidth, panelChecks, modeChecks };
        });
        assert.equal(blogNextNarrowLayout.panelChecks.every(({ left, right, width }) => left >= 0 && right <= 391 && width > 0), true);
        assert.equal(blogNextNarrowLayout.modeChecks.every(({ left, right, width }) => left >= 0 && right <= 391 && width > 0), true);
        assert.equal(await page.locator('.nav-btn[data-view="blog-next"]').isVisible(), true);
        assert.equal(await page.locator('.mobile-topbar').evaluate((element) => getComputedStyle(element).display), 'flex');
        await page.evaluate(() => navigateTo('dashboard-beta'));
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        const centerBox = await page.locator('#dashboard-beta-discovery').boundingBox();
        assert.equal(Boolean(centerBox && centerBox.width <= 390), true);
        assert.equal(
            await page.locator('#dashboard-beta-discovery-list').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
            1
        );
        await page.locator('#mobile-menu-btn').click();
        await page.waitForFunction(() => document.querySelector('.sidebar')?.classList.contains('open'));
        assert.equal(await page.locator('#sidebar-overlay').evaluate((element) => element.classList.contains('active')), true);
        await page.locator('.nav-btn[data-view="site-hosting"]').click();
        await page.waitForFunction(() => document.getElementById('view-site-hosting')?.classList.contains('active'));
        await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('open'));
        assert.equal((await page.locator('#view-site-hosting h1').textContent())?.trim(), '사이트');
        await page.locator('#mobile-menu-btn').click();
        await page.waitForFunction(() => document.querySelector('.sidebar')?.classList.contains('open'));
        await page.locator('#sidebar-overlay').click({ position: { x: 380, y: 420 } });
        await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('open'));

        const expectedPosts = requests
            .filter((request) => request.method !== 'GET'
                && request.pathname !== '/api/v1/system/ui-event'
                && request.pathname !== '/api/v1/settings/optional-services/test'
                && !request.pathname.startsWith('/api/v1/blog/manuscript-drafts/'))
            .map(({ method, pathname }) => ({ method, pathname }));
        const expectedNonDraftPosts = [
            { method: 'POST', pathname: '/api/v1/recommendations/discover' },
            { method: 'PUT', pathname: '/api/v1/settings/writing-profile' },
            { method: 'POST', pathname: '/api/v1/settings/optional-services' },
            { method: 'POST', pathname: '/api/v1/site-hosting/projects' },
            { method: 'POST', pathname: '/api/v1/site-hosting/projects/site-project-smoke/preview-drafts' },
            { method: 'POST', pathname: '/api/v1/site-hosting/projects/site-project-smoke/sites' },
            { method: 'DELETE', pathname: '/api/v1/site-hosting/projects/site-project-smoke/preview-drafts/site-preview-smoke' },
            { method: 'POST', pathname: '/api/v1/site-hosting/projects/site-project-smoke/preview-drafts' },
            { method: 'PUT', pathname: '/api/v1/site-hosting/projects/site-project-smoke/sites/site-smoke-1' },
            { method: 'DELETE', pathname: '/api/v1/site-hosting/projects/site-project-smoke/preview-drafts/site-preview-smoke' },
            { method: 'POST', pathname: '/api/v1/site-hosting/projects/site-project-smoke/sites/site-smoke-1/custom-domain-disconnect' },
            { method: 'POST', pathname: '/api/v1/site-hosting/projects/site-project-smoke/sites/site-smoke-1/worker-disconnect' },
            { method: 'POST', pathname: '/api/v1/site-hosting/projects/site-project-smoke/sites/site-smoke-1/delete-plan' },
            { method: 'POST', pathname: '/api/v1/site-hosting/projects/site-project-smoke/sites/site-smoke-1/delete' },
            { method: 'POST', pathname: '/api/v1/trend-posting/topics' },
            { method: 'POST', pathname: '/api/v1/keywords/analyze' },
            { method: 'POST', pathname: '/api/v1/keywords/suggest-titles' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics/update' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics/delete' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics/update' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/remove' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/reorder' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/reorder' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/remove' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/runner/start' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/automation/settings' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
        ];
        assert.deepEqual(expectedPosts, expectedNonDraftPosts);
        assert.equal(requests.some((request) => request.pathname === '/app.js'), true);
        assert.equal(requests.some((request) => request.pathname === '/styles.css'), true);

        reportSmokePhase('Checking Blog Beta quick writing and queue workflows');
        await page.evaluate(() => navigateTo('blog-next', 'quick'));
        await page.waitForFunction(() => document.getElementById('view-blog-next')?.classList.contains('active'));
        await page.evaluate(() => {
            activateBlogNextInputMode('ai');
            renderBlogNextRunnerStatus({
                state: 'completed', source: 'local_markdown', resultStatus: '임시 저장 완료',
                message: '네이버 블로그에 임시 저장했습니다.', finishedAt: new Date().toISOString()
            });
        });
        await page.locator('#blog-next-subject').fill('다음 글 준비 전 주제');
        await page.locator('#blog-next-publish-status-next').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => blogNextDraftState.ai.draftId === ''
          && blogNextDraftState.ai.preview === null
          && document.activeElement?.id === 'blog-next-subject');
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '');
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"]').isHidden(), true);
        assert.equal(await page.locator('#blog-next-publish-status').isHidden(), true);
        await page.locator('#blog-next-subject').fill('단축키 전 작성 중인 주제');
        await page.evaluate(() => { void navigateToBlogQuickCreate(); });
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden')
          && document.getElementById('ui-dialog-message')?.textContent?.includes('작성 중인 내용과 원고 미리보기를 지우고'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-subject'
          && document.getElementById('blog-next-subject')?.value === '');

        reportSmokePhase('Reloading app and checking SNS workspace/channel state');
        await page.evaluate(() => localStorage.setItem('blog_next_pasted_markdown_draft', '# 이전 실행의 원고'));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.navigateTo === 'function');
        assert.equal(await page.locator('#blog-next-paste-markdown').inputValue(), '');
        assert.equal(await page.evaluate(() => localStorage.getItem('blog_next_pasted_markdown_draft')), null);
        await page.evaluate(() => navigateTo('social'));
        await page.waitForFunction(() => document.querySelectorAll('[data-manual-sns-channel]').length === 1);
        assert.equal(manualSnsWorkspaceRequestCount, 1);
        assert.equal((await page.locator('#manual-sns-organization').inputValue()), 'org-fixture');

        reportSmokePhase('Validating browser errors and fixture responses');
        assert.deepEqual(failedResponses, []);
        assert.deepEqual(failedRequests, []);
        assert.deepEqual(pageErrors, []);
        const expectedAccountFailureErrors = consoleErrors.filter((item) => item.includes('/api/v1/account/overview?quiet=1'));
        assert.ok(expectedAccountFailureErrors.length === 0 || expectedAccountFailureErrors.length === 2, `unexpected intentional account failure logs: ${JSON.stringify(consoleErrors)}`);
        if (expectedAccountFailureErrors.length) {
            assert.ok(expectedAccountFailureErrors.some((item) => item.includes('API Fetch Error')));
            assert.ok(expectedAccountFailureErrors.some((item) => item.includes('Network or Parse Error')));
        }
        const intentionallyBlockedExternalErrors = consoleErrors.filter((item) => (
            item.includes('ERR_BLOCKED_BY_CLIENT')
            && blockedExternalRequests.some((request) => item.includes(request.slice(request.indexOf('https://'))))
        ));
        assert.deepEqual(consoleErrors.filter((item) => (
            !item.includes('/api/v1/account/overview?quiet=1')
            && !intentionallyBlockedExternalErrors.includes(item)
        )), []);

        await context.close();
        console.log(`✅ browser UI smoke test passed (${requests.length} fixture requests; blocked ${blockedExternalRequests.length} external requests${blockedExternalRequests.length ? `: ${blockedExternalRequests.join(', ')}` : ''})`);
    } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (browser) await browser.close();
        await closeServer(server);
        fs.rmSync(manuscriptFixtureDir, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error('❌ browser UI smoke test failed');
    console.error(`[ui-smoke] failure phase: ${smokeProgress.phase} (${Math.floor((Date.now() - smokeProgress.phaseStartedAt) / 1000)}s)`);
    console.error(error?.stack || error);
    process.exitCode = 1;
});
