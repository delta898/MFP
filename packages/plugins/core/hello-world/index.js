'use strict';

function createPlugin() {
    return Object.freeze({
        operations: Object.freeze({
            'hello.say': Object.freeze({
                async execute(input) {
                    const name = input.name.trim();
                    if (!name) throw new TypeError('Name must contain non-whitespace characters.');
                    return { message: `Hello, ${name}!` };
                }
            })
        })
    });
}

module.exports = { createPlugin };
