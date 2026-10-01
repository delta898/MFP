'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  materializeTemplate,
  validateSettings,
  validateTemplateDescriptor,
  verifyTemplateFiles,
} = require('./contract');

const packageRoot = __dirname;
const descriptor = JSON.parse(fs.readFileSync(path.join(packageRoot, 'template.json'), 'utf8'));

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'static-template-spike-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('descriptor declares a versioned Astro template and hashes every source file', () => {
  assert.equal(validateTemplateDescriptor(descriptor), descriptor);
  assert.deepEqual(verifyTemplateFiles(packageRoot, descriptor).map((file) => file.path), descriptor.files.map((file) => file.path));
});

test('settings apply defaults and allow bounded site title, logo, and navigation changes', () => {
  const settings = validateSettings(descriptor, {
    siteTitle: 'Mina Studio',
    logoPath: '/images/brand.svg',
    navigation: [{ label: 'Work', href: '/work/' }],
  });
  assert.deepEqual(settings, {
    siteTitle: 'Mina Studio',
    logoPath: '/images/brand.svg',
    navigation: [{ label: 'Work', href: '/work/' }],
  });
  assert.equal(validateSettings(descriptor).siteTitle, 'My Site');
});

test('settings reject unknown fields, invalid paths, unsupported URLs, and excessive menu entries', () => {
  assert.throws(() => validateSettings(descriptor, { arbitraryCode: 'run()' }), { code: 'template_setting_unknown' });
  assert.throws(() => validateSettings(descriptor, { logoPath: '../secret.svg' }), { code: 'template_setting_value_invalid' });
  assert.throws(() => validateSettings(descriptor, { navigation: [{ label: 'Bad', href: 'javascript:alert(1)' }] }), { code: 'template_setting_value_invalid' });
  assert.throws(() => validateSettings(descriptor, { navigation: Array.from({ length: 9 }, (_, i) => ({ label: `Item ${i}`, href: `/item-${i}/` })) }), { code: 'template_setting_value_invalid' });
  assert.throws(() => validateSettings(descriptor, { siteTitle: '   ' }), { code: 'template_setting_required' });
});

test('materialization is deterministic, records pinned template identity, and refuses overwrite', (t) => {
  const root = temporaryDirectory(t);
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  const settings = { siteTitle: 'Mina Studio' };
  const result = materializeTemplate({ packageRoot, descriptor, outputRoot: first, settings });
  materializeTemplate({ packageRoot, descriptor, outputRoot: second, settings });

  assert.deepEqual(result.template, { id: descriptor.id, version: descriptor.version });
  assert.deepEqual(
    fs.readFileSync(path.join(first, 'src/site.config.json')),
    fs.readFileSync(path.join(second, 'src/site.config.json')),
  );
  assert.match(fs.readFileSync(path.join(first, 'src/pages/index.astro'), 'utf8'), /site\.navigation\.map/);
  assert.throws(() => materializeTemplate({ packageRoot, descriptor, outputRoot: first, settings }), { code: 'EEXIST' });
});

test('file integrity mismatch and package traversal are rejected before materialization', (t) => {
  const root = temporaryDirectory(t);
  const tamperedRoot = path.join(root, 'tampered-package');
  fs.cpSync(path.join(packageRoot, 'astro'), path.join(tamperedRoot, 'astro'), { recursive: true });
  fs.writeFileSync(path.join(tamperedRoot, 'astro/package.json'), '{}\n');
  assert.throws(() => verifyTemplateFiles(tamperedRoot, descriptor), { code: 'template_integrity_mismatch' });

  const traversal = structuredClone(descriptor);
  traversal.files[0].path = '../outside.json';
  assert.throws(() => validateTemplateDescriptor(traversal), { code: 'template_path_invalid' });

  const symlinkRoot = path.join(root, 'symlink-package');
  fs.mkdirSync(symlinkRoot);
  fs.symlinkSync(path.join(packageRoot, 'astro'), path.join(symlinkRoot, 'astro'));
  assert.throws(() => verifyTemplateFiles(symlinkRoot, descriptor), { code: 'template_file_invalid' });
});
