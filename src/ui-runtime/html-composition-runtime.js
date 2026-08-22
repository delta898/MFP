function createHtmlCompositionRuntime(deps = {}) {
    const { fs, path } = deps;
    const includePattern = /[\t ]*<!--\s*@include\s+([^\s]+)\s*-->[\t ]*(?:\r?\n)?/g;

    function assertInsideRoot(rootPath, candidatePath, label) {
        const rootPrefix = `${rootPath}${path.sep}`;
        if (candidatePath !== rootPath && !candidatePath.startsWith(rootPrefix)) {
            throw new Error(`${label}이(가) UI root 밖을 가리킵니다.`);
        }
    }

    function resolveHtmlFile(rootPath, fromPath, requestedPath) {
        const includePath = String(requestedPath || '').trim();
        if (!includePath || path.isAbsolute(includePath) || includePath.split(/[\\/]+/).includes('..')) {
            throw new Error(`허용되지 않은 UI include 경로입니다: ${includePath || '(empty)'}`);
        }

        const resolvedPath = path.resolve(path.dirname(fromPath), includePath);
        assertInsideRoot(rootPath, resolvedPath, 'UI include');
        if (path.extname(resolvedPath).toLowerCase() !== '.html') {
            throw new Error(`UI include는 HTML 파일만 허용됩니다: ${includePath}`);
        }
        if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
            throw new Error(`UI include 파일을 찾을 수 없습니다: ${includePath}`);
        }
        return resolvedPath;
    }

    function composeHtmlFile({ uiRoot, entryFile = 'index.html' } = {}) {
        const rootPath = path.resolve(String(uiRoot || ''));
        if (!uiRoot || !fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
            throw new Error('UI HTML composition root를 찾을 수 없습니다.');
        }

        const entryPath = resolveHtmlFile(rootPath, path.join(rootPath, '__entry__.html'), entryFile);
        const includedFiles = [];

        function composeFile(filePath, ancestry = []) {
            if (ancestry.includes(filePath)) {
                const cycle = [...ancestry, filePath]
                    .map((item) => path.relative(rootPath, item))
                    .join(' -> ');
                throw new Error(`순환 UI include가 감지되었습니다: ${cycle}`);
            }

            const raw = fs.readFileSync(filePath, 'utf8');
            const nextAncestry = [...ancestry, filePath];
            return raw.replace(includePattern, (_match, includePath) => {
                const resolvedPath = resolveHtmlFile(rootPath, filePath, includePath);
                includedFiles.push(path.relative(rootPath, resolvedPath));
                return composeFile(resolvedPath, nextAncestry);
            });
        }

        const html = composeFile(entryPath);
        if (/<!--\s*@include\s+/.test(html)) {
            throw new Error('해석되지 않은 UI include가 남아 있습니다.');
        }

        return {
            html,
            entryFile: path.relative(rootPath, entryPath),
            includedFiles
        };
    }

    return { composeHtmlFile };
}

module.exports = { createHtmlCompositionRuntime };
