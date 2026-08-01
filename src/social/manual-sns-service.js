const {
    SNS_SERVICE_POLICIES,
    normalizeSnsService,
    isSnsServiceSupported,
    isSnsServiceDisabled,
    requiresImageAsset,
    measurePost
} = require('./sns-content-formatter');

const MAX_CHANNELS = 3;
const MAX_TEXT_LENGTH = 10000;

function createManualSnsError(status, code, message) {
    const error = new Error(message || '수동 SNS 요청을 처리하지 못했습니다.');
    error.status = Number.isInteger(status) ? status : 400;
    error.apiCode = String(code || 'MANUAL_SNS_ERROR');
    return error;
}

function normalizeConfiguredChannel(item = {}) {
    const service = normalizeSnsService(item.service);
    const policy = SNS_SERVICE_POLICIES[service] || null;
    return {
        id: String(item.id || '').trim(),
        name: String(item.display_name || item.displayName || item.name || '').trim(),
        service,
        avatar: String(item.avatar || '').trim(),
        is_disconnected: item.is_disconnected === true || item.isDisconnected === true,
        is_locked: item.is_locked === true || item.isLocked === true,
        supported: isSnsServiceSupported(service),
        disabled: isSnsServiceDisabled(service),
        limit: Number(policy?.limit) || 0,
        image_required: requiresImageAsset(service)
    };
}

function normalizeConfiguredChannels(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : [])
        .map(normalizeConfiguredChannel)
        .filter((channel) => {
            if (!channel.id || seen.has(channel.id)) return false;
            seen.add(channel.id);
            return true;
        })
        .slice(0, MAX_CHANNELS);
}

function normalizeSelectedChannelIds(value) {
    const source = Array.isArray(value) ? value : [];
    return [...new Set(source.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (_error) {
        throw createManualSnsError(400, 'MANUAL_SNS_IMAGE_URL_INVALID', '이미지 URL 형식이 올바르지 않습니다.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw createManualSnsError(400, 'MANUAL_SNS_IMAGE_URL_INVALID', '이미지는 인증 정보가 없는 공개 HTTPS URL만 사용할 수 있습니다.');
    }
    return parsed.toString();
}

function createManualSnsService(deps = {}) {
    const { CONFIG = {}, bufferClient, Logger } = deps;
    if (!bufferClient || typeof bufferClient.shareNowMany !== 'function') {
        throw new Error('Manual SNS Service에는 BufferClient가 필요합니다.');
    }

    function getChannels() {
        return normalizeConfiguredChannels(CONFIG.BUFFER_CHANNELS);
    }

    function getComposerConfig() {
        const channels = getChannels();
        return {
            configured: Boolean(String(CONFIG.BUFFER_API_KEY || '').trim() && channels.length > 0),
            channels
        };
    }

    async function publish(input = {}) {
        const apiKey = String(CONFIG.BUFFER_API_KEY || '').trim();
        if (!apiKey) {
            throw createManualSnsError(400, 'BUFFER_API_KEY_REQUIRED', '설정 > SNS에서 Buffer API Key를 먼저 저장해 주세요.');
        }

        const configuredChannels = getChannels();
        if (configuredChannels.length === 0) {
            throw createManualSnsError(400, 'BUFFER_CHANNEL_REQUIRED', '설정 > SNS에서 Buffer 채널을 먼저 선택해 주세요.');
        }

        const channelIds = normalizeSelectedChannelIds(input.channelIds || input.channel_ids);
        if (channelIds.length === 0) {
            throw createManualSnsError(400, 'MANUAL_SNS_CHANNEL_REQUIRED', '발행할 SNS 채널을 하나 이상 선택해 주세요.');
        }
        if (channelIds.length > MAX_CHANNELS) {
            throw createManualSnsError(400, 'BUFFER_CHANNEL_LIMIT_EXCEEDED', `SNS 채널은 최대 ${MAX_CHANNELS}개까지 선택할 수 있습니다.`);
        }

        const text = String(input.text || '').trim();
        if (!text) {
            throw createManualSnsError(400, 'MANUAL_SNS_TEXT_REQUIRED', '발행할 내용을 입력해 주세요.');
        }
        if (text.length > MAX_TEXT_LENGTH) {
            throw createManualSnsError(400, 'MANUAL_SNS_TEXT_TOO_LARGE', `발행 내용은 최대 ${MAX_TEXT_LENGTH.toLocaleString('ko-KR')}자까지 입력할 수 있습니다.`);
        }

        const imageUrl = normalizeImageUrl(input.imageUrl || input.image_url);
        const channelById = new Map(configuredChannels.map((channel) => [channel.id, channel]));
        const selectedChannels = channelIds.map((channelId) => {
            const channel = channelById.get(channelId);
            if (!channel) {
                throw createManualSnsError(400, 'MANUAL_SNS_CHANNEL_NOT_CONFIGURED', '설정에 저장되지 않은 Buffer 채널이 포함되어 있습니다.');
            }
            return channel;
        });

        for (const channel of selectedChannels) {
            const label = channel.name || channel.service || '선택한 채널';
            if (channel.is_disconnected || channel.is_locked) {
                throw createManualSnsError(400, 'MANUAL_SNS_CHANNEL_UNAVAILABLE', `${label} 채널은 현재 Buffer에서 사용할 수 없습니다.`);
            }
            if (!channel.supported) {
                throw createManualSnsError(
                    400,
                    channel.disabled ? 'SNS_SERVICE_DISABLED' : 'SNS_SERVICE_UNSUPPORTED',
                    `${label} 채널은 현재 수동 SNS 발행을 지원하지 않습니다.`
                );
            }
            if (channel.image_required && !imageUrl) {
                throw createManualSnsError(400, 'MANUAL_SNS_IMAGE_REQUIRED', `${label} 채널은 이미지 URL이 필요합니다.`);
            }
            const characterCount = measurePost(text, channel.service);
            if (characterCount > channel.limit) {
                throw createManualSnsError(
                    400,
                    'MANUAL_SNS_CONTENT_TOO_LONG',
                    `${label} 채널의 글자 수 제한을 ${characterCount - channel.limit}자 초과했습니다. (${characterCount}/${channel.limit}자)`
                );
            }
        }

        let publishResults;
        try {
            publishResults = await bufferClient.shareNowMany(apiKey, selectedChannels.map((channel) => ({
                deliveryKey: channel.id,
                channelId: channel.id,
                text,
                imageUrl
            })));
        } catch (error) {
            Logger?.warn?.(`⚠️ [MANUAL_SNS] Buffer 즉시 발행 실패: ${error?.message || 'unknown error'}`);
            throw createManualSnsError(
                error?.code === 'BUFFER_AUTH_INVALID' ? 401 : 502,
                error?.code || 'MANUAL_SNS_PUBLISH_FAILED',
                error?.message || 'Buffer 즉시 발행에 실패했습니다.'
            );
        }

        const resultByChannelId = new Map((Array.isArray(publishResults) ? publishResults : [])
            .map((result) => [String(result.channelId || '').trim(), result]));
        const results = selectedChannels.map((channel) => {
            const result = resultByChannelId.get(channel.id) || {};
            return {
                success: result.success === true,
                channel_id: channel.id,
                channel_name: channel.name,
                service: channel.service,
                buffer_post_id: String(result.bufferPostId || '').trim(),
                code: String(result.code || '').trim(),
                message: String(result.message || '').trim()
            };
        });
        const successCount = results.filter((result) => result.success).length;
        const failureCount = results.length - successCount;
        Logger?.info?.(`✅ [MANUAL_SNS] 즉시 발행 완료: 성공 ${successCount}개, 실패 ${failureCount}개`);
        return {
            success: failureCount === 0,
            success_count: successCount,
            failure_count: failureCount,
            results
        };
    }

    return {
        getComposerConfig,
        publish
    };
}

module.exports = {
    MAX_CHANNELS,
    MAX_TEXT_LENGTH,
    createManualSnsError,
    normalizeConfiguredChannel,
    normalizeConfiguredChannels,
    normalizeImageUrl,
    createManualSnsService
};
