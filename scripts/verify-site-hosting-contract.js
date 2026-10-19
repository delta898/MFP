'use strict';

const fs = require('node:fs');
const path = require('node:path');
const bloggeniusContract = require('../src/services/site-hosting/site-hosting-contract.json');

function verifySiteHostingContract(bloggeniusRoot, amadeRoot) {
    const read = (root, relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
    const amadeContract = read(amadeRoot, 'amade/spec/site-hosting-contract-version.json');
    const catalog = read(amadeRoot, 'amade/catalog/index.json');
    const supportedVersions = [bloggeniusContract.version, ...(bloggeniusContract.previous_versions_supported || [])];
    const supported = new Map(bloggeniusContract.contract_ids.map((id) => [id, supportedVersions]));
    const errors = [];
    let templatesChecked = 0;

    for (const familyRef of catalog.families || []) {
        let family;
        try { family = read(amadeRoot, familyRef.manifest); }
        catch (error) { errors.push(`${familyRef.manifest}: ${error.message}`); continue; }
        if (family.spec_version !== amadeContract.version || family.content_contract_version !== amadeContract.version) {
            errors.push(`${familyRef.manifest}: Family version fields must match Amade's declared ${amadeContract.version}.`);
        }
        for (const reference of familyRef.templates || []) {
            templatesChecked += 1;
            let template;
            try { template = read(amadeRoot, reference.manifest); }
            catch (error) { errors.push(`${reference.manifest}: ${error.message}`); continue; }
            const contract = template.compatibility?.contract || {};
            if (template.spec_version !== amadeContract.version || contract.version !== amadeContract.version) {
                errors.push(`${reference.manifest}: Template version fields must match Amade's declared ${amadeContract.version}.`);
            }
            if (!amadeContract.contract_ids.includes(contract.id)) {
                errors.push(`${reference.manifest}: contract ID ${contract.id || '(missing)'} is absent from Amade's version source.`);
            }
            if (!supported.get(contract.id)?.includes(contract.version)) {
                errors.push(`${reference.manifest}: BlogGenius does not support ${contract.id}@${contract.version}; supported versions are ${supported.get(contract.id)?.join(', ') || '(none)'}.`);
            }
        }
    }
    if (errors.length) {
        const error = new Error(errors.join('\n'));
        error.code = 'SITE_HOSTING_CONTRACT_CHECK_FAILED';
        error.templatesChecked = templatesChecked;
        throw error;
    }
    return { amadeVersion: amadeContract.version, bloggeniusVersion: bloggeniusContract.version, templatesChecked };
}

function resolveAmadeRoot(argv, bloggeniusRoot) {
    const index = argv.indexOf('--amade-root');
    const value = index >= 0 ? argv[index + 1] : process.env.AMADE_REPO_ROOT || '../Amade';
    if (!value || value.startsWith('--')) throw new Error('사용법: npm run verify:site-hosting-contract -- --amade-root <Amade 저장소 경로>');
    return path.resolve(bloggeniusRoot, value);
}

if (require.main === module) {
    try {
        const bloggeniusRoot = path.resolve(__dirname, '..');
        const amadeRoot = resolveAmadeRoot(process.argv.slice(2), bloggeniusRoot);
        const result = verifySiteHostingContract(bloggeniusRoot, amadeRoot);
        process.stdout.write(`Site Hosting 계약 확인 완료: Amade ${result.amadeVersion}, BlogGenius 지원 ${result.bloggeniusVersion}, 템플릿 ${result.templatesChecked}개.\n`);
    } catch (error) {
        process.stderr.write(`Site Hosting 계약 확인 실패:\n${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { verifySiteHostingContract };
