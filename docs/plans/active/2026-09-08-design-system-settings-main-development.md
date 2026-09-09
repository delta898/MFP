# 설정 Beta 개편 개발 기록

## Branch

- Branch: `codex/feature/design-system-settings-main`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-08
- Status: 진행 중 — 기본 연결 및 AI sub-feature 통합 완료, 다음 top menu 단계 대기

## 사용자 필요와 목표

기존 `설정`을 안정적인 fallback으로 보존하면서, Blog Beta에서 검증한 디자인 원칙과 panel anatomy를 적용한 `설정 Beta`를 별도 구축한다. 단순한 시각 교체가 아니라 설정과 각 기능 화면의 소유권을 정리하고, 여러 기능이 공유하는 값은 설정에서 기본값으로 관리하며 각 기능은 필요할 때 이를 선택하거나 override할 수 있는 구조를 지향한다.

## 범위

1. 기존 설정과 독립된 `설정 Beta` surface 및 navigation
2. 합의된 top menu: `기본 연결`, `AI`, `글쓰기`, `발행`, `부가 서비스`, `앱`
3. 첫 적용 대상인 `기본 연결`과 local sub-menu `콘텐츠 공간`, `블로그 발행 채널`
4. 탭·panel 시작 구조, 상태, action과 저장 흐름의 공통 계약
5. 기존 설정 API와 데이터의 안전한 재사용 및 단계별 migration
6. 기존 설정을 대체하기 전 자동 검증과 사용자 UI 확인

## 명시적 비범위

- 기존 `설정` surface의 수정 또는 제거
- 전체 설정 탭의 동시 migration
- 프로필·그룹 모델의 선제적 도입
- 합의되지 않은 로컬 override 또는 설정 schema 변경
- 버전 변경, release, tag, push 또는 배포

## 설정 소유권 기준

- 여러 메뉴가 함께 참조하는 연결 정보와 공통 기본값은 `설정 Beta`에서 관리한다.
- 각 기능 화면은 공통값을 선택하고, 사용자 필요가 확인된 값만 local override를 제공한다.
- 하나의 설정에는 canonical 편집 위치를 하나만 두며 다른 화면은 요약·상태·바로가기를 제공할 수 있다.
- 여러 값을 이름 있는 profile로 묶는 기능은 반복 조합과 재사용 필요가 실제로 확인됐을 때만 도입한다.
- 필수 여부는 고정 IA 분류가 아니라 활성 기능과 준비 상태에 따라 표현한다.

## 제안 IA

```text
설정 Beta
├─ 기본 연결
│  ├─ 콘텐츠 공간
│  └─ 블로그 발행 채널
├─ AI
├─ 글쓰기
├─ 발행
├─ 부가 서비스
└─ 앱
```

`콘텐츠 공간`은 provider-neutral한 사용자 목적을 표현하고, 현재 실제 연결 수단인 Google 계정과 Google Spreadsheet는 panel 내부에서 명확히 표시한다. `블로그 발행 채널`은 네이버 블로그와 워드프레스를 시작으로 향후 티스토리 등 다른 발행 플랫폼을 같은 목적 아래 확장할 수 있어야 한다.

## 구현 단계

1. 설정 Beta shell과 기본 연결
2. AI
3. 글쓰기
4. 발행 공통값
5. 부가 서비스
6. 앱 및 고급 설정
7. 기존 설정 대체 준비와 compatibility 정리

각 단계는 독립 sub-feature branch와 개발 기록을 갖고, focused contract 및 관련 browser smoke 후 사용자 UI 검토를 거쳐 이 branch에 통합한다.

## 사용자와 결정한 사항

- 기존 `설정`을 변경하지 않고 `설정 Beta`를 별도 구축한다.
- 최종 검증과 승인 후 기존 설정을 대체한다.
- top menu는 `기본 연결`, `AI`, `글쓰기`, `발행`, `부가 서비스`, `앱`으로 시작한다.
- `기본 연결`의 local sub-menu는 `콘텐츠 공간`, `블로그 발행 채널`로 구성한다.
- `Google 작업공간` 대신 provider-neutral하고 BlogGenius의 언어에 맞는 `콘텐츠 공간`을 사용한다.
- 설정은 여러 메뉴가 공유하는 연결과 기본값을 관리하고, 로컬 화면은 이를 선택하거나 필요한 경우 override한다.
- `발행 프로필` 같은 group 개념은 현재 범위에서 확정하거나 구현하지 않는다.
- `설정 Beta`도 기존 `config.json` 하나를 canonical 저장소로 사용하고 내부 JSON schema를 유지한다. 화면과 API의 편집 계약만 panel 단위로 개선하며, JSON schema 변경은 별도의 명시적 migration 과제로 다룬다.

## 진행 및 변경 기록

- 2026-09-08: `codex/feature/design-system-main`에서 설정 개편 통합 branch를 시작했다.
- 2026-09-08: 설정 소유권 기준과 첫 IA를 사용자와 합의했다.
- 2026-09-08: 첫 sub-feature에서 기존 설정과 공존하는 `설정 Beta` shell, 여섯 top menu와 `기본 연결`의 두 local menu를 구현했다.
- 2026-09-08: 기존 `config.json`과 내부 schema를 유지하되 선택한 연결 범위만 저장하는 전용 API 계약을 확정했다.
- 2026-09-08: 공통값은 설정이 정의하고 기능은 선택·상속하며 필요한 작업만 local override한다는 소유권 기준을 `docs/architecture/settings-information-architecture.md`에 현행화했다.
- 2026-09-08: Settings Beta 첫 stage에서 Blog Beta의 top/local navigation과 Timer를 복제하지 않고 공통 pattern/widget으로 재사용하도록 경계를 고도화했다.
- 2026-09-09: AI sub-feature를 역할 중심 단일 화면으로 통합했다. 글쓰기·이미지·보조 대화 모델은 shared Settings card/field/choice/select pattern과 provider별 profile 보존 계약을 사용한다. 상세 기록은 `docs/plans/archive/2026-09-09-design-system-settings-02-ai-model-roles-development.md`를 따른다.
- 2026-09-09: 글쓰기 stage는 Settings Beta의 단일 `글쓰기 기본값` 관리부터 진행하고 Blog Beta의 상속·작업별 override는 사용자 UI 확인 뒤 별도 단계로 나누기로 했다. 검색·발견 전략은 글쓰기 기본값에서 제외한다.

## 검증 계획

- 신규 설정 Beta UI structure·navigation focused contract
- 기존 설정 DOM·탭·deep link 불변 contract
- 기본 연결 form의 loading·dirty·success·error 상태 검증
- keyboard tab navigation 및 narrow layout browser smoke
- 사용자 hands-on UI 확인
- parent 통합 전 full unit suite는 별도 사용자 승인 후 실행

## 현재 위험과 후속 결정

- 기존 major settings API의 전체 payload 저장은 Beta에서 사용하지 않고, 첫 stage에 scoped save 경계를 추가했다. 이후 top menu도 같은 원칙으로 독립 저장 범위를 가져야 한다.
- 기존 dashboard와 feature deep link는 설정 Beta 완성 전까지 기존 설정을 계속 가리킨다.
- top menu별 실제 설정 위치는 소유권 분류 결과에 따라 사용자와 단계별로 확정한다.
- 화면 style 선택 UI와 local override의 구체 범위는 별도 합의가 필요하다.
