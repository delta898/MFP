function setNaverCommentDraftResultText(message) {
  naverCommentDraftStatusText = String(message || '');
  const resultEl = document.getElementById('naver-comment-draft-result');
  if (resultEl) resultEl.textContent = naverCommentDraftStatusText;
}

function getNaverCommentDraftSettingsFromUi() {
  return {
    aiMode: (document.getElementById('naver-comment-draft-ai-mode')?.value || 'default').trim(),
    fetchLimit: parseInt(document.getElementById('naver-comment-draft-fetch-limit')?.value || '10', 10) || 10,
    tone: (document.getElementById('naver-comment-draft-tone')?.value || 'empathetic').trim(),
    maxChars: parseInt(document.getElementById('naver-comment-draft-max-chars')?.value || '60', 10) || 60,
    headless: Boolean(document.getElementById('naver-comment-draft-headless')?.checked)
  };
}

function renderNaverCommentDraftItems(items = []) {
  const listEl = document.getElementById('naver-comment-draft-list');
  if (!listEl) return;

  const safeItems = Array.isArray(items) ? items : [];
  naverCommentDraftItems = safeItems.map(item => ({ ...(item || {}) }));
  if (safeItems.length === 0) {
    listEl.innerHTML = '<p class="dash-feed-empty">조건에 맞는 후보 글이 없습니다.</p>';
    return;
  }

  listEl.innerHTML = safeItems.map((item, index) => {
    const drafts = Array.isArray(item?.drafts) ? item.drafts : [];
    const draftHtml = drafts.length > 0
      ? drafts.map((draft, draftIndex) => `
        <div class="comment-draft-item">
          <button class="secondary compact" type="button" data-comment-draft-copy="${index}:${draftIndex}">복사</button>
          <div class="comment-draft-item-text">${escapeHtml(draft)}</div>
        </div>
      `).join('')
      : `<div class="comment-draft-item"><div class="comment-draft-item-text">${escapeHtml(item?.error || '초안을 생성하지 못했습니다.')}</div></div>`;

    const chips = [
      item?.likedStateKnown ? (item?.liked ? '이미 공감한 글' : '공감 안 한 글') : '공감 여부 확인 불가',
      item?.postUrl ? '글 링크 확인됨' : '글 링크 없음'
    ];

    return `
      <article class="comment-draft-card" data-comment-draft-card="${index}">
        <div class="comment-draft-card-head">
          ${item?.thumbnailUrl ? `<div class="comment-draft-thumb"><img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('is-hidden'); this.remove();"></div>` : ''}
          <div>
            <div class="comment-draft-card-author">${escapeHtml(item?.authorName || '작성자 미상')}</div>
            <div class="comment-draft-card-title">${escapeHtml(item?.title || '제목 없음')}</div>
          </div>
        </div>
        <div class="comment-draft-chip-row">
          ${chips.map((chip) => `<span class="comment-draft-chip">${escapeHtml(chip)}</span>`).join('')}
        </div>
        <div class="comment-draft-card-excerpt">${escapeHtml(item?.excerpt || '본문 요약을 불러오지 못했습니다.')}</div>
        <div class="comment-draft-drafts">${draftHtml}</div>
        <div class="comment-draft-actions">
          <button class="secondary" type="button" data-comment-draft-redraft="${index}">다시 생성</button>
          ${(item?.commentUrl || item?.postUrl) ? `<a class="secondary" href="${escapeHtml(item.commentUrl || item.postUrl)}" target="_blank" rel="noopener noreferrer">글로 이동</a>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

async function loadNaverCommentDraftSettings() {
  const hadItems = Array.isArray(naverCommentDraftItems) && naverCommentDraftItems.length > 0;
  setNaverCommentDraftResultText(hadItems ? naverCommentDraftStatusText : '불러오는 중...');
  try {
    const data = await fetchJson('/api/v1/blog/naver-comment-draft/settings');
    const settings = data?.settings || {};
    const aiModeEl = document.getElementById('naver-comment-draft-ai-mode');
    const fetchLimitEl = document.getElementById('naver-comment-draft-fetch-limit');
    const toneEl = document.getElementById('naver-comment-draft-tone');
    const maxCharsEl = document.getElementById('naver-comment-draft-max-chars');
    const headlessEl = document.getElementById('naver-comment-draft-headless');
    if (aiModeEl) aiModeEl.value = String(settings.aiMode || 'default');
    if (fetchLimitEl) fetchLimitEl.value = String(settings.fetchLimit || 10);
    if (toneEl) toneEl.value = String(settings.tone || 'empathetic');
    if (maxCharsEl) maxCharsEl.value = String(settings.maxChars || 60);
    if (headlessEl) headlessEl.checked = Boolean(settings.headless ?? true);
    if (hadItems) {
      renderNaverCommentDraftItems(naverCommentDraftItems);
      setNaverCommentDraftResultText(naverCommentDraftStatusText);
    } else {
      setNaverCommentDraftResultText('불러오기 완료');
    }
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  }
}

async function saveNaverCommentDraftSettings() {
  setNaverCommentDraftResultText('저장 중...');
  try {
    const payload = getNaverCommentDraftSettingsFromUi();
    await postJson('/api/v1/blog/naver-comment-draft/settings', payload);
    setNaverCommentDraftResultText('저장 완료');
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  }
}

async function runNaverCommentDraft() {
  const runBtn = document.getElementById('naver-comment-draft-run-btn');
  const saveBtn = document.getElementById('naver-comment-draft-save-btn');
  if (runBtn?.disabled) return;
  if (runBtn) runBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;
  setNaverCommentDraftResultText('후보 글을 수집하고 댓글 초안을 생성 중...');
  const listEl = document.getElementById('naver-comment-draft-list');
  if (listEl) listEl.innerHTML = '<p class="dash-feed-empty">실행 중...</p>';
  let progressPolling = true;
  let progressTimer = null;
  const pollProgress = async () => {
    if (!progressPolling) return;
    try {
      const data = await fetchJson('/api/v1/blog/naver-comment-draft/progress');
      if (progressPolling && data?.progress?.message) {
        setNaverCommentDraftResultText(data.progress.message);
      }
    } catch (_e) {
      // 실행 성공/실패는 본 요청으로 판정하며, 진행 상태 조회 실패는 현재 표시를 유지한다.
    }
    if (progressPolling) progressTimer = window.setTimeout(pollProgress, 1000);
  };
  progressTimer = window.setTimeout(pollProgress, 250);
  try {
    const payload = getNaverCommentDraftSettingsFromUi();
    const data = await postJson('/api/v1/blog/naver-comment-draft/run', payload);
    renderNaverCommentDraftItems(data?.items || []);
    const summary = data?.summary || {};
    if (summary.status === 'no_candidates') {
      setNaverCommentDraftResultText('조건에 맞는 이웃새글 후보가 없습니다.');
    } else if (summary.status === 'rate_limited') {
      setNaverCommentDraftResultText(`AI 요청 한도로 실행을 중단했습니다. ${summary.successCount || 0}/${summary.candidateCount || 0}건 생성`);
    } else if (summary.status === 'draft_generation_failed') {
      setNaverCommentDraftResultText(`후보 ${summary.candidateCount || 0}건을 찾았지만 댓글 초안을 생성하지 못했습니다.`);
    } else if (summary.status === 'partial_success') {
      setNaverCommentDraftResultText(`일부 완료: ${summary.successCount || 0}건 생성, ${summary.failureCount || 0}건 실패`);
    } else {
      setNaverCommentDraftResultText(`완료: ${summary.successCount ?? (Array.isArray(data?.items) ? data.items.length : 0)}건의 댓글 초안을 생성했습니다.`);
    }
  } catch (e) {
    if (listEl) listEl.innerHTML = '<p class="dash-feed-empty">실행 결과가 없습니다.</p>';
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  } finally {
    progressPolling = false;
    if (progressTimer) window.clearTimeout(progressTimer);
    if (runBtn) runBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function redraftNaverCommentDraft(itemIndex) {
  const item = naverCommentDraftItems[itemIndex];
  if (!item) return;
  const redraftBtn = document.querySelector(`[data-comment-draft-redraft="${itemIndex}"]`);
  if (redraftBtn?.disabled) return;
  if (redraftBtn) redraftBtn.disabled = true;
  const payload = {
    ...getNaverCommentDraftSettingsFromUi(),
    title: item.title || '',
    authorName: item.authorName || '',
    excerpt: item.excerpt || '',
    postUrl: item.postUrl || ''
  };

  setNaverCommentDraftResultText('초안을 다시 생성 중...');
  try {
    const data = await postJson('/api/v1/blog/naver-comment-draft/redraft', payload);
    const currentItems = naverCommentDraftItems.map((entry, index) => ({
      ...entry,
      drafts: index === itemIndex ? (Array.isArray(data?.drafts) ? data.drafts : []) : (Array.isArray(entry?.drafts) ? entry.drafts : [])
    }));
    renderNaverCommentDraftItems(currentItems);
    setNaverCommentDraftResultText('초안을 다시 생성했습니다.');
  } catch (e) {
    setNaverCommentDraftResultText(`오류: ${e.message}`);
  } finally {
    const currentRedraftBtn = document.querySelector(`[data-comment-draft-redraft="${itemIndex}"]`);
    if (currentRedraftBtn) currentRedraftBtn.disabled = false;
  }
}

