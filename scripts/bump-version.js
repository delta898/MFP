#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '..', 'src', 'version.js');
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

const currentRaw = fs.readFileSync(versionFile, 'utf8');
const currentMatch = /['"](\d+\.\d+\.\d+)['"]/.exec(currentRaw);
if (!currentMatch) {
  console.error('현재 버전을 src/version.js에서 읽을 수 없습니다.');
  process.exit(1);
}

const current = parseVersion(currentMatch[1]);
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
fs.writeFileSync(versionFile, `module.exports = '${nextStr}';\n`);
console.log(nextStr);

