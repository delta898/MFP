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
        usage: { used: 0, limit: 10, remaining: 10 },
        connections: {
            naver: { status: 'connected', message: 'fixture' },
            google_sheets: { status: 'connected', message: 'fixture' },
            wordpress: { status: 'not_configured', message: 'fixture' },
            buffer: { status: 'not_configured', message: 'fixture' }
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
    if (pathname.startsWith('/api/v1/surface-content/')) return { regions: {} };
    if (pathname === '/api/v1/auto/status') return { enabled: false };
    if (pathname === '/api/v1/system/update/check') return { available: false };
    if (pathname === '/api/v1/sheets/ensure') return { ready: true };
    if (pathname === '/api/v1/social/manual/config') {
        return { configured: false, local_media_available: false, channels: [], ai: { available: false, model_name: '' } };
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
    if (pathname === '/api/v1/session/naver') return { status: 'not_logged_in', valid: false };
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
        busy: false
    };
    const buildContinuousQueueResponse = () => {
        const firstRunAt = '2026-08-31T01:00:00.000Z';
        const intervalMs = continuousAutomationSettings.interval_minutes * 60 * 1000;
        const items = continuousPublishingQueue.map((item, index) => ({
            ...item,
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
                        resultStatus: '', busy: true
                    }
                    : {
                        state: 'empty', message: '발행 준비된 글감이 없습니다.',
                        rowIndex: null, rowNumber: null, subject: '', resultStatus: '', busy: false
                    };
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
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                requestRecord.body = payload;
                const body = JSON.stringify({
                    success: true,
                    data: { status: payload.postStatus === 'draft' ? '임시 저장 완료' : '발행 완료', postStatus: payload.postStatus || 'publish' }
                });
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
            if (url.pathname === '/api/v1/continuous-publishing/runner/status') {
                if (continuousRunnerStatus.state === 'running') {
                    const itemIndex = continuousPublishingQueue.findIndex(candidate => candidate.rowIndex === continuousRunnerStatus.rowIndex);
                    if (itemIndex >= 0) continuousPublishingQueue.splice(itemIndex, 1);
                    continuousRunnerStatus = {
                        ...continuousRunnerStatus,
                        state: 'completed',
                        message: '다음 글감 한 건을 처리했습니다.',
                        resultStatus: '임시 저장 완료',
                        finishedAt: new Date().toISOString(),
                        busy: false
                    };
                }
                data = continuousRunnerStatus;
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

        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => typeof window.navigateTo === 'function');
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
        assert.equal(
            await page.locator('#quick-subject').inputValue(),
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
        assert.equal(await page.locator('#badge-version').textContent(), 'v0.2.0');
        assert.equal(await page.locator('#settings-current-version-display').textContent(), 'v0.2.0');
        assert.equal(await page.locator('#footer-version-display').textContent(), 'v0.2.0');
        await page.waitForFunction(() => (
            document.querySelectorAll('.recommendation-card').length === 1
            && document.querySelector('.recommendation-card h3')?.textContent?.trim() === '로컬 여행'
        ));
        assert.equal((await page.locator('.recommendation-card h3').textContent())?.trim(), '로컬 여행');
        assert.equal((await page.locator('#recommendation-nav-badge').textContent())?.trim(), '1');
        assert.equal(await page.locator('#recommendation-nav-badge').isHidden(), false);
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
        await page.locator('.nav-btn[data-view="dashboard"]').click();
        await page.locator('#recommendation-center-refresh').click();
        await page.waitForFunction(() => document.querySelector('#recommendation-center-list .recommendation-card h3')?.textContent.includes('로컬 여행'));

        for (const viewName of ['account', 'social', 'settings', 'logs', 'shopping', 'dashboard', 'blog', 'blog-next']) {
            await page.locator(`.nav-btn[data-view="${viewName}"]`).click();
            await page.waitForFunction((name) => document.getElementById(`view-${name}`)?.classList.contains('active'), viewName);
        }

        assert.equal(
            await page.locator('.nav-btn[data-view="blog-next"] .nav-label').evaluate((element) => element.childNodes[0]?.textContent?.trim()),
            '블로그 Beta'
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
        await page.locator('#blog-next-subject').fill('바로 처리할 글감');
        await page.locator('#blog-next-post-status').selectOption('draft');
        await page.locator('#blog-next-publish-now').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.getElementById('blog-next-subject')?.value === '');
        await page.waitForFunction(() => document.getElementById('blog-next-publish-status')?.hidden === false);
        assert.equal((await page.locator('#blog-next-publish-status-title').textContent())?.trim(), '발행 중');
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
        assert.equal((await page.locator('#blog-next-publish-status-message').textContent())?.trim(), '글감 처리 완료');
        assert.equal(await page.locator('#blog-next-publish-status-dismiss').evaluate((element) => element.hidden), false);
        assert.equal((await page.locator('#blog-next-publish-status-dismiss').textContent())?.trim(), '×');
        assert.equal(await page.locator('#blog-next-publish-status-dismiss').getAttribute('aria-label'), '닫기');
        assert.equal(await page.locator('#blog-next-publish-status-manage').evaluate((element) => element.hidden), true);
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
        await page.waitForFunction(() => document.querySelectorAll('#blog-next-queue-list .blog-next-queue-item').length === 0);
        const selectedRunnerRequest = requests.filter((request) => (
            request.pathname === '/api/v1/continuous-publishing/runner/start'
            && Number.isInteger(request.body?.rowIndex)
        )).at(-1);
        assert.equal(selectedRunnerRequest?.body?.headless, true);

        await page.evaluate(() => document.getElementById('ui-toast-container')?.replaceChildren());
        await page.locator('[data-blog-next-tab="automation"]').click();
        assert.equal(await page.locator('#blog-next-panel-automation').evaluate((element) => element.hidden), false);
        await page.waitForFunction(() => document.getElementById('blog-next-automation-form')?.dataset.loaded === 'true');
        assert.equal(await page.locator('#blog-next-automation-status').evaluate((element) => element.hidden), true);
        await page.locator('#blog-next-automation-enabled').check();
        await page.locator('#blog-next-automation-start-time').fill('09:00');
        await page.locator('#blog-next-automation-end-time').fill('21:00');
        await page.locator('#blog-next-automation-interval').fill('90');
        await page.locator('#blog-next-automation-notify').check();
        await page.locator('#blog-next-automation-save').click();
        await page.waitForFunction(() => document.getElementById('blog-next-automation-status')?.dataset.state === 'waiting');
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

        await page.locator('[data-blog-next-tab="quick"]').click();
        await page.locator('[data-blog-next-input-mode="paste"]').click();
        await page.locator('#blog-next-paste-markdown').fill('# 붙여넣은 원고\n\nQueue를 거치지 않고 바로 실행합니다.');
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-validation="paste"]')?.classList.contains('is-ok'));
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-title]').textContent())?.trim(), '붙여넣은 원고');
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] [data-draft-preview-body] h2').textContent())?.trim(), '미리보기 소제목');
        assert.equal(await page.locator('[data-blog-next-draft-preview="paste"] .local-markdown-image-card').count(), 1);
        assert.equal((await page.locator('[data-blog-next-draft-preview="paste"] .local-markdown-image-card-status').textContent())?.trim(), '누락');
        assert.equal(await page.locator('[data-blog-next-draft-publish="paste"]').isDisabled(), false);
        await page.locator('[data-blog-next-draft-publish="paste"]').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        await page.locator('#ui-dialog-confirm').click();
        await page.waitForFunction(() => document.querySelector('[data-blog-next-draft-result="paste"]')?.textContent.includes('요청 처리 완료'));
        const pastedPublishRequest = requests.find((request) => request.pathname === '/api/v1/blog/local-markdown/publish');
        assert.equal(pastedPublishRequest?.body?.markdownText.startsWith('# 붙여넣은 원고'), true);
        assert.deepEqual(pastedPublishRequest?.body?.targets, ['naver']);

        await page.locator('.nav-btn[data-view="social"]').click();
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

        await page.locator('.nav-btn[data-view="dashboard"]').click();
        assert.equal(await page.locator('#update-banner').evaluate((element) => element.classList.contains('hidden')), true);
        await page.locator('.nav-btn[data-view="blog"]').click();

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

        await page.locator('.nav-btn[data-view="blog"]').click();
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
            .filter((request) => request.method !== 'GET')
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
