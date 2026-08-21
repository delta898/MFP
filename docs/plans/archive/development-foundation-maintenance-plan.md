# Development Foundation Maintenance Plan

## Status

- Phase: completed
- Started: 2026-08-22
- Completed: 2026-08-22
- Target branch: `codex/chore-development-foundation`

## Goal

0.2.0 이후의 기능 개발이 오래된 backlog, 완료된 active plan, 수동 테스트
목록에 의존하지 않도록 개발 기준선을 정리한다.

## Scope

1. `docs/backlog.md`에 0.2.0 이후 제안 우선순위를 기록한다.
2. 이미 구현된 backlog 항목을 완료 이력으로 분리하고 남은 작업만 유지한다.
3. 구현이 끝난 active plan을 `docs/plans/archive/`로 옮긴다.
4. `docs/README.md`의 canonical/active 문서 목록을 현재 구조와 맞춘다.
5. 저장소의 모든 `*.test.js`를 자동으로 발견하는 unit-test runner를 도입한다.
6. UI smoke script처럼 `test-*.js`이지만 unit test가 아닌 파일은 자동 발견에서 제외한다.

## Test Contract

- unit-test source of truth: 아래 discovery root의 `*.test.js`
- discovery roots: `apps`, `bin`, `scripts`, `shared`, `src`
- excluded by contract: `test-ui-*.js` 같은 별도 smoke/e2e entry point
- 새 `*.test.js` 파일은 `package.json` 수정 없이 다음 `npm run test:unit`에 포함된다.
- 발견 순서는 경로 기준으로 고정해 로컬과 CI에서 같은 명령을 실행한다.

## Completion Criteria

- backlog가 구현 완료 기능을 미완료 P1로 표시하지 않는다.
- active plan에는 실제 후속 작업만 남는다.
- `npm run test:unit`이 모든 `*.test.js`를 실행하고 통과한다.
- 테스트 runner 자체의 발견/제외/정렬 계약이 단위 테스트로 보호된다.

## Result

- 0.2.0 이후 추천 순위와 남은 backlog를 분리했다.
- 구현이 끝났거나 대체된 active plan 37개를 archive로 이동했다.
- `scripts/run-unit-tests.js`가 5개 코드 root의 `*.test.js`를 자동 발견한다.
- runner 계약 테스트를 포함한 101개 test file, 497개 test가 통과했다.
