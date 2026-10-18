async function settingsNextApplySpreadsheetSelection(file) {
  const url = String(file?.spreadsheetUrl || '').trim();
  const title = String(file?.title || '').trim();
  const fileId = String(file?.spreadsheetId || file?.fileId || settingsNextExtractSheetId(url)).trim();
  const urlInput = document.getElementById('settings-next-google-sheet-url');
  const titleInput = document.getElementById('settings-next-google-sheet-title');
  const authorizedIdInput = document.getElementById('settings-next-google-sheet-authorized-id');
  if (!url || !title || !fileId || !urlInput || !titleInput || !authorizedIdInput) throw new Error('선택한 Spreadsheet 정보를 확인하지 못했습니다.');
  urlInput.value = url;
  titleInput.value = title;
  authorizedIdInput.value = fileId;
  settingsNextRenderSheetSelection();
  settingsNextSyncScopeDirty('content');
  if (!await settingsNextSaveScope('content')) return false;
  const verifiedTitle = title;
  titleInput.value = verifiedTitle;
  settingsNextMajorFields.GOOGLE_SHEET_TITLE = verifiedTitle;
  settingsNextMajorFields.GOOGLE_SHEET_AUTHORIZED_FILE_ID = fileId;
  settingsNextSheetVerification = { spreadsheetId: fileId, success: true, title: verifiedTitle };
  settingsNextRenderSheetSelection();
  settingsNextRenderReadiness();
  settingsNextSetFeedback('settings-next-content-feedback', `연결 완료 · ${verifiedTitle}`, 'success');
  return true;
}

async function settingsNextWaitForGoogleFlow(flowId) {
  while (settingsNextGoogleBusy && settingsNextGoogleFlowId === flowId) {
    const flow = await fetchJson(`/api/v1/google-oauth/flows/${encodeURIComponent(flowId)}`);
    if (flow?.status === 'pending') {
      await new Promise((resolve) => setTimeout(resolve, 900));
      continue;
    }
    if (flow?.status === 'success') return flow;
    const error = new Error(flow?.message || (flow?.status === 'cancelled' ? '인증을 취소했습니다.' : 'Google 인증을 완료하지 못했습니다.'));
    error.cancelled = flow?.status === 'cancelled' || flow?.status === 'expired';
    throw error;
  }
  const error = new Error('인증을 취소했습니다.');
  error.cancelled = true;
  throw error;
}

async function settingsNextStartGoogleFlow(mode, action) {
  const data = await postJson('/api/v1/google-oauth/start', { mode });
  const flowId = String(data?.flowId || '').trim();
  if (!flowId) throw new Error('Google 인증 요청을 시작하지 못했습니다. 다시 시도해 주세요.');
  settingsNextGoogleFlowId = flowId;
  settingsNextGoogleFlowAction = action;
  settingsNextUpdateSaveUi('content');
  try {
    await postJson(`/api/v1/google-oauth/flows/${encodeURIComponent(flowId)}/open`, {});
    return await settingsNextWaitForGoogleFlow(flowId);
  } catch (error) {
    void postJson(`/api/v1/google-oauth/flows/${encodeURIComponent(flowId)}/cancel`, {}).catch(() => { });
    throw error;
  }
}

async function settingsNextCancelGoogleFlow() {
  const flowId = settingsNextGoogleFlowId;
  if (!flowId) return;
  settingsNextGoogleFlowId = '';
  settingsNextUpdateSaveUi('content');
  try {
    await postJson(`/api/v1/google-oauth/flows/${encodeURIComponent(flowId)}/cancel`, {});
  } catch (_error) { }
}

async function settingsNextCreateSpreadsheet() {
  if (settingsNextGoogleBusy || settingsNextBusyScopes.has('content')) return;
  settingsNextSetGoogleBusy(true, 'create-sheet');
  try {
    if (String(settingsNextGoogleStatus?.state || '').trim().toLowerCase() !== 'connected') {
      settingsNextSetFeedback('settings-next-content-feedback', '기본 브라우저에서 Google 연결을 진행해 주세요.');
      await settingsNextStartGoogleFlow('create', 'create-sheet');
      settingsNextRenderGoogleStatus(await fetchJson('/api/v1/google-oauth/status'));
    }
    settingsNextSetFeedback('settings-next-content-feedback', 'BlogGenius 폴더에 새 파일을 만들고 있습니다.');
    const file = await postJson('/api/v1/google-oauth/spreadsheets/create', {});
    await settingsNextApplySpreadsheetSelection(file);
  } catch (error) {
    settingsNextSetFeedback('settings-next-content-feedback', error.message || '새 Spreadsheet를 만들지 못했습니다.', error.cancelled ? 'neutral' : 'danger');
  } finally {
    settingsNextSetGoogleBusy(false);
  }
}

async function settingsNextPickSpreadsheet() {
  if (settingsNextGoogleBusy || settingsNextBusyScopes.has('content')) return;
  settingsNextSetGoogleBusy(true, 'pick-sheet');
  settingsNextSetFeedback('settings-next-content-feedback', '기본 브라우저에서 연결할 기존 파일을 선택해 주세요.');
  try {
    const flow = await settingsNextStartGoogleFlow('picker', 'pick-sheet');
    settingsNextRenderGoogleStatus(await fetchJson('/api/v1/google-oauth/status'));
    const fileId = String(flow?.pickerFileId || '').trim();
    if (!fileId) {
      settingsNextSetFeedback('settings-next-content-feedback', '파일 선택을 취소했습니다.', 'neutral');
      return;
    }
    const file = await postJson('/api/v1/google-oauth/picker/verify', { fileId });
    await settingsNextApplySpreadsheetSelection(file);
  } catch (error) {
    settingsNextSetFeedback('settings-next-content-feedback', error.message || 'Spreadsheet를 선택하지 못했습니다.', error.cancelled ? 'neutral' : 'danger');
  } finally {
    settingsNextSetGoogleBusy(false);
  }
}
