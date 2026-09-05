#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');
const { createCssCompositionRuntime } = require('../src/ui-runtime/css-composition-runtime');
const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');

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
            ai: { configured: true },
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
            schema_version: 1,
            generated_at: '2026-09-02T01:00:00.000Z',
            timezone: 'Asia/Seoul',
            available: true,
            periods: {
                today: {
                    from: '2026-09-01T15:00:00.000Z', to: '2026-09-02T15:00:00.000Z', processed_count: 3, published_count: 1,
                    daily_series: [],
                    recent_results: [{
                        id: 'dashboard-result-today', occurred_at: '2026-09-02T00:50:00.000Z',
                        subject: '오늘 발행 결과', platform: 'wordpress', post_status: 'publish',
                        result_url: 'https://example.com/dashboard-result', navigation_url: 'https://example.com/dashboard-result',
                        navigation_kind: 'result'
                    }]
                },
                week: {
                    from: '2026-08-30T15:00:00.000Z', to: '2026-09-06T15:00:00.000Z', processed_count: 8, published_count: 4,
                    daily_series: Array.from({ length: 7 }, (_unused, index) => ({
                        date: new Date(Date.UTC(2026, 7, 31 + index)).toISOString().slice(0, 10),
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
                    daily_series: Array.from({ length: 30 }, (_unused, index) => ({
                        date: new Date(Date.UTC(2026, 7, 4 + index)).toISOString().slice(0, 10),
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
                    block('remote-help-automation', 'resource', '원격 자동화 가이드', 'https://example.com/help/automation', '자동화 방법 보기')
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
    if (pathname === '/api/v1/sheets/ensure') return { ready: true };
    if (pathname === '/api/v1/social/manual/config') {
        return { configured: false, local_media_available: true, channels: [], ai: { available: false, model_name: '' } };
    }
    if (pathname === '/api/v1/settings/major') {
        return {
            configPath: 'fixture/config.json',
            fields: {},
            aiPresets: { text: [], image: [], chat: [] },
            aiProviderProfiles: { text: {}, image: {}, chat: {} },
            shoppingImageDefaults: {},
            shoppingImageSlots: {}
        };
    }
    if (pathname === '/api/v1/google-oauth/status') return { configured: false, connected: false };
    if (pathname === '/api/v1/session/naver') return { status: 'logged_in', valid: true };
    if (pathname === '/api/v1/session/wordpress-verify') return { success: true, message: '연동 성공' };
    if (pathname === '/api/v1/logs/files') return { files: [] };
    if (pathname === '/api/v1/trends/items') return { items: [], total: 0, limit: 50, offset: 0 };
    if (pathname === '/api/v1/blog/topics') return { items: [], total: 0, limit: 50, offset: 0 };
    if (pathname === '/api/v1/shopping/items') return { items: [], total: 0, limit: 50, offset: 0 };
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
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(body);
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
        assert.equal(await page.locator('#dashboard-beta-ready-count').textContent(), '2건');
        await page.waitForFunction(() => document.getElementById('dashboard-beta-processed-count')?.textContent === '3건');
        assert.equal(await page.locator('#dashboard-beta-published-count').textContent(), '1건');
        assert.equal((await page.locator('#dashboard-beta-recent-results-list').textContent()).includes('오늘 발행 결과'), true);
        assert.equal((await page.locator('#dashboard-beta-readiness-items').textContent()).includes('Free · 이번 달 2/10회 사용 · 8회 남음'), true);
        assert.equal(await page.locator('#dashboard-beta-onboarding').evaluate(element => element.hidden), true);
        await page.evaluate(() => renderDashboardBetaOnboarding({
            ready: false,
            ai: { configured: true },
            google: { configured: false },
            publishing_channel: { configured: false }
        }));
        assert.equal(await page.locator('#dashboard-beta-onboarding').evaluate(element => element.hidden), false);
        assert.equal((await page.locator('#dashboard-beta-onboarding-progress').textContent()).trim(), '1/3 준비됨');
        assert.equal((await page.locator('#dashboard-beta-onboarding-action').textContent()).trim(), 'Google 연결하기');
        await page.locator('#dashboard-beta-onboarding-action').click();
        await page.waitForFunction(() => document.getElementById('view-settings')?.classList.contains('active'));
        assert.equal(await page.locator('.settings-tab-btn[data-settings-tab="general"]').evaluate(element => element.classList.contains('active')), true);
        await page.waitForFunction(() => document.getElementById('settings-google-auth-section')?.classList.contains('settings-navigation-target'));
        await page.evaluate(() => navigateTo('dashboard-beta'));
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
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
        assert.equal(await page.locator('.nav-btn[data-view="dashboard-beta"] .nav-new-badge').textContent(), 'new');
        assert.equal(await page.locator('.nav-btn[data-view="blog"]').isHidden(), true);
        assert.equal((await page.locator('.nav-btn[data-view="help"] .nav-label').textContent()).trim(), '도움말');
        await page.evaluate(() => navigateToBlogQuickCreate());
        await page.waitForFunction(() => document.getElementById('view-blog-next')?.classList.contains('active'));
        assert.equal(await page.locator('[data-blog-next-tab="quick"]').getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('[data-blog-next-input-mode="ai"]').getAttribute('aria-selected'), 'true');
        await page.waitForFunction(() => document.activeElement?.id === 'blog-next-subject');
        await page.evaluate(() => navigateTo('dashboard-beta'));
        await page.waitForFunction(() => document.getElementById('view-dashboard-beta')?.classList.contains('active'));
        await page.locator('#dashboard-beta-tips-section [data-dashboard-beta-nav="help"]').click();
        assert.equal(await page.locator('#view-help').evaluate(element => element.classList.contains('active')), true);
        assert.equal(await page.locator('#view-help [data-clock-display]').count(), 1);
        assert.notEqual((await page.locator('#view-help [data-clock-display]').innerHTML()).trim(), '');
        await page.waitForFunction(() => document.querySelector('#help-getting-started-region strong')?.textContent === '원격 설치 가이드');
        assert.equal(await page.locator('#view-help .help-start-list a').count(), 1);
        assert.equal(await page.locator('#view-help .help-topic-card').count(), 2);
        assert.equal(await page.locator('#help-supporting-section').evaluate(element => element.hidden), false);
        assert.equal((await page.locator('#help-supporting-region').textContent()).includes('개발자 응원하기'), true);
        assert.equal(await page.locator('#view-help .help-contact-action').getAttribute('href'), 'https://open.kakao.com/o/gZWL25Zh');
        assert.equal(await page.locator('#dashboard-beta-queue-list').textContent().then(text => text.includes('Dashboard Beta 다음 글감')), true);
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
            document.getElementById('view-settings')?.classList.contains('active')
            && document.querySelector('.settings-tab-btn[data-settings-tab="naver-blog"]')?.classList.contains('active')
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
        assert.equal(
            await page.locator('#recommendation-center-list').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
            3
        );
        assert.equal((await page.locator('#recommendation-center-title').textContent())?.trim(), '뜻밖의 발견');
        await page.locator('.recommendation-card-actions .primary').click();
        await page.waitForFunction(() => document.getElementById('view-settings')?.classList.contains('active'));
        assert.equal(
            await page.locator('.settings-tab-btn[data-settings-tab="naver-blog"]').evaluate((element) => element.classList.contains('active')),
            true
        );
        await page.evaluate(() => navigateTo('dashboard'));
        await page.locator('#recommendation-center-refresh').click();
        await page.waitForFunction(() => document.querySelector('#recommendation-center-list .recommendation-card h3')?.textContent.includes('로컬 여행'));

        await page.locator('.nav-btn[data-view="settings"]').click();
        await page.locator('.settings-tab-btn[data-settings-tab="ai"]').click();
        await page.locator('#settings-tab-ai [data-help-guide-url]').click();
        await page.waitForFunction(() => document.getElementById('view-help')?.classList.contains('active'));
        await page.waitForFunction(() => document.querySelector('#view-help a[href*="224368506082"]')?.classList.contains('help-guide-navigation-target'));

        for (const viewName of ['account', 'social', 'settings', 'logs', 'shopping', 'dashboard-beta', 'blog-next']) {
            await page.locator(`.nav-btn[data-view="${viewName}"]`).click();
            await page.waitForFunction((name) => document.getElementById(`view-${name}`)?.classList.contains('active'), viewName);
        }

        assert.equal(
            await page.locator('.nav-btn[data-view="blog-next"] .nav-label').evaluate((element) => element.childNodes[0]?.textContent?.trim()),
            '블로그'
        );
        assert.deepEqual(
            await page.locator('.nav-btn[data-view="blog-next"] .nav-new-badge').evaluate((element) => ({
                text: element.textContent?.trim(),
                label: element.getAttribute('aria-label'),
                color: getComputedStyle(element).color,
                background: getComputedStyle(element).backgroundColor
            })),
            {
                text: 'new',
                label: '새 메뉴',
                color: 'rgb(159, 18, 57)',
                background: 'rgb(255, 241, 242)'
            }
        );
        assert.equal(await page.locator('#blog-next-panel-quick').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-publish-status').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-topic-form [data-blog-next-runner-status-jump]').evaluate((element) => element.hidden), true);
        assert.deepEqual(
            await page.locator('.blog-next-execution-options').evaluate((element) => {
                const style = getComputedStyle(element);
                return {
                    display: style.display,
                    direction: style.flexDirection,
                    justify: style.justifyContent,
                    border: style.borderTopStyle
                };
            }),
            { display: 'flex', direction: 'row', justify: 'flex-start', border: 'solid' }
        );
        assert.deepEqual(
            await page.locator('.blog-next-form-actions button:not([hidden])').evaluateAll((buttons) => buttons.map((button) => button.textContent.trim())),
            ['바로 포스팅', '발행 대기열에 추가', '글감 보관', '내용 지우기']
        );
        assert.equal(await page.locator('#blog-next-publish-now').evaluate((element) => element.classList.contains('primary')), true);
        assert.equal(await page.locator('#blog-next-clear-topic').evaluate((element) => element.classList.contains('blog-next-clear-action')), true);
        await page.locator('#blog-next-clear-topic').click();

        await page.locator('[data-blog-next-tab="trend-posting"]').click();
        await page.waitForFunction(() => document.getElementById('blog-next-trend-query')?.disabled === false);
        await page.locator('#blog-next-trend-period').selectOption('custom');
        await page.locator('#blog-next-trend-date-from').fill('2026-08-25');
        await page.locator('#blog-next-trend-date-to').fill('2026-08-29');
        await page.locator('#blog-next-trend-refresh').click();
        await page.waitForFunction(() => document.getElementById('blog-next-trend-status')?.textContent === '이미 최신 데이터입니다.');
        assert.equal(await page.locator('#blog-next-trend-date-from').inputValue(), '2026-08-25');
        assert.equal(await page.locator('#blog-next-trend-date-to').inputValue(), '2026-08-29');
        assert.equal(await page.locator('[data-blog-next-trend-category].active').count(), 1);
        assert.equal(await page.locator('#blog-next-trend-refresh').getAttribute('aria-busy'), 'false');
        assert.equal(requests.filter((request) => request.pathname === '/api/v1/trend-posting/meta').length >= 2, true);
        await page.locator('#blog-next-trend-period').selectOption('latest');
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
        await page.waitForFunction(() => document.querySelectorAll('.keyword-selection-checkbox').length === 1);
        await page.locator('.keyword-selection-checkbox').check();
        await page.locator('#keyword-generate-titles-btn').click();
        await page.waitForFunction(() => document.querySelectorAll('.title-apply-btn').length === 1);
        await page.locator('.title-apply-btn').click();
        assert.equal(await page.locator('#blog-next-title').inputValue(), '제주 아침 산책에서 뜻밖에 마주친 것');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '테스트');
        await page.locator('#blog-next-clear-topic').click();

        await page.locator('#blog-next-subject').fill('나중에 다듬을 제주 글감');
        await page.locator('#blog-next-save-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('글감을 보관했습니다'));
        const savedTopicRequest = requests.find((request) => (
            request.pathname === '/api/v1/continuous-publishing/topics'
            && request.body?.action === 'save'
        ));
        assert.equal(savedTopicRequest?.body?.subject, '나중에 다듬을 제주 글감');

        await page.locator('#blog-next-subject').fill('곧 발행할 제주 글감');
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
        await page.locator('#blog-next-clear-topic').click();

        await page.locator('[data-blog-next-input-mode="folder"]').click();
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"]').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-folder-headless').isChecked(), true);
        await page.locator('#blog-next-folder-headless').uncheck();
        await page.locator('[data-blog-next-input-mode="paste"]').click();
        assert.equal(await page.locator('#blog-next-paste-headless').isChecked(), false);
        await page.locator('[data-blog-next-input-mode="ai"]').click();
        assert.equal(await page.locator('#blog-next-runner-headless').isChecked(), false);
        await page.locator('[data-blog-next-tab="queue"]').click();
        assert.equal(await page.locator('#blog-next-panel-queue').evaluate((element) => element.hidden), false);
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 1);
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-saved-list .blog-next-queue-item').length === 1);
        assert.equal((await page.locator('#blog-next-saved-count').textContent())?.trim(), '1건');
        assert.equal((await page.locator('#blog-next-queue-count').textContent())?.trim(), '1건');
        assert.equal((await page.locator('#blog-next-saved-list .blog-next-queue-item strong').textContent())?.trim(), '나중에 다듬을 제주 글감');
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item strong').textContent())?.trim(), '곧 발행할 제주 글감');
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item').textContent()).includes('naver · 임시 저장'), true);

        assert.equal((await page.locator('[data-blog-next-tab="queue"]').textContent())?.trim(), '글감 관리');
        await page.locator('[data-blog-next-management-tab="saved"]').click();
        assert.equal(await page.locator('[data-blog-next-management-panel="saved"]').evaluate((element) => element.hidden), false);
        await page.locator('#blog-next-saved-list .blog-next-queue-copy').click();
        assert.equal((await page.locator('#blog-next-editor-title').textContent())?.trim(), '보관한 글감 계속 작성');
        assert.equal(await page.locator('#blog-next-editor-modal').evaluate((element) => element.classList.contains('hidden')), false);
        assert.equal((await page.locator('#blog-next-save-topic').textContent())?.trim(), '저장');
        assert.equal((await page.locator('#blog-next-enqueue-topic').textContent())?.trim(), '발행 대기열에 추가');
        assert.equal((await page.locator('#blog-next-clear-topic').textContent())?.trim(), '취소');
        await page.locator('#blog-next-subject').fill('다듬은 제주 글감');
        await page.locator('#blog-next-save-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('보관한 글감을 수정했습니다'));
        await page.waitForFunction(() => document.querySelector('#blog-next-saved-list .blog-next-queue-item strong')?.textContent === '다듬은 제주 글감');
        await page.locator('#blog-next-saved-list .blog-next-queue-actions .ghost').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-saved-list .blog-next-queue-item').length === 0);
        assert.equal((await page.locator('#blog-next-saved-count').textContent())?.trim(), '0건');

        await page.locator('[data-blog-next-management-tab="ready"]').click();
        await page.locator('#blog-next-queue-list .blog-next-queue-copy').click();
        assert.equal(await page.locator('#blog-next-panel-queue').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-editor-modal').evaluate((element) => element.classList.contains('hidden')), false);
        assert.equal((await page.locator('#blog-next-enqueue-topic').textContent())?.trim(), '저장');
        assert.equal(await page.locator('#blog-next-save-topic').evaluate((element) => element.hidden), true);
        assert.equal((await page.locator('#blog-next-publish-now').textContent())?.trim(), '바로 포스팅');
        assert.equal(await page.locator('#blog-next-publish-now').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#blog-next-publish-now').isEnabled(), true);
        assert.deepEqual(
            await page.locator('#blog-next-editor-actions-slot .blog-next-form-actions button:not([hidden])')
                .evaluateAll((buttons) => buttons
                    .map((button) => ({ text: button.textContent.trim(), order: Number(getComputedStyle(button).order) }))
                    .sort((left, right) => left.order - right.order)
                    .map(({ text }) => text)),
            ['저장', '바로 포스팅', '취소']
        );
        await page.locator('#blog-next-subject').fill('수정한 제주 글감');
        await page.locator('#blog-next-target-wordpress').check();
        await page.locator('#blog-next-enqueue-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('발행 계획을 수정했습니다'));
        assert.equal(await page.locator('#blog-next-panel-queue').evaluate((element) => element.hidden), false);
        await page.waitForFunction(() => document.querySelector('#blog-next-queue-list .blog-next-queue-item strong')?.textContent === '수정한 제주 글감');
        assert.equal((await page.locator('#blog-next-queue-list .blog-next-queue-item').textContent()).includes('naver · wordpress'), true);
        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await page.locator('#blog-next-queue-list .blog-next-queue-actions button', { hasText: '빼기' }).click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
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

        await page.route('**/api/v1/session/naver?force=true', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: { valid: false, reason: 'expired' } })
            });
        });
        const captureCountBeforeExpiredSession = requests.filter((request) => (
            request.pathname === '/api/v1/continuous-publishing/topics'
        )).length;
        await page.locator('#blog-next-subject').fill('로그인 후 다시 쓸 글감');
        await page.locator('#blog-next-keywords').fill('로그인 만료, 입력 보존');
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent === '네이버 로그인 후 다시 시도해 주세요.');
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '로그인 후 다시 쓸 글감');
        assert.equal(await page.locator('#blog-next-keywords').inputValue(), '로그인 만료, 입력 보존');
        assert.equal(requests.filter((request) => (
            request.pathname === '/api/v1/continuous-publishing/topics'
        )).length, captureCountBeforeExpiredSession);
        await page.unroute('**/api/v1/session/naver?force=true');
        await page.locator('#blog-next-clear-topic').click();

        await page.route('**/api/v1/session/wordpress-verify', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: { success: false, message: '인증 실패' } })
            });
        });
        await page.locator('#blog-next-target-naver').uncheck();
        await page.locator('#blog-next-target-wordpress').check();
        await page.locator('#blog-next-subject').fill('워드프레스 연결을 고칠 글감');
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent === '워드프레스 연결을 확인한 후 다시 시도해 주세요.');
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '워드프레스 연결을 고칠 글감');
        assert.equal(requests.filter((request) => (
            request.pathname === '/api/v1/continuous-publishing/topics'
        )).length, captureCountBeforeExpiredSession);
        await page.unroute('**/api/v1/session/wordpress-verify');
        await page.locator('#blog-next-clear-topic').click();
        await page.locator('#blog-next-target-naver').check();
        await page.locator('#blog-next-target-wordpress').uncheck();

        await page.locator('#blog-next-subject').fill('바로 처리할 글감');
        await page.locator('#blog-next-post-status').selectOption('draft');
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.hidden === false);
        assert.equal(await page.locator('#blog-next-subject').inputValue(), '바로 처리할 글감');
        assert.equal((await page.locator('#blog-next-publish-status-title').textContent())?.trim(), '글 작성 중');
        assert.equal((await page.locator('#blog-next-publish-status-subject').textContent())?.trim(), '바로 처리할 글감');
        assert.equal((await page.locator('#blog-next-publish-status').textContent()).includes('Topics'), false);
        const directTopicRequest = requests.find((request) => (
            request.pathname === '/api/v1/continuous-publishing/topics'
            && request.body?.subject === '바로 처리할 글감'
        ));
        const directRunnerRequest = requests.find((request) => (
            request.pathname === '/api/v1/continuous-publishing/runner/start'
            && Number.isInteger(request.body?.rowIndex)
        ));
        assert.equal(directTopicRequest?.body?.action, 'enqueue');
        assert.equal(Number.isInteger(directRunnerRequest?.body?.rowIndex), true);
        assert.equal(directRunnerRequest?.body?.headless, false);
        assert.equal(await page.locator('#blog-next-topic-form [data-blog-next-runner-status-jump]').evaluate((element) => element.hidden), false);
        await page.locator('[data-blog-next-tab="queue"]').click();
        await page.locator('[data-blog-next-management-tab="ready"]').click();
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 0);
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status-title')?.textContent === '임시 저장 완료');
        await page.waitForFunction(() => document.getElementById('blog-next-subject')?.value === '');
        assert.equal((await page.locator('#blog-next-publish-status-message').textContent())?.trim(), '글감 처리 완료');
        assert.equal((await page.locator('#blog-next-publish-status-links').textContent())?.trim(), '네이버 블로그 열기');
        assert.equal(
            await page.locator('#blog-next-publish-status-links a').getAttribute('href'),
            'https://blog.naver.com/fixture'
        );
        assert.equal(await page.locator('#blog-next-publish-status-dismiss').evaluate((element) => element.hidden), false);
        assert.equal((await page.locator('#blog-next-publish-status-dismiss').textContent())?.trim(), '×');
        assert.equal(await page.locator('#blog-next-publish-status-dismiss').getAttribute('aria-label'), '닫기');
        assert.equal(await page.locator('#blog-next-publish-status-manage').evaluate((element) => element.hidden), true);
        assert.equal(await page.locator('#blog-next-topic-form [data-blog-next-runner-status-jump]').evaluate((element) => element.hidden), true);
        await page.locator('#blog-next-publish-status-dismiss').click();
        assert.equal(await page.locator('#blog-next-publish-status').evaluate((element) => element.hidden), true);

        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.locator('#blog-next-runner-headless').check();
        await page.locator('#blog-next-subject').fill('먼저 실행할 글감');
        await page.locator('#blog-next-post-status').selectOption('draft');
        await page.locator('#blog-next-enqueue-topic').click();
        await page.waitForFunction(() => document.getElementById('blog-next-topic-result')?.textContent.includes('대기열에 추가했습니다'));
        await page.locator('#blog-next-subject').fill('나중 실행할 글감');
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
        await page.locator('#blog-next-queue-list .blog-next-queue-item').nth(1).locator('button', { hasText: '빼기' }).click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
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
            'rgb(255, 255, 255)'
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
        await page.locator('[data-blog-next-tab="automation"]').click();
        assert.equal(await page.locator('#blog-next-panel-automation').evaluate((element) => element.hidden), false);
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
        await page.locator('#blog-next-automation-interval').fill('61');
        assert.equal(await page.locator('#blog-next-automation-save').isDisabled(), false);
        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-message').textContent())?.includes('저장하지 않고 이동'), true);
        await page.locator('#ui-dialog-cancel').click();
        await page.waitForFunction(() => document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal(await page.locator('#blog-next-panel-automation').evaluate((element) => element.hidden), false);
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
        await page.locator('[data-blog-next-tab="automation"]').click();
        await page.waitForFunction(() => document.getElementById('blog-next-panel-automation')?.hidden === false);
        assert.equal(await page.locator('#blog-next-automation-interval').inputValue(), '60');
        assert.equal(await page.locator('#blog-next-automation-save').isDisabled(), true);
        await page.locator('#blog-next-automation-enabled').check();
        await page.locator('#blog-next-automation-start-time').fill('09:00');
        await page.locator('#blog-next-automation-end-time').fill('21:00');
        await page.locator('#blog-next-automation-interval').fill('90');
        await page.locator('#blog-next-automation-notify').check();
        await page.locator('#blog-next-automation-save').click();
        await page.waitForFunction(() => document.getElementById('blog-next-automation-status')?.dataset.state === 'waiting');
        assert.equal(await page.locator('#blog-next-automation-save').isDisabled(), true);
        assert.equal((await page.locator('#blog-next-automation-status').textContent())?.includes('다음 실행'), true);
        assert.equal(await page.locator('#blog-next-automation-test').isVisible(), true);

        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.locator('[data-blog-next-input-mode="ai"]').click();
        await page.locator('#blog-next-subject').fill('예상 시간 표시 글감');
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
        await page.locator('[data-blog-next-input-mode="paste"]').click();
        await page.locator('#blog-next-paste-markdown').fill('# 붙여넣은 원고\n\nQueue를 거치지 않고 바로 실행합니다.');
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-validation="paste"]')?.classList.contains('is-ok'));
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-title]').textContent())?.trim(), '붙여넣은 원고');
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] h2').textContent())?.trim(), '미리보기 소제목');
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] .local-markdown-image-card').count(), 1);
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] .local-markdown-image-card-status').textContent())?.trim(), '누락');
        assert.equal(await page.locator('[data-blog-next-draft-publish="paste"]').isDisabled(), false);
        await page.waitForTimeout(600);
        assert.equal(await page.locator('[data-blog-next-draft-publish="paste"]').isDisabled(), false);
        await page.evaluate(() => document.querySelectorAll('.app-celebration').forEach((element) => element.remove()));
        await page.locator('[data-blog-next-draft-publish="paste"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.dataset.state === 'running');
        assert.equal(await page.locator('[data-blog-next-draft-publish="folder"]').isDisabled(), true);
        assert.equal((await page.locator('[data-blog-next-draft-publish="paste"]').textContent()).includes('진행 중'), true);
        await page.locator('[data-blog-next-tab="queue"]').click();
        assert.equal(await page.locator('[data-blog-next-run-now]').isDisabled(), true);
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-result="paste"]')?.textContent.includes('요청 처리 완료'));
        assert.equal(await page.locator('[data-blog-next-run-now]').isDisabled(), false);
        await page.waitForFunction(() => document.querySelector('.app-celebration-message')?.textContent.includes('글쓰기 완료'));
        const pastedPublishRequest = requests.find((request) => request.pathname === '/api/v1/blog/local-markdown/publish');
        assert.equal(pastedPublishRequest?.body?.markdownText.startsWith('# 붙여넣은 원고'), true);
        assert.deepEqual(pastedPublishRequest?.body?.targets, ['naver']);

        await page.locator('.nav-btn[data-view="social"]').click();
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
        await page.waitForFunction(() => !document.getElementById('account-overview-content')?.classList.contains('hidden'));
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
        await page.locator('.shopping-tab-btn[data-shopping-tab="batch"]').click();
        await page.waitForFunction(() => document.getElementById('shopping-tab-batch')?.classList.contains('active'));
        assert.equal(await page.locator('#shopping-table').count(), 1);

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
        await page.waitForFunction(() => document.getElementById('view-blog-next')?.classList.contains('active'));
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
            { method: 'POST', pathname: '/api/v1/continuous-publishing/runner/start' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/reorder' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/reorder' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/queue/remove' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/runner/start' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/automation/settings' },
            { method: 'POST', pathname: '/api/v1/continuous-publishing/topics' },
            { method: 'POST', pathname: '/api/v1/blog/local-markdown/preview' },
            { method: 'POST', pathname: '/api/v1/blog/local-markdown/publish' }
        ]);
        assert.equal(requests.some((request) => request.pathname === '/app.js'), true);
        assert.equal(requests.some((request) => request.pathname === '/styles.css'), true);
        assert.deepEqual(failedResponses, []);
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(consoleErrors, []);

        await context.close();
        console.log(`✅ browser UI smoke test passed (${requests.length} fixture requests)`);
    } finally {
        if (browser) await browser.close();
        await closeServer(server);
    }
}

run().catch((error) => {
    console.error('❌ browser UI smoke test failed');
    console.error(error?.stack || error);
    process.exitCode = 1;
});
