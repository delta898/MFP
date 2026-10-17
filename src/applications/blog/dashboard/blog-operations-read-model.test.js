const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDashboardBlogOperationsOverview } = require('./blog-operations-read-model');

test('dashboard blog operations overview exposes only the operational allowlist', () => {
    const overview = buildDashboardBlogOperationsOverview({
        generatedAt: '2026-09-02T03:00:00.000Z',
        runner: {
            state: 'running', busy: true, subject: '작성 중인 글', message: '본문 생성 중',
            rowIndex: 0, startedAt: '2026-09-02T02:59:00.000Z', source: 'continuous_runner',
            secret: 'do-not-expose'
        },
        queue: {
            automation_schedule: {
                enabled: true, effective_enabled: true, status: 'scheduled', interval_minutes: 30,
                next_processing_at: '2026-09-02T03:30:00.000Z', internal_scheduler: { timer: true }
            },
            status_summary: { saved: 4, ready: 5, running: 0 },
            items: [
                {
                    rowIndex: 0, rowNumber: 2, status: '발행 준비 완료', subject: '현재 실행',
                    queue_runtime_state: 'running'
                },
                {
                    rowIndex: 1, rowNumber: 3, subject: '다음 글',
                    options: { platforms: ['naver', 'wordpress', 'unknown'], post_status: 'draft', api_key: 'secret' },
                    processing_estimate_at: '2026-09-02T03:30:00.000Z',
                    content_guide: { additional_instructions: '비공개 지시', reference_urls: ['https://private.example'] }
                },
                { rowIndex: 2, rowNumber: 4, subject: '둘째 글', targets: ['naver'], postStatus: 'schedule' },
                { rowIndex: 3, rowNumber: 5, subject: '셋째 글', platforms: ['wordpress'], postStatus: 'publish' },
                { rowIndex: 4, rowNumber: 6, subject: '넷째 글', targets: ['naver'] }
            ]
        }
    });

    assert.deepEqual(overview, {
        schema_version: 1,
        generated_at: '2026-09-02T03:00:00.000Z',
        flow: {
            state: 'running', busy: true, subject: '작성 중인 글', message: '본문 생성 중',
            started_at: '2026-09-02T02:59:00.000Z', finished_at: null,
            result_status: '', source: 'continuous_runner'
        },
        automation: {
            enabled: true, effective_enabled: true, status: 'scheduled', interval_minutes: 30,
            next_processing_at: '2026-09-02T03:30:00.000Z'
        },
        queue: {
            ready_count: 4, saved_count: 4, running_count: 1,
            next_items: [
                {
                    row_index: 1, row_number: 3, subject: '다음 글', targets: ['naver', 'wordpress'],
                    post_status: 'draft', processing_estimate_at: '2026-09-02T03:30:00.000Z'
                },
                {
                    row_index: 2, row_number: 4, subject: '둘째 글', targets: ['naver'],
                    post_status: 'schedule', processing_estimate_at: null
                },
                {
                    row_index: 3, row_number: 5, subject: '셋째 글', targets: ['wordpress'],
                    post_status: 'publish', processing_estimate_at: null
                }
            ]
        }
    });
    assert.equal(JSON.stringify(overview).includes('secret'), false);
    assert.equal(JSON.stringify(overview).includes('비공개'), false);
    assert.equal(JSON.stringify(overview).includes('private.example'), false);
});

test('dashboard blog operations overview normalizes incomplete internal state', () => {
    const overview = buildDashboardBlogOperationsOverview({
        generatedAt: '2026-09-02T03:00:00.000Z',
        runner: { state: 'unexpected' },
        queue: { status_summary: { ready: -2, saved: '3', running: null } }
    });

    assert.equal(overview.flow.state, 'idle');
    assert.equal(overview.flow.busy, false);
    assert.equal(overview.automation.status, 'disabled');
    assert.deepEqual(overview.queue, {
        ready_count: 0,
        saved_count: 3,
        running_count: 0,
        next_items: []
    });
});
