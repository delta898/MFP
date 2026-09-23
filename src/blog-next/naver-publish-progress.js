const NAVER_PUBLISH_STAGES = new Set([
    'editor', 'body', 'image', 'link', 'settings', 'submitting', 'verifying'
]);

function countLabel(progress = {}, unit) {
    const current = Number(progress.current);
    const total = Number(progress.total);
    if (!Number.isInteger(current) || !Number.isInteger(total) || total < 1 || current < 1 || current > total) return '';
    return `${current}/${total}${unit}`;
}

function presentNaverPublishProgress(progress = {}, fallbackPostStatus = 'publish') {
    const stage = String(progress.stage || '');
    if (!NAVER_PUBLISH_STAGES.has(stage)) return null;
    const postStatus = ['draft', 'publish', 'schedule'].includes(progress.postStatus)
        ? progress.postStatus : fallbackPostStatus;
    const action = postStatus === 'draft' ? '임시 저장'
        : postStatus === 'schedule' ? '예약 등록' : '발행';
    const sections = countLabel(progress, ' 구간');
    const images = countLabel(progress, '개');
    const links = countLabel(progress, '개');
    const messages = {
        editor: '네이버 글쓰기 화면에 연결하고 있습니다.',
        body: sections ? `본문 ${sections}을 입력하고 있습니다.` : '원고를 입력하고 있습니다.',
        image: images ? `이미지 ${images}를 올리고 있습니다.` : '이미지를 올리고 있습니다.',
        link: links ? `링크 ${links}를 추가하고 있습니다.` : '링크를 추가하고 있습니다.',
        settings: `${action} 설정을 적용하고 있습니다.`,
        submitting: `네이버 블로그에 ${action}을 요청하고 있습니다.`,
        verifying: `네이버 블로그의 ${action} 결과를 확인하고 있습니다.`
    };
    return { stage, postStatus, message: messages[stage] };
}

module.exports = { presentNaverPublishProgress };
