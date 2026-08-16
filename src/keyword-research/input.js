function normalizeKeyword(value) {
    return String(value || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function parseKeywords(values) {
    const keywords = [];
    const seen = new Set();
    const rawList = Array.isArray(values) ? values : (values ? [values] : []);

    for (const value of rawList) {
        if (value === null || value === undefined) continue;
        const raw = String(value).trim();
        if (!raw) continue;

        let tokens;
        if (raw.startsWith('[')) {
            try {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
                    throw new Error('JSON 배열은 문자열로만 구성되어야 합니다.');
                }
                tokens = parsed;
            } catch (error) {
                throw new Error(`키워드 JSON 파싱 실패: ${error.message}`);
            }
        } else {
            tokens = raw.split(',');
        }

        for (const token of tokens) {
            const keyword = String(token).trim();
            const key = normalizeKeyword(keyword);
            if (keyword && !seen.has(key)) {
                seen.add(key);
                keywords.push(keyword);
            }
        }
    }

    return keywords;
}

module.exports = {
    normalizeKeyword,
    parseKeywords
};
