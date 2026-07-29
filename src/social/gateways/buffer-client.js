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
}

module.exports = {
    BufferClient,
    BufferApiError,
    normalizeOrganization,
    normalizeChannel
};
