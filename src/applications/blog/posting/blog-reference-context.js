'use strict';

const { raceWithCancellation, sleepWithCancellation, throwIfCanceled } = require('../../../utilities/async/cancellation');
const { searchOptionalReferences } = require('../../../content/reference-search-gateway');

function buildReferenceSection(scrapedContext) {
    if (!scrapedContext) return '(No reference provided)';
    return `아래는 해당 주제와 관련된 참고 블로그 글의 내용입니다.
이 자료는 문장을 베끼기 위한 원문이 아니라, 사실관계와 핵심 논지를 추출하기 위한 참고 컨텍스트입니다.
이 글들의 핵심 인사이트, 정보, 관점을 참고하여 독창적인 글을 작성하세요.
단, 원문을 그대로 복사하지 말고, 여러 글의 정보를 종합하여 새로운 시각과 가치를 제공하는 글을 작성하세요.
특히 다음 규칙을 반드시 지키세요.
- 원문 문장, 문단 순서, 표현을 거의 그대로 옮기지 마세요.
- 먼저 내용을 충분히 이해한 뒤, 한국어로 자연스럽고 새롭게 재구성해서 다시 쓰세요.
- 외국어 기사인 경우 직역투를 피하고, 한국 독자가 읽기 쉬운 문장으로 정확하게 풀어쓰세요.
- 참고자료에 있는 중요한 배경, 변화점, 수치, 사례, 비교 포인트, 주의사항이 있다면 빠뜨리지 말고 본문에 녹여 쓰세요.
- 내용이 풍부한 원문이라면 글도 충분히 풍성해야 합니다. 핵심 디테일이 빠진 얕은 요약문처럼 쓰지 마세요.
- 단순 줄거리 요약이 아니라, 핵심 주장과 맥락이 살아 있는 해설형 글처럼 재서술하세요.
${scrapedContext}`;
}

async function collectBlogReferenceContext(input = {}) {
    const { Utils, Logger, signal, referenceSearchGateway } = input;
    const jobData = input.jobData || {};
    if (!Utils || typeof Utils.fetchReferenceContent !== 'function') {
        throw new TypeError('Blog reference context requires fetchReferenceContent().');
    }
    const scrapedParts = [];
    let sourceCount = 0;
    const hasKeywords = Array.isArray(jobData.keywords) && jobData.keywords.length > 0;

    if (jobData.use_external_ref === true) {
        const searchKeyword = (hasKeywords ? jobData.keywords[0] : jobData.subject) || '';
        if (searchKeyword) {
            if (typeof referenceSearchGateway?.searchLatestReferences !== 'function') {
                throw new TypeError('Blog reference context requires referenceSearchGateway.searchLatestReferences().');
            }
            Logger?.info?.(`🔍 [외부 참고] 관련 최신 글 수집 및 분석 시작: '${searchKeyword}'`);
            const relatedPosts = await raceWithCancellation(
                async () => {
                    const posts = await searchOptionalReferences(
                        referenceSearchGateway,
                        { topic: searchKeyword },
                        (error) => Logger?.debug?.(`🔍 [외부 참고] 관련 최신 글 수집 실패 (${searchKeyword}): ${error.message}`)
                    );
                    return posts.map((post) => ({
                        ...post,
                        link: typeof Utils.convertToMobileNaverBlogUrl === 'function'
                            ? Utils.convertToMobileNaverBlogUrl(post.link)
                            : post.link
                    }));
                },
                signal
            );
            throwIfCanceled(signal);
            for (let index = 0; index < relatedPosts.length; index += 1) {
                throwIfCanceled(signal);
                const post = relatedPosts[index];
                const text = await Utils.fetchReferenceContent(post.link, { signal });
                throwIfCanceled(signal);
                if (text) {
                    sourceCount += 1;
                    scrapedParts.push(`\n[자동 참고글 ${sourceCount} - ${post.title}]:\n${text}\n`);
                }
                await sleepWithCancellation(1000, signal, (ms) => Utils.sleep(ms));
            }
            Logger?.info?.(`🔍 [외부 참고] 관련 글 스크래핑 완료: ${sourceCount}건 성공`);
        }
    }

    const referenceUrls = Array.isArray(jobData.content_guide?.reference_urls)
        ? jobData.content_guide.reference_urls
        : [];
    for (let index = 0; index < referenceUrls.length; index += 1) {
        throwIfCanceled(signal);
        const originalUrl = referenceUrls[index];
        const url = typeof Utils.convertToMobileNaverBlogUrl === 'function'
            ? Utils.convertToMobileNaverBlogUrl(originalUrl)
            : originalUrl;
        Logger?.info?.(`📚 [수동 참고 자료] URL 분석 중 (${index + 1}/${referenceUrls.length})`);
        const text = await Utils.fetchReferenceContent(url, { signal });
        throwIfCanceled(signal);
        if (text) {
            sourceCount += 1;
            scrapedParts.push(`\n[수동 참고글 ${sourceCount} - ${url}]:\n${text}\n`);
        }
        await sleepWithCancellation(1000, signal, (ms) => Utils.sleep(ms));
    }

    return Object.freeze({
        referenceCount: sourceCount,
        referenceContext: buildReferenceSection(scrapedParts.join(''))
    });
}

module.exports = { buildReferenceSection, collectBlogReferenceContext };
