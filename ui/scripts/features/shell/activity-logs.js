async function loadDashboardLogs() {
  const logsList = document.getElementById('logs-activity-timeline');
  if (!logsList) return;

  try {
    const response = await fetchJson('/api/v1/dashboard/logs?limit=200');
    const logs = Array.isArray(response?.logs) ? response.logs : [];
    if (!logs.length) {
      logsList.innerHTML = '<li class="timeline-empty" style="padding: 12px; color: #64748b; text-align: center; font-size: 14px;">최근 활동 내역이 없습니다.</li>';
      return;
    }

    logsList.innerHTML = '';
    logs.slice(0, 50).forEach((log) => {
      const message = String(log.message || '').trim();
      let icon = 'ℹ️';
      if (log.level === 'error') icon = '❌';
      else if (log.level === 'warn') icon = '⚠️';
      else if (message.includes('완료') || message.includes('성공')) icon = '✅';
      const startsWithEmoji = /^([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/.test(message);
      const finalMessage = (startsWithEmoji && (message.startsWith(icon) || icon === 'ℹ️')) ? message : `${icon} ${message}`;
      const item = document.createElement('li');
      item.style.cssText = 'padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#334155;display:flex;align-items:center';
      item.innerHTML = `
        <span style="color:#94a3b8;font-size:12px;margin-right:16px;white-space:nowrap;width:132px;flex:0 0 132px;font-variant-numeric:tabular-nums">${formatDashboardActivityTime(log.timestamp)}</span>
        <span style="flex:1;word-break:break-all" title="${message.replace(/"/g, '&quot;')}">${finalMessage}</span>
      `;
      logsList.appendChild(item);
    });
  } catch (error) {
    if (error.status === 503 || String(error.message).includes('fetch failed')) return;
    logsList.innerHTML = '<li class="timeline-empty" style="padding:12px;color:#ef4444;text-align:center;font-size:14px">로그를 불러오는데 실패했습니다.</li>';
  }
}
