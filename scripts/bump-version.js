#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packageJsonFile = path.join(__dirname, '..', 'package.json');
const packageLockFile = path.join(__dirname, '..', 'package-lock.json');
const mode = process.argv[2] || 'patch';

function parseVersion(input) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(input.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bump(v, kind) {
  if (kind === 'major') return { major: v.major + 1, minor: 0, patch: 0 };
  if (kind === 'minor') return { major: v.major, minor: v.minor + 1, patch: 0 };
  if (kind === 'patch') return { major: v.major, minor: v.minor, patch: v.patch + 1 };
  return null;
}

let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'));
} catch (_e) {
  console.error('현재 버전을 package.json에서 읽을 수 없습니다.');
  process.exit(1);
}

if (!packageJson || typeof packageJson.version !== 'string') {
  console.error('package.json에 version 필드가 없습니다.');
  process.exit(1);
}

const current = parseVersion(packageJson.version);
if (!current) {
  console.error('package.json version 형식이 올바르지 않습니다. (x.y.z)');
  process.exit(1);
}
let next;

if (/^\d+\.\d+\.\d+$/.test(mode)) {
  next = parseVersion(mode);
} else {
  next = bump(current, mode);
}

if (!next) {
  console.error('사용법: node scripts/bump-version.js [patch|minor|major|x.y.z]');
  process.exit(1);
}

const nextStr = formatVersion(next);
packageJson.version = nextStr;
fs.writeFileSync(packageJsonFile, `${JSON.stringify(packageJson, null, 2)}\n`);

if (fs.existsSync(packageLockFile)) {
  try {
    const packageLock = JSON.parse(fs.readFileSync(packageLockFile, 'utf8'));
    packageLock.version = nextStr;
    if (packageLock.packages && packageLock.packages['']) {
      packageLock.packages[''].version = nextStr;
    }
    fs.writeFileSync(packageLockFile, `${JSON.stringify(packageLock, null, 2)}\n`);
  } catch (_e) {
    // package-lock 동기화 실패는 버전 bump 자체를 막지 않음
  }
}

console.log(nextStr);
