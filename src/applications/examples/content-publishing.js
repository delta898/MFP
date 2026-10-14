'use strict';

function createContentPublishingExample(options = {}) {
    if (typeof options.executeOperation !== 'function') {
        throw new TypeError('Application requires an executeOperation function.');
    }

    return Object.freeze({
        async publish(request) {
            if (!request || typeof request !== 'object'
                || typeof request.topic !== 'string' || !request.topic.trim()
                || typeof request.audience !== 'string' || !request.audience.trim()
                || typeof request.destination !== 'string' || !request.destination.trim()) {
                throw new TypeError('Publishing example requires topic, audience, and destination.');
            }
            const draft = await options.executeOperation(
                'sample-text-generator',
                'generate',
                { topic: request.topic, audience: request.audience }
            );
            const publication = await options.executeOperation(
                'sample-publisher',
                'publish',
                { draft, destination: request.destination }
            );
            return { draft, publication };
        }
    });
}

module.exports = { createContentPublishingExample };
