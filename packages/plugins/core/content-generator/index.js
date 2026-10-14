'use strict';

const packageMetadata = require('./package.json');
const PACKAGE_VERSION = packageMetadata.version;

function createPlugin(options = {}) {
    if (typeof options.generateText !== 'function') {
        throw new TypeError('Content Generator Plugin requires an injected generateText() function.');
    }

    return Object.freeze({
        operations: Object.freeze({
            'text.generate': Object.freeze({
                async execute(input, context = {}) {
                    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
                    if (!prompt) throw new TypeError('Text generation prompt must be a non-empty string.');
                    const generated = await options.generateText({ prompt, signal: context.signal });
                    const text = typeof generated === 'string' ? generated.trim() : '';
                    if (!text) throw new TypeError('Generated text must be a non-empty string.');
                    return { text };
                }
            })
        })
    });
}

module.exports = { PACKAGE_VERSION, createPlugin };
