const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContentService } = require('./content.service');
const { createUiSettingsFieldsRuntime } = require('../../ui-runtime/settings-fields-runtime');

test('shopping image upload persists structured config and updates runtime state', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-shopping-image-'));
    const configPath = path.join(tempDir, 'config.json');
    const initialConfig = {
        platforms: {
            naver: {
                assets: {
                    ftc_image: './config/images/ftc.jpg',
                    cta_images: ['./config/images/old-1.jpg', './config/images/old-2.jpg']
                }
            }
        }
    };
    fs.writeFileSync(configPath, `${JSON.stringify(initialConfig, null, 2)}\n`);

    const slotMap = {
        cta2: { key: 'SHOPPING_CTA_IMAGE_URL2', fileBase: 'shopping_cta_2', label: 'CTA 2', required: false }
    };
    const settingsRuntime = createUiSettingsFieldsRuntime({
        path,
        shoppingImageSlotMap: slotMap,
        defaultShoppingImageSources: {},
        allowedImageExts: new Set(['.png'])
    });
    let appliedFields = null;

    try {
        const service = createContentService({
            fs,
            path,
            CONFIG: {
                SHOPPING_CTA_IMAGE_URL1: './config/images/old-1.jpg',
                SHOPPING_CTA_IMAGE_URL2: './config/images/old-2.jpg'
            },
            SHOPPING_IMAGE_SLOT_MAP: slotMap,
            parseBase64ImagePayload: () => ({ buffer: Buffer.alloc(256, 1), ext: '.png' }),
            resolveWritableConfigPath: () => configPath,
            tryResolveReadableConfigSource: () => ({ path: configPath }),
            readConfigRaw: ({ path: sourcePath }) => fs.readFileSync(sourcePath, 'utf8'),
            buildDefaultConfigTemplate: () => '{}',
            applyConfigUpdates: settingsRuntime.applyConfigUpdates,
            parseConfigValue: () => '',
            parseMajorFieldsFromRequest: (fields) => fields,
            applyRuntimeConfigFromMajor: (fields) => { appliedFields = fields; },
            syncAutoRunnerWithConfig() {},
            syncShoppingAutoRunnerWithConfig() {}
        });

        const result = await service.saveShoppingImage({ slot: 'cta2' });
        const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        assert.equal(result.value, './config/images/shopping_cta_2.png');
        assert.equal(saved.platforms.naver.assets.cta_images[1], './config/images/shopping_cta_2.png');
        assert.equal(appliedFields.SHOPPING_CTA_IMAGE_URL2, './config/images/shopping_cta_2.png');
        assert.equal(fs.existsSync(path.join(tempDir, 'images', 'shopping_cta_2.png')), true);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
