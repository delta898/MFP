const { normalizeRegisterTopicParams, buildTopicRegistrationPreview } = require('../capabilities/content/register-topic');
const { normalizePublishParams, buildPublishRequestPreview } = require('../capabilities/content/publish');

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeExplicitParams(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)));
}

function buildRequestId(prefix, context = {}) {
    const conversationId = normalizeString(context?.conversation?.id || 'conversation');
    const messageId = normalizeString(context?.messageId || 'message');
    const stamp = Date.now();
    return `${prefix}:${conversationId}:${messageId}:${stamp}`;
}

function buildCanonicalRequest(intent, payload, context = {}) {
    return {
        request_id: buildRequestId(intent, context),
        conversation_id: normalizeString(context?.conversation?.id),
        channel: normalizeString(context?.channel || 'telegram'),
        user_id: normalizeString(context?.user?.id),
        mode: 'prepare',
        intent,
        payload,
        context_refs: {
            pending_plan_id: null,
            message_id: normalizeString(context?.messageId)
        }
    };
}

function cloneRequest(request) {
    if (!request || typeof request !== 'object') return null;
    return {
        ...request,
        context_refs: request.context_refs ? { ...request.context_refs } : {},
        payload: request.payload && typeof request.payload === 'object'
            ? JSON.parse(JSON.stringify(request.payload))
            : request.payload,
        preview: request.preview && typeof request.preview === 'object'
            ? JSON.parse(JSON.stringify(request.preview))
            : request.preview
    };
}

async function prepareRegisterPayload(registerParams = {}, context = {}, capabilityRegistry = null) {
    if (!capabilityRegistry || typeof capabilityRegistry.executeAction !== 'function') {
        return normalizeRegisterTopicParams(registerParams, context);
    }

    try {
        const prepared = await capabilityRegistry.executeAction({
            id: `prepare_register_${Date.now()}`,
            type: 'content.register',
            domain: 'content.register_topic',
            name: 'prepare',
            params: registerParams || {}
        }, context);

        if (prepared?.success && prepared?.data) {
            return normalizeRegisterTopicParams(prepared.data, context);
        }
    } catch (_error) {
        // Fallback to local normalization when prepare capability is unavailable.
    }

    return normalizeRegisterTopicParams(registerParams, context);
}

function resolvePublishPlatforms(publishParams = {}, registerPayload = null) {
    const rawTarget = normalizeString(publishParams?.target).toLowerCase();
    if (Array.isArray(publishParams?.platforms) && publishParams.platforms.length > 0) {
        return publishParams.platforms;
    }
    if (rawTarget === 'naver' || rawTarget === 'wordpress') {
        return [rawTarget];
    }
    if (Array.isArray(registerPayload?.platforms) && registerPayload.platforms.length > 0) {
        return registerPayload.platforms;
    }
    return [];
}

async function preparePublishPayload(publishParams = {}, registerPayload = null, context = {}, capabilityRegistry = null) {
    const publishSeed = {
        ...(publishParams || {}),
        platforms: resolvePublishPlatforms(publishParams, registerPayload),
        auto_trigger: publishParams?.auto_trigger !== false,
        settingsOverrides: {
            PUBLISH_AUTO_HEADLESS: true,
            ...((publishParams && publishParams.settingsOverrides) || {})
        },
        options: {
            post_status: registerPayload?.options?.post_status || publishParams?.options?.post_status,
            ...((publishParams && publishParams.options) || {})
        }
    };

    if (!capabilityRegistry || typeof capabilityRegistry.executeAction !== 'function') {
        return normalizePublishParams(publishSeed);
    }

    try {
        const prepared = await capabilityRegistry.executeAction({
            id: `prepare_publish_${Date.now()}`,
            type: 'content.publish',
            domain: 'content.publish',
            name: 'prepare',
            params: publishSeed
        }, context);

        if (prepared?.success && prepared?.data) {
            return normalizePublishParams(prepared.data);
        }
    } catch (_error) {
        // Fallback to local normalization when prepare capability is unavailable.
    }

    return normalizePublishParams(publishSeed);
}

function rebuildBundlePreviews(bundle = {}) {
    const nextBundle = {
        ...bundle,
        meta: {
            ...(bundle.meta || {}),
            explicit_params: normalizeExplicitParams(bundle.meta?.explicit_params)
        },
        ui: {
            show_publish_options: bundle.ui?.show_publish_options === true
        }
    };

    nextBundle.register_request = cloneRequest(bundle.register_request);
    nextBundle.publish_request = cloneRequest(bundle.publish_request);

    if (nextBundle.register_request?.payload) {
        nextBundle.register_request.preview = buildTopicRegistrationPreview(nextBundle.register_request.payload);
    }
    if (nextBundle.publish_request?.payload) {
        nextBundle.publish_request.preview = buildPublishRequestPreview(nextBundle.publish_request.payload);
    }

    return nextBundle;
}

async function mapLegacyTelegramContentRequest(parsedData = {}, context = {}, deps = {}) {
    const actions = Array.isArray(parsedData?.actions) ? parsedData.actions : [];
    const meta = parsedData?.meta && typeof parsedData.meta === 'object' ? parsedData.meta : {};
    const capabilityRegistry = deps.capabilityRegistry || null;

    const registerAction = actions.find((action) => String(action?.action || '').trim() === 'register_topic') || null;
    const publishAction = actions.find((action) => String(action?.action || '').trim() === 'publish_article') || null;

    const registerPayload = registerAction
        ? await prepareRegisterPayload(registerAction.params || {}, context, capabilityRegistry)
        : null;
    const publishPayload = publishAction
        ? await preparePublishPayload(publishAction.params || {}, registerPayload, context, capabilityRegistry)
        : null;

    return rebuildBundlePreviews({
        kind: 'content_request_bundle',
        bundle_id: buildRequestId('content_bundle', context),
        source: 'telegram_legacy_parser',
        register_request: registerPayload ? buildCanonicalRequest('content.register_topic', registerPayload, context) : null,
        publish_request: publishPayload ? buildCanonicalRequest('content.publish', publishPayload, context) : null,
        meta: {
            explicit_params: normalizeExplicitParams(meta.explicit_params)
        },
        ui: {
            show_publish_options: !!publishAction
        }
    });
}

function isCanonicalContentRequestBundle(value) {
    return value && typeof value === 'object' && value.kind === 'content_request_bundle';
}

function applyContentRequestToggle(bundle = {}, toggle = '') {
    if (!isCanonicalContentRequestBundle(bundle)) {
        return bundle;
    }

    const nextBundle = rebuildBundlePreviews(bundle);
    const registerPayload = nextBundle.register_request?.payload || null;
    const publishPayload = nextBundle.publish_request?.payload || null;
    const explicitParams = normalizeExplicitParams(nextBundle.meta?.explicit_params);

    if (toggle === 'toggle_image' && registerPayload) {
        registerPayload.options = { ...(registerPayload.options || {}) };
        registerPayload.options.image_gen = registerPayload.options.image_gen === false;
        explicitParams.push('image_gen');
    } else if (toggle === 'toggle_extref' && registerPayload) {
        registerPayload.options = { ...(registerPayload.options || {}) };
        registerPayload.options.external_reference = registerPayload.options.external_reference === false;
        explicitParams.push('external_reference');
    } else if (toggle === 'toggle_poststatus' && publishPayload) {
        publishPayload.options = { ...(publishPayload.options || {}) };
        publishPayload.options.post_status = publishPayload.options.post_status === 'draft' ? 'publish' : 'draft';
        if (registerPayload) {
            registerPayload.options = { ...(registerPayload.options || {}) };
            registerPayload.options.post_status = publishPayload.options.post_status;
        }
        explicitParams.push('post_status');
    } else if (toggle === 'toggle_autotrigger' && publishPayload && nextBundle.ui?.show_publish_options === true) {
        publishPayload.auto_trigger = publishPayload.auto_trigger === false;
    }

    nextBundle.meta.explicit_params = normalizeExplicitParams(explicitParams);
    return rebuildBundlePreviews(nextBundle);
}

function isPublishExecutionEnabled(bundle = {}) {
    if (!isCanonicalContentRequestBundle(bundle)) return false;
    const publishPayload = bundle.publish_request?.payload;
    if (!publishPayload || bundle.ui?.show_publish_options !== true) return false;
    return publishPayload.auto_trigger !== false;
}

module.exports = {
    mapLegacyTelegramContentRequest,
    isCanonicalContentRequestBundle,
    applyContentRequestToggle,
    isPublishExecutionEnabled
};
