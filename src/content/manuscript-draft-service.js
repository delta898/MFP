const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { buildLocalMarkdownPreview, normalizeSelectedFiles, resolveMarkdownEntryFromSelectedFiles } = require('./local-markdown-preview');
const { requireSinglePublishTarget } = require('./single-publish-target');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DRAFT_IMAGE_BYTES = 35 * 1024 * 1024;
const IMAGE_TYPES = Object.freeze({
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif'
});

function manuscriptError(statusCode, code, message) {
    const error = new Error(message);
    error.status = statusCode;
    error.statusCode = statusCode;
    error.apiCode = code;
    error.code = code;
    return error;
}

function decodeBase64(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^data:[^;,]+;base64,(.+)$/is);
    const encoded = match ? match[1] : raw;
    if (!encoded || !/^[a-z0-9+/]*={0,2}$/i.test(encoded.replace(/\s/g, ''))) {
        throw manuscriptError(400, 'MANUSCRIPT_IMAGE_DATA_INVALID', '이미지 파일 데이터가 올바르지 않습니다.');
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length) throw manuscriptError(400, 'MANUSCRIPT_IMAGE_DATA_INVALID', '이미지 파일이 비어 있습니다.');
    return buffer;
}

function detectImageType(buffer) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(buffer.toString('ascii', 8, 12))) return 'avif';
    return '';
}

function validateImageBuffer(buffer) {
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw manuscriptError(413, 'MANUSCRIPT_IMAGE_TOO_LARGE', '이미지는 한 장당 최대 10MB까지 사용할 수 있습니다.');
    }
    const type = detectImageType(buffer);
    if (!type) {
        throw manuscriptError(400, 'MANUSCRIPT_IMAGE_TYPE_UNSUPPORTED', 'PNG, JPEG, WebP 또는 AVIF 이미지 파일을 선택해 주세요.');
    }
    return { extension: type === 'jpg' ? '.jpg' : `.${type}`, mimeType: IMAGE_TYPES[type] };
}

function atomicWriteJson(fsImpl, filePath, value) {
    const pending = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fsImpl.writeFileSync(pending, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fsImpl.renameSync(pending, filePath);
}

function safeDraftId(value) {
    const id = String(value || '').trim();
    return /^[a-f0-9-]{36}$/i.test(id) ? id : '';
}

function safeSlotId(value) {
    const id = String(value || '').trim();
    return /^image-(?:0|[1-9][0-9]*)$/.test(id) ? id : '';
}

function stripImageBlocksByIndex(content, indexes = []) {
    const excluded = indexes instanceof Set ? indexes : new Set(indexes);
    return String(content || '')
        .replace(/\[\[IMAGE_(\d+)\s*\n[\s\S]*?\n\]\]/g, (block, index) => excluded.has(Number(index)) ? '' : block)
        .replace(/\[\[IMAGE_(\d+)\s*:[^\]]*\]\]/g, (block, index) => excluded.has(Number(index)) ? '' : block)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeDraftSettings(input = {}, previous = {}) {
    const targets = input.targets !== undefined
        ? requireSinglePublishTarget(input.targets)
        : requireSinglePublishTarget(previous.targets || ['naver']);
    return {
        ...previous,
        targets,
        postStatus: String(input.postStatus || previous.postStatus || 'publish'),
        scheduleDate: String(input.scheduleDate ?? previous.scheduleDate ?? ''),
        imageMode: 'prompt_only',
        naverCategory: String(input.naverCategory ?? previous.naverCategory ?? ''),
        wordpressCategory: String(input.wordpressCategory ?? previous.wordpressCategory ?? ''),
        headless: input.headless === undefined ? previous.headless !== false : input.headless !== false
    };
}

function createManuscriptDraftService(options = {}) {
    const fsImpl = options.fs || fs;
    const pathImpl = options.path || path;
    const cryptoImpl = options.crypto || crypto;
    const Utils = options.Utils;
    const Logger = options.Logger;
    const callWritingImage = options.callWritingImage;
    const workspaceRoot = pathImpl.resolve(String(options.workspaceDir || pathImpl.join(process.cwd(), 'workspace')), 'manuscript-drafts');
    if (!Utils?.parseMarkdown || !Utils?.findImageByPrefix) throw new Error('Manuscript Draft requires markdown utilities.');

    function pathsFor(id) {
        const draftId = safeDraftId(id);
        if (!draftId) throw manuscriptError(400, 'MANUSCRIPT_DRAFT_ID_INVALID', '원고 작업 ID가 올바르지 않습니다.');
        const root = pathImpl.join(workspaceRoot, draftId);
        return {
            root,
            source: pathImpl.join(root, 'source'),
            originals: pathImpl.join(root, 'originals'),
            assets: pathImpl.join(root, 'assets'),
            manifest: pathImpl.join(root, 'draft.json')
        };
    }

    function readManifest(id) {
        const locations = pathsFor(id);
        if (!fsImpl.existsSync(locations.manifest)) {
            throw manuscriptError(404, 'MANUSCRIPT_DRAFT_NOT_FOUND', '원고 작업공간을 찾지 못했습니다. 다시 불러와 주세요.');
        }
        return { locations, manifest: JSON.parse(fsImpl.readFileSync(locations.manifest, 'utf8')) };
    }

    function assertRevision(manifest, expected) {
        const value = Number(expected);
        if (!Number.isInteger(value) || value !== Number(manifest.revision)) {
            throw manuscriptError(409, 'MANUSCRIPT_DRAFT_REVISION_CONFLICT', '원고가 다른 작업으로 변경되었습니다. 최신 미리보기를 확인해 주세요.');
        }
    }

    function currentFileForSlot(locations, slot) {
        return slot.current_file ? pathImpl.join(locations.source, slot.current_file) : '';
    }

    function buildPublicDraft(manifest, locations) {
        const preview = buildLocalMarkdownPreview({
            directoryPath: locations.source,
            targets: manifest.settings.targets,
            postStatus: manifest.settings.postStatus,
            scheduleDate: manifest.settings.scheduleDate,
            imageGeneration: false
        }, { fs: fsImpl, path: pathImpl, Utils });
        if (manifest.source_kind === 'paste') {
            preview.source = { ...preview.source, type: 'pasted_markdown', folderName: manifest.source_label };
        } else if (manifest.source_kind === 'ai') {
            preview.source = { ...preview.source, type: 'generated_quick_post', folderName: manifest.source_label };
        }
        const slotByIndex = new Map(manifest.image_slots.map((slot) => [Number(slot.index), slot]));
        preview.images = preview.images.map((image) => {
            const slot = slotByIndex.get(Number(image.index));
            const slotState = String(slot?.state || (slot?.current_file ? 'ready' : 'missing'));
            const excluded = slotState === 'excluded';
            const exists = Boolean(!excluded && slot?.current_file && fsImpl.existsSync(currentFileForSlot(locations, slot)));
            return {
                ...image,
                slotId: slot?.id || `image-${image.index}`,
                exists,
                excluded,
                state: excluded ? 'excluded' : (exists ? 'ready' : 'missing'),
                imagePath: '',
                fileName: exists ? slot.current_file : '',
                assetOrigin: exists ? slot.current_origin : '',
                canRestore: Boolean(excluded || (slot?.original_file && slot.original_file !== slot.current_file)),
                restoreLabel: excluded ? '다시 포함' : '원래 이미지 복원',
                imageUrl: exists
                    ? `/api/v1/blog/manuscript-drafts/${encodeURIComponent(manifest.id)}/images/${encodeURIComponent(slot.id)}?revision=${manifest.revision}`
                    : ''
            };
        });
        preview.contentItems = preview.contentItems.map((item) => {
            if (item.type !== 'image') return item;
            const image = preview.images.find((entry) => Number(entry.index) === Number(item.index));
            return { ...item, exists: Boolean(image?.exists), imageUrl: image?.imageUrl || '', slotId: image?.slotId || '' };
        }).filter((item) => item.type !== 'image' || !preview.images.find((image) => Number(image.index) === Number(item.index))?.excluded);
        preview.stats.imageResolvedCount = preview.images.filter((image) => image.exists).length;
        preview.stats.imageExcludedCount = preview.images.filter((image) => image.excluded).length;
        preview.stats.imageTargetCount = preview.images.length - preview.stats.imageExcludedCount;
        preview.stats.imageMissingCount = preview.images.filter((image) => !image.excluded && !image.exists).length;
        preview.validation.warnings = preview.validation.warnings.filter((warning) => {
            const match = String(warning).match(/^(\d+)_image/);
            if (!match) return true;
            const image = preview.images.find((entry) => Number(entry.index) === Number(match[1]));
            return !image?.exists && !image?.excluded;
        });
        return {
            draftId: manifest.id,
            revision: manifest.revision,
            sourceKind: manifest.source_kind,
            createdAt: manifest.created_at,
            updatedAt: manifest.updated_at,
            ...preview
        };
    }

    function getDraft(id) {
        const { locations, manifest } = readManifest(id);
        return buildPublicDraft(manifest, locations);
    }

    function createWorkspace() {
        const id = cryptoImpl.randomUUID();
        const locations = pathsFor(id);
        fsImpl.mkdirSync(locations.source, { recursive: true, mode: 0o700 });
        fsImpl.mkdirSync(locations.originals, { recursive: true, mode: 0o700 });
        fsImpl.mkdirSync(locations.assets, { recursive: true, mode: 0o700 });
        return { id, locations };
    }

    function createPasteDraft(input = {}) {
        const markdownText = String(input.markdownText || '');
        const { id, locations } = createWorkspace();
        try {
            const settings = normalizeDraftSettings(input);
            const preview = buildLocalMarkdownPreview({ markdownText, folderName: '붙여넣기', ...settings }, { fs: fsImpl, path: pathImpl, Utils });
            fsImpl.writeFileSync(pathImpl.join(locations.source, 'contents.md'), markdownText, { mode: 0o600 });
            const now = new Date().toISOString();
            const manifest = {
                schema_version: 1,
                id,
                revision: 1,
                source_kind: 'paste',
                source_label: '붙여넣기',
                created_at: now,
                updated_at: now,
                settings,
                image_slots: preview.images.map((image) => ({
                    id: `image-${image.index}`,
                    index: image.index,
                    prompt: image.prompt,
                    original_file: '',
                    original_origin: '',
                    current_file: '',
                    current_origin: '',
                    state: 'missing'
                }))
            };
            atomicWriteJson(fsImpl, locations.manifest, manifest);
            Logger?.info?.(`✅ [ManuscriptDraft] 붙여넣기 작업공간 준비 완료 (draft=${id}, images=${preview.stats.imageBlockCount})`);
            return buildPublicDraft(manifest, locations);
        } catch (error) {
            try { fsImpl.rmSync(locations.root, { recursive: true, force: true }); } catch (_) { }
            throw error;
        }
    }

    function createAiDraft(input = {}) {
        const markdownText = String(input.markdownText || '');
        const generatedImages = Array.isArray(input.images) ? input.images : [];
        const { id, locations } = createWorkspace();
        try {
            fsImpl.writeFileSync(pathImpl.join(locations.source, 'contents.md'), markdownText, { mode: 0o600 });
            const imageByIndex = new Map();
            let totalImageBytes = 0;
            for (const image of generatedImages) {
                const index = Number(image?.index);
                const buffer = Buffer.isBuffer(image?.buffer) ? image.buffer : null;
                if (!Number.isInteger(index) || index < 0 || !buffer) continue;
                const detected = validateImageBuffer(buffer);
                totalImageBytes += buffer.length;
                if (totalImageBytes > MAX_DRAFT_IMAGE_BYTES) {
                    throw manuscriptError(413, 'MANUSCRIPT_DRAFT_IMAGES_TOO_LARGE', '원고 이미지 전체 크기는 최대 35MB까지 가져올 수 있습니다.');
                }
                const fileName = `${String(index).padStart(2, '0')}_generated${detected.extension}`;
                fsImpl.writeFileSync(pathImpl.join(locations.source, fileName), buffer, { mode: 0o600 });
                fsImpl.writeFileSync(pathImpl.join(locations.originals, fileName), buffer, { mode: 0o600 });
                imageByIndex.set(index, fileName);
            }
            const settings = normalizeDraftSettings(input);
            const preview = buildLocalMarkdownPreview({ directoryPath: locations.source, ...settings, imageGeneration: false }, { fs: fsImpl, path: pathImpl, Utils });
            const now = new Date().toISOString();
            const manifest = {
                schema_version: 1,
                id,
                revision: 1,
                source_kind: 'ai',
                source_label: String(input.sourceLabel || preview.title || '바로 생성 원고').slice(0, 300),
                source_metadata: input.sourceMetadata && typeof input.sourceMetadata === 'object' ? input.sourceMetadata : {},
                created_at: now,
                updated_at: now,
                settings,
                image_slots: preview.images.map((image) => {
                    const fileName = imageByIndex.get(Number(image.index)) || '';
                    return {
                        id: `image-${image.index}`,
                        index: image.index,
                        prompt: image.prompt,
                        original_file: fileName,
                        original_origin: fileName ? 'generated' : '',
                        current_file: fileName,
                        current_origin: fileName ? 'generated' : '',
                        state: fileName ? 'ready' : 'missing'
                    };
                })
            };
            atomicWriteJson(fsImpl, locations.manifest, manifest);
            Logger?.info?.(`✅ [ManuscriptDraft] 바로 생성 작업공간 준비 완료 (draft=${id}, images=${preview.stats.imageResolvedCount}/${preview.stats.imageBlockCount})`);
            return buildPublicDraft(manifest, locations);
        } catch (error) {
            try { fsImpl.rmSync(locations.root, { recursive: true, force: true }); } catch (_) { }
            throw error;
        }
    }

    function createFolderDraft(input = {}) {
        const selectedFiles = Array.isArray(input.selectedFiles) ? input.selectedFiles : [];
        const { preferredEntry } = resolveMarkdownEntryFromSelectedFiles(selectedFiles);
        const entries = normalizeSelectedFiles(selectedFiles);
        const sources = new Map(selectedFiles.map((entry) => [String(entry.relativePath || entry.webkitRelativePath || entry.name || '').replace(/\\/g, '/').replace(/^\/+/, ''), entry]));
        const { id, locations } = createWorkspace();
        try {
            const markdownSource = sources.get(preferredEntry.relativePath) || {};
            fsImpl.writeFileSync(pathImpl.join(locations.source, 'contents.md'), String(markdownSource.textContent || preferredEntry.textContent || ''), { mode: 0o600 });
            let totalImageBytes = 0;
            for (const entry of entries.filter((candidate) => /^\d{2}_/.test(candidate.fileName) && !candidate.rootRelativePath.includes('/'))) {
                const source = sources.get(entry.relativePath) || {};
                if (!source.base64Data) continue;
                const buffer = decodeBase64(source.base64Data);
                validateImageBuffer(buffer);
                totalImageBytes += buffer.length;
                if (totalImageBytes > MAX_DRAFT_IMAGE_BYTES) {
                    throw manuscriptError(413, 'MANUSCRIPT_DRAFT_IMAGES_TOO_LARGE', '원고 이미지 전체 크기는 최대 35MB까지 가져올 수 있습니다.');
                }
                const safeName = pathImpl.basename(entry.fileName);
                fsImpl.writeFileSync(pathImpl.join(locations.source, safeName), buffer, { mode: 0o600 });
                fsImpl.writeFileSync(pathImpl.join(locations.originals, safeName), buffer, { mode: 0o600 });
            }
            const settings = normalizeDraftSettings(input);
            const preview = buildLocalMarkdownPreview({ directoryPath: locations.source, ...settings, imageGeneration: settings.imageMode === 'generate' }, { fs: fsImpl, path: pathImpl, Utils });
            const now = new Date().toISOString();
            const manifest = {
                schema_version: 1,
                id,
                revision: 1,
                source_kind: 'folder',
                source_label: String(input.folderName || preview.source.folderName || '원고 폴더').slice(0, 300),
                created_at: now,
                updated_at: now,
                settings,
                image_slots: preview.images.map((image) => ({
                    id: `image-${image.index}`,
                    index: image.index,
                    prompt: image.prompt,
                    original_file: image.exists ? image.fileName : '',
                    original_origin: image.exists ? 'folder' : '',
                    current_file: image.exists ? image.fileName : '',
                    current_origin: image.exists ? 'folder' : '',
                    state: image.exists ? 'ready' : 'missing'
                }))
            };
            atomicWriteJson(fsImpl, locations.manifest, manifest);
            Logger?.info?.(`✅ [ManuscriptDraft] 원고 폴더 작업공간 준비 완료 (draft=${id}, images=${preview.stats.imageResolvedCount}/${preview.stats.imageBlockCount})`);
            return buildPublicDraft(manifest, locations);
        } catch (error) {
            try { fsImpl.rmSync(locations.root, { recursive: true, force: true }); } catch (_) { }
            throw error;
        }
    }

    function updateSlot(id, expectedRevision, slotId, mutate) {
        const { locations, manifest } = readManifest(id);
        assertRevision(manifest, expectedRevision);
        const normalizedSlotId = safeSlotId(slotId);
        const slot = manifest.image_slots.find((item) => item.id === normalizedSlotId);
        if (!slot) throw manuscriptError(404, 'MANUSCRIPT_IMAGE_SLOT_NOT_FOUND', '이미지 영역을 찾지 못했습니다.');
        mutate({ locations, manifest, slot });
        manifest.revision += 1;
        manifest.updated_at = new Date().toISOString();
        atomicWriteJson(fsImpl, locations.manifest, manifest);
        return buildPublicDraft(manifest, locations);
    }

    function replaceSlotFile({ locations, slot, buffer, extension, origin }) {
        const nextName = `${String(slot.index).padStart(2, '0')}_draft-${cryptoImpl.randomUUID().slice(0, 8)}${extension}`;
        const nextPath = pathImpl.join(locations.source, nextName);
        const pendingPath = `${nextPath}.${process.pid}.${Date.now()}.tmp`;
        fsImpl.writeFileSync(pendingPath, buffer, { mode: 0o600 });
        fsImpl.renameSync(pendingPath, nextPath);
        const previous = slot.current_file;
        slot.current_file = nextName;
        slot.current_origin = origin;
        slot.state = 'ready';
        if (previous && previous !== slot.original_file && previous !== nextName) {
            try { fsImpl.rmSync(pathImpl.join(locations.source, pathImpl.basename(previous)), { force: true }); } catch (_) { }
        }
    }

    function importLocalImage(input = {}) {
        const buffer = decodeBase64(input.base64Data);
        const detected = validateImageBuffer(buffer);
        return updateSlot(input.draftId, input.revision, input.slotId, ({ locations, slot }) => {
            replaceSlotFile({ locations, slot, buffer, extension: detected.extension, origin: 'user' });
            Logger?.info?.(`✅ [ManuscriptDraft] ${slot.id} 로컬 이미지 적용 완료 (draft=${input.draftId})`);
        });
    }

    function excludeImage(input = {}) {
        return updateSlot(input.draftId, input.revision, input.slotId, ({ slot }) => {
            slot.state = 'excluded';
            Logger?.info?.(`ℹ️ [ManuscriptDraft] ${slot.id} 이미지 제외 (draft=${input.draftId})`);
        });
    }

    function restoreImage(input = {}) {
        return updateSlot(input.draftId, input.revision, input.slotId, ({ locations, slot }) => {
            if (slot.state === 'excluded') {
                slot.state = slot.current_file && fsImpl.existsSync(currentFileForSlot(locations, slot)) ? 'ready' : 'missing';
                Logger?.info?.(`✅ [ManuscriptDraft] ${slot.id} 이미지 다시 포함 완료 (draft=${input.draftId})`);
                return;
            }
            if (!slot.original_file) throw manuscriptError(409, 'MANUSCRIPT_IMAGE_ORIGINAL_UNAVAILABLE', '복원할 원래 이미지가 없습니다.');
            const originalPath = pathImpl.join(locations.originals, pathImpl.basename(slot.original_file));
            if (!fsImpl.existsSync(originalPath)) throw manuscriptError(410, 'MANUSCRIPT_IMAGE_ORIGINAL_MISSING', '원래 이미지 파일을 찾지 못했습니다.');
            const previous = slot.current_file;
            fsImpl.copyFileSync(originalPath, pathImpl.join(locations.source, pathImpl.basename(slot.original_file)));
            slot.current_file = pathImpl.basename(slot.original_file);
            slot.current_origin = slot.original_origin || 'folder';
            slot.state = 'ready';
            if (previous && previous !== slot.original_file) {
                try { fsImpl.rmSync(pathImpl.join(locations.source, pathImpl.basename(previous)), { force: true }); } catch (_) { }
            }
            Logger?.info?.(`✅ [ManuscriptDraft] ${slot.id} 원래 이미지 복원 완료 (draft=${input.draftId})`);
        });
    }

    function updateSettings(input = {}) {
        return updateSlotless(input.draftId, input.revision, ({ manifest }) => {
            manifest.settings = normalizeDraftSettings(input, manifest.settings);
        });
    }

    function updateMarkdown(input = {}) {
        return updateSlotless(input.draftId, input.revision, ({ locations, manifest }) => {
            if (manifest.source_kind !== 'paste') {
                throw manuscriptError(409, 'MANUSCRIPT_DRAFT_SOURCE_READ_ONLY', '이 원고의 본문은 현재 입력 방식에서 변경할 수 없습니다.');
            }
            const markdownText = String(input.markdownText || '');
            const settings = normalizeDraftSettings(input, manifest.settings);
            const preview = buildLocalMarkdownPreview({ markdownText, folderName: manifest.source_label, ...settings }, { fs: fsImpl, path: pathImpl, Utils });
            const previousByIndex = new Map(manifest.image_slots.map((slot) => [Number(slot.index), slot]));
            manifest.settings = settings;
            manifest.image_slots = preview.images.map((image) => {
                const previous = previousByIndex.get(Number(image.index));
                const currentExists = Boolean(previous?.current_file && fsImpl.existsSync(currentFileForSlot(locations, previous)));
                return {
                    id: `image-${image.index}`,
                    index: image.index,
                    prompt: image.prompt,
                    original_file: previous?.original_file || '',
                    original_origin: previous?.original_origin || '',
                    current_file: currentExists ? previous.current_file : '',
                    current_origin: currentExists ? previous.current_origin : '',
                    state: previous?.state === 'excluded' ? 'excluded' : (currentExists ? 'ready' : 'missing')
                };
            });
            const markdownPath = pathImpl.join(locations.source, 'contents.md');
            const pendingPath = `${markdownPath}.${process.pid}.${Date.now()}.tmp`;
            fsImpl.writeFileSync(pendingPath, markdownText, { mode: 0o600 });
            fsImpl.renameSync(pendingPath, markdownPath);
            Logger?.info?.(`✅ [ManuscriptDraft] 붙여넣기 원고 갱신 완료 (draft=${input.draftId}, images=${preview.stats.imageBlockCount})`);
        });
    }

    function updateSlotless(id, expectedRevision, mutate) {
        const { locations, manifest } = readManifest(id);
        assertRevision(manifest, expectedRevision);
        mutate({ locations, manifest });
        manifest.revision += 1;
        manifest.updated_at = new Date().toISOString();
        atomicWriteJson(fsImpl, locations.manifest, manifest);
        return buildPublicDraft(manifest, locations);
    }

    async function generateImage(input = {}) {
        if (typeof callWritingImage !== 'function') throw manuscriptError(503, 'MANUSCRIPT_IMAGE_GENERATOR_UNAVAILABLE', '이미지 AI 기능이 준비되지 않았습니다.');
        const { locations, manifest } = readManifest(input.draftId);
        assertRevision(manifest, input.revision);
        const slot = manifest.image_slots.find((item) => item.id === safeSlotId(input.slotId));
        if (!slot) throw manuscriptError(404, 'MANUSCRIPT_IMAGE_SLOT_NOT_FOUND', '이미지 영역을 찾지 못했습니다.');
        if (!String(slot.prompt || '').trim()) throw manuscriptError(400, 'MANUSCRIPT_IMAGE_PROMPT_REQUIRED', 'AI 이미지를 만들 프롬프트가 없습니다.');
        const pendingBase = pathImpl.join(locations.assets, `pending-${slot.id}-${cryptoImpl.randomUUID().slice(0, 8)}`);
        Logger?.info?.(`🎨 [ManuscriptDraft] ${slot.id} AI 이미지 생성 중 (draft=${input.draftId})`);
        const generatedPath = await callWritingImage(slot.prompt, pendingBase, 2, { useCase: 'blog' });
        let buffer;
        let detected;
        try {
            buffer = fsImpl.readFileSync(generatedPath);
            detected = validateImageBuffer(buffer);
        } finally {
            try { if (generatedPath) fsImpl.rmSync(generatedPath, { force: true }); } catch (_) { }
        }
        return updateSlot(input.draftId, input.revision, input.slotId, ({ locations: latestLocations, slot: latestSlot }) => {
            replaceSlotFile({ locations: latestLocations, slot: latestSlot, buffer, extension: detected.extension, origin: 'generated' });
            Logger?.info?.(`✅ [ManuscriptDraft] ${latestSlot.id} AI 이미지 적용 완료 (draft=${input.draftId})`);
        });
    }

    async function generateMissingImages(input = {}) {
        let current = getDraft(input.draftId);
        if (Number(input.revision) !== Number(current.revision)) assertRevision({ revision: current.revision }, input.revision);
        const targets = current.images.filter((image) => !image.excluded && !image.exists && String(image.prompt || '').trim());
        for (const image of targets) {
            try {
                current = await generateImage({ draftId: input.draftId, revision: current.revision, slotId: image.slotId });
            } catch (error) {
                if (current.revision === Number(input.revision)) throw error;
                Logger?.warn?.(`⚠️ [ManuscriptDraft] 빈 이미지 생성 일부 완료 (draft=${input.draftId}): ${error.message}`);
                return { ...current, imageOperationWarning: '완성한 이미지는 유지했습니다. 만들지 못한 이미지는 다시 시도해 주세요.' };
            }
        }
        return current;
    }

    function buildPublishPayload(input = {}) {
        const { locations, manifest } = readManifest(input.draftId);
        assertRevision(manifest, input.revision);
        const excludedIndexes = new Set(manifest.image_slots
            .filter((slot) => slot.state === 'excluded')
            .map((slot) => Number(slot.index)));
        const includedImageNames = new Set(manifest.image_slots
            .filter((slot) => slot.state !== 'excluded' && slot.current_file)
            .map((slot) => pathImpl.basename(slot.current_file)));
        const names = fsImpl.readdirSync(locations.source).filter((name) => (
            fsImpl.statSync(pathImpl.join(locations.source, name)).isFile()
            && (/\.(md|markdown)$/i.test(name) || includedImageNames.has(name))
        ));
        const selectedFiles = names.map((name) => {
            const filePath = pathImpl.join(locations.source, name);
            if (/\.(md|markdown)$/i.test(name)) {
                return {
                    relativePath: `${manifest.source_label || '원고'}/${name}`,
                    name,
                    textContent: stripImageBlocksByIndex(fsImpl.readFileSync(filePath, 'utf8'), excludedIndexes)
                };
            }
            const buffer = fsImpl.readFileSync(filePath);
            const detected = validateImageBuffer(buffer);
            return {
                relativePath: `${manifest.source_label || '원고'}/${name}`,
                name,
                contentType: detected.mimeType,
                size: buffer.length,
                base64Data: buffer.toString('base64')
            };
        });
        const unresolvedCount = manifest.image_slots.filter((slot) => (
            slot.state !== 'excluded'
            && (!slot.current_file || !fsImpl.existsSync(currentFileForSlot(locations, slot)))
        )).length;
        const requestedPostStatus = String(manifest.settings.postStatus || 'publish');
        const forcedDraft = unresolvedCount > 0 && requestedPostStatus !== 'draft';
        return {
            sourceKind: manifest.source_kind,
            folderName: manifest.source_label,
            selectedFiles: selectedFiles.map((entry) => ({ ...entry, relativePath: `draft-${manifest.id}/${entry.name}` })),
            settings: { ...manifest.settings, imageMode: 'prompt_only', postStatus: forcedDraft ? 'draft' : requestedPostStatus },
            publishPolicy: { requestedPostStatus, effectivePostStatus: forcedDraft ? 'draft' : requestedPostStatus, unresolvedImageCount: unresolvedCount, forcedDraft }
        };
    }

    function getImage(input = {}) {
        const { locations, manifest } = readManifest(input.draftId);
        if (input.revision !== undefined && input.revision !== '') assertRevision(manifest, input.revision);
        const slot = manifest.image_slots.find((item) => item.id === safeSlotId(input.slotId));
        if (!slot?.current_file || slot.state === 'excluded') throw manuscriptError(404, 'MANUSCRIPT_IMAGE_NOT_FOUND', '이미지를 찾지 못했습니다.');
        const filePath = currentFileForSlot(locations, slot);
        if (!fsImpl.existsSync(filePath)) throw manuscriptError(404, 'MANUSCRIPT_IMAGE_NOT_FOUND', '이미지를 찾지 못했습니다.');
        const buffer = fsImpl.readFileSync(filePath);
        const detected = validateImageBuffer(buffer);
        return { binary: true, body: buffer, contentType: detected.mimeType };
    }

    return { createFolderDraft, createPasteDraft, createAiDraft, getDraft, updateSettings, updateMarkdown, importLocalImage, excludeImage, restoreImage, generateImage, generateMissingImages, buildPublishPayload, getImage };
}

module.exports = { createManuscriptDraftService, detectImageType, validateImageBuffer };
