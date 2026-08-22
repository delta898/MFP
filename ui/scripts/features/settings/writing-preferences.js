const BLOG_WRITING_STYLE_PREVIEWS = {
  'conversational:polite': {
    description: '친근하고 자연스러운 후기형 문체',
    example: '직접 써보니 생각보다 편했고, 처음 쓰는 분도 금방 익힐 수 있어요.'
  },
  'conversational:plain': {
    description: '편안하고 자유로운 일기·SNS형 문체',
    example: '직접 써보니 생각보다 편했고, 처음 써도 금방 익힐 수 있어.'
  },
  'written:polite': {
    description: '정돈되고 신뢰감 있는 정보·전문형 문체',
    example: '직접 사용해 본 결과 편의성이 높았으며, 처음 사용하는 경우에도 쉽게 익힐 수 있습니다.'
  },
  'written:plain': {
    description: '간결하고 객관적인 설명문·칼럼형 문체',
    example: '직접 사용해 본 결과 편의성이 높았고, 처음 사용하는 경우에도 쉽게 익힐 수 있다.'
  }
};
let currentBlogWritingStrategy = 'search';

function getSelectedSettingsRadioValue(name, fallback) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function setSelectedSettingsRadioValue(name, value, fallback) {
  const targetValue = String(value || fallback);
  const target = document.querySelector(`input[name="${name}"][value="${targetValue}"]`)
    || document.querySelector(`input[name="${name}"][value="${fallback}"]`);
  if (target) target.checked = true;
}

function syncSettingsBlogWritingStyleDescription() {
  const writingMode = getSelectedSettingsRadioValue('settings-blog-writing-mode', 'conversational');
  const speechLevel = getSelectedSettingsRadioValue('settings-blog-speech-level', 'polite');
  const preview = BLOG_WRITING_STYLE_PREVIEWS[`${writingMode}:${speechLevel}`]
    || BLOG_WRITING_STYLE_PREVIEWS['conversational:polite'];
  const descriptionTarget = document.querySelector('#settings-blog-writing-style-description strong');
  const exampleTarget = document.getElementById('settings-blog-writing-style-example');
  if (descriptionTarget) descriptionTarget.textContent = preview.description;
  if (exampleTarget) exampleTarget.textContent = `(예시: ${preview.example})`;
}

function getWritingStrategyLabel(value) {
  return value === 'discovery' ? '발견 중심 (피드)' : '검색 중심';
}

function syncWritingStrategyInheritanceLabels() {
  const label = `기본 설정 사용 (현재: ${getWritingStrategyLabel(currentBlogWritingStrategy)})`;
  const inheritOption = document.querySelector('#blog-edit-writing-strategy option[value="inherit"]');
  if (inheritOption) inheritOption.textContent = label;
  setSelectedSettingsRadioValue('quick-writing-strategy', currentBlogWritingStrategy, 'search');
}

function syncSettingsBlogWritingStrategyDescription() {
  currentBlogWritingStrategy = getSelectedSettingsRadioValue('settings-blog-writing-strategy', 'search') === 'discovery'
    ? 'discovery'
    : 'search';
  const target = document.querySelector('#settings-blog-writing-strategy-description strong');
  if (target) {
    target.textContent = currentBlogWritingStrategy === 'discovery'
      ? '피드에서 발견한 독자의 관심과 읽기 흐름을 고려합니다.'
      : '검색 의도와 핵심 정보를 명확하게 전달합니다.';
  }
  syncWritingStrategyInheritanceLabels();
}

