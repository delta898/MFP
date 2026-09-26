const CARD_NEWS_IMAGE_MODEL_STORAGE_KEY = 'bloggenius.cardNews.imageModelSelection';

function readCardNewsImageModelSelection() {
  try {
    const value = JSON.parse(localStorage.getItem(CARD_NEWS_IMAGE_MODEL_STORAGE_KEY) || 'null');
    if (value && typeof value.provider === 'string' && typeof value.code === 'string') {
      return { provider: value.provider, code: value.code };
    }
  } catch (_) { }
  return null;
}

function getCardNewsImageModelSelection() {
  if (cardNewsViewState.imageModelChoiceLoading) return readCardNewsImageModelSelection();
  const providerSelect = document.querySelector('[data-card-news-image-provider-select]');
  const modelSelect = document.querySelector('[data-card-news-image-model-select]');
  if (!providerSelect?.value) return null;
  if (modelSelect?.value === '__unavailable__') return readCardNewsImageModelSelection();
  return modelSelect?.value ? { provider: providerSelect.value, code: modelSelect.value } : readCardNewsImageModelSelection();
}

function getCardNewsImageModelControls() {
  return Array.from(document.querySelectorAll('[data-card-news-image-model-control]')).map((control) => ({
    control,
    provider: control.querySelector('[data-card-news-image-provider-select]'),
    model: control.querySelector('[data-card-news-image-model-select]'),
    summary: control.querySelector('[data-card-news-image-model-summary]'),
    note: control.querySelector('[data-card-news-image-model-note]')
  }));
}

function ensureCardNewsImageModelControls() {
  const source = document.getElementById('card-news-image-model-control');
  const generationSlot = document.getElementById('card-news-generation-image-model-slot');
  const resultSlot = document.getElementById('card-news-result-image-model-slot');
  if (!source || !generationSlot || !resultSlot) return;
  source.dataset.cardNewsImageModelControl = '';
  if (source.parentElement !== generationSlot) generationSlot.append(source);
  if (resultSlot.querySelector('[data-card-news-image-model-control]')) return;

  const resultControl = source.cloneNode(true);
  resultControl.id = 'card-news-image-model-control-result';
  resultControl.dataset.cardNewsImageModelControl = '';
  resultControl.querySelectorAll('[id]').forEach((element) => { element.id = `${element.id}-result`; });
  resultControl.querySelectorAll('[aria-describedby]').forEach((element) => {
    element.setAttribute('aria-describedby', element.getAttribute('aria-describedby').split(/\s+/).map((id) => `${id}-result`).join(' '));
  });
  resultSlot.append(resultControl);
}

function bindCardNewsImageModelControlDismissal() {
  document.addEventListener('pointerdown', (event) => {
    document.querySelectorAll('[data-card-news-image-model-control][open]').forEach((control) => {
      if (!control.contains(event.target)) control.open = false;
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openControls = [...document.querySelectorAll('[data-card-news-image-model-control][open]')];
    if (!openControls.length) return;
    const focusedControl = openControls.find((control) => control.contains(document.activeElement));
    openControls.forEach((control) => { control.open = false; });
    focusedControl?.querySelector('summary')?.focus();
    event.preventDefault();
  });
}

function populateCardNewsImageModels(providerId, preferredCode = '') {
  const provider = cardNewsViewState.imageModels?.providers?.find((item) => item.provider === providerId);
  const models = Array.isArray(provider?.models) ? provider.models : [];
  const fallback = cardNewsViewState.imageModels?.default;
  getCardNewsImageModelControls().forEach(({ provider: providerSelect, model: modelSelect }) => {
    if (providerSelect && providerSelect.value !== '__unavailable__') providerSelect.value = providerId || '';
    if (!modelSelect) return;
    modelSelect.replaceChildren();
    if (!providerId) {
      modelSelect.add(new Option(fallback?.name || '전역 이미지 모델', ''));
      modelSelect.disabled = true;
      return;
    }
    models.forEach((item) => modelSelect.add(new Option(item.name, item.code)));
    if (preferredCode && models.some((item) => item.code === preferredCode)) modelSelect.value = preferredCode;
    else if (models.length) modelSelect.value = models[0].code;
    modelSelect.disabled = models.length === 0;
  });
}

function updateCardNewsImageModelControl() {
  const selected = getCardNewsImageModelSelection();
  const provider = cardNewsViewState.imageModels?.providers?.find((item) => item.provider === selected?.provider);
  const chosen = provider?.models?.find((item) => item.code === selected?.code);
  const unavailable = Boolean(selected && !chosen);
  const defaultProvider = cardNewsViewState.imageModels?.providers?.find((item) => item.provider === cardNewsViewState.imageModels?.default?.provider);
  const summaryText = unavailable
    ? `사용할 수 없음 · ${selected.provider}`
    : chosen
      ? `${provider.name} · ${chosen.name}`
      : `기본 · ${defaultProvider?.name || cardNewsViewState.imageModels?.default?.provider || '전역 모델'} · ${cardNewsViewState.imageModels?.default?.name || ''}`.trim();
  const noteText = unavailable
    ? '선택한 모델을 사용할 수 없습니다. 설정에서 연결을 확인하거나 다른 모델을 선택해 주세요.'
    : chosen
      ? '카드뉴스 이미지 생성에 적용됩니다.'
      : `기본 설정 사용 · ${cardNewsViewState.imageModels?.default?.name || '전역 이미지 모델'}`;
  getCardNewsImageModelControls().forEach(({ control, summary, note }) => {
    if (summary) summary.textContent = summaryText;
    if (note) note.textContent = noteText;
    control.dataset.unavailable = String(unavailable);
    control.dataset.state = unavailable ? 'error' : '';
  });
}

function syncCardNewsImageModelControlLocation() {
  ensureCardNewsImageModelControls();
}

async function loadCardNewsImageModels() {
  ensureCardNewsImageModelControls();
  const controls = getCardNewsImageModelControls();
  if (!controls.length || cardNewsViewState.imageModelChoiceLoading) return;
  cardNewsViewState.imageModelChoiceLoading = true;
  const saved = readCardNewsImageModelSelection();
  try {
    const result = await fetchJson('/api/v1/card-news/image-models');
    cardNewsViewState.imageModels = result;
    const providers = Array.isArray(result?.providers) ? result.providers : [];
    const defaultProvider = providers.find((item) => item.provider === result?.default?.provider);
    controls.forEach(({ provider: providerSelect }) => {
      providerSelect.replaceChildren(new Option(`기본 설정 · ${defaultProvider?.name || result?.default?.provider || '이미지 모델'}`, ''));
      providers.forEach((item) => providerSelect.add(new Option(item.name, item.provider)));
    });
    if (saved && providers.some((item) => item.provider === saved.provider)) {
      controls.forEach(({ provider }) => { provider.value = saved.provider; });
      populateCardNewsImageModels(saved.provider, saved.code);
    } else if (saved) {
      controls.forEach(({ provider, model }) => {
        provider.add(new Option(`사용할 수 없음 · ${saved.provider}`, '__unavailable__'));
        provider.value = '__unavailable__';
        model.replaceChildren(new Option(`사용할 수 없음 · ${saved.code}`, '__unavailable__'));
        model.value = '__unavailable__';
      });
    } else {
      populateCardNewsImageModels('');
    }
    updateCardNewsImageModelControl();
  } catch (_) {
    controls.forEach(({ note }) => {
      if (!note) return;
      note.textContent = saved
        ? '선택한 이미지 모델 상태를 확인하지 못했습니다. 다시 불러오거나 모델을 변경해 주세요.'
        : '저장된 이미지 모델 목록을 불러오지 못했습니다. 기본 이미지 모델을 사용합니다.';
      note.parentElement?.setAttribute('data-state', saved ? 'error' : '');
    });
    if (saved) {
      controls.forEach(({ provider, model }) => {
        provider.add(new Option(`상태 확인 필요 · ${saved.provider}`, '__unavailable__'));
        provider.value = '__unavailable__';
        model.replaceChildren(new Option(`상태 확인 필요 · ${saved.code}`, '__unavailable__'));
        model.value = '__unavailable__';
      });
      updateCardNewsImageModelControl();
    } else {
      updateCardNewsImageModelControl();
    }
  } finally {
    cardNewsViewState.imageModelChoiceLoading = false;
  }
}

function saveCardNewsImageModelSelection() {
  const selection = getCardNewsImageModelSelection();
  try {
    if (!selection) localStorage.removeItem(CARD_NEWS_IMAGE_MODEL_STORAGE_KEY);
    else localStorage.setItem(CARD_NEWS_IMAGE_MODEL_STORAGE_KEY, JSON.stringify(selection));
  } catch (_) { }
  updateCardNewsImageModelControl();
}

function handleCardNewsImageProviderChange(event) {
  const providerId = event?.currentTarget?.value || '';
  if (providerId === '__unavailable__') return updateCardNewsImageControlForUnavailable();
  populateCardNewsImageModels(providerId);
  saveCardNewsImageModelSelection();
}

function updateCardNewsImageControlForUnavailable() {
  getCardNewsImageModelControls().forEach(({ control, provider, model, note }) => {
    if (control) control.dataset.unavailable = 'true';
    if (provider) provider.value = '__unavailable__';
    if (model) model.value = '__unavailable__';
    if (note) note.textContent = '선택한 이미지 모델을 사용할 수 없습니다. 기본 설정 또는 연결된 공급자를 선택해 주세요.';
  });
  updateCardNewsImageModelControl();
}
