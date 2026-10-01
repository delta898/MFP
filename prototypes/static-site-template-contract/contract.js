'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE_SCHEMA_VERSION = 1;
const TEMPLATE_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function normalizeRelativePath(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || path.posix.isAbsolute(value)) {
    fail('template_path_invalid', `${field} must be a normalized relative POSIX path`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    fail('template_path_invalid', `${field} must not escape its package root`);
  }
  return normalized;
}

function validateTemplateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    fail('template_descriptor_invalid', 'Template descriptor must be an object');
  }
  if (descriptor.schemaVersion !== TEMPLATE_SCHEMA_VERSION) {
    fail('template_schema_unsupported', `Unsupported template schema version: ${descriptor.schemaVersion}`);
  }
  if (typeof descriptor.id !== 'string' || !TEMPLATE_ID_PATTERN.test(descriptor.id)) {
    fail('template_id_invalid', 'Template id must be a stable lowercase dotted or hyphenated identifier');
  }
  if (typeof descriptor.version !== 'string' || !SEMVER_PATTERN.test(descriptor.version)) {
    fail('template_version_invalid', 'Template version must be semantic version text');
  }
  if (typeof descriptor.name !== 'string' || descriptor.name.trim() === '') {
    fail('template_name_invalid', 'Template name is required');
  }
  if (descriptor.engine?.id !== 'astro' || typeof descriptor.engine.range !== 'string' || !descriptor.engine.range.trim()) {
    fail('template_engine_invalid', 'This spike requires an Astro engine id and version range');
  }
  if (!descriptor.settings || typeof descriptor.settings !== 'object' || Array.isArray(descriptor.settings)) {
    fail('template_settings_invalid', 'Template settings must be an object');
  }
  for (const [key, setting] of Object.entries(descriptor.settings)) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key) || !setting || typeof setting !== 'object' || Array.isArray(setting)) {
      fail('template_setting_invalid', `Invalid setting declaration: ${key}`);
    }
    if (!['string', 'navigation'].includes(setting.type)) {
      fail('template_setting_type_unsupported', `Unsupported setting type for ${key}`);
    }
    if (typeof setting.label !== 'string' || setting.label.trim() === '') {
      fail('template_setting_invalid', `Setting ${key} requires a label`);
    }
  }
  if (!Array.isArray(descriptor.files) || descriptor.files.length === 0) {
    fail('template_files_invalid', 'Template must declare at least one file');
  }
  const seen = new Set();
  for (const file of descriptor.files) {
    const filePath = normalizeRelativePath(file?.path, 'file.path');
    if (seen.has(filePath)) fail('template_files_invalid', `Duplicate template path: ${filePath}`);
    seen.add(filePath);
    if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      fail('template_integrity_invalid', `Invalid SHA-256 for ${filePath}`);
    }
  }
  return descriptor;
}

function validateSettings(descriptor, supplied = {}) {
  validateTemplateDescriptor(descriptor);
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
    fail('template_settings_invalid', 'Settings must be an object');
  }
  for (const key of Object.keys(supplied)) {
    if (!Object.prototype.hasOwnProperty.call(descriptor.settings, key)) {
      fail('template_setting_unknown', `Unknown template setting: ${key}`);
    }
  }
  const result = {};
  for (const [key, definition] of Object.entries(descriptor.settings)) {
    const hasValue = Object.prototype.hasOwnProperty.call(supplied, key);
    const value = hasValue ? supplied[key] : definition.default;
    if (value === undefined || value === null) {
      if (definition.required) fail('template_setting_required', `Setting ${key} is required`);
      result[key] = '';
      continue;
    }
    if (definition.required && (typeof value === 'string' ? !value.trim() : Array.isArray(value) && value.length === 0)) {
      fail('template_setting_required', `Setting ${key} must not be empty`);
    }
    if (definition.type === 'string') {
      if (typeof value !== 'string') fail('template_setting_type_invalid', `Setting ${key} must be a string`);
      const min = Number.isInteger(definition.minLength) ? definition.minLength : 0;
      const max = Number.isInteger(definition.maxLength) ? definition.maxLength : 4096;
      if (value.trim().length < min || value.length > max) fail('template_setting_value_invalid', `Setting ${key} length is outside its declared limits`);
      if (key.toLowerCase().includes('logo') && value && (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith('data:') || value.includes('..'))) {
        fail('template_setting_value_invalid', `Setting ${key} must be a package-relative asset path`);
      }
      result[key] = value;
      continue;
    }
    if (!Array.isArray(value)) fail('template_setting_type_invalid', `Setting ${key} must be a list`);
    const maxItems = Number.isInteger(definition.maxItems) ? definition.maxItems : 32;
    if (value.length > maxItems) fail('template_setting_value_invalid', `Setting ${key} exceeds its item limit`);
    result[key] = value.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)
          || typeof item.label !== 'string' || !item.label.trim()
          || typeof item.href !== 'string' || !item.href.trim()) {
        fail('template_setting_value_invalid', `Setting ${key}[${index}] requires label and href`);
      }
      if (!item.href.startsWith('/') && !/^https:\/\//i.test(item.href)) {
        fail('template_setting_value_invalid', `Setting ${key}[${index}].href must be a site path or HTTPS URL`);
      }
      return { label: item.label.trim(), href: item.href };
    });
  }
  return result;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readVerifiedFiles(packageRoot, descriptor) {
  const root = fs.realpathSync(path.resolve(packageRoot));
  return descriptor.files.map((entry) => {
    const relativePath = normalizeRelativePath(entry.path, 'file.path');
    let cursor = root;
    const segments = relativePath.split('/');
    for (let index = 0; index < segments.length; index += 1) {
      cursor = path.join(cursor, segments[index]);
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) fail('template_file_invalid', `Template path must not contain symlinks: ${relativePath}`);
      if (index < segments.length - 1 && !stat.isDirectory()) {
        fail('template_file_invalid', `Template parent path must be a directory: ${relativePath}`);
      }
      if (index === segments.length - 1 && !stat.isFile()) {
        fail('template_file_invalid', `Template file must be a regular file: ${relativePath}`);
      }
    }
    const realPath = fs.realpathSync(cursor);
    if (!realPath.startsWith(`${root}${path.sep}`)) fail('template_path_invalid', `File escapes package root: ${relativePath}`);
    const contents = fs.readFileSync(realPath);
    const actual = sha256(contents);
    if (actual !== entry.sha256) fail('template_integrity_mismatch', `Template file hash mismatch: ${relativePath}`);
    return { path: relativePath, contents, sha256: actual };
  });
}

function verifyTemplateFiles(packageRoot, descriptor) {
  validateTemplateDescriptor(descriptor);
  return readVerifiedFiles(packageRoot, descriptor).map(({ path: filePath, sha256: digest }) => ({ path: filePath, sha256: digest }));
}

function materializeTemplate({ packageRoot, descriptor, outputRoot, settings = {} }) {
  validateTemplateDescriptor(descriptor);
  const normalizedSettings = validateSettings(descriptor, settings);
  const verifiedFiles = readVerifiedFiles(packageRoot, descriptor);
  if (descriptor.files.some((entry) => entry.path.replace(/^astro\//, '') === 'src/site.config.json')) {
    fail('template_files_invalid', 'Template must not provide the consumer-generated src/site.config.json');
  }
  const packagePath = fs.realpathSync(path.resolve(packageRoot));
  const outputPath = path.resolve(outputRoot);
  if (outputPath === packagePath || outputPath.startsWith(`${packagePath}${path.sep}`)) {
    fail('template_output_invalid', 'Output directory must be outside the template package');
  }
  const siteConfigPath = path.join(outputPath, 'src', 'site.config.json');
  fs.mkdirSync(outputPath);
  try {
    for (const entry of verifiedFiles) {
      const destination = path.resolve(outputPath, ...entry.path.replace(/^astro\//, '').split('/'));
      if (!destination.startsWith(`${outputPath}${path.sep}`)) fail('template_path_invalid', `Output path escapes site root: ${entry.path}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, entry.contents, { flag: 'wx' });
    }
    fs.writeFileSync(siteConfigPath, `${JSON.stringify(normalizedSettings, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    fs.rmSync(outputPath, { recursive: true, force: true });
    throw error;
  }
  return {
    template: { id: descriptor.id, version: descriptor.version },
    settings: normalizedSettings,
    siteConfigPath,
  };
}

module.exports = {
  materializeTemplate,
  sha256,
  validateSettings,
  validateTemplateDescriptor,
  verifyTemplateFiles,
};
