'use strict';

const pathDefault = require('path');
const { marked } = require('marked');
const { formatRelatedPostsForNaver } = require('../../../adapters/naver/publishing/related-posts');
const { parseImageBlocks } = require('../../../utilities/markdown/image-blocks');
const { assertDirectPublishAllowed } = require('../../../services/runtime-environment/effects');

const TARGET_FORMATS = Object.freeze({ naver: 'webp', wordpress: 'avif' });
const MIME_TYPES = Object.freeze({ avif: 'image/avif', webp: 'image/webp' });
const FORMAT_EXTENSIONS = Object.freeze({
    avif: new Set(['.avif']),
    webp: new Set(['.webp'])
});

function createBlogPublishingApplication(options = {}) {
    const { imageOptimizationService, naverPublisher, legacyNaverPublisher, wordpressPublishingApplication, CONFIG, Logger, fs, Utils } = options;
    const path = options.path || pathDefault;
    if (typeof legacyNaverPublisher?.publish !== 'function' && typeof naverPublisher?.publish !== 'function') {
        throw new TypeError('Blog Publishing Application requires a Naver publisher.');
    }
    if (!imageOptimizationService || typeof imageOptimizationService.optimizeBuffer !== 'function') {
        throw new TypeError('Blog Publishing Application requires an image optimization service.');
    }
    if (!fs || typeof fs.readFileSync !== 'function' || typeof fs.writeFileSync !== 'function') {
        throw new TypeError('Blog Publishing Application requires filesystem access for prepared image files.');
    }

    function isOptimizationEnabled() {
        return CONFIG?.IMAGE_OPTIMIZATION_ENABLED !== false;
    }

    async function prepareImageAsset(target, asset) {
        const format = TARGET_FORMATS[target];
        if (!format || !asset || !Buffer.isBuffer(asset.bytes)) return asset;
        const currentExtension = path.extname(String(asset.filename || '')).toLowerCase();
        if (FORMAT_EXTENSIONS[format].has(currentExtension)) {
            return { ...asset, mimeType: MIME_TYPES[format] };
        }
        const result = await imageOptimizationService.optimizeBuffer(asset.bytes, {
            format,
            enabled: isOptimizationEnabled(),
            fallbackFormat: currentExtension.replace(/^\./, '')
        });
        if (!result.optimized) return asset;
        const filename = `${path.basename(String(asset.filename), currentExtension)}.${result.format}`;
        Logger?.info?.(`[Blog Publishing] 이미지 변환 완료 (target=${target}, format=${result.format}, bytes=${asset.bytes.length}->${result.buffer.length})`);
        return { ...asset, bytes: result.buffer, filename, mimeType: MIME_TYPES[result.format] };
    }

    async function prepareImageFile(target, filePath) {
        const format = TARGET_FORMATS[target];
        if (!format || !filePath || !fs.existsSync(filePath)) return filePath;
        const extension = path.extname(filePath).toLowerCase();
        if (FORMAT_EXTENSIONS[format].has(extension)) return filePath;
        const originalBytes = fs.readFileSync(filePath);
        const asset = await prepareImageAsset(target, {
            bytes: originalBytes,
            filename: path.basename(filePath),
            mimeType: ''
        });
        if (asset.bytes === originalBytes) return filePath;
        const preparedPath = path.join(path.dirname(filePath), asset.filename);
        fs.writeFileSync(preparedPath, asset.bytes);
        return preparedPath;
    }

    async function publishNaver(directory, request = {}) {
        // Shopping's affiliate-required workflow remains on its current publisher path in this feature.
        if (!naverPublisher || typeof naverPublisher.publish !== 'function' || request.requireAffiliateUrl === true) {
            return legacyNaverPublisher.publish(directory, {
                ...request,
                prepareImageForUpload: (filePath) => prepareImageFile('naver', filePath)
            });
        }
        if (!Utils || typeof Utils.parseMarkdown !== 'function' || typeof Utils.findImageByPrefix !== 'function') {
            throw new TypeError('Naver Plugin publishing requires Blog Markdown utilities.');
        }
        const contentFile = path.join(directory, 'contents.md');
        if (!fs.existsSync(contentFile)) throw new Error('콘텐츠 파일 없음: contents.md');
        const markdown = formatRelatedPostsForNaver(fs.readFileSync(contentFile, 'utf8'));
        const parsed = Utils.parseMarkdown(markdown);
        const title = String(parsed?.title || '').trim();
        if (!title) throw new Error('네이버 발행 원고에 제목이 없습니다.');

        const assets = [];
        const blocks = [];
        const warnings = [];
        let missingImage = false;
        const mimeTypes = {
            '.avif': 'image/avif', '.gif': 'image/gif', '.jpeg': 'image/jpeg',
            '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
        };
        const parsedContents = parsed.contents || [];
        // The first newline after the Markdown title is the title-to-body
        // transition already performed by enterTitle(). Any additional leading
        // newline is authored spacing and must remain a body block.
        let firstBodyItem = 0;
        if (parsedContents[firstBodyItem]?.type === 'newline') firstBodyItem += 1;
        const bodyItems = parsedContents.slice(firstBodyItem);
        for (let itemIndex = 0; itemIndex < bodyItems.length; itemIndex += 1) {
            const item = bodyItems[itemIndex];
            if (item.type === 'image') {
                const imagePath = Utils.findImageByPrefix(directory, item.index);
                if (!imagePath || !fs.existsSync(imagePath)) {
                    missingImage = true;
                    warnings.push(`원고 이미지 ${Number(item.index) + 1}번 파일을 찾지 못해 임시저장했습니다.`);
                    blocks.push({ type: 'paragraph', text: String(item.raw || `[[IMAGE_${item.index}\\n title: ${item.text || ''}\\n prompt: ${item.prompt || ''}\\n]]`) });
                    continue;
                }
                const extension = path.extname(imagePath).toLowerCase();
                const mimeType = mimeTypes[extension];
                if (!mimeType) throw new Error(`지원하지 않는 네이버 이미지 형식입니다: ${extension || '(확장자 없음)'}`);
                const key = `image-${item.index}`;
                const prepared = await prepareImageAsset('naver', {
                    key,
                    bytes: fs.readFileSync(imagePath),
                    filename: path.basename(imagePath),
                    mimeType,
                    altText: String(item.text || '').trim()
                });
                const preparedMime = mimeTypes[path.extname(prepared.filename).toLowerCase()] || prepared.mimeType;
                assets.push({ ...prepared, mimeType: preparedMime });
                const caption = String(item.text || '').trim();
                blocks.push({ type: 'image', assetKey: key, ...(caption ? { caption } : {}) });
                continue;
            }
            if (item.type === 'header-h2' || item.type === 'header-h3') {
                blocks.push({ type: 'heading', level: item.type === 'header-h3' ? 3 : 2, text: item.text || '', ...(item.boldRanges ? { boldRanges: item.boldRanges } : {}) });
                // A direct next line after a Markdown heading has a source
                // newline, but parseMarkdown only materializes blank lines.
                // Preserve that boundary for the Plugin to process explicitly.
                if (item.type === 'header-h2' && bodyItems[itemIndex + 1]
                    && bodyItems[itemIndex + 1].type !== 'newline') {
                    blocks.push({ type: 'newline' });
                }
            } else if (item.type === 'paragraph' || item.type === 'quote' || item.type === 'list-item') {
                blocks.push({ type: item.type, text: item.text || '', ...(item.listType ? { listType: item.listType } : {}), ...(item.boldRanges ? { boldRanges: item.boldRanges } : {}) });
            } else if (item.type === 'separator' || item.type === 'newline') {
                blocks.push({ type: item.type });
            }
        }

        const requestedStatus = request.postStatus || 'publish';
        if (!['draft', 'publish', 'schedule'].includes(requestedStatus)) throw new TypeError('Unsupported Naver publication status.');
        if (requestedStatus === 'schedule' && !String(request.scheduleDate || '').trim()) throw new TypeError('Schedule date is required.');
        const status = missingImage && requestedStatus !== 'draft' ? 'draft' : requestedStatus;
        const affiliateUrl = String(request.affiliateUrl || '').trim();
        if (request.requireAffiliateUrl === true && !/^https?:\/\//i.test(affiliateUrl)) {
            throw new Error('스프레드시트 URL이 비어있거나 형식이 올바르지 않아 작업을 중단합니다.');
        }
        const executionContext = {
            ...(request.signal ? { signal: request.signal } : {}),
            ...(typeof request.onProgress === 'function' ? {
                reportProgress(event) {
                    try {
                        request.onProgress({
                            stage: event.stage || event.phase,
                            current: event.current,
                            total: event.total,
                            postStatus: status
                        });
                    } catch (error) {
                        Logger?.warn?.(`[Blog Publishing] Naver progress callback failed (${String(error?.message || error)})`);
                    }
                }
            } : {})
        };
        Logger?.info?.(`[Blog Publishing] Naver Plugin 발행 준비 (blocks=${blocks.length}, assets=${assets.length}, status=${status})`);
        const result = await naverPublisher.publish({
            title,
            blocks,
            assets: assets.map((asset) => ({
                key: asset.key,
                filename: asset.filename,
                mimeType: asset.mimeType,
                altText: asset.altText || '',
                bytesBase64: asset.bytes.toString('base64')
            })),
            category: String(request.category || '').trim(),
            status,
            ...(status === 'schedule' ? { scheduleDate: String(request.scheduleDate || '') } : {}),
            ...(affiliateUrl ? { affiliateUrl } : {}),
            ...(typeof request.headless === 'boolean' ? { headless: request.headless } : {}),
            ...(typeof request.isLast === 'boolean' ? { isLast: request.isLast } : {})
        }, executionContext);
        const combinedWarnings = [...warnings, ...(Array.isArray(result?.warnings) ? result.warnings : [])];
        return {
            success: true,
            status: result.status,
            postUrl: result.postUrl || '',
            message: result.status === 'draft' ? '네이버 임시저장 완료' : '네이버 블로그 발행 완료',
            warnings: combinedWarnings
        };
    }

    async function publishWordPressManuscript(directory, request = {}, executionContext = {}) {
        assertDirectPublishAllowed(CONFIG, request);
        if (typeof wordpressPublishingApplication?.publish !== 'function') {
            throw new TypeError('WordPress Publishing Application is unavailable.');
        }
        const contentFile = path.join(directory, 'contents.md');
        if (!fs.existsSync(contentFile)) throw new Error('콘텐츠 파일 없음: contents.md');
        const markdownRaw = fs.readFileSync(contentFile, 'utf8');
        const parsed = Utils?.parseMarkdown?.(markdownRaw) || {};
        const title = String(parsed.title || '').trim();
        if (!title) throw new Error('WordPress 원고에 제목이 없습니다.');

        let markdown = markdownRaw;
        const warnings = [];
        const assets = [];
        const permanentAssets = new Map();
        let featuredAsset = '';
        for (const block of parseImageBlocks(markdownRaw)) {
            const promptUrl = String(block.prompt || '').trim();
            const permanentKey = promptUrl && promptUrl === String(CONFIG?.FTC_DISCLOSURE_IMAGE_URL || '').trim()
                ? 'WP_PERMANENT_FTC_URL'
                : promptUrl && promptUrl === String(CONFIG?.SHOPPING_CTA_IMAGE_URL1 || '').trim()
                    ? 'WP_PERMANENT_CTA_URL1'
                    : promptUrl && promptUrl === String(CONFIG?.SHOPPING_CTA_IMAGE_URL2 || '').trim()
                        ? 'WP_PERMANENT_CTA_URL2'
                        : promptUrl && promptUrl === String(CONFIG?.SHOPPING_CTA_IMAGE_URL3 || '').trim()
                            ? 'WP_PERMANENT_CTA_URL3'
                            : '';
            const permanentUrl = permanentKey ? String(CONFIG?.[permanentKey] || '').trim() : '';
            if (permanentUrl) {
                markdown = markdown.replace(block.fullTag, `![${block.title}](${permanentUrl})`);
                continue;
            }

            const imagePath = Utils?.findImageByPrefix?.(directory, block.index);
            if (!imagePath || !fs.existsSync(imagePath)) {
                warnings.push(`이미지 ${block.index}번 누락`);
                continue;
            }
            const preparedPath = typeof request.prepareImageForUpload === 'function'
                ? await request.prepareImageForUpload(imagePath)
                : imagePath;
            const sourceBytes = fs.readFileSync(preparedPath);
            const extension = path.extname(preparedPath);
            const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const slug = block.title.normalize('NFC')
                .replace(/[a-zA-Z0-9]+/g, (match) => match.toLowerCase())
                .replace(/[^a-zA-Z0-9]+/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '') || 'image';
            const fileName = `${slug.slice(0, 100 - uniqueSuffix.length - extension.length - 1)}_${uniqueSuffix}${extension}`;
            const sourceAsset = {
                key: `image-${block.index}`,
                bytes: sourceBytes,
                filename: fileName,
                mimeType: ({ '.avif': 'image/avif', '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[extension.toLowerCase()],
                altText: block.title
            };
            if (!sourceAsset.mimeType) throw new Error(`지원하지 않는 WordPress 이미지 형식입니다: ${extension || '(확장자 없음)'}`);
            const asset = await prepareImageAsset('wordpress', sourceAsset);
            if (asset.bytes !== sourceBytes) {
                const savedName = `${path.basename(imagePath, path.extname(imagePath))}${path.extname(asset.filename)}`;
                const savedPath = path.join(directory, savedName);
                if (!fs.existsSync(savedPath)) fs.writeFileSync(savedPath, asset.bytes);
            }
            assets.push(asset);
            if (!featuredAsset) featuredAsset = asset.key;
            if (permanentKey) permanentAssets.set(asset.key, permanentKey);
            markdown = markdown.replace(block.fullTag, `{{asset:${asset.key}}}`);
        }

        const requestedStatus = request.postStatus || 'draft';
        if (!['draft', 'publish', 'schedule'].includes(requestedStatus)) throw new TypeError('Unsupported WordPress publication status.');
        if (requestedStatus === 'schedule' && !String(request.wpScheduleDate || '').trim()) throw new TypeError('Schedule date is required.');
        const bodyMarkdown = markdown.replace(/^#\s+.+\n?/, '').trim();
        const result = await wordpressPublishingApplication.publish({
            title,
            content: marked(bodyMarkdown),
            status: warnings.length ? 'draft' : requestedStatus,
            ...(requestedStatus === 'schedule' && !warnings.length ? { date: request.wpScheduleDate } : {}),
            category: request.category || '',
            featuredAsset,
            assets
        }, {
            ...executionContext,
            ...(typeof executionContext.onAssetUploaded === 'function' ? {} : {
                onAssetUploaded: ({ key, url }) => {
                    const configKey = permanentAssets.get(key);
                    if (configKey && typeof Utils?.updateConfigValue === 'function') Utils.updateConfigValue(configKey, url);
                }
            })
        });
        const combinedWarnings = [...warnings, ...(Array.isArray(result.warnings) ? result.warnings : [])];
        return {
            ...result,
            status: result.status === 'future' ? 'schedule' : result.status,
            warnings: combinedWarnings.length ? combinedWarnings : null
        };
    }

    async function publishWordPressPlugin(request = {}, executionContext = {}) {
        if (typeof wordpressPublishingApplication?.publish !== 'function') {
            throw new TypeError('WordPress Publishing Application is unavailable.');
        }
        const assets = [];
        for (const asset of Array.isArray(request.assets) ? request.assets : []) {
            assets.push(await prepareImageAsset('wordpress', asset));
        }
        assets.forEach((asset, index) => {
            Logger?.info?.(`[Blog Publishing] 이미지 업로드 준비 (${index + 1}/${assets.length}, mime=${asset.mimeType}, bytes=${asset.bytes.length})`);
        });
        Logger?.info?.(`[Blog Publishing] WordPress 발행 준비 (assets=${assets.length})`);
        return wordpressPublishingApplication.publish({ ...request, assets }, executionContext);
    }

    return Object.freeze({
        listWordPressCategories(search = '', executionContext = {}) {
            if (typeof wordpressPublishingApplication?.listCategories !== 'function') {
                throw new TypeError('WordPress Publishing Application is unavailable.');
            }
            return wordpressPublishingApplication.listCategories(search, executionContext);
        },
        inspectWordPressConnection(input = {}, executionContext = {}) {
            if (typeof wordpressPublishingApplication?.inspectConnection !== 'function') {
                throw new TypeError('WordPress Publishing Application is unavailable.');
            }
            return wordpressPublishingApplication.inspectConnection(input, executionContext);
        },
        prepareImageAsset,
        prepareImageFile,
        publishNaver,
        publishWordPressManuscript,
        publishWordPressPlugin
    });
}

module.exports = { TARGET_FORMATS, createBlogPublishingApplication };
