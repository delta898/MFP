'use strict';

const PLUGIN_ID = 'content-generator';
const PACKAGE_VERSION = require('./package.json').version;

function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object.`);
    }
    return value;
}

function parseGenerateInput(value) {
    const input = requireObject(value, 'Text generation input');
    if (typeof input.prompt !== 'string' || !input.prompt.trim()) {
        throw new TypeError('Text generation prompt must be a non-empty string.');
    }
    return Object.freeze({ prompt: input.prompt.trim() });
}

function parseGenerateOutput(value) {
    const output = requireObject(value, 'Text generation output');
    if (typeof output.text !== 'string' || !output.text.trim()) {
        throw new TypeError('Generated text must be a non-empty string.');
    }
    return Object.freeze({ text: output.text.trim() });
}

function createContentGeneratorPlugin(options = {}) {
    if (typeof options.generateText !== 'function') {
        throw new TypeError('Content Generator Plugin requires an injected generateText() function.');
    }

    return Object.freeze({
        id: PLUGIN_ID,
        name: 'Content Generator',
        version: PACKAGE_VERSION,
        operations: Object.freeze({
            'text.generate': Object.freeze({
                description: 'Generate text from a prompt using the host-selected text generation provider.',
                input: Object.freeze({ parse: parseGenerateInput }),
                output: Object.freeze({ parse: parseGenerateOutput }),
                async execute(input, context = {}) {
                    const text = await options.generateText({
                        prompt: input.prompt,
                        signal: context.signal
                    });
                    return { text };
                }
            })
        })
    });
}

module.exports = { createContentGeneratorPlugin };
