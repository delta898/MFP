const fs = require('fs');
const BLOG_PROMPT_PATHS = require('./prompts/blog/paths');

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

function resolvePromptPaths({ strategy, config = {}, promptPaths = BLOG_PROMPT_PATHS }) {
    const normalizedStrategy = normalizeWritingStrategy(strategy);
    const contractPath = config.BLOG_PROMPT_CONTRACT_PATH
        || promptPaths.BLOG_PROMPT_CONTRACT_FILE
        || config.BLOG_PROMPT_COMMON_PATH
        || config.BLOG_PROMPT_PATH
        || promptPaths.BLOG_PROMPT_COMMON_FILE;
    const strategyPath = normalizedStrategy === 'discovery'
        ? (config.BLOG_PROMPT_DISCOVERY_PATH || promptPaths.BLOG_PROMPT_DISCOVERY_FILE)
        : (config.BLOG_PROMPT_SEARCH_PATH || promptPaths.BLOG_PROMPT_SEARCH_FILE);

    return { normalizedStrategy, contractPath, commonPath: contractPath, strategyPath };
}

function buildBlogSystemPrompt(options = {}) {
    const {
        strategy,
        config = {},
        promptPaths = BLOG_PROMPT_PATHS,
        fileSystem = fs
    } = options;
    const paths = resolvePromptPaths({ strategy, config, promptPaths });
    const contractPrompt = readPromptFile(paths.contractPath, '블로그 출력·사실성 계약', fileSystem);
    const strategyPrompt = buildBlogStrategyPrompt({ strategy, config, promptPaths, fileSystem });

    return `${contractPrompt}\n\n${strategyPrompt}`;
}

function buildBlogStrategyPrompt(options = {}) {
    const { strategy, config = {}, promptPaths = BLOG_PROMPT_PATHS, fileSystem = fs } = options;
    const paths = resolvePromptPaths({ strategy, config, promptPaths });
    const strategyLabel = paths.normalizedStrategy === 'discovery' ? '발견 중심' : '검색 중심';
    return readPromptFile(paths.strategyPath, strategyLabel, fileSystem);
}

module.exports = {
    readPromptFile,
    resolvePromptPaths,
    buildBlogStrategyPrompt,
    buildBlogSystemPrompt
};
