const {
    buildContentRequestBundle,
    cloneContentRequestBundle,
    normalizeExplicitParams,
    validateContentRequestBundle
} = require('./content-request-schema');
const { normalizeRegisterTopicParams, buildTopicRegistrationPreview } = require('../capabilities/content/register-topic');
const { normalizePublishParams, buildPublishRequestPreview } = require('../capabilities/content/publish');

function normalizeString(value) {
    return String(value || '').trim();
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

function rebuildContentRequestBundle(input = {}) {
    const bundle = cloneContentRequestBundle(input);
    bundle.meta.explicit_params = normalizeExplicitParams(bundle.meta?.explicit_params);

    if (bundle.register_request?.payload) {
        bundle.register_request.preview = buildTopicRegistrationPreview(bundle.register_request.payload);
    }
    if (bundle.publish_request?.payload) {
        bundle.publish_request.preview = buildPublishRequestPreview(bundle.publish_request.payload);
    }

    return bundle;
}

async function prepareContentRequestBundle(input = {}, context = {}, deps = {}) {
    const capabilityRegistry = deps.capabilityRegistry || null;
    const initialBundle = buildContentRequestBundle(input, context);
    const registerPayload = initialBundle.register_request?.payload
        ? await prepareRegisterPayload(initialBundle.register_request.payload, context, capabilityRegistry)
        : null;
    const publishPayload = initialBundle.publish_request?.payload
        ? await preparePublishPayload(initialBundle.publish_request.payload, registerPayload, context, capabilityRegistry)
        : null;

    const preparedBundle = rebuildContentRequestBundle({
        ...initialBundle,
        register_request: initialBundle.register_request
            ? {
                ...initialBundle.register_request,
                payload: registerPayload
            }
            : null,
        publish_request: initialBundle.publish_request
            ? {
                ...initialBundle.publish_request,
                payload: publishPayload
            }
            : null
    });

    const validation = validateContentRequestBundle(preparedBundle);
    if (!validation.ok) {
        const error = new Error(validation.errors.join(' '));
        error.validation = validation;
        throw error;
    }

    return preparedBundle;
}

function isPublishExecutionEnabled(bundle = {}) {
    const publishPayload = bundle?.publish_request?.payload || null;
    if (!publishPayload) return false;
    if (bundle?.ui?.show_publish_options !== true) return false;
    return publishPayload.auto_trigger !== false;
}

function buildContentExecutionActions(bundle = {}) {
    const actions = [];

    if (bundle?.register_request?.payload) {
        actions.push({
            id: `${bundle.bundle_id}:register`,
            type: 'content.register',
            domain: 'content.register_topic',
            name: 'execute',
            params: bundle.register_request.payload,
            requires_confirmation: true
        });
    }

    if (bundle?.publish_request?.payload && isPublishExecutionEnabled(bundle)) {
        actions.push({
            id: `${bundle.bundle_id}:publish`,
            type: 'content.publish',
            domain: 'content.publish',
            name: 'execute',
            params: bundle.publish_request.payload,
            requires_confirmation: true
        });
    }

    return actions;
}

function buildContentPreviewItems(bundle = {}) {
    const previews = [];

    if (bundle?.register_request?.preview) {
        previews.push({
            action_id: `${bundle.bundle_id}:register`,
            capability_id: 'content.register_topic.execute',
            preview: bundle.register_request.preview
        });
    }

    if (bundle?.publish_request?.preview) {
        previews.push({
            action_id: `${bundle.bundle_id}:publish`,
            capability_id: 'content.publish.execute',
            preview: bundle.publish_request.preview
        });
    }

    return previews;
}

function deriveContentRequestGoal(bundle = {}) {
    const theme = normalizeString(bundle?.register_request?.payload?.theme);
    const hasRegister = !!bundle?.register_request;
    const hasPublish = isPublishExecutionEnabled(bundle);

    if (hasRegister && hasPublish) {
        return theme ? `${theme} 글감을 등록하고 발행합니다.` : '글감을 등록하고 발행합니다.';
    }
    if (hasRegister) {
        return theme ? `${theme} 글감을 등록합니다.` : '글감을 등록합니다.';
    }
    if (hasPublish) {
        return '발행을 실행합니다.';
    }
    if (bundle?.publish_request) {
        return '발행 요청을 준비합니다.';
    }
    return 'content 요청을 준비합니다.';
}

module.exports = {
    prepareContentRequestBundle,
    rebuildContentRequestBundle,
    buildContentExecutionActions,
    buildContentPreviewItems,
    deriveContentRequestGoal,
    isPublishExecutionEnabled
};
