const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { buildLocalMarkdownPreview, normalizeSelectedFiles, resolveMarkdownEntryFromSelectedFiles } = require('./preview');
const { isCancellation, throwIfCanceled } = require('../../../utilities/async/cancellation');
const { requireSinglePublishTarget } = require('../../../services/content-delivery/single-publish-target');
const {
    RELATED_POSTS_STATUS,
    extractManuscriptTitle,
    findRelatedPostsSections,
    countRelatedPostLinks,
    finalizeManuscriptRelatedPosts
} = require('../posting/manuscript-related-posts');

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_ACTIVE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_COMPLETED_RETENTION_MS = 24 * 60 * 60 * 1000;
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
        throw manuscriptError(413, 'MANUSCRIPT_IMAGE_TOO_LARGE', '이미지는 한 장당 최대 20MB까지 사용할 수 있습니다.');
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
    return /^image-(?:(?:0|[1-9][0-9]*)|mb-[a-z0-9_-]{1,100})$/i.test(id) ? id : '';
}

function slotIdForImage(image = {}) {
    const blockId = String(image.blockId || '').trim();
    return /^[a-z0-9][a-z0-9_-]{0,100}$/i.test(blockId)
        ? `image-${blockId}`
        : `image-${Number(image.index || 0)}`;
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
    const requestedTargets = input.targets !== undefined ? input.targets : (previous.targets || ['naver']);
    const targets = Array.isArray(requestedTargets)
        && requestedTargets.length === 1
        && String(requestedTargets[0] || '').trim().toLowerCase() === 'site-hosting'
        ? ['site-hosting']
        : requireSinglePublishTarget(requestedTargets);
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
    const findImageByPrefix = options.findImageByPrefix;
    const Logger = options.Logger;
    const generateAiImage = options.generateAiImage;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const activeRetentionMs = Number.isFinite(Number(options.activeRetentionMs))
        ? Math.max(60 * 60 * 1000, Number(options.activeRetentionMs))
        : DEFAULT_ACTIVE_RETENTION_MS;
    const completedRetentionMs = Number.isFinite(Number(options.completedRetentionMs))
        ? Math.max(60 * 60 * 1000, Number(options.completedRetentionMs))
        : DEFAULT_COMPLETED_RETENTION_MS;
    const workspaceBase = pathImpl.resolve(String(options.workspaceDir || pathImpl.join(process.cwd(), 'workspace')));
    const workspaceRoot = pathImpl.join(workspaceBase, 'manuscript-drafts');
    if (typeof findImageByPrefix !== 'function') throw new Error('Manuscript Draft requires image file lookup.');
    const relatedPostsGateway = options.relatedPosts || null;

    function normalizePostStatus(value) {
        const status = String(value || '').trim().toLowerCase();
        return status === 'future' ? 'schedule' : (status || 'publish');
    }

    function safePlatformFolder(target, identity) {
        const normalizedTarget = String(target || '').trim().toLowerCase();
        if (!['naver', 'wordpress'].includes(normalizedTarget)) {
            throw manuscriptError(400, 'MANUSCRIPT_PUBLICATION_TARGET_INVALID', '게시 대상이 올바르지 않습니다.');
        }
        let label = String(identity || '').trim();
        if (normalizedTarget === 'wordpress' && label) {
            try { label = new URL(label).host || label; } catch (_) { }
        }
        label = label.replace(/[^a-z0-9._-]/gi, '_').replace(/^\.+|\.+$/g, '').slice(0, 100);
        return `${normalizedTarget === 'wordpress' ? 'wp' : 'naver'}_${label || 'unknown'}`;
    }

    function cleanPublicationStaging() {
        const stagingRoot = pathImpl.join(workspaceBase, '.publication-staging');
        try {
            if (!fsImpl.existsSync(stagingRoot)) return;
            const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
            for (const name of fsImpl.readdirSync(stagingRoot)) {
                const candidate = pathImpl.join(stagingRoot, name);
                if (fsImpl.statSync(candidate).mtimeMs < staleBefore) {
                    fsImpl.rmSync(candidate, { recursive: true, force: true });
                }
            }
            if (fsImpl.readdirSync(stagingRoot).length === 0) fsImpl.rmdirSync(stagingRoot);
        } catch (error) {
            Logger?.warn?.(`⚠️ [ManuscriptDraft] 게시 스냅샷 임시 파일 정리 실패: ${error.message}`);
        }
    }

    function safeSnapshotFileName(value) {
        const name = String(value || '').trim();
        if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name) || pathImpl.basename(name) !== name) {
            throw manuscriptError(400, 'MANUSCRIPT_SNAPSHOT_FILE_INVALID', '게시 스냅샷 파일 이름이 올바르지 않습니다.');
        }
        return name;
    }

    function persistPublicationSnapshot(input = {}) {
        const { locations, manifest } = readManifest(input.draftId);
        assertRevision(manifest, input.revision);
        assertDraftActive(manifest);
        const target = String(input.target || '').trim().toLowerCase();
        const postStatus = normalizePostStatus(input.postStatus || manifest.settings.postStatus);
        const contentVersion = getContentVersion(locations, manifest);
        const published = (manifest.publication_history || []).some((entry) => (
            entry.target === target
            && entry.content_version === contentVersion
            && normalizePostStatus(entry.post_status) === postStatus
        ));
        if (!published) throw manuscriptError(409, 'MANUSCRIPT_PUBLICATION_NOT_RECORDED', '게시 성공 기록을 확인할 수 없어 결과물을 보관하지 않았습니다.');

        const files = Array.isArray(input.files) ? input.files : [];
        if (files.length === 0) throw manuscriptError(400, 'MANUSCRIPT_SNAPSHOT_FILES_REQUIRED', '보관할 게시 원고 파일이 없습니다.');
        const platformFolder = safePlatformFolder(target, input.platformIdentity);
        const platformRoot = pathImpl.join(workspaceBase, platformFolder);
        const stagingRoot = pathImpl.join(workspaceBase, '.publication-staging');
        fsImpl.mkdirSync(platformRoot, { recursive: true });
        fsImpl.mkdirSync(stagingRoot, { recursive: true });
        const stagingDir = fsImpl.mkdtempSync(pathImpl.join(stagingRoot, 'snapshot-'));
        const names = new Set();
        let snapshotId = '';
        let finalDir = '';
        try {
            for (const entry of files) {
                const name = safeSnapshotFileName(entry?.name);
                if (names.has(name)) throw manuscriptError(400, 'MANUSCRIPT_SNAPSHOT_FILE_DUPLICATE', '게시 스냅샷에 중복 파일 이름이 있습니다.');
                names.add(name);
                if (/\.(?:md|markdown)$/i.test(name) && typeof entry?.textContent === 'string') {
                    fsImpl.writeFileSync(pathImpl.join(stagingDir, name), entry.textContent, { mode: 0o600 });
                    continue;
                }
                if (!String(entry?.contentType || '').startsWith('image/') || !entry?.base64Data) {
                    throw manuscriptError(400, 'MANUSCRIPT_SNAPSHOT_FILE_UNSUPPORTED', '게시 스냅샷에 지원하지 않는 파일이 있습니다.');
                }
                const buffer = Buffer.from(String(entry.base64Data), 'base64');
                const detected = validateImageBuffer(buffer);
                if (detected.mimeType !== entry.contentType) {
                    throw manuscriptError(400, 'MANUSCRIPT_SNAPSHOT_IMAGE_INVALID', '게시 스냅샷 이미지가 올바르지 않습니다.');
                }
                fsImpl.writeFileSync(pathImpl.join(stagingDir, name), buffer, { mode: 0o600 });
            }
            const markdownEntry = files.find((entry) => /\.(?:md|markdown)$/i.test(String(entry?.name || '')));
            const title = extractManuscriptTitle(String(markdownEntry?.textContent || ''));
            const createdAt = new Date(now()).toISOString();
            const metadata = {
                schema_version: 1,
                platform: target,
                platform_identity: String(input.platformIdentity || ''),
                publication_id: '',
                published_at: createdAt,
                post_status: postStatus,
                post_url: String(input.postUrl || ''),
                remote_post_id: String(input.remotePostId || ''),
                title,
                source_kind: manifest.source_kind,
                source_label: manifest.source_label,
                draft_id: manifest.id,
                revision: manifest.revision,
                files: [...names]
            };
            fsImpl.writeFileSync(pathImpl.join(stagingDir, 'publication.json'), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
            for (let attempt = 0; attempt < 10; attempt += 1) {
                snapshotId = cryptoImpl.randomBytes(6).toString('base64url');
                if (!/^[A-Za-z0-9_-]{8}$/.test(snapshotId)) continue;
                finalDir = pathImpl.join(platformRoot, snapshotId);
                if (!fsImpl.existsSync(finalDir)) break;
                finalDir = '';
            }
            if (!finalDir) throw manuscriptError(500, 'MANUSCRIPT_SNAPSHOT_ID_EXHAUSTED', '고유한 게시 결과 ID를 만들지 못했습니다.');
            metadata.publication_id = snapshotId;
            fsImpl.writeFileSync(pathImpl.join(stagingDir, 'publication.json'), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
            fsImpl.renameSync(stagingDir, finalDir);
            Logger?.info?.(`✅ [ManuscriptDraft] 게시 결과 스냅샷 저장 (platform=${target}, id=${snapshotId})`);
            return { publicationId: snapshotId, platformFolder, files: [...names] };
        } catch (error) {
            try { fsImpl.rmSync(stagingDir, { recursive: true, force: true }); } catch (_) { }
            throw error;
        } finally {
            try {
                if (fsImpl.existsSync(stagingRoot) && fsImpl.readdirSync(stagingRoot).length === 0) fsImpl.rmdirSync(stagingRoot);
            } catch (_) { }
        }
    }

    function defaultRelatedPostsState(targets, markdownText = '') {
        const existingSections = findRelatedPostsSections(markdownText);
        return {
            enabled: false,
            status: existingSections.length > 0 ? RELATED_POSTS_STATUS.INCLUDED : RELATED_POSTS_STATUS.DISABLED,
            count: existingSections.length > 0 ? countRelatedPostLinks(existingSections[0].text) : 0,
            decision: existingSections.length > 0 ? 'user_managed' : 'pending',
            targets: Array.isArray(targets) ? targets.slice() : [],
            updated_at: new Date(now()).toISOString()
        };
    }

    function readContentsMarkdown(locations) {
        return fsImpl.readFileSync(pathImpl.join(locations.source, 'contents.md'), 'utf8');
    }

    function writeContentsMarkdown(locations, text) {
        const markdownPath = pathImpl.join(locations.source, 'contents.md');
        const pendingPath = `${markdownPath}.${process.pid}.${Date.now()}.tmp`;
        fsImpl.writeFileSync(pendingPath, String(text || ''), { mode: 0o600 });
        fsImpl.renameSync(pendingPath, markdownPath);
    }

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

    function parseTime(value, fallback = 0) {
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function cleanupExpiredDrafts(input = {}) {
        const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : now();
        const summary = { scanned: 0, removed: 0, preserved: 0, orphanRemoved: 0, failed: 0 };
        if (!fsImpl.existsSync(workspaceRoot)) return summary;
        let entries = [];
        try {
            entries = fsImpl.readdirSync(workspaceRoot, { withFileTypes: true });
        } catch (error) {
            summary.failed += 1;
            Logger?.warn?.(`⚠️ [ManuscriptDraft] 작업공간 정리 목록 조회 실패: ${error.message}`);
            return summary;
        }
        for (const entry of entries) {
            if (!entry?.isDirectory?.() || !safeDraftId(entry.name)) continue;
            summary.scanned += 1;
            const locations = pathsFor(entry.name);
            try {
                const stats = fsImpl.statSync(locations.root);
                let manifest = null;
                try {
                    manifest = JSON.parse(fsImpl.readFileSync(locations.manifest, 'utf8'));
                } catch (_) { }
                const lifecycle = String(manifest?.lifecycle_status || 'active');
                const referenceMs = lifecycle === 'completed'
                    ? parseTime(manifest?.completed_at, parseTime(manifest?.updated_at, stats.mtimeMs))
                    : parseTime(manifest?.updated_at, stats.mtimeMs);
                const retentionMs = lifecycle === 'completed' ? completedRetentionMs : activeRetentionMs;
                if ((nowMs - referenceMs) < retentionMs) {
                    if (manifest) {
                        const referenced = new Set((manifest.image_slots || []).flatMap((slot) => [slot.current_file, slot.original_file]).filter(Boolean));
                        for (const directory of [locations.assets, locations.source]) {
                            if (!fsImpl.existsSync(directory)) continue;
                            for (const file of fsImpl.readdirSync(directory, { withFileTypes: true })) {
                                if (!file.isFile()) continue;
                                const managedOrphan = directory === locations.assets
                                    || file.name.endsWith('.tmp')
                                    || (/^\d{2}_draft-[a-f0-9-]+\.(?:png|jpe?g|webp|avif)$/i.test(file.name) && !referenced.has(file.name));
                                if (!managedOrphan) continue;
                                fsImpl.rmSync(pathImpl.join(directory, file.name), { force: true });
                                summary.orphanRemoved += 1;
                            }
                        }
                    }
                    summary.preserved += 1;
                    continue;
                }
                fsImpl.rmSync(locations.root, { recursive: true, force: true });
                summary.removed += 1;
            } catch (error) {
                summary.failed += 1;
                Logger?.warn?.(`⚠️ [ManuscriptDraft] 만료 작업공간 정리 실패 (draft=${entry.name}): ${error.message}`);
            }
        }
        if (summary.removed > 0 || summary.orphanRemoved > 0 || summary.failed > 0) {
            Logger?.info?.(`🧹 [ManuscriptDraft] 작업공간 정리 완료 (scanned=${summary.scanned}, removed=${summary.removed}, orphan=${summary.orphanRemoved}, preserved=${summary.preserved}, failed=${summary.failed})`);
        }
        return summary;
    }

    function assertRevision(manifest, expected) {
        const value = Number(expected);
        if (!Number.isInteger(value) || value !== Number(manifest.revision)) {
            throw manuscriptError(409, 'MANUSCRIPT_DRAFT_REVISION_CONFLICT', '원고가 다른 작업으로 변경되었습니다. 최신 미리보기를 확인해 주세요.');
        }
    }

    function assertDraftActive(manifest) {
        if (manifest.lifecycle_status === 'completed') {
            throw manuscriptError(409, 'MANUSCRIPT_DRAFT_COMPLETED', '이미 처리한 원고입니다. 다음 글을 시작해 주세요.');
        }
    }

    function currentFileForSlot(locations, slot) {
        return slot.current_file ? pathImpl.join(locations.source, slot.current_file) : '';
    }

    function getContentVersion(locations, manifest) {
        const hash = cryptoImpl.createHash('sha256');
        hash.update('manuscript-result-v1\0');
        hash.update(readContentsMarkdown(locations));
        for (const slot of [...(manifest.image_slots || [])].sort((left, right) => Number(left.index) - Number(right.index))) {
            const state = String(slot.state || (slot.current_file ? 'ready' : 'missing'));
            hash.update(`\0${slot.index}:${state}\0`);
            if (state === 'excluded' || !slot.current_file) continue;
            const imagePath = currentFileForSlot(locations, slot);
            if (fsImpl.existsSync(imagePath)) hash.update(fsImpl.readFileSync(imagePath));
        }
        return hash.digest('hex');
    }

    function getPublishedTargets(manifest, contentVersion) {
        return [...new Set((manifest.publication_history || [])
            .filter((entry) => entry.content_version === contentVersion)
            .map((entry) => String(entry.target || ''))
            .filter(Boolean))];
    }

    function assertNotPublished(input = {}) {
        const { locations, manifest } = readManifest(input.draftId);
        if (input.revision !== undefined) assertRevision(manifest, input.revision);
        assertDraftActive(manifest);
        const target = input.target !== undefined
            ? requireSinglePublishTarget([input.target])[0]
            : requireSinglePublishTarget(manifest.settings.targets)[0];
        const contentVersion = getContentVersion(locations, manifest);
        if ((manifest.publication_history || []).some((entry) => (
            entry.content_version === contentVersion && entry.target === target
        ))) {
            const targetName = target === 'naver' ? '네이버' : '워드프레스';
            throw manuscriptError(409, 'MANUSCRIPT_ALREADY_PUBLISHED_TO_TARGET', `이 원고는 이미 ${targetName}에 처리했습니다.`);
        }
        return { contentVersion, target, publishedTargets: getPublishedTargets(manifest, contentVersion) };
    }

    function buildPublicDraft(manifest, locations) {
        const preview = buildLocalMarkdownPreview({
            directoryPath: locations.source,
            targets: manifest.settings.targets,
            postStatus: manifest.settings.postStatus,
            scheduleDate: manifest.settings.scheduleDate,
            imageGeneration: false
        }, { fs: fsImpl, path: pathImpl, findImageByPrefix });
        if (manifest.source_kind === 'paste') {
            preview.source = { ...preview.source, type: 'pasted_markdown', folderName: manifest.source_label };
        } else if (manifest.source_kind === 'folder') {
            preview.source = { ...preview.source, type: 'local_markdown', folderName: manifest.source_label };
        } else if (manifest.source_kind === 'ai') {
            preview.source = { ...preview.source, type: 'generated_quick_post', folderName: manifest.source_label };
        }
        const slotByBlockId = new Map(manifest.image_slots.filter((slot) => slot.block_id).map((slot) => [slot.block_id, slot]));
        const slotByIndex = new Map(manifest.image_slots.map((slot) => [Number(slot.index), slot]));
        preview.images = preview.images.map((image) => {
            const slot = (image.blockId && slotByBlockId.get(image.blockId)) || slotByIndex.get(Number(image.index));
            const slotState = String(slot?.state || (slot?.current_file ? 'ready' : 'missing'));
            const excluded = slotState === 'excluded';
            const exists = Boolean(!excluded && slot?.current_file && fsImpl.existsSync(currentFileForSlot(locations, slot)));
            return {
                ...image,
                blockId: slot?.block_id || image.blockId || '',
                slotId: slot?.id || slotIdForImage(image),
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
            const image = preview.images.find((entry) => (item.blockId && entry.blockId === item.blockId) || Number(entry.index) === Number(item.index));
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
        const contentVersion = getContentVersion(locations, manifest);
        return {
            draftId: manifest.id,
            revision: manifest.revision,
            contentVersion,
            publishedTargets: getPublishedTargets(manifest, contentVersion),
            sourceKind: manifest.source_kind,
            relatedPosts: manifest.related_posts || defaultRelatedPostsState(manifest.settings?.targets, readContentsMarkdown(locations)),
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
            const preview = buildLocalMarkdownPreview({ markdownText, folderName: '붙여넣기', ...settings }, { fs: fsImpl, path: pathImpl, findImageByPrefix });
            fsImpl.writeFileSync(pathImpl.join(locations.source, 'contents.md'), markdownText, { mode: 0o600 });
            const createdAt = new Date(now()).toISOString();
            const manifest = {
                schema_version: 1,
                id,
                revision: 1,
                source_kind: 'paste',
                source_label: '붙여넣기',
                created_at: createdAt,
                updated_at: createdAt,
                lifecycle_status: 'active',
                settings,
                related_posts: defaultRelatedPostsState(settings.targets, markdownText),
                image_slots: preview.images.map((image) => ({
                    id: slotIdForImage(image),
                    block_id: image.blockId || '',
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
            for (const image of generatedImages) {
                const index = Number(image?.index);
                const buffer = Buffer.isBuffer(image?.buffer) ? image.buffer : null;
                if (!Number.isInteger(index) || index < 0 || !buffer) continue;
                const detected = validateImageBuffer(buffer);
                const fileName = `${String(index).padStart(2, '0')}_generated${detected.extension}`;
                fsImpl.writeFileSync(pathImpl.join(locations.source, fileName), buffer, { mode: 0o600 });
                fsImpl.writeFileSync(pathImpl.join(locations.originals, fileName), buffer, { mode: 0o600 });
                imageByIndex.set(index, fileName);
            }
            const settings = normalizeDraftSettings(input);
            const preview = buildLocalMarkdownPreview({ directoryPath: locations.source, ...settings, imageGeneration: false }, { fs: fsImpl, path: pathImpl, findImageByPrefix });
            const createdAt = new Date(now()).toISOString();
            const manifest = {
                schema_version: 1,
                id,
                revision: 1,
                source_kind: 'ai',
                source_label: String(input.sourceLabel || preview.title || '바로 생성 원고').slice(0, 300),
                source_metadata: input.sourceMetadata && typeof input.sourceMetadata === 'object' ? input.sourceMetadata : {},
                created_at: createdAt,
                updated_at: createdAt,
                lifecycle_status: 'active',
                settings,
                related_posts: defaultRelatedPostsState(settings.targets, markdownText),
                image_slots: preview.images.map((image) => {
                    const fileName = imageByIndex.get(Number(image.index)) || '';
                    return {
                        id: slotIdForImage(image),
                        block_id: image.blockId || '',
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
            for (const entry of entries.filter((candidate) => /^\d{2}_/.test(candidate.fileName) && !candidate.rootRelativePath.includes('/'))) {
                const source = sources.get(entry.relativePath) || {};
                if (!source.base64Data) continue;
                const buffer = decodeBase64(source.base64Data);
                validateImageBuffer(buffer);
                const safeName = pathImpl.basename(entry.fileName);
                fsImpl.writeFileSync(pathImpl.join(locations.source, safeName), buffer, { mode: 0o600 });
                fsImpl.writeFileSync(pathImpl.join(locations.originals, safeName), buffer, { mode: 0o600 });
            }
            const settings = normalizeDraftSettings(input);
            const preview = buildLocalMarkdownPreview({ directoryPath: locations.source, ...settings, imageGeneration: settings.imageMode === 'generate' }, { fs: fsImpl, path: pathImpl, findImageByPrefix });
            const createdAt = new Date(now()).toISOString();
            const manifest = {
                schema_version: 1,
                id,
                revision: 1,
                source_kind: 'folder',
                source_label: String(input.folderName || preview.source.folderName || '원고 폴더').slice(0, 300),
                created_at: createdAt,
                updated_at: createdAt,
                lifecycle_status: 'active',
                settings,
                related_posts: defaultRelatedPostsState(settings.targets, String(markdownSource.textContent || preferredEntry.textContent || '')),
                image_slots: preview.images.map((image) => ({
                    id: slotIdForImage(image),
                    block_id: image.blockId || '',
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
        assertDraftActive(manifest);
        const normalizedSlotId = safeSlotId(slotId);
        const slot = manifest.image_slots.find((item) => item.id === normalizedSlotId);
        if (!slot) throw manuscriptError(404, 'MANUSCRIPT_IMAGE_SLOT_NOT_FOUND', '이미지 영역을 찾지 못했습니다.');
        const previousSlots = manifest.image_slots.map((item) => ({ ...item }));
        mutate({ locations, manifest, slot });
        manifest.revision += 1;
        manifest.updated_at = new Date(now()).toISOString();
        manifest.lifecycle_status = 'active';
        delete manifest.completed_at;
        atomicWriteJson(fsImpl, locations.manifest, manifest);
        cleanupUnreferencedDraftAssets(previousSlots, manifest.image_slots, locations);
        return buildPublicDraft(manifest, locations);
    }

    function updateGeneratedSlot(id, slotId, expectedPrompt, mutate) {
        const { locations, manifest } = readManifest(id);
        assertDraftActive(manifest);
        const normalizedSlotId = safeSlotId(slotId);
        const slot = manifest.image_slots.find((item) => item.id === normalizedSlotId);
        if (!slot) throw manuscriptError(409, 'MANUSCRIPT_IMAGE_SLOT_CHANGED', '이미지 영역이 편집 중 변경되어 생성한 이미지를 적용하지 않았습니다.');
        if (String(slot.prompt || '').trim() !== String(expectedPrompt || '').trim()) {
            throw manuscriptError(409, 'MANUSCRIPT_IMAGE_PROMPT_CHANGED', '이미지 프롬프트가 생성 중 변경되어 결과를 적용하지 않았습니다. 최신 프롬프트로 다시 생성해 주세요.');
        }
        const previousSlots = manifest.image_slots.map((item) => ({ ...item }));
        mutate({ locations, manifest, slot });
        manifest.revision += 1;
        manifest.updated_at = new Date(now()).toISOString();
        manifest.lifecycle_status = 'active';
        delete manifest.completed_at;
        atomicWriteJson(fsImpl, locations.manifest, manifest);
        cleanupUnreferencedDraftAssets(previousSlots, manifest.image_slots, locations);
        return buildPublicDraft(manifest, locations);
    }

    function cleanupUnreferencedDraftAssets(previousSlots = [], nextSlots = [], locations = {}) {
        const referenced = new Set((nextSlots || []).flatMap((slot) => [slot.current_file, slot.original_file]).filter(Boolean));
        const candidates = new Map();
        for (const slot of previousSlots || []) {
            if (slot.current_file && slot.current_origin !== 'folder') candidates.set(slot.current_file, slot.current_origin);
            if (slot.original_file && slot.original_origin !== 'folder') candidates.set(slot.original_file, slot.original_origin);
        }
        for (const [fileName, origin] of candidates) {
            if (referenced.has(fileName) || !['generated', 'user'].includes(origin)) continue;
            try { fsImpl.rmSync(pathImpl.join(locations.source, pathImpl.basename(fileName)), { force: true }); } catch (_) { }
        }
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

    function removeImage(input = {}) {
        return updateSlot(input.draftId, input.revision, input.slotId, ({ slot }) => {
            slot.current_file = '';
            slot.current_origin = '';
            if (slot.original_origin !== 'folder') {
                slot.original_file = '';
                slot.original_origin = '';
            }
            slot.state = 'missing';
        });
    }

    function updateSettings(input = {}) {
        return updateSlotless(input.draftId, input.revision, ({ manifest }) => {
            manifest.settings = normalizeDraftSettings(input, manifest.settings);
            if (manifest.related_posts?.enabled === true) {
                manifest.related_posts.targets = manifest.settings.targets.slice();
            }
        });
    }

    function updateMarkdown(input = {}) {
        return updateSlotless(input.draftId, input.revision, ({ locations, manifest }) => {
            if (!['ai', 'paste', 'folder'].includes(manifest.source_kind)) {
                throw manuscriptError(409, 'MANUSCRIPT_DRAFT_SOURCE_READ_ONLY', '이 원고의 본문은 현재 입력 방식에서 변경할 수 없습니다.');
            }
            const previousMarkdown = readContentsMarkdown(locations);
            const markdownText = String(input.markdownText || '');
            const previousRelatedSections = findRelatedPostsSections(previousMarkdown);
            const nextRelatedSections = findRelatedPostsSections(markdownText);
            const relatedPosts = manifest.related_posts || defaultRelatedPostsState(manifest.settings?.targets, previousMarkdown);
            if (previousRelatedSections.length > 0 && nextRelatedSections.length === 0) {
                relatedPosts.status = RELATED_POSTS_STATUS.REMOVED;
                relatedPosts.count = 0;
                relatedPosts.decision = 'user_removed';
            } else if (nextRelatedSections.length > 0) {
                const previousSection = previousRelatedSections[0]?.text || '';
                const nextSection = nextRelatedSections[0].text;
                if (previousRelatedSections.length === 0 || previousSection !== nextSection) {
                    relatedPosts.status = RELATED_POSTS_STATUS.INCLUDED;
                    relatedPosts.count = countRelatedPostLinks(nextSection);
                    relatedPosts.decision = 'user_managed';
                }
            } else if (relatedPosts.enabled === true
                && relatedPosts.status === RELATED_POSTS_STATUS.INCLUDED
                && !relatedPosts.decision) {
                // Drafts created by older versions may have links manually removed
                // before deletion intent was persisted. Never restore them on upgrade.
                relatedPosts.status = RELATED_POSTS_STATUS.REMOVED;
                relatedPosts.count = 0;
                relatedPosts.decision = 'user_removed';
            }
            manifest.related_posts = relatedPosts;
            const settings = normalizeDraftSettings(input, manifest.settings);
            const preview = buildLocalMarkdownPreview({ directoryPath: locations.source, markdownText, folderName: manifest.source_label, ...settings }, { fs: fsImpl, path: pathImpl, findImageByPrefix });
            const previousByBlockId = new Map(manifest.image_slots.filter((slot) => slot.block_id).map((slot) => [slot.block_id, slot]));
            const previousByIndex = new Map(manifest.image_slots.map((slot) => [Number(slot.index), slot]));
            manifest.settings = settings;
            manifest.image_slots = preview.images.map((image) => {
                const previous = (image.blockId && previousByBlockId.get(image.blockId)) || previousByIndex.get(Number(image.index));
                const currentExists = Boolean(previous?.current_file && fsImpl.existsSync(currentFileForSlot(locations, previous)));
                return {
                    id: slotIdForImage(image),
                    block_id: image.blockId || previous?.block_id || '',
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
            const sourceLabel = manifest.source_kind === 'folder' ? '폴더'
                : manifest.source_kind === 'ai' ? '바로 생성' : '붙여넣기';
            Logger?.info?.(`✅ [ManuscriptDraft] ${sourceLabel} 원고 갱신 완료 (draft=${input.draftId}, images=${preview.stats.imageBlockCount})`);
        });
    }

    function updateSlotless(id, expectedRevision, mutate) {
        const { locations, manifest } = readManifest(id);
        assertRevision(manifest, expectedRevision);
        assertDraftActive(manifest);
        const previousSlots = manifest.image_slots.map((slot) => ({ ...slot }));
        mutate({ locations, manifest });
        manifest.revision += 1;
        manifest.updated_at = new Date(now()).toISOString();
        manifest.lifecycle_status = 'active';
        delete manifest.completed_at;
        atomicWriteJson(fsImpl, locations.manifest, manifest);
        cleanupUnreferencedDraftAssets(previousSlots, manifest.image_slots, locations);
        return buildPublicDraft(manifest, locations);
    }

    async function generateImage(input = {}) {
        if (typeof generateAiImage !== 'function') throw manuscriptError(503, 'MANUSCRIPT_IMAGE_GENERATOR_UNAVAILABLE', 'AI Gateway Plugin을 사용할 수 없어 이미지를 만들지 않았습니다.');
        const { locations, manifest } = readManifest(input.draftId);
        assertRevision(manifest, input.revision);
        assertDraftActive(manifest);
        const slot = manifest.image_slots.find((item) => item.id === safeSlotId(input.slotId));
        if (!slot) throw manuscriptError(404, 'MANUSCRIPT_IMAGE_SLOT_NOT_FOUND', '이미지 영역을 찾지 못했습니다.');
        if (!String(slot.prompt || '').trim()) throw manuscriptError(400, 'MANUSCRIPT_IMAGE_PROMPT_REQUIRED', 'AI 이미지를 만들 프롬프트가 없습니다.');
        Logger?.info?.(`🎨 [ManuscriptDraft] ${slot.id} AI 이미지 생성 중 (draft=${input.draftId})`);
        throwIfCanceled(input.signal);
        let buffer;
        const generated = await generateAiImage(slot.prompt, { signal: input.signal, onProgress: input.onProgress });
        throwIfCanceled(input.signal);
        if (!generated || typeof generated.dataBase64 !== 'string') throw new Error('AI Gateway returned invalid image data.');
        buffer = Buffer.from(generated.dataBase64, 'base64');
        const detected = validateImageBuffer(buffer);
        return updateGeneratedSlot(input.draftId, input.slotId, slot.prompt, ({ locations: latestLocations, slot: latestSlot }) => {
            replaceSlotFile({ locations: latestLocations, slot: latestSlot, buffer, extension: detected.extension, origin: 'generated' });
            Logger?.info?.(`✅ [ManuscriptDraft] ${latestSlot.id} AI 이미지 적용 완료 (draft=${input.draftId})`);
        });
    }

    async function generateMissingImages(input = {}) {
        let current = getDraft(input.draftId);
        if (Number(input.revision) !== Number(current.revision)) assertRevision({ revision: current.revision }, input.revision);
        const targets = current.images.filter((image) => !image.excluded && !image.exists && String(image.prompt || '').trim());
        for (const [index, image] of targets.entries()) {
            throwIfCanceled(input.signal);
            input.onProgress?.({ current: index + 1, total: targets.length, completed: index, slotId: image.slotId, phase: 'generating' });
            try {
                current = await generateImage({
                    draftId: input.draftId,
                    revision: current.revision,
                    slotId: image.slotId,
                    signal: input.signal,
                    onProgress: (event) => input.onProgress?.({ ...event, current: index + 1, total: targets.length, slotId: image.slotId })
                });
                input.onProgress?.({ current: index + 1, total: targets.length, completed: index + 1, slotId: image.slotId, phase: 'completed' });
            } catch (error) {
                if (isCancellation(error, input.signal)) throw error;
                if (current.revision === Number(input.revision)) throw error;
                Logger?.warn?.(`⚠️ [ManuscriptDraft] 빈 이미지 생성 일부 완료 (draft=${input.draftId}): ${error.message}`);
                return { ...current, imageOperationWarning: '완성한 이미지는 유지했습니다. 만들지 못한 이미지는 다시 시도해 주세요.' };
            }
        }
        return current;
    }

    async function refreshDraftRelatedPosts(input = {}) {
        if (input.enabled !== true) {
            return getDraft(input.draftId);
        }
        const attempt = async (revision) => {
            const { locations, manifest } = readManifest(input.draftId);
            assertRevision(manifest, revision);
            const currentTargets = Array.isArray(manifest.settings?.targets) ? manifest.settings.targets.slice() : [];
            const stored = manifest.related_posts || {};
            const raw = readContentsMarkdown(locations);
            const existingSections = findRelatedPostsSections(raw);
            if (stored.decision === 'user_removed') {
                return buildPublicDraft(manifest, locations);
            }
            if (existingSections.length === 0
                && stored.enabled === true
                && stored.status === RELATED_POSTS_STATUS.INCLUDED
                && !stored.decision) {
                manifest.related_posts = {
                    ...stored,
                    status: RELATED_POSTS_STATUS.REMOVED,
                    count: 0,
                    decision: 'user_removed',
                    updated_at: new Date(now()).toISOString()
                };
                atomicWriteJson(fsImpl, locations.manifest, manifest);
                return buildPublicDraft(manifest, locations);
            }
            if (existingSections.length > 0 && stored.decision !== 'automatic') {
                manifest.related_posts = {
                    ...stored,
                    enabled: true,
                    status: RELATED_POSTS_STATUS.INCLUDED,
                    count: countRelatedPostLinks(existingSections[0].text),
                    decision: 'user_managed',
                    updated_at: new Date(now()).toISOString()
                };
                atomicWriteJson(fsImpl, locations.manifest, manifest);
                return buildPublicDraft(manifest, locations);
            }
            if (stored.decision === 'automatic') {
                return buildPublicDraft(manifest, locations);
            }
            const finalized = await finalizeManuscriptRelatedPosts({
                markdownText: raw,
                title: extractManuscriptTitle(raw),
                enabled: true,
                gateway: relatedPostsGateway
            });
            return updateSlotless(input.draftId, revision, ({ locations: latestLocations, manifest: latestManifest }) => {
                writeContentsMarkdown(latestLocations, finalized.markdownText);
                latestManifest.related_posts = {
                    enabled: true,
                    status: finalized.status,
                    count: finalized.count,
                    decision: finalized.decision || 'pending',
                    targets: currentTargets.slice(),
                    updated_at: new Date(now()).toISOString()
                };
                Logger?.info?.(`🔗 [ManuscriptDraft] 연관글 확정 (draft=${input.draftId}, status=${finalized.status}, count=${finalized.count})`);
            });
        };
        try {
            return await attempt(input.revision);
        } catch (error) {
            if (error?.code === 'MANUSCRIPT_DRAFT_REVISION_CONFLICT') {
                const current = getDraft(input.draftId);
                return attempt(current.revision);
            }
            throw error;
        }
    }

    async function preparePublishPayload(input = {}) {
        const { manifest } = readManifest(input.draftId);
        assertDraftActive(manifest);
        let current = getDraft(input.draftId);
        assertRevision({ revision: current.revision }, input.revision);
        // All manuscript sources finish image work in the preparation UI.
        // Keep unresolved prompts for temporary saves instead of doing paid AI
        // work as an implicit side effect of publishing.
        const targets = [];
        const failedSlotIds = [];
        let generatedCount = 0;
        for (const [index, image] of targets.entries()) {
            try {
                input.onProgress?.({ stage: 'image_generation', current: index + 1, total: targets.length });
            } catch (progressError) {
                Logger?.warn?.(`발행 준비 상태 전달 실패: ${progressError.message}`);
            }
            try {
                current = await generateImage({
                    draftId: input.draftId,
                    revision: current.revision,
                    slotId: image.slotId
                });
                generatedCount += 1;
            } catch (error) {
                failedSlotIds.push(image.slotId);
                Logger?.warn?.(`⚠️ [ManuscriptDraft] 발행 전 이미지 자동 생성 실패 (draft=${input.draftId}, slot=${image.slotId}): ${error.message}`);
            }
        }
        const payload = buildPublishPayload({
            draftId: input.draftId,
            revision: current.revision,
            ...(Object.hasOwn(input, 'postStatus') ? { postStatus: input.postStatus } : {}),
            ...(Object.hasOwn(input, 'scheduleDate') ? { scheduleDate: input.scheduleDate } : {})
        });
        payload.publishPolicy = {
            ...payload.publishPolicy,
            draftRevision: current.revision,
            autoGenerationTargetCount: targets.length,
            autoGeneratedCount: generatedCount,
            autoGenerationFailedCount: failedSlotIds.length
        };
        if (targets.length > 0) {
            Logger?.info?.(`🖼️ [ManuscriptDraft] 발행 전 이미지 자동 완성 결과 (draft=${input.draftId}, generated=${generatedCount}, failed=${failedSlotIds.length})`);
        }
        return payload;
    }

    function buildPublishPayload(input = {}) {
        const { locations, manifest } = readManifest(input.draftId);
        assertRevision(manifest, input.revision);
        assertDraftActive(manifest);
        const omittedIndexes = new Set(manifest.image_slots
            .filter((slot) => slot.state === 'excluded' || (
                (!slot.current_file || !fsImpl.existsSync(currentFileForSlot(locations, slot)))
                && !String(slot.prompt || '').trim()
            ))
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
                    textContent: stripImageBlocksByIndex(fsImpl.readFileSync(filePath, 'utf8'), omittedIndexes)
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
            && String(slot.prompt || '').trim()
            && (!slot.current_file || !fsImpl.existsSync(currentFileForSlot(locations, slot)))
        )).length;
        const requestedPostStatus = Object.hasOwn(input, 'postStatus')
            ? normalizePostStatus(input.postStatus)
            : normalizePostStatus(manifest.settings.postStatus);
        if (!['publish', 'draft', 'schedule'].includes(requestedPostStatus)) {
            throw manuscriptError(400, 'MANUSCRIPT_POST_STATUS_INVALID', '게시 방식이 올바르지 않습니다.');
        }
        const scheduleDate = Object.hasOwn(input, 'scheduleDate')
            ? String(input.scheduleDate || '').trim()
            : String(manifest.settings.scheduleDate || '').trim();
        if (requestedPostStatus === 'schedule' && !scheduleDate) {
            throw manuscriptError(400, 'MANUSCRIPT_SCHEDULE_DATE_REQUIRED', '예약 발행 일시를 입력해 주세요.');
        }
        const forcedDraft = unresolvedCount > 0 && requestedPostStatus !== 'draft';
        return {
            sourceKind: manifest.source_kind,
            folderName: manifest.source_label,
            selectedFiles: selectedFiles.map((entry) => ({ ...entry, relativePath: `draft-${manifest.id}/${entry.name}` })),
            settings: {
                ...manifest.settings,
                imageMode: 'prompt_only',
                postStatus: forcedDraft ? 'draft' : requestedPostStatus,
                scheduleDate
            },
            publishPolicy: { requestedPostStatus, effectivePostStatus: forcedDraft ? 'draft' : requestedPostStatus, unresolvedImageCount: unresolvedCount, forcedDraft }
        };
    }

    function markPublished(input = {}) {
        const { locations, manifest } = readManifest(input.draftId);
        assertRevision(manifest, input.revision);
        const publication = assertNotPublished({
            draftId: input.draftId,
            revision: input.revision,
            target: input.target
        });
        const publishedAt = new Date(now()).toISOString();
        manifest.publication_history = [...(manifest.publication_history || []), {
            content_version: publication.contentVersion,
            target: publication.target,
            post_status: normalizePostStatus(input.postStatus || manifest.settings.postStatus),
            published_at: publishedAt
        }];
        manifest.lifecycle_status = 'active';
        manifest.updated_at = publishedAt;
        delete manifest.completed_at;
        atomicWriteJson(fsImpl, locations.manifest, manifest);
        Logger?.info?.(`✅ [ManuscriptDraft] 플랫폼 발행 기록 (draft=${manifest.id}, revision=${manifest.revision}, target=${publication.target})`);
        return buildPublicDraft(manifest, locations);
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

    cleanPublicationStaging();
    const startupCleanup = cleanupExpiredDrafts();
    if (startupCleanup.removed > 0) {
        Logger?.info?.(`ℹ️ [ManuscriptDraft] 만료 원고 ${startupCleanup.removed}개를 시작 시 정리했습니다.`);
    }

    return { createFolderDraft, createPasteDraft, createAiDraft, getDraft, updateSettings, updateMarkdown, importLocalImage, excludeImage, restoreImage, removeImage, generateImage, generateMissingImages, refreshDraftRelatedPosts, preparePublishPayload, buildPublishPayload, assertNotPublished, markPublished, persistPublicationSnapshot, cleanupExpiredDrafts, getImage };
}

module.exports = { createManuscriptDraftService, detectImageType, validateImageBuffer };
