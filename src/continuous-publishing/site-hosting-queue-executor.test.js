const test = require('node:test');
const assert = require('node:assert/strict');

const { TOPIC_STATUS } = require('./contract');
const { createSiteHostingQueueExecutor } = require('./site-hosting-queue-executor');

function createFixture(overrides = {}) {
    const state = {
        topic: {
            rowIndex: 5,
            rowNumber: 7,
            status: TOPIC_STATUS.READY,
            subject: '사이트 대기열 원고',
            keywords: ['정원', '기록'],
            content_guide: {
                additional_instructions: '경험 중심으로 작성',
                reference_urls: ['https://example.com/source'],
                writing_overrides: { length: 'long' }
            },
            options: {
                platforms: ['site-hosting'],
                post_status: 'draft',
                image_mode: 'none',
                site_target: { project_id: 'project-1', site_id: 'site-1', kind: 'vault', destination_path: 'journal' }
            }
        },
        statusUpdates: [],
        generatedInputs: [],
        postCalls: []
    };
    Object.assign(state, overrides);
    const executor = createSiteHostingQueueExecutor({
        Utils: {
            async readGoogleSheetTopicsAll() { return { items: [state.topic] }; },
            async updateGoogleSheetStatus(rowIndex, status, message) {
                state.statusUpdates.push({ rowIndex, status, message });
            },
            clearSheetCache() {}
        },
        async ensureSheetsReadyForUi() {},
        async generateAiManuscriptDraft(input) {
            state.generatedInputs.push(input);
            return { draftId: 'draft-1', revision: 2, title: '생성된 제목' };
        },
        getSiteHostingSiteService() {
            return {
                async postMarkdown(projectId, siteId, payload, context) {
                    state.postCalls.push({ projectId, siteId, payload, context });
                    if (state.postError) throw state.postError;
                    return state.postResult || { status: '임시 저장 완료', postStatus: 'draft', post_id: 'post-1' };
                }
            };
        },
        now: () => new Date('2026-10-09T00:00:00.000Z')
    });
    return { state, executor };
}

test('Site Hosting queue execution reuses manuscript generation and the existing publisher', async () => {
    const { state, executor } = createFixture();
    const result = await executor({
        rowIndex: 5,
        execution: { operationId: 'queue-row-5' }
    });

    assert.equal(result.success, true);
    assert.equal(state.generatedInputs.length, 1);
    assert.deepEqual(state.generatedInputs[0], {
        subject: '사이트 대기열 원고', title: '', keywords: ['정원', '기록'],
        instruction: '경험 중심으로 작성', referenceUrl: 'https://example.com/source',
        externalReference: undefined, writingStrategy: undefined, writingOverrides: { length: 'long' },
        imageMode: 'none', targets: ['site-hosting'], postStatus: 'draft'
    });
    assert.deepEqual(state.postCalls[0], {
        projectId: 'project-1', siteId: 'site-1',
        payload: { draftId: 'draft-1', revision: 2, postStatus: 'draft', destinationPath: 'journal' },
        context: { requestId: 'queue-row-5' }
    });
    assert.deepEqual(state.statusUpdates.map(({ status }) => status), [TOPIC_STATUS.RUNNING, TOPIC_STATUS.DRAFTED]);
});

test('a public queue request that the site publisher downgrades is recorded as a completed draft', async () => {
    const initialTopic = createFixture().state.topic;
    const { state, executor } = createFixture({
        topic: {
            ...initialTopic,
            options: { ...initialTopic.options, post_status: 'publish', site_target: { project_id: 'project-1', site_id: 'site-1', kind: 'blog' } }
        },
        postResult: {
            status: '이미지가 준비되지 않아 임시 저장했습니다.',
            postStatus: 'draft',
            forcedDraft: true,
            warning: '이미지 1번이 준비되지 않아 공개 발행 대신 임시 저장했습니다.',
            post_id: 'post-1',
            publication: 'none'
        }
    });

    const result = await executor({ rowIndex: 5 });

    assert.equal(result.success, true);
    assert.equal(result.data.status, TOPIC_STATUS.DRAFTED);
    assert.equal(result.data.postStatus, 'draft');
    assert.equal(result.data.forcedDraft, true);
    assert.deepEqual(state.statusUpdates.map(({ status }) => status), [TOPIC_STATUS.RUNNING, TOPIC_STATUS.DRAFTED]);
    assert.match(state.statusUpdates.at(-1).message, /이미지가 준비되지 않아 임시 저장했습니다/);
});

test('Site Hosting queue execution rejects scheduled publishing before generation', async () => {
    const { state, executor } = createFixture({ topic: {
        ...createFixture().state.topic,
        options: {
            ...createFixture().state.topic.options,
            post_status: 'schedule', schedule_date: '2026-10-12T10:00'
        }
    } });

    const result = await executor({ rowIndex: 5 });

    assert.equal(result.success, false);
    assert.equal(result.code, 'SITE_SCHEDULE_UNSUPPORTED');
    assert.equal(state.generatedInputs.length, 0);
    assert.deepEqual(state.statusUpdates, []);
});

test('a saved post with failed deployment is marked for attention to prevent automatic duplicate retry', async () => {
    const { state, executor } = createFixture({
        topic: {
            ...createFixture().state.topic,
            options: {
                ...createFixture().state.topic.options,
                post_status: 'publish', site_target: { project_id: 'project-1', site_id: 'site-1', kind: 'blog' }
            }
        },
        postError: Object.assign(new Error('저장 후 배포에 실패했습니다.'), { code: 'SITE_HOSTING_POST_SAVED_DEPLOY_FAILED' })
    });

    const result = await executor({ rowIndex: 5 });

    assert.equal(result.success, false);
    assert.deepEqual(state.statusUpdates.map(({ status }) => status), [TOPIC_STATUS.RUNNING, TOPIC_STATUS.NEEDS_ATTENTION]);
});
