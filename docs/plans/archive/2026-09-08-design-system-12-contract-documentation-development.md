# 디자인 시스템 12단계 — 문서 계약 정리 개발 기록

## Branch

- Branch: `codex/feature/design-system-12-contract-documentation`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-08
- Status: 완료 — 문서 정합성 검증 및 사용자 승인 완료

## 사용자 필요와 목표

BlogGenius 디자인 원칙과 가이드가 실제 구현을 안정적으로 판단하는 하나의 체계로 동작하도록 문서 경계를 정리한다.
반복 설명은 상위 원칙과 하위 상세 계약의 관계로 명확히 하고, 최근 사용자 합의 및 현재 구현과 어긋난 기능 문서를
교정한다. 과거 단계 기록이 현재 규칙처럼 읽히지 않게 안정 문서와 개발 이력을 분리한다.

## 범위

1. 파괴적 작업의 사전 확인과 즉시 되돌리기 적용 기준 명확화
2. 결정 action 배치의 원칙과 상세 component 계약 사이 소유권 정리
3. 완료된 디자인 시스템 Gate·기반 제안의 현재 상태 표현 정리
4. 글감 관리 편집·collection 이동 책임에 관한 연속 발행 기능 문서 교정
5. `docs/README.md`의 디자인 시스템 active/archive 인덱스 최신화
6. component guide의 현재 성숙도와 적용 상태 정리

## 명시적 비범위

- UI, JavaScript, CSS 또는 domain 동작 변경
- 트렌드 table 정렬 접근성 구현
- feature CSS의 typography·shadow token migration
- 전체 TC, release, version bump, parent merge, tag, push 또는 배포

## 제안 설계

- Design Principles는 제품 경험 판단과 상위 불변 원칙만 소유한다.
- Operational Guidelines는 반복되는 실행 판단을 요약하고 상세 규격의 canonical component guide를 참조한다.
- Component and Pattern Guide는 action anatomy, 상태 전이, 배치와 접근성의 구체적인 구현 계약을 소유한다.
- 즉시 완전히 복구 가능한 로컬 작업과 되돌리기 어렵거나 외부 영향을 만드는 작업의 확인 정책을 구분한다.
- 완료된 Gate와 초기 구현 제안은 현재 해야 할 일처럼 표현하지 않고 검증 이력 또는 완료된 기준선으로 명확히 표시한다.
- 기능 문서는 편집 dialog가 content 저장만 소유하고 collection 이동은 목록 row가 소유하는 현재 계약을 따른다.

## 사용자와의 결정

- 2026-09-08: 전체 검토 결과를 여섯 개 개별 조각 대신 세 단계로 묶어 진행한다.
- 2026-09-08: 첫 단계는 문서 계약만 정리하고 구현 변경은 다음 단계로 분리한다.
- 2026-09-08: 각 단계는 독립 sub-feature branch로 진행한다.

## 구현 단계

1. canonical 원칙·style·component 문서의 중복과 충돌 교정
2. 현재 글감 관리 구현에 맞춘 연속 발행 기능 문서 교정
3. 문서 인덱스와 parent 개발 기록 최신화
4. 링크·용어·문서 간 계약의 focused consistency 확인

## 진행 기록

- 2026-09-08: clean `codex/feature/design-system-main`에서 sub-feature branch와 독립 개발 기록을 만들었다.
- 2026-09-08: 상위 원칙의 파괴적 작업 확인 범위를 되돌리기 어려운 작업과 외부 영향 작업으로 좁히고, 즉시
  완전 복구 가능한 로컬 작업은 되돌리기 계약으로 사전 확인을 대체할 수 있게 명확히 했다.
- 2026-09-08: 원칙 문서의 action 배치 상세를 판단 기준과 하위 guide 연결로 축약하고, 구체적인 variant·dialog
  anatomy·배치·keyboard·확인 흐름은 component guide가 단일 상세 계약으로 소유하게 했다.
- 2026-09-08: 완료된 세 Gate와 초기 foundation 제안을 현재 할 일에서 검증 이력으로 재분류하고, 상세 과정은
  archive 개발 기록을 참조하게 했다. component guide는 임시 버전 표현 대신 운영 중인 living contract로 표시했다.
- 2026-09-08: 연속 발행 기능 문서에서 편집 popup과 collection row action의 소유권을 현재 구현에 맞게 교정했다.
- 2026-09-08: 이미 완료·병합된 트렌드 결과 개발 기록을 archive로 옮기고 parent와 docs index의 stale link를 정리했다.

## 검증 계획

- 변경 문서의 링크와 참조 경로 확인
- 관련 용어와 상충 문구 `rg` 검사
- `git diff --check`
- 문서 전용 변경이므로 UI·browser·full unit suite는 실행하지 않는다.

## 최종 결과

- 제품 원칙, style contract와 component guide의 계층은 유지하면서 중복 상세의 단일 소유권을 명확히 했다.
- 파괴적 작업 사전 확인과 즉시 되돌리기 사이의 문서 충돌을 해소했다.
- 완료된 검토 절차가 현재 작업처럼 읽히지 않게 안정 문서와 archive 이력을 분리했다.
- 글감 관리 편집·이동 계약과 문서 인덱스를 현재 구현 상태에 맞췄다.
- 코드·CSS·사용자-visible 동작은 변경하지 않았다.
- 변경 문서의 로컬 링크와 상충 문구를 검사하고 `git diff --check`를 통과했다.
- 사용자가 문서 결과를 승인하고 문서 전용 단계의 Full TC 생략 및 parent 통합을 요청했다.
