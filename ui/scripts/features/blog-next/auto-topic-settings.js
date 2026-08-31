let blogNextAutoTopicBound = false;
let blogNextAutoTopicLoaded = false;
let blogNextAutoTopicLoading = false;

function setBlogNextAutoTopicResult(message = '', level = '') {
  const result = document.getElementById('blog-next-auto-topic-result');
  if (!result) return;
  result.textContent = String(message || '');
  if (level) result.dataset.level = level;
  else delete result.dataset.level;
}

function setBlogNextAutoTopicSaving(saving) {
  const button = document.getElementById('blog-next-auto-topic-save');
  if (!button) return;
  button.disabled = saving;
  button.textContent = saving ? '저장 중...' : '설정 저장';
}

function normalizeBlogNextAutoTopicPlan(plan = {}) {
  const platforms = Array.isArray(plan.platforms)
    ? plan.platforms
    : String(plan.platforms || '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    platforms: platforms.filter((item) => item === 'naver' || item === 'wordpress'),
    writing_strategy: plan.writing_strategy === 'discovery' ? 'discovery' : 'search',
    image_mode: ['generate', 'prompt_only', 'none'].includes(plan.image_mode) ? plan.image_mode : 'generate',
    external_reference: plan.external_reference !== false,
    post_status: plan.post_status === 'draft' ? 'draft' : 'publish'
  };
}

function applyBlogNextAutoTopicPlan(plan = {}) {
  const normalized = normalizeBlogNextAutoTopicPlan(plan);
  const naver = document.getElementById('blog-next-auto-topic-target-naver');
  const wordpress = document.getElementById('blog-next-auto-topic-target-wordpress');
  const strategy = document.getElementById('blog-next-auto-topic-writing-strategy');
  const imageMode = document.getElementById('blog-next-auto-topic-image-mode');
  const postStatus = document.getElementById('blog-next-auto-topic-post-status');
  const externalReference = document.getElementById('blog-next-auto-topic-external-reference');
  if (naver) naver.checked = normalized.platforms.includes('naver');
  if (wordpress) wordpress.checked = normalized.platforms.includes('wordpress');
  if (strategy) strategy.value = normalized.writing_strategy;
  if (imageMode) imageMode.value = normalized.image_mode;
  if (postStatus) postStatus.value = normalized.post_status;
  if (externalReference) externalReference.checked = normalized.external_reference;
}

function readBlogNextAutoTopicPlan() {
  const platforms = [];
  if (document.getElementById('blog-next-auto-topic-target-naver')?.checked) platforms.push('naver');
  if (document.getElementById('blog-next-auto-topic-target-wordpress')?.checked) platforms.push('wordpress');
  if (platforms.length === 0) {
    const error = new Error('포스팅 대상을 하나 이상 선택해 주세요.');
    error.fieldId = 'blog-next-auto-topic-target-naver';
    throw error;
  }
  return {
    platforms,
    writing_strategy: document.getElementById('blog-next-auto-topic-writing-strategy')?.value || 'search',
    image_mode: document.getElementById('blog-next-auto-topic-image-mode')?.value || 'generate',
    external_reference: document.getElementById('blog-next-auto-topic-external-reference')?.checked === true,
    post_status: document.getElementById('blog-next-auto-topic-post-status')?.value === 'draft' ? 'draft' : 'publish'
  };
}

async function loadBlogNextAutoTopicPlan(options = {}) {
  if (blogNextAutoTopicLoading || (blogNextAutoTopicLoaded && options.force !== true)) return;
  blogNextAutoTopicLoading = true;
  setBlogNextAutoTopicResult('불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    applyBlogNextAutoTopicPlan(data?.fields?.AUTO_TOPIC_PLAN || {});
    blogNextAutoTopicLoaded = true;
    setBlogNextAutoTopicResult('');
  } catch (error) {
    setBlogNextAutoTopicResult(error.message || '자동 글감 설정을 불러오지 못했습니다.', 'error');
  } finally {
    blogNextAutoTopicLoading = false;
  }
}

async function saveBlogNextAutoTopicPlan(event) {
  event?.preventDefault();
  setBlogNextAutoTopicSaving(true);
  setBlogNextAutoTopicResult('');
  try {
    const plan = readBlogNextAutoTopicPlan();
    const major = await fetchJson('/api/v1/settings/major');
    await postJson('/api/v1/settings/major', {
      ...(major?.fields || {}),
      AUTO_TOPIC_PLAN: plan
    });
    blogNextAutoTopicLoaded = true;
    setBlogNextAutoTopicResult('저장했습니다.', 'success');
  } catch (error) {
    if (error.fieldId) document.getElementById(error.fieldId)?.focus();
    setBlogNextAutoTopicResult(error.message || '자동 글감 설정을 저장하지 못했습니다.', 'error');
  } finally {
    setBlogNextAutoTopicSaving(false);
  }
}

function initBlogNextAutoTopicSettings() {
  if (blogNextAutoTopicBound) return;
  document.getElementById('blog-next-auto-topic-form')?.addEventListener('submit', saveBlogNextAutoTopicPlan);
  blogNextAutoTopicBound = true;
}
