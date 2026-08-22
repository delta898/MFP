const { createTextCompositionRuntime } = require('./text-composition-runtime');

function createHtmlCompositionRuntime(deps = {}) {
    const textRuntime = createTextCompositionRuntime(deps);

    function composeHtmlFile({ uiRoot, entryFile = 'index.html' } = {}) {
        const result = textRuntime.composeTextFile({
            rootDir: uiRoot,
            entryFile,
            allowedExtension: '.html',
            includePattern: /[\t ]*<!--\s*@include\s+([^\s]+)\s*-->[\t ]*(?:\r?\n)?/g,
            unresolvedPattern: /<!--\s*@include\s+/,
            resourceLabel: 'UI HTML'
        });
        return {
            html: result.content,
            entryFile: result.entryFile,
            includedFiles: result.includedFiles
        };
    }

    return { composeHtmlFile };
}

module.exports = { createHtmlCompositionRuntime };
