'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSocialPublisherAdapter } = require('./social-publisher');

test('Social Publisher adapter maps capability methods to provider-neutral operations', async () => {
    const calls = [];
    const publisher = createSocialPublisherAdapter({
        executeOperation: async (...args) => {
            calls.push(args);
            return [];
        }
    });

    await publisher.inspectConnection('temporary-key', 'workspace-1');
    await publisher.listRecentPublications({ workspaceId: 'workspace-1' });
    await publisher.getPublicationStatuses(['post-1']);
    await publisher.publishMany([{ channelId: 'channel-1', text: 'Hello' }]);

    assert.deepEqual(calls.map(([pluginId, operationId]) => [pluginId, operationId]), [
        ['social-publisher', 'connection.inspect'],
        ['social-publisher', 'publications.list-recent'],
        ['social-publisher', 'publications.get-by-ids'],
        ['social-publisher', 'publications.publish']
    ]);
    assert.deepEqual(calls[0][2], { apiKey: 'temporary-key', workspaceId: 'workspace-1' });
    assert.deepEqual(calls[1][2], { workspaceId: 'workspace-1' });
    assert.deepEqual(calls[2][2], { postIds: ['post-1'] });
    assert.deepEqual(calls[3][2], { deliveries: [{ channelId: 'channel-1', text: 'Hello' }] });
});
