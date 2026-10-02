'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../ui/scripts/features/settings-next/site-hosting.js'), 'utf8');

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
    const nodes = new Map([
        ['settings-next-cloudflare-status', badge],
        ['settings-next-cloudflare-detail', detail],
        ['settings-next-cloudflare-connect', connect],
        ['settings-next-cloudflare-disconnect', disconnect],
        ['settings-next-cloudflare-account-list', accountList],
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
    return { context, badge, detail, accountList, feedback };
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
