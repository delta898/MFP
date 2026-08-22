function renderDashboardAutoSchedule() {
  const blog = dashboardAutoScheduleState.blog;
  const shopping = dashboardAutoScheduleState.shopping;

  const setAutoScheduleUI = (prefix, data) => {
    const dateEl = document.getElementById(`dash-auto-${prefix}-next-date`);
    const relEl = document.getElementById(`dash-auto-${prefix}-next-relative`);

    const isWithinTimeRange = (timeStr, start, end) => {
      if (!start || !end) return true;
      if (!timeStr || timeStr === '-') return true;
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return true;
      const mins = date.getHours() * 60 + date.getMinutes();
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      const sMin = sH * 60 + sM;
      const eMin = eH * 60 + eM;
      if (sMin <= eMin) return mins >= sMin && mins <= eMin;
      return mins >= sMin || mins <= eMin;
    };

    if (!data.enabled || !data.nextRunAt || data.nextRunAt === '-') {
      if (dateEl) dateEl.textContent = '-';
      if (relEl) relEl.textContent = '';
    } else {
      const isAllowed = isWithinTimeRange(data.nextRunAt, data.startTime, data.endTime);
      if (data.status === 'waiting_time_window' || !isAllowed) {
        if (dateEl) dateEl.textContent = `허용 대기중 (${data.startTime || '00:00'}~${data.endTime || '23:59'})`;
        if (relEl) relEl.textContent = '';
      } else {
        if (dateEl) dateEl.textContent = formatDateTimeAbsolute(data.nextRunAt);
        if (relEl) relEl.textContent = formatNextRunText(data.nextRunAt);
      }
    }
  };

  setAutoScheduleUI('blog', blog);
  setAutoScheduleUI('shopping', shopping);
}

function formatDashboardFeedDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function truncateText(value, maxLen = 120) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`;
}

function renderDashboardFeedList(containerId, source) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = (Array.isArray(source?.items) ? source.items : []).slice(0, 3);
  if (!items.length) {
    const message = source?.error ? `불러오기 실패: ${escapeHtml(source.error)}` : '콘텐츠가 없습니다.';
    container.innerHTML = `<p class="dash-feed-empty">${message}</p>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const link = String(item?.link || source?.homeUrl || '').trim();
    const title = escapeHtml(item?.title || '(제목 없음)');
    const summary = escapeHtml(truncateText(item?.summary || '', 140));
    const published = escapeHtml(formatDashboardFeedDate(item?.publishedAt || ''));
    const thumbnail = String(item?.thumbnail || '').trim();
    const thumbHtml = thumbnail
      ? `<div class="dash-feed-thumb"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '';
    const metaHtml = published ? `<div class="dash-feed-meta">${published}</div>` : '';
    const summaryHtml = summary ? `<div class="dash-feed-summary">${summary}</div>` : '';
    return `
      <a class="dash-feed-item" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        ${thumbHtml}
        <div class="dash-feed-body">
          <div class="dash-feed-title">${title}</div>
          ${metaHtml}
          ${summaryHtml}
        </div>
      </a>
    `;
  }).join('');
}

function renderDashboardShortsList(containerId, source) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const items = (Array.isArray(source?.items) ? source.items : []).slice(0, 3);
  if (!items.length) {
    const message = source?.error ? `불러오기 실패: ${escapeHtml(source.error)}` : '콘텐츠가 없습니다.';
    container.innerHTML = `<p class="dash-feed-empty">${message}</p>`;
    syncDashboardBottomColumnHeights();
    return;
  }

  container.innerHTML = items.map((item) => {
    const link = String(item?.link || source?.homeUrl || '').trim();
    const title = escapeHtml(item?.title || '(제목 없음)');
    const summary = escapeHtml(truncateText(item?.summary || '', 96));
    const published = escapeHtml(formatDashboardFeedDate(item?.publishedAt || ''));
    const thumbnail = String(item?.thumbnail || '').trim();
    const thumbHtml = thumbnail
      ? `<div class="dash-shorts-thumb"><img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '<div class="dash-shorts-thumb dash-shorts-thumb-empty">▶</div>';
    const publishedHtml = published ? `<div class="dash-shorts-meta">${published}</div>` : '';
    const summaryHtml = summary ? `<div class="dash-shorts-summary">${summary}</div>` : '';
    return `
      <a class="dash-shorts-item" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        ${thumbHtml}
        <div class="dash-shorts-body">
          <div class="dash-shorts-title">${title}</div>
          ${publishedHtml}
          ${summaryHtml}
        </div>
      </a>
    `;
  }).join('');
  syncDashboardBottomColumnHeights();
}

function syncDashboardBottomColumnHeights() {
  const timeline = document.getElementById('activity-timeline');
  const shorts = document.getElementById('dash-smart-feed-youtube');
  if (!timeline || !shorts) return;

  if (window.innerWidth <= 1100) {
    timeline.style.maxHeight = '';
    shorts.style.maxHeight = '';
    return;
  }

  window.requestAnimationFrame(() => {
    const shortsItems = shorts.querySelectorAll('.dash-shorts-item');
    if (!shortsItems.length) {
      timeline.style.maxHeight = '';
      shorts.style.maxHeight = '';
      return;
    }

    const nextHeight = `${Math.max(320, Math.min(560, shorts.scrollHeight))}px`;
    timeline.style.maxHeight = nextHeight;
    shorts.style.maxHeight = nextHeight;
  });
}

window.addEventListener('resize', syncDashboardBottomColumnHeights);

async function loadDashboardExternalContent(options = {}) {
  const force = options?.force === true;
  const silent = options?.silent === true;
  const now = Date.now();
  if (!force && dashboardExternalContentLastLoadedAt > 0) {
    const elapsed = now - dashboardExternalContentLastLoadedAt;
    if (elapsed < DASHBOARD_EXTERNAL_CONTENT_REFRESH_MS) return;
  }

  try {
    const data = await fetchJson('/api/v1/dashboard/external-content?limit=6');
    const sourceMap = {};
    for (const source of (data?.sources || [])) {
      sourceMap[String(source?.key || '').trim()] = source;
    }
    renderDashboardFeedList('dash-feed-list-naver', sourceMap.naver || {});
    renderDashboardFeedList('dash-feed-list-wordpress', sourceMap.wordpress || {});
    renderDashboardFeedList('dash-feed-list-itmania', sourceMap.itmania || {});

    // Smart Feed (YouTube RSS -> Instagram Widget Fallback)
    const smart = sourceMap.smart || {};
    const smartTitle = document.getElementById('dash-smart-feed-title');
    const smartLink = document.getElementById('dash-smart-feed-link');
    const smartStatus = document.getElementById('dash-smart-feed-status');
    const smartYoutube = document.getElementById('dash-smart-feed-youtube');
    const smartInstagram = document.getElementById('dash-smart-feed-instagram');

    if (smartStatus) smartStatus.style.display = 'none';

    if (smart && Array.isArray(smart.items) && smart.items.length > 0) {
      // YouTube Win
      if (smartTitle) smartTitle.textContent = '유튜브 최신 영상';
      if (smartLink) smartLink.href = String(smart.homeUrl || 'https://www.youtube.com/channel/UC4Sl4m-ZV65knmWTl0UFYkw');
      if (smartLink) smartLink.textContent = '채널 이동';

      if (smartYoutube) {
        smartYoutube.style.display = 'flex';
        renderDashboardShortsList('dash-smart-feed-youtube', smart);
      }
      if (smartInstagram) smartInstagram.style.display = 'none';
    } else {
      // Instagram Fallback
      if (smartTitle) smartTitle.textContent = '인스타그램 릴스';
      if (smartLink) smartLink.href = 'https://www.instagram.com/amadejjs/reels/';
      if (smartLink) smartLink.textContent = '프로필 이동';

      if (smartYoutube) smartYoutube.style.display = 'none';
      if (smartInstagram) smartInstagram.style.display = 'block';
    }

    const setHomeLink = (id, source) => {
      const el = document.getElementById(id);
      if (!el) return;
      const next = String(source?.homeUrl || '').trim();
      if (next) el.href = next;
    };
    setHomeLink('dash-feed-home-naver', sourceMap.naver || {});
    setHomeLink('dash-feed-home-wordpress', sourceMap.wordpress || {});
    setHomeLink('dash-feed-home-itmania', sourceMap.itmania || {});
    // setHomeLink('dash-feed-home-instagram-reels', sourceMap.instagramReels || {});

    dashboardExternalContentLastLoadedAt = Date.now();
    syncDashboardBottomColumnHeights();
  } catch (e) {
    const errMsg = String(e?.message || '콘텐츠를 불러오지 못했습니다.');
    if (!silent) {
      console.warn('[Dashboard External Content]', errMsg);
    }
    const fallback = { error: errMsg };
    renderDashboardFeedList('dash-feed-list-naver', fallback);
    renderDashboardFeedList('dash-feed-list-wordpress', fallback);
    renderDashboardFeedList('dash-feed-list-noworry', fallback);
    // renderDashboardShortsList('dash-feed-list-instagram-reels', fallback);
  }
}

