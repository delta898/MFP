const RELATED_POSTS_HEADINGS = new Set([
    '함께 보면 좋은 글',
    '같이 보면 좋은 글',
    '이어서 보면 좋은 글',
    '추천 포스팅',
    '관련 글 더 보기',
    '다른 글도 확인해 보세요'
]);

function formatRelatedPostsForNaver(markdown = '') {
    let inRelatedPostsSection = false;
    return String(markdown || '').split('\n').map((line) => {
        const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (heading) {
            inRelatedPostsSection = RELATED_POSTS_HEADINGS.has(heading[2].trim());
            return line;
        }
        if (!inRelatedPostsSection) return line;

        const relatedLink = line.match(/^\s*[-*+]\s+\[(?:\\.|[^\]])*\]\((https?:\/\/[^\s]+)\)\s*$/i);
        return relatedLink ? relatedLink[1] : line;
    }).join('\n');
}

module.exports = { formatRelatedPostsForNaver };
