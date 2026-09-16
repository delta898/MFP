const test = require('node:test');
const assert = require('node:assert/strict');

const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');
const { bumpVersion, formatVersion, parseVersion } = require('./version-utils');

test('desktop package and lockfile root versions remain consistent', () => {
  assert.equal(packageJson.version, '0.5.0-dev6');
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
});

test('desktop runtime stays on the supported Electron 44 release line', () => {
  assert.match(packageJson.devDependencies.electron, /^\^44\./);
  assert.match(packageLock.packages['node_modules/electron'].version, /^44\./);
});

test('release version helpers accept prerelease versions and promote patch to stable', () => {
  const prerelease = parseVersion('0.4.0-dev1');

  assert.deepEqual(prerelease, {
    major: 0,
    minor: 4,
    patch: 0,
    prerelease: 'dev1'
  });
  assert.equal(formatVersion(prerelease), '0.4.0-dev1');
  assert.equal(formatVersion(bumpVersion(prerelease, 'patch')), '0.4.0');
});
