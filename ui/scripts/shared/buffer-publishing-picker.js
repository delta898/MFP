const BufferPublishingPicker = Object.freeze({
  render(root, options = {}) {
    if (!root) return null;

    const make = (tag, className, text = '') => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text) element.textContent = text;
      return element;
    };
    const ids = options.ids || {};
    const maxChannels = Math.max(1, Number(options.maxChannels) || 1);
    const channels = Array.isArray(options.channels) ? options.channels : [];
    const organizations = Array.isArray(options.organizations) ? options.organizations : [];
    const selectedOrganizationId = String(options.selectedOrganizationId || '').trim();
    const selectedChannelIds = new Set((options.selectedChannelIds || []).map((id) => String(id || '').trim()).filter(Boolean));
    const disabled = options.disabled === true;
    const layout = make('div', 'buffer-publishing-destination-layout');

    const workspacePanel = make('div', 'buffer-publishing-destination-workspace');
    const workspaceLabel = make('div', 'ui-settings-field buffer-publishing-workspace');
    const workspaceTitle = make('label', '', options.workspaceTitle || '작업 공간');
    workspaceTitle.htmlFor = ids.workspace || '';
    workspaceLabel.append(workspaceTitle);
    const fieldAction = make('span', 'ui-field-action');
    const selectShell = make('span', 'ui-select-shell');
    const workspaceSelect = make('select');
    if (ids.workspace) workspaceSelect.id = ids.workspace;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = !options.configured
      ? 'Buffer 연결 후 선택할 수 있습니다.'
      : (options.loaded ? '작업 공간을 선택해 주세요.' : '작업 공간을 불러와 선택해 주세요.');
    workspaceSelect.append(placeholder);
    organizations.forEach((organization) => {
      const id = String(organization.id || '').trim();
      if (!id) return;
      const option = document.createElement('option');
      option.value = id;
      option.textContent = String(organization.name || id);
      option.selected = id === selectedOrganizationId;
      workspaceSelect.append(option);
    });
    if (selectedOrganizationId && !organizations.some((organization) => String(organization.id || '').trim() === selectedOrganizationId)) {
      const option = document.createElement('option');
      option.value = selectedOrganizationId;
      option.textContent = String(options.selectedOrganizationLabel || '저장된 작업 공간');
      option.selected = true;
      workspaceSelect.append(option);
    }
    selectShell.append(workspaceSelect);
    const refreshButton = make('button', 'secondary', options.loading ? '불러오는 중...' : (options.loaded ? '다시 불러오기' : '작업 공간 불러오기'));
    refreshButton.type = 'button';
    if (ids.refresh) refreshButton.id = ids.refresh;
    refreshButton.disabled = !options.configured || options.loading === true || disabled;
    workspaceSelect.disabled = !options.configured || !options.loaded || options.loading === true || disabled;
    fieldAction.append(selectShell, refreshButton);
    workspaceLabel.append(fieldAction);
    workspaceLabel.append(make('small', '', options.workspaceHint || '선택한 작업 공간의 SNS 채널을 불러옵니다.'));
    workspacePanel.append(workspaceLabel);

    const channelPanel = make('section', 'buffer-publishing-destination-channels');
    const heading = make('div', 'buffer-publishing-channel-heading');
    const headingCopy = make('div', 'buffer-publishing-channel-heading-copy');
    const titleRow = make('div', 'buffer-publishing-channel-title-row');
    const selectAll = document.createElement('input');
    selectAll.type = 'checkbox';
    if (ids.selectAll) selectAll.id = ids.selectAll;
    const title = make('label', '', options.channelTitle || '발행 채널');
    if (ids.selectAll) title.htmlFor = ids.selectAll;
    const count = make('small');
    if (ids.channelLimit) count.id = ids.channelLimit;
    title.append(count);
    titleRow.append(selectAll, title);
    headingCopy.append(titleRow, make('p', '', options.channelHint || '이번 발행에 사용할 채널을 선택하세요.'));
    heading.append(headingCopy);
    if (options.helpUrl) {
      const help = make('button', 'context-help-link', options.helpLabel || 'Buffer 도움말');
      help.type = 'button';
      help.dataset.helpGuideUrl = String(options.helpUrl);
      heading.append(help);
    }
    const channelList = make('div', 'ui-selectable-card-grid buffer-channel-card-grid');
    if (ids.channels) channelList.id = ids.channels;
    channelList.setAttribute('aria-live', 'polite');
    if (channels.length) {
      channels.forEach((channel) => {
        const selectable = options.isSelectable ? options.isSelectable(channel) !== false : channel.compatible !== false;
        const channelForCard = selectable ? channel : { ...channel, disabled: true };
        const inputData = {
          bufferPickerChannel: true,
          bufferPickerSelectable: selectable,
          ...(typeof options.inputData === 'function' ? options.inputData(channel) : (options.inputData || {}))
        };
        const card = BufferChannelCards.create(channelForCard, {
          className: options.cardClassName || '',
          selected: selectedChannelIds.has(String(channel.id || channel.channelId || '').trim()),
          disabled,
          inputName: options.inputName || '',
          inputData
        });
        const input = card.querySelector('input[type="checkbox"]');
        if (input) {
          input.disabled = disabled || !selectable;
          input.addEventListener('change', () => {
            const selected = [...channelList.querySelectorAll('input[data-buffer-picker-channel]:checked')].map((control) => control.value);
            if (input.checked && selected.length > maxChannels) {
              input.checked = false;
              options.onLimitReached?.();
            }
            syncSelection();
            options.onSelectionChange?.(getSelectedIds(), { changedId: input.value, all: false });
          });
        }
        channelList.append(card);
      });
    } else {
      const hasEmptyAction = options.emptyAction?.label && typeof options.emptyAction.onClick === 'function';
      const empty = make(hasEmptyAction ? 'div' : 'p', options.emptyClassName || 'muted');
      const emptyMessage = options.emptyMessage || '작업 공간을 선택하면 SNS 채널이 표시됩니다.';
      if (hasEmptyAction) empty.append(make('p', '', emptyMessage));
      else empty.textContent = emptyMessage;
      channelList.append(empty);
      if (hasEmptyAction) {
        const action = make('button', options.emptyAction.className || 'text-btn', options.emptyAction.label);
        action.type = 'button';
        action.addEventListener('click', options.emptyAction.onClick);
        empty.append(action);
      }
    }
    channelPanel.append(heading, channelList);
    layout.append(workspacePanel, channelPanel);
    root.replaceChildren(layout);

    const getSelectedIds = () => [...channelList.querySelectorAll('input[data-buffer-picker-channel]:checked')].map((input) => input.value);
    const syncSelection = () => {
      const controls = [...channelList.querySelectorAll('input[data-buffer-picker-channel]')];
      const selectedCount = controls.filter((input) => input.checked).length;
      count.textContent = `최대 ${maxChannels}개 · ${selectedCount}개 선택`;
      controls.forEach((input) => {
        const selectable = input.dataset.bufferPickerSelectable === 'true';
        input.disabled = disabled || !selectable || (!input.checked && selectedCount >= maxChannels);
        input.closest('.buffer-channel-card')?.classList.toggle('is-selected', input.checked);
        input.closest('.buffer-channel-card')?.classList.toggle('is-disabled', input.disabled);
      });
      BufferPublishingControls.syncChannelSelectAll({
        master: selectAll,
        controls,
        isEligible: (input) => input.dataset.bufferPickerSelectable === 'true',
        limit: maxChannels,
        disabled
      });
    };
    selectAll.addEventListener('change', () => {
      const eligible = [...channelList.querySelectorAll('input[data-buffer-picker-channel]')]
        .filter((input) => input.dataset.bufferPickerSelectable === 'true');
      const selected = new Set(selectAll.checked ? eligible.slice(0, maxChannels).map((input) => input.value) : []);
      eligible.forEach((input) => { input.checked = selected.has(input.value); });
      syncSelection();
      options.onSelectionChange?.(getSelectedIds(), { all: true });
    });
    workspaceSelect.addEventListener('change', () => options.onWorkspaceChange?.(String(workspaceSelect.value || '').trim()));
    refreshButton.addEventListener('click', () => options.onRefresh?.(String(workspaceSelect.value || '').trim()));
    syncSelection();

    return { layout, workspacePanel, workspaceSelect, refreshButton, channelPanel, selectAll, channelList, getSelectedIds, syncSelection };
  }
});
