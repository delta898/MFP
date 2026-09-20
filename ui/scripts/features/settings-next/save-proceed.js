function settingsNextDirtyLabels() {
  const labels = {
    content: '콘텐츠 공간',
    naver: '네이버 블로그',
    wordpress: '워드프레스',
    'ai-text': '글쓰기 모델',
    'ai-image': '이미지 모델',
    'ai-chat': '보조 대화 모델',
    writing: '글쓰기 기본값',
    'optional-buffer': 'Buffer',
    'optional-telegram': 'Telegram',
    'optional-slack': 'Slack',
    'optional-bitly': 'Bitly'
  };
  return [...settingsNextDirtyScopes].map((scope) => labels[scope] || scope).join(', ');
}

async function saveDirtySettingsNextScope(scope) {
  try {
    if (scope === 'content' || scope === 'naver' || scope === 'wordpress') {
      return (await settingsNextSaveScope(scope)) === true;
    }
    if (scope === 'writing') {
      if (typeof settingsNextWritingApply !== 'function') return false;
      return (await settingsNextWritingApply()) === true;
    }
    if (scope === 'app-input') {
      if (typeof settingsNextPersistAppInput !== 'function') return false;
      return (await settingsNextPersistAppInput()) === true;
    }
    if (scope === 'ai-text' || scope === 'ai-image' || scope === 'ai-chat') {
      if (typeof settingsNextPersistAiRole !== 'function') return false;
      const role = scope.slice(3);
      return (await settingsNextPersistAiRole(role, settingsNextAiReadRole(role))) === true;
    }
    if (scope.startsWith('optional-')) {
      if (typeof settingsNextPersistOptionalScope !== 'function') return false;
      return (await settingsNextPersistOptionalScope(scope.slice('optional-'.length))) === true;
    }
  } catch (_) {
    return false;
  }
  return false;
}

async function saveAllDirtySettingsNext() {
  if (!hasPendingSettingsNextChanges()) return true;
  for (const scope of [...settingsNextDirtyScopes]) {
    const saved = await saveDirtySettingsNextScope(scope);
    if (!saved) return false;
  }
  return !hasPendingSettingsNextChanges();
}

function isAppQuitDirty() {
  if (typeof hasPendingSettingsNextChanges === 'function' && hasPendingSettingsNextChanges()) return true;
  if (typeof settingsMajorHasPendingBasicChanges !== 'undefined' && settingsMajorHasPendingBasicChanges) return true;
  if (typeof settingsWritingProfileDirty !== 'undefined' && settingsWritingProfileDirty) return true;
  if (typeof blogNextSmartCommentDirty !== 'undefined' && blogNextSmartCommentDirty) return true;
  return false;
}

// App quit entry point (called from the main process): in-app dialog style,
// 'quit' | 'save-quit' | 'stay'. Never throws.
async function confirmAppQuitWithUnsavedChanges() {
  try {
    if (!isAppQuitDirty()) return 'quit';
    const changed = typeof settingsNextDirtyLabels === 'function' ? settingsNextDirtyLabels() : '';
    const detail = changed ? `: ${changed}` : '';
    const choice = await showUiThreeWayChoice(
      `아직 반영하지 않은 변경사항이 있습니다${detail}\n종료하면 변경사항이 사라집니다.`,
      {
        title: '설정 변경사항',
        saveText: '저장 후 종료',
        discardText: '변경사항 버리고 종료',
        stayText: '계속 편집'
      }
    );
    if (choice === 'save') {
      const saved = await saveAllDirtySettingsNext();
      if (!saved) return 'stay';
      return isAppQuitDirty() ? 'stay' : 'quit';
    }
    return choice === 'discard' ? 'quit' : 'stay';
  } catch (_) {
    return 'stay';
  }
}
