function presentBlogImageGenerationProgress(progress = {}, target = '') {
    const current = Number(progress.current);
    const total = Number(progress.total);
    if (!Number.isInteger(current) || !Number.isInteger(total) || total < 1 || current < 1 || current > total) return '';

    const platform = target === 'naver' ? '네이버 블로그용 ' : target === 'wordpress' ? '워드프레스용 ' : '';
    const count = `(${current}/${total})`;
    if (progress.state === 'completed') return `${platform}이미지 준비 완료 ${count}`;
    if (progress.state === 'failed') return `${platform}이미지 생성 실패 ${count}. 다음 이미지 생성을 계속합니다.`;
    return `${platform}이미지 생성 중 ${count}`;
}

module.exports = { presentBlogImageGenerationProgress };
