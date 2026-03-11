function normalizeRuntimeContext(input = {}) {
    const channel = String(input.channel || 'telegram').trim() || 'telegram';
    const userId = String(input.user?.id || '').trim();
    const username = String(input.user?.username || '').trim();
    const conversationId = String(input.conversation?.id || '').trim();

    return {
        channel,
        user: {
            id: userId,
            username,
            channel
        },
        conversation: {
            id: conversationId,
            channel
        },
        messageId: String(input.messageId || '').trim(),
        memory: input.memory && typeof input.memory === 'object' ? input.memory : {
            recent_events: [],
            pending_confirmations: []
        },
        metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
    };
}

function buildInvalidResult(errors = []) {
    return {
        ok: false,
        status: 'invalid',
        errors: Array.isArray(errors) ? errors : [String(errors || 'invalid request')]
    };
}

function buildCompletedResult(results = [], meta = {}) {
    return {
        ok: true,
        status: 'completed',
        results: Array.isArray(results) ? results : [],
        meta
    };
}

function buildConfirmationResult(confirmation = null, previews = [], meta = {}) {
    return {
        ok: true,
        status: 'confirmation_required',
        confirmation,
        previews: Array.isArray(previews) ? previews : [],
        meta
    };
}

module.exports = {
    normalizeRuntimeContext,
    buildInvalidResult,
    buildCompletedResult,
    buildConfirmationResult
};
