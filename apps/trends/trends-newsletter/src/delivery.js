import { NAVER_TRENDS_CATEGORIES } from './readiness.js';

const MAX_CATEGORIES = 10;
const ITEMS_PER_CATEGORY = 20;
const DEVELOPMENT_SITE_HOST = 'www-dev.bloggenius.kr';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function cleanText(value, maxLength = 500) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function safeDevelopmentUrl(value, allowedPath = null) {
    try {
        const url = new URL(String(value || ''));
        if (url.protocol !== 'https:' || url.hostname !== DEVELOPMENT_SITE_HOST || url.username || url.password) return null;
        if (allowedPath && url.pathname !== allowedPath) return null;
        return url.toString();
    } catch {
        return null;
    }
}

function safeHttpsUrl(value) {
    try {
        const url = new URL(String(value || ''));
        if (url.protocol !== 'https:' || url.username || url.password) return null;
        return url.toString();
    } catch {
        return null;
    }
}

function validTrendDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function movementLabel(row) {
    const type = String(row.change_type || '').toLowerCase();
    const amount = Number(row.change_amount);
    if (type === 'new') return 'NEW';
    if (type === 'steady') return '변동 없음';
    if ((type === 'up' || type === 'down') && Number.isFinite(amount)) {
        return `${type === 'up' ? '▲' : '▼'} ${amount}`;
    }
    return cleanText(row.change_raw, 40) || '변동 정보 없음';
}

function formatDate(trendDate) {
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    }).format(new Date(`${trendDate}T00:00:00.000Z`));
}

function validateCategories(categories) {
    if (!Array.isArray(categories)) throw new Error('Subscriber categories are invalid.');
    const normalized = [...new Set(categories.map((category) => String(category).trim()))];
    if (normalized.length < 1 || normalized.length > MAX_CATEGORIES
        || normalized.some((category) => !NAVER_TRENDS_CATEGORIES.includes(category))) {
        throw new Error('Subscriber categories are invalid.');
    }
    return normalized;
}

function categoryItems(category, trends) {
    const rows = (Array.isArray(trends) ? trends : [])
        .filter((row) => row?.category === category)
        .sort((left, right) => {
            const groups = { up: 0, new: 1, down: 2, steady: 3 };
            const leftType = String(left.change_type || '').toLowerCase();
            const rightType = String(right.change_type || '').toLowerCase();
            const groupOrder = (groups[leftType] ?? 4) - (groups[rightType] ?? 4);
            if (groupOrder) return groupOrder;

            const leftAmount = Number(left.change_amount);
            const rightAmount = Number(right.change_amount);
            if (leftType === 'up' && Number.isFinite(leftAmount) && Number.isFinite(rightAmount)
                && leftAmount !== rightAmount) return rightAmount - leftAmount;
            if (leftType === 'down' && Number.isFinite(leftAmount) && Number.isFinite(rightAmount)
                && leftAmount !== rightAmount) return leftAmount - rightAmount;
            return Number(left.display_order) - Number(right.display_order);
        });
    if (rows.length !== ITEMS_PER_CATEGORY || rows.some((row) => !cleanText(row.keyword, 120))) {
        throw new Error(`Trend data is incomplete for ${category}.`);
    }
    return rows;
}

export function buildRecipientBriefing({ trendDate, categories, trends, edition, trendsUrl, unsubscribeUrl }) {
    if (!validTrendDate(trendDate)) throw new Error('Invalid newsletter date.');
    const selectedCategories = validateCategories(categories);
    if (!edition || edition.status !== 'ready') throw new Error('Shared newsletter edition is not ready.');
    const safeTrendsUrl = safeDevelopmentUrl(trendsUrl, '/trends/');
    const safeUnsubscribeUrl = safeDevelopmentUrl(unsubscribeUrl, '/trends/unsubscribe/');
    const articleUrl = safeHttpsUrl(edition.featured_post?.url);
    const downloadUrl = safeDevelopmentUrl(edition.download_url, '/download/');
    const bannerUrl = safeDevelopmentUrl(edition.download_banner_url, '/assets/share-card.svg');
    if (!safeTrendsUrl || !safeUnsubscribeUrl || !articleUrl || !downloadUrl || !bannerUrl) {
        throw new Error('Newsletter links are invalid for the Development environment.');
    }

    const dateLabel = formatDate(trendDate);
    const greeting = cleanText(edition.greeting, 100);
    const introduction = cleanText(edition.introduction, 360);
    const articleTitle = cleanText(edition.featured_post?.title, 200);
    const articleExcerpt = cleanText(edition.featured_post?.excerpt, 420);
    if (!greeting || !introduction || !articleTitle) throw new Error('Shared edition content is incomplete.');

    const sections = selectedCategories.map((category) => ({
        category,
        items: categoryItems(category, trends)
    }));
    const textSections = sections.map(({ category, items }) => [
        category,
        ...items.map((item, index) => `${index + 1}. ${cleanText(item.keyword, 120)} · ${movementLabel(item)}`)
    ].join('\n')).join('\n\n');
    const text = [
        `NAVER TRENDS LETTER · ${dateLabel}`,
        '',
        greeting,
        introduction,
        '',
        textSections,
        '',
        `전체 트렌드 보기: ${safeTrendsUrl}`,
        '',
        `오늘의 참고 글: ${articleTitle}`,
        articleExcerpt,
        articleUrl,
        '',
        `BlogGenius 다운로드: ${downloadUrl}`,
        '',
        `구독 취소: ${safeUnsubscribeUrl}`
    ].filter(Boolean).join('\n');

    const htmlSections = sections.map(({ category, items }) => `
        <section style="margin:28px 0 0;padding:22px;border:1px solid #dce5df;border-radius:16px;background:#fff">
          <h2 style="margin:0 0 14px;color:#244b3c;font-size:19px">${escapeHtml(category)}</h2>
          <ol style="margin:0;padding-left:22px">
            ${items.map((item) => `<li style="padding:8px 0;border-bottom:1px solid #edf1ee"><span style="font-weight:700;color:#1e2b25">${escapeHtml(cleanText(item.keyword, 120))}</span><span style="float:right;color:#61736a;font-size:13px">${escapeHtml(movementLabel(item))}</span></li>`).join('')}
          </ol>
        </section>`).join('');

    const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f5f6f2;color:#1e2b25;font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif">
      <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(dateLabel)} 관심 카테고리별 네이버 트렌드 브리핑</div>
      <main style="max-width:680px;margin:0 auto;padding:28px 16px 40px">
        <header style="padding:28px;border-radius:20px;background:#e9f0eb">
          <p style="margin:0 0 12px;color:#315f4c;font-size:12px;font-weight:700;letter-spacing:.18em">NAVER TRENDS LETTER</p>
          <p style="margin:0 0 8px;color:#708078;font-size:14px">${escapeHtml(dateLabel)}</p>
          <h1 style="margin:0 0 12px;font-size:26px;line-height:1.35">${escapeHtml(greeting)}</h1>
          <p style="margin:0;color:#53645b;font-size:16px;line-height:1.7">${escapeHtml(introduction)}</p>
          <p style="margin:22px 0 0"><a href="${escapeHtml(safeTrendsUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#315f4c;color:#fff;text-decoration:none;font-weight:700">전체 트렌드 보기 →</a></p>
        </header>
        <h2 style="margin:32px 0 0;font-size:21px">관심 카테고리 트렌드</h2>
        ${htmlSections}
        <section style="margin:32px 0 0;padding:24px;border-radius:18px;background:#fff;border:1px solid #dce5df">
          <p style="margin:0 0 10px;color:#315f4c;font-size:12px;font-weight:700;letter-spacing:.16em">TODAY'S READ</p>
          <h2 style="margin:0 0 10px;font-size:20px"><a href="${escapeHtml(articleUrl)}" style="color:#1e2b25;text-decoration:none">${escapeHtml(articleTitle)}</a></h2>
          ${articleExcerpt ? `<p style="margin:0;color:#64736b;line-height:1.7">${escapeHtml(articleExcerpt)}</p>` : ''}
          <p style="margin:18px 0 0"><a href="${escapeHtml(articleUrl)}" style="color:#315f4c;font-weight:700">글 읽기 →</a></p>
        </section>
        <section style="margin:24px 0 0;padding:18px;border-radius:18px;background:#e9f0eb;text-align:center">
          <a href="${escapeHtml(downloadUrl)}" style="display:block;color:#315f4c;text-decoration:none"><img src="${escapeHtml(bannerUrl)}" alt="BlogGenius 다운로드" style="display:block;width:100%;max-width:560px;height:auto;margin:0 auto 14px;border-radius:12px"><strong>BlogGenius 다운로드 →</strong></a>
        </section>
        <footer style="padding:28px 8px 0;color:#829087;font-size:12px;line-height:1.7">
          <p>이 메일은 선택하신 네이버 트렌드 카테고리를 바탕으로 발송되었습니다.</p>
          <p><a href="${escapeHtml(safeUnsubscribeUrl)}" style="color:#53645b">구독 취소</a></p>
        </footer>
      </main>
    </body></html>`;

    return {
        subject: `[네이버 트렌드] ${dateLabel} 관심 카테고리 브리핑`,
        html,
        text,
        selectedCategories
    };
}
