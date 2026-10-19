const { normalizeWritingStyle } = require('./writing-style');
const { normalizeWritingStrategy } = require('./writing-strategy');

function resolveContentWritingPreferences(contentConfig = {}) {
    const content = contentConfig && typeof contentConfig === 'object'
        ? contentConfig
        : {};
    const legacyBlog = content.blog && typeof content.blog === 'object'
        ? content.blog
        : {};

    return {
        style: normalizeWritingStyle(content.writing_style || legacyBlog.writing_style),
        strategy: normalizeWritingStrategy(content.writing_strategy || legacyBlog.writing_strategy)
    };
}

module.exports = {
    resolveContentWritingPreferences
};
