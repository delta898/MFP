'use strict';

const MAX_DISTRIBUTION_CHANNELS = 3;

function createSnsDistributionSettingsError(code, message) {
    return Object.assign(new Error(message), { code });
}

function normalizeSnsDistributionSettings(requestBody = {}) {
    const values = requestBody.values && typeof requestBody.values === 'object' ? requestBody.values : {};
    const sourceBlogs = Array.isArray(values.SNS_SOURCE_BLOGS)
        ? values.SNS_SOURCE_BLOGS.map((value) => String(value || '').trim().toLowerCase())
            .filter((value) => ['naver', 'wordpress'].includes(value))
        : [];
    const channels = Array.isArray(values.BUFFER_CHANNELS)
        ? values.BUFFER_CHANNELS.map((channel) => ({
            id: String(channel?.id || channel?.channelId || '').trim(),
            name: String(channel?.name || channel?.displayName || channel?.display_name || '').trim(),
            displayName: String(channel?.displayName || channel?.display_name || channel?.name || '').trim(),
            service: String(channel?.service || '').trim().toLowerCase()
        })).filter((channel) => channel.id)
        : [];
    const uniqueChannels = Array.from(new Map(channels.map((channel) => [channel.id, channel])).values());
    if (uniqueChannels.length > MAX_DISTRIBUTION_CHANNELS) {
        throw createSnsDistributionSettingsError(
            'BUFFER_CHANNEL_LIMIT_EXCEEDED',
            `Buffer 채널은 최대 ${MAX_DISTRIBUTION_CHANNELS}개까지 선택할 수 있습니다.`
        );
    }
    return { scope: 'sns-distribution', fields: {
        SNS_PUBLISH_ENABLED: values.SNS_PUBLISH_ENABLED === true,
        SNS_SOURCE_BLOGS: Array.from(new Set(sourceBlogs)),
        BUFFER_ORGANIZATION_ID: String(values.BUFFER_ORGANIZATION_ID || '').trim(),
        BUFFER_CHANNELS: uniqueChannels
    } };
}

function createSnsDistributionSettingsApplication(deps = {}) {
    const { config = {}, configRepository, syncAutoRunnerWithConfig } = deps;

    function getSettings() {
        return { fields: {
            BUFFER_ORGANIZATION_ID: String(config.BUFFER_ORGANIZATION_ID || '').trim(),
            BUFFER_CHANNELS: Array.isArray(config.BUFFER_CHANNELS) ? config.BUFFER_CHANNELS : [],
            SNS_PUBLISH_ENABLED: config.SNS_PUBLISH_ENABLED === true,
            SNS_SOURCE_BLOGS: Array.isArray(config.SNS_SOURCE_BLOGS) ? config.SNS_SOURCE_BLOGS : []
        } };
    }

    async function save(requestBody = {}) {
        const { fields } = normalizeSnsDistributionSettings(requestBody);
        const { path, document } = configRepository.read();
        document.integrations = document.integrations && typeof document.integrations === 'object' ? document.integrations : {};
        document.automation = document.automation && typeof document.automation === 'object' ? document.automation : {};
        const currentBuffer = document.integrations.buffer && typeof document.integrations.buffer === 'object'
            ? document.integrations.buffer : {};
        const apiKey = currentBuffer.api_key || config.BUFFER_API_KEY || '';
        const enabled = fields.SNS_PUBLISH_ENABLED;
        if (enabled && !apiKey) throw createSnsDistributionSettingsError('BUFFER_CONNECTION_REQUIRED', 'Buffer 연결을 먼저 완료해 주세요.');
        if (enabled && !fields.BUFFER_ORGANIZATION_ID) throw createSnsDistributionSettingsError('BUFFER_ORGANIZATION_REQUIRED', 'Buffer 작업 공간을 선택해 주세요.');
        if (enabled && fields.BUFFER_CHANNELS.length === 0) throw createSnsDistributionSettingsError('BUFFER_CHANNEL_REQUIRED', '공유할 SNS 채널을 1개 이상 선택해 주세요.');
        if (enabled && fields.SNS_SOURCE_BLOGS.length === 0) throw createSnsDistributionSettingsError('SNS_SOURCE_BLOG_REQUIRED', '공유할 블로그를 1개 이상 선택해 주세요.');

        document.integrations.buffer = {
            ...currentBuffer,
            organization_id: fields.BUFFER_ORGANIZATION_ID,
            channels: fields.BUFFER_CHANNELS
        };
        document.automation.publish = document.automation.publish && typeof document.automation.publish === 'object'
            ? document.automation.publish : {};
        const currentSocial = document.automation.publish.social && typeof document.automation.publish.social === 'object'
            ? document.automation.publish.social : {};
        document.automation.publish.social = {
            ...currentSocial,
            enabled,
            source_blogs: fields.SNS_SOURCE_BLOGS
        };
        configRepository.write(path, document);

        Object.assign(config, {
            BUFFER_ORGANIZATION_ID: fields.BUFFER_ORGANIZATION_ID,
            BUFFER_CHANNELS: fields.BUFFER_CHANNELS,
            SNS_PUBLISH_ENABLED: enabled,
            SNS_SOURCE_BLOGS: fields.SNS_SOURCE_BLOGS,
            CONFIG_READY: true,
            CONFIG_SOURCE_TYPE: 'json',
            CONFIG_SOURCE_PATH: path
        });
        await syncAutoRunnerWithConfig?.();
        return { scope: 'sns-distribution', fields };
    }

    return { getSettings, save };
}

module.exports = {
    MAX_DISTRIBUTION_CHANNELS,
    normalizeSnsDistributionSettings,
    createSnsDistributionSettingsApplication
};
