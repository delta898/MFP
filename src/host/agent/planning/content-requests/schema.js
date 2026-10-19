const CONTENT_REQUEST_INTENTS = new Set([
    'content.register_topic',
    'content.publish'
]);

const CONTENT_REQUEST_MODES = new Set([
    'prepare',
    'execute'
]);

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeExplicitParams(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => normalizeString(item)).filter(Boolean)));
}

function buildRequestId(prefix, context = {}) {
    const conversationId = normalizeString(context?.conversation_id || context?.conversation?.id || 'conversation');
    const messageId = normalizeString(context?.message_id || context?.messageId || 'message');
    return `${prefix}:${conversationId}:${messageId}:${Date.now()}`;
}

function normalizeCanonicalRequest(input = {}) {
    return {
        request_id: normalizeString(input.request_id),
        conversation_id: normalizeString(input.conversation_id),
        channel: normalizeString(input.channel || 'telegram') || 'telegram',
        user_id: normalizeString(input.user_id),
        mode: normalizeString(input.mode || 'prepare') || 'prepare',
        intent: normalizeString(input.intent),
        payload: normalizeObject(input.payload),
        context_refs: {
            pending_plan_id: normalizeString(input.context_refs?.pending_plan_id),
            message_id: normalizeString(input.context_refs?.message_id)
        },
        preview: input.preview && typeof input.preview === 'object' ? JSON.parse(JSON.stringify(input.preview)) : null
    };
}

function buildCanonicalContentRequest(input = {}, context = {}) {
    return normalizeCanonicalRequest({
        request_id: normalizeString(input.request_id) || buildRequestId(normalizeString(input.intent || 'content.request'), context),
        conversation_id: normalizeString(input.conversation_id || context?.conversation_id || context?.conversation?.id),
        channel: normalizeString(input.channel || context?.channel || 'telegram') || 'telegram',
        user_id: normalizeString(input.user_id || context?.user_id || context?.user?.id),
        mode: normalizeString(input.mode || 'prepare') || 'prepare',
        intent: normalizeString(input.intent),
        payload: normalizeObject(input.payload),
        context_refs: {
            pending_plan_id: normalizeString(input.context_refs?.pending_plan_id),
            message_id: normalizeString(input.context_refs?.message_id || context?.message_id || context?.messageId)
        },
        preview: input.preview || null
    });
}

function validateCanonicalRequest(input = {}) {
    const request = normalizeCanonicalRequest(input);
    const errors = [];

    if (!request.request_id) errors.push('request.request_id가 필요합니다.');
    if (!request.intent) errors.push('request.intent가 필요합니다.');
    if (request.intent && !CONTENT_REQUEST_INTENTS.has(request.intent)) {
        errors.push(`지원하지 않는 content request intent입니다: ${request.intent}`);
    }
    if (!CONTENT_REQUEST_MODES.has(request.mode)) {
        errors.push(`지원하지 않는 content request mode입니다: ${request.mode}`);
    }
    if (!request.conversation_id) errors.push('request.conversation_id가 필요합니다.');
    if (!request.user_id) errors.push('request.user_id가 필요합니다.');
    if (request.payload === null || typeof request.payload !== 'object' || Array.isArray(request.payload)) {
        errors.push('request.payload는 object여야 합니다.');
    }

    return {
        ok: errors.length === 0,
        errors,
        request
    };
}

function normalizeContentRequestBundle(input = {}) {
    const registerRequest = input.register_request ? normalizeCanonicalRequest(input.register_request) : null;
    const publishRequest = input.publish_request ? normalizeCanonicalRequest(input.publish_request) : null;

    return {
        kind: normalizeString(input.kind || 'content_request_bundle') || 'content_request_bundle',
        bundle_id: normalizeString(input.bundle_id),
        source: normalizeString(input.source || 'internal_api'),
        register_request: registerRequest,
        publish_request: publishRequest,
        meta: {
            explicit_params: normalizeExplicitParams(input.meta?.explicit_params)
        },
        ui: {
            show_publish_options: input.ui?.show_publish_options === true || (!!publishRequest && input.ui?.show_publish_options !== false)
        }
    };
}

function buildContentRequestBundle(input = {}, context = {}) {
    const registerRequest = input.register_request
        ? buildCanonicalContentRequest(input.register_request, context)
        : null;
    const publishRequest = input.publish_request
        ? buildCanonicalContentRequest(input.publish_request, context)
        : null;

    return normalizeContentRequestBundle({
        kind: 'content_request_bundle',
        bundle_id: normalizeString(input.bundle_id) || buildRequestId('content_bundle', context),
        source: normalizeString(input.source || 'internal_api'),
        register_request: registerRequest,
        publish_request: publishRequest,
        meta: {
            explicit_params: normalizeExplicitParams(input.meta?.explicit_params)
        },
        ui: {
            show_publish_options: input.ui?.show_publish_options === true || (!!publishRequest && input.ui?.show_publish_options !== false)
        }
    });
}

function validateContentRequestBundle(input = {}) {
    const bundle = normalizeContentRequestBundle(input);
    const errors = [];

    if (bundle.kind !== 'content_request_bundle') {
        errors.push(`bundle.kind가 올바르지 않습니다: ${bundle.kind}`);
    }
    if (!bundle.bundle_id) errors.push('bundle.bundle_id가 필요합니다.');
    if (!bundle.register_request && !bundle.publish_request) {
        errors.push('bundle에는 register_request 또는 publish_request가 최소 1개 필요합니다.');
    }

    if (bundle.register_request) {
        const validation = validateCanonicalRequest(bundle.register_request);
        if (!validation.ok) {
            validation.errors.forEach((error) => errors.push(`register_request: ${error}`));
        }
        if (bundle.register_request.intent !== 'content.register_topic') {
            errors.push('register_request.intent는 content.register_topic이어야 합니다.');
        }
        if (Array.isArray(bundle.register_request.payload?.platforms) && bundle.register_request.payload.platforms.length > 1) {
            errors.push('register_request.payload.platforms에는 발행 대상을 하나만 지정할 수 있습니다.');
        }
    }

    if (bundle.publish_request) {
        const validation = validateCanonicalRequest(bundle.publish_request);
        if (!validation.ok) {
            validation.errors.forEach((error) => errors.push(`publish_request: ${error}`));
        }
        if (bundle.publish_request.intent !== 'content.publish') {
            errors.push('publish_request.intent는 content.publish여야 합니다.');
        }
        if (!Array.isArray(bundle.publish_request.payload?.platforms) || bundle.publish_request.payload.platforms.length !== 1) {
            errors.push('publish_request.payload.platforms에는 발행 대상을 정확히 하나 지정해야 합니다.');
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        bundle
    };
}

function cloneContentRequestBundle(input = {}) {
    return normalizeContentRequestBundle(JSON.parse(JSON.stringify(normalizeContentRequestBundle(input))));
}

module.exports = {
    CONTENT_REQUEST_INTENTS,
    CONTENT_REQUEST_MODES,
    normalizeCanonicalRequest,
    buildCanonicalContentRequest,
    validateCanonicalRequest,
    normalizeContentRequestBundle,
    buildContentRequestBundle,
    validateContentRequestBundle,
    cloneContentRequestBundle,
    normalizeExplicitParams,
    buildRequestId
};
