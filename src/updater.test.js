const test = require('node:test');
const assert = require('node:assert/strict');

const CONFIG = require('./config-loader');
const { Updater } = require('./updater');

function snapshotUpdateConfig() {
    return {
        UPDATE_SERVER_TYPE: CONFIG.UPDATE_SERVER_TYPE,
        CUSTOM_UPDATE_CHECK_URL: CONFIG.CUSTOM_UPDATE_CHECK_URL,
        UPDATE_MIRROR_REPO: CONFIG.UPDATE_MIRROR_REPO,
        UPDATE_CHANNEL: CONFIG.UPDATE_CHANNEL,
        USER_ROLE: CONFIG.USER_ROLE
    };
}

function restoreUpdateConfig(snapshot) {
    Object.assign(CONFIG, snapshot);
}

test('updater reads the current custom update URL instead of startup values', () => {
    const original = snapshotUpdateConfig();
    try {
        const updater = new Updater();
        CONFIG.UPDATE_SERVER_TYPE = 'custom';
        CONFIG.CUSTOM_UPDATE_CHECK_URL = 'https://example.com/releases';
        assert.equal(updater.getCustomManifestUrl(), 'https://example.com/releases/update.json');

        CONFIG.CUSTOM_UPDATE_CHECK_URL = 'https://cdn.example.com/update.json';
        assert.equal(updater.getCustomManifestUrl(), 'https://cdn.example.com/update.json');
    } finally {
        restoreUpdateConfig(original);
    }
});

test('updater invalidates a recent result when update source settings change', async () => {
    const original = snapshotUpdateConfig();
    try {
        CONFIG.UPDATE_SERVER_TYPE = 'custom';
        CONFIG.CUSTOM_UPDATE_CHECK_URL = 'https://example.com/first';
        CONFIG.UPDATE_CHANNEL = 'dev';
        CONFIG.USER_ROLE = 'Developer';

        const updater = new Updater();
        updater.currentVersion = '0.1.11';
        let fetchCount = 0;
        updater.fetchReleases = async () => {
            fetchCount += 1;
            return [{
                tag_name: fetchCount === 1 ? 'v0.1.12-dev1' : 'v0.1.12-dev2',
                prerelease: true,
                assets: [{
                    name: 'BlogGenius-mac-arm64.zip',
                    browser_download_url: 'BlogGenius-mac-arm64.zip'
                }]
            }];
        };

        const first = await updater.checkForUpdate();
        assert.equal(first.latestVersion, '0.1.12-dev1');
        assert.equal(fetchCount, 1);

        CONFIG.CUSTOM_UPDATE_CHECK_URL = 'https://example.com/second';
        const second = await updater.checkForUpdate();
        assert.equal(second.latestVersion, '0.1.12-dev2');
        assert.equal(fetchCount, 2);
    } finally {
        restoreUpdateConfig(original);
    }
});
