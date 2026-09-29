const test = require('node:test');
const assert = require('node:assert/strict');

const { selectManuscriptImagePromptContext } = require('./manuscript-image-prompt-context');

function block(index, id, title = '', prompt = '') {
    return `[[IMAGE_${index}\nid: ${id}\ntitle: ${title}\nprompt: ${prompt}\n]]`;
}

test('selects nearby prose for the image block matched by stable ID', () => {
    const markdown = [
        '# 강릉 숙소 후기',
        '',
        '호텔 객실에서 바라본 동해의 아침 풍경을 소개합니다.',
        '',
        '바다 전망과 편안한 침구가 인상적이었습니다.',
        '',
        block(2, 'target-image'),
        '',
        '조식은 신선한 재료로 준비되어 여행의 만족도를 높였습니다.',
        '',
        '## unrelated section',
        '',
        '서울 골목 빵집에서는 갓 구운 빵을 판매합니다.',
        '',
        block(3, 'unrelated-image')
    ].join('\n');

    const selected = selectManuscriptImagePromptContext(markdown, {
        blockId: 'target-image',
        index: 2
    });

    assert.equal(selected.matchedBy, 'block_id');
    assert.equal(selected.imageBlockIndex, 1);
    assert.equal(selected.imageBlockCount, 2);
    assert.equal(selected.context.section, '강릉 숙소 후기');
    assert.match(selected.context.before, /동해의 아침 풍경/);
    assert.match(selected.context.after, /조식은 신선한 재료/);
    assert.doesNotMatch(JSON.stringify(selected.context), /서울 골목 빵집/);
});

test('falls back to the image index when an older block has no persisted ID', () => {
    const markdown = [
        '# 원고',
        '',
        '먼 앞부분의 내용입니다.',
        '',
        '첫 이미지 설명입니다.',
        '',
        '[[IMAGE_0\ntitle: 첫째\nprompt: 첫째 프롬프트\n]]',
        '',
        '두 번째 이미지 설명입니다.',
        '',
        '[[IMAGE_1\ntitle: 둘째\nprompt: 둘째 프롬프트\n]]'
    ].join('\n');

    const selected = selectManuscriptImagePromptContext(markdown, { index: 1 });

    assert.equal(selected.matchedBy, 'image_index');
    assert.equal(selected.sourceImageIndex, 1);
    assert.match(selected.context.before, /두 번째 이미지 설명/);
    assert.doesNotMatch(JSON.stringify(selected.context), /먼 앞부분/);
});

test('uses the stable ID match even when a stale display index points elsewhere', () => {
    const markdown = ['# 원고', '', '먼저 나오는 내용.', '', block(0, 'first'), '', '대상 문맥.', '', block(1, 'target')].join('\n');

    const selected = selectManuscriptImagePromptContext(markdown, { blockId: 'target', index: 0 });

    assert.equal(selected.matchedBy, 'block_id');
    assert.equal(selected.sourceImageIndex, 1);
    assert.match(selected.context.before, /대상 문맥/);
});

test('fails closed when neither block ID nor source index identifies an image block', () => {
    assert.throws(
        () => selectManuscriptImagePromptContext('# 원고\n\n문맥만 있습니다.', { blockId: 'missing', index: 7 }),
        (error) => error.code === 'MANUSCRIPT_IMAGE_CONTEXT_NOT_FOUND' && error.status === 409
    );
});
