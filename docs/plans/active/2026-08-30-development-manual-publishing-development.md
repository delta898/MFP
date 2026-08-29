# Development 수동 발행 허용

## 브랜치

- `feature/development-manual-publishing`

## 목표

Development 환경에서 개발자가 지정한 테스트 채널로 단건 수동 발행을 검증할 수 있게 한다.
자동·예약·일괄 발행은 계속 차단해 의도하지 않은 외부 변경을 방지한다.

## 설계

- 환경 effect를 `manualPublish`와 `automatedPublish`로 분리한다.
- Local은 두 effect를 모두 차단한다.
- Development는 `manualPublish`만 허용한다.
- Production은 두 effect를 모두 허용한다.
- 기존 `livePublish`는 자동화 차단 경계의 호환 alias로 유지한다.
- Naver/WordPress 저수준 발행기는 단건 수동 발행을 허용하되 예약 상태는 자동화 정책으로 검사한다.
- Blog/Shopping 일괄 action, 자동 runner, Agent 자동 발행은 자동화 정책을 계속 사용한다.

## 결정사항

- Development 발행 대상 계정과 사이트 선택은 개발자 책임으로 둔다.
- Development에서 실제 외부 발행이 가능하므로 자동 테스트는 mock으로만 검증한다.
- 실제 쇼핑 발행은 사용자의 별도 확인 후 Development 테스트 계정에서 한 번 수행한다.
- Production 전환과 배포는 이 브랜치의 범위가 아니다.

## 과정

- 기존 단일 `livePublish` 정책과 모든 호출 경로를 조사한다.
- 수동/자동 capability를 분리하고 entry point별 정책을 적용한다.
- 환경 contract, runtime effect, 수동·자동 발행 회귀 테스트를 수행한다.
- Development 앱에서 쇼핑 빠른 포스팅을 수동 검증한다.

## 결과

- Development readiness에서 `Manual publish: enabled`, `Automated publish: blocked`를 확인했다.
- 집중 테스트 85개, 전체 단위 테스트 1,109개와 browser smoke를 통과했다.
- Development 환경에서 Shopping 빠른 포스팅을 Draft로 실행해 Naver 임시저장 완료를 확인했다.
- 브라우저를 열어둔 수동 검토 흐름까지 정상 동작했다.
- Production 검증과 전환은 후속 작업으로 남긴다.
