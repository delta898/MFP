const test = require('node:test');
const assert = require('node:assert/strict');
const SlackService = require('./service');

test('Slack renderer formats normalized results and clickable links', () => {
    const message = SlackService.renderNotification({
        workflow: 'SNS 자동 공유', status: 'completed', title: '<사용자 글>',
        source: { label: '원문 열기', url: 'https://example.com/post?a=1&b=2' },
        targets: [{ label: 'Threads', status: 'completed', link: { label: '게시물 열기', url: 'https://threads.net/post/1' } }]
    });

    assert.match(message, /\*✅ SNS 자동 공유 발행 완료\*/);
    assert.match(message, /\*제목:\* &lt;사용자 글&gt;/);
    assert.match(message, /<https:\/\/example.com\/post\?a=1&b=2\|원문 열기>/);
    assert.match(message, /<https:\/\/threads.net\/post\/1\|게시물 열기>/);
    assert.doesNotMatch(message, /https:\/\/example.com\/post\?a=1&b=2\n/);
});
