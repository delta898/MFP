'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../ui/scripts/features/settings/site-hosting.js'), 'utf8');
const siteHostingRuntime = fs.readFileSync(path.join(__dirname, '../ui/scripts/features/site-hosting/project-management.js'), 'utf8');
const siteSettings = fs.readFileSync(path.join(__dirname, '../ui/scripts/features/site-hosting/site-settings.js'), 'utf8');
const accountSelection = fs.readFileSync(path.join(__dirname, '../ui/scripts/features/site-hosting/cloudflare-account-selection.js'), 'utf8');
const siteHostingView = fs.readFileSync(path.join(__dirname, '../ui/partials/views/site-hosting.html'), 'utf8');

function createNode() {
    return {
        textContent: '',
        dataset: {},
        hidden: false,
        disabled: false,
        children: [],
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = [...children]; },
        querySelector(selector) {
            if (selector === 'strong') return this.strong || this.children.find((child) => child.tagName === 'STRONG') || null;
            return null;
        }
    };
}

function createHarness({ postJson, fetchJson } = {}) {
    const badge = createNode();
    badge.dataset.state = 'success';
    badge.dataset.connected = 'true';
    badge.textContent = '연결됨';
    const detail = createNode();
    const connect = createNode();
    const disconnect = createNode();
    const feedback = createNode();
    const existingName = createNode();
    existingName.textContent = '기존 Cloudflare 계정';
    const existingAccount = createNode();
    existingAccount.strong = existingName;
    const accountList = createNode();
    accountList.children = [existingAccount];
    const description = createNode();
    const nodes = new Map([
        ['settings-next-cloudflare-status', badge],
        ['settings-next-cloudflare-detail', detail],
        ['settings-next-cloudflare-connect', connect],
        ['settings-next-cloudflare-disconnect', disconnect],
        ['settings-next-cloudflare-account-list', accountList],
        ['settings-next-cloudflare-description', description],
        ['settings-next-cloudflare-readiness', createNode()],
        ['settings-next-cloudflare-readiness-dot', createNode()],
        ['settings-next-cloudflare-feedback', feedback],
        ['settings-next-cloudflare-card', createNode()]
    ]);
    const context = vm.createContext({
        document: {
            getElementById: (id) => nodes.get(id) || null,
            querySelectorAll: (selector) => selector === '.settings-next-cloudflare-account' ? accountList.children : [],
            createElement: (tagName) => {
                const node = createNode();
                node.tagName = String(tagName || '').toUpperCase();
                return node;
            }
        },
        fetchJson: fetchJson || (async () => ({ status: 'pending' })),
        postJson: postJson || (async () => ({ flowId: 'test-flow' })),
        settingsNextSetFeedback: (id, message, tone) => {
            const node = nodes.get(id);
            if (node) {
                node.textContent = message;
                node.dataset.tone = tone;
            }
        },
        setTimeout: (callback) => { callback(); return 1; },
        clearTimeout() {},
        URLSearchParams,
        window: {}
    });
    vm.runInContext(source, context, { filename: 'site-hosting.js' });
    return { context, badge, detail, accountList, feedback, description };
}

test('failed Cloudflare reconnect startup preserves the last valid connection display', async () => {
    const harness = createHarness({
        postJson: async () => { throw new Error('브라우저를 열지 못했습니다.'); }
    });

    await vm.runInContext('settingsNextCloudflareConnect()', harness.context);

    assert.equal(harness.badge.dataset.state, 'success');
    assert.equal(harness.detail.textContent, '접근 가능한 계정 1개');
    assert.equal(harness.accountList.children.length, 1);
    assert.equal(harness.accountList.children[0].querySelector('strong').textContent, '기존 Cloudflare 계정');
    assert.equal(harness.feedback.dataset.tone, 'danger');
});

test('failed Cloudflare OAuth approval preserves the last valid connection display', async () => {
    const harness = createHarness({
        fetchJson: async () => ({ status: 'failed', message: '승인이 취소되었습니다.' })
    });
    vm.runInContext("settingsNextCloudflareFlowId = 'test-flow'", harness.context);

    await vm.runInContext("settingsNextCloudflareWait('test-flow')", harness.context);

    assert.equal(harness.badge.dataset.state, 'success');
    assert.equal(harness.detail.textContent, '접근 가능한 계정 1개');
    assert.equal(harness.accountList.children.length, 1);
    assert.equal(harness.accountList.children[0].querySelector('strong').textContent, '기존 Cloudflare 계정');
    assert.equal(harness.feedback.textContent, '승인이 취소되었습니다.');
});

test('Cloudflare settings displays only the accounts returned as accessible and explains an empty list', () => {
    const harness = createHarness();
    vm.runInContext("settingsNextCloudflareRenderStatus({ connected: true, accounts: [{ id: 'account-1', name: 'Authorized account' }] })", harness.context);
    assert.equal(harness.detail.textContent, '접근 가능한 계정 1개');
    assert.equal(harness.accountList.children.length, 1);
    assert.equal(harness.accountList.children[0].querySelector('strong').textContent, 'Authorized account');

    vm.runInContext("settingsNextCloudflareRenderStatus({ connected: true, accounts: [] })", harness.context);
    assert.equal(harness.detail.textContent, '');
    assert.equal(harness.badge.textContent, '권한 확인 필요');
    assert.equal(harness.description.textContent, 'Cloudflare는 연결됐지만 사이트 배포 권한이 확인된 계정이 없습니다. 권한을 확인한 뒤 다시 연결해 주세요.');
    assert.equal(harness.accountList.children.length, 1);
    assert.match(harness.accountList.children[0].textContent, /배포 가능한 계정이 없습니다/u);

    vm.runInContext("settingsNextCloudflareRenderStatus({ connected: false, accounts: [] })", harness.context);
    assert.equal(harness.badge.textContent, '연결 필요');
    assert.equal(harness.description.textContent, '현재 Cloudflare가 연결되어 있지 않습니다. 사이트를 배포하거나 관리하려면 연결해 주세요.');
    assert.equal(harness.accountList.children.length, 0);
});

test('site deployment selects an account only for multiple accessible accounts and submits the selected ID', () => {
    assert.match(siteHostingView, /id="site-hosting-cloudflare-account-dialog"/u);
    assert.match(accountSelection, /if \(accounts\.length === 1\) return String\(accounts\[0\]\.id \|\| ''\);/u);
    assert.match(accountSelection, /return siteHostingChooseDeploymentAccount\(accounts\);/u);
    assert.match(siteHostingRuntime, /accountId \? \{ account_id: accountId \} : \{\}/u);
    assert.match(accountSelection, /site\?\.deployment\?\.worker_account_id \|\| site\?\.cloudflare_account\?\.id/u);
    assert.match(siteHostingRuntime, /siteHostingResolveDeploymentAccount\(siteId\)/u);
});

test('custom domain settings use the Site deployment account and wait for deployment before listing zones', () => {
    assert.match(siteSettings, /이 사이트를 배포한 Cloudflare 계정/u);
    assert.match(siteSettings, /siteHostingZoneStatus === 'loading' \|\| !site\.deployment\?\.worker_name/u);
    assert.doesNotMatch(siteSettings, /도메인 목록은 확인할 수 있습니다\. 실제 연결은 사이트를 배포한 뒤/u);
});
