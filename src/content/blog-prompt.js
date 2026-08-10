const fs = require('fs');

const { normalizeWritingStrategy } = require('./writing-strategy');

function readPromptFile(filePath, label, fileSystem = fs) {
    if (!filePath || !fileSystem.existsSync(filePath)) {
        throw new Error(`${label} 프롬프트 파일이 없습니다: ${filePath || '(경로 없음)'}`);
    }

    const content = String(fileSystem.readFileSync(filePath, 'utf-8') || '').trim();
    if (!content) {
        throw new Error(`${label} 프롬프트 파일이 비어 있습니다: ${filePath}`);
    }
    return content;
}

function resolvePromptPaths({ strategy, config = {}, constants = {} }) {
    const normalizedStrategy = normalizeWritingStrategy(strategy);
    const commonPath = config.BLOG_PROMPT_COMMON_PATH
        || config.BLOG_PROMPT_PATH
        || constants.BLOG_PROMPT_COMMON_FILE
        || constants.PROMPT_FILE;
    const strategyPath = normalizedStrategy === 'discovery'
        ? (config.BLOG_PROMPT_DISCOVERY_PATH || constants.BLOG_PROMPT_DISCOVERY_FILE)
        : (config.BLOG_PROMPT_SEARCH_PATH || constants.BLOG_PROMPT_SEARCH_FILE);

    return { normalizedStrategy, commonPath, strategyPath };
}

function buildBlogSystemPrompt(options = {}) {
    const {
        strategy,
        config = {},
        constants = {},
        fileSystem = fs
    } = options;
    const paths = resolvePromptPaths({ strategy, config, constants });
    const commonPrompt = readPromptFile(paths.commonPath, '공통 블로그', fileSystem);
    const strategyLabel = paths.normalizedStrategy === 'discovery' ? '발견 중심' : '검색 중심';
    const strategyPrompt = readPromptFile(paths.strategyPath, strategyLabel, fileSystem);

    return `${commonPrompt}\n\n${strategyPrompt}`;
}

module.exports = {
    readPromptFile,
    resolvePromptPaths,
    buildBlogSystemPrompt
};
