async function loadShoppingAutoSettings({ force = false, skipPendingConfirm = false } = {}) {
  const canReload = await shouldProceedWithMajorSettingsReload({
    force,
    skipPendingConfirm,
    contextLabel: '쇼핑 자동 포스팅 설정'
  });
  if (!canReload) return false;

  const publishEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const publishBatchEl = document.getElementById('shopping-publish-auto-batch');
  const startTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const endTimeEl = document.getElementById('shopping-publish-auto-end-time');
  const notifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');
  setShoppingAutoResultText('불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/settings/major');
    const fields = data?.fields || {};
    if (publishEnabledEl) publishEnabledEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(fields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(fields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
    if (startTimeEl) startTimeEl.value = String(fields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
    if (endTimeEl) endTimeEl.value = String(fields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
    if (headlessEl) headlessEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
    if (notifyEnabledEl) notifyEnabledEl.checked = Boolean(fields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

    const targetChannels = Array.isArray(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
      ? fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
      : String(fields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-shopping-publish-target]').forEach((el) => {
      el.checked = targetChannels.includes(el.getAttribute('data-shopping-publish-target'));
    });

    setShoppingAutoResultText([
      '불러오기 완료',
      '- 자동발행 기준을 확인했습니다.',
      '- 변경 후 상단의 저장 및 적용 버튼으로 반영할 수 있습니다.'
    ].join('\n'));
    return true;
  } catch (e) {
    setShoppingAutoResultText(`오류: ${e.message}`);
    return false;
  }
}

async function saveShoppingAutoSettings() {
  const publishEnabledEl = document.getElementById('shopping-publish-auto-enabled');
  const publishIntervalEl = document.getElementById('shopping-publish-auto-interval');
  const publishBatchEl = document.getElementById('shopping-publish-auto-batch');
  const startTimeEl = document.getElementById('shopping-publish-auto-start-time');
  const endTimeEl = document.getElementById('shopping-publish-auto-end-time');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');
  const notifyEnabledEl = document.getElementById('shopping-publish-auto-notify-enabled');
  setShoppingAutoResultText('저장 중...');
  try {
    const major = await fetchJson('/api/v1/settings/major');
    const fields = { ...(major?.fields || {}) };
    const payload = {
      ...fields,
      SHOPPING_PUBLISH_AUTO_ENABLED: Boolean(publishEnabledEl?.checked),
      SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: parseInt(publishIntervalEl?.value || '60', 10),
      SHOPPING_PUBLISH_AUTO_BATCH_SIZE: parseInt(publishBatchEl?.value || '1', 10),
      SHOPPING_PUBLISH_AUTO_START_TIME: (startTimeEl?.value || '00:00').trim(),
      SHOPPING_PUBLISH_AUTO_END_TIME: (endTimeEl?.value || '23:59').trim(),
      SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')).join(','),
      SHOPPING_PUBLISH_AUTO_HEADLESS: Boolean(headlessEl?.checked),
      SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: Boolean(notifyEnabledEl?.checked)
    };
    const saved = await postJson('/api/v1/settings/major', payload);
    const savedFields = saved?.fields || {};
    if (publishEnabledEl) publishEnabledEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_ENABLED);
    if (publishIntervalEl) publishIntervalEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN || 60);
    if (publishBatchEl) publishBatchEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_BATCH_SIZE || 1);
    if (startTimeEl) startTimeEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_START_TIME || '00:00');
    if (endTimeEl) endTimeEl.value = String(savedFields.SHOPPING_PUBLISH_AUTO_END_TIME || '23:59');
    if (headlessEl) headlessEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_HEADLESS ?? true);
    if (notifyEnabledEl) notifyEnabledEl.checked = Boolean(savedFields.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED);

    const targetChannels = Array.isArray(savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS)
      ? savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
      : String(savedFields.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS || 'naver').split(',').map(v => v.trim()).filter(Boolean);
    document.querySelectorAll('[data-shopping-publish-target]').forEach((el) => {
      el.checked = targetChannels.includes(el.getAttribute('data-shopping-publish-target'));
    });

    setShoppingAutoResultText([
      '저장 완료',
      '- 쇼핑 자동 포스팅 설정이 반영되었습니다.',
      '- 수동 실행으로 즉시 동작을 검증할 수 있습니다.'
    ].join('\n'));
  } catch (e) {
    setShoppingAutoResultText(`오류: ${e.message}`);
  }
}

async function runShoppingAutoManual() {
  if (!guardUiConfigReady('쇼핑 자동발행 수동 실행')) return;
  if (shoppingAutoManualRunInFlight) return;

  const resultEl = document.getElementById('shopping-auto-result');
  const batchEl = document.getElementById('shopping-publish-auto-batch');
  const headlessEl = document.getElementById('shopping-publish-auto-headless');

  let quota;
  try {
    quota = await getPublishQuotaPreflight(parseInt((batchEl?.value || '1').trim(), 10) || 1);
  } catch (error) {
    if (resultEl) resultEl.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }
  if (quota.executable === 0) {
    if (resultEl) resultEl.textContent = quota.message;
    return;
  }
  const shouldProceed = await showUiConfirm(quota.message, {
    title: '수동 실행 확인',
    confirmText: '진행',
    cancelText: '취소'
  });
  if (shouldProceed === false) {
    if (resultEl) resultEl.textContent = '수동 실행이 취소되었습니다.';
    return;
  }

  const batchSize = parseInt((batchEl?.value || '1').trim(), 10) || 1;
  const targets = Array.from(document.querySelectorAll('[data-shopping-publish-target]:checked')).map(el => el.getAttribute('data-shopping-publish-target')).join(',');
  const headless = Boolean(headlessEl?.checked);

  shoppingAutoManualRunInFlight = true;
  if (resultEl) resultEl.textContent = '쇼핑 자동발행 파이프라인 실행 중...';
  pauseDashboardPolling();
  try {
    const data = await postJson('/api/v1/auto/shopping/run', {
      settingsOverrides: {
        SHOPPING_PUBLISH_AUTO_BATCH_SIZE: batchSize,
        SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: targets,
        SHOPPING_PUBLISH_AUTO_HEADLESS: headless
      }
    });
    const summary = data?.summary || {};
    const lines = [
      '쇼핑 수동 실행 완료',
      `- 시도 / 성공: ${Number(summary?.attempted || 0)
      } / ${Number(summary?.success || 0)}건`
    ];
    if (resultEl) resultEl.textContent = lines.join('\n');
    await Promise.all([
      loadDashboard(),
      loadBlogShopping({ silent: true })
    ]);
  } catch (e) {
    console.error('[Shopping][ManualRun] Failed:', e);
    if (resultEl) resultEl.textContent = `오류: ${e.message}`;
  } finally {
    shoppingAutoManualRunInFlight = false;
    resumeDashboardPolling();
  }
}

async function runBlogPublishAutoManual() {
  if (!guardUiConfigReady('자동발행 수동 실행')) return;
  if (blogAutoManualRunInFlight) return;

  const batchEl = document.getElementById('blog-publish-auto-batch');
  const postStatusEl = document.getElementById('blog-publish-auto-post-status');
  const headlessEl = document.getElementById('blog-publish-auto-headless');
  const resultEl = document.getElementById('blog-publish-auto-result');
  const batchSize = parseInt((batchEl?.value || '1').trim(), 10) || 1;
  const postStatus = postStatusEl?.value === 'draft' ? 'draft' : 'publish';
  const targets = Array.from(document.querySelectorAll('[data-publish-target]:checked')).map(el => el.getAttribute('data-publish-target')).join(',');
  const headless = Boolean(headlessEl?.checked);

  try {
    const quota = await getPublishQuotaPreflight(batchSize);
    if (quota.executable === 0) {
      if (resultEl) resultEl.textContent = quota.message;
      return;
    }
    if (await showUiConfirm(quota.message, { title: '발행 사용량 확인', confirmText: '실행', cancelText: '취소' }) === false) return;
  } catch (error) {
    if (resultEl) resultEl.textContent = `사용량 확인 실패: ${error.message}`;
    return;
  }

  blogAutoManualRunInFlight = true;

  try {
    await runWithLiveProgress({
      targetEl: resultEl,
      requestLabel: '수동 발행 실행',
      requestFn: () => postJson('/api/v1/auto/publish/run', {
        settingsOverrides: {
          PUBLISH_AUTO_BATCH_SIZE: batchSize,
          PUBLISH_AUTO_POST_STATUS: postStatus,
          PUBLISH_AUTO_TARGET_CHANNELS: targets,
          PUBLISH_AUTO_HEADLESS: headless
        }
      })
    });
    await Promise.all([
      loadDashboard(),
      loadBlogTopics({ silent: true })
    ]);
  } catch (e) {
    // runWithLiveProgress already shows error in the log area
  } finally {
    blogAutoManualRunInFlight = false;
  }
}

