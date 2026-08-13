# Configurable Content Surfaces Plan

## Status

- Phase: Dashboard single-card completed; Account pending
- Initial surfaces: `dashboard`, `account`
- Dependency: sidebar surface content PoC completed
- Implementation principle: begin with `single`; enable other display modes only after real operating need is confirmed

## Goal

Dashboard와 Account의 본래 작업 흐름을 방해하지 않으면서, 자체 자료·후원·제휴 콘텐츠를 앱 배포와 독립적으로 운영할 수 있는 제한된 콘텐츠 영역을 제공한다.

이번 확장은 화면 전체를 원격 구성으로 바꾸는 작업이 아니다. 앱이 허용한 semantic region 안에서만 검증된 콘텐츠와 표시 정책을 적용한다.

## Supported Surfaces

초기 범위는 다음 두 곳이다.

- `dashboard`: 주요 작업 블록과 후속 콘텐츠 사이의 supporting region
- `account`: 계정·구독 핵심 정보 이후의 supporting region

Sidebar는 이미 구현된 별도 surface로 유지한다. 다른 화면은 Dashboard와 Account의 운영 결과를 확인한 뒤 확장한다.

## Content Instance, Kind and Action

콘텐츠 A·B·C는 타입명이 아니라 한 region에 배치할 수 있는 콘텐츠 인스턴스를 뜻한다.

예:

- 콘텐츠 A: 개발자 블로그
- 콘텐츠 B: 무료 오라클 가이드
- 콘텐츠 C: 개발자 응원하기

세 콘텐츠 모두 사용자를 HTTPS 외부 URL로 이동시킨다는 점에서는 동일하다. 그러나 콘텐츠의 목적에 따라 필요한 고지와 기본 표현이 다르므로 `kind`는 최소한으로 유지한다.

| kind | 의미 | 예 | 필수 운영 규칙 |
| --- | --- | --- | --- |
| `resource` | 운영자가 직접 제공하거나 추천하는 자료 | 블로그, 전자책, 가이드 | 추천 자료로 표현 |
| `support` | 개발자 또는 서비스 후원 | 크티 후원 페이지 | 후원임을 명확히 표현 |
| `affiliate` | 클릭·구매 등에 경제적 이해관계가 있는 링크 | 제휴 상품 또는 서비스 | disclosure 필수 |

전자책, 블로그, 동영상 같은 매체 차이는 새로운 `kind`로 만들지 않는다. 이는 제목, 설명, 이미지와 CTA로 표현한다. 새로운 법적·정책적 처리 차이가 생길 때만 kind 추가를 검토한다.

현재 공통 action은 `external_url` 하나로 본다. 앱 내부 화면 이동, 결제 실행, 파일 다운로드처럼 동작 자체가 달라질 때에는 별도 action capability 설계가 필요하며 단순 링크 설정으로 우회하지 않는다.

개념 모델은 다음과 같다.

```text
Content
├─ kind: resource | support | affiliate
├─ action: external_url
└─ config
   ├─ title / description / CTA
   ├─ target URL
   ├─ image asset
   └─ disclosure
```

## Region Content Pool

하나의 surface region에는 여러 eligible 콘텐츠가 포함될 수 있다. 실제 표시 결과는 다음 순서로 결정한다.

1. campaign status, 기간과 앱 버전 검증
2. license plan audience 적용
3. surface와 region placement 적용
4. priority 및 selection policy 적용
5. display policy의 허용 개수로 제한
6. 앱 schema 검증 후 렌더링

서버가 반환한 콘텐츠를 앱이 무제한 표시하지 않는다. surface별 hard cap과 지원 display mode를 앱이 최종 통제한다.

## Display Policy

`display_mode`는 운영자가 이해할 수 있는 완성형 표시 preset이다.

| display_mode | 정의 | 한 번에 보이는 카드 | 초기 지원 |
| --- | --- | ---: | --- |
| `single` | 선택된 콘텐츠 하나만 표시 | 1 | 지원 예정 |
| `pair` | 카드 두 개를 한 영역에 표시 | 최대 2 | 보류 |
| `carousel` | 여러 콘텐츠를 한 장씩 수동 전환 | 1 | 보류 |

`carousel`은 계약상 한 번에 한 카드만 표시한다. 자동 전환은 carousel과 별개의 동작이며 초기 범위에서 제외한다.

`selection_mode`는 eligible 콘텐츠 중 무엇을 고를지 결정한다.

| selection_mode | 정의 |
| --- | --- |
| `priority` | 우선순위가 높은 콘텐츠부터 선택 |
| `daily_rotate` | 날짜와 안정적인 사용자 식별값을 기준으로 선택하여 하루 동안 유지 |

유효한 조합의 의미는 다음과 같다.

- `single + priority`: 가장 중요한 콘텐츠 하나
- `single + daily_rotate`: 콘텐츠 풀에서 매일 하나를 안정적으로 순환
- `pair + priority`: 우선순위가 높은 콘텐츠 최대 두 개
- `pair + daily_rotate`: 콘텐츠 풀에서 매일 최대 두 개를 안정적으로 선택
- `carousel + priority`: 우선순위 순으로 최대 세 개를 수동 탐색

완전 무작위 선택은 사용하지 않는다. 화면 focus나 API 재조회 때마다 콘텐츠가 바뀌면 사용자가 방금 본 내용을 잃고 노출 검증도 어려워진다.

## Initial Product Policy

첫 구현은 다음으로 제한한다.

| surface | display_mode | selection_mode | 대상 콘텐츠 |
| --- | --- | --- | --- |
| Dashboard | `single` | `daily_rotate` | 플랜 정책을 통과한 추천 자료 또는 후원 |
| Account | `single` | `priority` | 계정 맥락에 맞는 후원 또는 운영 메시지 |

- Tester/Free: 자체 홍보 resource 및 대상 affiliate 허용
- Pro 이상: 홍보 resource 제외, support만 허용
- affiliate는 모든 플랜에서 disclosure가 없으면 미노출
- 한 화면에 한 카드만 표시
- dismiss와 노출 빈도 제한은 실제 사용성 확인 후 검토

## Card Presentation

초기 `single` 카드는 두 surface에서 재사용 가능한 compact horizontal card로 구현한다.

- optional thumbnail 또는 bundled fallback icon
- 성격 라벨: 추천 자료, 개발자 지원, 제휴
- 한 줄 제목
- 최대 한 줄 설명
- 명확한 CTA와 외부 링크 표시
- affiliate disclosure

카드 전체를 과도하게 강조하거나 제목 바로 아래를 점유하지 않는다. 화면의 핵심 정보와 주요 작업을 먼저 보여준 뒤 supporting region에 배치한다.

## Progressive Delivery

1. Dashboard `single + daily_rotate` 구현과 운영 검증
2. Account `single + priority` 구현과 운영 검증
3. 실제 콘텐츠가 지속적으로 두 개 이상 필요할 때 `pair` 검토
4. 실제 콘텐츠가 세 개 이상 유지되고 탐색 요구가 확인될 때 manual carousel 검토
5. 자동 전환은 별도 UX·접근성 검토 없이는 추가하지 않음

DB와 앱은 현재 지원하는 mode만 허용한다. 미래 mode를 문서에 기록했다는 이유로 서버에서 미리 활성화하지 않는다.

## Non-goals

- 범용 광고 네트워크 SDK 연동
- 화면 전체의 원격 레이아웃 구성
- arbitrary HTML 또는 remote script 렌더링
- 자동 재생 carousel
- 콘텐츠 매체마다 별도 kind 생성
- Dashboard와 Account 이외 surface 동시 확장

## Open Design Work Before Coding

- region registry와 이름 확정
- display/selection policy의 서버 저장 위치 결정
- daily rotation에 사용할 비식별 안정 키 결정
- Dashboard와 Account의 정확한 supporting region 위치 확인
- compact card 반응형 동작과 hard cap 확정
- impression/click 측정이 실제로 필요한지 결정

## Dashboard Phase 1 Implementation

- region: `dashboard.supporting`
- presentation: `compact_card`
- display policy: `single + daily_rotate`
- placement: 주요 작업 블록 다음, 최근 활동 영역 이전
- eligible 후보: 기존 developer blog, oracle cloud guide, developer support campaign
- 선택 안정성: 로컬 installation seed + 사용자 현지 날짜 + surface + region
- refresh: sidebar와 동일한 1분 cache 및 focus/visibility 재조회
- failure behavior: 영역을 숨기고 Dashboard의 기존 기능을 유지

이번 단계에서는 policy 전용 DB table을 추가하지 않는다. Dashboard의 `single + daily_rotate`는 앱의 허용된 초기 preset으로 고정하고, Account 구현 전후 실제 운영 필요가 확인될 때 서버 저장형 display policy를 설계한다.

## Dashboard Phase 1 Verification

### 2026-08-13 — Pro plan

- `dashboard.supporting` placements SQL 적용 완료
- Pro audience에서 `developer-support`만 eligible인 것을 확인
- 주요 작업 블록 다음, 최근 활동 영역 이전에 compact horizontal card 표시 확인
- bundled heart icon, `개발자 지원` kind label, 제목과 CTA 정렬 확인
- 크티 후원 페이지 외부 이동 확인
- 기존 Dashboard 핵심 작업 영역을 밀어내거나 가리지 않음을 확인
- Account surface, pair, carousel과 자동 전환은 이번 범위에서 제외
