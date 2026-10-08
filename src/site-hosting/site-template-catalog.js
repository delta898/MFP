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
            if (!sourceRoot.startsWith(`${pathApi.resolve(templateRoot)}${pathApi.sep}`)
                || (descriptor.package_ready !== false && !fileSystem.existsSync(sourceRoot))) return null;
            const familyDataDirectory = String(descriptor.family_data_directory || '').trim();
            if (familyDataDirectory && (pathApi.isAbsolute(familyDataDirectory) || familyDataDirectory.split(/[\\/]/).includes('..'))) return null;
            const familyDataRoot = familyDataDirectory ? pathApi.resolve(templateRoot, familyDataDirectory) : '';
            if (familyDataRoot && (!familyDataRoot.startsWith(`${pathApi.resolve(templateRoot)}${pathApi.sep}`)
                || (descriptor.package_ready !== false && !fileSystem.existsSync(familyDataRoot)))) return null;
            const previewFile = String(descriptor.preview_file || '').trim();
            if (previewFile && (pathApi.isAbsolute(previewFile) || previewFile.split(/[\\/]/).includes('..')
                || !fileSystem.existsSync(pathApi.resolve(templateRoot, previewFile)))) return null;
            return {
                id: safeId,
                version: String(descriptor.version),
                name: String(descriptor.name),
                description: String(descriptor.description || ''),
                source_root: sourceRoot,
                family_data_root: familyDataRoot,
                preview_file: previewFile ? pathApi.resolve(templateRoot, previewFile) : '',
                source_revision: String(descriptor.source_revision || ''),
                kind: String(descriptor.kind || 'site-hosting'),
                resource: descriptor.resource || null,
                family_id: String(descriptor.family_id || ''),
                family_name: String(descriptor.family_name || ''),
                family_description: String(descriptor.family_description || ''),
                package_ready: descriptor.package_ready !== false
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
            .map(({ id, version, name, description, preview_file, family_id, family_name, family_description }) => ({
                id, version, name, description, has_preview: Boolean(preview_file),
                ...(family_id ? { family_id, family_name, family_description } : {})
            }))
            .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
    }

    function get(id) {
        return readTemplate(id);
    }

    function copySource(id, destination) {
        const template = readTemplate(id);
        if (!template || template.package_ready === false || !fileSystem.existsSync(template.source_root)) {
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

        if (template.family_data_root) {
            copyDirectory(template.source_root, pathApi.join(destination, 'template', 'astro'));
            copyDirectory(template.family_data_root, pathApi.join(destination, 'site-data'));
        } else {
            copyDirectory(template.source_root, destination);
        }
        return { id: template.id, version: template.version, ...(template.source_revision ? { source_revision: template.source_revision } : {}) };
    }

    function copyPreview(id, destination) {
        const template = readTemplate(id);
        if (!template?.preview_file) return '';
        fileSystem.mkdirSync(pathApi.dirname(destination), { recursive: true });
        fileSystem.copyFileSync(template.preview_file, destination);
        return destination;
    }

    return { templatesRoot, list, get, copySource, copyPreview };
}

module.exports = { TEMPLATE_ID_PATTERN, createSiteTemplateCatalog };
