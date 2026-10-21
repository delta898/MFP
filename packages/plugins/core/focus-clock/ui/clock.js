let focusClockSessionPreferences = {
  preferredStyle: 'random',
  displayMode: 'clock',
  timerStyle: 'tomato',
  completionSoundEnabled: true
};
let focusClockRenderInterval = null;
const FOCUS_CLOCK_STYLE_ROTATION_MS = 10 * 60 * 1000;
const CLOCK_MOOD_PERIODS = [
  { start: 0, end: 4, messages: ['아직 밤의 여백이 남아 있어요', '천천히 가도 괜찮은 시간이에요', '오늘의 마지막 페이지를 넘기는 중', '고요한 틈에 숨 한번 크게 쉬어요'] },
  { start: 4, end: 6, messages: ['세상이 깨어나기 전의 작은 보너스 시간', '새벽 공기처럼 가볍게 시작해요', '오늘 첫 장면을 준비하는 중이에요', '조금씩 밝아오는 중, 우리도 천천히'] },
  { start: 6, end: 9, messages: ['좋은 아침! 오늘의 첫 미션은 뭘까요?', '커피 한 모금, 가능성은 한 컵 가득', '아침의 나, 생각보다 꽤 유능해요', '오늘도 작은 시작이 큰일을 만들어요'] },
  { start: 9, end: 11, messages: ['오전 집중력, 지금 꽤 괜찮은데요?', '하나씩 끝내면 어느새 많이 왔어요', '잠깐 어깨 펴고 다시 가볍게 출발!', '오늘의 흐름을 내가 만들어가는 중'] },
  { start: 11, end: 13, messages: ['잠시 숨을 고르기 좋은 시간이에요', '점심 전 한 걸음, 충분히 잘하고 있어요', '뇌에게도 간식 같은 쉼표를 주세요', '물 한 잔 챙기고 기분 전환 어때요?'] },
  { start: 13, end: 16, messages: ['오후 1막 시작! 천천히 시동 걸어요', '식곤증도 계획의 일부인 척하네요', '작은 일 하나부터 리듬을 찾아봐요', '오후의 나에게 너무 많은 걸 맡기진 말기'] },
  { start: 16, end: 19, messages: ['오늘 할 일, 슬슬 결승선이 보여요', '집중력 충전이 필요하면 잠깐 쉬어가요', '마지막 한두 걸음도 꽤 큰 전진이에요', '퇴근 전의 나에게 고마워질 순간을 만들어요'] },
  { start: 19, end: 22, messages: ['오늘도 수고했어요, 이제 나를 챙길 차례', '저녁은 마음의 배터리도 채우는 시간', '오늘의 작은 승리 하나만 떠올려봐요', '해야 할 일보다 해낸 일을 세어봐요'] },
  { start: 22, end: 24, messages: ['하루를 잘 접어두고 쉬어가요', '내일의 나도 꽤 괜찮을 거예요', '화면은 잠시 쉬고 눈에게도 휴가를', '오늘의 마지막 알림: 이제 편히 쉬어요'] }
];

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
  const automaticStyle = (timestamp = Date.now()) => {
    const rotation = Math.floor(timestamp / FOCUS_CLOCK_STYLE_ROTATION_MS);
    return styles[((rotation % styles.length) + styles.length) % styles.length] || 'digital';
  };
  let preferredStyle = focusClockSessionPreferences.preferredStyle;
  let displayMode = focusClockSessionPreferences.displayMode;
  let timerStyle = focusClockSessionPreferences.timerStyle;
  let completionSoundEnabled = focusClockSessionPreferences.completionSoundEnabled;
  let timerState = {
    phase: 'focus',
    status: 'idle',
    remainingMs: 25 * 60 * 1000,
    endsAt: null,
    completionId: null
  };
  let timerDurationMs = 25 * 60 * 1000;
  let currentStyle = preferredStyle === 'random' ? automaticStyle() : preferredStyle;
  let previousValue = null;
  let timerCompletionPulseUntil = 0;
  let timerCompletionPhase = null;
  let lastHandledCompletionId = timerState.completionId;
  let completionAudioContext = null;
  const widgetUnits = [];

  const widgetResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver((entries) => {
      entries.forEach(({ target }) => {
        window.parent.postMessage({
          type: 'widget:resize',
          height: Math.ceil(target.getBoundingClientRect().height) + 4
        }, '*');
      });
    })
    : null;

  function reportWidgetOverlayState(isOpen) {
    const request = { type: 'widget:overlay-state', open: isOpen };
    if (isOpen) {
      const menu = widgetUnits.find(({ unit }) => unit.classList.contains('clock-style-menu-open'))?.menu;
      if (menu) {
        const menuHeight = Math.min(menu.scrollHeight, 440);
        request.height = Math.ceil(menu.getBoundingClientRect().top + menuHeight + 12);
      }
    }
    window.parent.postMessage(request, '*');
  }

  const overlayResizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      if (widgetUnits.some(({ unit }) => unit.classList.contains('clock-style-menu-open'))) {
        reportWidgetOverlayState(true);
      }
    })
    : null;

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
    let notice = document.querySelector('.focus-clock-completion');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'focus-clock-completion';
      notice.setAttribute('role', 'status');
      document.body.appendChild(notice);
    }
    notice.textContent = '집중 완료! 잘 해냈어요. 5분 쉬어갈까요? 🎉';
    notice.hidden = false;
    window.clearTimeout(notice.hideTimer);
    notice.hideTimer = window.setTimeout(() => { notice.hidden = true; }, 3600);
  }

  function handleTimerCompletion(phase, completionId) {
    if (!completionId || completionId === lastHandledCompletionId) return;
    lastHandledCompletionId = completionId;
    timerCompletionPhase = phase;
    timerCompletionPulseUntil = Date.now() + (phase === 'focus' ? 3000 : 2400);
    playCompletionSound(phase);
    if (phase === 'focus') showFocusCelebration();
  }

  function getTimerSnapshot(nowMs = Date.now()) {
    let remainingMs = timerState.remainingMs;
    if (timerState.status === 'running') {
      remainingMs = Math.max(0, Number(timerState.endsAt) - nowMs);
      if (remainingMs <= 0) {
        const completionId = `${timerState.phase}:${timerState.endsAt}`;
        timerState = { ...timerState, status: 'completed', remainingMs: 0, endsAt: null, completionId };
        handleTimerCompletion(timerState.phase, completionId);
        remainingMs = 0;
      }
    }
    const durationMs = timerDurationMs;
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
    focusClockSessionPreferences.displayMode = mode;
  }

  function saveTimerStyle(style) {
    timerStyle = style;
    focusClockSessionPreferences.timerStyle = style;
  }

  function toggleCompletionSound() {
    completionSoundEnabled = !completionSoundEnabled;
    focusClockSessionPreferences.completionSoundEnabled = completionSoundEnabled;
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
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const period = CLOCK_MOOD_PERIODS.find(({ start, end }) => minuteOfDay >= start * 60 && minuteOfDay < end * 60)
      || CLOCK_MOOD_PERIODS[0];
    const periodStart = period.start * 60;
    const tenMinuteSlot = Math.floor((minuteOfDay - periodStart) / 10);
    const message = period.messages[tenMinuteSlot % period.messages.length];
    const dateText = new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(now);
    return { season, text: `${dateText} · ${seasonLabel}`, message };
  }

  function closeStyleMenus(exceptUnit = null) {
    let closedMenu = false;
    widgetUnits.forEach(({ unit, button, menu }) => {
      if (unit === exceptUnit) return;
      closedMenu = closedMenu || unit.classList.contains('clock-style-menu-open');
      unit.classList.remove('clock-style-menu-open');
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    });
    if (closedMenu) reportWidgetOverlayState(false);
  }

  function savePreferredStyle(style) {
    preferredStyle = style;
    focusClockSessionPreferences.preferredStyle = style;
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
    currentStyle = style === 'random' ? automaticStyle() : style;
    previousValue = null;
    refreshStyleMenus();
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
    const durationMs = phase === 'focus' ? 25 * 60 * 1000 : 5 * 60 * 1000;
    timerState = { phase, status: 'running', remainingMs: durationMs, endsAt: Date.now() + durationMs, completionId: null };
    timerDurationMs = durationMs;
    timerCompletionPhase = null;
    getCompletionAudioContext();
    renderClock();
  }

  function toggleTimerPause() {
    const snapshot = getTimerSnapshot();
    if (snapshot.status === 'running') {
      timerState = { ...timerState, status: 'paused', remainingMs: snapshot.remainingMs, endsAt: null };
    } else if (snapshot.status === 'paused') {
      timerState = { ...timerState, status: 'running', endsAt: Date.now() + snapshot.remainingMs };
    }
    renderClock();
  }

  function stopTimer() {
    timerState = { phase: 'focus', status: 'idle', remainingMs: 25 * 60 * 1000, endsAt: null, completionId: null };
    timerDurationMs = 25 * 60 * 1000;
    timerCompletionPhase = null;
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
    meta.append(metaCopy);
    const menu = document.createElement('div');
    menu.className = 'clock-style-menu';
    menu.hidden = true;
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

    display.parentNode.insertBefore(unit, display);
    unit.appendChild(main);
    main.appendChild(display);
    main.appendChild(controlRail);
    controlRail.appendChild(button);
    controlRail.appendChild(inlineActions);
    main.appendChild(meta);
    unit.appendChild(menu);
    widgetUnits.push({ unit, button, inlineActions, metaCopy, menu });
    overlayResizeObserver?.observe(menu);
    widgetResizeObserver?.observe(unit);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !unit.classList.contains('clock-style-menu-open');
      closeStyleMenus();
      unit.classList.toggle('clock-style-menu-open', willOpen);
      menu.hidden = !willOpen;
      button.setAttribute('aria-expanded', String(willOpen));
      reportWidgetOverlayState(willOpen);
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
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.type === 'widget:host-activity') {
      const isSettling = event.data.state === 'settling';
      const isActive = event.data.state === 'running' || isSettling;
      const isFinalizing = event.data.state === 'running' && ['verifying', 'finalizing'].includes(event.data.stage);
      widgetUnits.forEach(({ unit }) => {
        unit.classList.toggle('is-agent-active', isActive);
        unit.classList.toggle('is-agent-finalizing', isFinalizing);
        unit.classList.toggle('is-agent-settling', isSettling);
        if (isActive && event.data.activity) unit.dataset.agentActivity = event.data.activity;
        else delete unit.dataset.agentActivity;
      });
      return;
    }
    if (event.data?.type === 'widget:host-close-overlay') closeStyleMenus();
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
    if (preferredStyle === 'random') {
      const nextAutomaticStyle = automaticStyle();
      if (currentStyle !== nextAutomaticStyle) {
        currentStyle = nextAutomaticStyle;
        previousValue = null;
      }
    }
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
        metaHtml = `<span class="clock-season-dot" aria-hidden="true"></span><span class="clock-ambient-primary">현재 시각 ${h}:${m}:${s}</span><span class="clock-ambient-separator" aria-hidden="true">·</span><span class="clock-ambient-message">${mood.text}</span>`;
      } else {
        const timerStatus = timerSnapshot.status === 'paused'
          ? ' · 일시정지'
          : timerSnapshot.status === 'completed'
            ? ' 완료!'
            : '';
        metaHtml = `<span class="clock-season-dot" aria-hidden="true"></span><span class="clock-ambient-primary">${mood.text}</span><span class="clock-ambient-separator" aria-hidden="true">·</span><span class="clock-ambient-message">${mood.message}</span><span class="clock-sub-timer ${timerSnapshot.status}">${timerPhaseIcon} ${timerPhaseLabel} ${timerSnapshot.status === 'completed' ? '' : timerValue.text}${timerStatus}</span>`;
      }
      const moodKey = `${displayMode}|${mood.season}|${metaHtml}`;
      if (metaCopy.dataset.clockMoodKey !== moodKey) {
        const messageChanged = displayMode === 'clock'
          && metaCopy.dataset.clockMessage
          && metaCopy.dataset.clockMessage !== mood.message;
        metaCopy.dataset.clockMoodKey = moodKey;
        metaCopy.dataset.clockMessage = mood.message;
        metaCopy.innerHTML = metaHtml;
        if (messageChanged) {
          const message = metaCopy.querySelector('.clock-ambient-message');
          message?.classList.add('is-changing');
        }
      }
    });
    refreshTimerControls(timerSnapshot);

    if (displayMode === 'timer') {
      const html = renderTimerFace(timerSnapshot);
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'digital') {
      const html = `<div class="clock-digital-face">
        <span class="clock-digital-time">${h}<i>:</i>${m}</span>
        <span class="clock-digital-seconds"><b>${s}</b><small>SEC</small></span>
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
        ticksHtml += `<span class="clock-analog-tick${i % 3 === 0 ? ' is-major' : ''}" style="--tick-angle:${i * 30}deg"></span>`;
      }

      const html = `
        <div class="clock-analog-face">
          ${ticksHtml}
          <span class="clock-analog-marker marker-twelve">12</span><span class="clock-analog-marker marker-three">3</span>
          <span class="clock-analog-marker marker-six">6</span><span class="clock-analog-marker marker-nine">9</span>
          <span class="clock-analog-hand hand-hour" style="--hand-angle:${hourDeg}deg"></span>
          <span class="clock-analog-hand hand-minute" style="--hand-angle:${minDeg}deg"></span>
          <span class="clock-analog-hand hand-second" style="--hand-angle:${secDeg}deg"></span>
          <span class="clock-analog-pin"></span>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'flip') {
      const html = `<div class="clock-flip-face">
        <span class="clock-flip-group"><b>${h[0]}</b><b>${h[1]}</b></span><i>:</i>
        <span class="clock-flip-group"><b>${m[0]}</b><b>${m[1]}</b></span><i>:</i>
        <span class="clock-flip-group is-seconds"><b>${s[0]}</b><b>${s[1]}</b></span>
      </div>`;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'heart') {
      const secDeg = now.getSeconds() * 6;
      const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
      const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
      const html = `
        <div style="position:relative; width:84px; height:76px; margin-right:4px;">
          <div style="position:absolute; inset:0; clip-path:polygon(50% 94%, 14% 62%, 5% 48%, 5% 33%, 12% 21%, 24% 16%, 36% 19%, 50% 34%, 64% 19%, 76% 16%, 88% 21%, 95% 33%, 95% 48%, 86% 62%); background:linear-gradient(180deg,#fb7185 0%,#e11d48 55%,#be123c 100%); filter:drop-shadow(0 8px 12px rgba(190,24,93,0.25));"></div>
          <div style="position:absolute; inset:8px 10px 12px; clip-path:polygon(50% 94%, 14% 62%, 5% 48%, 5% 33%, 12% 21%, 24% 16%, 36% 19%, 50% 34%, 64% 19%, 76% 16%, 88% 21%, 95% 33%, 95% 48%, 86% 62%); background:linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.02));"></div>
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
        <div class="clock-neon-face">
          <span class="clock-neon-label">LOCAL TIME <i></i></span>
          <span class="clock-neon-time">${h}<b>:</b>${m}<small>${s}</small></span>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    } else if (style === 'soft') {
      const html = `
        <div class="clock-soft-face">
          <span class="clock-soft-orbit"><i></i></span>
          <span class="clock-soft-time">${h}<b>:</b>${m}</span>
          <span class="clock-soft-seconds">${s}<small>SEC</small></span>
        </div>
      `;
      displays.forEach((display) => {
        display.innerHTML = html;
      });
    }

    previousValue = { h, m, s };
  }

  if (focusClockRenderInterval) clearInterval(focusClockRenderInterval);
  refreshStyleMenus();
  renderClock();
  focusClockRenderInterval = setInterval(renderClock, 1000);
}

initClockWidget();
