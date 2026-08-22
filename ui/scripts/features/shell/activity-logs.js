async function loadDashboardLogs() {
  const dashList = document.getElementById('activity-timeline');
  const logsList = document.getElementById('logs-activity-timeline');
  if (!dashList && !logsList) return;

  try {
    const [activityRes, logsRes] = await Promise.all([
      dashList ? fetchJson('/api/v1/dashboard/activities?limit=60') : Promise.resolve(null),
      logsList ? fetchJson('/api/v1/dashboard/logs?limit=200') : Promise.resolve(null)
    ]);
    const activities = Array.isArray(activityRes?.activities) ? activityRes.activities : [];
    const logs = Array.isArray(logsRes?.logs) ? logsRes.logs : [];

    const renderActivities = (list, items) => {
      if (!list) return;
      if (!items || items.length === 0) {
        list.innerHTML = '<li class="timeline-empty" style="padding: 12px; color: #64748b; text-align: center; font-size: 14px;">최근 활동 내역이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      items.forEach(activity => {
        const title = String(activity.title || '').trim() || '활동';
        const detail = String(activity.detail || '').trim();
        const level = String(activity.level || 'info').trim().toLowerCase();
        const icon = level === 'error' ? '❌' : (level === 'warn' ? '⚠️' : '✅');
        const timestamp = String(activity.timestamp || '').trim();
        const timeLabel = formatDashboardActivityTime(timestamp);
        const isDashboard = list.id === 'activity-timeline';
        const timeWidth = isDashboard ? '118px' : '132px';
        const timeFontSize = isDashboard ? '11px' : '12px';
        const timeMarginRight = isDashboard ? '12px' : '16px';

        const li = document.createElement('li');
        li.style.padding = '10px 12px';
        li.style.borderBottom = '1px solid #f1f5f9';
        li.style.fontSize = '14px';
        li.style.color = '#334155';
        li.style.display = 'flex';
        li.style.alignItems = 'baseline';
        li.innerHTML = `
          <span style="color:#94a3b8; font-size:${timeFontSize}; margin-right:${timeMarginRight}; white-space: nowrap; width:${timeWidth}; flex:0 0 ${timeWidth}; font-variant-numeric: tabular-nums; line-height:1.25;">${timeLabel}</span>
          <div style="display:flex; flex-direction:column; gap:2px; min-width:0; flex:1;">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${title.replace(/"/g, '&quot;')}">${icon} ${title}</span>
            ${detail ? `<span style="color:#64748b; font-size:12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${detail.replace(/"/g, '&quot;')}">${detail}</span>` : ''}
          </div>
        `;
        list.appendChild(li);
      });
    };

    const renderLogs = (list, items) => {
      if (!list) return;
      if (!items || items.length === 0) {
        list.innerHTML = '<li class="timeline-empty" style="padding: 12px; color: #64748b; text-align: center; font-size: 14px;">최근 활동 내역이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      items.forEach(log => {
        const msg = String(log.message || '').trim();
        const li = document.createElement('li');
        li.style.padding = '10px 12px';
        li.style.borderBottom = '1px solid #f1f5f9';
        li.style.fontSize = '14px';
        li.style.color = '#334155';
        li.style.display = 'flex';
        li.style.alignItems = 'center';

        let icon = 'ℹ️';
        if (log.level === 'error') icon = '❌';
        else if (log.level === 'warn') icon = '⚠️';
        else if (msg.includes('완료') || msg.includes('성공')) icon = '✅';

        const startsWithEmoji = /^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/.test(msg);
        const finalMessage = (startsWithEmoji && (msg.startsWith(icon) || icon === 'ℹ️')) ? msg : `${icon} ${msg}`;

        // 대시보드에서는 말줄임표 처리 (line-break 방지)
        const isDashboard = list.id === 'activity-timeline';
        const msgStyle = isDashboard
          ? 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;'
          : 'flex: 1; word-break: break-all;';
        const timeWidth = isDashboard ? '118px' : '132px';
        const timeFontSize = isDashboard ? '11px' : '12px';
        const timeMarginRight = isDashboard ? '12px' : '16px';

        li.innerHTML = `
          <span style="color:#94a3b8; font-size:${timeFontSize}; margin-right:${timeMarginRight}; white-space: nowrap; width:${timeWidth}; flex:0 0 ${timeWidth}; font-variant-numeric: tabular-nums;">${formatDashboardActivityTime(log.timestamp)}</span>
          <span style="${msgStyle}" title="${msg.replace(/"/g, '&quot;')}">${finalMessage}</span>
        `;
        list.appendChild(li);
      });
    };

    renderActivities(dashList, activities.slice(0, 60));
    renderLogs(logsList, logs.slice(0, 50));
    syncDashboardBottomColumnHeights();
  } catch (err) {
    if (err.status === 503 || String(err.message).includes('fetch failed')) return;
    const failHtml = '<li class="timeline-empty" style="padding: 12px; color: #ef4444; text-align: center; font-size: 14px;">로그를 불러오는데 실패했습니다.</li>';
    if (dashList) dashList.innerHTML = failHtml;
    if (logsList) logsList.innerHTML = failHtml;
  }
}

