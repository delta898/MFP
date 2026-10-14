'use strict';

function createContentPublishingExample(options = {}) {
    if (typeof options.textGeneration?.generate !== 'function' || typeof options.publication?.publish !== 'function') {
        throw new TypeError('Application requires textGeneration and publication capabilities.');
    }

    return Object.freeze({
        async publish(request) {
            if (!request || typeof request !== 'object'
                || typeof request.topic !== 'string' || !request.topic.trim()
                || typeof request.audience !== 'string' || !request.audience.trim()
                || typeof request.destination !== 'string' || !request.destination.trim()) {
                throw new TypeError('Publishing example requires topic, audience, and destination.');
            }
            const draft = await options.textGeneration.generate({ topic: request.topic, audience: request.audience });
            const publication = await options.publication.publish({ draft, destination: request.destination });
            return { draft, publication };
        }
    });
}

module.exports = { createContentPublishingExample };
