const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { DashboardActivityStore } = require('./dashboard-activity-store');

test('dashboard activity store records and reloads recent items', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-activity-'));
    const filePath = path.join(rootDir, 'logs', 'dashboard-activities.json');
    const store = new DashboardActivityStore({ fs, path, rootDir, filePath, maxRecent: 10, persistLimit: 10 });

    store.record({
        type: 'publish_completed',
        category: 'publish',
        title: '워드프레스 포스팅 완료',
        detail: '테스트 제목'
    });
    store.record({
        type: 'settings_saved',
        category: 'settings',
        title: '설정 저장 완료'
    });

    const recent = store.listRecent(5);
    assert.equal(recent.length, 2);
    assert.equal(recent[0].title, '설정 저장 완료');
    assert.equal(recent[1].title, '워드프레스 포스팅 완료');

    const restored = new DashboardActivityStore({ fs, path, rootDir, filePath, maxRecent: 10, persistLimit: 10 });
    const restoredRecent = restored.listRecent(5);
    assert.equal(restoredRecent.length, 2);
    assert.equal(restoredRecent[1].detail, '테스트 제목');
});
