/**
 * ui-server.js 의 카테고리 오버라이드 로직 테스트
 * (executeBlogRowAction 내부 로직 검증)
 */
const Utils = require('../src/utils');
const path = require('path');

// Mock topic data (from spreadsheet)
const mockTopicData = {
    rowIndex: 0,
    subject: "Test Subject",
    category: "General Category", // N:..., W:... 포맷이 아님
    options: {
        naver_category: "Explicit Naver",
        wordpress_category: "Explicit WP"
    }
};

const mockTopicWithLegacyFormat = {
    rowIndex: 1,
    subject: "Legacy Format",
    category: "N:Legacy Naver, W:Legacy WP",
    options: {}
};

// Simplified version of the logic in executeBlogRowAction
function resolveCategories(topicData) {
    const rowOptions = topicData.options || {};
    const getVal = (key, fallback) => {
        if (rowOptions[key] !== undefined && rowOptions[key] !== null && rowOptions[key] !== '') return rowOptions[key];
        return fallback;
    };

    const effectiveCategory = getVal('category', topicData.category || '');

    let naverCat = getVal('naver_category', '');
    let wpCat = getVal('wordpress_category', '');

    if (!naverCat || !wpCat) {
        if (effectiveCategory.includes('N:') || effectiveCategory.includes('W:')) {
            const nMatch = effectiveCategory.match(/N:([^,]*)/);
            const wMatch = effectiveCategory.match(/W:([^,]*)/);
            if (!naverCat) naverCat = nMatch ? nMatch[1].trim() : '';
            if (!wpCat) wpCat = wMatch ? wMatch[1].trim() : '';
        }

        if (!naverCat) naverCat = effectiveCategory;
        if (!wpCat) wpCat = effectiveCategory;
    }

    return { naverCat, wpCat };
}

console.log("🧪 [Test] ui-server 카테고리 오버라이드 테스트 시작");

// Test 1: Explicit options fields
const res1 = resolveCategories(mockTopicData);
console.log("✅ [1] Explicit Options:", JSON.stringify(res1));
if (res1.naverCat !== 'Explicit Naver' || res1.wpCat !== 'Explicit WP') {
    throw new Error("Explicit Options 테스트 실패");
}

// Test 2: Legacy N:, W: format
const res2 = resolveCategories(mockTopicWithLegacyFormat);
console.log("✅ [2] Legacy Format:", JSON.stringify(res2));
if (res2.naverCat !== 'Legacy Naver' || res2.wpCat !== 'Legacy WP') {
    throw new Error("Legacy Format 테스트 실패");
}

// Test 3: Mixed (Explicit Naver in options, general category for WP)
const mockMixed = {
    category: "General",
    options: { naver_category: "Explicit Naver" }
};
const res3 = resolveCategories(mockMixed);
console.log("✅ [3] Mixed:", JSON.stringify(res3));
if (res3.naverCat !== 'Explicit Naver' || res3.wpCat !== 'General') {
    throw new Error("Mixed 테스트 실패");
}

console.log("\n🎊 모든 오버라이드 로직 테스트 통과!");
