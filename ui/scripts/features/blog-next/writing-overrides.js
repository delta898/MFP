let blogNextWritingDefaults = null;

const BLOG_NEXT_WRITING_OVERRIDE_IDS = Object.freeze({
  length: 'blog-next-writing-length',
  opening: 'blog-next-writing-opening',
  development: 'blog-next-writing-development',
  ending: 'blog-next-writing-ending'
});

const BLOG_NEXT_WRITING_LABELS = Object.freeze({
  length: { short: '짧게 · 900~1,200자', standard: '보통 · 1,500~1,800자', long: '길게 · 2,200~2,800자' },
  opening: { direct: '핵심부터', contextual: '공감 상황부터', scene: '장면·이야기부터' },
  development: { explanatory: '설명형', problem_solution: '문제 해결형', experience_review: '경험·리뷰형', comparison: '비교·선택형' },
  ending: { summary: '핵심 요약', judgment: '개인적 판단', next_step: '다음 행동 제안' }
});

function readBlogNextWritingOverrides() {
  const result = {};
  Object.entries(BLOG_NEXT_WRITING_OVERRIDE_IDS).forEach(([field, id]) => {
    const value = String(document.getElementById(id)?.value || '').trim();
    if (value) result[field] = value;
  });
  return result;
}

function normalizeBlogNextWritingOverrides(value = {}) {
  const result = {};
  Object.entries(BLOG_NEXT_WRITING_OVERRIDE_IDS).forEach(([field]) => {
    const candidate = String(value?.[field] || '').trim();
    if (BLOG_NEXT_WRITING_LABELS[field]?.[candidate]) result[field] = candidate;
  });
  return result;
}

function applyBlogNextWritingOverrides(value = {}) {
  const normalized = normalizeBlogNextWritingOverrides(value);
  Object.entries(BLOG_NEXT_WRITING_OVERRIDE_IDS).forEach(([field, id]) => {
    const element = document.getElementById(id);
    if (element) element.value = normalized[field] || '';
  });
}

function renderBlogNextWritingDefaultOptions() {
  if (!blogNextWritingDefaults) return;
  Object.entries(BLOG_NEXT_WRITING_OVERRIDE_IDS).forEach(([field, id]) => {
    const select = document.getElementById(id);
    const option = select?.querySelector('option[value=""]');
    if (!select || !option) return;
    option.textContent = `기본값 · ${BLOG_NEXT_WRITING_LABELS[field]?.[blogNextWritingDefaults[field]] || '설정값 사용'}`;
  });
}

async function loadBlogNextWritingDefaults() {
  try {
    const data = await fetchJson('/api/v1/settings/writing-profile');
    const blog = data?.effective_profile?.channels?.blog || {};
    blogNextWritingDefaults = {
      length: blog.length?.preset || 'standard',
      opening: blog.structure?.opening || 'contextual',
      development: blog.structure?.development || 'explanatory',
      ending: blog.structure?.ending || 'judgment'
    };
  } catch (_error) {
    blogNextWritingDefaults = { length: 'standard', opening: 'contextual', development: 'explanatory', ending: 'judgment' };
  }
  renderBlogNextWritingDefaultOptions();
}
