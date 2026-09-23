let settingsNextWritingResponse = null;
let settingsNextWritingDraft = null;
let settingsNextWritingSavedSignature = '';
let settingsNextWritingLoading = false;
let settingsNextWritingBusy = false;
let settingsNextWritingBound = false;

function settingsNextWritingClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function settingsNextWritingValue(id, fallback = '') {
  const element = document.getElementById(id);
  return element ? String(element.value ?? fallback) : fallback;
}

function settingsNextWritingSetValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value == null ? '' : String(value);
}

function settingsNextWritingLabel(group, value, fallback = '') {
  const labels = {
    mode: { conversational: '구어체', written: '문어체' },
    speech: { polite: '존댓말', plain: '평어' },
    tone: { calm: '차분하게', balanced: '균형 있게', vivid: '생동감 있게' },
    length: { short: '짧게', standard: '보통', long: '길게' },
    opening: { direct: '핵심부터', contextual: '공감 상황부터', scene: '장면·이야기부터' },
    development: { explanatory: '설명형', problem_solution: '문제 해결형', experience_review: '경험·리뷰형', comparison: '비교·선택형' },
    ending: { summary: '핵심 요약', judgment: '개인적 판단', next_step: '다음 행동 제안' }
  };
  return labels[group]?.[value] || fallback || value;
}

function settingsNextWritingSetFeedback(id, message = '', tone = 'neutral') {
  setUiSettingsCardFeedback(id, message, tone);
}

function settingsNextWritingCaptureDraft() {
  if (!settingsNextWritingDraft) return;
  const profile = settingsNextWritingDraft;
  const voice = profile.common.voice;
  const blog = profile.channels.blog;
  voice.writing_mode = settingsNextWritingValue('settings-next-writing-mode', 'conversational');
  voice.speech_level = settingsNextWritingValue('settings-next-writing-speech', 'polite');
  voice.tone = settingsNextWritingValue('settings-next-writing-tone', 'balanced');
  profile.common.style_instruction = settingsNextWritingValue('settings-next-writing-instruction').trim();
  blog.length.preset = settingsNextWritingValue('settings-next-writing-length', 'standard');
  blog.structure.opening = settingsNextWritingValue('settings-next-writing-opening', 'contextual');
  blog.structure.development = settingsNextWritingValue('settings-next-writing-development', 'explanatory');
  blog.structure.ending = settingsNextWritingValue('settings-next-writing-ending', 'judgment');
  blog.image_plan.count_mode = settingsNextWritingValue('settings-next-writing-image-mode', 'auto');
  blog.image_plan.fixed_count = blog.image_plan.count_mode === 'fixed'
    ? Number(settingsNextWritingValue('settings-next-writing-image-count', '4'))
    : null;
}

function settingsNextWritingSignature() {
  return settingsNextWritingDraft ? JSON.stringify(settingsNextWritingDraft) : '';
}

function settingsNextWritingSyncDirty() {
  settingsNextWritingCaptureDraft();
  const dirty = Boolean(settingsNextWritingDraft)
    && settingsNextWritingSignature() !== settingsNextWritingSavedSignature;
  if (dirty) settingsNextMarkScopeDirty('writing');
  else settingsNextClearScopeDirty('writing');
  const apply = document.getElementById('settings-next-writing-apply');
  if (apply) apply.disabled = !dirty || settingsNextWritingBusy;
  if (dirty) settingsNextWritingSetFeedback('settings-next-writing-feedback', '');
  settingsNextWritingRenderSummaries();
}

function settingsNextWritingRenderSummaries() {
  if (!settingsNextWritingDraft) return;
  const profile = settingsNextWritingDraft;
  const voice = profile.common.voice;
  const blog = profile.channels.blog;
  settingsNextSetText('settings-next-writing-voice-summary', [
    settingsNextWritingLabel('mode', voice.writing_mode),
    settingsNextWritingLabel('speech', voice.speech_level),
    settingsNextWritingLabel('tone', voice.tone)
  ].join(' · '));
  settingsNextSetText('settings-next-writing-structure-summary', [
    settingsNextWritingLabel('length', blog.length.preset),
    settingsNextWritingLabel('development', blog.structure.development),
    settingsNextWritingLabel('ending', blog.structure.ending)
  ].join(' · '));
  const imageSummary = blog.image_plan.count_mode === 'fixed'
    ? `${blog.image_plan.fixed_count || 4}개로 지정`
    : '글 길이에 맞게 자동';
  settingsNextSetText('settings-next-writing-image-summary', imageSummary);
}

function settingsNextWritingSyncDependentFields() {
  const fixed = settingsNextWritingValue('settings-next-writing-image-mode', 'auto') === 'fixed';
  const count = document.getElementById('settings-next-writing-image-count');
  const field = document.getElementById('settings-next-writing-image-count-field');
  if (count) count.disabled = !fixed;
  field?.classList.toggle('is-muted', !fixed);
  const instruction = document.getElementById('settings-next-writing-instruction');
  const instructionCount = document.getElementById('settings-next-writing-instruction-count');
  if (instruction && instructionCount) {
    instructionCount.textContent = `${Math.max(0, instruction.maxLength - instruction.value.length)}자 남음`;
  }
  const reference = document.getElementById('settings-next-writing-reference-text');
  const referenceCount = document.getElementById('settings-next-writing-reference-count');
  if (reference && referenceCount) {
    referenceCount.textContent = `${Math.max(0, reference.maxLength - reference.value.length).toLocaleString('ko-KR')}자 남음`;
  }
}

function settingsNextWritingReferenceMethod() {
  return document.querySelector('input[name="settings-next-writing-reference-method"]:checked')?.value || 'text';
}

function settingsNextWritingSyncReferenceMethod() {
  const method = settingsNextWritingReferenceMethod();
  const textField = document.getElementById('settings-next-writing-reference-text-field');
  const urlField = document.getElementById('settings-next-writing-reference-url-field');
  if (textField) textField.hidden = method !== 'text';
  if (urlField) urlField.hidden = method !== 'url';
}

function settingsNextWritingCaptureReferences() {
  if (!settingsNextWritingDraft) return;
  const refs = settingsNextWritingDraft.channels.blog.style_references;
  const method = settingsNextWritingReferenceMethod();
  const sampleText = method === 'text' ? settingsNextWritingValue('settings-next-writing-reference-text').trim() : '';
  const url = method === 'url' ? settingsNextWritingValue('settings-next-writing-reference-url').trim() : '';
  const previousText = String(refs.sample_text?.value || '');
  const previousUrl = String(refs.blog_urls?.[0]?.url || '');
  if (sampleText === previousText && url === previousUrl) return;
  const stale = Boolean(refs.fingerprint);
  refs.sample_text = { value: sampleText, status: sampleText ? (stale ? 'stale' : 'pending') : 'empty' };
  refs.blog_urls = url ? [{ url, status: stale ? 'stale' : 'pending', title: '', error: '' }] : [];
  settingsNextWritingRenderReferenceState();
}

function settingsNextWritingRenderReferenceState() {
  const refs = settingsNextWritingDraft?.channels?.blog?.style_references;
  if (!refs) return;
  const sourceStatuses = [refs.sample_text?.status, ...(refs.blog_urls || []).map((item) => item.status)]
    .filter((status) => status && status !== 'empty');
  const needsAnalysis = sourceStatuses.some((status) => status === 'pending' || status === 'stale');
  const failed = sourceStatuses.some((status) => status === 'failed');
  const analyzed = Boolean(refs.fingerprint) && sourceStatuses.some((status) => status === 'analyzed') && !needsAnalysis;
  settingsNextWritingSetFeedback(
    'settings-next-writing-reference-feedback',
    needsAnalysis ? '참고 글이 변경되었습니다. 분석하면 위 기본값에 제안 결과를 반영합니다.'
      : (failed ? '참고 글을 분석하지 못했습니다. 이전 결과는 유지했습니다.'
        : (analyzed ? `분석 결과 반영됨 · ${refs.fingerprint.summary || '문체와 구성을 확인했습니다.'}` : '')),
    failed ? 'danger' : (needsAnalysis ? 'warning' : 'neutral')
  );
}

function settingsNextWritingRender() {
  if (!settingsNextWritingDraft) return;
  const profile = settingsNextWritingDraft;
  const voice = profile.common.voice;
  const blog = profile.channels.blog;
  settingsNextWritingSetValue('settings-next-writing-mode', voice.writing_mode);
  settingsNextWritingSetValue('settings-next-writing-speech', voice.speech_level);
  settingsNextWritingSetValue('settings-next-writing-tone', voice.tone);
  settingsNextWritingSetValue('settings-next-writing-instruction', profile.common.style_instruction);
  settingsNextWritingSetValue('settings-next-writing-length', blog.length.preset);
  settingsNextWritingSetValue('settings-next-writing-opening', blog.structure.opening);
  settingsNextWritingSetValue('settings-next-writing-development', blog.structure.development);
  settingsNextWritingSetValue('settings-next-writing-ending', blog.structure.ending);
  settingsNextWritingSetValue('settings-next-writing-image-mode', blog.image_plan.count_mode);
  settingsNextWritingSetValue('settings-next-writing-image-count', blog.image_plan.fixed_count || 4);
  const refs = blog.style_references || {};
  settingsNextWritingSetValue('settings-next-writing-reference-text', refs.sample_text?.value || '');
  settingsNextWritingSetValue('settings-next-writing-reference-url', refs.blog_urls?.[0]?.url || '');
  const method = refs.sample_text?.value ? 'text' : (refs.blog_urls?.[0]?.url ? 'url' : 'text');
  const methodRadio = document.querySelector(`input[name="settings-next-writing-reference-method"][value="${method}"]`);
  if (methodRadio) methodRadio.checked = true;
  settingsNextWritingSyncReferenceMethod();
  settingsNextWritingSyncDependentFields();
  settingsNextWritingRenderReferenceState();
  settingsNextWritingRenderSummaries();
}

function settingsNextWritingApplyResponse(data) {
  settingsNextWritingResponse = settingsNextWritingClone(data);
  settingsNextWritingDraft = settingsNextWritingClone(data.effective_profile || data.default_profile);
  settingsNextWritingDraft.common.writing_strategy = data.effective_profile?.common?.writing_strategy
    || data.default_profile?.common?.writing_strategy
    || 'search';
  settingsNextWritingDraft.based_on_default_version = data.custom_profile?.based_on_default_version
    || data.default_profile_metadata?.profile_version
    || 1;
  settingsNextWritingRender();
  settingsNextWritingSavedSignature = settingsNextWritingSignature();
  settingsNextClearScopeDirty('writing');
  settingsNextWritingSetFeedback('settings-next-writing-load-feedback', '');
  settingsNextWritingSetFeedback('settings-next-writing-feedback', '');
  settingsNextWritingSyncDirty();
}

function settingsNextWritingDiscardChanges() {
  if (!settingsNextWritingResponse) return false;
  settingsNextWritingApplyResponse(settingsNextWritingResponse);
  return true;
}

async function settingsNextLoadWritingDefaults() {
  if (settingsNextWritingLoading) return false;
  if (settingsNextDirtyScopes.has('writing')) return false;
  settingsNextWritingLoading = true;
  try {
    settingsNextWritingApplyResponse(await fetchJson('/api/v1/settings/writing-profile'));
    return true;
  } catch (error) {
    settingsNextWritingSetFeedback('settings-next-writing-load-feedback', error.message || '글쓰기 기본값을 불러오지 못했습니다.', 'danger');
    return false;
  } finally {
    settingsNextWritingLoading = false;
  }
}

function settingsNextWritingSetBusy(busy, action = '') {
  settingsNextWritingBusy = busy;
  const form = document.getElementById('settings-next-writing-form');
  const apply = document.getElementById('settings-next-writing-apply');
  const analyze = document.getElementById('settings-next-writing-reference-analyze');
  const preview = document.getElementById('settings-next-writing-preview-generate');
  if (form) form.setAttribute('aria-busy', busy ? 'true' : 'false');
  [apply, analyze, preview].forEach((button) => { if (button) button.disabled = busy; });
  if (apply) apply.textContent = busy && action === 'apply' ? '적용 중…' : '기본값 적용';
  if (analyze) analyze.textContent = busy && action === 'analyze' ? '분석 중…' : '참고 글 분석';
  if (preview) preview.textContent = busy && action === 'preview' ? '생성 중…' : '미리보기 생성';
  if (!busy) settingsNextWritingSyncDirty();
}

async function settingsNextWritingApply({ quiet = false } = {}) {
  if (!settingsNextWritingDraft || settingsNextWritingBusy) return false;
  settingsNextWritingCaptureDraft();
  settingsNextWritingCaptureReferences();
  settingsNextWritingSetBusy(true, 'apply');
  settingsNextWritingSetFeedback('settings-next-writing-feedback', '');
  try {
    const basedOnDefaultVersion = settingsNextWritingDraft.based_on_default_version
      || settingsNextWritingResponse?.default_profile_metadata?.profile_version
      || 1;
    const profile = settingsNextWritingClone(settingsNextWritingDraft);
    delete profile.based_on_default_version;
    const data = await putJson('/api/v1/settings/writing-profile', {
      active_profile: 'custom',
      custom_profile: { based_on_default_version: basedOnDefaultVersion, ...profile }
    });
    settingsNextWritingApplyResponse(data);
    settingsWritingProfileResponse = null;
    if (!quiet) showUiToast({ level: 'success', title: '글쓰기 기본값 적용', message: '다음 글부터 이 문체와 구성을 기본으로 사용합니다.', dedupeKey: 'writing-defaults-applied' });
    return true;
  } catch (error) {
    settingsNextWritingSetFeedback('settings-next-writing-feedback', error.message || '글쓰기 기본값을 반영하지 못했습니다.', 'danger');
    return false;
  } finally {
    settingsNextWritingSetBusy(false);
  }
}

async function settingsNextWritingSubmit(event) {
  event.preventDefault();
  await settingsNextWritingApply();
}

async function settingsNextWritingReset() {
  if (!settingsNextWritingResponse || settingsNextWritingBusy) return;
  const confirmed = await showUiConfirm('문체, 글 구성과 이미지 구성을 BlogGenius 추천 설정으로 되돌릴까요? 글 작성 전략은 바뀌지 않습니다.', {
    title: '추천 설정으로 되돌리기', confirmText: '되돌리기', cancelText: '취소'
  });
  if (!confirmed) return;
  const strategy = settingsNextWritingDraft?.common?.writing_strategy || 'search';
  settingsNextWritingDraft = settingsNextWritingClone(settingsNextWritingResponse.default_profile);
  settingsNextWritingDraft.common.writing_strategy = strategy;
  settingsNextWritingDraft.based_on_default_version = settingsNextWritingResponse.default_profile_metadata?.profile_version || 1;
  settingsNextWritingRender();
  settingsNextWritingSyncDirty();
}

async function settingsNextWritingAnalyzeReferences() {
  if (!settingsNextWritingDraft || settingsNextWritingBusy) return;
  settingsNextWritingCaptureReferences();
  const refs = settingsNextWritingDraft.channels.blog.style_references;
  if (!refs.sample_text?.value && !(refs.blog_urls || []).length) {
    settingsNextWritingSetFeedback('settings-next-writing-reference-feedback', '분석할 글이나 블로그 URL을 입력해 주세요.', 'danger');
    return;
  }
  settingsNextWritingSetBusy(true, 'analyze');
  try {
    const result = await postJson('/api/v1/settings/writing-profile/references/analyze', {
      sample_text: refs.sample_text.value,
      blog_urls: refs.blog_urls.map((entry) => entry.url)
    });
    const profile = settingsNextWritingDraft;
    profile.channels.blog.style_references = result;
    profile.common.voice = settingsNextWritingClone(result.fingerprint.surface);
    profile.channels.blog.length.preset = result.fingerprint.settings.length_preset;
    profile.channels.blog.structure.opening = result.fingerprint.settings.opening;
    profile.channels.blog.structure.development = result.fingerprint.settings.development;
    profile.channels.blog.structure.ending = result.fingerprint.settings.ending;
    profile.channels.blog.structure.heading_density = result.fingerprint.settings.heading_density;
    settingsNextWritingRender();
    settingsNextWritingSyncDirty();
  } catch (error) {
    settingsNextWritingSetFeedback('settings-next-writing-reference-feedback', `분석 실패: ${error.message}. 이전 결과는 유지했습니다.`, 'danger');
  } finally {
    settingsNextWritingSetBusy(false);
  }
}

async function settingsNextWritingClearReferences() {
  if (!settingsNextWritingDraft || settingsNextWritingBusy) return;
  const refs = settingsNextWritingDraft.channels.blog.style_references;
  const hasSource = Boolean(refs.sample_text?.value || refs.blog_urls?.length || refs.fingerprint);
  if (!hasSource) return;
  const confirmed = await showUiConfirm('참고 글과 분석 정보만 지울까요? 이미 반영된 문체와 구성 값은 유지됩니다.', {
    title: '참고 글 지우기', confirmText: '지우기', cancelText: '취소'
  });
  if (!confirmed) return;
  settingsNextWritingDraft.channels.blog.style_references = {
    sample_text: { value: '', status: 'empty' }, blog_urls: [], fingerprint: null,
    fingerprint_input_hash: null, analyzed_at: null, analyzer_version: null, analyzer_model: null
  };
  settingsNextWritingRender();
  settingsNextWritingSyncDirty();
}

function settingsNextWritingSyncPreviewKind() {
  const kind = settingsNextWritingValue('settings-next-writing-preview-kind', 'blog');
  const topic = document.getElementById('settings-next-writing-preview-topic');
  if (!topic) return;
  if (kind === 'shopping') {
    if (!topic.disabled) topic.dataset.blogTopic = topic.value;
    topic.value = '';
    topic.placeholder = '고정된 예시 상품으로 미리보기를 생성합니다.';
    topic.disabled = true;
  } else {
    topic.disabled = false;
    topic.value = topic.dataset.blogTopic || topic.value;
    topic.placeholder = '미리 볼 블로그 주제를 입력해 주세요.';
  }
  document.getElementById('settings-next-writing-preview-result')?.setAttribute('hidden', '');
  settingsNextWritingSetFeedback('settings-next-writing-preview-feedback', '');
}

function settingsNextWritingRenderPreview(result) {
  settingsNextSetText('settings-next-writing-preview-opening', result.outline?.opening || '');
  settingsNextSetText('settings-next-writing-preview-ending', result.outline?.ending || '');
  settingsNextSetText('settings-next-writing-preview-sample', result.sample || '');
  const sections = document.getElementById('settings-next-writing-preview-sections');
  if (sections) {
    sections.replaceChildren(...(result.outline?.sections || []).map((section) => {
      const item = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = section.heading;
      item.append(heading, document.createTextNode(` — ${section.role}`));
      return item;
    }));
  }
  const resultElement = document.getElementById('settings-next-writing-preview-result');
  if (resultElement) resultElement.hidden = false;
}

async function settingsNextWritingGeneratePreview() {
  if (!settingsNextWritingDraft || settingsNextWritingBusy) return;
  settingsNextWritingCaptureDraft();
  const kind = settingsNextWritingValue('settings-next-writing-preview-kind', 'blog');
  const topic = settingsNextWritingValue('settings-next-writing-preview-topic').trim();
  if (kind === 'blog' && !topic) {
    settingsNextWritingSetFeedback('settings-next-writing-preview-feedback', '미리 볼 주제를 입력해 주세요.', 'danger');
    return;
  }
  settingsNextWritingSetBusy(true, 'preview');
  settingsNextWritingSetFeedback('settings-next-writing-preview-feedback', '');
  try {
    const profile = settingsNextWritingClone(settingsNextWritingDraft);
    delete profile.based_on_default_version;
    const result = await postJson('/api/v1/settings/writing-profile/preview', { kind, topic, profile });
    settingsNextWritingRenderPreview(result);
  } catch (error) {
    settingsNextWritingSetFeedback('settings-next-writing-preview-feedback', `미리보기 실패: ${error.message}. 이전 결과는 유지했습니다.`, 'danger');
  } finally {
    settingsNextWritingSetBusy(false);
  }
}

function initSettingsNextWriting() {
  if (settingsNextWritingBound) return;
  document.querySelectorAll('[data-settings-next-writing-field]').forEach((field) => {
    field.addEventListener(field.tagName === 'TEXTAREA' ? 'input' : 'change', () => {
      settingsNextWritingSyncDependentFields();
      settingsNextWritingSyncDirty();
    });
  });
  document.querySelectorAll('[data-settings-next-writing-reference]').forEach((field) => {
    field.addEventListener('input', () => {
      settingsNextWritingSyncDependentFields();
      settingsNextWritingCaptureReferences();
      settingsNextWritingSyncDirty();
    });
  });
  document.querySelectorAll('input[name="settings-next-writing-reference-method"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      settingsNextWritingSyncReferenceMethod();
      settingsNextWritingCaptureReferences();
      settingsNextWritingSyncDirty();
    });
  });
  document.getElementById('settings-next-writing-form')?.addEventListener('submit', settingsNextWritingSubmit);
  document.getElementById('settings-next-writing-reset')?.addEventListener('click', () => void settingsNextWritingReset());
  document.getElementById('settings-next-writing-reference-analyze')?.addEventListener('click', () => void settingsNextWritingAnalyzeReferences());
  document.getElementById('settings-next-writing-reference-clear')?.addEventListener('click', () => void settingsNextWritingClearReferences());
  document.getElementById('settings-next-writing-preview-kind')?.addEventListener('change', settingsNextWritingSyncPreviewKind);
  document.getElementById('settings-next-writing-preview-generate')?.addEventListener('click', () => void settingsNextWritingGeneratePreview());
  settingsNextWritingSyncPreviewKind();
  settingsNextWritingBound = true;
}
