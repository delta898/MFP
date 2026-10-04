const BLOG_NEXT_RUNNER_ACTIVE_STATES = new Set(['selecting', 'running', 'accepted', 'cancel_requested', 'stop_requested']);
const BLOG_NEXT_RUNNER_TERMINAL_STATES = new Set(['completed', 'simulated', 'failed', 'canceled', 'stopped', 'needs_attention', 'blocked', 'empty']);

let blogNextRunnerPollingTimer = null;
let blogNextRunnerRequesting = false;
let blogNextRunnerActive = false;
let blogNextRunnerDismissedKey = '';
let blogNextRunnerLastStatus = { state: 'idle' };
let blogNextRunnerObservedFinishedAt = '';
let blogNextRunnerStatusInitialized = false;
let blogNextLocalPublishProgressTimer = null;
let blogNextLocalPublishProgressToken = 0;
let blogNextStopConfirmationPending = false;
let blogNextStopConfirmationTimer = null;
let blogNextStatusReturnTarget = null;
let blogNextStatusReturnFallback = null;
let blogNextStatusReturnMode = 'ai';
let blogNextStatusReturnScrollContainer = null;
let blogNextStatusReturnScrollTop = 0;

function blogNextStatusScrollBehavior() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto' : 'smooth';
}

function isBlogNextVisibleReturnTarget(element) {
  return Boolean(element?.isConnected && !element.closest('[hidden]') && element.getClientRects().length > 0);
}

function showBlogNextExecutionStatusAtTop(target, fallback = null) {
  blogNextStatusReturnTarget = target || null;
  blogNextStatusReturnFallback = fallback || null;
  blogNextStatusReturnMode = typeof blogNextActiveInputMode !== 'undefined' ? blogNextActiveInputMode : 'ai';
  const panel = document.getElementById('blog-next-publish-status');
  const returnButton = document.getElementById('blog-next-publish-status-return');
  if (returnButton) returnButton.hidden = !target;
  if (!panel || panel.hidden || (typeof blogNextActiveTab !== 'undefined' && blogNextActiveTab !== 'quick')) return;
  blogNextStatusReturnScrollContainer = document.querySelector('.main') || document.scrollingElement;
  blogNextStatusReturnScrollTop = Number(blogNextStatusReturnScrollContainer?.scrollTop || 0);
  panel.scrollIntoView({ behavior: blogNextStatusScrollBehavior(), block: 'start' });
  panel.focus({ preventScroll: true });
}

function stopBlogNextLocalPublishProgress() {
  blogNextLocalPublishProgressToken += 1;
  clearTimeout(blogNextLocalPublishProgressTimer);
  blogNextLocalPublishProgressTimer = null;
}

function clearBlogNextStopConfirmation() {
  blogNextStopConfirmationPending = false;
  clearTimeout(blogNextStopConfirmationTimer);
  blogNextStopConfirmationTimer = null;
}

function handleBlogNextExecutionStopClick() {
  const status = blogNextRunnerLastStatus || {};
  const localPublish = status.source === 'local_markdown';
  const manuscriptGeneration = status.source === 'manuscript_generation';
  const canStop = localPublish
    ? status.canStop === true && status.state === 'running'
    : manuscriptGeneration && blogNextAiOperationStatus?.canCancel === true;
  if (!canStop) return;
  if (blogNextStopConfirmationPending) {
    clearBlogNextStopConfirmation();
    syncBlogNextExecutionStopButton();
    if (localPublish) void stopBlogNextLocalMarkdownPublish();
    else void cancelBlogNextAiDraftGeneration();
    return;
  }
  blogNextStopConfirmationPending = true;
  clearTimeout(blogNextStopConfirmationTimer);
  blogNextStopConfirmationTimer = setTimeout(() => {
    clearBlogNextStopConfirmation();
    syncBlogNextExecutionStopButton();
  }, 6000);
  syncBlogNextExecutionStopButton();
}

function continueBlogNextExecution() {
  clearBlogNextStopConfirmation();
  syncBlogNextExecutionStopButton();
}

function dismissBlogNextStatusForNewWriting() {
  blogNextRunnerDismissedKey = getBlogNextRunnerStatusKey(blogNextRunnerLastStatus);
  const panel = document.getElementById('blog-next-publish-status');
  if (panel) panel.hidden = true;
  blogNextStatusReturnTarget = null;
  blogNextStatusReturnFallback = null;
  blogNextStatusReturnScrollContainer = null;
  blogNextStatusReturnScrollTop = 0;
}

function startBlogNextLocalPublishProgress(getSubject) {
  stopBlogNextLocalPublishProgress();
  const token = blogNextLocalPublishProgressToken;
  // A retry begins before the server acquires its new execution lease. Ignore
  // the previous terminal snapshot during that hand-off instead of stopping
  // this poller on the old run's `stopped` state.
  const previousExecutionId = blogNextRunnerLastStatus?.executionId || '';
  const poll = async () => {
    if (token !== blogNextLocalPublishProgressToken) return;
    try {
      const status = await fetchJson('/api/v1/continuous-publishing/runner/status');
      const stalePreviousExecution = previousExecutionId
        && status.executionId === previousExecutionId;
      if (!stalePreviousExecution && token === blogNextLocalPublishProgressToken
        && status.source === 'local_markdown' && ['running', 'stop_requested', 'stopped'].includes(status.state)) {
        renderBlogNextRunnerStatus({ ...status, subject: getSubject?.() || '' });
        if (status.state === 'stopped') {
          stopBlogNextLocalPublishProgress();
          return;
        }
      }
    } catch (_error) {
      // A missed status poll must not interrupt the authoritative publish request.
    } finally {
      if (token === blogNextLocalPublishProgressToken) {
        blogNextLocalPublishProgressTimer = setTimeout(poll, 900);
      }
    }
  };
  blogNextLocalPublishProgressTimer = setTimeout(poll, 400);
}

async function stopBlogNextLocalMarkdownPublish() {
  const status = blogNextRunnerLastStatus || {};
  if (status.source !== 'local_markdown' || status.canStop !== true) return;
  renderBlogNextRunnerStatus({
    ...status,
    state: 'stop_requested',
    busy: true,
    canStop: false,
    message: '네이버 포스팅 중지를 처리하고 있습니다.'
  });
  try {
    await postJson('/api/v1/continuous-publishing/runner/stop', {});
  } catch (error) {
    const latest = await fetchJson('/api/v1/continuous-publishing/runner/status').catch(() => null);
    if (latest?.source === 'local_markdown') {
      renderBlogNextRunnerStatus(latest);
    } else {
      renderBlogNextRunnerStatus({
        ...status,
        state: 'running',
        busy: true,
        canStop: status.canStop === true,
        message: error.message || '포스팅 중지를 요청하지 못했습니다.'
      });
    }
  }
}

function getBlogNextRunnerStatusKey(status = {}) {
  return [status.state, status.rowIndex, status.finishedAt, status.resultStatus, status.message]
    .map(value => String(value ?? ''))
    .join(':');
}

function presentBlogNextRunnerStatus(status = {}) {
  const state = String(status.state || 'idle');
  const manuscriptGeneration = String(status.source || '') === 'manuscript_generation';
  const localPublish = String(status.source || '') === 'local_markdown';
  const resultStatus = String(status.resultStatus || '').trim();
  if (state === 'selecting') return { title: '준비 중', tone: 'progress' };
  if (manuscriptGeneration && state === 'running') return { title: '원고 생성 중', tone: 'progress' };
  if (manuscriptGeneration && state === 'accepted') return { title: '원고 생성 준비 중', tone: 'progress' };
  if (manuscriptGeneration && state === 'cancel_requested') return { title: '중지 요청 중', tone: 'progress' };
  if (manuscriptGeneration && state === 'canceled') return { title: '원고 생성 중지', tone: 'warning' };
  if (localPublish && state === 'stop_requested') return { title: '포스팅 중지 중', tone: 'progress' };
  if (localPublish && state === 'stopped') return { title: '포스팅 중지', tone: 'warning' };
  if (manuscriptGeneration && state === 'completed') return { title: '원고 준비 완료', tone: 'success' };
  if (manuscriptGeneration && state === 'failed') return { title: '원고 생성 실패', tone: 'error' };
  if (localPublish && state === 'running') {
    const progressTitles = {
      preparing: '발행 준비 중', image_generation: 'AI 이미지 생성 중',
      editor: '에디터 연결 중', body: '원고 입력 중', image: '이미지 업로드 중',
      link: '링크 추가 중', settings: '저장·발행 설정 중',
      submitting: status.postStatus === 'draft' ? '임시 저장 중'
        : status.postStatus === 'schedule' ? '예약 등록 중' : '발행 중',
      verifying: '완료 확인 중'
    };
    return { title: progressTitles[String(status.progressStage || '')]
      || (status.postStatus === 'draft' ? '임시 저장 중'
        : status.postStatus === 'schedule' ? '예약 등록 중' : '발행 중'), tone: 'progress' };
  }
  if (localPublish && state === 'failed') return { title: status.postStatus === 'draft' ? '임시 저장 실패'
    : status.postStatus === 'schedule' ? '예약 등록 실패' : '발행 실패', tone: 'error' };
  if (state === 'running') {
    const progressTitles = {
      preparing: '준비 중', writing: '글 작성 중', images: '이미지 준비 중',
      quota: '발행 준비 중', publishing: '발행 중', finalizing: '마무리 중'
    };
    return { title: progressTitles[String(status.progressStage || '')] || '처리 중', tone: 'progress' };
  }
  if (state === 'completed') {
    const safeResult = ['발행 완료', '임시 저장 완료', '예약 발행 완료'].includes(resultStatus)
      ? resultStatus
      : '발행 완료';
    return { title: safeResult, tone: 'success' };
  }
  if (state === 'simulated') return { title: '시뮬레이션 완료', tone: 'success' };
  if (state === 'needs_attention') return { title: '확인 필요', tone: 'warning', manage: true };
  if (state === 'blocked') return { title: '실행할 수 없음', tone: 'warning', manage: true };
  if (state === 'failed') return { title: '발행 실패', tone: 'error', manage: true };
  if (state === 'empty') return { title: '실행할 글감 없음', tone: 'warning', manage: true };
  return { title: '', tone: '' };
}

function safeBlogNextCompletionUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

function renderBlogNextCompletionLinks(status = {}) {
  const container = document.getElementById('blog-next-publish-status-links');
  if (!container) return;
  container.replaceChildren();
  if (String(status.state || '') !== 'completed') {
    container.hidden = true;
    return;
  }
  const links = Array.isArray(status.completionLinks) ? status.completionLinks : [];
  links.slice(0, 2).forEach((item) => {
    const url = safeBlogNextCompletionUrl(item?.url);
    const label = String(item?.label || '').trim();
    if (!url || !label) return;
    const anchor = document.createElement('a');
    anchor.className = 'blog-next-publish-result-link';
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = status.source === 'local_markdown'
      ? item.platform === 'site-hosting'
        ? `${label} ↗`
        : `${item.platform === 'naver' ? '네이버' : item.platform === 'wordpress' ? '워드프레스' : label}${item.kind === 'post' ? ' 글' : ' 열기'} ↗`
      : label;
    anchor.setAttribute('aria-label', label);
    if (item.platform === 'site-hosting' && item.kind === 'post') {
      anchor.addEventListener('click', async (event) => {
        event.preventDefault();
        anchor.setAttribute('aria-disabled', 'true');
        try {
          if (!item.projectId || !item.siteId || !item.postId) throw new Error('발행된 글 주소를 확인할 수 없습니다.');
          await postJson(`/api/v1/site-hosting/projects/${encodeURIComponent(item.projectId)}/sites/${encodeURIComponent(item.siteId)}/open-post`, {
            post_id: item.postId
          });
        } catch (error) {
          if (typeof showUiToast === 'function') showUiToast({ message: error?.message || '시스템 브라우저에서 글을 열지 못했습니다.', level: 'error' });
        } finally {
          anchor.removeAttribute('aria-disabled');
        }
      });
    }
    container.appendChild(anchor);
  });
  container.hidden = container.childElementCount === 0;
}

function syncBlogNextRunnerTriggerState() {
  const active = blogNextRunnerActive || blogNextRunnerRequesting;
  const startButton = document.getElementById('blog-next-runner-start');
  const headless = document.getElementById('blog-next-runner-headless');
  if (startButton) {
    startButton.disabled = active;
    startButton.textContent = active ? '실행 중...' : '다음 1건 실행';
  }
  if (headless) {
    const naverSelected = document.getElementById('blog-next-target-naver')?.checked === true;
    headless.disabled = active || !naverSelected;
  }
  document.querySelectorAll('[data-blog-next-run-now]').forEach((button) => {
    button.disabled = active;
  });
  const automationTestButton = document.getElementById('blog-next-automation-test');
  if (automationTestButton) {
    const testScheduled = automationTestButton.dataset.testScheduled === 'true';
    automationTestButton.disabled = active || testScheduled;
    automationTestButton.setAttribute('aria-disabled', automationTestButton.disabled ? 'true' : 'false');
    automationTestButton.title = active ? '현재 실행이 끝난 뒤 시험 실행할 수 있습니다.' : '';
    automationTestButton.textContent = active ? '실행 중...' : testScheduled ? '테스트 대기 중...' : '30초 테스트';
  }
  if (typeof setBlogNextTopicBusy === 'function') setBlogNextTopicBusy(blogNextTopicSubmitting);
  if (typeof syncBlogNextDraftExecutionState === 'function') syncBlogNextDraftExecutionState(active);
  if (typeof syncBlogNextQueueRunnerState === 'function') syncBlogNextQueueRunnerState(blogNextRunnerLastStatus);
}

function renderBlogNextRunnerStatus(status = {}) {
  const panel = document.getElementById('blog-next-publish-status');
  const title = document.getElementById('blog-next-publish-status-title');
  const subject = document.getElementById('blog-next-publish-status-subject');
  const message = document.getElementById('blog-next-publish-status-message');
  const manage = document.getElementById('blog-next-publish-status-manage');
  const dismiss = document.getElementById('blog-next-publish-status-dismiss');
  const state = String(status.state || 'idle');
  const active = status.busy === true || BLOG_NEXT_RUNNER_ACTIVE_STATES.has(state);
  const terminal = BLOG_NEXT_RUNNER_TERMINAL_STATES.has(state);
  const presentation = presentBlogNextRunnerStatus(status);
  const statusKey = getBlogNextRunnerStatusKey(status);
  const dismissed = terminal && statusKey === blogNextRunnerDismissedKey;
  const panelVisible = state !== 'idle' && !dismissed && status.source !== 'manuscript_image_generation';

  blogNextRunnerLastStatus = { ...status };
  blogNextRunnerActive = active;
  if (typeof settleBlogNextImmediateSubmission === 'function') {
    settleBlogNextImmediateSubmission(status);
  }
  if (panel) {
    panel.hidden = !panelVisible;
    panel.dataset.state = state;
    panel.dataset.tone = presentation.tone;
  }
  if (title) title.textContent = presentation.title;
  if (subject) {
    subject.textContent = String(status.subject || '').trim();
    subject.hidden = !subject.textContent;
    subject.title = subject.textContent;
  }
  if (message) {
    const rawMessage = String(status.message || '').trim();
    message.textContent = state === 'completed' && rawMessage === '다음 글감 한 건을 처리했습니다.'
      ? '글감 처리 완료'
      : rawMessage;
  }
  renderBlogNextCompletionLinks(status);
  if (manage) manage.hidden = presentation.manage !== true;
  if (dismiss) dismiss.hidden = !terminal;
  const localStatus = status.source === 'manuscript_generation' || status.source === 'local_markdown';
  if (!localStatus) {
    blogNextStatusReturnTarget = null;
    blogNextStatusReturnFallback = null;
    blogNextStatusReturnScrollContainer = null;
    blogNextStatusReturnScrollTop = 0;
  }
  const returnButton = document.getElementById('blog-next-publish-status-return');
  if (returnButton) returnButton.hidden = !panelVisible || !localStatus || !blogNextStatusReturnTarget;
  const nextButton = document.getElementById('blog-next-publish-status-next');
  if (nextButton) nextButton.hidden = !panelVisible || status.source !== 'local_markdown' || state !== 'completed';
  const help = document.getElementById('blog-next-publish-status-help');
  const helpText = document.getElementById('blog-next-publish-status-help-text');
  const showAiStopHelp = status.source === 'manuscript_generation'
    && ['accepted', 'running', 'cancel_requested', 'canceled'].includes(state);
  const showNaverStopHelp = status.source === 'local_markdown'
    && (status.canStop === true || ['stop_requested', 'stopped'].includes(state)
      || (state === 'running' && ['submitting', 'verifying'].includes(status.progressStage)));
  const showHelp = panelVisible && (showAiStopHelp || showNaverStopHelp);
  if (help) {
    help.hidden = !showHelp;
    if (!showHelp) {
      help.open = false;
      help.dataset.pinned = 'false';
    }
  }
  if (showHelp && helpText) {
    helpText.textContent = showNaverStopHelp
      ? (['submitting', 'verifying'].includes(status.progressStage)
        ? '최종 저장·발행 요청을 보낸 뒤에는 외부 반영 여부가 불확실해 중지할 수 없습니다.'
        : '중지하면 네이버 포스팅 자동화를 멈춥니다. 이미 네이버에 저장·발행된 내용은 되돌리지 않습니다.')
      : '중지하면 앱은 생성과 결과 반영을 중단합니다. 이미 처리된 AI 요청에는 비용이 발생할 수 있습니다.'
        + (status.remoteJobPossible ? ' KIE에 접수된 이미지 작업은 원격에서 계속될 수 있습니다.' : '');
  }
  syncBlogNextExecutionStopButton();
  syncBlogNextRunnerTriggerState();
  if (typeof scheduleGlobalPublishingStatusRefresh === 'function') scheduleGlobalPublishingStatusRefresh(50);
  return active;
}

function syncBlogNextExecutionStopButton() {
  const button = document.getElementById('blog-next-publish-status-cancel');
  if (!button) return;
  const control = document.getElementById('blog-next-publish-status-stop-control');
  const note = document.getElementById('blog-next-publish-status-stop-note');
  const continueButton = document.getElementById('blog-next-publish-status-continue');
  const status = blogNextRunnerLastStatus || {};
  const localPublish = status.source === 'local_markdown';
  const manuscriptGeneration = status.source === 'manuscript_generation';
  const stopRequested = status.state === 'stop_requested';
  const aiStopRequested = manuscriptGeneration && status.state === 'cancel_requested';
  const localStopUnavailable = localPublish && status.state === 'running'
    && ['submitting', 'verifying'].includes(status.progressStage);
  const canStop = localPublish
    ? status.canStop === true && status.state === 'running'
    : manuscriptGeneration
      && blogNextDraftState.ai.generating === true
      && Boolean(blogNextAiOperationId)
      && blogNextAiOperationStatus?.canCancel === true;
  if (blogNextStopConfirmationPending && !canStop) clearBlogNextStopConfirmation();
  const showStopControl = canStop || stopRequested || aiStopRequested || localStopUnavailable;
  const disabled = stopRequested || aiStopRequested || localStopUnavailable
    || (manuscriptGeneration && blogNextAiCancelRequesting);
  const confirming = blogNextStopConfirmationPending && canStop;
  if (control) {
    control.hidden = !showStopControl;
    control.dataset.disabled = disabled ? 'true' : 'false';
    control.tabIndex = disabled ? 0 : -1;
    if (localStopUnavailable) control.setAttribute('aria-describedby', 'blog-next-publish-status-stop-note');
    else control.removeAttribute('aria-describedby');
    control.setAttribute('aria-label', localStopUnavailable
      ? '최종 요청이 시작되어 중지할 수 없습니다.'
      : localPublish ? '네이버 포스팅 중지' : 'AI 생성 중지');
  }
  button.disabled = disabled;
  button.textContent = stopRequested || aiStopRequested
    ? '중지 요청 중…'
    : localStopUnavailable ? '마무리 중…'
      : confirming ? '중지 확인'
        : localPublish ? '포스팅 중지' : '생성 중지';
  button.classList.toggle('is-confirming', confirming);
  button.setAttribute('aria-label', localStopUnavailable ? '최종 요청 처리 중. 외부 반영 여부가 불확실해 중지할 수 없습니다.'
    : confirming ? `${localPublish ? '포스팅' : '생성'} 중지를 확인합니다`
      : localPublish ? '네이버 포스팅 중지' : 'AI 생성 중지');
  if (note) {
    note.hidden = !localStopUnavailable;
    note.textContent = localStopUnavailable
      ? '최종 저장·발행 요청을 보낸 뒤에는 외부 반영 여부가 불확실해 중지할 수 없습니다.'
      : '';
  }
  if (continueButton) continueButton.hidden = !confirming;
}

function scheduleBlogNextRunnerPoll(delay = 1000) {
  clearTimeout(blogNextRunnerPollingTimer);
  blogNextRunnerPollingTimer = setTimeout(() => loadBlogNextRunnerStatus({ poll: true }), delay);
}

function syncBlogNextRunnerWatchForTab() {
  clearTimeout(blogNextRunnerPollingTimer);
  if (blogNextRunnerActive) scheduleBlogNextRunnerPoll(1000);
  else if (typeof blogNextActiveTab !== 'undefined' && blogNextActiveTab === 'queue') scheduleBlogNextRunnerPoll(5000);
}

async function loadBlogNextRunnerStatus(options = {}) {
  if (typeof blogNextAiOperationId !== 'undefined' && blogNextAiOperationId) return blogNextRunnerLastStatus;
  const localDraftBusy = () => typeof blogNextDraftState !== 'undefined'
    && BLOG_NEXT_DRAFT_TYPES.some((type) => blogNextDraftState[type].publishing || blogNextDraftState[type].imageWorking);
  if (localDraftBusy()) return blogNextRunnerLastStatus;
  if (['manuscript_generation', 'local_markdown'].includes(blogNextRunnerLastStatus.source)
    && typeof blogNextActiveTab !== 'undefined' && blogNextActiveTab !== 'queue') return blogNextRunnerLastStatus;
  try {
    const status = await fetchJson('/api/v1/continuous-publishing/runner/status');
    if (blogNextAiOperationId || localDraftBusy()
      || (['manuscript_generation', 'local_markdown'].includes(blogNextRunnerLastStatus.source)
        && typeof blogNextActiveTab !== 'undefined' && blogNextActiveTab !== 'queue')) return blogNextRunnerLastStatus;
    const previousFinishedAt = blogNextRunnerObservedFinishedAt;
    const finishedAt = String(status.finishedAt || '');
    const finishedChanged = blogNextRunnerStatusInitialized
      && Boolean(finishedAt)
      && finishedAt !== previousFinishedAt;
    blogNextRunnerObservedFinishedAt = finishedAt || previousFinishedAt;
    blogNextRunnerStatusInitialized = true;
    const active = renderBlogNextRunnerStatus(status);
    if (finishedChanged
      && typeof blogNextActiveTab !== 'undefined'
      && blogNextActiveTab === 'queue'
      && typeof loadBlogNextQueue === 'function') {
      loadBlogNextQueue({ force: true, showRefreshProgress: false });
    }
    syncBlogNextRunnerWatchForTab();
    return status;
  } catch (error) {
    renderBlogNextRunnerStatus({ state: 'failed', message: error.message || '실행 상태를 불러오지 못했습니다.' });
    syncBlogNextRunnerWatchForTab();
    return null;
  }
}

async function startBlogNextRunner(options = {}) {
  if (blogNextRunnerRequesting || blogNextRunnerActive) return;
  blogNextRunnerRequesting = true;
  blogNextRunnerDismissedKey = '';
  const platforms = Array.isArray(options.platforms) ? options.platforms : null;
  const supportsHeadless = platforms === null || platforms.includes('naver');
  const headless = supportsHeadless && document.getElementById('blog-next-runner-headless')?.checked !== false;
  const rowIndex = Number(options.rowIndex);
  const selected = Number.isInteger(rowIndex);
  renderBlogNextRunnerStatus({ state: 'selecting', busy: true, message: selected ? '선택한 글감을 확인하고 있습니다.' : '다음 글감을 확인하고 있습니다.' });
  try {
    const status = await postJson('/api/v1/continuous-publishing/runner/start', selected ? { headless, rowIndex } : { headless });
    renderBlogNextRunnerStatus(status);
    scheduleBlogNextRunnerPoll(1000);
    return status;
  } catch (error) {
    renderBlogNextRunnerStatus({ state: 'failed', message: error.message || '다음 글감 실행을 시작하지 못했습니다.' });
    throw error;
  } finally {
    blogNextRunnerRequesting = false;
    syncBlogNextRunnerTriggerState();
  }
}

function initBlogNextRunner() {
  const panel = document.getElementById('blog-next-publish-status');
  if (!panel) return;
  if (panel.dataset.bound !== 'true') {
    panel.dataset.bound = 'true';
    document.getElementById('blog-next-publish-status-manage')?.addEventListener('click', () => {
      activateBlogNextTab('queue');
    });
    document.getElementById('blog-next-publish-status-dismiss')?.addEventListener('click', () => {
      dismissBlogNextStatusForNewWriting();
      document.getElementById('blog-next-publish-status-return').hidden = true;
    });
    document.getElementById('blog-next-publish-status-next')?.addEventListener('click', () => {
      void navigateToBlogQuickCreate();
    });
    const help = document.getElementById('blog-next-publish-status-help');
    if (help) {
      help.addEventListener('mouseenter', () => { help.open = true; });
      help.addEventListener('mouseleave', () => { if (help.dataset.pinned !== 'true' && !help.contains(document.activeElement)) help.open = false; });
      help.addEventListener('focusin', () => { help.open = true; });
      help.addEventListener('focusout', () => {
        setTimeout(() => {
          if (help.dataset.pinned !== 'true' && !help.matches(':hover') && !help.contains(document.activeElement)) help.open = false;
        }, 0);
      });
      help.querySelector('summary')?.addEventListener('click', (event) => {
        event.preventDefault();
        help.dataset.pinned = help.dataset.pinned === 'true' ? 'false' : 'true';
        help.open = help.dataset.pinned === 'true' || help.matches(':hover') || help.contains(document.activeElement);
      });
      document.addEventListener('pointerdown', (event) => {
        if (help.contains(event.target)) return;
        help.dataset.pinned = 'false';
        help.open = false;
      });
    }
    document.getElementById('blog-next-publish-status-return')?.addEventListener('click', () => {
      if (typeof activateBlogNextTab === 'function') activateBlogNextTab('quick');
      if (typeof activateBlogNextInputMode === 'function') activateBlogNextInputMode(blogNextStatusReturnMode);
      const target = isBlogNextVisibleReturnTarget(blogNextStatusReturnTarget)
        ? blogNextStatusReturnTarget : blogNextStatusReturnFallback;
      if (!isBlogNextVisibleReturnTarget(target)) return;
      const scrollContainer = blogNextStatusReturnScrollContainer?.isConnected
        ? blogNextStatusReturnScrollContainer : document.querySelector('.main') || document.scrollingElement;
      if (scrollContainer) scrollContainer.scrollTop = blogNextStatusReturnScrollTop;
      if (!target.hasAttribute('tabindex') && !['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(target.tagName)) {
        target.setAttribute('tabindex', '-1');
      }
      target.focus({ preventScroll: true });
    });
    document.getElementById('blog-next-runner-start')?.addEventListener('click', () => startBlogNextRunner());
  }
  loadBlogNextRunnerStatus();
}
