const { normalizeRecommendationContext } = require('../recommendations/topic-recommendation-learning');

class MemoryPayloadCodec {
    _compactString(value, maxLength = 400) {
        const text = String(value ?? '');
        return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
    }

    _compactValue(value, options = {}) {
        const depth = Number.isFinite(Number(options.depth)) ? Number(options.depth) : 0;
        const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 3;
        const maxArray = Number.isFinite(Number(options.maxArray)) ? Number(options.maxArray) : 8;
        const maxString = Number.isFinite(Number(options.maxString)) ? Number(options.maxString) : 400;
        if (value == null) return value;
        if (typeof value === 'string') return this._compactString(value, maxString);
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (depth >= maxDepth) return Array.isArray(value) ? { truncated: true, count: value.length } : { truncated: true };
        if (Array.isArray(value)) return value.slice(0, maxArray).map((item) => this._compactValue(item, { depth: depth + 1, maxDepth, maxArray, maxString }));
        if (typeof value !== 'object') return value;
        const denied = new Set(['memory', 'recent_events', 'recent_messages', 'recent_actions', 'recent_setting_changes', 'recent_job_runs', 'recent_artifacts', 'preferences', 'pending_confirmations', 'runtimeContext']);
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !denied.has(key))
            .map(([key, item]) => [key, this._compactValue(item, { depth: depth + 1, maxDepth, maxArray, maxString })]));
    }

    _summarizeAction(action = {}) {
        return { id: String(action.id || '').trim(), type: String(action.type || '').trim(), domain: String(action.domain || '').trim(), name: String(action.name || '').trim(), params: this._compactValue(action.params || {}, { maxDepth: 2, maxArray: 6, maxString: 200 }) };
    }

    _summarizePlan(plan = {}) {
        const steps = Array.isArray(plan.steps) ? plan.steps : [];
        return { id: String(plan.id || '').trim(), goal: this._compactString(plan.goal || '', 180), confirmation_mode: String(plan.confirmation_mode || '').trim(), step_count: steps.length, steps: steps.slice(0, 8).map((step) => ({ id: String(step?.id || '').trim(), requires_confirmation: !!step?.requires_confirmation, action: this._summarizeAction(step?.action || {}) })) };
    }

    _summarizeResult(result = {}) {
        const data = result && typeof result.data === 'object' ? result.data : {};
        const ideas = Array.isArray(data.ideas) ? data.ideas : [];
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        return { success: result?.success !== false, message: this._compactString(result?.message || '', 240), data: { ...Object.fromEntries(Object.entries(this._compactValue(data, { maxDepth: 2, maxArray: 6, maxString: 180 }) || {}).filter(([key]) => !['ideas', 'suggestions'].includes(key))), ideas_count: ideas.length, idea_titles: ideas.slice(0, 5).map((item) => this._compactString(item?.title || '', 120)).filter(Boolean), suggestions_count: suggestions.length, suggestion_summaries: suggestions.slice(0, 5).map((item) => this._compactString(item?.summary || '', 140)).filter(Boolean) } };
    }

    _summarizeConfirmationPayload(payload = {}) {
        const actions = Array.isArray(payload.actions) ? payload.actions : [];
        const previews = Array.isArray(payload.previews) ? payload.previews : [];
        return { id: String(payload.id || '').trim(), kind: String(payload.kind || 'confirmation').trim(), status: String(payload.status || 'pending').trim(), superseded_confirmation_id: String(payload.supersededConfirmationId || payload.superseded_confirmation_id || '').trim(), correction: payload.correction ? this._compactValue(payload.correction, { maxDepth: 2, maxArray: 4, maxString: 140 }) : null, action_ids: actions.map((item) => String(item?.id || '').trim()).filter(Boolean), preview_summaries: previews.slice(0, 4).map((item) => this._compactString(item?.preview?.summary || '', 180)).filter(Boolean), plan: payload.plan ? this._summarizePlan(payload.plan) : null };
    }

    _summarizeArtifactPayload(payload = {}) {
        const recommendation = normalizeRecommendationContext(payload?.recommendation);
        return { title: this._compactString(payload?.title || '', 180), summary: this._compactString(payload?.summary || '', 260), reason: this._compactString(payload?.reason || '', 220), keywords: Array.isArray(payload?.keywords) ? payload.keywords.slice(0, 8).map((item) => this._compactString(item, 60)).filter(Boolean) : [], source: String(payload?.source || '').trim(), feedback_key: String(payload?.feedback_key || '').trim(), recommendation: recommendation.run_id || recommendation.candidate_id ? recommendation : null };
    }

    _summarizeEventPayload(eventType, payload = {}) {
        const compact = this._compactValue(payload, { maxDepth: 3, maxArray: 8, maxString: 240 }) || {};
        if (eventType === 'agent.intent.parsed') return { envelope: { version: String(payload.envelope?.version || '1.0'), conversation_id: String(payload.envelope?.conversation_id || '').trim(), message_id: String(payload.envelope?.message_id || '').trim(), actions: Array.isArray(payload.envelope?.actions) ? payload.envelope.actions.map((action) => this._summarizeAction(action)) : [] } };
        if (eventType === 'agent.plan.created') return { plan: this._summarizePlan(payload.plan || {}) };
        if (eventType === 'agent.confirmation.requested') return this._summarizeConfirmationPayload(payload);
        if (['agent.confirmation.accepted', 'agent.confirmation.rejected'].includes(eventType)) return { confirmation_id: String(payload.confirmation_id || '').trim(), decision: eventType.endsWith('accepted') ? 'accepted' : 'rejected' };
        if (eventType.startsWith('capability.') && payload.action) return { action: this._summarizeAction(payload.action), result: this._summarizeResult(payload.result || {}), plan: payload.plan ? this._summarizePlan(payload.plan) : null };
        if (['user.message.received', 'agent.message.sent'].includes(eventType)) return { text: this._compactString(payload.text || '', 500), intent: String(payload.intent || '').trim() };
        if (eventType === 'memory.insight.updated') return { summary: this._compactString(payload.summary || '', 260) };
        if (eventType === 'content.topic.registered') return { subject: this._compactString(payload.subject || '', 180), category: this._compactString(payload.category || '', 80), platform: this._compactString(payload.platform || '', 80), keywords: this._compactString(payload.keywords || '', 200), instruction: this._compactString(payload.instruction || '', 240), source: this._compactString(payload.source || '', 80), request_id: this._compactString(payload.request_id || '', 300) };
        if (eventType === 'shopping.item.recorded') return { name: this._compactString(payload.name || '', 180), price: this._compactString(payload.price || '', 80), mall: this._compactString(payload.mall || '', 120), source: this._compactString(payload.source || '', 80), request_id: this._compactString(payload.request_id || '', 300) };
        if (eventType.startsWith('suggestion.')) return { suggestion_id: String(payload.suggestion_id || '').trim(), type: String(payload.type || '').trim(), summary: this._compactString(payload.summary || '', 200), feedback_key: String(payload.feedback_key || '').trim() };
        if (eventType.startsWith('artifact.')) return { artifact_id: String(payload.artifact_id || '').trim() };
        if (eventType === 'domain.alias.accepted') return { domain: String(payload.domain || '').trim(), raw_input: this._compactString(payload.raw_input || '', 120), canonical_value: this._compactString(payload.canonical_value || '', 120) };
        return compact;
    }
}

module.exports = { MemoryPayloadCodec };
