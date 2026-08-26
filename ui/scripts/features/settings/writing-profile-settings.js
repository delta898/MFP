const WRITING_PROFILE_LABELS = {
  writingMode: { conversational: '구어체', written: '문어체' },
  speechLevel: { polite: '존댓말', plain: '평어' },
  tone: { calm: '차분한 어조', balanced: '균형 잡힌 어조', vivid: '생동감 있는 어조' },
  density: { light: '가벼운 정보 밀도', balanced: '보통 정보 밀도', dense: '촘촘한 정보 밀도' },
  length: {
    short: { label: '짧게', chars: '900~1,200자', headings: 'H2 3개', images: 3 },
    standard: { label: '보통', chars: '1,500~1,800자', headings: 'H2 4~5개', images: 4 },
    long: { label: '길게', chars: '2,200~2,800자', headings: 'H2 5~6개', images: 5 }
  },
  opening: { direct: '핵심부터', contextual: '공감 상황부터', scene: '장면·이야기부터' },
  development: { explanatory: '설명형', problem_solution: '문제 해결형', experience_review: '경험·리뷰형', comparison: '비교·선택형' },
  ending: { summary: '핵심 요약', judgment: '개인적 판단', next_step: '다음 행동 제안' },
  headings: { sparse: '적게', balanced: '보통', dense: '많게' },
  narrator: { minimal: '최소화', occasional: '필요할 때만', present: '적극적으로' }
};

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
    : settingsWritingProfileDraft.default_profile;
}

function captureSettingsWritingCustomProfile() {
  if (!settingsWritingProfileDraft || getSettingsWritingProfileActiveKind() !== 'custom') return;
  const current = settingsWritingProfileDraft.custom_profile;
  if (!current) return;
  current.common.voice.writing_mode = getSettingsWritingProfileValue('settings-blog-writing-mode', 'conversational');
  current.common.voice.speech_level = getSettingsWritingProfileValue('settings-blog-speech-level', 'polite');
  current.common.voice.tone = getSettingsWritingProfileValue('settings-writing-tone', 'balanced');
  current.common.voice.information_density = getSettingsWritingProfileValue('settings-writing-density', 'balanced');
  current.common.style_instruction = getSettingsWritingProfileValue('settings-writing-common-instruction').trim();
  const blog = current.channels.blog;
  blog.length.preset = getSettingsWritingProfileValue('settings-writing-blog-length', 'standard');
  blog.narrator_presence = getSettingsWritingProfileValue('settings-writing-blog-narrator', 'occasional');
  blog.structure.opening = getSettingsWritingProfileValue('settings-writing-blog-opening', 'contextual');
  blog.structure.development = getSettingsWritingProfileValue('settings-writing-blog-development', 'explanatory');
  blog.structure.ending = getSettingsWritingProfileValue('settings-writing-blog-ending', 'judgment');
  blog.structure.heading_density = getSettingsWritingProfileValue('settings-writing-blog-headings', 'balanced');
  blog.image_plan.count_mode = getSettingsWritingProfileValue('settings-writing-blog-image-mode', 'auto');
  blog.image_plan.fixed_count = blog.image_plan.count_mode === 'fixed'
    ? Number(getSettingsWritingProfileValue('settings-writing-blog-image-count', '4'))
    : null;
  blog.author_context = getSettingsWritingProfileValue('settings-writing-blog-author-context').trim();
  blog.additional_instruction = getSettingsWritingProfileValue('settings-writing-blog-instruction').trim();
  current.channels.shopping.additional_instruction = getSettingsWritingProfileValue('settings-writing-shopping-instruction').trim();
}

function getSettingsWritingReferenceInputs() {
  return {
    sampleText: getSettingsWritingProfileValue('settings-writing-reference-text').trim(),
    urls: Array.from(document.querySelectorAll('[data-writing-reference-url]'))
      .map((el) => String(el.value || '').trim())
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .slice(0, 3)
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
    custom_profile: settingsWritingProfileDraft.custom_profile,
    based_on_default_version: settingsWritingProfileDraft.based_on_default_version
  });
}

function setSettingsWritingProfileStatus(message, state = 'idle') {
  const badge = document.getElementById('settings-writing-profile-badge');
  const status = document.getElementById('settings-writing-profile-status');
  if (status) status.textContent = String(message || '');
  if (!badge) return;
  const labels = { idle: '저장됨', dirty: '변경됨', loading: '불러오는 중', saving: '저장 중', error: '오류' };
  badge.textContent = labels[state] || labels.idle;
  badge.classList.toggle('success', state === 'idle');
  badge.classList.toggle('warning', state === 'dirty');
  badge.classList.toggle('error', state === 'error');
}

function syncSettingsWritingProfileDirty() {
  captureSettingsWritingCustomProfile();
  settingsWritingProfileDirty = Boolean(settingsWritingProfileDraft)
    && buildSettingsWritingProfileSignature() !== settingsWritingProfileSavedSignature;
  const saveBtn = document.getElementById('settings-writing-profile-save');
  if (saveBtn) saveBtn.disabled = !settingsWritingProfileDirty || settingsWritingProfileLoading || settingsWritingProfileSaving;
  if (settingsWritingProfileDirty) setSettingsWritingProfileStatus('저장되지 않은 프로필 변경사항이 있습니다.', 'dirty');
}

function syncSettingsWritingImageCountUi() {
  const mode = getSettingsWritingProfileValue('settings-writing-blog-image-mode', 'auto');
  const count = document.getElementById('settings-writing-blog-image-count');
  const isCustom = getSettingsWritingProfileActiveKind() === 'custom';
  if (count) count.disabled = !isCustom || mode !== 'fixed';
  document.getElementById('settings-writing-blog-image-count-field')?.classList.toggle('is-muted', mode !== 'fixed');
}

function renderSettingsWritingSummaries() {
  const mode = getSettingsWritingProfileValue('settings-blog-writing-mode', 'conversational');
  const speech = getSettingsWritingProfileValue('settings-blog-speech-level', 'polite');
  const tone = getSettingsWritingProfileValue('settings-writing-tone', 'balanced');
  const density = getSettingsWritingProfileValue('settings-writing-density', 'balanced');
  const commonInstruction = getSettingsWritingProfileValue('settings-writing-common-instruction').trim();
  const common = document.getElementById('settings-writing-common-summary');
  if (common) common.textContent = `${WRITING_PROFILE_LABELS.writingMode[mode]}, ${WRITING_PROFILE_LABELS.speechLevel[speech]}, ${WRITING_PROFILE_LABELS.tone[tone]}, ${WRITING_PROFILE_LABELS.density[density]}${commonInstruction ? ` · 공통 지침: ${commonInstruction}` : ''}`;

  const lengthKey = getSettingsWritingProfileValue('settings-writing-blog-length', 'standard');
  const length = WRITING_PROFILE_LABELS.length[lengthKey] || WRITING_PROFILE_LABELS.length.standard;
  const imageMode = getSettingsWritingProfileValue('settings-writing-blog-image-mode', 'auto');
  const imageCount = imageMode === 'fixed'
    ? Number(getSettingsWritingProfileValue('settings-writing-blog-image-count', '4'))
    : length.images;
  const blog = document.getElementById('settings-writing-blog-summary');
  if (blog) {
    blog.textContent = `${length.label} ${length.chars} · ${length.headings} · 이미지 영역 ${imageCount}개 · ${WRITING_PROFILE_LABELS.opening[getSettingsWritingProfileValue('settings-writing-blog-opening', 'contextual')]} → ${WRITING_PROFILE_LABELS.development[getSettingsWritingProfileValue('settings-writing-blog-development', 'explanatory')]} → ${WRITING_PROFILE_LABELS.ending[getSettingsWritingProfileValue('settings-writing-blog-ending', 'judgment')]} · 소제목 ${WRITING_PROFILE_LABELS.headings[getSettingsWritingProfileValue('settings-writing-blog-headings', 'balanced')]} · 글쓴이 관점 ${WRITING_PROFILE_LABELS.narrator[getSettingsWritingProfileValue('settings-writing-blog-narrator', 'occasional')]}`;
  }

  const shoppingInstruction = getSettingsWritingProfileValue('settings-writing-shopping-instruction').trim();
  const shopping = document.getElementById('settings-writing-shopping-summary');
  if (shopping) shopping.textContent = shoppingInstruction
    ? `제품 기본 쇼핑 구성 유지 · 추가 지침: ${shoppingInstruction}`
    : '제품 기본 쇼핑 구성 유지 · 별도 추가 지침 없음';
}

function renderSettingsWritingReferenceState() {
  const profile = getVisibleSettingsWritingProfile();
  const refs = profile?.channels?.blog?.style_references;
  const badge = document.getElementById('settings-writing-reference-badge');
  const status = document.getElementById('settings-writing-reference-status');
  const summary = document.getElementById('settings-writing-reference-summary');
  const urlStatus = document.getElementById('settings-writing-reference-url-status');
  if (!refs) return;
  const statuses = [refs.sample_text?.status, ...(refs.blog_urls || []).map((item) => item.status)].filter((value) => value && value !== 'empty');
  const stale = statuses.some((value) => value === 'stale' || value === 'pending');
  const failed = statuses.some((value) => value === 'failed');
  const analyzed = Boolean(refs.fingerprint) && !stale;
  if (badge) {
    badge.textContent = stale ? '재분석 필요' : (analyzed ? '분석됨' : (failed ? '일부 실패' : '자료 없음'));
    badge.classList.toggle('success', analyzed);
    badge.classList.toggle('warning', stale || failed);
  }
  if (status) {
    status.textContent = stale
      ? '참고자료가 변경되었습니다. 다시 분석하기 전에는 이전 fingerprint가 적용되지 않습니다.'
      : (analyzed ? `마지막 분석: ${refs.analyzed_at || '-'}` : '분석된 fingerprint만 실제 블로그 생성에 적용됩니다.');
  }
  if (summary) {
    summary.hidden = !refs.fingerprint;
    summary.textContent = refs.fingerprint
      ? `${stale ? '이전 분석(현재 미적용)' : '적용될 문체'}: ${refs.fingerprint.summary}`
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
  setSettingsWritingProfileValue('settings-writing-density', voice.information_density);
  setSettingsWritingProfileValue('settings-writing-common-instruction', profile.common.style_instruction);
  setSettingsWritingProfileValue('settings-writing-blog-length', blog.length.preset);
  setSettingsWritingProfileValue('settings-writing-blog-narrator', blog.narrator_presence);
  setSettingsWritingProfileValue('settings-writing-blog-opening', blog.structure.opening);
  setSettingsWritingProfileValue('settings-writing-blog-development', blog.structure.development);
  setSettingsWritingProfileValue('settings-writing-blog-ending', blog.structure.ending);
  setSettingsWritingProfileValue('settings-writing-blog-headings', blog.structure.heading_density);
  setSettingsWritingProfileValue('settings-writing-blog-image-mode', blog.image_plan.count_mode);
  setSettingsWritingProfileValue('settings-writing-blog-image-count', blog.image_plan.fixed_count || 4);
  setSettingsWritingProfileValue('settings-writing-blog-author-context', blog.author_context);
  setSettingsWritingProfileValue('settings-writing-blog-instruction', blog.additional_instruction);
  setSettingsWritingProfileValue('settings-writing-shopping-instruction', profile.channels.shopping.additional_instruction);
  const references = blog.style_references || {};
  setSettingsWritingProfileValue('settings-writing-reference-text', references.sample_text?.value || '');
  const referenceUrlInputs = Array.from(document.querySelectorAll('[data-writing-reference-url]'));
  referenceUrlInputs.forEach((input, index) => { input.value = references.blog_urls?.[index]?.url || ''; });

  const editable = getSettingsWritingProfileActiveKind() === 'custom';
  document.querySelectorAll('[data-writing-profile-field]').forEach((el) => { el.disabled = !editable; });
  document.querySelectorAll('[data-writing-reference-field]').forEach((el) => { el.disabled = !editable; });
  const analyzeButton = document.getElementById('settings-writing-reference-analyze');
  const clearButton = document.getElementById('settings-writing-reference-clear');
  if (analyzeButton) analyzeButton.disabled = !editable;
  if (clearButton) clearButton.disabled = !editable;
  syncSettingsWritingImageCountUi();
  syncSettingsBlogWritingStyleDescription();
  renderSettingsWritingSummaries();
  renderSettingsWritingReferenceState();
}

async function analyzeSettingsWritingReferences() {
  if (!settingsWritingProfileDraft || getSettingsWritingProfileActiveKind() !== 'custom') return;
  markSettingsWritingReferencesChanged();
  const refs = settingsWritingProfileDraft.custom_profile.channels.blog.style_references;
  const analyzeButton = document.getElementById('settings-writing-reference-analyze');
  const status = document.getElementById('settings-writing-reference-status');
  if (analyzeButton) analyzeButton.disabled = true;
  if (status) status.textContent = '공개 URL을 확인하고 Chat Model로 문체를 분석하는 중입니다.';
  try {
    const result = await postJson('/api/v1/settings/writing-profile/references/analyze', {
      sample_text: refs.sample_text.value,
      blog_urls: refs.blog_urls.map((entry) => entry.url)
    });
    settingsWritingProfileDraft.custom_profile.channels.blog.style_references = result;
    renderSettingsWritingProfile();
    syncSettingsWritingProfileDirty();
  } catch (error) {
    if (status) status.textContent = `분석 실패: ${error.message}. 이전 성공 fingerprint는 그대로 보존됩니다.`;
  } finally {
    if (analyzeButton) analyzeButton.disabled = false;
  }
}

async function clearSettingsWritingReferences() {
  if (!settingsWritingProfileDraft || getSettingsWritingProfileActiveKind() !== 'custom') return;
  const confirmed = await showUiDialog({
    title: '참고 문체 삭제',
    message: '참고 문장, URL과 분석된 문체 fingerprint를 모두 삭제할까요? 프로필을 저장할 때 적용됩니다.',
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
    custom_profile: customSnapshot,
    based_on_default_version: basedOnDefaultVersion
  };
  const active = document.querySelector(`input[name="settings-writing-profile-kind"][value="${settingsWritingProfileDraft.active_profile}"]`);
  if (active) active.checked = true;
  renderSettingsWritingProfile();
  settingsWritingProfileSavedSignature = buildSettingsWritingProfileSignature();
  settingsWritingProfileDirty = false;
  const saveBtn = document.getElementById('settings-writing-profile-save');
  if (saveBtn) saveBtn.disabled = true;
  setSettingsWritingProfileStatus(
    data.active_profile === 'custom' ? '내 프로필이 전체 글 생성에 적용 중입니다.' : '제품 기본 프로필이 적용 중입니다.',
    'idle'
  );
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
  captureSettingsWritingCustomProfile();
  const activeProfile = getSettingsWritingProfileActiveKind();
  const custom = settingsWritingProfileDraft.custom_profile;
  settingsWritingProfileSaving = true;
  let saveFailed = false;
  syncSettingsWritingProfileDirty();
  setSettingsWritingProfileStatus('글쓰기 프로필을 저장하고 있습니다.', 'saving');
  try {
    const payload = { active_profile: activeProfile };
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
    captureSettingsWritingCustomProfile();
    settingsWritingProfileDirty = buildSettingsWritingProfileSignature() !== settingsWritingProfileSavedSignature;
    const saveBtn = document.getElementById('settings-writing-profile-save');
    if (saveBtn) saveBtn.disabled = !settingsWritingProfileDirty;
    if (!saveFailed && settingsWritingProfileDirty) syncSettingsWritingProfileDirty();
  }
}

async function resetSettingsWritingCustomProfile() {
  if (!settingsWritingProfileDraft) return;
  const confirmed = await showUiDialog({
    title: '내 프로필 초기화',
    message: '내 프로필의 문체, 구성과 추가 지침을 제품 기본값으로 되돌릴까요? 저장 전까지는 적용되지 않습니다.',
    showCancel: true,
    confirmText: '초기화',
    cancelText: '취소'
  });
  if (!confirmed) return;
  settingsWritingProfileDraft.custom_profile = cloneSettingsWritingProfile(settingsWritingProfileDraft.default_profile);
  const customRadio = document.querySelector('input[name="settings-writing-profile-kind"][value="custom"]');
  if (customRadio) customRadio.checked = true;
  renderSettingsWritingProfile();
  syncSettingsWritingProfileDirty();
}

function handleSettingsWritingProfileKindChange() {
  if (!settingsWritingProfileDraft) return;
  if (settingsWritingProfileDraft.active_profile === 'custom') captureSettingsWritingCustomProfile();
  const active = getSettingsWritingProfileActiveKind();
  if (active === 'custom' && !settingsWritingProfileDraft.custom_profile) {
    settingsWritingProfileDraft.custom_profile = cloneSettingsWritingProfile(settingsWritingProfileDraft.default_profile);
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
      syncSettingsBlogWritingStyleDescription();
      renderSettingsWritingSummaries();
      syncSettingsWritingProfileDirty();
    });
  });
  document.querySelectorAll('[data-writing-reference-field]').forEach((field) => {
    field.addEventListener('input', markSettingsWritingReferencesChanged);
  });
  document.getElementById('settings-writing-profile-save')?.addEventListener('click', saveSettingsWritingProfile);
  document.getElementById('settings-writing-profile-refresh')?.addEventListener('click', () => loadSettingsWritingProfile({ force: true }));
  document.getElementById('settings-writing-profile-reset-custom')?.addEventListener('click', resetSettingsWritingCustomProfile);
  document.getElementById('settings-writing-reference-analyze')?.addEventListener('click', analyzeSettingsWritingReferences);
  document.getElementById('settings-writing-reference-clear')?.addEventListener('click', clearSettingsWritingReferences);
}
