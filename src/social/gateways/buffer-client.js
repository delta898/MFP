const DEFAULT_ENDPOINT = 'https://api.buffer.com';

class BufferApiError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'BufferApiError';
        this.code = String(options.code || 'BUFFER_API_ERROR');
        this.status = Number(options.status) || 0;
        this.details = options.details || null;
    }
}

function normalizeApiKey(value) {
    return String(value || '').trim();
}

function normalizeOrganization(item = {}) {
    return {
        id: String(item.id || '').trim(),
        name: String(item.name || '').trim()
    };
}

function normalizeChannel(item = {}) {
    const name = String(item.displayName || item.name || item.descriptor || '').trim();
    return {
        id: String(item.id || '').trim(),
        name,
        display_name: name,
        service: String(item.service || '').trim().toLowerCase(),
        avatar: String(item.avatar || '').trim(),
        external_link: String(item.externalLink || '').trim(),
        descriptor: String(item.descriptor || '').trim(),
        is_disconnected: item.isDisconnected === true,
        is_locked: item.isLocked === true
    };
}

function normalizePublishDelivery(item = {}, index = 0) {
    const channelId = String(item.channelId || item.channel_id || '').trim();
    const text = String(item.text || '').trim();
    const imageUrl = String(item.imageUrl || item.image_url || '').trim();
    if (!channelId) throw new BufferApiError(`Buffer 발행 채널 ID가 비어 있습니다. (${index + 1}번째)`, {
        code: 'BUFFER_CHANNEL_REQUIRED'
    });
    if (!text) throw new BufferApiError(`Buffer 발행 내용이 비어 있습니다. (${index + 1}번째)`, {
        code: 'BUFFER_POST_TEXT_REQUIRED'
    });
    return {
        deliveryKey: String(item.deliveryKey || item.delivery_key || channelId).trim(),
        channelId,
        text,
        imageUrl
    };
}

function normalizePost(item = {}) {
    return {
        id: String(item.id || '').trim(),
        channelId: String(item.channelId || '').trim(),
        text: String(item.text || '').trim(),
        status: String(item.status || '').trim().toLowerCase(),
        createdAt: String(item.createdAt || '').trim(),
        sentAt: String(item.sentAt || '').trim(),
        externalLink: String(item.externalLink || '').trim()
    };
}

function isTransientBufferError(error) {
    const status = Number(error?.status) || 0;
    const code = String(error?.code || '').trim().toUpperCase();
    return status === 429
        || status >= 500
        || [
            'BUFFER_CONNECTION_FAILED',
            'INTERNAL_SERVER_ERROR',
            'SERVICE_UNAVAILABLE',
            'TIMEOUT',
            'GATEWAY_TIMEOUT',
            'RATE_LIMITED',
            'TOO_MANY_REQUESTS'
        ].includes(code);
}

class BufferClient {
    constructor(options = {}) {
        this.axios = options.axios || require('axios');
        this.endpoint = String(options.endpoint || DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
        this.timeoutMs = Number(options.timeoutMs) || 15000;
    }

    async request(apiKey, query, variables = {}) {
        const token = normalizeApiKey(apiKey);
        if (!token) {
            throw new BufferApiError('Buffer API Key를 입력해 주세요.', {
                code: 'BUFFER_API_KEY_REQUIRED'
            });
        }

        let response;
        try {
            response = await this.axios.post(
                this.endpoint,
                { query, variables },
                {
                    timeout: this.timeoutMs,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
        } catch (error) {
            const status = Number(error?.response?.status) || 0;
            const code = status === 401 ? 'BUFFER_AUTH_INVALID' : 'BUFFER_CONNECTION_FAILED';
            throw new BufferApiError(
                status === 401
                    ? 'Buffer API Key가 유효하지 않습니다.'
                    : `Buffer API 연결에 실패했습니다: ${error?.message || 'unknown error'}`,
                { code, status, details: error?.response?.data || null }
            );
        }

        const graphqlErrors = Array.isArray(response?.data?.errors)
            ? response.data.errors
            : [];
        if (graphqlErrors.length > 0) {
            const first = graphqlErrors[0] || {};
            const errorCode = String(first?.extensions?.code || 'BUFFER_GRAPHQL_ERROR');
            throw new BufferApiError(
                errorCode === 'UNAUTHORIZED'
                    ? 'Buffer API Key가 유효하지 않습니다.'
                    : String(first.message || 'Buffer API 요청에 실패했습니다.'),
                {
                    code: errorCode === 'UNAUTHORIZED' ? 'BUFFER_AUTH_INVALID' : errorCode,
                    status: Number(response?.status) || 0,
                    details: graphqlErrors
                }
            );
        }

        return response?.data?.data || {};
    }

    async listOrganizations(apiKey) {
        const data = await this.request(apiKey, `
            query GetOrganizations {
                account {
                    organizations {
                        id
                        name
                    }
                }
            }
        `);

        return (Array.isArray(data?.account?.organizations) ? data.account.organizations : [])
            .map(normalizeOrganization)
            .filter((item) => item.id);
    }

    async listChannels(apiKey, organizationId) {
        const normalizedOrganizationId = String(organizationId || '').trim();
        if (!normalizedOrganizationId) {
            throw new BufferApiError('Buffer Organization을 선택해 주세요.', {
                code: 'BUFFER_ORGANIZATION_REQUIRED'
            });
        }

        const data = await this.request(apiKey, `
            query GetChannels($organizationId: OrganizationId!) {
                channels(input: { organizationId: $organizationId }) {
                    id
                    name
                    displayName
                    service
                    avatar
                    externalLink
                    descriptor
                    isDisconnected
                    isLocked
                }
            }
        `, { organizationId: normalizedOrganizationId });

        return (Array.isArray(data?.channels) ? data.channels : [])
            .map(normalizeChannel)
            .filter((item) => item.id);
    }

    async inspectConnection(apiKey, organizationId = '') {
        const organizations = await this.listOrganizations(apiKey);
        if (organizations.length === 0) {
            throw new BufferApiError('Buffer Organization을 찾을 수 없습니다.', {
                code: 'BUFFER_ORGANIZATION_NOT_FOUND'
            });
        }

        const requestedOrganizationId = String(organizationId || '').trim();
        const selectedOrganizationId = requestedOrganizationId
            || (organizations.length === 1 ? organizations[0].id : '');

        if (selectedOrganizationId && !organizations.some((item) => item.id === selectedOrganizationId)) {
            throw new BufferApiError('선택한 Buffer Organization을 현재 API Key에서 찾을 수 없습니다.', {
                code: 'BUFFER_ORGANIZATION_NOT_FOUND'
            });
        }

        const channels = selectedOrganizationId
            ? await this.listChannels(apiKey, selectedOrganizationId)
            : [];

        return {
            organizations,
            organization_id: selectedOrganizationId,
            channels
        };
    }

    async listRecentPosts(apiKey, input = {}) {
        const organizationId = String(input.organizationId || '').trim();
        const channelIds = [...new Set((Array.isArray(input.channelIds) ? input.channelIds : [])
            .map((value) => String(value || '').trim())
            .filter(Boolean))];
        const startDate = String(input.startDate || '').trim();
        const first = Math.max(1, Math.min(50, Number.parseInt(input.first, 10) || 20));
        if (!organizationId) {
            throw new BufferApiError('최근 Buffer 게시물 조회에는 Organization ID가 필요합니다.', {
                code: 'BUFFER_ORGANIZATION_REQUIRED'
            });
        }
        if (channelIds.length === 0) return [];

        const data = await this.request(apiKey, `
            query GetRecentPosts(
                $organizationId: OrganizationId!,
                $channelIds: [ChannelId!],
                $startDate: DateTime,
                $first: Int
            ) {
                posts(
                    first: $first,
                    input: {
                        organizationId: $organizationId,
                        filter: {
                            channelIds: $channelIds,
                            status: [scheduled, sending, sent],
                            startDate: $startDate
                        },
                        sort: [{ field: createdAt, direction: desc }]
                    }
                ) {
                    edges {
                        node {
                            id
                            channelId
                            text
                            status
                            createdAt
                            sentAt
                            externalLink
                        }
                    }
                }
            }
        `, {
            organizationId,
            channelIds,
            startDate: startDate || null,
            first
        });

        return (Array.isArray(data?.posts?.edges) ? data.posts.edges : [])
            .map((edge) => normalizePost(edge?.node))
            .filter((post) => post.id && post.channelId);
    }

    async shareNowMany(apiKey, deliveries = []) {
        const normalized = (Array.isArray(deliveries) ? deliveries : [])
            .map(normalizePublishDelivery);
        if (normalized.length === 0) {
            return [];
        }
        if (normalized.length > 3) {
            throw new BufferApiError('Buffer 즉시 발행은 한 원문당 최대 3개 채널까지 지원합니다.', {
                code: 'BUFFER_CHANNEL_LIMIT_EXCEEDED'
            });
        }

        const variableDefinitions = normalized
            .map((_, index) => `$input${index}: CreatePostInput!`)
            .join(', ');
        const mutationFields = normalized
            .map((_, index) => `
                delivery${index}: createPost(input: $input${index}) {
                    __typename
                    ... on PostActionSuccess {
                        post {
                            id
                            channelId
                        }
                    }
                    ... on MutationError {
                        message
                    }
                }
            `)
            .join('\n');
        const variables = {};
        normalized.forEach((delivery, index) => {
            variables[`input${index}`] = {
                text: delivery.text,
                channelId: delivery.channelId,
                schedulingType: 'automatic',
                mode: 'shareNow',
                ...(delivery.imageUrl
                    ? { assets: [{ image: { url: delivery.imageUrl } }] }
                    : {})
            };
        });

        const data = await this.request(apiKey, `
            mutation ShareNowMany(${variableDefinitions}) {
                ${mutationFields}
            }
        `, variables);

        return normalized.map((delivery, index) => {
            const payload = data?.[`delivery${index}`] || {};
            const bufferPostId = String(payload?.post?.id || '').trim();
            if (bufferPostId) {
                return {
                    success: true,
                    deliveryKey: delivery.deliveryKey,
                    channelId: delivery.channelId,
                    bufferPostId
                };
            }
            return {
                success: false,
                deliveryKey: delivery.deliveryKey,
                channelId: delivery.channelId,
                code: 'BUFFER_POST_REJECTED',
                message: String(payload?.message || 'Buffer가 발행 요청을 거부했습니다.').trim(),
                retriable: false
            };
        });
    }
}

module.exports = {
    BufferClient,
    BufferApiError,
    normalizeOrganization,
    normalizeChannel,
    normalizePublishDelivery,
    normalizePost,
    isTransientBufferError
};
