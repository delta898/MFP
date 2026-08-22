async function runBlogBatchAction() {
  if (!guardUiConfigReady('선택 글감 포스팅')) return;
  const resultBox = document.getElementById('blog-action-result');
  if (!resultBox) return;

  const rowIndices = getSelectedBlogRowIndices();
  if (rowIndices.length === 0) {
    resultBox.textContent = '먼저 발행할 행을 1개 이상 선택하세요.';
    return;
  }

  const selectedSnapshot = [...rowIndices];

  const headless = Boolean(document.getElementById('blog-batch-headless')?.checked);
  const targets = [];
  if (document.getElementById('blog-batch-target-naver')?.checked) targets.push('naver');
  if (document.getElementById('blog-batch-target-wordpress')?.checked) targets.push('wordpress');

  const preCheck = checkPublishPrerequisites(targets);
  if (!preCheck.ok) {
    resultBox.textContent = preCheck.message;
    return;
  }

  try {
    const quota = await getPublishQuotaPreflight(selectedSnapshot.length);
    if (quota.executable === 0) {
      resultBox.textContent = quota.message;
      return;
    }
    if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) {
      resultBox.textContent = '발행이 취소되었습니다.';
      return;
    }
  } catch (error) {
    resultBox.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }

  clearBlogSelections();
  clearPreviousBatchVisualState();
  pauseDashboardPolling();

  try {
    const data = await runWithLiveProgress({
      targetEl: resultBox,
      requestLabel: `블로그 일괄 발행 (${selectedSnapshot.length}건)`,
      requestFn: async () => {
        await loadBlogTopics({ silent: true });
        const res = await postJson('/api/v1/blog/action', { action: 'batch', rowIndices: selectedSnapshot, headless, targets });
        return res;
      },
      onTick: () => loadBlogTopics({ silent: true })
    });
    blogLastBatchResult = data;
    markRecentBatchRows(data?.results || []);
    renderBlogLastBatchResult(blogLastBatchResult);
    await Promise.all([loadDashboard(), loadBlogTopics()]);
  } catch (e) {
    // runWithLiveProgress 이미 노출
  } finally {
    resumeDashboardPolling();
  }
}

