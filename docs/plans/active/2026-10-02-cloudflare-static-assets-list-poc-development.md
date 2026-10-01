# Cloudflare Static Assets 목록 조회 PoC

## 브랜치와 상태

- 브랜치: `codex/cloudflare-static-assets-list-poc`
- 시작일: 2026-10-02
- 기준/부모 브랜치: `codex/static-site-builder-main`
- 상태: 읽기 전용 PoC 구현, 집중 테스트 및 실제 Cloudflare 계정 검증을 마쳤다. 이 하위 브랜치의 통합은 아직 하지 않았다.
- 부모 기능: [정적 사이트 빌더 메인 기능](2026-10-01-static-site-builder-main-development.md)
- 선행 단계: [Cloudflare OAuth 및 계정 멤버십 목록 PoC](../archive/2026-10-01-cloudflare-oauth-desktop-poc-development.md)

## 사용자 요구와 목표

Cloudflare OAuth로 연결한 계정에서 배포된 정적 사이트 목록을 읽을 수 있는지 확인한다. 다음 단계에서 BlogGenius가 기존 Worker와 정적 자산을 식별·표시할 수 있는지, 어떤 최소 scope가 필요한지 판단하기 위한 기술 검증이다.

## 범위

- 공식 Cloudflare API를 사용해 계정 내 Worker script 목록을 읽는다.
- 응답의 `has_assets`가 `true`인 항목을 정적 자산이 연결된 Worker로 분류한다.
- OAuth 인증에서 `memberships.read`와 `workers-scripts.read` scope를 요청하고, 선택된 Cloudflare account ID에 대해 Worker Scripts Read 권한이 동작하는지 확인한다.
- 단위 테스트에서는 API 응답과 오류를 모의한다. 실계정 검증은 사용자가 승인한 읽기 요청만 수행한다.
- OAuth 및 계정 목록 PoC의 기존 callback·PKCE 코드를 재사용한다.

## 명시적 비목표

- Worker 생성, 수정, 삭제, 배포 및 도메인 설정을 하지 않는다.
- 사용자 Cloudflare 계정의 데이터를 로컬 저장소나 개발 문서에 저장하지 않는다.
- BlogGenius UI 또는 운영용 토큰 저장을 구현하지 않는다.
- Cloudflare Pages 목록이나 별도 제품의 자산 목록을 대상으로 삼지 않는다. 이 단계의 대상은 Workers Static Assets를 포함한 Worker script다.
- template, Astro build 또는 사이트 편집을 구현하지 않는다.

## 조사 결과와 설계

- Cloudflare Static Assets는 Worker에 결합되어 배포되는 정적 파일 모음이다. 계정의 script 목록 API는 `GET /accounts/{account_id}/workers/scripts`이며, 응답 script에 `has_assets`가 포함된다.
- 목록 API가 허용하는 권한 중 읽기 전용 최소 권한은 **Workers Scripts Read**다. OAuth 클라이언트에서는 `workers-scripts.read` scope로 요청한다.
- 선행 PoC에서 `memberships.read` scope와 OAuth Bearer token으로 `GET /memberships`를 확인했다. 이 단계에서는 두 scope를 함께 요청해 계정 목록을 가져온 뒤 script 목록을 조회한다.
- 사용자가 여러 Cloudflare account membership을 가진 경우 잘못된 account를 암묵적으로 고르지 않도록 명시적인 account 선택이 필요하다. PoC는 `CF_ACCOUNT_ID`가 지정되면 그 account를 쓰고, 지정되지 않은 경우 membership이 하나일 때만 자동 선택한다. membership이 여러 개면 목록을 알려주고 종료한다.
- API 결과 전체를 출력하지 않고 사이트 식별에 필요한 script 이름과 `has_assets` 상태만 요약한다. access token과 API 응답 전체는 출력하거나 파일에 저장하지 않는다.

공식 근거: [List Worker Scripts API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/), [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Cloudflare OAuth scope 설정](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/).

## 구현 단계

1. OAuth PoC API 모듈에 Worker script 목록 조회 함수를 추가하고 입력 account ID를 검증한다.
2. 읽기 전용 Bearer 요청, `has_assets` 분류, API 오류 및 응답 형식을 집중 테스트한다.
3. 실사용 스크립트에서 OAuth 후 membership으로 account를 결정하고 Worker 목록을 가져오는 흐름을 연결한다.
4. Cloudflare 실제 계정에서 동의를 거쳐 결과를 확인하고, 민감한 계정 식별 정보 없이 이 기록에 결과를 남긴다.

## 결정과 변경 기록

- 사용자 승인(2026-10-02): 선행 OAuth·membership PoC를 부모 브랜치에 fast-forward 병합한 다음 이 하위 단계를 시작한다. 선행 하위 브랜치는 삭제하지 않고 보존한다.
- 2026-10-02: 선행 OAuth PoC는 테스트 7개가 통과한 커밋 `1c668dc1`로 부모에 병합됐다.
- 2026-10-02: 실계정에 연결된 멤버십이 하나면 이를 사용하고, 여러 개면 실행을 멈춘 뒤 사용자가 `CF_ACCOUNT_ID`를 지정하도록 선택 경계를 둔다. 지정한 ID도 OAuth membership 응답에 포함된 계정인지 확인한다.
- Static Assets 목록은 Worker script 목록에서 `has_assets`로 분류한다. API가 반환하는 모든 Worker를 정적 사이트로 표시하지 않는다.

## 검증 및 인계

- 구현 중 `node --test prototypes/cloudflare-oauth-poc/oauth-client.test.js`와 추가한 집중 테스트를 실행한다.
- 실계정 검증은 사용자 승인을 받은 인증 및 `GET` 요청만 수행한다. 배포나 원격 변경 요청은 하지 않는다.
- 완료 기준은 실제 OAuth Bearer token으로 script 목록 조회 성공, `has_assets` 값에 따른 결과 분류, 오류 시 토큰이 노출되지 않음이다.
- 전체 테스트 스위트는 이 하위 단계의 기본 검증 범위가 아니다.
- 최종 커밋, 테스트 결과, 실계정 수동 확인 결과 및 후속 위험을 이 기록에 갱신한다.

## 구현 진행 기록

- OAuth API 모듈에 account ID 형식 검증, membership 기반 계정 선택, Worker script 목록 GET 요청을 추가했다.
- 실사용 callback 스크립트는 두 scope를 요청하고 `has_assets === true`인 Worker 이름만 요약한다. API 응답 전체와 access token은 출력하거나 저장하지 않는다.
- 집중 테스트 11개, `git diff --check`, live 스크립트 구문 검사를 통과했다.
- 실제 검증(2026-10-02): 시스템 브라우저에서 `memberships.read workers-scripts.read` 동의를 완료했다. OAuth Bearer token으로 membership 목록과 `GET /accounts/{account_id}/workers/scripts` 호출이 성공했다. 응답된 Worker script 9개 중 `has_assets: true`인 정적 자산 Worker 7개를 분류했다. 이름과 계정 식별 정보는 기록하지 않는다. token은 출력하거나 저장하지 않았다.
- 확인된 결과: `workers-scripts.read` scope로 정적 자산을 포함한 Worker 목록을 조회할 수 있고 `has_assets`로 정적 자산이 있는 Worker를 걸러낼 수 있다. 이번 단계는 읽기 전용이며 원격 변경이 없었다.
- 하위 단계 검증 완료: `node --test prototypes/cloudflare-oauth-poc/oauth-client.test.js` 11개 통과, `node --check prototypes/cloudflare-oauth-poc/run-static-assets-list-check.js` 통과, `git diff --check` 통과.
- 남은 범위: Cloudflare static asset Worker의 배포 및 상태 확인 API는 다음 기술 단계에서 별도로 조사·검증한다.
