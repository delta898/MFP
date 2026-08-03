#!/usr/bin/env node

const fs = require('fs');

const DEFAULT_RECENT_RELEASE_COUNT = 3;

function getReleaseTimestamp(release = {}) {
    const parsed = Date.parse(String(release.publishedAt || release.createdAt || ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function selectReleaseTagsToDelete(releases, keepRecent = DEFAULT_RECENT_RELEASE_COUNT) {
    const recentLimit = Math.max(1, Number.parseInt(keepRecent, 10) || DEFAULT_RECENT_RELEASE_COUNT);
    const published = (Array.isArray(releases) ? releases : [])
        .filter((release) => String(release?.tagName || '').trim() && release?.isDraft !== true)
        .map((release, index) => ({ ...release, _inputIndex: index }))
        .sort((left, right) => (
            getReleaseTimestamp(right) - getReleaseTimestamp(left)
            || left._inputIndex - right._inputIndex
        ));

    const retainedTags = new Set(
        published.slice(0, recentLimit).map((release) => String(release.tagName).trim())
    );
    const latestStable = published.find((release) => release.isPrerelease !== true);
    if (latestStable) retainedTags.add(String(latestStable.tagName).trim());

    return published
        .map((release) => String(release.tagName).trim())
        .filter((tagName) => !retainedTags.has(tagName));
}

function main() {
    const inputPath = String(process.argv[2] || '').trim();
    if (!inputPath) {
        process.stderr.write('Usage: node scripts/release-retention.js <releases.json|-> [keep-recent]\n');
        process.exitCode = 1;
        return;
    }

    const releases = JSON.parse(fs.readFileSync(inputPath === '-' ? 0 : inputPath, 'utf8'));
    const tags = selectReleaseTagsToDelete(releases, process.argv[3]);
    if (tags.length > 0) process.stdout.write(`${tags.join('\n')}\n`);
}

if (require.main === module) main();

module.exports = {
    DEFAULT_RECENT_RELEASE_COUNT,
    getReleaseTimestamp,
    selectReleaseTagsToDelete
};
