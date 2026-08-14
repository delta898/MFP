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
const BUFFER_STATUS_POLL_TIMEOUT_MS = 3 * 60 * 1000;
const BUFFER_STATUS_POLL_INTERVAL_MS = 5000;
const BUFFER_RECOVERY_MAX_ATTEMPTS = 3;
const BUFFER_RECOVERY_INTERVAL_MS = 5000;

const IMAGE_MIME_BY_EXT = Object.freeze({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
});

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
    const {
        CONFIG = {},
        bufferClient,
        aiService,
        Logger,
        parseImagePayload,
        createWordPressClient,
        sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now = () => Date.now(),
        pollTimeoutMs = BUFFER_STATUS_POLL_TIMEOUT_MS,
        pollIntervalMs = BUFFER_STATUS_POLL_INTERVAL_MS,
        recoveryMaxAttempts = BUFFER_RECOVERY_MAX_ATTEMPTS,
        recoveryIntervalMs = BUFFER_RECOVERY_INTERVAL_MS,
        recordActivityLifecycle = async () => null
    } = deps;
    if (!bufferClient || typeof bufferClient.shareNowMany !== 'function') {
        throw new Error('Manual SNS Service에는 BufferClient가 필요합니다.');
    }

    function getChannels() {
        return normalizeConfiguredChannels(CONFIG.BUFFER_CHANNELS);
    }

    function isWordPressMediaAvailable() {
        return Boolean(
            String(CONFIG.WORDPRESS_URL || '').trim()
            && String(CONFIG.WORDPRESS_USER_ID || '').trim()
            && String(CONFIG.WORDPRESS_APP_PASSWORD || '').trim()
            && typeof parseImagePayload === 'function'
            && typeof createWordPressClient === 'function'
        );
    }

    function getComposerConfig() {
        const channels = getChannels();
        const ai = typeof aiService?.getManualOptimizationAvailability === 'function'
            ? aiService.getManualOptimizationAvailability()
            : { available: false, model_name: '' };
        return {
            configured: Boolean(String(CONFIG.BUFFER_API_KEY || '').trim() && channels.length > 0),
            local_media_available: isWordPressMediaAvailable(),
            channels,
            ai
        };
    }

    function resolveSelectedChannels(input = {}) {
        const configuredChannels = getChannels();
        if (configuredChannels.length === 0) {
            throw createManualSnsError(400, 'BUFFER_CHANNEL_REQUIRED', '설정 > SNS에서 Buffer 채널을 먼저 선택해 주세요.');
        }

        const channelIds = normalizeSelectedChannelIds(input.channelIds || input.channel_ids);
        if (channelIds.length === 0) {
            throw createManualSnsError(400, 'MANUAL_SNS_CHANNEL_REQUIRED', 'SNS 채널을 하나 이상 선택해 주세요.');
        }
        if (channelIds.length > MAX_CHANNELS) {
            throw createManualSnsError(400, 'BUFFER_CHANNEL_LIMIT_EXCEEDED', `SNS 채널은 최대 ${MAX_CHANNELS}개까지 선택할 수 있습니다.`);
        }

        const channelById = new Map(configuredChannels.map((channel) => [channel.id, channel]));
        return channelIds.map((channelId) => {
            const channel = channelById.get(channelId);
            if (!channel) {
                throw createManualSnsError(400, 'MANUAL_SNS_CHANNEL_NOT_CONFIGURED', '설정에 저장되지 않은 Buffer 채널이 포함되어 있습니다.');
            }
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
            return channel;
        });
    }

    async function optimize(input = {}) {
        if (typeof aiService?.optimizeManualPost !== 'function') {
            throw createManualSnsError(400, 'MANUAL_SNS_AI_UNAVAILABLE', '설정에서 Chat Model을 먼저 구성해 주세요.');
        }
        const text = String(input.text || '').trim();
        if (!text) {
            throw createManualSnsError(400, 'MANUAL_SNS_TEXT_REQUIRED', 'AI로 다듬을 내용을 입력해 주세요.');
        }
        if (text.length > MAX_TEXT_LENGTH) {
            throw createManualSnsError(400, 'MANUAL_SNS_TEXT_TOO_LARGE', `AI 최적화 원문은 최대 ${MAX_TEXT_LENGTH.toLocaleString('ko-KR')}자까지 입력할 수 있습니다.`);
        }

        const selectedChannels = resolveSelectedChannels(input);
        const maxLength = Math.min(...selectedChannels
            .map((channel) => Number(channel.limit || 0))
            .filter((limit) => limit > 0));
        try {
            const result = await aiService.optimizeManualPost({
                text,
                maxLength: Number.isFinite(maxLength) ? maxLength : MAX_TEXT_LENGTH,
                services: selectedChannels.map((channel) => channel.service)
            });
            return {
                success: true,
                optimized_text: String(result?.text || '').trim(),
                model_name: String(result?.model_name || '').trim(),
                max_length: Number(result?.max_length) || maxLength,
                within_limit: result?.within_limit === true
            };
        } catch (error) {
            Logger?.warn?.(`⚠️ [MANUAL_SNS] AI 최적화 실패: ${error?.message || 'unknown error'}`);
            const unavailable = error?.code === 'CHAT_MODEL_UNAVAILABLE';
            throw createManualSnsError(
                unavailable ? 400 : 502,
                unavailable ? 'MANUAL_SNS_AI_UNAVAILABLE' : (error?.code || 'MANUAL_SNS_AI_FAILED'),
                error?.message || 'SNS 글 AI 최적화에 실패했습니다.'
            );
        }
    }

    async function waitForTerminalPosts(apiKey, publishResults) {
        const accepted = (Array.isArray(publishResults) ? publishResults : [])
            .filter((result) => result?.success === true && String(result.bufferPostId || '').trim());
        if (accepted.length === 0) {
            return { results: publishResults, allTerminal: true };
        }
        if (typeof bufferClient.getPostsByIds !== 'function') {
            return { results: publishResults, allTerminal: false };
        }

        const postIds = accepted.map((result) => String(result.bufferPostId).trim());
        const postById = new Map();
        const deadline = now() + Math.max(0, Number(pollTimeoutMs) || 0);

        while (true) {
            try {
                const posts = await bufferClient.getPostsByIds(apiKey, postIds);
                (Array.isArray(posts) ? posts : []).forEach((post) => {
                    const id = String(post?.id || '').trim();
                    if (id) postById.set(id, post);
                });
            } catch (error) {
                Logger?.warn?.(`⚠️ [MANUAL_SNS] Buffer 게시 상태 확인 재시도: ${error?.message || 'unknown error'}`);
            }

            const allTerminal = postIds.every((postId) => {
                const status = String(postById.get(postId)?.status || '').trim().toLowerCase();
                return status === 'sent' || status === 'error';
            });
            if (allTerminal) {
                return {
                    allTerminal: true,
                    results: publishResults.map((result) => {
                        if (result?.success !== true) return result;
                        const post = postById.get(String(result.bufferPostId || '').trim()) || {};
                        if (post.status === 'sent') {
                            return {
                                ...result,
                                status: 'sent',
                                externalLink: String(post.externalLink || '').trim()
                            };
                        }
                        return {
                            ...result,
                            success: false,
                            status: 'error',
                            code: 'BUFFER_POST_PUBLISH_FAILED',
                            message: String(post.error?.message || 'Buffer 게시물 발행에 실패했습니다.').trim()
                        };
                    })
                };
            }
            if (now() >= deadline) break;
            await sleep(Math.max(0, Number(pollIntervalMs) || 0));
        }

        return {
            allTerminal: false,
            results: publishResults.map((result) => {
                if (result?.success !== true) return result;
                const post = postById.get(String(result.bufferPostId || '').trim()) || {};
                if (post.status === 'sent') return { ...result, status: 'sent' };
                if (post.status === 'error') {
                    return {
                        ...result,
                        success: false,
                        status: 'error',
                        code: 'BUFFER_POST_PUBLISH_FAILED',
                        message: String(post.error?.message || 'Buffer 게시물 발행에 실패했습니다.').trim()
                    };
                }
                return {
                    ...result,
                    success: false,
                    status: String(post.status || 'unknown').trim().toLowerCase(),
                    code: 'BUFFER_POST_STATUS_TIMEOUT',
                    message: 'Buffer 발행 상태 확인 시간이 초과되었습니다.'
                };
            })
        };
    }

    async function recoverTimedOutPublish(apiKey, selectedChannels, text, startedAt) {
        const organizationId = String(CONFIG.BUFFER_ORGANIZATION_ID || '').trim();
        if (!organizationId || typeof bufferClient.listRecentPosts !== 'function') return null;

        const startedAtMs = Date.parse(String(startedAt || ''));
        const startDate = new Date(
            (Number.isFinite(startedAtMs) ? startedAtMs : now()) - (5 * 60 * 1000)
        ).toISOString();
        const attempts = Math.max(1, Number.parseInt(recoveryMaxAttempts, 10) || 1);
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                const posts = await bufferClient.listRecentPosts(apiKey, {
                    organizationId,
                    channelIds: selectedChannels.map((channel) => channel.id),
                    startDate,
                    first: 50
                });
                const postByKey = new Map();
                for (const post of Array.isArray(posts) ? posts : []) {
                    const key = `${String(post?.channelId || '').trim()}\n${String(post?.text || '').trim()}`;
                    if (!postByKey.has(key) && post?.id) postByKey.set(key, post);
                }
                const recovered = selectedChannels.map((channel) => {
                    const post = postByKey.get(`${channel.id}\n${text}`);
                    if (!post?.id) return null;
                    return {
                        success: true,
                        deliveryKey: channel.id,
                        channelId: channel.id,
                        bufferPostId: String(post.id).trim(),
                        reconciled: true
                    };
                });
                if (recovered.every(Boolean)) return recovered;
                Logger?.warn?.(`⚠️ [MANUAL_SNS] Buffer 타임아웃 복구 대기 (${attempt}/${attempts})`);
            } catch (error) {
                Logger?.warn?.(`⚠️ [MANUAL_SNS] Buffer 타임아웃 복구 조회 실패 (${attempt}/${attempts}): ${error?.message || 'unknown error'}`);
            }
            if (attempt < attempts) await sleep(Math.max(0, Number(recoveryIntervalMs) || 0));
        }
        return null;
    }

    async function publish(input = {}) {
        const apiKey = String(CONFIG.BUFFER_API_KEY || '').trim();
        if (!apiKey) {
            throw createManualSnsError(400, 'BUFFER_API_KEY_REQUIRED', '설정 > SNS에서 Buffer API Key를 먼저 저장해 주세요.');
        }

        const text = String(input.text || '').trim();
        if (!text) {
            throw createManualSnsError(400, 'MANUAL_SNS_TEXT_REQUIRED', '발행할 내용을 입력해 주세요.');
        }
        if (text.length > MAX_TEXT_LENGTH) {
            throw createManualSnsError(400, 'MANUAL_SNS_TEXT_TOO_LARGE', `발행 내용은 최대 ${MAX_TEXT_LENGTH.toLocaleString('ko-KR')}자까지 입력할 수 있습니다.`);
        }

        const requestedImageUrl = normalizeImageUrl(input.imageUrl || input.image_url);
        const localImage = input.localImage || input.local_image || null;
        if (requestedImageUrl && localImage) {
            throw createManualSnsError(400, 'MANUAL_SNS_IMAGE_SOURCE_CONFLICT', '이미지 URL과 로컬 이미지는 동시에 사용할 수 없습니다.');
        }
        if (localImage && !isWordPressMediaAvailable()) {
            throw createManualSnsError(400, 'MANUAL_SNS_WORDPRESS_REQUIRED', '로컬 이미지를 사용하려면 설정 > 블로그에서 WordPress 연결 정보를 먼저 저장해 주세요.');
        }
        const selectedChannels = resolveSelectedChannels(input);
        const operationId = String(input.requestId || input.request_id || '').trim() || `manual-sns-${now()}`;

        for (const channel of selectedChannels) {
            const label = channel.name || channel.service || '선택한 채널';
            if (channel.image_required && !requestedImageUrl && !localImage) {
                throw createManualSnsError(400, 'MANUAL_SNS_IMAGE_REQUIRED', `${label} 채널은 이미지가 필요합니다.`);
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

        await recordActivityLifecycle({
            domain: 'sns',
            stage: 'selected',
            subject: text,
            source: 'manual-sns',
            entity_ref: operationId,
            evidence_id: `${operationId}:sns:selected`,
            metadata: {
                channels: selectedChannels.map((channel) => ({
                    id: channel.id,
                    service: channel.service
                }))
            }
        });

        let imageUrl = requestedImageUrl;
        let temporaryMedia = null;
        let wordpressClient = null;
        if (localImage) {
            let parsedImage;
            try {
                parsedImage = parseImagePayload({ ...localImage });
            } catch (error) {
                throw createManualSnsError(400, 'MANUAL_SNS_LOCAL_IMAGE_INVALID', error?.message || '로컬 이미지 파일을 확인해 주세요.');
            }
            const ext = String(parsedImage?.ext || '').trim().toLowerCase();
            const mimeType = IMAGE_MIME_BY_EXT[ext];
            if (!mimeType) {
                throw createManualSnsError(400, 'MANUAL_SNS_LOCAL_IMAGE_INVALID', '지원하지 않는 이미지 형식입니다.');
            }
            wordpressClient = createWordPressClient();
            if (
                !wordpressClient
                || typeof wordpressClient.uploadMedia !== 'function'
                || typeof wordpressClient.deleteMedia !== 'function'
                || !wordpressClient.isConfigured?.()
            ) {
                throw createManualSnsError(400, 'MANUAL_SNS_WORDPRESS_REQUIRED', 'WordPress 연결 정보를 확인해 주세요.');
            }
            const fileName = `manual-sns-${now()}${ext}`;
            try {
                temporaryMedia = await wordpressClient.uploadMedia(parsedImage.buffer, fileName, 'SNS 임시 이미지', mimeType);
            } catch (error) {
                Logger?.warn?.(`⚠️ [MANUAL_SNS] WordPress 임시 이미지 업로드 실패: ${error?.message || 'unknown error'}`);
                temporaryMedia = null;
            }
            if (!temporaryMedia?.id || !temporaryMedia?.url) {
                if (temporaryMedia?.id && typeof wordpressClient.deleteMedia === 'function') {
                    await wordpressClient.deleteMedia(temporaryMedia.id);
                }
                throw createManualSnsError(
                    502,
                    'MANUAL_SNS_WORDPRESS_UPLOAD_FAILED',
                    'WordPress에 이미지를 업로드하지 못했습니다. 이미지 URL을 사용하거나 이미지를 제거한 후 다시 발행해 주세요.'
                );
            }
            try {
                imageUrl = normalizeImageUrl(temporaryMedia.url);
            } catch (_error) {
                if (typeof wordpressClient.deleteMedia === 'function') {
                    await wordpressClient.deleteMedia(temporaryMedia.id);
                }
                throw createManualSnsError(
                    502,
                    'MANUAL_SNS_WORDPRESS_MEDIA_URL_INVALID',
                    'WordPress가 공개 HTTPS 이미지 URL을 반환하지 않았습니다. WordPress 사이트 주소를 확인해 주세요.'
                );
            }
        }

        let publishResults;
        const publishStartedAt = new Date(now()).toISOString();
        try {
            publishResults = await bufferClient.shareNowMany(apiKey, selectedChannels.map((channel) => ({
                deliveryKey: channel.id,
                channelId: channel.id,
                text,
                imageUrl
            })));
        } catch (error) {
            const requestTimedOut = String(error?.code || '').trim() === 'BUFFER_REQUEST_TIMEOUT';
            if (requestTimedOut) {
                publishResults = await recoverTimedOutPublish(apiKey, selectedChannels, text, publishStartedAt);
            }
            if (publishResults) {
                Logger?.info?.('✅ [MANUAL_SNS] Buffer 응답 유실 게시물을 최근 게시물 조회로 복구했습니다.');
            } else {
                if (!requestTimedOut && temporaryMedia?.id && typeof wordpressClient?.deleteMedia === 'function') {
                    await wordpressClient.deleteMedia(temporaryMedia.id);
                }
                Logger?.warn?.(`⚠️ [MANUAL_SNS] Buffer 즉시 발행 실패: ${error?.message || 'unknown error'}`);
                throw createManualSnsError(
                    error?.code === 'BUFFER_AUTH_INVALID' ? 401 : requestTimedOut ? 504 : 502,
                    error?.code || 'MANUAL_SNS_PUBLISH_FAILED',
                    requestTimedOut && temporaryMedia?.id
                        ? 'Buffer 응답 시간이 초과되어 발행 여부를 확인하지 못했습니다. 중복 발행 방지를 위해 즉시 다시 시도하지 마세요. 임시 이미지는 WordPress 미디어에 남겨두었습니다.'
                        : error?.message || 'Buffer 즉시 발행에 실패했습니다.'
                );
            }
        }


        let allTerminal = true;
        let cleanupSucceeded = false;
        if (temporaryMedia?.id) {
            const reconciliation = await waitForTerminalPosts(apiKey, publishResults);
            publishResults = reconciliation.results;
            allTerminal = reconciliation.allTerminal;
            if (allTerminal && typeof wordpressClient?.deleteMedia === 'function') {
                cleanupSucceeded = await wordpressClient.deleteMedia(temporaryMedia.id) === true;
            }
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
                status: String(result.status || '').trim(),
                external_link: String(result.externalLink || '').trim(),
                code: String(result.code || '').trim(),
                message: String(result.message || '').trim()
            };
        });
        const successCount = results.filter((result) => result.success).length;
        const failureCount = results.length - successCount;
        for (const result of results) {
            if (!result.success) continue;
            const resultIdentity = result.buffer_post_id || `${operationId}:${result.channel_id}`;
            await recordActivityLifecycle({
                domain: 'sns',
                stage: 'published',
                subject: text,
                source: 'manual-sns',
                entity_ref: operationId,
                platform: result.service,
                result_ref: result.external_link || result.buffer_post_id,
                evidence_id: `manual-sns:${resultIdentity}:published`,
                metadata: {
                    channel_id: result.channel_id,
                    channel_name: result.channel_name,
                    buffer_status: result.status
                }
            });
        }
        Logger?.info?.(`✅ [MANUAL_SNS] 즉시 발행 완료: 성공 ${successCount}개, 실패 ${failureCount}개`);
        return {
            success: failureCount === 0,
            success_count: successCount,
            failure_count: failureCount,
            media_cleanup: temporaryMedia?.id
                ? { attempted: allTerminal, retained: !allTerminal || !cleanupSucceeded }
                : null,
            results
        };
    }

    return {
        getComposerConfig,
        optimize,
        publish
    };
}

module.exports = {
    MAX_CHANNELS,
    MAX_TEXT_LENGTH,
    BUFFER_STATUS_POLL_TIMEOUT_MS,
    BUFFER_STATUS_POLL_INTERVAL_MS,
    createManualSnsError,
    normalizeConfiguredChannel,
    normalizeConfiguredChannels,
    normalizeImageUrl,
    createManualSnsService
};
