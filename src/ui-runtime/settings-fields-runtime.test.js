const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createUiSettingsFieldsRuntime } = require('./settings-fields-runtime');

const slotMap = {
    ftc: { key: 'FTC_DISCLOSURE_IMAGE_URL', label: '공정위 이미지', required: true },
    cta1: { key: 'SHOPPING_CTA_IMAGE_URL1', label: 'CTA 1', required: true },
    cta2: { key: 'SHOPPING_CTA_IMAGE_URL2', label: 'CTA 2', required: false },
    cta3: { key: 'SHOPPING_CTA_IMAGE_URL3', label: 'CTA 3', required: false }
};

function createRuntime() {
    return createUiSettingsFieldsRuntime({
        path,
        shoppingImageSlotMap: slotMap,
        defaultShoppingImageSources: {},
        allowedImageExts: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
    });
}

test('config updates preserve structured JSON and update Naver shopping assets', () => {
    const runtime = createRuntime();
    const raw = JSON.stringify({
        general: { listen_port: 4577 },
        platforms: {
            naver: {
                assets: {
                    ftc_image: './old-ftc.jpg',
                    cta_images: ['./old-1.jpg', './old-2.jpg', './old-3.jpg']
                }
            }
        }
    });

    const updated = JSON.parse(runtime.applyConfigUpdates(raw, {
        SHOPPING_CTA_IMAGE_URL2: './config/images/new-2.png'
    }));

    assert.equal(updated.general.listen_port, 4577);
    assert.deepEqual(updated.platforms.naver.assets.cta_images, [
        './old-1.jpg',
        './config/images/new-2.png',
        './old-3.jpg'
    ]);
});

test('config updates retain legacy KEY=VALUE compatibility', () => {
    const runtime = createRuntime();
    const updated = runtime.applyConfigUpdates('HEADLESS = false\nSHOPPING_CTA_IMAGE_URL1 = old.jpg\n', {
        SHOPPING_CTA_IMAGE_URL1: './config/images/new-1.png',
        SHOPPING_CTA_IMAGE_URL2: './config/images/new-2.png'
    });

    assert.match(updated, /HEADLESS = false/);
    assert.match(updated, /SHOPPING_CTA_IMAGE_URL1 = \.\/config\/images\/new-1\.png/);
    assert.match(updated, /SHOPPING_CTA_IMAGE_URL2 = \.\/config\/images\/new-2\.png/);
});

test('shopping image policy rejects unsafe URLs and validates required slots', () => {
    const runtime = createRuntime();
    assert.equal(runtime.isAllowedImageSourceValue('https://cdn.example.com/a.png'), true);
    assert.equal(runtime.isAllowedImageSourceValue('./config/images/a.png'), true);
    assert.equal(runtime.isAllowedImageSourceValue('http://cdn.example.com/a.png'), false);
    assert.equal(runtime.isAllowedImageSourceValue('ftp://cdn.example.com/a.png'), false);
    assert.deepEqual(runtime.validateRequiredShoppingImageSources({}), [
        '공정위 이미지는 필수입니다.',
        'CTA 1는 필수입니다.'
    ]);
});

test('base64 image parsing enforces supported extensions and size boundaries', () => {
    const runtime = createRuntime();
    const payload = Buffer.alloc(256, 1).toString('base64');
    const parsed = runtime.parseBase64ImagePayload({ fileName: 'image.png', base64Data: payload });
    assert.equal(parsed.ext, '.png');
    assert.equal(parsed.buffer.length, 256);
    assert.throws(
        () => runtime.parseBase64ImagePayload({ fileName: 'image.exe', base64Data: payload }),
        /지원하지 않는 이미지 형식/
    );
});
