'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const development = fs.readFileSync(path.join(root, '.github/workflows/environment-validation.yml'), 'utf8');
const production = fs.readFileSync(path.join(root, '.github/workflows/deploy-trends-web-production.yml'), 'utf8');

test('Development push builds and deploys MentiVenus to its dev hostname', () => {
    const build = development.match(/  build-development-site:[\s\S]*?(?=\n  deploy-development-workers:)/)?.[0] || '';
    const deploy = development.match(/  deploy-development-site:[\s\S]*?(?=\n  send-development-newsletter-canary:)/)?.[0] || '';
    assert.match(build, /MENTIVENUS_ENV: development/);
    assert.match(build, /https:\/\/www-dev\.mentivenus\.com/);
    assert.match(build, /development-mentivenus-site-\$\{\{ github\.sha \}\}/);
    assert.match(deploy, /development-mentivenus-site-\$\{\{ github\.sha \}\}/);
    assert.match(deploy, /MENTIVENUS_ENV: development[\s\S]*node scripts\/deploy-mentivenus-site\.js/);
});

test('Production release push builds and deploys MentiVenus to its production hostname', () => {
    assert.match(production, /branches:[\s\S]*- 'release\/\*\*'/);
    const build = production.match(/  build:[\s\S]*?(?=\n  production-migration-preview:)/)?.[0] || '';
    const deploy = production.match(/  deploy:[\s\S]*?(?=\n  site-domain-cutover:)/)?.[0] || '';
    assert.match(build, /MENTIVENUS_ENV: production/);
    assert.match(build, /https:\/\/www\.mentivenus\.com/);
    assert.match(build, /production-mentivenus-site-\$\{\{ github\.sha \}\}/);
    assert.match(deploy, /production-mentivenus-site-\$\{\{ github\.sha \}\}/);
    assert.match(deploy, /MENTIVENUS_ENV: production[\s\S]*node scripts\/deploy-mentivenus-site\.js/);
});
