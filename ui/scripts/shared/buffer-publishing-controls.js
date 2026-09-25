const BufferPublishingControls = Object.freeze({
  syncWorkspace({ button, select, configured, loaded, loading, disabled = false }) {
    if (!button || !select) return;
    button.textContent = loading ? '불러오는 중...' : (loaded ? '다시 불러오기' : '작업 공간 불러오기');
    button.disabled = !configured || loading || disabled;
    select.disabled = !configured || !loaded || loading || disabled;
  },

  syncChannelSelectAll({ master, controls, isEligible = () => true, limit = Infinity, disabled = false }) {
    if (!master) return;
    const eligible = controls.filter(isEligible);
    const selectableCount = Math.min(eligible.length, Math.max(0, Number(limit) || 0));
    const selectedCount = eligible.filter((control) => control.checked).length;
    master.disabled = disabled || selectableCount === 0;
    master.checked = selectableCount > 0 && selectedCount === selectableCount;
    master.indeterminate = selectedCount > 0 && !master.checked;
  },

  applyChannelSelectAll({ master, controls, isEligible = () => true, limit = Infinity }) {
    const eligible = controls.filter(isEligible);
    const selected = new Set(master.checked ? eligible.slice(0, limit).map((control) => control.value) : []);
    eligible.forEach((control) => { control.checked = selected.has(control.value); });
  },

  setWorkspaceRefresh(button, onRefresh) {
    if (button) button.onclick = onRefresh;
  }
});
