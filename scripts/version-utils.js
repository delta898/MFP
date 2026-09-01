function parseVersion(input) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(input || '').trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || ''
  };
}

function formatVersion(version) {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease ? `${core}-${version.prerelease}` : core;
}

function bumpVersion(version, kind) {
  if (kind === 'major') return { major: version.major + 1, minor: 0, patch: 0, prerelease: '' };
  if (kind === 'minor') return { major: version.major, minor: version.minor + 1, patch: 0, prerelease: '' };
  if (kind === 'patch') {
    if (version.prerelease) return { ...version, prerelease: '' };
    return { major: version.major, minor: version.minor, patch: version.patch + 1, prerelease: '' };
  }
  return null;
}

module.exports = {
  bumpVersion,
  formatVersion,
  parseVersion
};
