const {
    cloneContentRequestBundle,
    normalizeExplicitParams,
    validateContentRequestBundle
} = require('../internal-api/content-request-schema');
const {
    prepareContentRequestBundle,
    rebuildContentRequestBundle,
    isPublishExecutionEnabled
} = require('../internal-api/content-request-builder');

function isCanonicalContentRequestBundle(value) {
    const validation = validateContentRequestBundle(value);
    return validation.ok;
}

async function mapLegacyTelegramContentRequest(parsedData = {}, context = {}, deps = {}) {
    const actions = Array.isArray(parsedData?.actions) ? parsedData.actions : [];
    const meta = parsedData?.meta && typeof parsedData.meta === 'object' ? parsedData.meta : {};
    const registerAction = actions.find((action) => String(action?.action || '').trim() === 'register_topic') || null;
    const publishAction = actions.find((action) => String(action?.action || '').trim() === 'publish_article') || null;

    return prepareContentRequestBundle({
        source: 'telegram_legacy_parser',
        register_request: registerAction ? {
            intent: 'content.register_topic',
            payload: registerAction.params || {}
        } : null,
        publish_request: publishAction ? {
            intent: 'content.publish',
            payload: publishAction.params || {}
        } : null,
        meta: {
            explicit_params: normalizeExplicitParams(meta.explicit_params)
        },
        ui: {
            show_publish_options: !!publishAction
        }
    }, context, {
        capabilityRegistry: deps.capabilityRegistry || null
    });
}

function applyContentRequestToggle(bundle = {}, toggle = '') {
    if (!isCanonicalContentRequestBundle(bundle)) {
        return bundle;
    }

    const nextBundle = cloneContentRequestBundle(bundle);
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
    return rebuildContentRequestBundle(nextBundle);
}

module.exports = {
    mapLegacyTelegramContentRequest,
    isCanonicalContentRequestBundle,
    applyContentRequestToggle,
    isPublishExecutionEnabled
};
