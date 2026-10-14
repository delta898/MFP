'use strict';

function objectContract(requiredKeys) {
    return Object.freeze({
        parse(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new TypeError('Expected an object.');
            }
            for (const key of requiredKeys) {
                if (!(key in value)) throw new TypeError(`Missing ${key}.`);
            }
            return value;
        }
    });
}

function createFakeTextGenerator() {
    return {
        id: 'sample-text-generator',
        name: 'Sample text generator',
        version: '0.0.0-test',
        operations: {
            generate: {
                description: 'Generate a sample draft from a topic and audience.',
                input: objectContract(['topic', 'audience']),
                output: objectContract(['title', 'body']),
                async execute(input) {
                    return {
                        title: `${input.topic} for ${input.audience}`,
                        body: `Sample draft about ${input.topic}.`
                    };
                }
            }
        }
    };
}

function createFakePublisher() {
    return {
        id: 'sample-publisher',
        name: 'Sample publisher',
        version: '0.0.0-test',
        operations: {
            publish: {
                description: 'Publish a sample draft to a named destination.',
                input: objectContract(['draft', 'destination']),
                output: objectContract(['url']),
                async execute(input) {
                    return { url: `https://example.invalid/${input.destination}` };
                }
            }
        }
    };
}

module.exports = { createFakeTextGenerator, createFakePublisher };
