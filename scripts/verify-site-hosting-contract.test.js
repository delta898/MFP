'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const bloggeniusContract = require('../src/services/site-hosting/site-hosting-contract.json');
const { verifySiteHostingContract } = require('./verify-site-hosting-contract');

test('Amade catalog versions must match its source and BlogGenius supported contract', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-contract-check-'));
    const version = bloggeniusContract.version;
    const familyPath = 'amade/families/test/family.json';
    const templatePath = 'amade/templates/test/template.json';
    const writeJson = (relativePath, value) => {
        const target = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `${JSON.stringify(value)}\n`);
    };
    try {
        writeJson('amade/spec/site-hosting-contract-version.json', { version, contract_ids: bloggeniusContract.contract_ids });
        writeJson('amade/catalog/index.json', { families: [{ manifest: familyPath, templates: [{ manifest: templatePath }] }] });
        writeJson(familyPath, { spec_version: version, content_contract_version: version });
        writeJson(templatePath, { spec_version: version, compatibility: { contract: { id: bloggeniusContract.contract_ids[0], version } } });
        assert.deepEqual(verifySiteHostingContract('/unused', root), {
            amadeVersion: version, bloggeniusVersion: version, templatesChecked: 1
        });

        writeJson(templatePath, { spec_version: version, compatibility: { contract: { id: bloggeniusContract.contract_ids[0], version: '0.1.0-dev99' } } });
        assert.throws(() => verifySiteHostingContract('/unused', root), { code: 'SITE_HOSTING_CONTRACT_CHECK_FAILED' });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the checked-out Amade catalog stays within BlogGenius supported contracts when available', {
    skip: !fs.existsSync(path.resolve(__dirname, '../../Amade/amade/catalog/index.json'))
}, () => {
    const bloggeniusRoot = path.resolve(__dirname, '..');
    const amadeRoot = path.resolve(__dirname, '../../Amade');
    const result = verifySiteHostingContract(bloggeniusRoot, amadeRoot);
    assert.ok(result.templatesChecked > 0);
});
