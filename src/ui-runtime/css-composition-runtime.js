const { createTextCompositionRuntime } = require('./text-composition-runtime');

function createCssCompositionRuntime(deps = {}) {
    const textRuntime = createTextCompositionRuntime(deps);

    function composeCssFile({ uiRoot, entryFile = 'styles.css' } = {}) {
        const result = textRuntime.composeTextFile({
            rootDir: uiRoot,
            entryFile,
            allowedExtension: '.css',
            includePattern: /[\t ]*\/\*\s*@include\s+([^\s]+)\s*\*\/[\t ]*(?:\r?\n)?/g,
            unresolvedPattern: /\/\*\s*@include\s+/,
            resourceLabel: 'UI CSS'
        });
        return {
            css: result.content,
            entryFile: result.entryFile,
            includedFiles: result.includedFiles
        };
    }

    return { composeCssFile };
}

module.exports = { createCssCompositionRuntime };
