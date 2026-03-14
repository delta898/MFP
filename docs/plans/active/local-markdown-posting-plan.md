# Local Markdown Posting Plan

## Goal
로컬에 준비된 markdown 원고와 같은 폴더의 이미지 자산을 기반으로, BlogGenius의 기존 포스팅 엔진을 재사용해 네이버 블로그 / 워드프레스로 포스팅할 수 있게 한다.

핵심 사용자 경험:
1. 사용자가 Blog > `원고 포스팅` 탭에서 markdown 파일을 선택한다.
2. 앱이 제목 / 본문 / 이미지 블록 / 이미지 파일 존재 여부를 preview와 validation으로 보여준다.
3. 사용자는 포스팅 대상, 포스팅 옵션, 카테고리, 예약 일시를 조정한다.
4. 검증을 통과하면 기존 포스팅 엔진을 통해 임시저장 / 즉시 발행 / 예약 발행을 실행한다.

## Naming
- 사용자 노출 가칭: `원고 포스팅`
- 내부 코드명: `local markdown posting`
- 탭 순서:
  1. `빠른 포스팅`
  2. `일괄 포스팅`
  3. `원고 포스팅`

라벨은 후속 피드백에 따라 변경 가능하지만, 1차 구현에서는 `원고 포스팅`을 임시 확정값으로 사용한다.

## Scope
1차 구현 범위:
- 단일 markdown 파일 선택
- 파일 확장자: `.md`, `.markdown`
- 제목은 첫 `# H1`에서 추출
- markdown parsing은 기존 `Utils.parseMarkdown` / 기존 이미지 토큰 규칙을 재사용
- 이미지 자산은 markdown 파일과 같은 폴더에서 기존 규칙(`00_image.png` 등 prefix 규칙)으로 찾는다
- 포스팅 대상 선택:
  - 네이버 블로그
  - 워드프레스
- 포스팅 옵션 선택:
  - 즉시 발행
  - 임시 저장
  - 예약 발행
  - 예약 발행 시 예약 일시
- 실행 옵션 선택:
  - 보이지 않게 실행
  - 이미지 생성
- 카테고리 입력:
  - 네이버 카테고리
  - 워드프레스 카테고리
- preview / validation 결과 표시
- 기존 발행 엔진 재사용

1차 범위에서 제외:
- 폴더 전체 일괄 스캔
- 여러 markdown 파일 동시 포스팅
- 자유로운 상대경로 이미지 해석
- excerpt / slug 생성
- 원고 수정기능
- 외부 참고 URL / 외부 참고 사용 옵션

## UX Direction
### 1. 입력
- 사용자는 File Dialog로 markdown 파일 1개를 선택한다.
- 선택 직후 다음 정보가 로드된다:
  - 파일 경로
  - 제목(H1)
  - 본문 preview
  - 이미지 블록 목록
  - 실제 이미지 파일 매칭 결과

### 2. Preview / Validation
- preview는 단순 텍스트가 아니라 실제 포스팅 전 점검용 화면이어야 한다.
- 표시 대상:
  - 제목
  - 본문 일부 또는 전체 preview
  - 파싱된 섹션 구조
  - 이미지 placeholder 목록
  - 각 placeholder에 대응하는 실제 이미지 썸네일/파일 정보

validation 정책:
- `error`
  - markdown 파일을 읽을 수 없음
  - 첫 H1 제목이 없음
  - 포스팅 대상이 하나도 선택되지 않음
  - 예약 발행인데 예약 일시가 없음
  - image block이 있는데 필수 이미지 파일을 찾지 못함
- `warning`
  - markdown 형식은 읽히지만 일부 block이 애매함
  - 일부 이미지는 fallback 생성이 필요함

### 3. 실행
- preview / validation 통과 후 `포스팅` 실행 가능
- 로컬 markdown 포스팅은 queue 기반 저장과 달리 즉시 실행 중심이다
- 단, 실제 저장/실행 상태는 기존 엔진의 실행 결과를 그대로 따른다

## Data / Settings Policy
- 이 기능 전용 설정은 `config/config.json`에 저장하지 않는다
- 사용자의 마지막 입력값 중 반복 사용성이 높은 항목만 `browser localStorage`에 저장한다
  - 마지막 네이버 카테고리
  - 마지막 워드프레스 카테고리
  - 마지막 포스팅 옵션
  - 마지막 대상 플랫폼
  - 마지막 보이지 않게 실행 여부
  - 마지막 이미지 생성 여부
- 선택한 파일 경로 자체는 localStorage에 강하게 의존하지 않는다

## Processing Rules
### Markdown
- 기준 파일은 사용자가 선택한 markdown 파일 1개
- `contents.md` 고정이 아니라 선택 파일을 직접 사용
- 내부 파싱 규칙은 기존 `contents.md` 포맷과 최대한 동일하게 유지
- 제목은 첫 `# ...` 라인에서 추출

### Image Resolution
- asset root는 선택한 markdown 파일의 부모 폴더
- 이미지 파일은 기존 prefix 규칙을 그대로 사용
- 로컬 자산 우선
- 이미지 파일이 없을 때만 `이미지 생성` 옵션에 따라 fallback 허용

fallback 규칙:
- 로컬 이미지 존재 -> 업로드 사용
- 로컬 이미지 없음 + `이미지 생성=true` -> 기존 생성 흐름 사용 가능
- 로컬 이미지 없음 + `이미지 생성=false` -> validation error 또는 warning 후 실행 차단

## Architecture Direction
- UI 전용 임시 기능이 아니라, 기존 포스팅 파이프라인이 받을 수 있는 새로운 source type으로 설계한다
- 개념:
  - 기존 source: sheet topic / generated content directory
  - 신규 source: `local_markdown`

권장 구조:
- UI:
  - 파일 선택
  - preview / validation
  - 실행 요청
- Internal API / service:
  - markdown file + options -> normalized local posting request
  - preview/validation 결과 생성
  - execute 시 기존 네이버/워드프레스 발행 함수 재사용
- Core:
  - `contents.md` 고정 경로 의존 부분을 선택 markdown 파일 경로로 확장

## Proposed Request Shape
```json
{
  "source": {
    "type": "local_markdown",
    "markdown_path": "/absolute/path/post.md"
  },
  "targets": ["naver", "wordpress"],
  "options": {
    "post_status": "publish",
    "schedule_date": "",
    "headless": true,
    "image_generation": false
  },
  "categories": {
    "naver": "일상/생각",
    "wordpress": "Daily"
  }
}
```

## First Implementation Steps
1. Blog 탭에 `원고 포스팅` 탭과 기본 폼 추가
2. localStorage persistence 연결
3. 파일 선택 / preview / validation API 추가
4. `Core.publishToBlog` / WordPress publish 경로가 arbitrary markdown path를 받을 수 있도록 확장
5. 로컬 이미지 해석 + fallback 처리 연결
6. 실제 포스팅 실행 API 연결
7. 문서화 및 사용자 smoke test

## Open Questions
- preview에서 본문 전체를 다 보여줄지, 요약 + raw 보기 토글을 둘지
- 이미지 누락을 1차에서 hard error로 둘지, warning + 실행 허용으로 둘지
- 예약 발행의 경우 네이버/워드프레스별 지원 정책 차이를 UI에서 어떻게 드러낼지

## Validation Target
- 사용자가 임의의 markdown 파일을 선택할 수 있다
- preview에서 제목/본문/이미지 매칭 결과를 확인할 수 있다
- validation error가 있으면 실행이 차단된다
- 동일 폴더 이미지가 네이버/워드프레스 포스팅에 반영된다
- 즉시 발행 / 임시 저장 / 예약 발행 흐름이 기존 엔진 결과와 일치한다
