'use strict';

const { BufferClient, BufferApiError } = require('./providers/buffer/client');

const PACKAGE_VERSION = require('./package.json').version;

function createPlugin(options = {}) {
    if (typeof options.getCredentials !== 'function') {
        throw new TypeError('Social Publisher requires getCredentials().');
    }
    const client = options.client || new BufferClient({ axios: options.axios, endpoint: options.endpoint });

    async function resolveApiKey(override = '') {
        const explicit = String(override || '').trim();
        if (explicit) return explicit;
        const credentials = await options.getCredentials();
        const apiKey = String(typeof credentials === 'string' ? credentials : credentials?.apiKey || '').trim();
        if (!apiKey) throw new BufferApiError('Buffer API Key를 입력해 주세요.', { code: 'BUFFER_API_KEY_REQUIRED' });
        return apiKey;
    }

    return {
        manifest: require('./package.json').bloggeniusPlugin,
        version: PACKAGE_VERSION,
        operations: {
            'connection.inspect': {
                execute: async ({ apiKey, workspaceId }) => client.inspectConnection(
                    await resolveApiKey(apiKey),
                    workspaceId
                )
            },
            'publications.list-recent': {
                execute: async (input) => client.listRecentPosts(await resolveApiKey(), {
                    ...input,
                    organizationId: input.workspaceId
                })
            },
            'publications.get-by-ids': {
                execute: async ({ postIds }) => client.getPostsByIds(await resolveApiKey(), postIds)
            },
            'publications.publish': {
                execute: async ({ deliveries }) => client.shareNowMany(await resolveApiKey(), deliveries)
            }
        }
    };
}

module.exports = { createPlugin, BufferClient, BufferApiError };
