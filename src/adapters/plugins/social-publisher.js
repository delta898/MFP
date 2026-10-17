'use strict';

function createSocialPublisherAdapter(options = {}) {
    if (typeof options.executeOperation !== 'function') {
        throw new TypeError('Social Publisher adapter requires executeOperation().');
    }
    const execute = options.executeOperation;
    function invoke(operationId, input, context) {
        return Promise.resolve().then(() => execute('social-publisher', operationId, input, context)).catch((error) => {
            const status = Number(error?.status) || 0;
            const code = String(error?.code || '').trim().toUpperCase();
            if (status === 429 || status >= 500 || [
                'BUFFER_CONNECTION_FAILED', 'BUFFER_REQUEST_TIMEOUT', 'INTERNAL_SERVER_ERROR',
                'SERVICE_UNAVAILABLE', 'TIMEOUT', 'GATEWAY_TIMEOUT', 'RATE_LIMITED',
                'TOO_MANY_REQUESTS'
            ].includes(code)) error.retryable = true;
            throw error;
        });
    }
    return Object.freeze({
        inspectConnection(apiKey, workspaceId = '', context = {}) {
            return invoke('connection.inspect', {
                ...(String(apiKey || '').trim() ? { apiKey: String(apiKey).trim() } : {}),
                workspaceId: String(workspaceId || '').trim()
            }, context);
        },
        listRecentPublications(input = {}, context = {}) {
            return invoke('publications.list-recent', input, context);
        },
        getPublicationStatuses(postIds = [], context = {}) {
            return invoke('publications.get-by-ids', { postIds }, context);
        },
        publishMany(deliveries = [], context = {}) {
            return invoke('publications.publish', { deliveries }, context);
        }
    });
}

module.exports = { createSocialPublisherAdapter };
