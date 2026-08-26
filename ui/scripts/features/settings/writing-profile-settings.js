function cloneSettingsWritingProfile(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getSettingsWritingProfileActiveKind() {
  return document.querySelector('input[name="settings-writing-profile-kind"]:checked')?.value || 'default';
}

function setSettingsWritingProfileValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value == null ? '' : String(value);
}

function getSettingsWritingProfileValue(id, fallback = '') {
  const el = document.getElementById(id);
  return el ? String(el.value ?? fallback) : fallback;
}

function getVisibleSettingsWritingProfile() {
  if (!settingsWritingProfileDraft) return null;
  return getSettingsWritingProfileActiveKind() === 'custom'
    ? settingsWritingProfileDraft.custom_profile
    : getEffectiveSettingsWritingDefaultProfile();
}

function getEffectiveSettingsWritingDefaultProfile() {
  if (!settingsWritingProfileDraft?.default_profile) return null;
  const profile = cloneSettingsWritingProfile(settingsWritingProfileDraft.default_profile);
  const overrides = settingsWritingProfileDraft.default_profile_overrides || {};
  profile.common.writing_strategy = overrides.writing_strategy || profile.common.writing_strategy;
  profile.common.voice.writing_mode = overrides.writing_mode || profile.common.voice.writing_mode;
  profile.common.voice.speech_level = overrides.speech_level || profile.common.voice.speech_level;
  return profile;
}

function captureSettingsWritingProfileKind(kind = getSettingsWritingProfileActiveKind()) {
  if (!settingsWritingProfileDraft) return;
  if (kind === 'default') {
    settingsWritingProfileDraft.default_profile_overrides = {
      writing_strategy: getSelectedSettingsRadioValue('settings-blog-writing-strategy', 'search'),
      writing_mode: getSettingsWritingProfileValue('settings-blog-writing-mode', 'conversational'),
      speech_level: getSettingsWritingProfileValue('settings-blog-speech-level', 'polite')
    };
    return;
  }
  const current = settingsWritingProfileDraft.custom_profile;
  if (!current) return;
  current.common.voice.writing_mode = getSettingsWritingProfileValue('settings-blog-writing-mode', 'conversational');
  current.common.voice.speech_level = getSettingsWritingProfileValue('settings-blog-speech-level', 'polite');
  current.common.voice.tone = getSettingsWritingProfileValue('settings-writing-tone', 'balanced');
  current.common.writing_strategy = getSelectedSettingsRadioValue('settings-blog-writing-strategy', 'search');
  current.common.style_instruction = getSettingsWritingProfileValue('settings-writing-common-instruction').trim();
  const blog = current.channels.blog;
  blog.length.preset = getSettingsWritingProfileValue('settings-writing-blog-length', 'standard');
  blog.narrator_presence = 'occasional';
  blog.structure.opening = getSettingsWritingProfileValue('settings-writing-blog-opening', 'contextual');
  blog.structure.development = getSettingsWritingProfileValue('settings-writing-blog-development', 'explanatory');
  blog.structure.ending = getSettingsWritingProfileValue('settings-writing-blog-ending', 'judgment');
  blog.image_plan.count_mode = getSettingsWritingProfileValue('settings-writing-blog-image-mode', 'auto');
  blog.image_plan.fixed_count = blog.image_plan.count_mode === 'fixed'
    ? Number(getSettingsWritingProfileValue('settings-writing-blog-image-count', '4'))
    : null;
  blog.author_context = '';
  blog.additional_instruction = '';
  current.channels.shopping.additional_instruction = '';
}

function captureSettingsWritingVisibleProfile() {
  captureSettingsWritingProfileKind(getSettingsWritingProfileActiveKind());
}

function syncSettingsWritingReferenceInputMethodUi() {
  const method = getSelectedSettingsRadioValue('settings-writing-reference-input-method', 'text');
  const textField = document.getElementById('settings-writing-reference-text-field');
  const urlField = document.getElementById('settings-writing-reference-url-field');
  if (textField) textField.hidden = method !== 'text';
  if (urlField) urlField.hidden = method !== 'url';
}

function getSettingsWritingReferenceInputs() {
  const method = getSelectedSettingsRadioValue('settings-writing-reference-input-method', 'text');
  const sampleText = method === 'text'
    ? getSettingsWritingProfileValue('settings-writing-reference-text').trim()
    : '';
  const url = method === 'url'
    ? String(document.querySelector('[data-writing-reference-url]')?.value || '').trim()
    : '';
  return {
    sampleText,
    urls: url ? [url] : []
  };
}

function markSettingsWritingReferencesChanged() {
  if (!settingsWritingProfileDraft || getSettingsWritingProfileActiveKind() !== 'custom') return;
  const refs = settingsWritingProfileDraft.custom_profile.channels.blog.style_references;
  const inputs = getSettingsWritingReferenceInputs();
  const previousUrls = (refs.blog_urls || []).map((entry) => entry.url);
  if (refs.sample_text?.value === inputs.sampleText
    && JSON.stringify(previousUrls) === JSON.stringify(inputs.urls)) {
    return;
  }
  const hasFingerprint = Boolean(refs.fingerprint);
  refs.sample_text = {
    value: inputs.sampleText,
    status: inputs.sampleText ? (hasFingerprint ? 'stale' : 'pending') : 'empty'
  };
  refs.blog_urls = inputs.urls.map((url) => {
    const previous = refs.blog_urls.find((entry) => entry.url === url);
    return {
      url,
      status: hasFingerprint ? 'stale' : 'pending',
      title: previous?.title || '',
      error: ''
    };
  });
  renderSettingsWritingReferenceState();
  syncSettingsWritingProfileDirty();
}

function buildSettingsWritingProfileSignature() {
  if (!settingsWritingProfileDraft) return '';
  return JSON.stringify({
    active_profile: getSettingsWritingProfileActiveKind(),
    default_profile_overrides: settingsWritingProfileDraft.default_profile_overrides,
    custom_profile: settingsWritingProfileDraft.custom_profile,
    based_on_default_version: settingsWritingProfileDraft.based_on_default_version
  });
}

function setSettingsWritingProfileStatus(message, state = 'idle') {
  const status = document.getElementById('settings-writing-profile-status');
  if (status) status.textContent = String(message || '');
}

function syncSettingsWritingProfileDirty() {
  captureSettingsWritingVisibleProfile();
  settingsWritingProfileDirty = Boolean(settingsWritingProfileDraft)
    && buildSettingsWritingProfileSignature() !== settingsWritingProfileSavedSignature;
  updateSettingsMajorSaveUi();
}

function syncSettingsWritingImageCountUi() {
  const mode = getSettingsWritingProfileValue('settings-writing-blog-image-mode', 'auto');
  const count = document.getElementById('settings-writing-blog-image-count');
  const isCustom = getSettingsWritingProfileActiveKind() === 'custom';
  if (count) count.disabled = !isCustom || mode !== 'fixed';
  document.getElementById('settings-writing-blog-image-count-field')?.classList.toggle('is-muted', mode !== 'fixed');
}

function syncSettingsWritingInstructionCounter() {
  const input = document.getElementById('settings-writing-common-instruction');
  const counter = document.getElementById('settings-writing-common-instruction-counter');
  if (!input || !counter) return;
  const maximum = Number(input.maxLength) || 500;
  counter.textContent = `선택 · ${Math.max(0, maximum - input.value.length)}자 남음`;
}

function syncSettingsWritingReferenceCounter() {
  const input = document.getElementById('settings-writing-reference-text');
  const counter = document.getElementById('settings-writing-reference-text-counter');
  if (!input || !counter) return;
  const maximum = Number(input.maxLength) || 12000;
  counter.textContent = `선택 · ${Math.max(0, maximum - input.value.length).toLocaleString('ko-KR')}자 남음`;
}

function renderSettingsWritingReferenceState() {
  const profile = getVisibleSettingsWritingProfile();
  const refs = profile?.channels?.blog?.style_references;
  const status = document.getElementById('settings-writing-reference-status');
  const summary = document.getElementById('settings-writing-reference-summary');
  const urlStatus = document.getElementById('settings-writing-reference-url-status');
  if (!refs) return;
  const statuses = [refs.sample_text?.status, ...(refs.blog_urls || []).map((item) => item.status)].filter((value) => value && value !== 'empty');
  const stale = statuses.some((value) => value === 'stale' || value === 'pending');
  const failed = statuses.some((value) => value === 'failed');
  const hasAnalyzedSource = statuses.some((value) => value === 'analyzed');
  const analyzed = Boolean(refs.fingerprint) && hasAnalyzedSource && !stale;
  const missingSource = Boolean(refs.fingerprint) && statuses.length === 0;
  if (status) {
    status.textContent = missingSource
      ? '참고할 글을 입력한 뒤 다시 분석해 주세요.'
      : stale
      ? '참고 글이 변경되었습니다. 다시 분석해 주세요.'
      : (analyzed ? `분석 완료 · ${refs.analyzed_at || '-'}` : (failed ? '참고 글을 분석하지 못했습니다.' : ''));
  }
  if (summary) {
    summary.hidden = !refs.fingerprint;
    summary.textContent = refs.fingerprint
      ? `${stale || missingSource ? '이전 분석 결과' : '분석 결과'}: ${refs.fingerprint.summary}`
      : '';
  }
  if (urlStatus) {
    urlStatus.replaceChildren(...(refs.blog_urls || []).map((entry) => {
      const line = document.createElement('div');
      const label = { analyzed: '분석됨', failed: '실패', stale: '재분석 필요', pending: '분석 대기' }[entry.status] || entry.status;
      line.textContent = `${label} · ${entry.title || entry.url}${entry.error ? ` · ${entry.error}` : ''}`;
      return line;
    }));
  }
}

function renderSettingsWritingProfile() {
  const profile = getVisibleSettingsWritingProfile();
  if (!profile) return;
  const voice = profile.common.voice;
  const blog = profile.channels.blog;
  setSettingsWritingProfileValue('settings-blog-writing-mode', voice.writing_mode);
  setSettingsWritingProfileValue('settings-blog-speech-level', voice.speech_level);
  setSettingsWritingProfileValue('settings-writing-tone', voice.tone);
  setSelectedSettingsRadioValue('settings-blog-writing-strategy', profile.common.writing_strategy, 'search');
  setSettingsWritingProfileValue('settings-writing-common-instruction', profile.common.style_instruction);
  setSettingsWritingProfileValue('settings-writing-blog-length', blog.length.preset);
  setSettingsWritingProfileValue('settings-writing-blog-opening', blog.structure.opening);
  setSettingsWritingProfileValue('settings-writing-blog-development', blog.structure.development);
  setSettingsWritingProfileValue('settings-writing-blog-ending', blog.structure.ending);
  setSettingsWritingProfileValue('settings-writing-blog-image-mode', blog.image_plan.count_mode);
  setSettingsWritingProfileValue('settings-writing-blog-image-count', blog.image_plan.fixed_count || 4);
  const references = blog.style_references || {};
  setSettingsWritingProfileValue('settings-writing-reference-text', references.sample_text?.value || '');
  const referenceUrlInput = document.querySelector('[data-writing-reference-url]');
  if (referenceUrlInput) referenceUrlInput.value = references.blog_urls?.[0]?.url || '';
  setSelectedSettingsRadioValue(
    'settings-writing-reference-input-method',
    references.sample_text?.value ? 'text' : (references.blog_urls?.[0]?.url ? 'url' : 'text'),
    'text'
  );

  const editable = getSettingsWritingProfileActiveKind() === 'custom';
  document.querySelectorAll('[data-writing-custom-detail]').forEach((section) => { section.hidden = !editable; });
  document.querySelectorAll('[data-writing-custom-only]').forEach((field) => { field.hidden = !editable; });
  const resetButton = document.getElementById('settings-writing-profile-reset-custom');
  if (resetButton) resetButton.hidden = !editable;
  document.querySelectorAll('[data-writing-profile-field]').forEach((el) => {
    el.disabled = !editable && !['settings-blog-writing-mode', 'settings-blog-speech-level',
      'settings-blog-writing-strategy-search', 'settings-blog-writing-strategy-discovery'].includes(el.id);
  });
  document.querySelectorAll('[data-writing-reference-field]').forEach((el) => { el.disabled = !editable; });
  const analyzeButton = document.getElementById('settings-writing-reference-analyze');
  const clearButton = document.getElementById('settings-writing-reference-clear');
  if (analyzeButton) analyzeButton.disabled = !editable;
  if (clearButton) clearButton.disabled = !editable;
  syncSettingsWritingReferenceInputMethodUi();
  syncSettingsWritingImageCountUi();
  syncSettingsWritingInstructionCounter();
  syncSettingsWritingReferenceCounter();
  syncSettingsBlogWritingStyleDescription();
  syncSettingsBlogWritingStrategyDescription();
  renderSettingsWritingReferenceState();
}

async function analyzeSettingsWritingReferences() {
  if (!settingsWritingProfileDraft || getSettingsWritingProfileActiveKind() !== 'custom') return;
  markSettingsWritingReferencesChanged();
  const refs = settingsWritingProfileDraft.custom_profile.channels.blog.style_references;
  const analyzeButton = document.getElementById('settings-writing-reference-analyze');
  const status = document.getElementById('settings-writing-reference-status');
  if (refs.fingerprint) {
    const confirmed = await showUiDialog({
      title: '참고 글 다시 분석',
      message: '현재 문체와 글 구성을 새 분석 결과로 다시 채울까요?',
      showCancel: true,
      confirmText: '다시 분석',
      cancelText: '취소'
    });
    if (!confirmed) return;
  }
  if (analyzeButton) analyzeButton.disabled = true;
  if (status) status.textContent = '참고 글에서 문체와 구성을 분석하는 중입니다.';
  try {
    const result = await postJson('/api/v1/settings/writing-profile/references/analyze', {
      sample_text: refs.sample_text.value,
      blog_urls: refs.blog_urls.map((entry) => entry.url)
    });
    const custom = settingsWritingProfileDraft.custom_profile;
    custom.channels.blog.style_references = result;
    custom.common.voice = cloneSettingsWritingProfile(result.fingerprint.surface);
    custom.channels.blog.length.preset = result.fingerprint.settings.length_preset;
    custom.channels.blog.structure.opening = result.fingerprint.settings.opening;
    custom.channels.blog.structure.development = result.fingerprint.settings.development;
    custom.channels.blog.structure.ending = result.fingerprint.settings.ending;
    custom.channels.blog.structure.heading_density = result.fingerprint.settings.heading_density;
    renderSettingsWritingProfile();
    syncSettingsWritingProfileDirty();
  } catch (error) {
    if (status) status.textContent = `분석 실패: ${error.message}. 이전 분석 결과는 그대로 보존됩니다.`;
  } finally {
    if (analyzeButton) analyzeButton.disabled = false;
  }
}

async function clearSettingsWritingReferences() {
  if (!settingsWritingProfileDraft || getSettingsWritingProfileActiveKind() !== 'custom') return;
  const confirmed = await showUiDialog({
    title: '참고 글 지우기',
    message: '참고 글과 분석 결과를 지울까요? 현재 설정값은 그대로 유지됩니다.',
    showCancel: true,
    confirmText: '삭제',
    cancelText: '취소'
  });
  if (!confirmed) return;
  settingsWritingProfileDraft.custom_profile.channels.blog.style_references = {
    sample_text: { value: '', status: 'empty' }, blog_urls: [], fingerprint: null,
    fingerprint_input_hash: null, analyzed_at: null, analyzer_version: null
  };
  renderSettingsWritingProfile();
  syncSettingsWritingProfileDirty();
}

function syncSettingsWritingPreviewKindUi() {
  const kind = getSettingsWritingProfileValue('settings-writing-preview-kind', 'blog');
  const topicInput = document.getElementById('settings-writing-preview-topic');
  const status = document.getElementById('settings-writing-preview-status');
  const result = document.getElementById('settings-writing-preview-result');
  if (topicInput) {
    if (kind === 'shopping') {
      if (!topicInput.disabled) topicInput.dataset.blogTopic = topicInput.value;
      topicInput.value = '';
      topicInput.placeholder = '고정된 예시 상품으로 미리 보기를 생성합니다.';
      topicInput.disabled = true;
    } else {
      topicInput.disabled = false;
      topicInput.value = topicInput.dataset.blogTopic || topicInput.value;
      topicInput.placeholder = '미리 볼 블로그 주제를 입력해 주세요.';
    }
  }
  if (status) status.textContent = '';
  if (result) result.hidden = true;
}

function renderSettingsWritingPreview(result) {
  const resultEl = document.getElementById('settings-writing-preview-result');
  const sectionsEl = document.getElementById('settings-writing-preview-sections');
  const openingEl = document.getElementById('settings-writing-preview-opening');
  const endingEl = document.getElementById('settings-writing-preview-ending');
  const sampleEl = document.getElementById('settings-writing-preview-sample');
  if (openingEl) openingEl.textContent = result.outline?.opening || '';
  if (endingEl) endingEl.textContent = result.outline?.ending || '';
  if (sampleEl) sampleEl.textContent = result.sample || '';
  if (sectionsEl) {
    sectionsEl.replaceChildren(...(result.outline?.sections || []).map((section) => {
      const item = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = section.heading;
      item.append(heading, document.createTextNode(` — ${section.role}`));
      return item;
    }));
  }
  if (resultEl) resultEl.hidden = false;
}

function clearSettingsWritingPreviewResult() {
  const resultEl = document.getElementById('settings-writing-preview-result');
  const sectionsEl = document.getElementById('settings-writing-preview-sections');
  ['settings-writing-preview-opening', 'settings-writing-preview-ending', 'settings-writing-preview-sample']
    .forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  if (sectionsEl) sectionsEl.replaceChildren();
  if (resultEl) resultEl.hidden = true;
}

function startSettingsWritingPreviewProgress() {
  const button = document.getElementById('settings-writing-preview-generate');
  const status = document.getElementById('settings-writing-preview-status');
  const frames = ['.', '...', '......', '..........'];
  let frameIndex = 0;
  clearSettingsWritingPreviewResult();
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = '생성 중…';
  }
  if (status) {
    status.setAttribute('aria-live', 'off');
    status.textContent = `AI가 미리보기를 생성하고 있습니다${frames[frameIndex]}`;
  }
  if (settingsWritingPreviewProgressTimer) clearInterval(settingsWritingPreviewProgressTimer);
  settingsWritingPreviewProgressTimer = setInterval(() => {
    frameIndex = (frameIndex + 1) % frames.length;
    if (status) status.textContent = `AI가 미리보기를 생성하고 있습니다${frames[frameIndex]}`;
  }, 650);
}

function stopSettingsWritingPreviewProgress() {
  if (settingsWritingPreviewProgressTimer) clearInterval(settingsWritingPreviewProgressTimer);
  settingsWritingPreviewProgressTimer = null;
  const button = document.getElementById('settings-writing-preview-generate');
  const status = document.getElementById('settings-writing-preview-status');
  if (button) {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = '미리 보기 생성';
  }
  if (status) status.setAttribute('aria-live', 'polite');
}

async function generateSettingsWritingPreview() {
  if (!settingsWritingProfileDraft || settingsWritingPreviewInFlight) return;
  captureSettingsWritingVisibleProfile();
  const profile = cloneSettingsWritingProfile(getVisibleSettingsWritingProfile());
  if (!profile) return;
  const kind = getSettingsWritingProfileValue('settings-writing-preview-kind', 'blog');
  const topic = getSettingsWritingProfileValue('settings-writing-preview-topic').trim();
  const status = document.getElementById('settings-writing-preview-status');
  settingsWritingPreviewInFlight = true;
  startSettingsWritingPreviewProgress();
  try {
    const result = await postJson('/api/v1/settings/writing-profile/preview', { kind, topic, profile });
    renderSettingsWritingPreview(result);
    if (status) {
      const lengthLabel = Number.isInteger(result.sample_length) ? ` · 샘플 ${result.sample_length}자` : '';
      status.textContent = `${result.topic} · ${getWritingStrategyLabel(result.strategy)}${lengthLabel} · 현재 설정 기준`;
    }
  } catch (error) {
    if (status) status.textContent = `미리보기 실패: ${error.message} 저장된 프로필과 실제 생성 설정은 변경되지 않았습니다.`;
  } finally {
    settingsWritingPreviewInFlight = false;
    stopSettingsWritingPreviewProgress();
  }
}

function applySettingsWritingProfileResponse(data) {
  settingsWritingProfileResponse = cloneSettingsWritingProfile(data);
  const customSnapshot = data.custom_profile
    ? cloneSettingsWritingProfile(data.custom_profile)
    : null;
  const basedOnDefaultVersion = customSnapshot?.based_on_default_version
    || data.default_profile_metadata?.profile_version
    || 1;
  if (customSnapshot) delete customSnapshot.based_on_default_version;
  settingsWritingProfileDraft = {
    active_profile: data.active_profile === 'custom' ? 'custom' : 'default',
    default_profile: cloneSettingsWritingProfile(data.default_profile),
    default_profile_overrides: cloneSettingsWritingProfile(data.default_profile_overrides || {
      writing_strategy: data.default_profile.common.writing_strategy,
      writing_mode: data.default_profile.common.voice.writing_mode,
      speech_level: data.default_profile.common.voice.speech_level
    }),
    custom_profile: customSnapshot,
    based_on_default_version: basedOnDefaultVersion
  };
  const active = document.querySelector(`input[name="settings-writing-profile-kind"][value="${settingsWritingProfileDraft.active_profile}"]`);
  if (active) active.checked = true;
  renderSettingsWritingProfile();
  settingsWritingProfileSavedSignature = buildSettingsWritingProfileSignature();
  settingsWritingProfileDirty = false;
  updateSettingsMajorSaveUi();
  setSettingsWritingProfileStatus('');
}

async function loadSettingsWritingProfile({ force = false } = {}) {
  if (settingsWritingProfileLoading || (!force && settingsWritingProfileResponse)) return;
  if (force && settingsWritingProfileDirty) {
    const confirmed = await showUiDialog({
      title: '프로필 다시 불러오기',
      message: '저장하지 않은 프로필 변경사항을 버리고 다시 불러올까요?',
      showCancel: true,
      confirmText: '다시 불러오기',
      cancelText: '취소'
    });
    if (!confirmed) return;
  }
  settingsWritingProfileLoading = true;
  setSettingsWritingProfileStatus('글쓰기 프로필을 불러오는 중입니다.', 'loading');
  try {
    applySettingsWritingProfileResponse(await fetchJson('/api/v1/settings/writing-profile'));
  } catch (error) {
    setSettingsWritingProfileStatus(`불러오기 실패: ${error.message}`, 'error');
  } finally {
    settingsWritingProfileLoading = false;
    syncSettingsWritingProfileDirty();
  }
}

async function saveSettingsWritingProfile() {
  if (!settingsWritingProfileDraft || settingsWritingProfileSaving) return;
  captureSettingsWritingVisibleProfile();
  const activeProfile = getSettingsWritingProfileActiveKind();
  const custom = settingsWritingProfileDraft.custom_profile;
  settingsWritingProfileSaving = true;
  let saveFailed = false;
  syncSettingsWritingProfileDirty();
  setSettingsWritingProfileStatus('글쓰기 프로필을 저장하고 있습니다.', 'saving');
  try {
    const payload = {
      active_profile: activeProfile,
      default_profile_overrides: cloneSettingsWritingProfile(settingsWritingProfileDraft.default_profile_overrides)
    };
    if (custom) {
      payload.custom_profile = {
        based_on_default_version: settingsWritingProfileDraft.based_on_default_version,
        ...cloneSettingsWritingProfile(custom)
      };
    }
    const data = await putJson('/api/v1/settings/writing-profile', payload);
    applySettingsWritingProfileResponse(data);
    showUiToast({ level: 'success', title: '글쓰기 프로필 저장', message: '선택한 프로필을 이후 글 생성에 적용합니다.', dedupeKey: 'writing-profile-saved' });
  } catch (error) {
    saveFailed = true;
    setSettingsWritingProfileStatus(`저장 실패: ${error.message}`, 'error');
  } finally {
    settingsWritingProfileSaving = false;
    captureSettingsWritingVisibleProfile();
    settingsWritingProfileDirty = buildSettingsWritingProfileSignature() !== settingsWritingProfileSavedSignature;
    updateSettingsMajorSaveUi();
    if (!saveFailed && settingsWritingProfileDirty) syncSettingsWritingProfileDirty();
  }
  return !saveFailed;
}

async function resetSettingsWritingCustomProfile() {
  if (!settingsWritingProfileDraft) return;
  const confirmed = await showUiDialog({
    title: '내 프로필 초기화',
    message: '내 프로필의 문체, 구성과 추가 지침을 기본값으로 되돌릴까요? 저장 전까지는 적용되지 않습니다.',
    showCancel: true,
    confirmText: '초기화',
    cancelText: '취소'
  });
  if (!confirmed) return;
  settingsWritingProfileDraft.custom_profile = cloneSettingsWritingProfile(getEffectiveSettingsWritingDefaultProfile());
  const customRadio = document.querySelector('input[name="settings-writing-profile-kind"][value="custom"]');
  if (customRadio) customRadio.checked = true;
  settingsWritingProfileDraft.active_profile = 'custom';
  renderSettingsWritingProfile();
  syncSettingsWritingProfileDirty();
}

function handleSettingsWritingProfileKindChange() {
  if (!settingsWritingProfileDraft) return;
  captureSettingsWritingProfileKind(settingsWritingProfileDraft.active_profile);
  const active = getSettingsWritingProfileActiveKind();
  if (active === 'custom' && !settingsWritingProfileDraft.custom_profile) {
    settingsWritingProfileDraft.custom_profile = cloneSettingsWritingProfile(getEffectiveSettingsWritingDefaultProfile());
    settingsWritingProfileDraft.based_on_default_version = settingsWritingProfileResponse?.default_profile_metadata?.profile_version || 1;
  }
  settingsWritingProfileDraft.active_profile = active;
  renderSettingsWritingProfile();
  syncSettingsWritingProfileDirty();
}

function initSettingsWritingProfileUi() {
  document.querySelectorAll('input[name="settings-writing-profile-kind"]').forEach((radio) => {
    radio.addEventListener('change', handleSettingsWritingProfileKindChange);
  });
  document.querySelectorAll('[data-writing-profile-field]').forEach((field) => {
    const eventName = field.tagName === 'TEXTAREA' ? 'input' : 'change';
    field.addEventListener(eventName, () => {
      syncSettingsWritingImageCountUi();
      syncSettingsWritingInstructionCounter();
      syncSettingsBlogWritingStyleDescription();
      syncSettingsBlogWritingStrategyDescription();
      syncSettingsWritingProfileDirty();
    });
  });
  document.querySelectorAll('[data-writing-reference-field]').forEach((field) => {
    field.addEventListener('input', () => {
      syncSettingsWritingReferenceCounter();
      markSettingsWritingReferencesChanged();
    });
  });
  document.querySelectorAll('input[name="settings-writing-reference-input-method"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      syncSettingsWritingReferenceInputMethodUi();
      markSettingsWritingReferencesChanged();
    });
  });
  document.getElementById('settings-writing-profile-reset-custom')?.addEventListener('click', resetSettingsWritingCustomProfile);
  document.getElementById('settings-writing-reference-analyze')?.addEventListener('click', analyzeSettingsWritingReferences);
  document.getElementById('settings-writing-reference-clear')?.addEventListener('click', clearSettingsWritingReferences);
  document.getElementById('settings-writing-preview-kind')?.addEventListener('change', syncSettingsWritingPreviewKindUi);
  document.getElementById('settings-writing-preview-generate')?.addEventListener('click', generateSettingsWritingPreview);
  syncSettingsWritingPreviewKindUi();
}
