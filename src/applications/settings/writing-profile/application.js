'use strict';

const {
    createWritingProfileRepository,
    applyWritingProfileRuntimeAliases
} = require('../../../content/writing-profile-repository');
const {
    DEFAULT_CONTENT_WRITING_PROFILE_METADATA,
    getDefaultContentWritingProfile
} = require('../../../services/content-writing/writing-profile');
const { createStyleReferenceAnalyzer } = require('./reference-analyzer');
const { createWritingProfilePreviewService } = require('./preview');

function toWritingModelSelection(model = {}) {
    const provider = String(model.provider || '').trim().toLowerCase();
    const modelId = String(model.code || '').trim();
    return provider && modelId ? { provider, modelId } : undefined;
}

function pickGatewayGenerationOptions(options = {}) {
    return typeof options.temperature === 'number' ? { temperature: options.temperature } : undefined;
}

function createSettingsWritingProfileApplication(deps = {}) {
    const {
        fs,
        path,
        config = {},
        fetchStyleReference,
        blogWritingApplication,
        aiGenerationService,
        styleReferenceAnalyzer,
        writingProfilePreviewService
    } = deps;

    let repository = null;
    let referenceAnalyzer = styleReferenceAnalyzer || null;
    let previewService = writingProfilePreviewService || null;

    function getRepository() {
        if (repository) return repository;
        const runtimeFs = fs || require('node:fs');
        const runtimePath = path || require('node:path');
        repository = createWritingProfileRepository({
            fs: runtimeFs,
            path: runtimePath,
            filePath: config.WRITING_PROFILE_PATH
                || runtimePath.join(config.CONFIG_DIR || process.cwd(), 'config', 'writing_profile.json'),
            legacyContentConfig: config.content
        });
        return repository;
    }

    function getReferenceAnalyzer() {
        if (referenceAnalyzer) return referenceAnalyzer;
        if (typeof blogWritingApplication?.generateText !== 'function') {
            throw new Error('Blog Writing Application is required for style reference analysis.');
        }
        if (typeof fetchStyleReference !== 'function') {
            throw new Error('Style reference fetch dependency is required.');
        }
        referenceAnalyzer = createStyleReferenceAnalyzer({
            fetchStyleReference,
            generateText: (prompt, modelOptions = {}) => blogWritingApplication.generateText(prompt, {
                modelSelection: toWritingModelSelection(config.TEXT_MODEL_CONFIG),
                generationOptions: pickGatewayGenerationOptions(modelOptions)
            }),
            getWritingModelInfo: () => {
                const model = config.TEXT_MODEL_CONFIG || {};
                return { provider: model.provider, code: model.code, name: model.name };
            }
        });
        return referenceAnalyzer;
    }

    function getPreviewService() {
        if (previewService) return previewService;
        previewService = createWritingProfilePreviewService({
            generateText: async (prompt, modelOptions = {}) => {
                if (typeof aiGenerationService?.generateText !== 'function'
                    || typeof aiGenerationService?.resolveModel !== 'function') {
                    throw new Error('AI Generation service is required for writing profile preview.');
                }
                const modelSelection = aiGenerationService.resolveModel(
                    'text',
                    toWritingModelSelection(config.TEXT_MODEL_CONFIG)
                );
                if (!modelSelection) {
                    throw Object.assign(new Error('설정된 글쓰기 모델을 AI Gateway에서 사용할 수 없습니다.'), {
                        code: 'AI_GATEWAY_UNSUPPORTED_ROUTE'
                    });
                }
                const generationOptions = pickGatewayGenerationOptions(modelOptions);
                const result = await aiGenerationService.generateText({
                    modelSelection,
                    prompt,
                    ...(generationOptions ? { options: generationOptions } : {}),
                    ...(aiGenerationService.supportsFeature?.('text', modelSelection, 'jsonResponse')
                        ? { responseFormat: 'json' }
                        : {})
                }, modelOptions.signal ? { signal: modelOptions.signal } : {});
                return result?.content;
            },
            config
        });
        return previewService;
    }

    function toResponse(result) {
        return {
            schema_version: result.document.schema_version,
            active_profile: result.document.active_profile,
            default_profile_overrides: result.document.default_profile_overrides,
            custom_profile: result.document.custom_profile,
            effective_profile: result.effective_profile,
            default_profile: getDefaultContentWritingProfile(),
            default_profile_metadata: { ...DEFAULT_CONTENT_WRITING_PROFILE_METADATA },
            source: result.source,
            warnings: result.warnings,
            updated_at: result.document.updated_at
        };
    }

    function applyResult(result) {
        applyWritingProfileRuntimeAliases(config, result.effective_profile);
        config.CONTENT_WRITING_PROFILE_SOURCE = result.source;
        config.CONTENT_WRITING_PROFILE_WARNINGS = result.warnings;
    }

    function currentResponse() {
        const result = getRepository().read();
        applyResult(result);
        return toResponse(result);
    }

    return {
        getWritingProfile() {
            return currentResponse();
        },

        saveWritingProfile(requestBody = {}) {
            const result = getRepository().save(requestBody);
            applyResult(result);
            return toResponse(result);
        },

        useDefaultWritingProfile() {
            const result = getRepository().useDefault();
            applyResult(result);
            return toResponse(result);
        },

        async analyzeWritingProfileReferences(requestBody = {}) {
            return getReferenceAnalyzer()({
                sample_text: requestBody.sample_text,
                blog_urls: requestBody.blog_urls
            });
        },

        deleteWritingProfileReferences() {
            const current = getRepository().read();
            if (!current.document.custom_profile) return toResponse(current);
            const customProfile = JSON.parse(JSON.stringify(current.document.custom_profile));
            customProfile.channels.blog.style_references = {
                sample_text: { value: '', status: 'empty' },
                blog_urls: [],
                fingerprint: null,
                fingerprint_input_hash: null,
                analyzed_at: null,
                analyzer_version: null,
                analyzer_model: null
            };
            const result = getRepository().save({
                active_profile: current.document.active_profile,
                custom_profile: customProfile
            });
            applyResult(result);
            return toResponse(result);
        },

        async previewWritingProfile(requestBody = {}) {
            return getPreviewService()(requestBody);
        }
    };
}

module.exports = { createSettingsWritingProfileApplication };
