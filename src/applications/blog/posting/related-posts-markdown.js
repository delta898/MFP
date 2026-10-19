'use strict';

function buildRelatedPostsSectionMarkdown(relatedPosts, heading, includeHeading = true, urlTools = {}) {
    const title = String(heading || '함께 보면 좋은 글').trim() || '함께 보면 좋은 글';
    const lines = [];
    if (includeHeading) lines.push(`## ${title}`);
    const validPosts = (Array.isArray(relatedPosts) ? relatedPosts : []).filter((post) => /^https?:\/\//i.test(String(post?.url || '').trim()));
    if (validPosts.length === 0) {
        lines.push('https://blog.naver.com/여기에_링크_추가_1');
        lines.push('https://blog.naver.com/여기에_링크_추가_2');
        lines.push('https://blog.naver.com/여기에_링크_추가_3');
        return lines.join('\n').trim();
    }
    validPosts.slice(0, 3).forEach((post) => {
        const postUrl = (urlTools.toMobileNaverBlogPostUrl || ((url) => url))(post?.url);
        const postTitle = String(post?.title || post?.name || '').replace(/[\r\n]+/g, ' ').trim();
        const label = (postTitle || postUrl).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
        const markdownUrl = postUrl.replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
        lines.push(`- [${label}](${markdownUrl})`);
    });
    return lines.join('\n').trim();
}

function stripAiRelatedPostsSection(markdown = '') {
    if (!markdown) return '';
    const patterns = [
        /(?:^|\n)[#\s]+(?:함께|같이|이어서|관련|추천|정보|참고|보충|더|또|계속)\s*(?:하면|보면|읽어볼|읽어|더)\s*(?:좋은|볼만한|유익한|괜찮은)\s*(?:글|포스트|링크|정보|내용|기사|아티클)[\s\S]*?(?=\n[#\s]+|$)/gi,
        /(?:^|\n)(?:함께|같이|이어서|관련|추천|참고)\s*보면\s*좋은\s*글[\s\S]*?$/gi,
        /(?:^|\n)[#\s]+(?:Related|More|Interesting|Recommended)\s*(?:Posts|Links|Articles|Readings|Content)[\s\S]*?(?=\n[#\s]+|$)/gi,
        /(?:^|\n)[#\s]*(?:관련[ \t]*(?:글|포스팅|링크|포스트)|함께[ \t]*(?:읽기|보기)|추천[ \t]*(?:정보|포스팅)|이전[ \t]*포스팅)[\s\S]*?(?=\n[#\s]+|$)/gi
    ];
    let cleaned = String(markdown);
    for (const pattern of patterns) cleaned = cleaned.replace(pattern, '\n');
    return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { buildRelatedPostsSectionMarkdown, stripAiRelatedPostsSection };
