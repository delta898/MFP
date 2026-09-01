const test = require('node:test');
const assert = require('node:assert/strict');

const { createContentService } = require('./content.service');
const { createBlogNextExecutionCoordinator } = require('../../blog-next/execution-coordinator');

function createService(coordinator, executeLocalMarkdownPublish) {
    return createContentService({
        CONFIG: {},
        blogNextExecutionCoordinator: coordinator,
        executeLocalMarkdownPublish
    });
}

test('local manuscript publishing owns the shared Blog Beta lock until it settles', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    let finish;
    let calls = 0;
    const service = createService(coordinator, async () => {
        calls += 1;
        return new Promise(resolve => { finish = resolve; });
    });

    const first = service.localMarkdownPublish({ markdownText: '# 원고' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coordinator.getStatus().source, 'local_markdown');
    assert.equal(coordinator.getStatus().subject, '원고 붙여넣기');
    await assert.rejects(
        () => service.localMarkdownPublish({ folderName: '다른 원고' }),
        (error) => error.status === 409 && error.apiCode === 'BLOG_NEXT_EXECUTION_BUSY'
    );
    assert.equal(calls, 1);

    finish({ success: true, data: { status: '임시 저장 완료' } });
    assert.deepEqual(await first, { status: '임시 저장 완료' });
    assert.deepEqual(coordinator.getStatus(), { busy: false });
});

test('local manuscript publishing releases the shared lock after failure', async () => {
    const coordinator = createBlogNextExecutionCoordinator();
    let calls = 0;
    const service = createService(coordinator, async () => {
        calls += 1;
        if (calls === 1) throw new Error('fixture failure');
        return { success: true, data: { status: '완료' } };
    });

    await assert.rejects(() => service.localMarkdownPublish({ folderName: '원고 폴더' }), /fixture failure/);
    assert.deepEqual(coordinator.getStatus(), { busy: false });
    assert.deepEqual(await service.localMarkdownPublish({ folderName: '원고 폴더' }), { status: '완료' });
});
