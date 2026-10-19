'use strict';

function compareSortValues(a, b) {
    const aNull = a === null || a === undefined || a === '';
    const bNull = b === null || b === undefined || b === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'ko', { numeric: true, sensitivity: 'base' });
}

function getTopicSortValue(item, key) {
    if (!item) return '';
    if (key === 'rowNumber') return Number(item.rowNumber || 0);
    if (key === 'subject') return String(item.subject || '');
    if (key === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
    if (key === 'instruction') return String(item.content_guide?.additional_instructions || '');
    if (key === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
    if (key === 'imageMode' || key === 'imageGeneration') return String(item.image_mode || item.image_options?.mode || 'prompt_only');
    if (key === 'externalReference') return item.use_external_ref === true ? 1 : 0;
    if (key === 'runtimeLog') return String(item.runtimeLog || '');
    if (key === 'status') return String(item.status || '');
    return Number(item.rowNumber || 0);
}

function getShoppingSortValue(item, key) {
    if (!item) return '';
    if (key === 'rowNumber') return Number(item.rowNumber || 0);
    if (key === 'product') return String(item.product || '');
    if (key === 'shortUrl') return String(item.shortUrl || '');
    if (key === 'runtimeLog') return String(item.runtimeLog || '');
    if (key === 'status') return String(item.status || '');
    if (key === 'publishedAt') return String(item.publishedAt || '');
    return Number(item.rowNumber || 0);
}

function sortItems(items, sortBy, sortDir, getValue) {
    const key = String(sortBy || 'rowNumber').trim();
    const direction = String(sortDir || 'desc').trim().toLowerCase() === 'desc' ? -1 : 1;
    const source = Array.isArray(items) ? items : [];
    return source
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const cmp = compareSortValues(getValue(a.item, key), getValue(b.item, key));
            return cmp !== 0 ? cmp * direction : a.index - b.index;
        })
        .map(({ item }) => item);
}

function sortTopicItems(items, sortBy = 'rowNumber', sortDir = 'desc') {
    return sortItems(items, sortBy, sortDir, getTopicSortValue);
}

function sortShoppingItems(items, sortBy = 'rowNumber', sortDir = 'desc') {
    return sortItems(items, sortBy, sortDir, getShoppingSortValue);
}

module.exports = { sortTopicItems, sortShoppingItems };
