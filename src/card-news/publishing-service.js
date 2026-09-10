const fs = require('node:fs');
const path = require('node:path');
const { assertManualPublishAllowed } = require('../environment/runtime-effects');
const {
    SNS_SERVICE_POLICIES,
    SNS_SERVICE_ASSET_LIMITS,
    normalizeSnsService,
    measurePost
} = require('../social/sns-content-formatter');

const CARD_NEWS_CHANNEL_LIMITS = SNS_SERVICE_ASSET_LIMITS;
const MAX_CHANNELS = 3;
const STATUS_POLL_TIMEOUT_MS = 3 * 60 * 1000;
const STATUS_POLL_INTERVAL_MS = 5000;

function createPublishingError(status, code, message) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.apiCode = code;
    return error;
}

function normalizeChannel(item = {}) {
    const service = normalizeSnsService(item.service);
    const maxAssets = Number(CARD_NEWS_CHANNEL_LIMITS[service]) || 0;
    return {
        id: String(item.id || '').trim(),
        name: String(item.display_name || item.displayName || item.name || '').trim(),
        service,
        max_assets: maxAssets,
        supported: maxAssets > 0,
        is_disconnected: item.is_disconnected === true || item.isDisconnected === true,
        is_locked: item.is_locked === true || item.isLocked === true
    };
}

function normalizePublicImageUrl(value) {
    let parsed;
    try {
        parsed = new URL(String(value || '').trim());
    } catch (_error) {
        throw createPublishingError(502, 'CARD_NEWS_MEDIA_URL_INVALID', '이미지 전달 서비스가 올바른 공개 주소를 반환하지 않았습니다.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw createPublishingError(502, 'CARD_NEWS_MEDIA_URL_INVALID', 'Buffer 발행에는 공개 HTTPS 이미지 주소가 필요합니다.');
    }
    return parsed.toString();
}

function buildDefaultPublishText(generation = {}) {
    const caption = String(generation.publishing_copy?.caption || generation.title || '').trim();
    const sourceUrl = String(generation.source?.canonical_url || '').trim();
    const hashtags = (Array.isArray(generation.publishing_copy?.hashtags) ? generation.publishing_copy.hashtags : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join(' ');
    return [caption, sourceUrl, hashtags].filter(Boolean).join('\n\n');
}

function replaceExactSourceUrl(text, sourceUrl, replacementUrl) {
    const input = String(text || '');
    const source = String(sourceUrl || '').trim();
    if (!source) return { text: input, replaced: false };
    let cursor = 0;
    let output = '';
    let replaced = false;
    while (cursor < input.length) {
        const index = input.indexOf(source, cursor);
        if (index < 0) break;
        const before = index > 0 ? input[index - 1] : '';
        const afterIndex = index + source.length;
        const after = afterIndex < input.length ? input[afterIndex] : '';
        const startsAtBoundary = !before || /[\s([{"'<:]/u.test(before);
        const endsAtBoundary = !after || /[\s)\]}"'>,.;!?]/u.test(after);
        output += input.slice(cursor, index);
        if (startsAtBoundary && endsAtBoundary) {
            output += replacementUrl;
            replaced = true;
        } else {
            output += source;
        }
        cursor = afterIndex;
    }
    output += input.slice(cursor);
    return { text: output, replaced };
}

function createCardNewsPublishingService(options = {}) {
    const {
        CONFIG = {},
        generationService,
        bufferClient,
        mediaTransport,
        urlService,
        fileSystem = fs,
        pathApi = path,
        logger,
        now = () => Date.now(),
        sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        pollTimeoutMs = STATUS_POLL_TIMEOUT_MS,
        pollIntervalMs = STATUS_POLL_INTERVAL_MS
    } = options;
    if (!generationService?.resolveCompleteAssets) throw new Error('카드뉴스 결과 조회 기능이 필요합니다.');
    if (!bufferClient?.shareNowMany) throw new Error('Buffer 발행 기능이 필요합니다.');

    function configuredChannels() {
        return (Array.isArray(CONFIG.BUFFER_CHANNELS) ? CONFIG.BUFFER_CHANNELS : [])
            .map(normalizeChannel)
            .filter((channel) => channel.id);
    }

    function mediaTransportAvailable() {
        return Boolean(
            mediaTransport?.upload
            && mediaTransport?.remove
            && (typeof mediaTransport.isAvailable !== 'function' || mediaTransport.isAvailable())
        );
    }

    async function getConfig(generationId) {
        const { generation, assets } = generationService.resolveCompleteAssets(generationId);
        const cardCount = assets.length;
        const unsupportedAsset = assets.find((asset) => !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type));
        const aspectRatio = String(generation.settings?.aspect_ratio || '');
        const channels = configuredChannels().map((channel) => ({
            ...channel,
            compatible: channel.supported
                && !channel.is_disconnected
                && !channel.is_locked
                && cardCount <= channel.max_assets
                && !unsupportedAsset
                && !(channel.service === 'instagram' && aspectRatio === '9:16'),
            reason: !channel.supported
                ? '다중 이미지 발행을 지원하지 않는 채널입니다.'
                : (cardCount > channel.max_assets
                    ? `이 채널은 이미지를 최대 ${channel.max_assets}장까지 지원합니다.`
                    : (unsupportedAsset
                        ? 'Buffer 발행은 PNG, JPG 또는 WebP 카드만 지원합니다.'
                        : (channel.service === 'instagram' && aspectRatio === '9:16'
                            ? 'Instagram 다중 이미지 피드는 9:16 비율을 지원하지 않습니다.'
                            : (channel.is_disconnected || channel.is_locked ? 'Buffer에서 현재 사용할 수 없는 채널입니다.' : ''))))
        }));
        const config = {
            generation_id: generation.id,
            title: generation.title,
            source_url: String(generation.source?.canonical_url || ''),
            default_text: buildDefaultPublishText(generation),
            card_count: cardCount,
            max_channels: MAX_CHANNELS,
            buffer_configured: Boolean(String(CONFIG.BUFFER_API_KEY || '').trim() && channels.length > 0),
            media_transport: mediaTransportAvailable() ? String(mediaTransport.transport || 'public_media') : '',
            url_shortening_configured: urlService?.isConfigured?.() === true,
            channels
        };
        const ready = config.buffer_configured
            && Boolean(config.media_transport)
            && channels.some((channel) => channel.compatible);
        if (ready && config.default_text) {
            const prepared = await resolvePublishText(config.default_text, config.source_url);
            config.default_text = prepared.text;
            config.url_shortening = prepared.url_shortening;
        }
        return config;
    }

    async function resolvePublishText(text, sourceUrl) {
        const originalText = String(text || '').trim();
        const originalUrl = String(sourceUrl || '').trim();
        const match = replaceExactSourceUrl(originalText, originalUrl, originalUrl);
        if (!urlService?.isConfigured?.() || !match.replaced || typeof urlService?.shorten !== 'function') {
            return { text: originalText, source_url: originalUrl, url_shortening: 'not_applied' };
        }
        try {
            const shortenedUrl = String(await urlService.shorten(originalUrl) || '').trim();
            const parsed = new URL(shortenedUrl);
            if (!['http:', 'https:'].includes(parsed.protocol) || shortenedUrl === originalUrl) {
                return { text: originalText, source_url: originalUrl, url_shortening: 'fallback' };
            }
            return {
                text: replaceExactSourceUrl(originalText, originalUrl, shortenedUrl).text,
                source_url: shortenedUrl,
                url_shortening: 'shortened'
            };
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] URL 단축 실패, 원문 URL을 사용합니다: ${error.message}`);
            return { text: originalText, source_url: originalUrl, url_shortening: 'fallback' };
        }
    }

    function selectChannels(ids, cardCount) {
        const requested = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean))];
        if (!requested.length) throw createPublishingError(400, 'CARD_NEWS_CHANNEL_REQUIRED', '발행할 Buffer 채널을 선택해 주세요.');
        if (requested.length > MAX_CHANNELS) throw createPublishingError(400, 'CARD_NEWS_CHANNEL_LIMIT_EXCEEDED', `채널은 최대 ${MAX_CHANNELS}개까지 선택할 수 있습니다.`);
        const byId = new Map(configuredChannels().map((channel) => [channel.id, channel]));
        return requested.map((id) => {
            const channel = byId.get(id);
            if (!channel) throw createPublishingError(400, 'CARD_NEWS_CHANNEL_NOT_CONFIGURED', '설정에 저장되지 않은 Buffer 채널이 포함되어 있습니다.');
            if (channel.is_disconnected || channel.is_locked) throw createPublishingError(400, 'CARD_NEWS_CHANNEL_UNAVAILABLE', `${channel.name || channel.service} 채널은 현재 사용할 수 없습니다.`);
            if (!channel.supported) throw createPublishingError(400, 'CARD_NEWS_CHANNEL_UNSUPPORTED', `${channel.name || channel.service} 채널은 카드뉴스 다중 이미지 발행을 지원하지 않습니다.`);
            if (cardCount > channel.max_assets) throw createPublishingError(400, 'CARD_NEWS_CHANNEL_ASSET_LIMIT', `${channel.name || channel.service} 채널은 이미지를 최대 ${channel.max_assets}장까지 지원합니다.`);
            return channel;
        });
    }

    async function cleanupMedia(media) {
        if (!mediaTransport?.remove) return false;
        const results = await Promise.all((Array.isArray(media) ? media : []).map((item) => mediaTransport.remove(item)));
        return results.every((result) => result === true);
    }

    async function waitForTerminal(apiKey, results) {
        const accepted = results.filter((result) => result?.success && result.bufferPostId);
        if (!accepted.length || typeof bufferClient.getPostsByIds !== 'function') {
            return { all_terminal: accepted.length === 0, results };
        }
        const deadline = now() + Math.max(0, Number(pollTimeoutMs) || 0);
        const byId = new Map();
        while (true) {
            try {
                const posts = await bufferClient.getPostsByIds(apiKey, accepted.map((item) => item.bufferPostId));
                posts.forEach((post) => byId.set(String(post.id), post));
            } catch (error) {
                logger?.warn?.(`⚠️ [CardNews] Buffer 발행 상태 확인 재시도: ${error.message}`);
            }
            const complete = accepted.every((item) => ['sent', 'error'].includes(String(byId.get(String(item.bufferPostId))?.status || '')));
            if (complete) break;
            if (now() >= deadline) return { all_terminal: false, results };
            await sleep(Math.max(0, Number(pollIntervalMs) || 0));
        }
        return {
            all_terminal: true,
            results: results.map((result) => {
                if (!result?.success) return result;
                const post = byId.get(String(result.bufferPostId)) || {};
                return post.status === 'sent'
                    ? { ...result, status: 'sent', externalLink: String(post.externalLink || '') }
                    : { ...result, success: false, status: 'error', code: 'BUFFER_POST_PUBLISH_FAILED', message: String(post.error?.message || 'Buffer 게시물 발행에 실패했습니다.') };
            })
        };
    }

    async function publish(input = {}) {
        assertManualPublishAllowed(CONFIG);
        const apiKey = String(CONFIG.BUFFER_API_KEY || '').trim();
        if (!apiKey) throw createPublishingError(400, 'BUFFER_API_KEY_REQUIRED', '설정 > SNS에서 Buffer API Key를 먼저 저장해 주세요.');
        if (!mediaTransportAvailable()) throw createPublishingError(400, 'CARD_NEWS_GOOGLE_DRIVE_REQUIRED', 'Buffer에 카드 이미지를 전달하려면 설정에서 Google 계정을 연결해 주세요.');

        const { generation, assets } = generationService.resolveCompleteAssets(input.generation_id || input.generationId);
        const channels = selectChannels(input.channel_ids || input.channelIds, assets.length);
        const unsupportedAsset = assets.find((asset) => !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type));
        if (unsupportedAsset) throw createPublishingError(400, 'CARD_NEWS_ASSET_FORMAT_UNSUPPORTED', 'Buffer 발행은 PNG, JPG 또는 WebP 카드만 지원합니다.');
        if (String(generation.settings?.aspect_ratio || '') === '9:16' && channels.some((channel) => channel.service === 'instagram')) {
            throw createPublishingError(400, 'CARD_NEWS_INSTAGRAM_ASPECT_UNSUPPORTED', 'Instagram 다중 이미지 피드에는 1:1 또는 4:5 비율을 사용해 주세요.');
        }
        const requestedText = String(input.text || '').trim() || buildDefaultPublishText(generation);
        if (!requestedText) throw createPublishingError(400, 'CARD_NEWS_PUBLISH_TEXT_REQUIRED', '발행 문구를 입력해 주세요.');
        const sourceUrl = String(generation.source?.canonical_url || '').trim();
        const resolvedText = await resolvePublishText(requestedText, sourceUrl);
        const text = resolvedText.text;
        for (const channel of channels) {
            const length = measurePost(text, channel.service, resolvedText.source_url);
            const limit = Number(SNS_SERVICE_POLICIES[channel.service]?.limit) || 0;
            if (limit > 0 && length > limit) throw createPublishingError(400, 'CARD_NEWS_PUBLISH_TEXT_TOO_LONG', `${channel.name || channel.service} 채널의 글자 수 제한을 초과했습니다. (${length}/${limit}자)`);
        }

        const uploaded = [];
        try {
            for (const asset of assets) {
                const extension = pathApi.extname(asset.file_name).toLowerCase() || '.png';
                const media = await mediaTransport.upload({
                    buffer: fileSystem.readFileSync(asset.path),
                    file_name: `card-news-${generation.id}-${String(asset.index).padStart(2, '0')}${extension}`,
                    description: `${generation.title} ${asset.index}번째 카드`,
                    mime_type: asset.mime_type
                });
                if (!media?.id || !media?.url) throw createPublishingError(502, 'CARD_NEWS_MEDIA_UPLOAD_FAILED', `${asset.index}번째 이미지를 Google Drive에 임시 업로드하지 못했습니다.`);
                uploaded.push({ id: media.id, url: normalizePublicImageUrl(media.url) });
            }
        } catch (error) {
            await cleanupMedia(uploaded);
            throw error;
        }

        const imageUrls = uploaded.map((item) => item.url);
        let results;
        try {
            results = await bufferClient.shareNowMany(apiKey, channels.map((channel) => ({
                deliveryKey: channel.id,
                channelId: channel.id,
                text,
                imageUrls
            })));
        } catch (error) {
            if (String(error?.code || '') !== 'BUFFER_REQUEST_TIMEOUT') await cleanupMedia(uploaded);
            throw createPublishingError(
                String(error?.code || '') === 'BUFFER_REQUEST_TIMEOUT' ? 504 : 502,
                error?.code || 'CARD_NEWS_BUFFER_PUBLISH_FAILED',
                String(error?.code || '') === 'BUFFER_REQUEST_TIMEOUT'
                    ? 'Buffer 응답 시간이 초과되어 발행 여부를 확인하지 못했습니다. 중복 발행을 피하기 위해 즉시 다시 시도하지 마세요.'
                    : (error?.message || 'Buffer 발행에 실패했습니다.')
            );
        }

        const terminal = await waitForTerminal(apiKey, results);
        const cleanupSucceeded = terminal.all_terminal ? await cleanupMedia(uploaded) : false;
        const byChannel = new Map(terminal.results.map((result) => [String(result.channelId), result]));
        const normalizedResults = channels.map((channel) => {
            const result = byChannel.get(channel.id) || {};
            return {
                success: result.success === true,
                channel_id: channel.id,
                channel_name: channel.name,
                service: channel.service,
                buffer_post_id: String(result.bufferPostId || ''),
                status: String(result.status || ''),
                external_link: String(result.externalLink || ''),
                message: String(result.message || '')
            };
        });
        const successCount = normalizedResults.filter((result) => result.success).length;
        logger?.info?.(`✅ [CardNews] Buffer 발행 처리 완료: 성공 ${successCount}개, 실패 ${normalizedResults.length - successCount}개`);
        return {
            success: successCount === normalizedResults.length,
            confirmed: terminal.all_terminal,
            success_count: successCount,
            failure_count: normalizedResults.length - successCount,
            media_cleanup: { attempted: terminal.all_terminal, retained: !terminal.all_terminal || !cleanupSucceeded },
            url_shortening: resolvedText.url_shortening,
            results: normalizedResults
        };
    }

    return { getConfig, publish };
}

module.exports = {
    CARD_NEWS_CHANNEL_LIMITS,
    MAX_CHANNELS,
    createPublishingError,
    normalizeChannel,
    normalizePublicImageUrl,
    buildDefaultPublishText,
    replaceExactSourceUrl,
    createCardNewsPublishingService
};
