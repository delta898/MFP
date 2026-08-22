function syncSettingsUpdateSourceUi() {
  const updateServerType = (document.getElementById('settings-update-server-type')?.value || 'github').trim();
  const githubField = document.getElementById('settings-update-mirror-repo-field');
  const customField = document.getElementById('settings-custom-update-url-field');
  if (githubField) {
    githubField.style.display = updateServerType === 'github' ? '' : 'none';
  }
  if (customField) {
    customField.style.display = updateServerType === 'custom' ? '' : 'none';
  }
}

function getSettingsAiPresetCatalog(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  return Array.isArray(settingsAiPresets?.[catalogKind]) ? settingsAiPresets[catalogKind] : [];
}

function getSettingsAiPresetProviders(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  const configuredProviders = Array.isArray(settingsAiPresets?.providers?.[catalogKind])
    ? settingsAiPresets.providers[catalogKind]
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean)
    : [];
  const presetProviders = getSettingsAiPresetCatalog(kind)
    .map((item) => String(item.provider || '').trim())
    .filter(Boolean);
  return Array.from(new Set([...configuredProviders, ...presetProviders, 'direct']));
}

function getSettingsAiProviderLabels(kind) {
  const catalogKind = kind === 'chat' ? 'text' : kind;
  const configuredProviders = Array.isArray(settingsAiPresets?.providers?.[catalogKind])
    ? settingsAiPresets.providers[catalogKind]
    : [];
  return Object.fromEntries(configuredProviders
    .map((item) => [
      String(item?.id || '').trim(),
      String(item?.name || item?.display_name || item?.id || '').trim()
    ])
    .filter(([id, name]) => id && name));
}

function populateSettingsAiProviderSelect(kind, selectEl, selectedProvider) {
  if (!selectEl) return;
  const catalogProviders = getSettingsAiPresetProviders(kind);
  const providers = selectedProvider && !catalogProviders.includes(selectedProvider)
    ? [selectedProvider, ...catalogProviders]
    : catalogProviders;
  const labels = {
    google: 'Google',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    kie: 'KIE.ai',
    ...getSettingsAiProviderLabels(kind),
    direct: '직접 입력'
  };
  const resolvedProvider = providers.includes(selectedProvider) ? selectedProvider : (providers[0] || '');
  selectEl.innerHTML = providers
    .map((provider) => {
      const isUnavailable = provider === selectedProvider && !catalogProviders.includes(provider);
      const label = labels[provider] || provider;
      return `<option value="${provider}">${isUnavailable ? `${label} (현재 설정, 카탈로그에 없음)` : label}</option>`;
    })
    .join('');
  if (resolvedProvider) {
    selectEl.value = resolvedProvider;
  }
}

function populateSettingsAiPresetModelSelect(kind, provider, selectEl, summaryEl, selectedCode) {
  if (!selectEl) return;
  const presets = getSettingsAiPresetCatalog(kind).filter((item) => String(item.provider || '') === String(provider || ''));
  const fallback = presets[0] || null;
  const configured = presets.find((item) => item.code === selectedCode) || null;
  const unavailable = selectedCode && !configured
    ? { code: selectedCode, name: `${selectedCode} (현재 설정, 카탈로그에 없음)`, unavailable: true }
    : null;
  const selected = configured || unavailable || fallback;
  selectEl.innerHTML = [...(unavailable ? [unavailable] : []), ...presets]
    .map((item) => `<option value="${item.code}">${item.name || item.code}</option>`)
    .join('');
  if (selected?.code) {
    selectEl.value = selected.code;
  }
  if (summaryEl) {
    if (selected?.unavailable) {
      summaryEl.textContent = '현재 선택한 모델은 제품 카탈로그에 없습니다. 설정을 유지하거나 지원 모델로 변경할 수 있습니다.';
    } else if (selected?.transport === 'gemini_generate_content') {
      summaryEl.textContent = 'Google Gemini API를 사용합니다.';
    } else if (String(provider || '') === 'openai') {
      summaryEl.textContent = kind === 'image'
        ? 'OpenAI Images API를 사용합니다.'
        : 'OpenAI Chat Completions API를 사용합니다.';
    } else {
      summaryEl.textContent = selected?.base_url
        ? `기본 Base URL: ${selected.base_url}`
        : '';
    }
  }
  return selected;
}

function syncSettingsAiModelUi(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerWrapEl = document.getElementById(`settings-${prefix}-model-provider-wrap`);
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetWrapEl = document.getElementById(`settings-${prefix}-model-preset-code-wrap`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  const summaryEl = document.getElementById(`settings-${prefix}-model-preset-summary`);
  const nameEl = document.getElementById(`settings-${prefix}-model-name`);
  const nameWrapEl = document.getElementById(`settings-${prefix}-model-name-wrap`);
  const baseUrlEl = document.getElementById(`settings-${prefix}-model-base-url`);
  const baseUrlWrapEl = document.getElementById(`settings-${prefix}-model-base-url-wrap`);
  const baseUrlLabelEl = baseUrlWrapEl?.querySelector('.settings-model-base-url-label');
  if (!providerEl) return;

  const desiredProvider = String(providerEl?.dataset?.desiredValue ?? providerEl?.value ?? 'google').trim();
  const selectedCode = String(presetEl?.dataset?.desiredValue ?? presetEl?.value ?? '').trim();

  populateSettingsAiProviderSelect(kind, providerEl, desiredProvider);
  const resolvedProvider = String(providerEl.value || desiredProvider || 'google').trim();
  const isDirect = resolvedProvider === 'direct';

  if (providerWrapEl) providerWrapEl.style.display = '';
  if (presetWrapEl) presetWrapEl.style.display = isDirect ? 'none' : '';
  if (nameWrapEl) nameWrapEl.style.display = isDirect ? '' : 'none';
  if (baseUrlWrapEl) baseUrlWrapEl.style.display = '';
  if (baseUrlLabelEl) {
    baseUrlLabelEl.textContent = !isDirect
      ? (resolvedProvider === 'google'
        ? 'Google AI API'
        : (resolvedProvider === 'openai'
          ? 'OpenAI API'
          : (resolvedProvider === 'kie' ? 'KIE.ai API' : 'Base URL')))
      : 'Base URL';
  }
  providerEl.dataset.desiredValue = resolvedProvider;
  providerEl.dataset.activeProvider = resolvedProvider;

  if (presetEl) {
    presetEl.disabled = isDirect;
  }
  if (nameEl) {
    nameEl.disabled = !isDirect;
  }

  if (!isDirect && providerEl) {
    const selected = populateSettingsAiPresetModelSelect(kind, resolvedProvider, presetEl, summaryEl, selectedCode);
    if (presetEl) presetEl.dataset.desiredValue = presetEl.value || '';
    if (baseUrlEl) {
      baseUrlEl.value = resolvedProvider === 'google' ? '' : (selected?.base_url || '');
      baseUrlEl.readOnly = true;
    }
    if (nameEl) {
      nameEl.readOnly = false;
    }
  } else {
    if (summaryEl) summaryEl.textContent = '';
    if (presetEl) {
      presetEl.innerHTML = '';
      presetEl.dataset.desiredValue = '';
    }
    if (baseUrlEl) {
      baseUrlEl.readOnly = false;
    }
    if (nameEl) {
      nameEl.readOnly = false;
    }
  }
}

function captureSettingsAiModelDesiredState(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  if (providerEl) {
    providerEl.dataset.desiredValue = String(providerEl.value || '').trim();
  }
  if (presetEl) {
    presetEl.dataset.desiredValue = String(presetEl.value || '').trim();
  }
}

function createEmptySettingsAiProviderProfiles() {
  return { text: {}, image: {}, chat: {} };
}

function normalizeSettingsAiProviderProfiles(rawProfiles) {
  const normalized = createEmptySettingsAiProviderProfiles();
  const source = rawProfiles && typeof rawProfiles === 'object' && !Array.isArray(rawProfiles)
    ? rawProfiles
    : {};
  ['text', 'image', 'chat'].forEach((role) => {
    const roleProfiles = source[role] && typeof source[role] === 'object' && !Array.isArray(source[role])
      ? source[role]
      : {};
    Object.entries(roleProfiles).slice(0, 30).forEach(([profileKey, rawProfile]) => {
      if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return;
      const provider = String(rawProfile.provider || profileKey || '').trim().toLowerCase();
      if (!provider || provider !== String(profileKey || '').trim().toLowerCase()) return;
      normalized[role][provider] = {
        provider,
        code: String(rawProfile.code || '').trim(),
        name: String(rawProfile.name || '').trim(),
        base_url: String(rawProfile.base_url || '').trim(),
        api_key: String(rawProfile.api_key || '').trim()
      };
    });
  });
  return normalized;
}

function cloneSettingsAiProviderProfiles(rawProfiles = settingsAiProviderProfiles) {
  return normalizeSettingsAiProviderProfiles(rawProfiles);
}

function readSettingsAiProviderProfile(kind, providerOverride = '') {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const provider = String(
    providerOverride || document.getElementById(`settings-${prefix}-model-preset-provider`)?.value || ''
  ).trim().toLowerCase();
  if (!provider) return null;
  const presetCode = String(document.getElementById(`settings-${prefix}-model-preset-code`)?.value || '').trim();
  const name = String(document.getElementById(`settings-${prefix}-model-name`)?.value || '').trim();
  return {
    provider,
    code: provider === 'direct' ? name : presetCode,
    name: provider === 'direct' ? name : '',
    base_url: String(document.getElementById(`settings-${prefix}-model-base-url`)?.value || '').trim(),
    api_key: getSettingsInputValue(`settings-${prefix}-model-api-key`).trim()
  };
}

function snapshotSettingsAiProviderProfile(kind, providerOverride = '', targetProfiles = settingsAiProviderProfiles) {
  const profile = readSettingsAiProviderProfile(kind, providerOverride);
  if (!profile) return;
  if (!targetProfiles[kind]) targetProfiles[kind] = {};
  targetProfiles[kind][profile.provider] = profile;
}

function restoreSettingsAiProviderProfile(kind, provider) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const profile = settingsAiProviderProfiles?.[kind]?.[normalizedProvider] || null;
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  const presetEl = document.getElementById(`settings-${prefix}-model-preset-code`);
  const nameEl = document.getElementById(`settings-${prefix}-model-name`);
  const baseUrlEl = document.getElementById(`settings-${prefix}-model-base-url`);
  const apiKeyEl = document.getElementById(`settings-${prefix}-model-api-key`);

  if (providerEl) providerEl.dataset.desiredValue = normalizedProvider;
  if (presetEl) presetEl.dataset.desiredValue = profile?.code || '';
  syncSettingsAiModelUi(kind);

  setManagedSettingsSecretValue(apiKeyEl, profile?.api_key || '');
  if (normalizedProvider === 'direct') {
    if (nameEl) nameEl.value = profile?.name || profile?.code || '';
    if (baseUrlEl) baseUrlEl.value = profile?.base_url || '';
  } else if (profile?.base_url && presetEl?.selectedOptions?.[0]?.textContent?.includes('카탈로그에 없음')) {
    if (baseUrlEl) baseUrlEl.value = profile.base_url;
  }
  resetSettingsAiModelTestResult(kind);
}

function handleSettingsAiProviderChange(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const providerEl = document.getElementById(`settings-${prefix}-model-preset-provider`);
  if (!providerEl) return;
  const previousProvider = String(providerEl.dataset.activeProvider || '').trim().toLowerCase();
  const nextProvider = String(providerEl.value || '').trim().toLowerCase();
  if (previousProvider && previousProvider !== nextProvider) {
    snapshotSettingsAiProviderProfile(kind, previousProvider);
  }
  restoreSettingsAiProviderProfile(kind, nextProvider);
}

function serializeSettingsAiProviderProfiles() {
  const profiles = cloneSettingsAiProviderProfiles();
  ['text', 'image', 'chat'].forEach((kind) => snapshotSettingsAiProviderProfile(kind, '', profiles));
  return profiles;
}

function getSettingsAiModelTestPayload(kind) {
  if (kind === 'chat' && getSelectedSettingsRadioValue('settings-chat-model-source', 'writing') === 'writing') {
    return getSettingsAiModelTestPayload('text');
  }
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  return {
    kind: kind === 'chat' ? 'text' : kind,
    provider: (document.getElementById(`settings-${prefix}-model-preset-provider`)?.value || '').trim(),
    presetCode: (document.getElementById(`settings-${prefix}-model-preset-code`)?.value || '').trim(),
    name: (document.getElementById(`settings-${prefix}-model-name`)?.value || '').trim(),
    baseUrl: (document.getElementById(`settings-${prefix}-model-base-url`)?.value || '').trim(),
    apiKey: getSettingsInputValue(`settings-${prefix}-model-api-key`).trim()
  };
}

function resetSettingsAiModelTestResult(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const resultEl = document.getElementById(`settings-${prefix}-model-test-result`);
  if (!resultEl) return;
  resultEl.textContent = 'API Key와 연결 정보를 확인합니다.';
  resultEl.style.color = 'var(--text-muted)';
}

async function runSettingsAiModelTest(kind) {
  const prefix = kind === 'image' ? 'image' : (kind === 'chat' ? 'chat' : 'text');
  const buttonEl = document.getElementById(`settings-${prefix}-model-test-btn`);
  const resultEl = document.getElementById(`settings-${prefix}-model-test-result`);
  const payload = getSettingsAiModelTestPayload(kind);
  const modelCode = payload.provider === 'direct' ? payload.name : payload.presetCode;

  if (!modelCode) {
    if (resultEl) {
      resultEl.textContent = '❌ 테스트할 모델을 선택하거나 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }
  if (payload.provider !== 'direct' && !payload.apiKey) {
    if (resultEl) {
      resultEl.textContent = '❌ 선택한 모델의 API Key를 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }
  if (payload.provider === 'direct' && !payload.baseUrl) {
    if (resultEl) {
      resultEl.textContent = '❌ 직접 입력 모델의 Base URL을 입력해 주세요.';
      resultEl.style.color = 'var(--danger)';
    }
    return;
  }

  if (buttonEl) buttonEl.disabled = true;
  if (resultEl) {
    resultEl.textContent = '⏳ API Key와 연결 정보 확인 중...';
    resultEl.style.color = 'var(--text-muted)';
  }

  try {
    const result = await postJson('/api/v1/settings/test-ai-model', payload);
    const elapsed = Number.isFinite(Number(result?.latency_ms))
      ? ` · ${(Number(result.latency_ms) / 1000).toFixed(2)}초`
      : '';
    const credit = Number.isFinite(Number(result?.credit_balance))
      ? ` · 잔여 크레딧 ${Number(result.credit_balance).toLocaleString()}`
      : '';
    if (resultEl) {
      const roleLabel = kind === 'chat' ? 'Chat Model · ' : '';
      resultEl.textContent = `✅ ${roleLabel}${result?.display_name || modelCode} 연결 성공${credit}${elapsed}`;
      resultEl.style.color = 'var(--success)';
    }
  } catch (error) {
    if (resultEl) {
      const modelName = payload.name || modelCode || 'AI 모델';
      const errorMessage = String(error?.message || '연결 중 오류가 발생했습니다.');
      resultEl.textContent = errorMessage.includes('연결 실패')
        ? `❌ ${errorMessage}`
        : `❌ ${modelName} 연결 실패 · ${errorMessage}`;
      resultEl.style.color = 'var(--danger)';
    }
  } finally {
    if (buttonEl) buttonEl.disabled = false;
  }
}

function syncSettingsChatModelUi() {
  const source = getSelectedSettingsRadioValue('settings-chat-model-source', 'writing');
  const dedicatedCardEl = document.getElementById('settings-chat-model-dedicated-card');
  const writingSummaryEl = document.getElementById('settings-chat-model-writing-summary');
  if (dedicatedCardEl) dedicatedCardEl.style.display = source === 'dedicated' ? '' : 'none';

  const writingModelName = (
    document.getElementById('settings-text-model-name')?.value
    || document.getElementById('settings-text-model-preset-code')?.selectedOptions?.[0]?.textContent
    || document.getElementById('settings-text-model-preset-code')?.value
    || '현재 글쓰기 모델'
  ).trim();
  if (writingSummaryEl) {
    writingSummaryEl.textContent = source === 'writing'
      ? `현재 글쓰기 모델(${writingModelName})을 Chat Model 역할에도 사용합니다.`
      : 'Chat Model을 글쓰기 모델과 별도로 설정합니다.';
  }
  if (source === 'dedicated') syncSettingsAiModelUi('chat');
  syncSettingsSnsAiHint();
}

