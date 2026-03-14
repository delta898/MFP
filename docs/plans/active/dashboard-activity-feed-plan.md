# Dashboard Activity Feed Plan

## Goal
- Separate dashboard-facing activity feed from raw system logs.
- Keep the dashboard focused on meaningful user-visible events.
- Preserve detailed debugging information in the existing log views.

## Scope
- Add a dedicated dashboard activity store.
- Expose a recent activity API for the dashboard card.
- Keep `logs` / `activity history` tabs backed by raw logs.
- Record only high-signal events:
  - system start / restart / stop
  - service start / stop
  - settings saved
  - preview generated
  - publish started / completed / failed
  - trends / RSS collection started / completed / failed

## Non-Goals
- Do not replace the existing logger.
- Do not parse raw log strings into dashboard activities.
- Do not surface low-level step logs such as image upload / retry / heartbeat.

## Proposed Structure
- `src/activity/dashboard-activity-store.js`
  - append activity
  - list recent activities
  - persist recent activities separately from raw logs
- `GET /api/v1/dashboard/activities`
  - dashboard-only feed
- UI dashboard card reads activities
- UI logs tab continues reading raw logs

## Event Shape
```js
{
  id: '...',
  timestamp: '2026-03-15T00:00:00.000Z',
  level: 'info',
  type: 'publish_completed',
  title: '워드프레스 포스팅 완료',
  detail: '애플 맥북 네온 디자인과 성능의 강렬한 조화',
  meta: {
    platform: 'wordpress',
    mode: 'publish'
  }
}
```

## First Integration Points
- `src/ui-server.js`
- `src/ui-api/services/settings.service.js`
- `src/mcp/remote-service.js`
- `src/telegram-bot.service.js`
- `src/ui-api/services/content.service.js`
- `src/ui-api/services/blog-auto.service.js`

## Validation
- Dashboard card shows coarse-grained events only.
- Raw log tab still shows detailed technical logs.
- Activities survive app restart within the recent activity file.
