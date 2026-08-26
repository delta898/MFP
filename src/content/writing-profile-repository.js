const {
    CONTENT_WRITING_PROFILE_SCHEMA_VERSION,
    DEFAULT_CONTENT_WRITING_PROFILE_METADATA,
    PROFILE_ENUMS,
    getDefaultContentWritingProfile,
    normalizeWritingProfile,
    validateWritingProfile
} = require('./writing-profile');
const { resolveContentWritingPreferences } = require('./writing-preferences');

const ACTIVE_PROFILE_VALUES = new Set(['default', 'custom']);

const DEFAULT_PROFILE_OVERRIDE_SHAPE = Object.freeze({
    writing_strategy: true,
    writing_mode: true,
    speech_level: true
});

const PROFILE_SHAPE = Object.freeze({
    common: {
        writing_strategy: true,
        voice: {
            writing_mode: true,
            speech_level: true,
            tone: true,
            information_density: true
        },
        style_instruction: true
    },
    channels: {
        blog: {
            narrator_presence: true,
            length: { preset: true },
            structure: {
                opening: true,
                development: true,
                ending: true,
                heading_density: true
            },
            image_plan: { count_mode: true, fixed_count: true },
            author_context: true,
            additional_instruction: true,
            style_references: {
                sample_text: { value: true, status: true },
                blog_urls: true,
                fingerprint: true,
                fingerprint_input_hash: true,
                analyzed_at: true,
                analyzer_version: true,
                analyzer_model: true
            }
        },
        shopping: {
            mode: true,
            additional_instruction: true
        }
    }
});

const REFERENCE_URL_SHAPE = Object.freeze({
    url: true,
    status: true,
    title: true,
    error: true
});

const ANALYZER_MODEL_SHAPE = Object.freeze({
    provider: true,
    code: true,
    name: true
});

const FINGERPRINT_SHAPE = Object.freeze({
    surface: {
        writing_mode: true,
        speech_level: true,
        tone: true,
        information_density: true
    },
    settings: {
        length_preset: true,
        opening: true,
        development: true,
        ending: true,
        heading_density: true
    },
    structure: {
        opening_pattern: true,
        section_flow: true,
        paragraph_length: true,
        ending_pattern: true
    },
    voice: {
        sentence_rhythm: true,
        warmth: true,
        vocabulary: true,
        rhetorical_devices: true
    },
    avoid: true,
    summary: true
});

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createValidationError(details, message = '글쓰기 프로필 값이 올바르지 않습니다.') {
    const error = new Error(message);
    error.code = 'INVALID_WRITING_PROFILE';
    error.details = details;
    return error;
}

function validateExactShape(value, shape, path = 'custom_profile') {
    const errors = [];
    if (!isRecord(value)) {
        return [{ path, code: 'INVALID_TYPE', message: `${path} 값은 객체여야 합니다.` }];
    }

    const expectedKeys = Object.keys(shape);
    for (const key of expectedKeys) {
        const childPath = `${path}.${key}`;
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
            errors.push({ path: childPath, code: 'REQUIRED', message: `${childPath} 값이 필요합니다.` });
            continue;
        }
        if (isRecord(shape[key])) {
            errors.push(...validateExactShape(value[key], shape[key], childPath));
        }
    }

    for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(shape, key)) {
            const childPath = `${path}.${key}`;
            errors.push({ path: childPath, code: 'UNKNOWN_FIELD', message: `${childPath} 값은 지원하지 않습니다.` });
        }
    }
    return errors;
}

function validateCustomProfileSnapshot(customProfile) {
    if (!isRecord(customProfile)) {
        return {
            valid: false,
            errors: [{ path: 'custom_profile', code: 'INVALID_TYPE', message: 'custom_profile은 객체여야 합니다.' }]
        };
    }

    const { based_on_default_version: basedOnDefaultVersion, ...profile } = customProfile;
    const errors = [];
    if (!Number.isInteger(basedOnDefaultVersion) || basedOnDefaultVersion < 1) {
        errors.push({
            path: 'custom_profile.based_on_default_version',
            code: 'INVALID_VERSION',
            message: 'based_on_default_version은 1 이상의 정수여야 합니다.'
        });
    }
    errors.push(...validateExactShape(profile, PROFILE_SHAPE));
    const styleReferences = profile?.channels?.blog?.style_references;
    if (styleReferences?.analyzer_model !== null && styleReferences?.analyzer_model !== undefined) {
        errors.push(...validateExactShape(
            styleReferences.analyzer_model,
            ANALYZER_MODEL_SHAPE,
            'custom_profile.channels.blog.style_references.analyzer_model'
        ));
    }
    if (Array.isArray(styleReferences?.blog_urls)) {
        styleReferences.blog_urls.forEach((entry, index) => {
            errors.push(...validateExactShape(
                entry,
                REFERENCE_URL_SHAPE,
                `custom_profile.channels.blog.style_references.blog_urls.${index}`
            ));
        });
    }
    if (styleReferences?.sample_text?.value && Array.isArray(styleReferences?.blog_urls) && styleReferences.blog_urls.length) {
        errors.push({
            path: 'custom_profile.channels.blog.style_references',
            code: 'MULTIPLE_REFERENCE_SOURCES',
            message: '붙여넣은 글과 참고 URL 중 하나만 사용할 수 있습니다.'
        });
    }
    if (styleReferences?.fingerprint !== null && styleReferences?.fingerprint !== undefined) {
        errors.push(...validateExactShape(
            styleReferences.fingerprint,
            FINGERPRINT_SHAPE,
            'custom_profile.channels.blog.style_references.fingerprint'
        ));
    }
    errors.push(...validateWritingProfile(profile).errors.map((item) => ({
        ...item,
        path: `custom_profile.${item.path}`
    })));
    return { valid: errors.length === 0, errors };
}

function buildCustomProfile(profile, basedOnDefaultVersion = DEFAULT_CONTENT_WRITING_PROFILE_METADATA.profile_version) {
    return {
        based_on_default_version: basedOnDefaultVersion,
        ...normalizeWritingProfile(profile)
    };
}

function getProductDefaultOverrides() {
    const profile = getDefaultContentWritingProfile();
    return {
        writing_strategy: profile.common.writing_strategy,
        writing_mode: profile.common.voice.writing_mode,
        speech_level: profile.common.voice.speech_level
    };
}

function normalizeDefaultProfileOverrides(input = {}) {
    const defaults = getProductDefaultOverrides();
    const candidate = isRecord(input) ? input : {};
    return {
        writing_strategy: PROFILE_ENUMS.writingStrategy.includes(candidate.writing_strategy)
            ? candidate.writing_strategy : defaults.writing_strategy,
        writing_mode: PROFILE_ENUMS.writingMode.includes(candidate.writing_mode)
            ? candidate.writing_mode : defaults.writing_mode,
        speech_level: PROFILE_ENUMS.speechLevel.includes(candidate.speech_level)
            ? candidate.speech_level : defaults.speech_level
    };
}

function validateDefaultProfileOverrides(input) {
    const errors = validateExactShape(input, DEFAULT_PROFILE_OVERRIDE_SHAPE, 'default_profile_overrides');
    if (isRecord(input)) {
        for (const [key, enumValues] of [
            ['writing_strategy', PROFILE_ENUMS.writingStrategy],
            ['writing_mode', PROFILE_ENUMS.writingMode],
            ['speech_level', PROFILE_ENUMS.speechLevel]
        ]) {
            if (Object.prototype.hasOwnProperty.call(input, key) && !enumValues.includes(input[key])) {
                errors.push({
                    path: `default_profile_overrides.${key}`,
                    code: 'INVALID_ENUM',
                    message: `default_profile_overrides.${key} 값이 올바르지 않습니다.`
                });
            }
        }
    }
    return { valid: errors.length === 0, errors };
}

function applyDefaultProfileOverrides(overrides) {
    const profile = getDefaultContentWritingProfile();
    const normalized = normalizeDefaultProfileOverrides(overrides);
    profile.common.writing_strategy = normalized.writing_strategy;
    profile.common.voice.writing_mode = normalized.writing_mode;
    profile.common.voice.speech_level = normalized.speech_level;
    return profile;
}

function buildLegacyDocument(contentConfig = {}) {
    const legacyPreferences = resolveContentWritingPreferences(contentConfig);
    return {
        schema_version: CONTENT_WRITING_PROFILE_SCHEMA_VERSION,
        active_profile: 'default',
        default_profile_overrides: normalizeDefaultProfileOverrides({
            writing_strategy: legacyPreferences.strategy,
            writing_mode: legacyPreferences.style.writing_mode,
            speech_level: legacyPreferences.style.speech_level
        }),
        custom_profile: null,
        updated_at: null
    };
}

function resolveEffectiveProfile(document) {
    if (document.active_profile === 'custom' && document.custom_profile) {
        const { based_on_default_version: _version, ...profile } = document.custom_profile;
        return normalizeWritingProfile(profile);
    }
    return applyDefaultProfileOverrides(document.default_profile_overrides);
}

function applyWritingProfileRuntimeAliases(CONFIG, profile) {
    if (!CONFIG || !profile) return;
    const effectiveProfile = normalizeWritingProfile(profile);
    const voice = effectiveProfile.common.voice;
    CONFIG.BLOG_WRITING_MODE = voice.writing_mode;
    CONFIG.BLOG_SPEECH_LEVEL = voice.speech_level;
    CONFIG.CONTENT_WRITING_MODE = voice.writing_mode;
    CONFIG.CONTENT_SPEECH_LEVEL = voice.speech_level;
    CONFIG.BLOG_WRITING_STRATEGY = effectiveProfile.common.writing_strategy;
    CONFIG.CONTENT_WRITING_STRATEGY = effectiveProfile.common.writing_strategy;
    CONFIG.CONTENT_WRITING_PROFILE = effectiveProfile;
}

function createWritingProfileRepository(deps = {}) {
    const {
        fs,
        path,
        filePath,
        legacyContentConfig = {},
        now = () => new Date().toISOString()
    } = deps;
    if (!fs || !path || !filePath) throw new Error('writing profile repository dependencies are required.');

    function fallbackResult(source, warnings = []) {
        const document = source === 'legacy_migration'
            ? buildLegacyDocument(legacyContentConfig)
            : {
                schema_version: CONTENT_WRITING_PROFILE_SCHEMA_VERSION,
                active_profile: 'default',
                default_profile_overrides: getProductDefaultOverrides(),
                custom_profile: null,
                updated_at: null
            };
        return {
            document,
            effective_profile: resolveEffectiveProfile(document),
            source,
            warnings
        };
    }

    function read() {
        if (!fs.existsSync(filePath)) return fallbackResult('legacy_migration');

        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (_error) {
            return fallbackResult('product_default', [{ code: 'PROFILE_FILE_CORRUPT', message: '저장된 글쓰기 프로필을 읽을 수 없어 안전한 기본값을 사용합니다.' }]);
        }

        if (!isRecord(raw) || raw.schema_version !== CONTENT_WRITING_PROFILE_SCHEMA_VERSION) {
            return fallbackResult('product_default', [{ code: 'PROFILE_SCHEMA_UNSUPPORTED', message: '지원하지 않는 글쓰기 프로필 형식이라 안전한 기본값을 사용합니다.' }]);
        }

        const warnings = [];
        const activeProfile = ACTIVE_PROFILE_VALUES.has(raw.active_profile) ? raw.active_profile : 'default';
        if (activeProfile !== raw.active_profile) {
            warnings.push({ code: 'ACTIVE_PROFILE_NORMALIZED', message: '선택 프로필 값이 올바르지 않아 기본 프로필을 사용합니다.' });
        }

        let customProfile = null;
        if (isRecord(raw.custom_profile)) {
            const { based_on_default_version: basedOnDefaultVersion, ...profile } = raw.custom_profile;
            const shapeErrors = validateExactShape(profile, PROFILE_SHAPE);
            const structurallyUsable = !shapeErrors.some((item) => item.code === 'REQUIRED' || item.code === 'INVALID_TYPE');
            const validation = validateCustomProfileSnapshot(raw.custom_profile);
            if (!validation.valid && structurallyUsable) {
                warnings.push({ code: 'CUSTOM_PROFILE_NORMALIZED', message: '일부 사용자 프로필 값을 안전한 기본값으로 정규화했습니다.' });
            }
            if (structurallyUsable) {
                customProfile = buildCustomProfile(
                    profile,
                    Number.isInteger(basedOnDefaultVersion) && basedOnDefaultVersion >= 1
                        ? basedOnDefaultVersion
                        : DEFAULT_CONTENT_WRITING_PROFILE_METADATA.profile_version
                );
            } else {
                warnings.push({ code: 'CUSTOM_PROFILE_INVALID', message: '사용자 프로필 구조가 올바르지 않아 기본 프로필을 사용합니다.' });
            }
        }

        const resolvedActiveProfile = activeProfile === 'custom' && !customProfile ? 'default' : activeProfile;
        if (activeProfile === 'custom' && !customProfile) {
            warnings.push({ code: 'CUSTOM_PROFILE_MISSING', message: '사용자 프로필이 없어 기본 프로필을 사용합니다.' });
        }
        const document = {
            schema_version: CONTENT_WRITING_PROFILE_SCHEMA_VERSION,
            active_profile: resolvedActiveProfile,
            default_profile_overrides: normalizeDefaultProfileOverrides(raw.default_profile_overrides),
            custom_profile: customProfile,
            updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null
        };
        return {
            document,
            effective_profile: resolveEffectiveProfile(document),
            source: resolvedActiveProfile === 'custom' ? 'custom' : 'product_default',
            warnings
        };
    }

    function atomicWrite(document) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tempPath = path.join(
            path.dirname(filePath),
            `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
        );
        try {
            fs.writeFileSync(tempPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fs.renameSync(tempPath, filePath);
        } catch (error) {
            try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (_cleanupError) { }
            throw error;
        }
    }

    function save(input = {}) {
        if (!isRecord(input)) throw createValidationError([{ path: 'body', code: 'INVALID_TYPE', message: '요청 본문은 객체여야 합니다.' }]);
        const allowedKeys = new Set(['active_profile', 'default_profile_overrides', 'custom_profile']);
        const unknownKeys = Object.keys(input).filter((key) => !allowedKeys.has(key));
        if (unknownKeys.length > 0) {
            throw createValidationError(unknownKeys.map((key) => ({
                path: key,
                code: 'UNKNOWN_FIELD',
                message: `${key} 값은 지원하지 않습니다.`
            })));
        }
        if (!ACTIVE_PROFILE_VALUES.has(input.active_profile)) {
            throw createValidationError([{ path: 'active_profile', code: 'INVALID_ENUM', message: 'active_profile은 default 또는 custom이어야 합니다.' }]);
        }

        const current = read().document;
        let defaultProfileOverrides = current.default_profile_overrides;
        if (Object.prototype.hasOwnProperty.call(input, 'default_profile_overrides')) {
            const validation = validateDefaultProfileOverrides(input.default_profile_overrides);
            if (!validation.valid) throw createValidationError(validation.errors);
            defaultProfileOverrides = normalizeDefaultProfileOverrides(input.default_profile_overrides);
        }
        let customProfile = current.custom_profile;
        if (Object.prototype.hasOwnProperty.call(input, 'custom_profile') && input.custom_profile !== null) {
            const validation = validateCustomProfileSnapshot(input.custom_profile);
            if (!validation.valid) throw createValidationError(validation.errors);
            const { based_on_default_version: basedOnDefaultVersion, ...profile } = input.custom_profile;
            customProfile = buildCustomProfile(profile, basedOnDefaultVersion);
        }
        if (input.active_profile === 'custom' && !customProfile) {
            throw createValidationError([{ path: 'custom_profile', code: 'REQUIRED', message: '사용자 프로필을 선택하려면 custom_profile이 필요합니다.' }]);
        }

        const document = {
            schema_version: CONTENT_WRITING_PROFILE_SCHEMA_VERSION,
            active_profile: input.active_profile,
            default_profile_overrides: defaultProfileOverrides,
            custom_profile: customProfile,
            updated_at: now()
        };
        atomicWrite(document);
        return {
            document: clone(document),
            effective_profile: resolveEffectiveProfile(document),
            source: document.active_profile === 'custom' ? 'custom' : 'product_default',
            warnings: []
        };
    }

    function useDefault() {
        const current = read().document;
        const document = {
            ...current,
            active_profile: 'default',
            updated_at: now()
        };
        atomicWrite(document);
        return {
            document: clone(document),
            effective_profile: resolveEffectiveProfile(document),
            source: 'product_default',
            warnings: []
        };
    }

    return { filePath, read, save, useDefault };
}

module.exports = {
    ACTIVE_PROFILE_VALUES,
    createWritingProfileRepository,
    validateCustomProfileSnapshot,
    validateDefaultProfileOverrides,
    getProductDefaultOverrides,
    applyDefaultProfileOverrides,
    buildLegacyDocument,
    resolveEffectiveProfile,
    applyWritingProfileRuntimeAliases
};
