const { createTextCompositionRuntime } = require('./text-composition-runtime');

function createJsCompositionRuntime(deps = {}) {
    const textRuntime = createTextCompositionRuntime(deps);

    function composeJsFile({ uiRoot, entryFile = 'app.js' } = {}) {
        const result = textRuntime.composeTextFile({
            rootDir: uiRoot,
            entryFile,
            allowedExtension: '.js',
            includePattern: /^[\t ]*\/\/\s*@include\s+([^\s]+)[\t ]*(?:\r?\n)?/gm,
            unresolvedPattern: /^\s*\/\/\s*@include\s+/m,
            resourceLabel: 'UI JavaScript'
        });
        return {
            js: result.content,
            entryFile: result.entryFile,
            includedFiles: result.includedFiles
        };
    }

    return { composeJsFile };
}

module.exports = { createJsCompositionRuntime };
