'use strict';

function createNotificationDispatcher(channels = []) {
    const registrations = (Array.isArray(channels) ? channels : []).filter((channel) =>
        channel && typeof channel.id === 'string' && typeof channel.isEnabled === 'function'
            && typeof channel.send === 'function'
    );

    async function send(message) {
        const active = [];
        const channels = [];
        for (const channel of registrations) {
            try {
                if (channel.isEnabled()) active.push(channel);
            } catch (error) {
                channels.push({
                    id: channel.id,
                    success: false,
                    message: String(error?.message || error)
                });
            }
        }
        const results = await Promise.allSettled(active.map(async (channel) => {
            const rendered = typeof channel.render === 'function' ? channel.render(message) : message;
            return channel.send(rendered);
        }));
        return {
            attempted: active.length > 0 || channels.length > 0,
            channels: [
                ...channels,
                ...results.map((result, index) => ({
                    id: active[index].id,
                    success: result.status === 'fulfilled' && result.value?.success === true,
                    ...(result.status === 'rejected' ? { message: String(result.reason?.message || result.reason) } : {})
                }))
            ]
        };
    }

    return { send };
}

module.exports = { createNotificationDispatcher };
