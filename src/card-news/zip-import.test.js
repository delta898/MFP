const test = require('node:test');
const assert = require('node:assert/strict');
const { createStoredZip } = require('./zip-bundle');
const { parseCardNewsZip, toZipPreview } = require('./zip-import');

const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(128, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(128, 2)]);

function asInput(entries) {
    return { base64_data: createStoredZip(entries).toString('base64') };
}

test('extracts supported images from nested folders in natural filename order', () => {
    const parsed = parseCardNewsZip(asInput([
        { name: '__MACOSX/._02.png', data: Buffer.from('ignored') },
        { name: 'cards/10.jpg', data: JPG },
        { name: 'cards/2.png', data: PNG },
        { name: 'cards/1.png', data: PNG },
        { name: 'notes.txt', data: Buffer.from('ignored') }
    ]));
    assert.deepEqual(parsed.images.map((image) => image.original_name), ['1.png', '2.png', '10.jpg']);
    assert.deepEqual(parsed.images.map((image) => image.mime_type), ['image/png', 'image/png', 'image/jpeg']);
    assert.match(toZipPreview(parsed).images[0].data_url, /^data:image\/png;base64,/);
});

test('restores BlogGenius card metadata when card-news.json is present', () => {
    const metadata = {
        schema_version: 1,
        title: '제주 여름 카드뉴스',
        source: { canonical_url: 'https://example.com/jeju' },
        settings: { aspect_ratio: '4:5', style: 'warm', include_korean_text: true },
        cards: [
            { image_file: '01.png', headline: '첫 카드', body: '첫 본문', image_prompt: '첫 프롬프트' },
            { image_file: '02.jpg', headline: '둘째 카드', body: '둘째 본문', image_prompt: '둘째 프롬프트' }
        ]
    };
    const parsed = parseCardNewsZip(asInput([
        { name: 'card-news.json', data: Buffer.from(JSON.stringify(metadata)) },
        { name: '01.png', data: PNG },
        { name: '02.jpg', data: JPG }
    ]));
    assert.equal(parsed.metadata.title, '제주 여름 카드뉴스');
    assert.equal(parsed.metadata.source_url, 'https://example.com/jeju');
    assert.deepEqual(parsed.images.map(({ headline, body, image_prompt: prompt }) => ({ headline, body, prompt })), [
        { headline: '첫 카드', body: '첫 본문', prompt: '첫 프롬프트' },
        { headline: '둘째 카드', body: '둘째 본문', prompt: '둘째 프롬프트' }
    ]);
    assert.deepEqual(toZipPreview(parsed), {
        card_count: 2,
        total_image_size: PNG.length + JPG.length,
        title: '제주 여름 카드뉴스',
        source_url: 'https://example.com/jeju',
        has_manifest: true,
        images: [
            { index: 1, file_name: '01.png', mime_type: 'image/png', data_url: `data:image/png;base64,${PNG.toString('base64')}` },
            { index: 2, file_name: '02.jpg', mime_type: 'image/jpeg', data_url: `data:image/jpeg;base64,${JPG.toString('base64')}` }
        ]
    });
});

test('rejects traversal, invalid image signatures, and more than ten card images', () => {
    const unsafeArchive = createStoredZip([{ name: 'aa/card.png', data: PNG }]);
    for (let offset = unsafeArchive.indexOf('aa/card.png'); offset >= 0; offset = unsafeArchive.indexOf('aa/card.png', offset + 1)) {
        unsafeArchive.write('../card.png', offset, 'utf8');
    }
    assert.throws(() => parseCardNewsZip({ base64_data: unsafeArchive.toString('base64') }), { code: 'CARD_NEWS_ZIP_PATH_INVALID' });
    assert.throws(() => parseCardNewsZip(asInput([{ name: 'card.png', data: Buffer.alloc(140, 1) }])), { code: 'CARD_NEWS_ZIP_IMAGE_INVALID' });
    assert.throws(() => parseCardNewsZip(asInput(Array.from({ length: 11 }, (_, index) => ({ name: `${index + 1}.png`, data: PNG })))), { code: 'CARD_NEWS_ZIP_TOO_MANY_IMAGES' });
});
