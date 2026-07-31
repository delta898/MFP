# 2026-07-31 Buffer Publish Result Reconciliation

## Context

Buffer `createPost` 요청은 외부 SNS 발행을 발생시키는 비멱등 작업이다. 요청이
Buffer에 도달한 뒤 응답만 timeout 또는 연결 종료로 유실되면 Buffer와 SNS에는
게시물이 존재하지만 BlogGenius는 성공 여부를 알 수 없다.

이 상태에서 같은 원문 글을 그대로 재시도하면 Buffer가 다음 중복 오류로 거부할 수
있다.

```text
already got this one scheduled or posted around the same time
```

기존 runner는 마지막 중복 거부 응답을 채널 실패로 기록해 실제 발행 상태와 `SNS`
시트가 달라질 수 있었다.

## Decision

- Buffer 발행 요청 시각을 원문 글 묶음 단위로 기록한다.
- timeout, 연결 종료, rate limit, Buffer 5xx 같은 일시 오류 뒤에는 설정된 retry
  간격을 기다린 후 최근 Buffer 게시물을 먼저 조회한다.
- 조회 범위는 현재 Organization, 발행 대상 channel ID, 요청 시작 5분 전 이후의
  `scheduled`, `sending`, `sent` 게시물이다.
- 동일 channel ID와 정규화한 전체 본문이 일치하는 게시물을 찾으면 그 채널은 다시
  발행하지 않고 `완료`로 기록하며 조회한 Buffer post ID를 저장한다.
- 확인되지 않은 채널만 다음 발행 시도에 포함한다.
- Buffer가 중복 게시물 오류를 명시적으로 반환한 경우에는 동일 콘텐츠가 이미
  예약 또는 게시되었다는 Buffer의 판정을 멱등 성공으로 취급한다.
- 이때 최근 게시물 조회는 Buffer post ID를 보충하기 위한 최선 노력으로 수행한다.
  조회 결과가 없거나 조회가 실패해도 delivery는 `완료`로 기록하며 post ID는
  비워 둔다.
- 최근 게시물 조회 자체가 실패해도 남은 발행 재시도 횟수가 있으면 요청을
  재시도한다. 이미 처리된 요청이라면 Buffer의 중복 방지 응답으로 성공을
  확정하고, 아직 처리되지 않은 요청이라면 정상 발행 결과를 얻을 수 있다.
- 모든 발행 요청과 확인 조회가 실패해 끝까지 결과가 모호한 delivery만 `실패`로
  기록한다.

## Consequences

- 응답 유실 뒤 실제로 발행된 게시물을 시트의 `완료` 상태와 post ID로 복구할 수
  있다.
- Buffer의 명시적인 중복 거부 뒤 조회 API의 지연이나 장애가 있어도 실제 발행된
  항목을 실패로 오판하지 않는다.
- 여러 채널 중 이미 처리된 채널은 재시도에서 제외되어 중복 요청을 줄인다.
- Buffer 조회 API 장애만으로 조기에 포기하지 않으며, Buffer의 자체 중복 방지를
  활용해 제한된 횟수 안에서 결과를 확정한다.
- 본문과 채널이 같은 수동 게시물이 조회 시간 범위에 있으면 그 게시물을 동일
  delivery의 결과로 간주할 수 있다. Buffer 자체가 같은 시각의 동일 본문을
  중복으로 제한하므로, 이 경우 SNS 배포 목적은 이미 달성된 것으로 본다.
