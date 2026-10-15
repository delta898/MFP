'use strict';

function createNaverPublisherAdapter(options = {}) {
    if (typeof options.executeOperation !== 'function') {
        throw new TypeError('Naver Publisher adapter requires executeOperation().');
    }
    return Object.freeze({
        publish(request, executionContext = {}) {
            if (!request || typeof request !== 'object' || Array.isArray(request)) {
                throw new TypeError('Naver publish request must be an object.');
            }
            return options.executeOperation('naver-publisher', 'posts.publish', request, executionContext);
        }
    });
}

module.exports = { createNaverPublisherAdapter };
