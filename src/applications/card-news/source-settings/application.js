'use strict';

function createCardNewsSourceSettingsApplication(deps = {}) {
    const {
        config = {},
        configRepository,
        normalizeBuiltinSources,
        normalizeRssSources
    } = deps;

    return {
        getSettings() {
            return { fields: {
                CARD_NEWS_BUILTIN_SOURCES: normalizeBuiltinSources(config.CARD_NEWS_BUILTIN_SOURCES),
                CARD_NEWS_RSS_SOURCES: normalizeRssSources(config.CARD_NEWS_RSS_SOURCES)
            } };
        },

        saveSettings(requestBody = {}) {
            const values = requestBody.values && typeof requestBody.values === 'object' ? requestBody.values : {};
            const builtinSources = normalizeBuiltinSources(values.CARD_NEWS_BUILTIN_SOURCES);
            const rssSources = normalizeRssSources(values.CARD_NEWS_RSS_SOURCES, { strict: true });
            const { path, document } = configRepository.read();
            document.content = document.content && typeof document.content === 'object' ? document.content : {};
            document.content.card_news = document.content.card_news && typeof document.content.card_news === 'object'
                ? document.content.card_news
                : {};
            document.content.card_news.builtin_sources = builtinSources;
            document.content.card_news.rss_sources = rssSources;
            configRepository.write(path, document);

            config.CARD_NEWS_BUILTIN_SOURCES = builtinSources;
            config.CARD_NEWS_RSS_SOURCES = rssSources;
            config.content = config.content && typeof config.content === 'object' ? config.content : {};
            config.content.card_news = config.content.card_news && typeof config.content.card_news === 'object'
                ? config.content.card_news
                : {};
            config.content.card_news.builtin_sources = builtinSources;
            config.content.card_news.rss_sources = rssSources;
            return {
                fields: {
                    CARD_NEWS_BUILTIN_SOURCES: builtinSources,
                    CARD_NEWS_RSS_SOURCES: rssSources
                },
                message: '카드뉴스 소스를 적용했습니다.'
            };
        }
    };
}

module.exports = { createCardNewsSourceSettingsApplication };
