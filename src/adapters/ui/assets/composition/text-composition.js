function createTextCompositionRuntime(deps = {}) {
    const { fs, path } = deps;

    function composeTextFile(options = {}) {
        const {
            rootDir,
            entryFile,
            allowedExtension,
            includePattern,
            unresolvedPattern,
            resourceLabel = 'resource'
        } = options;
        const rootPath = path.resolve(String(rootDir || ''));
        if (!rootDir || !fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
            throw new Error(`${resourceLabel} composition root를 찾을 수 없습니다.`);
        }

        const normalizedExtension = String(allowedExtension || '').toLowerCase();
        const normalizedPattern = includePattern instanceof RegExp
            ? new RegExp(includePattern.source, includePattern.flags.includes('g') ? includePattern.flags : `${includePattern.flags}g`)
            : null;
        if (!normalizedExtension || !normalizedPattern) {
            throw new Error(`${resourceLabel} composition 계약이 올바르지 않습니다.`);
        }

        function assertInsideRoot(candidatePath, label) {
            const rootPrefix = `${rootPath}${path.sep}`;
            if (candidatePath !== rootPath && !candidatePath.startsWith(rootPrefix)) {
                throw new Error(`${label}이(가) composition root 밖을 가리킵니다.`);
            }
        }

        function resolveIncludedFile(fromPath, requestedPath) {
            const includePath = String(requestedPath || '').trim();
            if (!includePath || path.isAbsolute(includePath) || includePath.split(/[\\/]+/).includes('..')) {
                throw new Error(`허용되지 않은 ${resourceLabel} include 경로입니다: ${includePath || '(empty)'}`);
            }

            const resolvedPath = path.resolve(path.dirname(fromPath), includePath);
            assertInsideRoot(resolvedPath, `${resourceLabel} include`);
            if (path.extname(resolvedPath).toLowerCase() !== normalizedExtension) {
                throw new Error(`${resourceLabel} include는 ${normalizedExtension} 파일만 허용됩니다: ${includePath}`);
            }
            if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
                throw new Error(`${resourceLabel} include 파일을 찾을 수 없습니다: ${includePath}`);
            }
            return resolvedPath;
        }

        const entryPath = resolveIncludedFile(path.join(rootPath, `__entry__${normalizedExtension}`), entryFile);
        const includedFiles = [];

        function composeFile(filePath, ancestry = []) {
            if (ancestry.includes(filePath)) {
                const cycle = [...ancestry, filePath]
                    .map((item) => path.relative(rootPath, item))
                    .join(' -> ');
                throw new Error(`순환 ${resourceLabel} include가 감지되었습니다: ${cycle}`);
            }

            const raw = fs.readFileSync(filePath, 'utf8');
            const nextAncestry = [...ancestry, filePath];
            return raw.replace(normalizedPattern, (_match, includePath) => {
                const resolvedPath = resolveIncludedFile(filePath, includePath);
                includedFiles.push(path.relative(rootPath, resolvedPath));
                return composeFile(resolvedPath, nextAncestry);
            });
        }

        const content = composeFile(entryPath);
        if (unresolvedPattern instanceof RegExp && unresolvedPattern.test(content)) {
            throw new Error(`해석되지 않은 ${resourceLabel} include가 남아 있습니다.`);
        }

        return {
            content,
            entryFile: path.relative(rootPath, entryPath),
            includedFiles
        };
    }

    return { composeTextFile };
}

module.exports = { createTextCompositionRuntime };
