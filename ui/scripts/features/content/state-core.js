let categoryCache = null; // 워드프레스 카테고리 캐시 공통
let categoryFetchPromise = null; // 중복 요청 방지용 프로미스
let blogTopicsCache = []; // [Restored] 블로그 목록 데이터 캐시
let blogTopicsWriteLockUntil = 0; // [Restored] 블로그 목록 재렌더링 방지 락
let blogTrendsCache = [];
let blogShoppingCache = [];
const blogSelectedRowIndices = new Set();
const blogTrendsSelectedRowIndices = new Set();
const blogShoppingSelectedRowIndices = new Set();
let blogLastBatchResult = null;
const blogRecentBatchRows = new Map();
let blogInlineEditState = null;
let shoppingInlineEditState = null;

// [Restored] 워드프레스 카테고리 드롭다운 채우기 헬퍼
function populateFilterWpCategoryDropdown(selectId, categories) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const firstOption = select.options.length > 0 ? select.options[0] : null;
  select.innerHTML = '';

  if (firstOption && firstOption.value === '') {
    select.appendChild(firstOption);
  } else {
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '워드프레스 카테고리 (전체)';
    select.appendChild(defaultOpt);
  }

  if (Array.isArray(categories)) {
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name || cat.id; // 보통 검색 필터는 name을 사용
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  }
}
