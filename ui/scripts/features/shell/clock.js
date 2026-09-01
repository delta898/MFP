function initClockWidget() {
  const displays = Array.from(document.querySelectorAll('[data-clock-display]'));
  if (!displays.length) return;

  const styleOptions = [
    { value: 'random', label: '랜덤', icon: '✨' },
    { value: 'digital', label: '디지털', icon: '12:34' },
    { value: 'analog', label: '아날로그', icon: '◷' },
    { value: 'flip', label: '플립', icon: '▣' },
    { value: 'heart', label: '하트', icon: '♥' },
    { value: 'split', label: '분할', icon: 'H M S' },
    { value: 'neon', label: '네온', icon: '✦' },
    { value: 'soft', label: '소프트', icon: '●' }
  ];
  const styles = styleOptions.filter((option) => option.value !== 'random').map((option) => option.value);
  const timerStyleOptions = [
    { value: 'tomato', label: '토마토', icon: '🍅' },
    { value: 'ring', label: '포커스 링', icon: '◯' },
    { value: 'flip', label: '플립', icon: '▣' },
    { value: 'soft', label: '소프트', icon: '●' }
  ];
  const timerStyles = timerStyleOptions.map((option) => option.value);
  const randomStyle = () => styles[Math.floor(Math.random() * styles.length)] || 'digital';
  let preferredStyle = 'random';
  let displayMode = 'clock';
  let timerStyle = 'tomato';
  let completionSoundEnabled = true;
  let timerState = {
    phase: 'focus',
    status: 'idle',
    remainingMs: POMODORO_DURATIONS.focus,
    endsAt: null,
    completionId: null
  };
  try {
    const savedStyle = localStorage.getItem(CLOCK_STYLE_STORAGE_KEY);
    if (savedStyle === 'random' || styles.includes(savedStyle)) preferredStyle = savedStyle;
    const savedMode = localStorage.getItem(CLOCK_MODE_STORAGE_KEY);
    if (savedMode === 'clock' || savedMode === 'timer') displayMode = savedMode;
    const savedTimerStyle = localStorage.getItem(POMODORO_STYLE_STORAGE_KEY);
    if (timerStyles.includes(savedTimerStyle)) timerStyle = savedTimerStyle;
    completionSoundEnabled = localStorage.getItem(POMODORO_SOUND_STORAGE_KEY) !== 'off';
    const savedTimerState = JSON.parse(localStorage.getItem(POMODORO_STATE_STORAGE_KEY) || 'null');
    if (savedTimerState && POMODORO_DURATIONS[savedTimerState.phase]) {
      const status = ['idle', 'running', 'paused', 'completed'].includes(savedTimerState.status)
        ? savedTimerState.status
        : 'idle';
      timerState = {
        phase: savedTimerState.phase,
        status,
        remainingMs: Number.isFinite(Number(savedTimerState.remainingMs))
          ? Math.max(0, Number(savedTimerState.remainingMs))
          : POMODORO_DURATIONS[savedTimerState.phase],
        endsAt: status === 'running' && Number.isFinite(Number(savedTimerState.endsAt))
          ? Number(savedTimerState.endsAt)
          : null,
        completionId: typeof savedTimerState.completionId === 'string' ? savedTimerState.completionId : null
      };
    }
  } catch (_) {
    preferredStyle = 'random';
  }
  let currentStyle = preferredStyle === 'random' ? randomStyle() : preferredStyle;
  let previousValue = null;
  let timerCompletionPulseUntil = 0;
  let timerCompletionPhase = null;
  let lastHandledCompletionId = timerState.completionId;
  let completionAudioContext = null;
  const widgetUnits = [];

  function getCompletionAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!completionAudioContext) completionAudioContext = new AudioContextClass();
    if (completionAudioContext.state === 'suspended') {
      completionAudioContext.resume().catch(() => {});
    }
    return completionAudioContext;
  }

  function playCompletionSound(phase) {
    if (!completionSoundEnabled) return;
    try {
      const context = getCompletionAudioContext();
      if (!context) return;
      const scheduleNotes = () => {
        const notes = phase === 'focus'
          ? [{ frequency: 523.25, offset: 0 }, { frequency: 659.25, offset: 0.15 }, { frequency: 783.99, offset: 0.3 }]
          : [{ frequency: 440, offset: 0 }, { frequency: 523.25, offset: 0.2 }];
        const startAt = context.currentTime + 0.03;
        notes.forEach(({ frequency, offset }) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const noteStart = startAt + offset;
          const noteEnd = noteStart + (phase === 'focus' ? 0.38 : 0.45);
          oscillator.type = phase === 'focus' ? 'sine' : 'triangle';
          oscillator.frequency.setValueAtTime(frequency, noteStart);
          gain.gain.setValueAtTime(0.0001, noteStart);
          gain.gain.exponentialRampToValueAtTime(phase === 'focus' ? 0.16 : 0.1, noteStart + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(noteStart);
          oscillator.stop(noteEnd + 0.02);
        });
      };
      if (context.state === 'suspended') context.resume().then(scheduleNotes).catch(() => {});
      else scheduleNotes();
    } catch (_) {
      // 오디오가 지원되지 않거나 차단되어도 시각 완료 효과는 계속 제공합니다.
    }
  }

  function showFocusCelebration() {
    showAppCelebration({
      title: '집중 완료! 🎉',
      message: '잘 해냈어요. 5분 쉬어갈까요?'
    });
  }

  function handleTimerCompletion(phase, completionId) {
    if (!completionId || completionId === lastHandledCompletionId) return;
    lastHandledCompletionId = completionId;
    timerCompletionPhase = phase;
    timerCompletionPulseUntil = Date.now() + (phase === 'focus' ? 3000 : 2400);
    playCompletionSound(phase);
    if (phase === 'focus') showFocusCelebration();
  }

  function persistTimerState() {
    try {
      localStorage.setItem(POMODORO_STATE_STORAGE_KEY, JSON.stringify(timerState));
    } catch (_) {
      // 저장소를 사용할 수 없어도 현재 실행 중 타이머는 유지합니다.
    }
  }

  function getTimerSnapshot(nowMs = Date.now()) {
    let remainingMs = timerState.remainingMs;
    if (timerState.status === 'running') {
      remainingMs = Math.max(0, Number(timerState.endsAt) - nowMs);
      if (remainingMs <= 0) {
        const completionId = `${timerState.phase}:${timerState.endsAt}`;
        timerState = { ...timerState, status: 'completed', remainingMs: 0, endsAt: null, completionId };
        persistTimerState();
        handleTimerCompletion(timerState.phase, completionId);
      }
    }
    const durationMs = POMODORO_DURATIONS[timerState.phase];
    return {
      ...timerState,
      durationMs,
      remainingMs,
      progress: Math.min(1, Math.max(0, 1 - (remainingMs / durationMs)))
    };
  }

  function formatTimerValue(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return { minutes, seconds, text: `${minutes}:${seconds}` };
  }

  function saveDisplayMode(mode) {
    displayMode = mode;
    try { localStorage.setItem(CLOCK_MODE_STORAGE_KEY, mode); } catch (_) { /* noop */ }
  }

  function saveTimerStyle(style) {
    timerStyle = style;
    try { localStorage.setItem(POMODORO_STYLE_STORAGE_KEY, style); } catch (_) { /* noop */ }
  }

  function toggleCompletionSound() {
    completionSoundEnabled = !completionSoundEnabled;
    try {
      localStorage.setItem(POMODORO_SOUND_STORAGE_KEY, completionSoundEnabled ? 'on' : 'off');
    } catch (_) {
      // 저장하지 못해도 현재 실행 중 설정은 유지합니다.
    }
    if (completionSoundEnabled) getCompletionAudioContext();
    refreshStyleMenus();
  }

  function getSeasonMood(now) {
    const month = now.getMonth() + 1;
    const season = month >= 3 && month <= 5
      ? 'spring'
      : month >= 6 && month <= 8
        ? 'summer'
        : month >= 9 && month <= 11
          ? 'autumn'
          : 'winter';
    const seasonLabel = {
      1: '한겨울', 2: '늦겨울', 3: '초봄', 4: '봄', 5: '늦봄', 6: '초여름',
      7: '한여름', 8: '늦여름', 9: '초가을', 10: '가을', 11: '늦가을', 12: '초겨울'
    }[month];
    const hour = now.getHours();
    const message = hour >= 5 && hour < 11
      ? '좋은 아침이에요'
      : hour >= 11 && hour < 14
        ? '잠시 숨을 고르기 좋은 시간이에요'
        : hour >= 14 && hour < 18
          ? '좋은 오후예요'
          : hour >= 18 && hour < 22
            ? '오늘도 수고했어요'
            : '조용한 밤이에요';
    const dateText = new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(now);
    return { season, text: `${dateText} · ${seasonLabel}`, message };
  }

  function closeStyleMenus(exceptUnit = null) {
    widgetUnits.forEach(({ unit, button }) => {
      if (unit === exceptUnit) return;
      unit.classList.remove('clock-style-menu-open');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function savePreferredStyle(style) {
    preferredStyle = style;
    try {
      localStorage.setItem(CLOCK_STYLE_STORAGE_KEY, style);
    } catch (_) {
      // 저장소를 사용할 수 없어도 현재 실행 중 선택은 유지합니다.
    }
  }

  function refreshStyleMenus() {
    widgetUnits.forEach(({ menu }) => {
      menu.querySelectorAll('[data-clock-mode]').forEach((item) => {
        const isSelected = item.dataset.clockMode === displayMode;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-pressed', String(isSelected));
      });
      const clockStyles = menu.querySelector('[data-clock-style-section]');
      const timerStylesSection = menu.querySelector('[data-timer-style-section]');
      if (clockStyles) clockStyles.hidden = displayMode !== 'clock';
      if (timerStylesSection) timerStylesSection.hidden = displayMode !== 'timer';
      menu.querySelectorAll('[data-clock-style]').forEach((item) => {
        const isSelected = item.dataset.clockStyle === preferredStyle;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-checked', String(isSelected));
      });
      menu.querySelectorAll('[data-timer-style]').forEach((item) => {
        const isSelected = item.dataset.timerStyle === timerStyle;
        item.classList.toggle('active', isSelected);
        item.setAttribute('aria-checked', String(isSelected));
      });
      const soundToggle = menu.querySelector('[data-pomodoro-sound-toggle]');
      if (soundToggle) {
        soundToggle.classList.toggle('active', completionSoundEnabled);
        soundToggle.setAttribute('aria-pressed', String(completionSoundEnabled));
        const state = soundToggle.querySelector('[data-pomodoro-sound-state]');
        if (state) state.textContent = completionSoundEnabled ? '켜짐' : '꺼짐';
      }
    });
  }

  function refreshTimerControls(snapshot) {
    const phaseLabel = snapshot.phase === 'focus' ? '집중' : '휴식';
    const statusLabel = {
      idle: '동작을 선택하세요',
      running: `${phaseLabel} 중 · ${formatTimerValue(snapshot.remainingMs).text} 남음`,
      paused: `${phaseLabel} 일시정지 · ${formatTimerValue(snapshot.remainingMs).text} 남음`,
      completed: `${phaseLabel} 완료!`
    }[snapshot.status];
    widgetUnits.forEach(({ menu }) => {
      const status = menu.querySelector('[data-pomodoro-status]');
      if (status) status.textContent = statusLabel;
      const isActive = snapshot.status === 'running' || snapshot.status === 'paused';
      menu.querySelectorAll('[data-timer-action="start-focus"], [data-timer-action="start-break"]').forEach((item) => {
        item.disabled = isActive;
      });
      const pauseButton = menu.querySelector('[data-timer-action="toggle-pause"]');
      const stopButton = menu.querySelector('[data-timer-action="stop"]');
      const runningActions = menu.querySelector('.pomodoro-running-actions');
      if (runningActions) runningActions.hidden = !isActive;
      if (pauseButton) {
        pauseButton.hidden = !isActive;
        pauseButton.textContent = snapshot.status === 'paused' ? '▶ 계속' : 'Ⅱ 일시정지';
      }
      if (stopButton) stopButton.hidden = !isActive;
    });
  }

  function selectStyle(style) {
    if (style !== 'random' && !styles.includes(style)) return;
    savePreferredStyle(style);
    currentStyle = style === 'random' ? randomStyle() : style;
    previousValue = null;
    refreshStyleMenus();
    closeStyleMenus();
    displays.forEach((item) => {
      item.classList.remove('clock-display-pulse');
      void item.offsetWidth;
      item.classList.add('clock-display-pulse');
    });
    renderClock();
  }

  function selectDisplayMode(mode) {
    if (mode !== 'clock' && mode !== 'timer') return;
    saveDisplayMode(mode);
    previousValue = null;
    refreshStyleMenus();
    renderClock();
  }

  function selectTimerStyle(style) {
    if (!timerStyles.includes(style)) return;
    saveTimerStyle(style);
    refreshStyleMenus();
    renderClock();
  }

  function startTimer(phase) {
    const durationMs = POMODORO_DURATIONS[phase];
    if (!durationMs) return;
    timerState = {
      phase,
      status: 'running',
      remainingMs: durationMs,
      endsAt: Date.now() + durationMs,
      completionId: null
    };
    timerCompletionPhase = null;
    getCompletionAudioContext();
    persistTimerState();
    renderClock();
  }

  function toggleTimerPause() {
    const snapshot = getTimerSnapshot();
    if (snapshot.status === 'running') {
      timerState = { ...timerState, status: 'paused', remainingMs: snapshot.remainingMs, endsAt: null };
    } else if (snapshot.status === 'paused') {
      timerState = { ...timerState, status: 'running', endsAt: Date.now() + snapshot.remainingMs };
    } else {
      return;
    }
    persistTimerState();
    renderClock();
  }

  function stopTimer() {
    timerState = {
      phase: 'focus',
      status: 'idle',
      remainingMs: POMODORO_DURATIONS.focus,
      endsAt: null,
      completionId: null
    };
    timerCompletionPhase = null;
    persistTimerState();
    renderClock();
  }

  displays.forEach((display) => {
    const unit = document.createElement('div');
    unit.className = 'clock-widget-unit';
    const main = document.createElement('div');
    main.className = 'clock-widget-main';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clock-style-button';
    button.title = '시계 및 타이머 메뉴';
    button.setAttribute('aria-label', '시계 및 타이머 메뉴');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `
      <svg class="clock-menu-trigger-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
      </svg>
    `;
    const controlRail = document.createElement('div');
    controlRail.className = 'clock-control-rail';
    const inlineActions = document.createElement('div');
    inlineActions.className = 'pomodoro-inline-actions';
    inlineActions.setAttribute('aria-label', '타이머 제어');
    const meta = document.createElement('div');
    meta.className = 'clock-ambient-meta';
    meta.setAttribute('aria-live', 'polite');
    const metaCopy = document.createElement('span');
    metaCopy.className = 'clock-ambient-copy';
    const publishingStatus = document.createElement('button');
    publishingStatus.type = 'button';
    publishingStatus.className = 'clock-publishing-status';
    publishingStatus.dataset.globalPublishingStatus = '';
    publishingStatus.hidden = true;
    publishingStatus.innerHTML = '<span class="clock-publishing-status-indicator" aria-hidden="true"></span><span data-global-publishing-status-label></span>';
    meta.append(metaCopy, publishingStatus);
    const menu = document.createElement('div');
    menu.className = 'clock-style-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', '시계와 집중 타이머');
    menu.innerHTML = `
      <div class="clock-mode-switch" aria-label="메인 표시 모드">
        <button type="button" data-clock-mode="clock" aria-pressed="false">시계</button>
        <button type="button" data-clock-mode="timer" aria-pressed="false">타이머</button>
      </div>
      <div class="clock-style-section" data-clock-style-section>
        <span class="clock-menu-section-label">시계 스타일</span>
        <div class="clock-style-grid">
          ${styleOptions.map((option) => `
            <button type="button" class="clock-style-option" role="radio" aria-checked="false" data-clock-style="${option.value}">
              <span class="clock-style-option-icon">${option.icon}</span>
              <span>${option.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="clock-style-section" data-timer-style-section hidden>
        <span class="clock-menu-section-label">타이머 스타일</span>
        <div class="clock-style-grid">
          ${timerStyleOptions.map((option) => `
            <button type="button" class="clock-style-option" role="radio" aria-checked="false" data-timer-style="${option.value}">
              <span class="clock-style-option-icon">${option.icon}</span>
              <span>${option.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="pomodoro-menu-control">
        <div class="pomodoro-menu-heading">
          <span class="clock-menu-section-label">집중 타이머</span>
          <span data-pomodoro-status></span>
        </div>
        <div class="pomodoro-preset-actions">
          <button type="button" data-timer-action="start-focus">🍅 25분 집중</button>
          <button type="button" data-timer-action="start-break">☕ 5분 휴식</button>
        </div>
        <div class="pomodoro-running-actions">
          <button type="button" data-timer-action="toggle-pause" hidden>Ⅱ 일시정지</button>
          <button type="button" data-timer-action="stop" hidden>종료</button>
        </div>
        <button type="button" class="pomodoro-sound-toggle" data-pomodoro-sound-toggle aria-pressed="true">
          <span>🔔 완료 알림음</span>
          <span data-pomodoro-sound-state>켜짐</span>
        </button>
      </div>
    `;

    const serverControl = display.closest('.dash-clock-widget')?.querySelector('#server-control');
    if (serverControl) {
      const serverControlLabel = document.createElement('span');
      serverControlLabel.className = 'clock-server-control-label';
      serverControlLabel.textContent = '앱 제어';
      serverControl.classList.add('clock-server-control');
      serverControl.setAttribute('aria-label', '앱 제어');
      serverControl.prepend(serverControlLabel);
      menu.appendChild(serverControl);
      serverControl.hidden = false;
    }

    display.parentNode.insertBefore(unit, display);
    unit.appendChild(main);
    main.appendChild(display);
    main.appendChild(controlRail);
    controlRail.appendChild(button);
    controlRail.appendChild(inlineActions);
    main.appendChild(meta);
    unit.appendChild(menu);
    widgetUnits.push({ unit, button, inlineActions, metaCopy, menu });

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !unit.classList.contains('clock-style-menu-open');
      closeStyleMenus();
      unit.classList.toggle('clock-style-menu-open', willOpen);
      button.setAttribute('aria-expanded', String(willOpen));
    });
    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      const modeOption = event.target.closest('button[data-clock-mode]');
      const clockOption = event.target.closest('[data-clock-style]');
      const timerOption = event.target.closest('[data-timer-style]');
      const timerAction = event.target.closest('[data-timer-action]');
      const soundToggle = event.target.closest('[data-pomodoro-sound-toggle]');
      if (modeOption) selectDisplayMode(modeOption.dataset.clockMode);
      else if (clockOption) selectStyle(clockOption.dataset.clockStyle);
      else if (timerOption) selectTimerStyle(timerOption.dataset.timerStyle);
      else if (soundToggle) toggleCompletionSound();
      else if (timerAction && !timerAction.disabled) {
        const action = timerAction.dataset.timerAction;
        if (action === 'start-focus') startTimer('focus');
        else if (action === 'start-break') startTimer('break');
        else if (action === 'toggle-pause') toggleTimerPause();
        else if (action === 'stop') stopTimer();
      }
    });
    inlineActions.addEventListener('click', (event) => {
      const timerAction = event.target.closest('[data-timer-inline-action]');
      if (!timerAction) return;
      event.stopPropagation();
      const action = timerAction.dataset.timerInlineAction;
      if (action === 'start') startTimer(timerAction.dataset.timerPhase || timerState.phase);
      else if (action === 'toggle-pause') toggleTimerPause();
      else if (action === 'stop') stopTimer();
    });
  });

  displays.forEach((display) => {
    display.addEventListener('click', (event) => {
      if (displayMode === 'timer') {
        const nextIndex = (timerStyles.indexOf(timerStyle) + 1) % timerStyles.length;
        selectTimerStyle(timerStyles[nextIndex]);
      } else {
        const nextIndex = (styles.indexOf(currentStyle) + 1) % styles.length;
        selectStyle(styles[nextIndex]);
      }
    });
  });

  document.addEventListener('click', () => closeStyleMenus());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeStyleMenus();
  });

  function renderTimerFace(snapshot) {
    const value = formatTimerValue(snapshot.remainingMs);
    const phaseLabel = snapshot.phase === 'focus' ? '25분 집중' : '5분 휴식';
    const phaseIcon = snapshot.phase === 'focus' ? '🍅' : '☕';
    const faceLabel = snapshot.status === 'completed' ? `✓ ${phaseLabel} 완료` : `${phaseIcon} ${phaseLabel}`;
    const progressDegrees = Math.round(snapshot.progress * 360);
    const progressPercent = Math.round(snapshot.progress * 100);
    if (timerStyle === 'ring') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-ring" style="--pomodoro-progress:${progressDegrees}deg">
            <div class="pomodoro-ring-center">
              <span class="pomodoro-face-label">${faceLabel}</span>
              <span class="pomodoro-face-time">${value.text}</span>
            </div>
          </div>
        </div>
      `;
    }
    if (timerStyle === 'flip') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-flip">
            <span class="pomodoro-face-label">${faceLabel}</span>
            <div class="pomodoro-flip-values">
              <span>${value.minutes}</span><b>:</b><span>${value.seconds}</span>
            </div>
            <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
          </div>
        </div>
      `;
    }
    if (timerStyle === 'soft') {
      return `
        <div class="pomodoro-face-shell">
          <div class="pomodoro-face pomodoro-face-soft">
            <span class="pomodoro-soft-orb">${phaseIcon}</span>
            <div>
              <span class="pomodoro-face-label">${faceLabel}</span>
              <span class="pomodoro-face-time">${value.text}</span>
            </div>
            <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
          </div>
        </div>
      `;
    }
    return `
      <div class="pomodoro-face-shell">
        <div class="pomodoro-face pomodoro-face-tomato">
          <span class="pomodoro-tomato-icon">${phaseIcon}</span>
          <div>
            <span class="pomodoro-face-label">${faceLabel}</span>
            <span class="pomodoro-face-time">${value.text}</span>
          </div>
          <div class="pomodoro-progress-track"><i style="width:${progressPercent}%"></i></div>
        </div>
      </div>
    `;
  }

  function renderInlineTimerControls(snapshot) {
    if (snapshot.status === 'running') {
      return `<button type="button" data-timer-inline-action="toggle-pause" title="일시정지" aria-label="일시정지">Ⅱ</button><button type="button" data-timer-inline-action="stop" title="종료" aria-label="타이머 종료">■</button>`;
    }
    if (snapshot.status === 'paused') {
      return `<button type="button" data-timer-inline-action="toggle-pause" title="계속" aria-label="계속">▶</button><button type="button" data-timer-inline-action="stop" title="종료" aria-label="타이머 종료">■</button>`;
    }
    if (snapshot.status === 'completed') {
      const nextPhase = snapshot.phase === 'focus' ? 'break' : 'focus';
      const nextLabel = snapshot.phase === 'focus' ? '5분 휴식 시작' : '25분 집중 시작';
      const nextIcon = snapshot.phase === 'focus' ? '☕' : '🍅';
      return `<button type="button" class="pomodoro-inline-next" data-timer-inline-action="start" data-timer-phase="${nextPhase}" title="${nextLabel}" aria-label="${nextLabel}">${nextIcon}</button>`;
    }
    const startLabel = snapshot.phase === 'focus' ? '25분 집중 시작' : '5분 휴식 시작';
    return `<button type="button" class="pomodoro-inline-start" data-timer-inline-action="start" data-timer-phase="${snapshot.phase}" title="${startLabel}" aria-label="${startLabel}">▶</button>`;
  }

  function renderClock() {
    const style = currentStyle;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const hourChanged = previousValue && previousValue.h !== h;
    const minuteChanged = previousValue && previousValue.m !== m;
    const secondChanged = previousValue && previousValue.s !== s;
    const mood = getSeasonMood(now);
    const timerSnapshot = getTimerSnapshot(now.getTime());
    const timerValue = formatTimerValue(timerSnapshot.remainingMs);
    const timerPhaseLabel = timerSnapshot.phase === 'focus' ? '집중' : '휴식';
    const timerPhaseIcon = timerSnapshot.phase === 'focus' ? '🍅' : '☕';
    displays.forEach((display) => {
      display.title = displayMode === 'timer'
        ? '클릭하여 타이머 스타일 변경'
        : '클릭하여 시계 스타일 변경';
    });

    widgetUnits.forEach(({ unit, button, inlineActions, metaCopy }) => {
      const completionEffectActive = timerCompletionPulseUntil > now.getTime();
      unit.dataset.clockSeason = mood.season;
      unit.dataset.clockDisplayMode = displayMode;
      unit.dataset.pomodoroPhase = timerSnapshot.phase;
      unit.classList.toggle('pomodoro-complete', completionEffectActive && timerCompletionPhase === 'focus');
      unit.classList.toggle('pomodoro-break-complete', completionEffectActive && timerCompletionPhase === 'break');
      button.title = '시계 및 타이머 메뉴';
      button.setAttribute('aria-label', button.title);
      const inlineControlsHtml = displayMode === 'timer' ? renderInlineTimerControls(timerSnapshot) : '';
      if (inlineActions.dataset.controlsHtml !== inlineControlsHtml) {
        inlineActions.dataset.controlsHtml = inlineControlsHtml;
        inlineActions.innerHTML = inlineControlsHtml;
      }
      let metaHtml = '';
      if (displayMode === 'timer') {
        metaHtml = `<span class="clock-season-dot" aria-hidden="true"></span><span>현재 시각 ${h}:${m}:${s}</span><span class="clock-ambient-message">${mood.text}</span>`;
      } else {
        const timerStatus = timerSnapshot.status === 'paused'
          ? ' · 일시정지'
          : timerSnapshot.status === 'completed'
            ? ' 완료!'
            : '';
        metaHtml = `<span class="clock-season-dot" aria-hidden="true"></span><span>${mood.text}</span><span class="clock-ambient-message">${mood.message}</span><span class="clock-sub-timer ${timerSnapshot.status}">${timerPhaseIcon} ${timerPhaseLabel} ${timerSnapshot.status === 'completed' ? '' : timerValue.text}${timerStatus}</span>`;
      }
      const moodKey = `${displayMode}|${mood.season}|${metaHtml}`;
      if (metaCopy.dataset.clockMoodKey !== moodKey) {
        metaCopy.dataset.clockMoodKey = moodKey;
        metaCopy.innerHTML = metaHtml;
      }
    });
    refreshTimerControls(timerSnapshot);

    if (displayMode === 'timer') {
      const html = renderTimerFace(timerSnapshot);
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'digital') {
      const html = `<div style="font-size: 32px; font-weight: bold; font-family: monospace; letter-spacing: 2px; color: #0f172a; line-height: 1;">
        ${h}<span style="opacity:0.5;">:</span>${m}<span style="opacity:0.5;">:</span>${s}
      </div>`;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'analog') {
      const secDeg = now.getSeconds() * 6;
      const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
      const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;

      let ticksHtml = '';
      for (let i = 0; i < 12; i++) {
        ticksHtml += `<div style="position: absolute; top: 0; left: 50%; width: 2px; height: ${i % 3 === 0 ? '8px' : '4px'}; background: ${i % 3 === 0 ? '#334155' : '#94a3b8'}; transform-origin: center 40px; transform: translateX(-50%) rotate(${i * 30}deg);"></div>`;
      }

      const html = `
        <div style="position: relative; width: 88px; height: 88px; border-radius: 50%; border: 4px solid #334155; box-sizing: border-box; background: #f8fafc; margin-right: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          ${ticksHtml}
          <!-- center dot -->
          <div style="position: absolute; top: 50%; left: 50%; width: 8px; height: 8px; background: #0f172a; border-radius: 50%; transform: translate(-50%, -50%); z-index: 10;"></div>
          <!-- Hour Hand -->
          <div style="position: absolute; top: 25%; bottom: 50%; left: 50%; width: 5px; background: #0f172a; transform-origin: bottom center; transform: translateX(-50%) rotate(${hourDeg}deg); border-radius: 3px; z-index: 7;"></div>
          <!-- Min Hand -->
          <div style="position: absolute; top: 12%; bottom: 50%; left: 50%; width: 3px; background: #334155; transform-origin: bottom center; transform: translateX(-50%) rotate(${minDeg}deg); border-radius: 2px; z-index: 8;"></div>
          <!-- Sec Hand -->
          <div style="position: absolute; top: 5%; bottom: 40%; left: 50%; width: 2px; background: #ef4444; transform-origin: 75% 75%; transform: translateX(-50%) rotate(${secDeg}deg); z-index: 9; box-shadow: 0 1px 2px rgba(0,0,0,0.2);"></div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'flip') {
      const bStyle = "display:inline-block; background:#1e293b; color:#fff; padding:6px 10px; border-radius:6px; font-size:28px; font-weight:bold; font-family:monospace; margin:0 3px; box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1); line-height: 1;";
      const html = `<div style="display:flex; align-items:center;">
        <span style="${bStyle}">${h}</span>
        <span style="font-size:24px; font-weight:bold; color:#334155; margin:0 2px;">:</span>
        <span style="${bStyle}">${m}</span>
        <span style="font-size:24px; font-weight:bold; color:#334155; margin:0 2px;">:</span>
        <span style="${bStyle}">${s}</span>
      </div>`;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'heart') {
      const secDeg = now.getSeconds() * 6;
      const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
      const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
      const html = `
        <div style="position:relative; width:112px; height:102px; margin-right:6px;">
          <div style="position:absolute; inset:0; clip-path:polygon(50% 100%, 8% 63%, 8% 26%, 26% 26%, 26% 8%, 40% 8%, 40% 0, 60% 0, 60% 8%, 74% 8%, 74% 26%, 92% 26%, 92% 63%); background:linear-gradient(180deg,#fb923c 0%,#f97316 42%,#f43f5e 100%); border:4px solid rgba(255,255,255,0.72); box-shadow:0 12px 28px rgba(244,63,94,0.24), inset 0 1px 0 rgba(255,255,255,0.4);"></div>
          <div style="position:absolute; inset:10px 12px 14px; clip-path:polygon(50% 100%, 8% 63%, 8% 26%, 26% 26%, 26% 8%, 40% 8%, 40% 0, 60% 0, 60% 8%, 74% 8%, 74% 26%, 92% 26%, 92% 63%); background:linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02));"></div>
          <div style="position:absolute; top:50%; left:50%; width:10px; height:10px; background:#334155; border:2px solid rgba(255,255,255,0.88); border-radius:999px; transform:translate(-50%, -50%); z-index:10; box-shadow:0 2px 4px rgba(15,23,42,0.18);"></div>
          <div style="position:absolute; top:26%; bottom:50%; left:50%; width:5px; background:rgba(255,255,255,0.92); transform-origin:bottom center; transform:translateX(-50%) rotate(${hourDeg}deg); border-radius:999px; z-index:7;"></div>
          <div style="position:absolute; top:16%; bottom:50%; left:50%; width:3px; background:rgba(241,245,249,0.95); transform-origin:bottom center; transform:translateX(-50%) rotate(${minDeg}deg); border-radius:999px; z-index:8;"></div>
          <div style="position:absolute; top:12%; bottom:46%; left:50%; width:2px; background:#ffffff; transform-origin:bottom center; transform:translateX(-50%) rotate(${secDeg}deg); z-index:9; border-radius:999px; opacity:0.92;"></div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'split') {
      const html = `
        <div class="clock-split">
          <div class="clock-split-block${hourChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Hour</span>
            <span class="clock-split-value">${h}</span>
          </div>
          <div class="clock-split-block${minuteChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Min</span>
            <span class="clock-split-value">${m}</span>
          </div>
          <div class="clock-split-block clock-split-block-accent${secondChanged ? ' clock-split-flip' : ''}">
            <span class="clock-split-label">Sec</span>
            <span class="clock-split-value">${s}</span>
          </div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'neon') {
      const html = `
        <div style="display:inline-flex; align-items:center; gap:10px; padding:10px 16px; border-radius:18px; background:linear-gradient(135deg,#020617,#111827 55%,#1e1b4b); box-shadow:0 0 0 1px rgba(34,211,238,0.18), 0 12px 28px rgba(15,23,42,0.32);">
          <span style="font-size:30px; font-weight:800; font-family:monospace; letter-spacing:0.12em; color:#67e8f9; text-shadow:0 0 8px rgba(103,232,249,0.55); font-variant-numeric:tabular-nums;">${h}:${m}</span>
          <span style="font-size:16px; font-weight:800; color:#c4b5fd; text-shadow:0 0 8px rgba(196,181,253,0.45); min-width:24px; text-align:center; font-variant-numeric:tabular-nums;">${s}</span>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'soft') {
      const html = `
        <div style="display:inline-flex; align-items:center; gap:12px; padding:10px 16px; border-radius:20px; background:linear-gradient(135deg,#fdf2f8,#eef2ff); border:1px solid rgba(216,180,254,0.55); box-shadow:0 10px 24px rgba(148,163,184,0.14);">
          <span style="display:inline-flex; width:10px; height:10px; border-radius:999px; background:#22c55e; box-shadow:0 0 0 5px rgba(34,197,94,0.12);"></span>
          <div style="display:flex; flex-direction:column; gap:2px; line-height:1;">
            <span style="font-size:28px; font-weight:800; color:#1f2937; font-variant-numeric:tabular-nums;">${h}:${m}:${s}</span>
          </div>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    }

    previousValue = { h, m, s };
  }

  if (clockInterval) clearInterval(clockInterval);
  refreshStyleMenus();
  renderClock();
  clockInterval = setInterval(renderClock, 1000);
}
