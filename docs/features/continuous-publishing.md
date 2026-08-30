# 연속 발행

## 목적

연속 발행은 떠오르는 글감을 빠르게 개인 Topics Sheet에 쌓고, 발행 계획이 완성된 글을
사용자가 정한 시간대와 간격에 따라 한 건씩 생성·발행하는 BlogGenius의 새 글쓰기 흐름이다.

현재 구현은 기존 `블로그` 메뉴와 분리된 `블로그 Beta`에서 `바로 생성` 글감을 저장하고
`발행 준비 완료` Queue를 관리하며, 가장 오래된 항목 한 건을 수동으로 실행하는 단계다.
Queue 등록 자체는 AI·이미지 생성·quota·플랫폼 발행을 호출하지 않고, 사용자가 `다음 1건 실행`을
누를 때 기존 생성·발행 엔진이 글감의 발행 계획을 그대로 사용한다.

## 사용자 흐름

```text
빠른 글 작성
  ├─ 글감 저장 → 대기
  ├─ 발행 대기열에 추가 → 발행 준비 완료
  └─ 바로 포스팅 → 즉시 생성·실행

발행 준비 완료
  → 연속 발행기가 한 건 claim
  → 원고 생성
  → 글감별 계획에 따라 공개·임시 저장·예약 등록
  → 결과 기록
```

Queue 등록 자체는 AI 호출을 발생시키지 않는다.

## 저장소와 Queue

- 개인별 Google Spreadsheet의 Topics Sheet가 모든 글감의 source of truth다.
- 수동 입력, Trends, RSS와 다른 channel에서 온 글감도 같은 Topics 계약을 사용한다.
- Queue는 별도 데이터 저장소가 아니라 `발행 준비 완료` 상태의 Topics를 보여주는 projection이다.
- Supabase는 라이선스, 사용량과 server capability 같은 시스템 책임을 유지하며 개인 Queue를 소유하지 않는다.

## 상태 의미

| 상태 | 의미 |
|---|---|
| `대기` | 글감은 저장됐지만 자동 실행에 필요한 발행 계획이 완성되지 않음 |
| `발행 준비 완료` | 원고가 생성된 상태가 아니라 글감과 발행 계획이 유효함 |
| `발행 중` | 한 실행기가 원고 생성과 플랫폼 작업을 처리 중 |
| `발행 완료` | 공개 발행 완료 |
| `임시 저장 완료` | 플랫폼 초안 또는 임시 저장 완료 |
| `예약 포스팅 등록 완료` | 플랫폼에 원고를 올리고 미래 공개 시각 등록 완료 |
| `확인 필요` | 누락, 만료된 예약 시각 등 사용자 판단이 필요함 |
| `실패` | 실행 실패. 자동 재시도 여부는 후속 정책으로 결정 |

예약 발행은 연속 발행기가 예약 시각까지 기다리는 기능이 아니다. 해당 글감을 처리하는 시점에
플랫폼으로 원고를 올리고 미래 공개 시각을 등록한다.

## 설정 소유권

글감이 소유하는 값:

- 발행 플랫폼
- Naver·WordPress 카테고리
- 글쓰기 전략
- 이미지 처리
- 외부 참고 사용
- 공개 발행, 임시 저장 또는 예약 등록
- 예약 공개 시각

연속 발행이 소유하는 값:

- 활성화 여부
- 발행 허용 시간대
- 글 사이의 최소 간격
- 완료·실패 알림

연속 발행기는 글감 소유 값을 전역 설정으로 덮어쓰지 않는다.

## UI와 코드 경계

- 사용자 표시: `블로그 Beta`
- 내부 view: `blog-next`
- DOM·CSS namespace: `blog-next-*`
- UI module: `ui/scripts/features/blog-next/`
- domain contract: `src/continuous-publishing/`
- application API: `/api/v1/continuous-publishing/topics`, `/api/v1/continuous-publishing/queue`
- Queue mutation API: `/api/v1/continuous-publishing/topics/update`, `/api/v1/continuous-publishing/queue/remove`
- 단건 runner API: `/api/v1/continuous-publishing/runner/start`, `/api/v1/continuous-publishing/runner/status`
- 완성 원고 미리보기·직접 실행 API: `/api/v1/blog/local-markdown/preview`, `/api/v1/blog/local-markdown/publish`

새 UI는 legacy blog DOM controller를 호출하거나 복제하지 않는다. 글감 등록 API는 기존 Topics
Sheet gateway만 재사용하고 AI, 라이선스 quota, preview와 Naver/WordPress 발행 dependency를
갖지 않는다. 실제 실행 단계에서는 검증된 생성·발행 엔진을 별도 application boundary로 재사용한다.

## 현재 제공 범위

- `글감 저장`: 아이디어 필드 하나 이상을 확인하고 `대기`로 저장
- `발행 대기열에 추가`: 아이디어, 발행 대상과 예약 정보를 확인하고 `발행 준비 완료`로 저장
- `발행 대기열`: Topics Sheet의 준비된 글감을 행 번호 오름차순으로 표시
- `발행 계획 수정`: 같은 Topics 행에서 플랫폼·카테고리·전략·이미지·외부 참고·발행 방식을 수정
- `대기열에서 빼기`: 행을 삭제하지 않고 상태만 `대기`로 복귀
- `다음 1건 실행`: 행 번호 오름차순의 첫 준비 글감을 생성·발행하고 진행·결과를 표시
- `원고 폴더`: Markdown·이미지를 검증하고 Queue 저장 없이 바로 공개·임시 저장·예약 등록
- `원고 붙여넣기`: 완성된 Markdown을 검증하고 Queue 저장 없이 바로 공개·임시 저장·예약 등록
- 글감별 저장 정보: 플랫폼, 대상별 카테고리, 글쓰기 전략, 이미지 처리, 외부 참고, 발행 방식과 예약 일시

수동 runner는 실행 직전에도 해당 행이 `발행 준비 완료`인지 다시 확인하고, 한 앱 프로세스
안에서 중복 실행을 차단한다. Development에서는 수동 발행 정책을 따르고, Local과 후속 timer 실행은
각 환경의 자동 발행 정책을 우회하지 않는다. 완성 원고 직접 실행도 Local에서는 차단되고
Development·Production의 수동 발행 정책을 따른다. 주기 timer, 무제한 자동 재시도와 여러 PC를 아우르는
distributed lease는 아직 제공하지 않는다.

## 후속 계약

- 여러 PC의 중복 claim 방지
- 예약 시각이 처리 시점에 지났거나 너무 가까운 경우의 확인 정책
- Trends/RSS가 발행 계획을 완성해 자동으로 `발행 준비 완료`가 되는 고급 규칙
