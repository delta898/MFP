function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeInteractionProvenance(input = {}, fallback = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const defaults = fallback && typeof fallback === 'object' ? fallback : {};
    const channel = compact(source.channel || defaults.channel || 'local', 80) || 'local';
    const actorId = compact(
        source.actor_id || source.actorId || source.user_id || source.userId || source.user?.id
        || defaults.actor_id || defaults.actorId || defaults.user_id || defaults.userId || defaults.user?.id,
        160
    );
    const actorType = compact(
        source.actor_type || source.actorType || defaults.actor_type || defaults.actorType
        || (actorId && actorId !== 'SYSTEM' ? 'user' : 'system'),
        40
    ) || 'system';
    const conversationId = compact(
        source.conversation_id || source.conversationId || source.conversation?.id
        || defaults.conversation_id || defaults.conversationId || defaults.conversation?.id,
        240
    );

    return {
        channel,
        actor_type: actorType,
        actor_id: actorId || 'SYSTEM',
        conversation_id: conversationId,
        message_id: compact(
            source.message_id || source.messageId || source.context_refs?.message_id
            || defaults.message_id || defaults.messageId || defaults.context_refs?.message_id,
            240
        ),
        request_id: compact(source.request_id || source.requestId || defaults.request_id || defaults.requestId, 300),
        source: compact(source.source || defaults.source, 120)
    };
}

function provenanceFromRuntimeContext(context = {}, overrides = {}) {
    return normalizeInteractionProvenance(overrides, {
        channel: context.channel,
        actor_type: context.actor_type || context.actorType,
        user: context.user,
        conversation: context.conversation,
        messageId: context.messageId,
        requestId: context.metadata?.request_id || context.metadata?.requestId,
        source: context.metadata?.source
    });
}

module.exports = {
    normalizeInteractionProvenance,
    provenanceFromRuntimeContext
};
