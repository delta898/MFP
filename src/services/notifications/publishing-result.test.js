const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPublishingResultNotification } = require('./publishing-result');

test('publishing notification builds a channel-neutral result with descriptive clickable links', () => {
    const message = buildPublishingResultNotification({
        workflow: 'SNS RSS 자동 공유',
        status: 'partial',
        title: '<새 글>',
        sourceUrl: 'https://example.com/post?a=1&b=2',
        targets: [{ label: 'Instagram · @account', success: true, url: 'https://instagram.com/p/123' }, {
            label: '<Threads>', success: false, detail: '<error>'
        }]
    });

    assert.equal(message.kind, 'publishing_result');
    assert.equal(message.title, '<새 글>');
    assert.deepEqual(message.source, { label: '원문 열기', url: 'https://example.com/post?a=1&b=2' });
    assert.deepEqual(message.targets, [
        {
            label: 'Instagram · @account', status: 'completed',
            detail: '', link: { label: '게시물 열기', url: 'https://instagram.com/p/123' }
        },
        { label: '<Threads>', status: 'failed', detail: '<error>', link: null }
    ]);
});

test('publishing notification omits unsafe links', () => {
    const message = buildPublishingResultNotification({
        sourceUrl: 'javascript:alert(1)',
        targets: [{ label: 'Instagram', success: true, url: 'data:text/html,hi' }]
    });
    assert.equal(message.source, null);
    assert.equal(message.targets[0].link, null);
});
