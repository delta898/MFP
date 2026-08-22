function renderManualSnsAiStatus(message = '', isError = false) {
  const statusEl = document.getElementById('manual-sns-ai-status');
  if (!statusEl) return;
  statusEl.textContent = String(message || '');
  statusEl.classList.toggle('is-error', isError);
}

async function optimizeManualSnsText() {
  const textEl = document.getElementById('manual-sns-text');
  const optimizeBtn = document.getElementById('manual-sns-ai-optimize-btn');
  if (!textEl || !optimizeBtn || optimizeBtn.disabled || manualSnsOptimizationInFlight) return;

  const originalValue = String(textEl.value || '');
  const selectedChannels = getManualSnsSelectedChannels();
  manualSnsOptimizationInFlight = true;
  renderManualSnsAiStatus('Chat Model이 글과 해시태그를 다듬고 있습니다.');
  syncManualSnsComposerState();
  try {
    const data = await postJson('/api/v1/social/manual/optimize', {
      channelIds: selectedChannels.map((channel) => channel.id),
      text: originalValue.trim()
    });
    const optimizedText = String(data?.optimized_text || '').trim();
    if (!optimizedText) throw new Error('AI 최적화 결과가 비어 있습니다.');
    if (String(textEl.value || '') !== originalValue) {
      throw new Error('최적화 중 내용이 변경되어 결과를 반영하지 않았습니다. 다시 실행해 주세요.');
    }

    manualSnsOptimizationSnapshot = originalValue;
    textEl.value = optimizedText;
    textEl.dispatchEvent(new Event('input', { bubbles: true }));
    renderManualSnsAiStatus(data?.within_limit === true
      ? 'AI 최적화를 완료했습니다. 내용을 확인하고 필요하면 직접 수정하세요.'
      : 'AI 최적화를 완료했지만 선택한 채널의 글자 수 제한을 넘었습니다. 내용을 줄여 주세요.',
    data?.within_limit !== true);
    textEl.focus();
  } catch (error) {
    renderManualSnsAiStatus(`AI 최적화 실패: ${error.message || '잠시 후 다시 시도해 주세요.'}`, true);
  } finally {
    manualSnsOptimizationInFlight = false;
    syncManualSnsComposerState();
  }
}

function undoManualSnsOptimization() {
  const textEl = document.getElementById('manual-sns-text');
  if (!textEl || manualSnsOptimizationSnapshot === null || manualSnsOptimizationInFlight) return;
  textEl.value = manualSnsOptimizationSnapshot;
  manualSnsOptimizationSnapshot = null;
  textEl.dispatchEvent(new Event('input', { bubbles: true }));
  renderManualSnsAiStatus('AI 최적화 전 내용으로 되돌렸습니다.');
  textEl.focus();
}

function renderManualSnsPublishResult(data = {}) {
  const resultEl = document.getElementById('manual-sns-publish-result');
  if (!resultEl) return;
  resultEl.replaceChildren();
  resultEl.classList.add('is-visible');
  const heading = document.createElement('strong');
  heading.textContent = data.success
    ? `발행 완료 · ${Number(data.success_count || 0)}개 채널 성공`
    : `일부 발행 실패 · 성공 ${Number(data.success_count || 0)}개 / 실패 ${Number(data.failure_count || 0)}개`;
  resultEl.appendChild(heading);
  (Array.isArray(data.results) ? data.results : []).forEach((result) => {
    const row = document.createElement('div');
    row.className = `social-result-row ${result.success ? 'is-success' : 'is-error'}`;
    row.textContent = result.success
      ? `✅ ${result.channel_name || result.service} ${result.status === 'sent' ? '발행 성공' : '발행 요청 성공'}`
      : `❌ ${result.channel_name || result.service} 실패${result.message ? ` · ${result.message}` : ''}`;
    resultEl.appendChild(row);
  });
  if (data.media_cleanup?.retained === true) {
    const cleanupRow = document.createElement('div');
    cleanupRow.className = 'social-result-row is-error';
    cleanupRow.textContent = '⚠️ 발행 상태를 확인하지 못해 임시 이미지가 WordPress 미디어에 남아 있습니다.';
    resultEl.appendChild(cleanupRow);
  }
}

