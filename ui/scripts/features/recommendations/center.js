const RECOMMENDATION_CENTER_SEEN_KEY = 'recommendation-center-seen-v1';
const RECOMMENDATION_KIND_LABELS = Object.freeze({
  content_opportunity: '글감 기회',
  commerce_opportunity: '쇼핑 기회',
  setup_guidance: '설정 안내',
  recovery_action: '복구 안내',
  workflow_hint: '작업 안내'
});
let recommendationCenterItems = [];
let recommendationCenterLoadPromise = null;

function recommendationCenterRelativeTime(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return '방금 확인';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function recommendationCenterEvidenceTime(item) {
  const times = (Array.isArray(item?.evidence) ? item.evidence : [])
    .map((evidence) => evidence?.observed_at)
    .filter((value) => Number.isFinite(Date.parse(String(value || ''))))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return times[0] || item?.available_at || '';
}

function recommendationCenterSafeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch (_) {
    return '';
  }
}

function readRecommendationCenterSeenIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECOMMENDATION_CENTER_SEEN_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String).slice(-100) : []);
  } catch (_) {
    return new Set();
  }
}

function rememberRecommendationCenterIds(items) {
  try {
    const seen = readRecommendationCenterSeenIds();
    items.forEach((item) => seen.add(String(item?.recommendation_id || '')));
    localStorage.setItem(RECOMMENDATION_CENTER_SEEN_KEY, JSON.stringify([...seen].filter(Boolean).slice(-100)));
  } catch (_) { }
}

function updateRecommendationCenterCount(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  ['recommendation-center-count', 'recommendation-nav-badge'].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = safeCount > 99 ? '99+' : String(safeCount);
    element.hidden = safeCount === 0;
  });
}

function createRecommendationEvidence(item) {
  const list = document.createElement('div');
  list.className = 'recommendation-evidence-list';
  list.hidden = true;
  (Array.isArray(item?.evidence) ? item.evidence : []).forEach((evidence) => {
    const row = document.createElement('div');
    row.className = 'recommendation-evidence-item';
    const head = document.createElement('div');
    head.className = 'recommendation-evidence-head';
    const sourceUrl = recommendationCenterSafeUrl(evidence?.source?.url);
    const sourceLabel = String(evidence?.source?.label || '앱 데이터').trim() || '앱 데이터';
    const source = sourceUrl ? document.createElement('a') : document.createElement('span');
    source.className = 'recommendation-evidence-source';
    source.textContent = sourceLabel;
    if (sourceUrl) {
      source.href = sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
    }
    const time = document.createElement('span');
    time.textContent = recommendationCenterRelativeTime(evidence?.observed_at);
    head.append(source, time);
    const summary = document.createElement('div');
    summary.textContent = String(evidence?.summary || '근거 설명이 없습니다.');
    row.append(head, summary);
    list.appendChild(row);
  });
  return list;
}

function recommendationButton(label, action, className = 'secondary') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.recommendationAction = action;
  button.textContent = label;
  return button;
}

function createRecommendationCard(item) {
  const card = document.createElement('article');
  card.className = 'recommendation-card';
  card.dataset.recommendationId = String(item.recommendation_id || '');

  const top = document.createElement('div');
  top.className = 'recommendation-card-top';
  const labels = document.createElement('div');
  labels.className = 'recommendation-card-labels';
  const kind = document.createElement('span');
  kind.className = 'recommendation-kind';
  kind.textContent = RECOMMENDATION_KIND_LABELS[item.kind] || '추천';
  labels.appendChild(kind);
  if (item.status === 'action_failed') {
    const state = document.createElement('span');
    state.className = 'recommendation-state';
    state.textContent = '다시 시도 가능';
    labels.appendChild(state);
  }
  const freshness = document.createElement('span');
  freshness.className = 'recommendation-freshness';
  freshness.textContent = recommendationCenterRelativeTime(recommendationCenterEvidenceTime(item));
  top.append(labels, freshness);

  const title = document.createElement('h3');
  title.textContent = String(item.title || '추천');
  const summary = document.createElement('p');
  summary.className = 'recommendation-card-summary';
  summary.textContent = String(item.summary || '');
  card.append(top, title, summary);
  if (item.explanation) {
    const explanation = document.createElement('p');
    explanation.className = 'recommendation-card-explanation';
    explanation.textContent = String(item.explanation);
    card.appendChild(explanation);
  }

  const evidence = createRecommendationEvidence(item);
  if (evidence.children.length > 0) {
    const toggle = recommendationButton(`추천 근거 ${evidence.children.length}개`, 'evidence', 'recommendation-evidence-toggle');
    toggle.setAttribute('aria-expanded', 'false');
    card.append(toggle, evidence);
  }

  const actions = document.createElement('div');
  actions.className = 'recommendation-card-actions';
  if (item.action) {
    const label = String(item.action.label || (item.action.type === 'presentation' ? '관련 화면 열기' : '실행')).trim();
    actions.appendChild(recommendationButton(item.status === 'action_failed' ? `${label} 다시 시도` : label, 'open', 'primary'));
  }
  actions.append(
    recommendationButton('나중에', 'snooze'),
    recommendationButton('관심 없음', 'dismiss', 'secondary recommendation-dismiss')
  );
  card.appendChild(actions);
  return card;
}

function renderRecommendationCenter(payload = {}) {
  const list = document.getElementById('recommendation-center-list');
  const status = document.getElementById('recommendation-center-status');
  if (!list || !status) return;
  recommendationCenterItems = Array.isArray(payload.items) ? payload.items : [];
  updateRecommendationCenterCount(payload.count);
  list.replaceChildren(...recommendationCenterItems.map(createRecommendationCard));
  status.classList.remove('is-error');
  status.hidden = recommendationCenterItems.length > 0;
  status.textContent = '현재 준비된 추천이 없습니다. 새로운 근거가 모이면 이곳에서 안내합니다.';
}

function notifyNewRecommendationCenterItems(items) {
  const seen = readRecommendationCenterSeenIds();
  const newItems = items.filter((item) => !seen.has(String(item?.recommendation_id || '')));
  rememberRecommendationCenterIds(items);
  if (newItems.length === 0) return;
  const first = newItems[0];
  showUiToast({
    dedupeKey: `recommendation:${first.recommendation_id}`,
    title: newItems.length > 1 ? `새 추천 ${newItems.length}건` : '새 추천과 안내',
    message: String(first.title || '새로운 추천이 준비되었습니다.'),
    actionLabel: '확인하기',
    onAction: async () => {
      await navigateTo('dashboard');
      document.getElementById('recommendation-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    timeoutMs: 8000
  });
}

async function loadRecommendationCenter(options = {}) {
  if (recommendationCenterLoadPromise) return recommendationCenterLoadPromise;
  const status = document.getElementById('recommendation-center-status');
  const refresh = document.getElementById('recommendation-center-refresh');
  if (!status) return null;
  if (options.force) {
    status.hidden = false;
    status.textContent = '추천을 새로 불러오는 중입니다...';
  }
  if (refresh) refresh.disabled = true;
  recommendationCenterLoadPromise = (async () => {
    try {
      const payload = await fetchJson(`/api/v1/recommendations?limit=6${options.refresh ? '&refresh=1' : ''}`);
      renderRecommendationCenter(payload);
      notifyNewRecommendationCenterItems(payload.items || []);
      return payload;
    } catch (error) {
      status.hidden = false;
      status.classList.add('is-error');
      status.textContent = '추천을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
      return null;
    } finally {
      if (refresh) refresh.disabled = false;
      recommendationCenterLoadPromise = null;
    }
  })();
  return recommendationCenterLoadPromise;
}

function recommendationPreviewMessage(confirmation = {}) {
  const preview = confirmation.preview || {};
  const details = [preview.summary, preview.theme]
    .concat(Array.isArray(preview.keywords) && preview.keywords.length ? `키워드: ${preview.keywords.join(', ')}` : [])
    .filter(Boolean);
  return [String(confirmation.label || '이 추천 동작을 실행할까요?'), ...details].join('\n');
}

async function openRecommendationPresentation(action = {}) {
  const surface = String(action?.target?.surface || '').trim();
  const targets = {
    'dashboard.recommendations': ['dashboard', ''],
    'blog.quick': ['blog', 'quick'],
    'blog.topics': ['blog', 'topics'],
    'blog.collect': ['blog', 'collect'],
    'blog.trend_posting': ['blog', 'trend-posting'],
    'shopping.items': ['shopping', 'quick'],
    'shopping.batch': ['shopping', 'batch'],
    'settings.general': ['settings', 'general'],
    'settings.blog': ['settings', 'naver-blog'],
    'settings.wordpress': ['settings', 'naver-blog'],
    'settings.shopping_connect': ['settings', 'shopping-connect'],
    'settings.ai': ['settings', 'ai'],
    'logs.system': ['logs', 'system']
  };
  const target = targets[surface];
  if (!target) throw new Error('지원하지 않는 추천 화면입니다.');
  if (isMobileQuickMode && !['dashboard.recommendations', 'blog.quick'].includes(surface)) {
    await showUiPopup('이 안내의 관련 설정이나 상세 화면은 데스크톱 화면에서 확인해 주세요.');
    return;
  }
  await navigateTo(target[0], target[1]);
  if (surface === 'logs.system') {
    document.querySelector('.logs-tab-btn[data-logs-tab="system"]')?.click();
  }
  if (surface === 'blog.quick' && action?.payload?.query) {
    const subject = document.getElementById('quick-subject');
    if (subject && !String(subject.value || '').trim()) subject.value = String(action.payload.query);
  }
  if (surface === 'dashboard.recommendations') {
    document.getElementById('recommendation-center')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function executeRecommendationCenterOpen(item) {
  const result = await postJson('/api/v1/recommendations/interaction', {
    recommendation_id: item.recommendation_id,
    interaction: 'open'
  });
  if (result.status === 'presentation') {
    await openRecommendationPresentation(result.action);
    return;
  }
  if (result.status === 'confirmation_required') {
    const accepted = await showUiConfirm(recommendationPreviewMessage(result.confirmation), {
      title: '추천 동작 확인', confirmText: '실행', cancelText: '취소'
    });
    const decision = accepted ? 'accept' : 'reject';
    const decided = await postJson('/api/v1/recommendations/confirmation', {
      recommendation_id: item.recommendation_id,
      confirmation_id: result.confirmation.id,
      decision
    });
    if (decided.status === 'executed') {
      showUiToast({ title: '추천 동작 완료', message: '요청한 동작을 완료했습니다.', level: 'success' });
    }
    return;
  }
  if (result.status === 'executed') {
    showUiToast({ title: '추천 동작 완료', message: '요청한 동작을 완료했습니다.', level: 'success' });
  }
}

async function handleRecommendationCenterAction(event) {
  const button = event.target.closest('[data-recommendation-action]');
  const card = event.target.closest('[data-recommendation-id]');
  if (!button || !card) return;
  const action = String(button.dataset.recommendationAction || '');
  if (action === 'evidence') {
    const evidence = card.querySelector('.recommendation-evidence-list');
    if (!evidence) return;
    evidence.hidden = !evidence.hidden;
    button.setAttribute('aria-expanded', String(!evidence.hidden));
    return;
  }
  const item = recommendationCenterItems.find((entry) => entry.recommendation_id === card.dataset.recommendationId);
  if (!item) return;
  card.classList.add('is-busy');
  try {
    if (action === 'open') {
      await executeRecommendationCenterOpen(item);
    } else {
      await postJson('/api/v1/recommendations/interaction', {
        recommendation_id: item.recommendation_id,
        interaction: action
      });
    }
    await loadRecommendationCenter({ force: true });
  } catch (error) {
    await showUiPopup(error.message || '추천 동작을 처리하지 못했습니다.');
  } finally {
    card.classList.remove('is-busy');
  }
}

function initRecommendationCenter() {
  document.getElementById('recommendation-center-list')?.addEventListener('click', handleRecommendationCenterAction);
  document.getElementById('recommendation-center-refresh')?.addEventListener('click', () => {
    void loadRecommendationCenter({ force: true, refresh: true });
  });
}
