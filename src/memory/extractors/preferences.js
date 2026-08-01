function buildPreferenceUpdatesFromEvent(event = {}) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const action = payload.action && typeof payload.action === 'object' ? payload.action : null;
    const result = payload.result && typeof payload.result === 'object' ? payload.result : {};

    if (!action || String(event.event_type || '').trim().startsWith('capability.') === false) {
        return [];
    }

    const updates = [];
    const actionKey = `${String(action.domain || '').trim()}.${String(action.name || '').trim()}`;
    const data = result.data && typeof result.data === 'object' ? result.data : {};

    if (actionKey === 'settings.trends.set_time' && data.time) {
        updates.push({
            name: 'preferred_trends_collect_time',
            value: { time: data.time },
            confidenceDelta: 0.1,
            evidenceDelta: 1
        });
    }

    if (actionKey === 'settings.blog_auto.set_time_window' && data.startTime && data.endTime) {
        updates.push({
            name: 'preferred_blog_auto_window',
            value: { startTime: data.startTime, endTime: data.endTime },
            confidenceDelta: 0.1,
            evidenceDelta: 1
        });
    }

    return updates;
}

module.exports = {
    buildPreferenceUpdatesFromEvent
};
