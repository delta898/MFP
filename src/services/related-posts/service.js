'use strict';

const { buildRelatedPostContext, selectRelatedPosts } = require('../../utilities/text/related-post-selection');

function createRelatedPostsService(options = {}) {
    const fetchNaverCandidates = options.fetchNaverCandidates || (async () => []);
    const fetchWordPressCandidates = options.fetchWordPressCandidates || (async () => []);
    const config = options.config || {};
    const logger = options.logger || console;
    const random = options.random || Math.random;
    const shuffle = (list) => {
        const result = Array.isArray(list) ? [...list] : [];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1));
            [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
        }
        return result;
    };
    const pickHeading = () => {
        const headings = ['함께 보면 좋은 글', '같이 보면 좋은 글', '이어서 보면 좋은 글', '추천 포스팅', '관련 글 더 보기', '다른 글도 확인해 보세요'];
        return headings[Math.floor(random() * headings.length)];
    };
    const limitCount = (count) => Math.max(1, Math.min(10, parseInt(count, 10) || 3));

    async function fetchOwnBlogRelatedPosts(context = {}, count = 3, selectionOptions = {}) {
        const candidates = await fetchNaverCandidates();
        const selection = selectRelatedPosts(candidates, buildRelatedPostContext(context), limitCount(count), {
            shuffle,
            ...selectionOptions
        });
        logger.info?.(`🔎 [관련글] 후보 ${selection.totalCandidates}건 중 연관 선택 ${selection.heuristicCount}건, 랜덤 보강 ${selection.fallbackCount}건`);
        return selection.posts;
    }

    async function fetchConfiguredRelatedPosts(context = {}, count = 3) {
        const [naverCandidates, wordpressCandidates] = await Promise.all([
            fetchNaverCandidates(),
            fetchWordPressCandidates(config.WORDPRESS_URL)
        ]);
        const selection = selectRelatedPosts([...naverCandidates, ...wordpressCandidates], buildRelatedPostContext(context), limitCount(count), {
            shuffle,
            preferSourceDiversity: true
        });
        logger.info?.(`🔎 [연관글] Naver ${naverCandidates.length}건 + WordPress ${wordpressCandidates.length}건을 함께 평가해 연관 ${selection.heuristicCount}건, 랜덤 보강 ${selection.fallbackCount}건 선택`);
        return selection.posts;
    }

    async function fetchWordPressRandomPosts(baseUrl = config.WORDPRESS_URL, count = 3) {
        const candidates = await fetchWordPressCandidates(baseUrl);
        return shuffle(candidates).slice(0, limitCount(count));
    }

    return Object.freeze({
        fetchOwnBlogRelatedPosts,
        fetchConfiguredRelatedPosts,
        fetchWordPressRandomPosts,
        fetchWordPressRelatedPostCandidates: fetchWordPressCandidates,
        fetchOwnBlogRandomPosts: (count = 3) => fetchOwnBlogRelatedPosts({}, count),
        pickHeading,
        shuffle
    });
}

module.exports = { createRelatedPostsService };
