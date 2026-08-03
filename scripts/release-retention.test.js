const test = require('node:test');
const assert = require('node:assert/strict');
const { selectReleaseTagsToDelete } = require('./release-retention');

function release(tagName, publishedAt, { prerelease = false, draft = false } = {}) {
    return {
        tagName,
        publishedAt,
        createdAt: publishedAt,
        isPrerelease: prerelease,
        isDraft: draft
    };
}

test('retains the latest stable release in addition to three newer prereleases', () => {
    const releases = [
        release('v0.1.15-dev4', '2026-08-03T03:20:38Z', { prerelease: true }),
        release('v0.1.15-dev3', '2026-08-01T09:45:31Z', { prerelease: true }),
        release('v0.1.15-dev2', '2026-07-31T21:48:42Z', { prerelease: true }),
        release('v0.1.14', '2026-07-31T05:14:59Z'),
        release('v0.1.15-dev1', '2026-07-31T09:46:32Z', { prerelease: true }),
        release('v0.1.13', '2026-06-26T22:38:35Z')
    ];

    assert.deepEqual(selectReleaseTagsToDelete(releases, 3), [
        'v0.1.15-dev1',
        'v0.1.13'
    ]);
});

test('keeps only the recent window when the latest stable is already included', () => {
    const releases = [
        release('v0.1.15', '2026-08-05T00:00:00Z'),
        release('v0.1.15-rc1', '2026-08-04T00:00:00Z', { prerelease: true }),
        release('v0.1.14', '2026-08-03T00:00:00Z'),
        release('v0.1.14-dev3', '2026-08-02T00:00:00Z', { prerelease: true })
    ];

    assert.deepEqual(selectReleaseTagsToDelete(releases, 3), ['v0.1.14-dev3']);
});

test('sorts by release timestamp and never deletes drafts', () => {
    const releases = [
        release('v0.1.13', '2026-06-01T00:00:00Z'),
        release('v0.1.16-draft', '2026-09-01T00:00:00Z', { draft: true }),
        release('v0.1.15-dev2', '2026-08-02T00:00:00Z', { prerelease: true }),
        release('v0.1.15-dev3', '2026-08-03T00:00:00Z', { prerelease: true }),
        release('v0.1.15-dev1', '2026-08-01T00:00:00Z', { prerelease: true }),
        release('v0.1.14', '2026-07-01T00:00:00Z')
    ];

    assert.deepEqual(selectReleaseTagsToDelete(releases, 3), [
        'v0.1.13'
    ]);
});
