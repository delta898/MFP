'use strict';

function createFakeTextGenerator() {
    return {
        manifest: {
            manifestVersion: 1,
            id: 'sample-text-generator',
            name: 'Sample text generator',
            hostApi: '^1.0.0',
            summary: 'Generate sample text.',
            operations: {
                generate: {
                    description: 'Generate a sample draft from a topic and audience.',
                    inputSchema: {
                        type: 'object',
                        properties: { topic: { type: 'string' }, audience: { type: 'string' } },
                        required: ['topic', 'audience'],
                        additionalProperties: false
                    },
                    outputSchema: {
                        type: 'object',
                        properties: { title: { type: 'string' }, body: { type: 'string' } },
                        required: ['title', 'body'],
                        additionalProperties: false
                    },
                    capabilities: []
                }
            }
        },
        version: '0.0.0-test',
        operations: {
            generate: {
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
        manifest: {
            manifestVersion: 1,
            id: 'sample-publisher',
            name: 'Sample publisher',
            hostApi: '^1.0.0',
            summary: 'Sample publishing operation.',
            operations: {
                publish: {
                    description: 'Publish a sample draft to a named destination.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            draft: {
                                type: 'object',
                                properties: { title: { type: 'string' }, body: { type: 'string' } },
                                required: ['title', 'body'],
                                additionalProperties: false
                            },
                            destination: { type: 'string' }
                        },
                        required: ['draft', 'destination'],
                        additionalProperties: false
                    },
                    outputSchema: {
                        type: 'object',
                        properties: { url: { type: 'string' } },
                        required: ['url'],
                        additionalProperties: false
                    },
                    capabilities: []
                }
            }
        },
        version: '0.0.0-test',
        operations: {
            publish: {
                async execute(input) {
                    return { url: `https://example.invalid/${input.destination}` };
                }
            }
        }
    };
}

module.exports = { createFakeTextGenerator, createFakePublisher };
