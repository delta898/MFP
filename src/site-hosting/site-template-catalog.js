'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function createSiteTemplateCatalog(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const templatesRoot = pathApi.resolve(String(options.templatesRoot || pathApi.join(__dirname, 'templates')));

    function readTemplate(id) {
        const safeId = String(id || '').trim();
        if (!TEMPLATE_ID_PATTERN.test(safeId)) return null;
        const templateRoot = pathApi.join(templatesRoot, safeId);
        const descriptorPath = pathApi.join(templateRoot, 'template.json');
        if (!fileSystem.existsSync(descriptorPath)) return null;
        try {
            const descriptor = JSON.parse(String(fileSystem.readFileSync(descriptorPath, 'utf8') || ''));
            const sourceDirectory = String(descriptor.source_directory || '').trim();
            if (descriptor.id !== safeId || !String(descriptor.version || '').trim()
                || !String(descriptor.name || '').trim() || !sourceDirectory
                || pathApi.isAbsolute(sourceDirectory) || sourceDirectory.split(/[\\/]/).includes('..')) {
                return null;
            }
            const sourceRoot = pathApi.resolve(templateRoot, sourceDirectory);
            if (!sourceRoot.startsWith(`${pathApi.resolve(templateRoot)}${pathApi.sep}`) || !fileSystem.existsSync(sourceRoot)) return null;
            return {
                id: safeId,
                version: String(descriptor.version),
                name: String(descriptor.name),
                description: String(descriptor.description || ''),
                source_root: sourceRoot
            };
        } catch (_error) {
            return null;
        }
    }

    function list() {
        if (!fileSystem.existsSync(templatesRoot)) return [];
        return fileSystem.readdirSync(templatesRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && TEMPLATE_ID_PATTERN.test(entry.name))
            .map((entry) => readTemplate(entry.name))
            .filter(Boolean)
            .map(({ id, version, name, description }) => ({ id, version, name, description }))
            .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
    }

    function get(id) {
        return readTemplate(id);
    }

    function copySource(id, destination) {
        const template = readTemplate(id);
        if (!template) {
            const error = new Error('선택한 템플릿을 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_TEMPLATE_NOT_FOUND';
            error.status = 404;
            throw error;
        }

        function copyDirectory(sourceDir, targetDir) {
            fileSystem.mkdirSync(targetDir, { recursive: true });
            for (const entry of fileSystem.readdirSync(sourceDir, { withFileTypes: true })) {
                const sourcePath = pathApi.join(sourceDir, entry.name);
                const targetPath = pathApi.join(targetDir, entry.name);
                if (entry.isSymbolicLink()) {
                    const error = new Error('템플릿에 허용되지 않는 파일 형식이 있습니다.');
                    error.code = 'SITE_HOSTING_TEMPLATE_SOURCE_INVALID';
                    error.status = 400;
                    throw error;
                }
                if (entry.isDirectory()) copyDirectory(sourcePath, targetPath);
                else if (entry.isFile()) fileSystem.copyFileSync(sourcePath, targetPath, fileSystem.constants?.COPYFILE_EXCL || 1);
                else {
                    const error = new Error('템플릿에 허용되지 않는 파일 형식이 있습니다.');
                    error.code = 'SITE_HOSTING_TEMPLATE_SOURCE_INVALID';
                    error.status = 400;
                    throw error;
                }
            }
        }

        copyDirectory(template.source_root, destination);
        return { id: template.id, version: template.version };
    }

    return { templatesRoot, list, get, copySource };
}

module.exports = { TEMPLATE_ID_PATTERN, createSiteTemplateCatalog };
