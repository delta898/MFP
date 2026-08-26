const defaultProfileDocument = require('../config/default_content_writing_profile.json');

const CONTENT_WRITING_PROFILE_SCHEMA_VERSION = 3;

const PROFILE_LIMITS = Object.freeze({
    commonStyleInstruction: 500,
    authorContext: 300,
    channelInstruction: 1000,
    sampleText: 12000,
    referenceUrls: 1,
    referenceUrlLength: 2048,
    referenceTitle: 200,
    referenceError: 300,
    referenceMetadata: 200
});

const PROFILE_ENUMS = Object.freeze({
    writingMode: Object.freeze(['conversational', 'written']),
    speechLevel: Object.freeze(['polite', 'plain']),
    tone: Object.freeze(['calm', 'balanced', 'vivid']),
    writingStrategy: Object.freeze(['search', 'discovery']),
    informationDensity: Object.freeze(['light', 'balanced', 'dense']),
    narratorPresence: Object.freeze(['minimal', 'occasional', 'present']),
    lengthPreset: Object.freeze(['short', 'standard', 'long']),
    opening: Object.freeze(['direct', 'contextual', 'scene']),
    development: Object.freeze(['explanatory', 'problem_solution', 'experience_review', 'comparison']),
    ending: Object.freeze(['summary', 'judgment', 'next_step']),
    headingDensity: Object.freeze(['sparse', 'balanced', 'dense']),
    imageCountMode: Object.freeze(['auto', 'fixed']),
    shoppingMode: Object.freeze(['product_default']),
    referenceStatus: Object.freeze(['empty', 'pending', 'analyzed', 'stale', 'failed']),
    fingerprintOpening: Object.freeze(['answer_first', 'short_context_then_topic', 'scene_then_topic', 'question_then_topic']),
    fingerprintFlow: Object.freeze(['experience', 'information', 'interpretation', 'comparison', 'tip', 'summary', 'next_step']),
    fingerprintParagraph: Object.freeze(['short', 'medium', 'long', 'mixed']),
    fingerprintEnding: Object.freeze(['short_summary', 'judgment_then_soft_suggestion', 'practical_next_step', 'open_question']),
    fingerprintRhythm: Object.freeze(['short', 'medium', 'long', 'short_mixed', 'varied']),
    fingerprintWarmth: Object.freeze(['reserved', 'neutral', 'warm']),
    fingerprintVocabulary: Object.freeze(['everyday', 'balanced', 'technical_explained', 'formal']),
    fingerprintDevice: Object.freeze(['light_question', 'concrete_example', 'analogy', 'contrast', 'enumeration', 'direct_address']),
    fingerprintAvoid: Object.freeze(['long_preface', 'repetitive_summary', 'dense_jargon', 'excessive_exclamation', 'unsupported_personal_claim', 'abrupt_ending'])
});

const ENUM_SETS = Object.freeze(Object.fromEntries(
    Object.entries(PROFILE_ENUMS).map(([key, values]) => [key, new Set(values)])
));

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableText(value, maxLength = Infinity) {
    const normalized = normalizeText(value).slice(0, maxLength);
    return normalized || null;
}

function normalizeEnum(value, enumKey, fallback) {
    const normalized = normalizeText(value).toLowerCase();
    return ENUM_SETS[enumKey].has(normalized) ? normalized : fallback;
}

function normalizeStringList(value, maxItems, maxLength) {
    if (!Array.isArray(value)) return [];
    const result = [];
    for (const item of value) {
        const normalized = normalizeText(item).slice(0, maxLength);
        if (!normalized || result.includes(normalized)) continue;
        result.push(normalized);
        if (result.length >= maxItems) break;
    }
    return result;
}

function normalizeEnumList(value, enumKey, maxItems) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map((item) => normalizeText(item).toLowerCase())))
        .filter((item) => ENUM_SETS[enumKey].has(item))
        .slice(0, maxItems);
}

function normalizeFingerprint(input) {
    if (!isRecord(input)) return null;
    const structure = isRecord(input.structure) ? input.structure : {};
    const voice = isRecord(input.voice) ? input.voice : {};
    return {
        surface: {
            writing_mode: normalizeEnum(input.surface?.writing_mode, 'writingMode', 'conversational'),
            speech_level: normalizeEnum(input.surface?.speech_level, 'speechLevel', 'polite'),
            tone: normalizeEnum(input.surface?.tone, 'tone', 'balanced'),
            information_density: normalizeEnum(input.surface?.information_density, 'informationDensity', 'balanced')
        },
        settings: {
            length_preset: normalizeEnum(input.settings?.length_preset, 'lengthPreset', 'standard'),
            opening: normalizeEnum(input.settings?.opening, 'opening', 'contextual'),
            development: normalizeEnum(input.settings?.development, 'development', 'explanatory'),
            ending: normalizeEnum(input.settings?.ending, 'ending', 'judgment'),
            heading_density: normalizeEnum(input.settings?.heading_density, 'headingDensity', 'balanced')
        },
        structure: {
            opening_pattern: normalizeEnum(structure.opening_pattern, 'fingerprintOpening', 'short_context_then_topic'),
            section_flow: normalizeEnumList(structure.section_flow, 'fingerprintFlow', 8),
            paragraph_length: normalizeEnum(structure.paragraph_length, 'fingerprintParagraph', 'medium'),
            ending_pattern: normalizeEnum(structure.ending_pattern, 'fingerprintEnding', 'short_summary')
        },
        voice: {
            sentence_rhythm: normalizeEnum(voice.sentence_rhythm, 'fingerprintRhythm', 'medium'),
            warmth: normalizeEnum(voice.warmth, 'fingerprintWarmth', 'neutral'),
            vocabulary: normalizeEnum(voice.vocabulary, 'fingerprintVocabulary', 'balanced'),
            rhetorical_devices: normalizeEnumList(voice.rhetorical_devices, 'fingerprintDevice', 8)
        },
        avoid: normalizeEnumList(input.avoid, 'fingerprintAvoid', 12),
        summary: normalizeText(input.summary).slice(0, 300)
    };
}

function normalizeReferenceUrlEntry(input) {
    const source = typeof input === 'string' ? { url: input } : (isRecord(input) ? input : {});
    const url = normalizeText(source.url).slice(0, PROFILE_LIMITS.referenceUrlLength);
    if (!url) return null;
    return {
        url,
        status: normalizeEnum(source.status, 'referenceStatus', 'pending'),
        title: normalizeText(source.title).slice(0, 200),
        error: normalizeText(source.error).slice(0, 300)
    };
}

function normalizeStyleReferences(input) {
    const source = isRecord(input) ? input : {};
    const sampleText = isRecord(source.sample_text) ? source.sample_text : {};
    const blogUrls = [];
    const seenUrls = new Set();
    if (Array.isArray(source.blog_urls)) {
        for (const item of source.blog_urls) {
            const normalized = normalizeReferenceUrlEntry(item);
            if (!normalized || seenUrls.has(normalized.url)) continue;
            seenUrls.add(normalized.url);
            blogUrls.push(normalized);
            if (blogUrls.length >= PROFILE_LIMITS.referenceUrls) break;
        }
    }

    return {
        sample_text: {
            value: normalizeText(sampleText.value).slice(0, PROFILE_LIMITS.sampleText),
            status: normalizeEnum(sampleText.status, 'referenceStatus', 'empty')
        },
        blog_urls: blogUrls,
        fingerprint: normalizeFingerprint(source.fingerprint),
        fingerprint_input_hash: normalizeNullableText(source.fingerprint_input_hash, PROFILE_LIMITS.referenceMetadata),
        analyzed_at: normalizeNullableText(source.analyzed_at, PROFILE_LIMITS.referenceMetadata),
        analyzer_version: normalizeNullableText(source.analyzer_version, PROFILE_LIMITS.referenceMetadata)
    };
}

function normalizeWritingProfile(input = {}) {
    const source = isRecord(input) ? input : {};
    const common = isRecord(source.common) ? source.common : {};
    const voice = isRecord(common.voice) ? common.voice : {};
    const channels = isRecord(source.channels) ? source.channels : {};
    const blog = isRecord(channels.blog) ? channels.blog : {};
    const length = isRecord(blog.length) ? blog.length : {};
    const structure = isRecord(blog.structure) ? blog.structure : {};
    const imagePlan = isRecord(blog.image_plan) ? blog.image_plan : {};
    const shopping = isRecord(channels.shopping) ? channels.shopping : {};
    const fixedCount = Number.isInteger(imagePlan.fixed_count)
        && imagePlan.fixed_count >= 1
        && imagePlan.fixed_count <= 6
        ? imagePlan.fixed_count
        : null;

    return {
        common: {
            writing_strategy: normalizeEnum(common.writing_strategy, 'writingStrategy', 'search'),
            voice: {
                writing_mode: normalizeEnum(voice.writing_mode, 'writingMode', 'conversational'),
                speech_level: normalizeEnum(voice.speech_level, 'speechLevel', 'polite'),
                tone: normalizeEnum(voice.tone, 'tone', 'balanced'),
                information_density: normalizeEnum(voice.information_density, 'informationDensity', 'balanced')
            },
            style_instruction: normalizeText(common.style_instruction).slice(0, PROFILE_LIMITS.commonStyleInstruction)
        },
        channels: {
            blog: {
                narrator_presence: normalizeEnum(blog.narrator_presence, 'narratorPresence', 'occasional'),
                length: {
                    preset: normalizeEnum(length.preset, 'lengthPreset', 'standard')
                },
                structure: {
                    opening: normalizeEnum(structure.opening, 'opening', 'contextual'),
                    development: normalizeEnum(structure.development, 'development', 'explanatory'),
                    ending: normalizeEnum(structure.ending, 'ending', 'judgment'),
                    heading_density: normalizeEnum(structure.heading_density, 'headingDensity', 'balanced')
                },
                image_plan: {
                    count_mode: normalizeEnum(imagePlan.count_mode, 'imageCountMode', 'auto'),
                    fixed_count: fixedCount
                },
                author_context: normalizeText(blog.author_context).slice(0, PROFILE_LIMITS.authorContext),
                additional_instruction: normalizeText(blog.additional_instruction).slice(0, PROFILE_LIMITS.channelInstruction),
                style_references: normalizeStyleReferences(blog.style_references)
            },
            shopping: {
                mode: normalizeEnum(shopping.mode, 'shoppingMode', 'product_default'),
                additional_instruction: normalizeText(shopping.additional_instruction).slice(0, PROFILE_LIMITS.channelInstruction)
            }
        }
    };
}

function pushEnumError(errors, value, path, enumKey) {
    if (value === undefined || value === null || value === '') return;
    const normalized = normalizeText(value).toLowerCase();
    if (!ENUM_SETS[enumKey].has(normalized)) {
        errors.push({
            path,
            code: 'INVALID_ENUM',
            message: `${path} 값이 지원 범위를 벗어났습니다.`
        });
    }
}

function pushTextLimitError(errors, value, path, maxLength) {
    if (value === undefined || value === null) return;
    if (typeof value !== 'string') {
        errors.push({ path, code: 'INVALID_TYPE', message: `${path} 값은 문자열이어야 합니다.` });
        return;
    }
    if (value.trim().length > maxLength) {
        errors.push({ path, code: 'TEXT_TOO_LONG', message: `${path} 값은 ${maxLength}자 이하여야 합니다.` });
    }
}

function pushStringListLimitErrors(errors, value, path, maxItems, maxLength) {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) {
        errors.push({ path, code: 'INVALID_TYPE', message: `${path} 값은 배열이어야 합니다.` });
        return;
    }
    if (value.length > maxItems) {
        errors.push({ path, code: 'TOO_MANY_ITEMS', message: `${path} 항목은 최대 ${maxItems}개까지 사용할 수 있습니다.` });
    }
    value.forEach((item, index) => pushTextLimitError(errors, item, `${path}.${index}`, maxLength));
}

function pushEnumListErrors(errors, value, path, enumKey, maxItems) {
    if (value === undefined || value === null) return;
    if (!Array.isArray(value)) {
        errors.push({ path, code: 'INVALID_TYPE', message: `${path} 값은 배열이어야 합니다.` });
        return;
    }
    if (value.length > maxItems) errors.push({ path, code: 'TOO_MANY_ITEMS', message: `${path} 항목이 너무 많습니다.` });
    value.forEach((item, index) => pushEnumError(errors, item, `${path}.${index}`, enumKey));
}

function validateWritingProfile(input = {}) {
    const errors = [];
    if (!isRecord(input)) {
        return {
            valid: false,
            errors: [{ path: 'profile', code: 'INVALID_TYPE', message: 'profile은 객체여야 합니다.' }]
        };
    }

    const common = isRecord(input.common) ? input.common : {};
    const voice = isRecord(common.voice) ? common.voice : {};
    const channels = isRecord(input.channels) ? input.channels : {};
    const blog = isRecord(channels.blog) ? channels.blog : {};
    const length = isRecord(blog.length) ? blog.length : {};
    const structure = isRecord(blog.structure) ? blog.structure : {};
    const imagePlan = isRecord(blog.image_plan) ? blog.image_plan : {};
    const shopping = isRecord(channels.shopping) ? channels.shopping : {};
    const styleReferences = isRecord(blog.style_references) ? blog.style_references : {};
    const sampleText = isRecord(styleReferences.sample_text) ? styleReferences.sample_text : {};

    pushEnumError(errors, voice.writing_mode, 'common.voice.writing_mode', 'writingMode');
    pushEnumError(errors, common.writing_strategy, 'common.writing_strategy', 'writingStrategy');
    pushEnumError(errors, voice.speech_level, 'common.voice.speech_level', 'speechLevel');
    pushEnumError(errors, voice.tone, 'common.voice.tone', 'tone');
    pushEnumError(errors, voice.information_density, 'common.voice.information_density', 'informationDensity');
    pushTextLimitError(errors, common.style_instruction, 'common.style_instruction', PROFILE_LIMITS.commonStyleInstruction);

    pushEnumError(errors, blog.narrator_presence, 'channels.blog.narrator_presence', 'narratorPresence');
    pushEnumError(errors, length.preset, 'channels.blog.length.preset', 'lengthPreset');
    pushEnumError(errors, structure.opening, 'channels.blog.structure.opening', 'opening');
    pushEnumError(errors, structure.development, 'channels.blog.structure.development', 'development');
    pushEnumError(errors, structure.ending, 'channels.blog.structure.ending', 'ending');
    pushEnumError(errors, structure.heading_density, 'channels.blog.structure.heading_density', 'headingDensity');
    pushEnumError(errors, imagePlan.count_mode, 'channels.blog.image_plan.count_mode', 'imageCountMode');

    if (imagePlan.fixed_count !== undefined && imagePlan.fixed_count !== null) {
        if (!Number.isInteger(imagePlan.fixed_count) || imagePlan.fixed_count < 1 || imagePlan.fixed_count > 6) {
            errors.push({
                path: 'channels.blog.image_plan.fixed_count',
                code: 'OUT_OF_RANGE',
                message: 'channels.blog.image_plan.fixed_count 값은 1~6 사이의 정수여야 합니다.'
            });
        }
    }
    if (normalizeText(imagePlan.count_mode).toLowerCase() === 'fixed' && !Number.isInteger(imagePlan.fixed_count)) {
        errors.push({
            path: 'channels.blog.image_plan.fixed_count',
            code: 'REQUIRED',
            message: '고정 이미지 모드에는 fixed_count가 필요합니다.'
        });
    }

    pushTextLimitError(errors, blog.author_context, 'channels.blog.author_context', PROFILE_LIMITS.authorContext);
    pushTextLimitError(errors, blog.additional_instruction, 'channels.blog.additional_instruction', PROFILE_LIMITS.channelInstruction);
    pushTextLimitError(errors, sampleText.value, 'channels.blog.style_references.sample_text.value', PROFILE_LIMITS.sampleText);
    pushEnumError(errors, sampleText.status, 'channels.blog.style_references.sample_text.status', 'referenceStatus');
    if (styleReferences.blog_urls !== undefined && !Array.isArray(styleReferences.blog_urls)) {
        errors.push({
            path: 'channels.blog.style_references.blog_urls',
            code: 'INVALID_TYPE',
            message: 'channels.blog.style_references.blog_urls 값은 배열이어야 합니다.'
        });
    } else if (Array.isArray(styleReferences.blog_urls) && styleReferences.blog_urls.length > PROFILE_LIMITS.referenceUrls) {
        errors.push({
            path: 'channels.blog.style_references.blog_urls',
            code: 'TOO_MANY_ITEMS',
            message: '참고 URL은 1개만 사용할 수 있습니다.'
        });
    }
    if (Array.isArray(styleReferences.blog_urls)) {
        styleReferences.blog_urls.forEach((entry, index) => {
            const itemPath = `channels.blog.style_references.blog_urls.${index}`;
            const source = typeof entry === 'string' ? { url: entry } : entry;
            if (!isRecord(source)) {
                errors.push({ path: itemPath, code: 'INVALID_TYPE', message: `${itemPath} 값은 URL 문자열 또는 객체여야 합니다.` });
                return;
            }
            pushTextLimitError(errors, source.url, `${itemPath}.url`, PROFILE_LIMITS.referenceUrlLength);
            if (!normalizeText(source.url)) {
                errors.push({ path: `${itemPath}.url`, code: 'REQUIRED', message: `${itemPath}.url 값이 필요합니다.` });
            }
            pushEnumError(errors, source.status, `${itemPath}.status`, 'referenceStatus');
            pushTextLimitError(errors, source.title, `${itemPath}.title`, PROFILE_LIMITS.referenceTitle);
            pushTextLimitError(errors, source.error, `${itemPath}.error`, PROFILE_LIMITS.referenceError);
        });
    }
    pushTextLimitError(errors, styleReferences.fingerprint_input_hash, 'channels.blog.style_references.fingerprint_input_hash', PROFILE_LIMITS.referenceMetadata);
    pushTextLimitError(errors, styleReferences.analyzed_at, 'channels.blog.style_references.analyzed_at', PROFILE_LIMITS.referenceMetadata);
    pushTextLimitError(errors, styleReferences.analyzer_version, 'channels.blog.style_references.analyzer_version', PROFILE_LIMITS.referenceMetadata);
    if (styleReferences.fingerprint !== undefined && styleReferences.fingerprint !== null && !isRecord(styleReferences.fingerprint)) {
        errors.push({
            path: 'channels.blog.style_references.fingerprint',
            code: 'INVALID_TYPE',
            message: 'channels.blog.style_references.fingerprint 값은 객체 또는 null이어야 합니다.'
        });
    } else if (isRecord(styleReferences.fingerprint)) {
        const fingerprint = styleReferences.fingerprint;
        const fingerprintSurface = isRecord(fingerprint.surface) ? fingerprint.surface : {};
        const fingerprintSettings = isRecord(fingerprint.settings) ? fingerprint.settings : {};
        const fingerprintStructure = isRecord(fingerprint.structure) ? fingerprint.structure : {};
        const fingerprintVoice = isRecord(fingerprint.voice) ? fingerprint.voice : {};
        pushEnumError(errors, fingerprintSurface.writing_mode, 'channels.blog.style_references.fingerprint.surface.writing_mode', 'writingMode');
        pushEnumError(errors, fingerprintSurface.speech_level, 'channels.blog.style_references.fingerprint.surface.speech_level', 'speechLevel');
        pushEnumError(errors, fingerprintSurface.tone, 'channels.blog.style_references.fingerprint.surface.tone', 'tone');
        pushEnumError(errors, fingerprintSurface.information_density, 'channels.blog.style_references.fingerprint.surface.information_density', 'informationDensity');
        pushEnumError(errors, fingerprintSettings.length_preset, 'channels.blog.style_references.fingerprint.settings.length_preset', 'lengthPreset');
        pushEnumError(errors, fingerprintSettings.opening, 'channels.blog.style_references.fingerprint.settings.opening', 'opening');
        pushEnumError(errors, fingerprintSettings.development, 'channels.blog.style_references.fingerprint.settings.development', 'development');
        pushEnumError(errors, fingerprintSettings.ending, 'channels.blog.style_references.fingerprint.settings.ending', 'ending');
        pushEnumError(errors, fingerprintSettings.heading_density, 'channels.blog.style_references.fingerprint.settings.heading_density', 'headingDensity');
        pushEnumError(errors, fingerprintStructure.opening_pattern, 'channels.blog.style_references.fingerprint.structure.opening_pattern', 'fingerprintOpening');
        pushEnumListErrors(errors, fingerprintStructure.section_flow, 'channels.blog.style_references.fingerprint.structure.section_flow', 'fingerprintFlow', 8);
        pushEnumError(errors, fingerprintStructure.paragraph_length, 'channels.blog.style_references.fingerprint.structure.paragraph_length', 'fingerprintParagraph');
        pushEnumError(errors, fingerprintStructure.ending_pattern, 'channels.blog.style_references.fingerprint.structure.ending_pattern', 'fingerprintEnding');
        pushEnumError(errors, fingerprintVoice.sentence_rhythm, 'channels.blog.style_references.fingerprint.voice.sentence_rhythm', 'fingerprintRhythm');
        pushEnumError(errors, fingerprintVoice.warmth, 'channels.blog.style_references.fingerprint.voice.warmth', 'fingerprintWarmth');
        pushEnumError(errors, fingerprintVoice.vocabulary, 'channels.blog.style_references.fingerprint.voice.vocabulary', 'fingerprintVocabulary');
        pushEnumListErrors(errors, fingerprintVoice.rhetorical_devices, 'channels.blog.style_references.fingerprint.voice.rhetorical_devices', 'fingerprintDevice', 8);
        pushEnumListErrors(errors, fingerprint.avoid, 'channels.blog.style_references.fingerprint.avoid', 'fingerprintAvoid', 12);
        pushTextLimitError(errors, fingerprint.summary, 'channels.blog.style_references.fingerprint.summary', 300);
    }

    pushEnumError(errors, shopping.mode, 'channels.shopping.mode', 'shoppingMode');
    pushTextLimitError(errors, shopping.additional_instruction, 'channels.shopping.additional_instruction', PROFILE_LIMITS.channelInstruction);

    return { valid: errors.length === 0, errors };
}

function assertValidWritingProfile(input = {}) {
    const result = validateWritingProfile(input);
    if (result.valid) return input;
    const error = new Error(result.errors.map((item) => item.message).join(' '));
    error.code = 'INVALID_WRITING_PROFILE';
    error.details = result.errors;
    throw error;
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach((child) => deepFreeze(child));
    return value;
}

function cloneProfile(value) {
    return JSON.parse(JSON.stringify(value));
}

if (defaultProfileDocument.schema_version !== CONTENT_WRITING_PROFILE_SCHEMA_VERSION) {
    throw new Error('제품 기본 글쓰기 프로필 schema_version이 지원 범위와 다릅니다.');
}
assertValidWritingProfile(defaultProfileDocument.profile);

const DEFAULT_CONTENT_WRITING_PROFILE = deepFreeze(normalizeWritingProfile(defaultProfileDocument.profile));
const DEFAULT_CONTENT_WRITING_PROFILE_METADATA = deepFreeze({
    schema_version: defaultProfileDocument.schema_version,
    profile_version: defaultProfileDocument.profile_version,
    id: defaultProfileDocument.id,
    label: defaultProfileDocument.label
});

function getDefaultContentWritingProfile() {
    return cloneProfile(DEFAULT_CONTENT_WRITING_PROFILE);
}

module.exports = {
    CONTENT_WRITING_PROFILE_SCHEMA_VERSION,
    PROFILE_LIMITS,
    PROFILE_ENUMS,
    DEFAULT_CONTENT_WRITING_PROFILE,
    DEFAULT_CONTENT_WRITING_PROFILE_METADATA,
    normalizeWritingProfile,
    validateWritingProfile,
    assertValidWritingProfile,
    getDefaultContentWritingProfile
};
