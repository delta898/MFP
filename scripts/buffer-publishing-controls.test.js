const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../ui/scripts/shared/buffer-publishing-controls.js'), 'utf8');
const controls = vm.runInNewContext(`${source}\nBufferPublishingControls`);

test('shared workspace control keeps SNS and Card News button/select states consistent', () => {
  const button = { textContent: '', disabled: false };
  const select = { disabled: false };
  controls.syncWorkspace({ button, select, configured: true, loaded: false, loading: false });
  assert.equal(button.textContent, '작업 공간 불러오기');
  assert.equal(button.disabled, false);
  assert.equal(select.disabled, true);

  controls.syncWorkspace({ button, select, configured: true, loaded: true, loading: true });
  assert.equal(button.textContent, '불러오는 중...');
  assert.equal(button.disabled, true);
  assert.equal(select.disabled, true);
});

test('shared channel selection supports capped Card News selection and uncapped SNS selection', () => {
  const controlsList = [
    { value: 'a', checked: false },
    { value: 'b', checked: false },
    { value: 'c', checked: false },
    { value: 'unavailable', checked: false }
  ];
  const master = { checked: true, disabled: false, indeterminate: false };
  const isEligible = (control) => control.value !== 'unavailable';

  controls.applyChannelSelectAll({ master, controls: controlsList, isEligible, limit: 2 });
  assert.deepEqual(controlsList.map((control) => control.checked), [true, true, false, false]);
  controls.syncChannelSelectAll({ master, controls: controlsList, isEligible, limit: 2 });
  assert.equal(master.checked, true);
  controlsList[0].checked = false;
  controls.syncChannelSelectAll({ master, controls: controlsList, isEligible, limit: 2 });
  assert.equal(master.checked, false);
  assert.equal(master.indeterminate, true);

  controls.applyChannelSelectAll({ master: { checked: true }, controls: controlsList, isEligible });
  assert.deepEqual(controlsList.map((control) => control.checked), [true, true, true, false]);
});
