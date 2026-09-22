#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');
const { createCssCompositionRuntime } = require('../src/ui-runtime/css-composition-runtime');
const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');
const { getDefaultContentWritingProfile, DEFAULT_CONTENT_WRITING_PROFILE_METADATA } = require('../src/content/writing-profile');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const MANUSCRIPT_DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const PASTE_MANUSCRIPT_DRAFT_ID = '22222222-2222-4222-8222-222222222222';

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
    if (pathname === '/api/v1/settings/major') {
        return {
            configPath: 'fixture/config.json',
            fields: {
                GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/fixture-sheet-id/edit',
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
        return { fields: { GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/fixture-sheet-id/edit' } };
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
    if (pathname === '/api/v1/google-oauth/status') return { state: 'connected', connectedEmail: 'fixture@example.com' };
    if (pathname === '/api/v1/google-oauth/test') {
        return { ok: true, spreadsheetId: 'fixture-sheet-id', spreadsheetTitle: 'UI smoke spreadsheet' };
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
    const composedUiShell = createHtmlCompositionRuntime({ fs, path })
        .composeHtmlFile({ uiRoot }).html;
    const composedUiStyles = createCssCompositionRuntime({ fs, path })
        .composeCssFile({ uiRoot }).css;
    const composedUiScript = createJsCompositionRuntime({ fs, path })
        .composeJsFile({ uiRoot }).js;
    const topicRecommendationCallsBySession = new Map();
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
    let manuscriptDraftSourceKind = 'folder';
    let manuscriptDraftTitle = '폴더 원고';
    let manuscriptDraftImages = [
        { index: 0, slotId: 'image-0', title: '첫 이미지', prompt: '푸른 하늘', exists: true, excluded: false, assetOrigin: 'folder', canRestore: false },
        { index: 1, slotId: 'image-1', title: '둘째 이미지', prompt: '초록 숲', exists: false, excluded: false, assetOrigin: '', canRestore: false }
    ];
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
            sourceKind: manuscriptDraftSourceKind,
            source: manuscriptDraftSourceKind === 'ai'
                ? { type: 'generated_quick_post', folderName: '' }
                : { type: 'local_markdown', folderName: 'browser-manuscript' },
            title: manuscriptDraftTitle,
            rawMarkdown: `# ${manuscriptDraftTitle}`,
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
                { type: 'paragraph', text: 'Markdown 본문입니다.', boldRanges: [{ start: 0, end: 8 }] },
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
                continuousRunnerPollsRemaining = item ? 2 : 0;
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

        if (url.pathname === '/api/v1/blog/manuscript-drafts/ai' && req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                requestRecord.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                manuscriptDraftRevision = 1;
                manuscriptDraftPostStatus = requestRecord.body.postStatus || 'publish';
                manuscriptDraftSourceKind = 'ai';
                manuscriptDraftTitle = String(requestRecord.body.title || requestRecord.body.subject || 'AI 원고');
                manuscriptDraftImages = requestRecord.body.imageMode === 'none'
                    ? []
                    : [
                        { index: 0, slotId: 'image-0', title: '첫 이미지', prompt: '푸른 하늘', exists: true, excluded: false, assetOrigin: 'generated', canRestore: false },
                        { index: 1, slotId: 'image-1', title: '둘째 이미지', prompt: '초록 숲', exists: false, excluded: false, assetOrigin: '', canRestore: false }
                    ];
                setTimeout(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(JSON.stringify({ success: true, data: buildManuscriptDraftFixture() }));
                }, 100);
            });
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

        const manuscriptSlotMatch = url.pathname.match(/^\/api\/v1\/blog\/manuscript-drafts\/([^/]+)\/image-slots\/(image-[0-9]+)\/(import|generate|exclude|restore)$/);
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
                    slot.canRestore = slot.exists || slot.index === 0;
                    slot.restoreLabel = '다시 포함';
                } else if (action === 'restore') {
                    slot.exists = true;
                    slot.excluded = false;
                    slot.assetOrigin = pasteDraft ? 'user' : 'folder';
                    slot.canRestore = false;
                } else {
                    slot.exists = true;
                    slot.excluded = false;
                    slot.assetOrigin = action === 'import' ? 'user' : 'generated';
                    slot.canRestore = slot.index === 0;
                }
                if (pasteDraft) pasteManuscriptDraftRevision += 1;
                else manuscriptDraftRevision += 1;
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
                manuscriptDraftRevision += 1;
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
                pasteManuscriptDraftPostStatus = requestRecord.body.postStatus || pasteManuscriptDraftPostStatus;
                pasteManuscriptDraftRevision += 1;
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
                const automaticTargets = manuscriptDraftImages.filter((image) => !image.excluded && !image.exists && image.prompt);
                automaticTargets.forEach((image) => {
                    image.exists = true;
                    image.assetOrigin = 'generated';
                    image.canRestore = false;
                    manuscriptDraftRevision += 1;
                });
                const manuscriptPreview = buildManuscriptDraftFixture();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                setTimeout(() => {
                    localMarkdownPublishing = false;
                    res.end(JSON.stringify({ success: true, data: {
                        status: manuscriptDraftPostStatus === 'draft' ? '임시 저장 완료' : '발행 완료',
                        postStatus: manuscriptDraftPostStatus,
                        completionLinks: [],
                        revision: manuscriptDraftRevision,
                        publishPolicy: {
                            requestedPostStatus: manuscriptDraftPostStatus,
                            effectivePostStatus: manuscriptDraftPostStatus,
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
                const automaticTargets = pasteManuscriptDraftImages.filter((image) => !image.excluded && !image.exists && image.prompt);
                automaticTargets.forEach((image) => {
                    image.exists = true;
                    image.assetOrigin = 'generated';
                    image.canRestore = false;
                    pasteManuscriptDraftRevision += 1;
                });
                const manuscriptPreview = buildPasteManuscriptDraftFixture();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                setTimeout(() => {
                    localMarkdownPublishing = false;
                    res.end(JSON.stringify({ success: true, data: {
                        status: pasteManuscriptDraftPostStatus === 'draft' ? '임시 저장 완료' : '발행 완료',
                        postStatus: pasteManuscriptDraftPostStatus,
                        completionLinks: [],
                        revision: pasteManuscriptDraftRevision,
                        publishPolicy: {
                            requestedPostStatus: pasteManuscriptDraftPostStatus,
                            effectivePostStatus: pasteManuscriptDraftPostStatus,
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
    return { executablePath, headless: true };
}

async function closeServer(server) {
    await new Promise((resolve) => server.close(resolve));
}

async function run() {
    const requests = [];
    const consoleErrors = [];
    const pageErrors = [];
    const failedResponses = [];
    const manuscriptFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-next-manuscript-browser-'));
    const manuscriptFixtureImage = path.join(manuscriptFixtureDir, '00_existing.png');
    fs.writeFileSync(path.join(manuscriptFixtureDir, 'contents.md'), '# 폴더 원고\n\n[[IMAGE_0\ntitle: 첫 이미지\nprompt: 푸른 하늘\n]]\n\n본문\n\n[[IMAGE_1\ntitle: 둘째 이미지\nprompt: 초록 숲\n]]');
    fs.writeFileSync(manuscriptFixtureImage, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const { server, baseUrl } = await startFixtureServer(requests);
    let browser;

    try {
        browser = await chromium.launch(resolveBrowserLaunchOptions());
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
        page.on('response', (response) => {
            if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
        });

        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.navigateTo === 'function');
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        await page.waitForFunction(() => document.getElementById('dashboard-beta-flow-subject')?.textContent === '현재 실행 중인 글이 없습니다.');
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
        assert.equal(await page.locator('.nav-btn[data-view="dashboard"]').isHidden(), true);
        assert.equal(
            await page.locator('.nav-btn[data-view="dashboard-beta"] .nav-label').evaluate((element) => element.childNodes[0]?.textContent?.trim()),
            '대시보드'
        );
        assert.equal(await page.locator('.nav-btn[data-view="dashboard-beta"] .nav-new-badge').count(), 0);
        assert.equal(await page.locator('.nav-btn[data-view="blog"]').isHidden(), true);
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
        assert.equal(await page.locator('[data-blog-next-input-mode="ai"]').getAttribute('aria-selected'), 'true');
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
        assert.equal(await page.locator('#view-blog-next .blog-next-segmented-nav').count(), 2);
        const segmentedSelectionStyles = await page.evaluate(() => {
            const quick = getComputedStyle(document.querySelector('.blog-next-mode-btn.active'));
            const queue = getComputedStyle(document.querySelector('.blog-next-management-tab.active'));
            const track = getComputedStyle(document.querySelector('.blog-next-segmented-nav'));
            return {
                quick: quick.backgroundColor,
                queue: queue.backgroundColor,
                track: track.backgroundColor,
                selectedShadow: quick.boxShadow
            };
        });
        assert.equal(segmentedSelectionStyles.quick, segmentedSelectionStyles.queue);
        assert.notEqual(segmentedSelectionStyles.quick, segmentedSelectionStyles.track);
        assert.notEqual(segmentedSelectionStyles.selectedShadow, 'none');
        await page.evaluate(() => {
            activateBlogNextTab('queue');
            activateBlogNextManagementTab('automation');
        });
        await page.locator('#blog-next-automation-enabled').focus();
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
        assert.equal(await page.locator('#view-dashboard').evaluate(element => element.classList.contains('active')), false);
        assert.equal(requests.some(request => request.pathname === '/api/v1/continuous-publishing/dashboard-overview'), true);
        assert.equal(requests.some(request => request.pathname === '/api/v1/continuous-publishing/dashboard-result-stats'), true);
        await page.evaluate(() => navigateTo('dashboard'));
        assert.equal(await page.evaluate(() => recommendationCenterToastMessage([
            { title: '경찰 계급도' }, { title: '두 번째 소재' }, { title: '세 번째 소재' }
        ])), '경찰 계급도 외 2건');

        await page.evaluate(async () => {
            await openRecommendationPresentation({
                target: { surface: 'blog.quick' },
                payload: { query: '첫 번째 뜻밖의 소재' }
            });
            await openRecommendationPresentation({
                target: { surface: 'blog.quick' },
                payload: { query: '"산림재난 정책 성공위한 \'재난에 강한 마을\' 설계해야 한다"' }
            });
        });
        assert.equal(await page.locator('#view-blog-next').evaluate((element) => element.classList.contains('active')), true);
        assert.equal(
            await page.locator('#blog-next-subject').inputValue(),
            '산림재난 정책 성공위한 \'재난에 강한 마을\' 설계해야 한다'
        );
        assert.equal(await page.evaluate(() => recommendationPresentationQuery('“겹따옴표 소재”')), '겹따옴표 소재');
        assert.equal(await page.evaluate(() => recommendationActionLabel({
            lane: 'serendipity', action: { type: 'presentation', label: '소재 살펴보기' }
        })), '소재 적용하기');
        await page.evaluate(() => navigateTo('dashboard'));
        await page.waitForFunction(() => document.getElementById('view-dashboard')?.classList.contains('active'));

        assert.equal(await page.locator('#view-dashboard').count(), 1);
        assert.equal(await page.locator('#view-dashboard').evaluate((element) => element.classList.contains('active')), true);
        assert.notEqual(await page.locator('#view-dashboard').evaluate((element) => getComputedStyle(element).display), 'none');
        assert.equal(await page.locator('#view-settings').evaluate((element) => getComputedStyle(element).display), 'none');
        assert.equal(await page.locator('.sidebar').evaluate((element) => getComputedStyle(element).display), 'flex');
        assert.equal(await page.locator('#badge-version').count(), 0);
        assert.equal(await page.locator('#settings-current-version-display').textContent(), 'v0.2.0');
        assert.equal(await page.locator('#footer-version-display').textContent(), 'v0.2.0');
        assert.equal((await page.locator('#dashboard-naver-status-label').textContent())?.trim(), '네이버 로그인 확인됨');
        assert.equal((await page.locator('#dashboard-wordpress-status-label').textContent())?.trim(), 'WordPress 미사용');
        assert.equal((await page.locator('#dashboard-usage-status-label').textContent())?.trim(), '기본 8회 남음');
        assert.equal((await page.locator('#dashboard-plan-status-label').textContent())?.trim(), 'Free');
        assert.equal(await page.locator('#dashboard-google-status').isHidden(), true);
        assert.equal(await page.locator('#dashboard-health-status').isHidden(), true);
        assert.equal(await page.locator('#dashboard-readiness-bar').evaluate((element) => getComputedStyle(element).display), 'flex');
        await page.locator('#dashboard-wordpress-status').click();
        await page.waitForFunction(() => (
            document.getElementById('view-settings-next')?.classList.contains('active')
            && document.getElementById('settings-next-tab-core')?.getAttribute('aria-selected') === 'true'
            && document.querySelector('[data-settings-next-core-tab="publishing"]')?.getAttribute('aria-selected') === 'true'
            && document.getElementById('settings-next-core-panel-publishing')?.hidden === false
            && document.getElementById('settings-next-wordpress-form')?.getBoundingClientRect().height > 0
        ));
        await page.evaluate(() => navigateTo('dashboard'));
        await page.waitForFunction(() => document.getElementById('view-dashboard')?.classList.contains('active'));
        await page.waitForFunction(() => (
            document.querySelectorAll('.recommendation-card').length === 1
            && document.querySelector('.recommendation-card h3')?.textContent?.trim() === '로컬 여행'
        ));
        assert.equal((await page.locator('.recommendation-card h3').textContent())?.trim(), '로컬 여행');
        assert.equal(await page.locator('#recommendation-nav-badge').count(), 0);
        assert.equal((await page.locator('#recommendation-center-count').textContent())?.trim(), '1');
        assert.equal(await page.locator('#recommendation-center-count').isHidden(), false);
        assert.equal(await page.locator('#view-dashboard [data-global-publishing-status]').isHidden(), true);
        assert.equal(await page.locator('#blog-next-global-nav-status').isHidden(), true);
        await page.evaluate(() => renderGlobalPublishingStatus({
            state: 'attention', subject: '확인이 필요한 글감', message: '발행 결과를 확인해 주세요.'
        }));
        assert.equal(
            (await page.locator('#view-dashboard [data-global-publishing-status]').textContent())?.includes('발행 확인 필요'),
            true
        );
        assert.equal(await page.locator('#blog-next-global-nav-status').getAttribute('data-state'), 'attention');
        await page.evaluate(() => renderGlobalPublishingStatus({ state: 'idle' }));
        assert.equal(await page.locator('#view-dashboard [data-global-publishing-status]').isHidden(), true);
        assert.equal(await page.locator('.recommendation-evidence-list').isHidden(), true);
        assert.equal(
            await page.locator('.recommendation-evidence-toggle').evaluate((element) => getComputedStyle(element).alignSelf),
            'flex-start'
        );
        await page.locator('.recommendation-evidence-toggle').click();
        assert.equal(await page.locator('.recommendation-evidence-list').isHidden(), false);
        assert.equal((await page.locator('.recommendation-card').textContent()).includes('capability_id'), false);
        assert.equal(await page.locator('.recommendation-kind').count(), 0);
        assert.equal((await page.locator('.recommendation-card-hint').textContent())?.trim(), '트렌드 키워드');
        assert.equal(await page.locator('.recommendation-card-top .recommendation-card-hint').count(), 1);
        assert.equal(await page.locator('.recommendation-card-title-row .recommendation-card-hint').count(), 0);
        assert.equal(await page.locator('.recommendation-card').evaluate((element) => getComputedStyle(element).display), 'flex');
        assert.equal(await page.locator('#recommendation-center-list').evaluate((element) => getComputedStyle(element).alignItems), 'stretch');
        assert.equal(await page.locator('[data-recommendation-action="snooze"]').count(), 0);
        assert.equal(await page.locator('[data-recommendation-action="dismiss"]').isDisabled(), false);
        const recommendationDismiss = page.locator('[data-recommendation-action="dismiss"]');
        await recommendationDismiss.hover();
        await page.waitForFunction(() => {
            const element = document.querySelector('[data-recommendation-action="dismiss"]');
            if (!element?.matches(':hover')) return false;
            const style = getComputedStyle(element);
            return style.backgroundColor === 'rgb(255, 241, 242)' && style.color === 'rgb(185, 28, 28)';
        });
        const recommendationDismissHover = await recommendationDismiss.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
                hovered: element.matches(':hover'),
                background: style.backgroundColor,
                color: style.color,
                transform: style.transform
            };
        });
        assert.equal(recommendationDismissHover.hovered, true);
        assert.equal(recommendationDismissHover.background, 'rgb(255, 241, 242)');
        assert.equal(recommendationDismissHover.color, 'rgb(185, 28, 28)');
        assert.equal(recommendationDismissHover.transform, 'none');
        assert.equal(
            await page.locator('#recommendation-center-list').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
            3
        );
        assert.equal((await page.locator('#recommendation-center-title').textContent())?.trim(), '뜻밖의 발견');
        await page.locator('.recommendation-card-actions .primary').click();
        await page.waitForFunction(() => document.getElementById('view-settings-next')?.classList.contains('active'));
        assert.equal(
            await page.locator('#settings-next-tab-core').getAttribute('aria-selected'),
            'true'
        );
        await page.evaluate(() => navigateTo('dashboard'));
        await page.locator('#recommendation-center-refresh').click();
        await page.waitForFunction(() => document.querySelector('#recommendation-center-list .recommendation-card h3')?.textContent.includes('로컬 여행'));

        await page.evaluate(() => navigateTo('settings'));
        await page.waitForFunction(() => document.getElementById('view-settings')?.classList.contains('active'));
        await page.locator('.settings-tab-btn[data-settings-tab="ai"]').click();
        await page.locator('#settings-tab-ai [data-help-guide-url]').click();
        await page.waitForFunction(() => document.getElementById('view-help')?.classList.contains('active'));
        await page.waitForFunction(() => document.querySelector('#view-help a[href*="224368506082"]')?.classList.contains('help-guide-navigation-target'));
        await page.evaluate(() => navigateTo('settings', 'sns'));
        await page.locator('#settings-tab-sns #settings-buffer-help-link').click();
        await page.waitForFunction(() => document.getElementById('view-help')?.classList.contains('active'));
        await page.waitForFunction(() => document.querySelector('#view-help a[href*="223940980574"]')?.classList.contains('help-guide-navigation-target'));

        await page.locator('.nav-btn[data-view="settings-next"]').click();
        await page.waitForFunction(() => document.getElementById('view-settings-next')?.classList.contains('active'));
        await page.waitForFunction(() => document.querySelector('#view-settings-next [data-clock-display]')?.children.length > 0);
        await page.locator('#settings-next-content-save').click();
        await page.waitForFunction(() => document.getElementById('settings-next-content-status')?.textContent === '접근 가능');
        assert.equal(await page.locator('#settings-next-sheet-readiness').textContent(), '접근 가능');
        const settingsTopTab = page.locator('[data-settings-next-tab="core"]');
        await settingsTopTab.focus();
        await settingsTopTab.press('ArrowRight');
        assert.equal(await page.locator('[data-settings-next-tab="ai"]').getAttribute('aria-selected'), 'true');
        await page.waitForFunction(() => document.querySelector('#settings-next-ai-text-form [data-ai-field="provider"]')?.value === 'direct');
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
        const settingsNextDiscardPrompt = await page.evaluate(async () => {
            const originalConfirm = showUiConfirm;
            let message = '';
            showUiConfirm = async (nextMessage) => { message = nextMessage; return false; };
            try {
                await navigateTo('dashboard');
                return message;
            } finally {
                showUiConfirm = originalConfirm;
            }
        });
        assert.equal(settingsNextDiscardPrompt.includes('글쓰기 모델'), true);
        assert.equal(await page.locator('#view-settings-next').evaluate((element) => element.classList.contains('active')), true);
        await page.evaluate(() => settingsNextClearScopeDirty('ai-text'));
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
        assert.equal(await page.locator('input[name="settings-writing-profile-kind"]').count(), 2);
        assert.equal(await page.locator('#settings-next-panel-writing [name*="writing-strategy"]').count(), 0);
        const writingStrategyBefore = await page.evaluate(() => settingsNextWritingDraft.common.writing_strategy);
        await page.locator('#settings-next-writing-mode').selectOption('written');
        await page.locator('#settings-next-writing-length').selectOption('long');
        assert.equal((await page.locator('#settings-next-writing-voice-summary').textContent())?.includes('문어체'), true);
        assert.equal((await page.locator('#settings-next-writing-structure-summary').textContent())?.includes('길게'), true);
        assert.equal(await page.locator('#settings-next-writing-apply').isEnabled(), true);
        const writingDiscardPrompt = await page.evaluate(async () => {
            const originalConfirm = showUiConfirm;
            let message = '';
            showUiConfirm = async (nextMessage) => { message = nextMessage; return false; };
            try {
                await navigateTo('dashboard');
                return message;
            } finally {
                showUiConfirm = originalConfirm;
            }
        });
        assert.equal(writingDiscardPrompt.includes('글쓰기 기본값'), true);
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
        for (const viewName of ['account', 'social', 'settings', 'logs', 'shopping', 'dashboard-beta', 'blog-next']) {
            if (await page.locator(`.nav-btn[data-view="${viewName}"]`).isVisible()) {
                await page.locator(`.nav-btn[data-view="${viewName}"]`).click();
            } else {
                await page.evaluate((name) => navigateTo(name), viewName);
            }
            await page.waitForFunction((name) => document.getElementById(`view-${name}`)?.classList.contains('active'), viewName);
        }
        await page.evaluate(() => { showUiConfirm = window.__settingsNextSmokeConfirm; });

        assert.equal(
            await page.locator('.nav-btn[data-view="blog-next"] .nav-label').evaluate((element) => element.childNodes[0]?.textContent?.trim()),
            '블로그'
        );
        assert.equal(await page.locator('.nav-btn[data-view="blog-next"] .nav-new-badge').count(), 0);
        assert.equal(await page.locator('.nav-btn[data-view="card-news"] .nav-new-badge').count(), 0);
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
            feedStatus: '발행 대기',
            managedStatus: '발행 대기',
            feedState: 'pending',
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
        assert.equal(cardNewsPromptResult.localPickerText, '＋ 내 이미지 선택');
        assert.equal(cardNewsPromptResult.localPickerSecondary, true);
        assert.equal(cardNewsPromptResult.promptCopyTextAction, true);
        assert.equal(cardNewsPromptResult.promptCopyLabel, '복사');
        assert.equal(cardNewsPromptResult.promptDisclosureLabel, '프롬프트 보기');
        assert.equal(cardNewsPromptResult.bulkPrimary, true);
        assert.equal(cardNewsPromptResult.sequenceBadgeCount, 3);
        assert.equal(cardNewsPromptResult.imageActionsInsideMedia, true);
        assert.equal(cardNewsPromptResult.promptActionsOutsideMedia, true);
        assert.equal(cardNewsPromptResult.headingActionsBelow, true);
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
                        buffer_configured: true,
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
            regenerateText: 'AI 재생성',
            replaceText: '이미지 교체',
            downloadText: '받기',
            completedActionsInsideMedia: true,
            downloadInsideMedia: true,
            completedActionOpacity: '0'
        });
        await page.waitForFunction(() => document.querySelectorAll('[data-card-news-publish-channel]').length === 3);
        assert.deepEqual(await page.evaluate(() => {
            const panel = document.getElementById('card-news-publishing-panel');
            const resultPanel = document.getElementById('card-news-result-panel');
            const help = panel.querySelector('a[target="_blank"]');
            const heading = panel.querySelector('.card-news-publishing-heading');
            const channelLegend = panel.querySelector('.card-news-publishing-channel-group legend');
            const channelGrid = document.getElementById('card-news-publishing-channels');
            const publishButton = document.getElementById('card-news-publish-button');
            const panelBox = panel.getBoundingClientRect();
            const headingBox = heading.getBoundingClientRect();
            const buttonBox = publishButton.getBoundingClientRect();
            return {
                inlineAfterResult: panel.getBoundingClientRect().top >= resultPanel.getBoundingClientRect().bottom,
                contentIsPadded: headingBox.left - panelBox.left >= 20 && headingBox.top - panelBox.top >= 20,
                actionIsPadded: panelBox.right - buttonBox.right >= 20 && panelBox.bottom - buttonBox.bottom >= 20,
                channelLabelGapIsClear: channelGrid.getBoundingClientRect().top - channelLegend.getBoundingClientRect().bottom >= 10,
                stepLabel: panel.querySelector('.ui-workflow-stage')?.textContent.trim(),
                channelCount: document.querySelectorAll('.card-news-publishing-channel.ui-selectable-card').length,
                limit: document.getElementById('card-news-publishing-channel-limit')?.textContent,
                preparedText: document.getElementById('card-news-publishing-text')?.value,
                providerNamed: document.getElementById('card-news-drive-notice')?.textContent.includes('Bitly'),
                externalHelp: help?.target === '_blank' && help?.rel.includes('noopener'),
                settingsControls: Boolean(document.querySelector('#card-news-buffer-settings, #card-news-google-settings')),
                primaryDisabled: document.getElementById('card-news-publish-button')?.disabled
            };
        }), {
            inlineAfterResult: true,
            contentIsPadded: true,
            actionIsPadded: true,
            channelLabelGapIsClear: true,
            stepLabel: '3단계',
            channelCount: 3,
            limit: '최대 3개 · 0개 선택',
            preparedText: '완성된 UI smoke 카드뉴스\n\nhttps://short.example/card-news',
            providerNamed: false,
            externalHelp: true,
            settingsControls: false,
            primaryDisabled: true
        });
        await page.locator('#card-news-publish-open').click();
        assert.equal(await page.locator('#card-news-publishing-panel').isVisible(), true);
        await page.locator('[data-card-news-publish-channel][value="instagram-1"]').check();
        assert.equal(await page.locator('#card-news-publish-button').isEnabled(), true);
        assert.equal(await page.locator('#card-news-publishing-channel-limit').textContent(), '최대 3개 · 1개 선택');
        await page.unroute('**/api/v1/card-news/publishing/config?generation_id=*');
        await page.route('**/api/v1/card-news/publishing/config?generation_id=*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    success: true,
                    data: {
                        generation_id: 'ui-smoke-not-ready',
                        buffer_configured: false,
                        media_transport: '',
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
            readinessText: document.getElementById('card-news-publishing-readiness')?.textContent
        })), {
            panelHidden: true,
            publishButtonHidden: true,
            readinessState: 'warning',
            readinessText: '설정 > 부가 서비스 > SNS 배포에서 Buffer 연결을 먼저 완료해 주세요. 설정 > 기본 연결 > 콘텐츠 공간에서 Google 계정을 먼저 연결해 주세요.'
        });
        await page.unroute('**/api/v1/card-news/publishing/config?generation_id=*');
        await page.locator('.card-news-result-image-wrap').first().hover();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.card-news-result-image-wrap .card-news-media-actions')).opacity === '1');
        assert.deepEqual(await page.evaluate(() => {
            const actionBar = document.querySelector('.card-news-result-image-wrap .card-news-media-actions');
            const actions = [...actionBar.querySelectorAll(':scope > button, :scope > a')];
            const cards = [...document.querySelectorAll('.card-news-result-item')];
            const actionTops = actions.map((action) => action.getBoundingClientRect().top);
            return {
                opacity: getComputedStyle(actionBar).opacity,
                flexWrap: getComputedStyle(actionBar).flexWrap,
                singleRow: Math.max(...actionTops) - Math.min(...actionTops) < 1,
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
            5
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
        assert.equal(await page.locator('#blog-next-topic-form [data-blog-next-runner-status-jump]').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('.blog-next-ai-assist').count(), 3);
        assert.equal(await page.locator('#blog-next-content-settings').getAttribute('open'), null);
        assert.equal(await page.locator('#blog-next-publish-settings').getAttribute('open'), null);
        assert.equal(await page.locator('#blog-next-publish-settings').isHidden(), true);
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
        await page.locator('#blog-next-enqueue-topic').click();
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
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), true);
        assert.equal(await page.locator('#blog-next-naver-category').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-wordpress-category').isDisabled(), true);
        await page.locator('#blog-next-naver-category').fill('기존 네이버 카테고리');
        await page.locator('#blog-next-target-wordpress').check();
        assert.equal(await page.locator('#blog-next-wordpress-category').isEnabled(), true);
        await page.locator('#blog-next-wordpress-category').fill('Existing WordPress Category');
        assert.equal(await page.locator('#blog-next-naver-category').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-naver-category').inputValue(), '기존 네이버 카테고리');
        assert.equal(await page.locator('#blog-next-runner-headless').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), true);
        assert.equal((await page.locator('#blog-next-publish-settings-summary').textContent())?.trim(), '워드프레스 · 즉시 발행');
        await page.locator('#blog-next-target-naver').check();
        assert.equal(await page.locator('#blog-next-runner-headless').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), true);
        assert.equal(await page.locator('#blog-next-naver-category').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-naver-category').inputValue(), '기존 네이버 카테고리');
        assert.equal(await page.locator('#blog-next-wordpress-category').isDisabled(), true);
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
            ['내용 지우기', '글감 보관', '발행 대기열에 추가', '원고 만들기']
        );
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
                ideaDisplay: 'flex',
                ideaJustify: 'space-between',
                generateDisplay: 'flex',
                generateJustify: 'space-between',
                primaryBackground: 'rgb(73, 103, 90)',
                secondaryBackground: 'rgb(250, 252, 250)',
                secondaryBorder: 'solid'
            }
        );
        const aiPreparationWidths = await page.locator('#view-blog-next .blog-next-ai-prepare-actions').evaluate((element) => ({
            container: element.getBoundingClientRect().width,
            idea: element.querySelector('[data-blog-next-ai-idea-actions]').getBoundingClientRect().width,
            generate: element.querySelector('[data-blog-next-ai-generate-action]').getBoundingClientRect().width
        }));
        assert.ok(aiPreparationWidths.idea >= aiPreparationWidths.container * 0.98);
        assert.ok(aiPreparationWidths.generate >= aiPreparationWidths.container * 0.98);
        assert.equal(await page.locator('[data-blog-next-draft-actions="ai"]').isHidden(), true);
        assert.equal(await page.locator('#blog-next-publish-now').evaluate((element) => element.classList.contains('primary')), true);
        assert.equal(await page.locator('#blog-next-clear-topic').evaluate((element) => element.classList.contains('blog-next-clear-action')), true);
        await page.locator('#blog-next-clear-topic').click();
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '');
        assert.equal(await page.locator('#blog-next-save-topic').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-enqueue-topic').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-publish-now').isDisabled(), true);
        assert.equal(await page.locator('#blog-next-clear-undo').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-clear-undo').evaluate((element) => element === document.activeElement), true);
        await page.locator('#blog-next-clear-undo').click();
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '스타일 전환 중에도 보존할 주제');
        assert.equal(await page.locator('#blog-next-save-topic').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-enqueue-topic').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-publish-now').isEnabled(), true);
        assert.equal(await page.locator('#blog-next-clear-undo').evaluate((element) => element.hidden), true);
        await page.locator('#blog-next-clear-topic').click();

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
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '제주 가을 여행');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '제주 가을 여행');
        assert.equal(await page.locator('#blog-next-title').inputValue(), '');
        await page.locator('#blog-next-clear-topic').click();

        await page.locator('#blog-next-subject').fill('기존에 적어둔 제주 글감');
        await page.locator('#blog-next-keywords').fill('제주 산책');
        await page.locator('#blog-next-keyword-recommend').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('#quick-keyword-discovery-query').inputValue(), '제주 산책');
        await page.locator('#quick-discovery-modal-close').click();
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
        await page.locator('#blog-next-clear-topic').click();

        await page.locator('#blog-next-topic-recommend').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        await page.locator('#quick-topic-recommendations-refresh').click();
        await page.waitForFunction(() => document.querySelectorAll('.quick-topic-recommendation-row').length === 1);
        await page.locator('.quick-topic-recommendation-row [data-recommendation-action="quick"]').click();
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '추천 글감 1');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '테스트');

        await page.locator('#blog-next-title-recommend').click();
        await page.waitForFunction(() => !document.getElementById('keyword-research-modal')?.classList.contains('hidden'));
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
        await page.locator('#blog-next-clear-topic').click();

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
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('blog_next_topic_defaults_v1') || '{}').postStatus), 'draft');
        assert.equal(await page.locator('#blog-next-clear-topic').isHidden(), true);

        await page.locator('[data-blog-next-input-mode="ai"]').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"]').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('[data-blog-next-input-mode="folder"]').getAttribute('tabindex'), '0');
        assert.equal(await page.locator('[data-blog-next-input-mode="folder"]').evaluate((element) => element === document.activeElement), true);
        assert.equal(await page.locator('#blog-next-publish-settings').count(), 1);
        assert.equal(await page.locator('#blog-next-publish-settings').evaluate((element) => element.closest('[data-blog-next-mode-panel]')?.dataset.blogNextModePanel), 'folder');
        if (!await page.locator('[data-blog-next-draft-settings="folder"]').evaluate((element) => element.open)) {
            await page.locator('[data-blog-next-draft-settings="folder"] summary').click();
        }
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').isDisabled(), true);
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').selectOption('schedule');
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').isEnabled(), true);
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').fill('2026-09-20T11:30');
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').selectOption('publish');
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').isDisabled(), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="schedule-date"]').inputValue(), '2026-09-20T11:30');
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), true);
        await page.locator('#blog-next-runner-headless').uncheck();
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="target-wordpress"]').check();
        assert.equal(await page.locator('#blog-next-runner-headless').isDisabled(), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="naver-category"]').isDisabled(), true);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="wordpress-category"]').isEnabled(), true);
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="target-naver"]').check();
        await page.locator('[data-blog-next-input-mode="folder"]').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), false);
        assert.equal(await page.locator('#blog-next-publish-settings').evaluate((element) => element.closest('[data-blog-next-mode-panel]')?.dataset.blogNextModePanel), 'paste');
        await page.locator('[data-blog-next-input-mode="paste"]').focus();
        await page.keyboard.press('Home');
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
        await page.locator('#blog-next-saved-list .blog-next-queue-copy').click();
        assert.equal((await page.locator('#blog-next-editor-title').textContent())?.trim(), '보관한 글감 수정');
        assert.equal(await page.locator('#blog-next-editor-modal').evaluate((element) => element.classList.contains('hidden')), false);
        assert.equal((await page.locator('#blog-next-save-topic').textContent())?.trim(), '저장');
        assert.equal(await page.locator('#blog-next-enqueue-topic').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-publish-now').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-clear-topic').isHidden(), true);
        assert.equal(await page.locator('#blog-next-cancel-edit').isVisible(), true);
        await page.locator('#blog-next-subject').fill('다듬은 제주 글감');
        await page.locator('#blog-next-save-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('보관한 글감을 수정했습니다'));
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
        assert.equal((await page.locator('#blog-next-save-topic').textContent())?.trim(), '저장');
        assert.equal(await page.locator('#blog-next-enqueue-topic').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-publish-now').evaluate((element) => element.hidden), true);
        assert.deepEqual(
            await page.locator('#blog-next-editor-actions-slot .blog-next-form-actions button:visible')
                .evaluateAll((buttons) => buttons
                    .map((button) => ({ text: button.textContent.trim(), order: Number(getComputedStyle(button).order) }))
                    .sort((left, right) => left.order - right.order)
                    .map(({ text }) => text)),
            ['취소', '저장']
        );
        await page.locator('#blog-next-subject').fill('수정한 제주 글감');
        await page.locator('#blog-next-target-wordpress').check();
        await page.locator('#blog-next-save-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('발행 계획을 수정했습니다'));
        assert.equal(await page.locator('#blog-next-panel-queue').evaluate((element) => element.hidden), false);
        await page.waitForFunction(() => document.querySelector('#blog-next-queue-list .blog-next-queue-item strong')?.textContent === '수정한 제주 글감');
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item').textContent()).includes('워드프레스'), true);
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item').textContent()).includes('네이버 블로그 · 워드프레스'), false);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await page.locator('#blog-next-queue-list .blog-next-queue-actions button', { hasText: '보관으로 이동' }).click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 0);
        assert.equal((await page.locator('#blog-next-saved-count').textContent())?.trim(), '1건');
        assert.equal((await page.locator('#blog-next-queue-count').textContent())?.trim(), '0건');

        await page.locator('[data-blog-next-tab="quick"]').click();
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
        await page.route('**/api/v1/blog/manuscript-drafts/ai', aiDraftRetryRoute);
        await page.locator('#blog-next-image-mode').selectOption('none');
        await page.locator('#blog-next-subject').fill('미리 확인할 AI 원고');
        await page.locator('#blog-next-keywords').fill('단일 플랫폼, 원고 미리보기');
        const clearActionSpacing = await page.locator('.blog-next-ai-prepare-actions').evaluate((element) => {
            const clear = element.querySelector('#blog-next-clear-topic').getBoundingClientRect();
            const firstAction = element.querySelector('[data-blog-next-ai-idea-actions]').getBoundingClientRect();
            return firstAction.top - clear.bottom;
        });
        assert.ok(clearActionSpacing > 0, `내용 지우기와 구분선 사이 간격이 없습니다: ${clearActionSpacing}`);
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-validation="ai"]')?.classList.contains('has-error'));
        assert.match((await page.locator('[data-blog-next-draft-validation="ai"]').textContent()) || '', /AI 공급자의 요청 한도/);
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-now')?.textContent?.trim() === '원고 만드는 중...');
        assert.equal(await page.locator('[data-blog-next-draft-validation="ai"]').isHidden(), true);
        assert.equal(await page.locator('#blog-next-clear-topic').isDisabled(), true);
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="ai"]')?.hidden === false);
        assert.equal(await page.locator('#blog-next-clear-topic').isEnabled(), true);
        const noneAiDraftRequest = requests.filter((request) => request.pathname === '/api/v1/blog/manuscript-drafts/ai').at(-1);
        assert.equal(noneAiDraftRequest?.body?.imageMode, 'none');
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-image-details]').isHidden(), true);
        assert.equal(await page.locator('#blog-next-publish-safety-hint').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-manuscript-image-slot]').count(), 0);

        await page.locator('#blog-next-image-mode').selectOption('generate');
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-now')?.textContent?.trim() === '원고 만드는 중...');
        await page.waitForFunction(() => document.querySelectorAll('[data-blog-next-draft-preview="ai"] [data-manuscript-image-slot]').length === 2);
        await page.unroute('**/api/v1/blog/manuscript-drafts/ai', aiDraftRetryRoute);
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        assert.equal((await page.locator('#blog-next-publish-status-title').textContent())?.trim(), '원고 준비 완료');
        assert.equal(await page.locator('#blog-next-publish-settings').isVisible(), true);
        await page.locator('#blog-next-target-naver').check();
        await page.locator('#blog-next-post-status').selectOption('publish');
        assert.equal((await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-title]').textContent())?.trim(), '미리 확인할 AI 원고');
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-manuscript-image-slot]').count(), 2);
        assert.equal(await page.locator('#blog-next-post-status').inputValue(), 'publish');
        assert.equal(await page.locator('#blog-next-post-status option[value="publish"]').evaluate((option) => option.disabled), false);
        assert.equal(await page.locator('#blog-next-post-status option[value="schedule"]').evaluate((option) => option.disabled), false);
        assert.match((await page.locator('#blog-next-publish-safety-hint').textContent()) || '', /빈 이미지 1개는 포스팅할 때 자동으로 만듭니다/);
        assert.equal((await page.locator('[data-blog-next-draft-publish="ai"]').textContent())?.trim(), '즉시 발행');
        assert.equal(await page.locator('.blog-next-ai-prepare-actions').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-ai-idea-actions]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-ai-generate-action]').isHidden(), true);
        assert.equal(await page.locator('[data-blog-next-ai-preview-actions]').isVisible(), true);
        assert.equal(await page.locator('#blog-next-regenerate-draft').isVisible(), true);
        const aiDraftRequest = requests.find((request) => request.pathname === '/api/v1/blog/manuscript-drafts/ai');
        assert.deepEqual(aiDraftRequest?.body?.targets, ['naver']);
        assert.equal(aiDraftRequest?.body?.subject, '미리 확인할 AI 원고');
        assert.equal(requests.some((request) => request.pathname === '/api/v1/continuous-publishing/topics' && request.body?.subject === '미리 확인할 AI 원고'), false);
        const aiPublishResponse = page.waitForResponse((response) => (
            new URL(response.url()).pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`
        ));
        await page.locator('[data-blog-next-draft-publish="ai"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.match((await page.locator('#ui-dialog-message').textContent()) || '', /네이버 블로그에 즉시 발행할까요/);
        assert.match((await page.locator('#ui-dialog-message').textContent()) || '', /빈 이미지 1개는 먼저 AI로 만듭니다/);
        assert.equal((await page.locator('#ui-dialog-confirm').textContent())?.trim(), '즉시 발행');
        await page.locator('#ui-dialog-confirm').click();
        await aiPublishResponse;
        const aiPublishRequest = requests.find((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`);
        assert.equal(aiPublishRequest?.body?.draftId, MANUSCRIPT_DRAFT_ID);
        assert.equal(aiPublishRequest?.body?.revision, 2);
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="ai"] [data-draft-preview-image-summary]')?.textContent?.includes('2/2'));
        assert.equal(await page.locator('[data-blog-next-draft-preview="ai"] [data-draft-preview-body] img').count(), 2);

        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.locator('#blog-next-runner-headless').check();
        await page.locator('#blog-next-subject').fill('먼저 실행할 글감');
        if (await page.locator('#blog-next-publish-settings').isHidden()) {
            await page.locator('#blog-next-enqueue-topic').click();
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
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 0);
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
        await page.locator('[data-blog-next-input-mode="ai"]').click();
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
        await page.evaluate(() => navigateTo('dashboard'));
        await page.waitForFunction(() => document.getElementById('view-dashboard')?.classList.contains('active'));
        await page.locator('#view-dashboard [data-global-publishing-status]').click();
        await page.waitForFunction(() => (
            document.getElementById('view-blog-next')?.classList.contains('active')
            && document.getElementById('blog-next-panel-queue')?.hidden === false
        ));

        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.locator('[data-blog-next-input-mode="folder"]').click();
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').inputValue(), 'draft');
        await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').selectOption('publish');
        await page.locator('#blog-next-folder-input').setInputFiles(manuscriptFixtureDir);
        await page.waitForFunction(() => (
            document.querySelector('[data-blog-next-draft-preview="folder"]')?.hidden === false
            && document.querySelectorAll('[data-blog-next-draft-preview="folder"] [data-manuscript-image-slot]').length === 2
        ));
        assert.equal((await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-summary]').textContent())?.trim(), '준비 1/2');
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').inputValue(), 'publish');
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"] option[value="publish"]').evaluate((option) => option.disabled), false);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"] option[value="schedule"]').evaluate((option) => option.disabled), false);
        assert.match((await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-image-safety-hint]').textContent()) || '', /빈 이미지 1개는 포스팅할 때 자동으로 만듭니다/);
        await page.evaluate(() => applyUiCapabilityStatus({ setup: {
            ai: { configured: true, image_configured: false },
            google: { configured: true },
            publishing_channel: { configured: true, naver_configured: true, wordpress_configured: true }
        } }));
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-action="generate"]').first().isDisabled(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-picker]').first().isEnabled(), true);
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-ai-readiness]').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('[data-blog-next-draft-publish="folder"]').isEnabled(), true);
        assert.match((await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-image-safety-hint]').textContent()) || '', /안전하게 임시 저장될 수 있습니다/);
        await page.evaluate(() => applyUiCapabilityStatus({ setup: {
            ai: { configured: true, image_configured: true },
            google: { configured: true },
            publishing_channel: { configured: true, naver_configured: true, wordpress_configured: true }
        } }));
        await page.locator('[data-blog-next-mode-panel="folder"] [aria-describedby="blog-next-help-post-status"]').focus();
        assert.equal(await page.locator('#blog-next-help-post-status').isVisible(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '즉시 발행');
        await page.evaluate(() => {
            document.querySelector('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').value = 'draft';
            syncBlogNextDraftExecutionState();
        });
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '블로그에 임시 저장');
        await page.evaluate(() => {
            document.querySelector('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').value = 'schedule';
            syncBlogNextDraftExecutionState();
        });
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '예약 발행');
        await page.evaluate(() => {
            document.querySelector('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').value = 'publish';
            syncBlogNextDraftExecutionState();
        });
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '즉시 발행');
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-body] img').count(), 1);
        await page.locator('[data-blog-next-draft-publish="folder"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.match((await page.locator('#ui-dialog-message').textContent()) || '', /네이버 블로그에 즉시 발행할까요/);
        assert.equal((await page.locator('#ui-dialog-confirm').textContent())?.trim(), '즉시 발행');
        assert.match((await page.locator('#ui-dialog-message').textContent()) || '', /빈 이미지 1개는 먼저 AI로 만듭니다/);
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-summary]')?.textContent?.includes('2/2'));
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-body] img').count(), 2);
        const automaticFolderPublishRequest = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`).at(-1);
        assert.equal(automaticFolderPublishRequest?.body?.revision, 2);
        await page.evaluate(() => document.querySelectorAll('.app-celebration').forEach((element) => element.remove()));
        await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-details] > summary').click();
        await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-file][data-slot-id="image-1"]').setInputFiles(manuscriptFixtureImage);
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-summary]')?.textContent?.includes('2/2'));
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"] option[value="publish"]').evaluate((option) => option.disabled), false);
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"] [data-draft-field="post-status"]').inputValue(), 'publish');
        assert.equal((await page.locator('[data-blog-next-draft-publish="folder"]').textContent())?.trim(), '즉시 발행');
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-draft-preview-body] img').count(), 2);
        await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-slot="image-0"] .local-markdown-image-card-preview').hover();
        await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-action="exclude"][data-slot-id="image-0"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-summary]')?.textContent?.includes('1/1 · 제외 1'));
        assert.equal(await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-action="restore"][data-slot-id="image-0"]').isVisible(), true);
        await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-action="restore"][data-slot-id="image-0"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="folder"] [data-draft-preview-image-summary]')?.textContent?.includes('2/2'));
        await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-slot="image-1"] .local-markdown-image-card-preview').hover();
        await page.locator('[data-blog-next-draft-preview="folder"] [data-manuscript-image-action="generate"][data-slot-id="image-1"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="folder"] [data-manuscript-image-slot="image-1"] .local-markdown-image-card-status')?.textContent === '이미지 준비됨');
        assert.equal(await page.locator('[data-blog-next-draft-publish="folder"]').isDisabled(), false);
        await page.locator('[data-blog-next-draft-publish="folder"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        const folderPublishRequest = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish`).at(-1);
        assert.equal(folderPublishRequest?.body?.draftId, MANUSCRIPT_DRAFT_ID);
        assert.equal(folderPublishRequest?.body?.revision, 8);
        await page.evaluate(() => document.querySelectorAll('.app-celebration').forEach((element) => element.remove()));

        await page.locator('[data-blog-next-input-mode="paste"]').click();
        await page.locator('#blog-next-paste-markdown').fill('# 붙여넣은 원고\n\nQueue를 거치지 않고 바로 실행합니다.\n\n[[IMAGE_0\ntitle: 붙여넣기 이미지\nprompt: 따뜻한 분위기의 이미지\n]]');
        await page.waitForFunction(() => (
            document.querySelector('[data-blog-next-draft-preview="paste"]')?.hidden === false
            && document.querySelector('[data-blog-next-draft-publish="paste"]')?.disabled === false
        ));
        assert.equal(await page.locator('[data-blog-next-draft-validation="paste"]').isHidden(), true);
        await page.locator('#blog-next-paste-clear').click();
        assert.equal(await page.locator('#blog-next-paste-markdown').inputValue(), '');
        assert.equal(await page.locator('#blog-next-paste-clear-undo').isVisible(), true);
        assert.equal(await page.locator('#blog-next-paste-clear-undo').evaluate((element) => element === document.activeElement), true);
        await page.locator('#blog-next-paste-clear-undo').click();
        assert.equal((await page.locator('#blog-next-paste-markdown').inputValue()).startsWith('# 붙여넣은 원고'), true);
        await page.waitForFunction(() => (
            document.querySelector('[data-blog-next-draft-preview="paste"]')?.hidden === false
            && document.querySelector('[data-blog-next-draft-publish="paste"]')?.disabled === false
        ));
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-title]').textContent())?.trim(), '붙여넣은 원고');
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] h2').textContent())?.trim(), '미리보기 소제목');
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] .local-markdown-image-card').count(), 1);
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] .local-markdown-image-card-status').textContent())?.trim(), '파일 없음');
        assert.equal(await page.locator('[data-blog-next-draft-publish="paste"]').isDisabled(), false);
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"]').inputValue(), 'publish');
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"] option[value="publish"]').evaluate((option) => option.disabled), false);
        assert.equal(await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-field="post-status"] option[value="schedule"]').evaluate((option) => option.disabled), false);
        assert.match((await page.locator('[data-blog-next-mode-panel="paste"] [data-draft-image-safety-hint]').textContent()) || '', /빈 이미지 1개는 포스팅할 때 자동으로 만듭니다/);
        if (!await page.locator('[data-blog-next-draft-settings="paste"]').evaluate((element) => element.open)) {
            await page.locator('[data-blog-next-draft-settings="paste"] > summary').click();
        }
        await page.locator('[data-blog-next-mode-panel="paste"] [aria-describedby="blog-next-help-post-status"]').focus();
        assert.equal(await page.locator('#blog-next-help-post-status').isVisible(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="paste"]').textContent())?.trim(), '즉시 발행');
        await page.locator('[data-blog-next-draft-publish="paste"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.match((await page.locator('#ui-dialog-message').textContent()) || '', /빈 이미지 1개는 먼저 AI로 만듭니다/);
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="paste"] [data-draft-preview-image-summary]')?.textContent?.includes('1/1'));
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] img').count(), 1);
        const automaticPastePublishRequest = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish`).at(-1);
        assert.equal(automaticPastePublishRequest?.body?.revision, 3);
        await page.evaluate(() => document.querySelectorAll('.app-celebration').forEach((element) => element.remove()));
        await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-image-details] > summary').click();
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-manuscript-image-picker][data-slot-id="image-0"]').isVisible(), true);
        await page.locator('[data-blog-next-draft-preview="paste"] [data-manuscript-image-file][data-slot-id="image-0"]').setInputFiles(manuscriptFixtureImage);
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="paste"] [data-draft-preview-image-summary]')?.textContent?.includes('1/1'));
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] img').count(), 1);
        await page.locator('[data-blog-next-draft-preview="paste"] [data-manuscript-image-slot="image-0"] .local-markdown-image-card-preview').hover();
        await page.locator('[data-blog-next-draft-preview="paste"] [data-manuscript-image-action="exclude"][data-slot-id="image-0"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="paste"] [data-draft-preview-image-summary]')?.textContent?.includes('0/0 · 제외 1'));
        await page.locator('[data-blog-next-draft-preview="paste"] [data-manuscript-image-action="restore"][data-slot-id="image-0"]').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-preview="paste"] [data-draft-preview-image-summary]')?.textContent?.includes('1/1'));
        await page.evaluate(() => document.querySelectorAll('.app-celebration').forEach((element) => element.remove()));
        await page.locator('[data-blog-next-draft-publish="paste"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'running');
        assert.equal(await page.locator('[data-blog-next-draft-publish="folder"]').isDisabled(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="paste"]').textContent())?.trim(), '발행 중...');
        await page.locator('[data-blog-next-tab="queue"]').click();
        assert.equal(await page.locator('[data-blog-next-run-now]').isDisabled(), true);
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'completed');
        assert.equal(await page.locator('[data-blog-next-run-now]').isDisabled(), false);
        await page.waitForFunction(() => document.querySelector('.app-celebration-message')?.textContent.includes('글쓰기 완료'));
        const pastedPublishRequest = requests.filter((request) => request.pathname === `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish`).at(-1);
        assert.equal(pastedPublishRequest?.body?.draftId, PASTE_MANUSCRIPT_DRAFT_ID);
        assert.equal(pastedPublishRequest?.body?.revision, 8);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());

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
                        ai: { available: false, model_name: '' }
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
                            max_assets: 10,
                            image_required: false,
                            supported: true
                        }]
                    }
                })
            });
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
        assert.equal(await page.locator('#manual-sns-image-source-local').isChecked(), true);
        assert.equal(await page.locator('#manual-sns-image-file').getAttribute('multiple'), '');
        assert.equal(await page.locator('#manual-sns-image-local-panel').isVisible(), true);
        assert.equal(await page.locator('#manual-sns-image-url-panel').isHidden(), true);
        await page.locator('#manual-sns-image-file').setInputFiles([
            path.join(repoRoot, 'assets/icons/1.png'),
            path.join(repoRoot, 'assets/icons/2.png')
        ]);
        await page.waitForFunction(() => document.querySelectorAll('.social-local-image-tile').length === 2);
        assert.equal(await page.locator('.social-local-image-tile').nth(0).getAttribute('draggable'), 'true');
        assert.equal((await page.locator('.social-local-image-tile figcaption').nth(0).textContent())?.trim(), '1.png');
        await page.locator('.social-local-image-tile').nth(0).dragTo(page.locator('.social-local-image-tile').nth(1));
        assert.equal((await page.locator('.social-local-image-tile figcaption').nth(0).textContent())?.trim(), '2.png');
        await page.locator('.social-local-image-remove').nth(1).click();
        assert.equal(await page.locator('.social-local-image-tile').count(), 1);
        await page.locator('#manual-sns-text').fill('테스트 문구');
        await page.waitForFunction(() => document.getElementById('manual-sns-character-count')?.textContent === '6자');
        assert.equal(await page.locator('#manual-sns-publish-btn').isDisabled(), true);
        await page.locator('#manual-sns-text').fill('');

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
        await page.evaluate(() => navigateTo('blog', 'topics'));

        await page.locator('.blog-tab-btn[data-blog-tab="topics"]').click();
        await page.waitForFunction(() => document.getElementById('blog-tab-topics')?.classList.contains('active'));
        assert.equal(await page.locator('#blog-table').count(), 1);

        await page.locator('.blog-tab-btn[data-blog-tab="trend-posting"]').click();
        await page.waitForFunction(() => document.getElementById('blog-tab-trend-posting')?.classList.contains('active'));

        await page.locator('.blog-tab-btn[data-blog-tab="collect"]').click();
        await page.waitForFunction(() => document.getElementById('blog-tab-collect')?.classList.contains('active'));
        await page.waitForFunction(() => document.getElementById('blog-collect-trends-result')?.textContent?.includes('불러오기 완료'));
        await page.evaluate(() => setBlogCollectResultText('수집 설정 테스트'));
        assert.equal((await page.locator('#blog-collect-trends-result').textContent())?.trim(), '수집 설정 테스트');

        await page.locator('.nav-btn[data-view="shopping"]').click();
        assert.equal((await page.locator('#shopping-tab-button-quick').textContent())?.trim(), '빠른 글 작성');
        await page.locator('#shopping-quick-url').fill('https://naver.me/fixture');
        await page.locator('#shopping-quick-preview-btn').click();
        await page.waitForFunction(() => document.getElementById('shopping-quick-preview')?.dataset.state === 'success');
        assert.equal((await page.locator('#shopping-quick-preview-title').textContent())?.trim(), 'UI 회귀 테스트 상품');
        assert.equal((await page.locator('#shopping-quick-preview-price').textContent())?.trim(), '19,900원 · 정가 29,900원');
        assert.equal((await page.locator('#shopping-quick-preview-discount').textContent())?.trim(), '33%');
        assert.equal((await page.locator('#shopping-quick-preview-image-count').textContent())?.trim(), '4장');
        assert.equal(await page.locator('#shopping-quick-product-field').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#shopping-quick-product').inputValue(), 'UI 회귀 테스트 상품');
        assert.equal(await page.locator('#shopping-quick-preview-link').getAttribute('href'), 'https://smartstore.naver.com/fixture/products/1234567890');
        await page.locator('#shopping-quick-url').fill('https://naver.me/changed');
        assert.equal(await page.locator('#shopping-quick-preview').getAttribute('data-state'), 'empty');
        assert.equal(await page.locator('#shopping-quick-product-field').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#shopping-quick-product').inputValue(), '');
        assert.equal(await page.locator('#shopping-tab-button-batch').isHidden(), true);
        await page.evaluate(() => activateShoppingTab('batch'));
        assert.equal(await page.locator('#shopping-tab-quick').evaluate((element) => element.classList.contains('active')), true);
        assert.equal(await page.locator('#shopping-tab-batch').isHidden(), true);

        const missingShoppingSetupRoute = async (route) => route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
                success: true,
                data: {
                    ready: false,
                    isEssentialSet: false,
                    isNaverSet: false,
                    isWpSet: false,
                    setup: {
                        ready: false,
                        ai: { configured: false, text_configured: false, image_configured: false },
                        google: { configured: false, account_connected: false, spreadsheet_configured: false },
                        publishing_channel: { configured: false, naver_configured: false, wordpress_configured: false }
                    }
                }
            })
        });
        await page.route('**/api/v1/config/status', missingShoppingSetupRoute);
        await page.evaluate(() => navigateTo('dashboard-beta'));
        await page.evaluate(() => navigateTo('shopping', 'quick'));
        await page.waitForFunction(() => document.getElementById('view-shopping')?.classList.contains('active'));
        assert.equal(await page.locator('#shopping-quick-deferred-actions').isHidden(), true);
        assert.equal(await page.locator('#shopping-sheet-readiness').isVisible(), true);
        assert.equal(await page.locator('#shopping-ai-readiness').isVisible(), true);
        assert.equal(await page.locator('#shopping-publish-readiness').isVisible(), true);
        assert.equal(await page.locator('#shopping-quick-preview-btn').isEnabled(), true);
        assert.equal(await page.locator('#shopping-quick-save-btn').isHidden(), true);
        assert.equal(await page.locator('#ui-dialog-backdrop').evaluate((element) => element.classList.contains('hidden')), true);
        await page.unroute('**/api/v1/config/status', missingShoppingSetupRoute);

        await page.evaluate(() => navigateTo('blog', 'quick'));
        await page.locator('.blog-tab-btn[data-blog-tab="quick"]').click();
        await page.waitForFunction(() => document.getElementById('blog-tab-quick')?.classList.contains('active'));

        await page.locator('#quick-keywords').fill('블로그 자동화, 글쓰기 도구');
        await page.locator('#quick-keyword-discovery-open-btn').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('[data-quick-discovery-tab="keyword"]').getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('#quick-discovery-keyword-panel').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#quick-keyword-discovery-query').inputValue(), '블로그 자동화, 글쓰기 도구');
        await page.locator('#quick-discovery-modal-close').click();
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));

        await page.evaluate(async () => {
            const originalConfirm = showUiConfirm;
            showUiConfirm = async () => true;
            try {
                document.getElementById('quick-subject').value = '사용자가 작성한 주제';
                await applyQuickKeywordDiscovery([{ keyword: '선택 키워드' }]);
            } finally {
                showUiConfirm = originalConfirm;
            }
        });
        assert.equal(await page.locator('#quick-subject').inputValue(), '사용자가 작성한 주제');
        assert.equal(await page.locator('#quick-keywords').inputValue(), '선택 키워드');

        await page.evaluate(async () => {
            const originalConfirm = showUiConfirm;
            showUiConfirm = async () => true;
            try {
                document.getElementById('quick-subject').value = '   ';
                await applyQuickKeywordDiscovery([{ keyword: '빈 주제 자동 입력' }]);
            } finally {
                showUiConfirm = originalConfirm;
            }
        });
        assert.equal(await page.locator('#quick-subject').inputValue(), '빈 주제 자동 입력');
        assert.equal(await page.locator('#quick-keywords').inputValue(), '빈 주제 자동 입력');

        await page.evaluate(() => {
            Object.assign(quickTopicRecommendationState, {
                items: [],
                loaded: false,
                loading: false,
                error: '',
                query: '',
                smartUsageSessionId: '',
                smartUsage: null,
                smartUsageStartedAt: 0
            });
        });
        await page.locator('#quick-discovery-open-btn').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('[data-quick-discovery-tab="topic"]').getAttribute('aria-selected'), 'true');
        await page.locator('#quick-topic-recommendations-refresh').click();
        await page.waitForFunction(() => document.querySelectorAll('.quick-topic-recommendation-row').length === 1);
        assert.match((await page.locator('#quick-topic-smart-usage').textContent()) || '', /한 번 더 새로운 글감을/);
        await page.evaluate(() => {
            const staleOverview = JSON.parse(JSON.stringify(lastAccountOverview));
            staleOverview.smart_usage.items[0].remaining = 20;
            renderAccountOverview(staleOverview, { smartUsageRevisionAtRequest: 0 });
        });
        assert.match((await page.locator('#quick-topic-smart-usage').textContent()) || '', /^19 \/ 20회 남음/);
        await page.locator('#quick-discovery-modal-close').click();
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        await page.locator('#quick-discovery-open-btn').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('.quick-topic-recommendation-row').count(), 1);
        await page.locator('#quick-topic-recommendations-refresh').click();
        await page.waitForFunction(() => document.getElementById('quick-topic-recommendations-refresh')?.textContent?.includes('계속 추천받기'));
        await page.locator('#quick-topic-recommendations-refresh').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-title').textContent())?.trim(), '계속 추천받을까요?');
        assert.doesNotMatch((await page.locator('#ui-dialog-message').textContent()) || '', /세션|provider|request/i);
        await page.locator('#ui-dialog-cancel').click();
        await page.locator('#quick-discovery-modal-close').click();
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.body.classList.contains('mobile-quick-mode'));
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
        assert.equal(await page.locator('.nav-btn[data-view="blog"]').isHidden(), true);
        assert.equal(await page.locator('.nav-btn[data-view="blog-next"]').isVisible(), true);
        assert.equal(await page.locator('.mobile-topbar').evaluate((element) => getComputedStyle(element).display), 'flex');
        await page.evaluate(() => navigateTo('dashboard'));
        await page.waitForFunction(() => document.getElementById('view-dashboard')?.classList.contains('active'));
        const centerBox = await page.locator('#recommendation-center').boundingBox();
        assert.equal(Boolean(centerBox && centerBox.width <= 390), true);
        assert.equal(
            await page.locator('#recommendation-center-list').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
            1
        );
        await page.locator('#mobile-menu-btn').click();
        await page.waitForFunction(() => document.querySelector('.sidebar')?.classList.contains('open'));
        assert.equal(await page.locator('#sidebar-overlay').evaluate((element) => element.classList.contains('active')), true);
        await page.locator('#sidebar-overlay').click({ position: { x: 380, y: 420 } });
        await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('open'));

        const expectedPosts = requests
            .filter((request) => request.method !== 'GET' && request.pathname !== '/api/v1/system/ui-event')
            .map(({ method, pathname }) => ({ method, pathname }));
        assert.deepEqual(expectedPosts, [
            { method: 'POST', pathname: '/api/v1/recommendations/discover' },
            { method: 'POST', pathname: '/api/v1/recommendations/interaction' },
            { method: 'POST', pathname: '/api/v1/recommendations/discover' },
            { method: 'POST', pathname: '/api/v1/google-oauth/test' },
            { method: 'PUT', pathname: '/api/v1/settings/writing-profile' },
            { method: 'POST', pathname: '/api/v1/settings/optional-services' },
            { method: 'POST', pathname: '/api/v1/settings/optional-services/test' },
            { method: 'POST', pathname: '/api/v1/trend-posting/topics' },
            { method: 'POST', pathname: '/api/v1/keywords/analyze' },
            { method: 'POST', pathname: '/api/v1/keywords/suggest-titles' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics/update' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics/delete' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics/update' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/remove' },
            { method: 'POST', pathname: '/api/v1/blog/manuscript-drafts/ai' },
            { method: 'POST', pathname: '/api/v1/blog/manuscript-drafts/ai' },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/settings` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish` },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/reorder' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/reorder' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/remove' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/runner/start' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/automation/settings' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/blog/manuscript-drafts/folder' },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/settings` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/image-slots/image-1/import` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/image-slots/image-0/exclude` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/image-slots/image-0/restore` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/image-slots/image-1/generate` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/settings` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${MANUSCRIPT_DRAFT_ID}/publish` },
            { method: 'POST', pathname: '/api/v1/blog/manuscript-drafts/paste' },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/markdown` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/markdown` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/image-slots/image-0/import` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/image-slots/image-0/exclude` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/image-slots/image-0/restore` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/markdown` },
            { method: 'POST', pathname: `/api/v1/blog/manuscript-drafts/${PASTE_MANUSCRIPT_DRAFT_ID}/publish` }
        ]);
        assert.equal(requests.some((request) => request.pathname === '/app.js'), true);
        assert.equal(requests.some((request) => request.pathname === '/styles.css'), true);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.navigateTo === 'function');
        await page.evaluate(() => navigateTo('social'));
        await page.waitForFunction(() => document.querySelectorAll('[data-manual-sns-channel]').length === 1);
        assert.equal(manualSnsWorkspaceRequestCount, 1);
        assert.equal((await page.locator('#manual-sns-organization').inputValue()), 'org-fixture');

        assert.deepEqual(failedResponses, []);
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(consoleErrors, []);

        await context.close();
        console.log(`✅ browser UI smoke test passed (${requests.length} fixture requests)`);
    } finally {
        if (browser) await browser.close();
        await closeServer(server);
        fs.rmSync(manuscriptFixtureDir, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error('❌ browser UI smoke test failed');
    console.error(error?.stack || error);
    process.exitCode = 1;
});
