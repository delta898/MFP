# BlogGenius 개발 일지 글감

BlogGenius를 함께 개발하며 얻은 재사용 가능한 지식과 의사결정을 모아 둔다. 완성된 제목이나
본문이 아니라, 나중에 BlogGenius가 유용한 글로 확장할 수 있는 `주제 + 핵심 seed` 형식으로
기록한다.

실제 secret, token, project 정보, 개인 데이터와 악용 가능한 운영 세부사항은 포함하지 않는다.
관련 기능의 통합 검증이나 운영 설계가 마무리되는 자연스러운 시점에 선별하여 다시 제안한다.

## 저장소와 인증 정보

### Supabase Edge Function과 Secret의 역할과 주의사항

Supabase Edge Function은 Desktop이 외부 서비스의 자격증명을 직접 갖지 않고 서버를 통해 제한된
기능만 호출하게 만드는 경계가 된다. Secret은 Function 내부에서 외부 provider를 호출할 때만
보호되며, Desktop에 반환하는 순간 더 이상 secret이 아니다. BlogGenius의 Runtime Config 개선과
Naver API 서버 이전 과정을 바탕으로 Secret을 저장하는 것만큼 반환 범위와 API 계약을 제한하는
일이 중요한 이유를 설명한다.

### Google Client ID와 Client Secret의 보안 모델

서버 애플리케이션의 secret과 설치형 Desktop OAuth Client Secret은 배포·노출 모델이 다르다.
BlogGenius가 Google OAuth를 서버 프록시로 옮기지 않고 Desktop의 직접 OAuth와 PKCE를 유지하면서
DB 노출 경로를 제거한 이유, 자격증명 교체 시 앱 업데이트와 사용자 재연결에 미치는 영향, 소스와
로그에 값을 남기지 않는 원칙을 정리한다.

### Access Token과 Refresh Token으로 이해하는 OAuth 2.0

짧게 사용하는 access token과 장기 권한을 이어 주는 refresh token의 역할, scope·만료·재발급·
재인증의 관계를 Google Sheets 연결 사례로 설명한다. 토큰을 client id/secret과 혼동하지 않는 법,
사용자별 토큰을 안전하게 저장하고 로그에서 제외하며 연결 해제 시 폐기하는 원칙도 함께 다룬다.

### 장기 비밀키 대신 단기 접근 토큰을 발급하는 이유

BlogGenius Desktop이 Trends API를 읽어야 하지만 서버의 장기 `TRENDS_API_TOKEN`을 설치 파일에
넣으면 누구나 추출해 수집·export 같은 내부 기능까지 호출할 수 있다. 이를 피하기 위해 Desktop은
기존 라이선스 키와 HWID를 Supabase Edge Function에 제시하고, Function은 라이선스를 확인한 뒤
약 15분 동안 `trends:read` 범위에서만 유효한 서명 토큰을 발급한다. Desktop은 이 토큰을 파일에
저장하지 않고 메모리에서 재사용하며, Trends API는 서명, 만료 시각, issuer, audience와 scope를
모두 확인한 뒤 읽기 endpoint만 허용한다.

```text
Desktop
  -> 라이선스 확인 요청
Supabase Edge Function
  -> 단기 trends:read 토큰 발급
Desktop
  -> Authorization: Bearer <short-lived token>
Trends API
  -> 서명·만료·scope 검증 후 읽기 허용
```

이 구조가 장기 secret의 Desktop 노출을 막고, 권한과 유효기간을 최소화하며, 유출 시 피해 시간을
제한하는 원리를 설명한다. 또한 Development Edge Function이 Development secret으로 서명한 토큰을
Production Trends API가 거부한 사례를 통해 토큰 발급자와 검증자가 같은 환경의 secret, issuer와
audience 계약을 공유해야 한다는 점, 단기 토큰 자체보다 토큰을 무제한 발급할 수 있는 signing
secret을 더 강하게 보호해야 한다는 점을 정리한다.

### 값의 민감도와 사용 범위로 저장 위치 결정하기

GitHub Actions를 설정하며 모든 값을 막연히 `Secret`으로 취급하면 오히려 용도와 책임 경계가
흐려진다는 점을 배웠다. 먼저 `Repository`와 `Environment`는 값이 사용되는 범위, `Secret`과
`Variable`은 값의 민감도를 나타내는 서로 다른 축이라는 것을 설명한다.

BlogGenius의 실제 분류를 사례로 사용한다. 사용자·업무 데이터는 Supabase 테이블과 RLS가,
외부 provider의 서버 자격증명은 Supabase Edge Function Secret이, 빌드·배포 입력은 GitHub
Actions가, 개발자 PC의 Desktop OAuth 설정은 Git에서 제외된 환경 파일이, 사용자별 access·refresh
token은 로컬 사용자 설정이 담당한다. Supabase URL과 publishable/anon key처럼 공개 클라이언트에
포함될 수 있는 값은 Variable 후보이고, access token·DB password·service role key·PAT처럼 권한이
큰 값은 Secret이어야 한다. 이름에 `KEY`가 들어가는지가 아니라 노출됐을 때 행사할 수 있는 권한과
실제 사용 위치를 기준으로 분류해야 한다는 교훈을 정리한다.

### 이름은 비슷하지만 서로 다른 네이버 API 구분하기

BlogGenius가 사용하는 기능을 모두 `네이버 검색 API`라고 부르면 발급처, 자격증명과 quota가
뒤섞이기 쉽다. 현재 연동은 크게 세 계약으로 나뉜다.

- **Naver Developers Search OpenAPI**는 `Client ID + Client Secret`을 사용하며 Blog, News,
  Shopping 검색 endpoint를 제공한다. BlogGenius에서는 글쓰기용 외부 참고 블로그 검색, 추천용
  뉴스 검색과 쇼핑 상품 정보 fallback에 사용한다.
- **Naver Search Ads API**는 `API Key + Secret Key + Customer ID`와 요청 signature를 사용한다.
  키워드 탐색에서 월간 검색량과 연관 키워드 후보를 얻는 역할을 맡는다.
- **NAVER API Hub Search API**는 Search Ads나 Naver Developers와 별도의 `Client ID + Client
  Secret` 계약이다. 키워드 탐색에서 최근 7일 블로그 문서 수를 관측해 경쟁도와 기회 지수를
  계산하는 데 사용한다.

따라서 `블로그 검색`은 하나의 별도 API key를 뜻하지 않는다. 외부 참고 글을 찾을 때는 Naver
Developers의 Blog Search를, 키워드 경쟁도를 측정할 때는 NAVER API Hub의 Blog Search를 사용한다.
같은 블로그 검색처럼 보여도 인증 방식, 호출 목적, quota와 장애 대응이 다르므로 자격증명을 서로
fallback하거나 하나의 설정으로 합치면 안 된다. BlogGenius가 이 값들을 사용자 설정에서 제거하고
기능별 Supabase Edge Function Secret으로 분리한 과정과 함께, API를 도입할 때 `제품명`이 아니라
`발급 체계 + 인증 방식 + endpoint + 사용 목적 + quota` 표를 먼저 만드는 방법을 정리한다.

## 개발과 배포 환경

### GHCR로 Docker image를 보관하고 같은 artifact를 승격하기

GHCR(GitHub Container Registry)은 소스 저장소가 아니라 빌드가 끝난 Docker image를 보관하는
GitHub의 container registry다. GitHub Actions가 테스트를 통과한 Trends API image를 Git commit과
연결된 tag·digest로 GHCR에 올리고, Development와 Production 서버는 image를 다시 빌드하지 않고
정확한 digest를 내려받아 실행할 수 있다. 이를 통해 Development에서 검증한 실행물과 Production에
배포한 실행물이 한 비트도 다르지 않음을 확인하고, 문제가 생기면 이전 digest로 되돌리는 흐름을
설명한다.

Docker Hub가 Docker 생태계 전반에서 널리 사용하는 독립 registry라면 GHCR은 GitHub repository,
Actions 권한, Packages와 조직·사용자 권한 모델에 자연스럽게 연결된다. 공개 범용 image 배포와
Docker 중심 커뮤니티 노출에는 Docker Hub가 편하고, GitHub에 소스와 CI가 있으며 repository 권한과
image 권한을 함께 관리하려는 프로젝트에는 GHCR이 편하다. Registry는 container를 실행하는 서버나
배포 도구가 아니므로 `소스 저장소 -> CI build -> image registry -> 실행 서버`의 역할을 구분하고,
tag는 움직일 수 있지만 digest는 immutable identity라는 점도 함께 정리한다.

### Local에서 Development를 거쳐 Production까지 DB 변경을 안전하게 승격하기

처음에는 필요한 SQL을 환경마다 직접 실행하면 된다고 생각하기 쉽지만, 시간이 지나면 어느 DB에
무엇이 적용됐는지 알 수 없고 운영 데이터에 실수로 개발 변경을 적용할 위험이 커진다. BlogGenius가
Local Docker Supabase, 원격 Development Supabase와 Production Supabase의 역할을 분리하고,
canonical migration을 모든 환경의 단일 변경 이력으로 삼은 과정을 설명한다.

Feature 브랜치에서는 Local DB를 reset하여 빈 데이터베이스에 migration과 seed가 처음부터 순서대로
적용되는지 확인한다. `dev`에서는 같은 migration과 Edge Function을 Development에 적용한 뒤 원격
migration 이력, Function 상태와 공개 smoke 결과를 읽어 credential이 없는 evidence를 만든다.

먼저 배포 `artifact`와 `fingerprint`의 개념부터 설명한다. Artifact는 설치 파일이나 DB 복사본이
아니라, 이번에 승격할 변경 묶음을 기계가 비교할 수 있도록 표현한 JSON 명세다. BlogGenius는 다음
정보를 artifact에 기록한다.

- 모든 migration의 version, 경로와 파일 내용 SHA-256
- 모든 Edge Function 및 shared module의 경로와 파일 내용 SHA-256
- Function 이름과 `verify_jwt` 정책
- 환경·hosted-development manifest의 파일 내용 SHA-256
- 정확한 40자리 Git commit SHA

이 artifact 전체를 일정한 순서의 JSON으로 만든 뒤 다시 SHA-256으로 계산한 하나의 64자리 대표값이
`fingerprint`다. 파일을 압축하거나 DB에 합치는 작업이 아니며 실제 DB 데이터, 사용자 정보, API
Secret, token과 비밀번호는 포함하지 않는다. Migration SQL 한 글자, Function 코드 한 줄, JWT 정책,
manifest 또는 Git commit 중 하나만 달라져도 fingerprint가 달라진다.

Development 검증 결과에는 `fingerprint ABC를 검증했다`는 evidence를 남긴다. Release 후보에서 같은
artifact를 다시 계산했을 때 ABC가 아니면 Development에서 검증하지 않은 변경이 섞인 것으로 보고
승격을 차단한다. Fingerprint는 두 변경 묶음이 동일하다는 증거이지 그 내용이 올바르다는 증거는
아니다. 올바름은 Local reset, 자동 테스트, Development smoke와 사용자 검증이 담당하고, fingerprint는
검증한 바로 그 대상을 Production 후보로 가져가는 역할을 담당한다.

Production checklist는 배포 버튼이 아니라 `동일한 변경이 Development에서 검증되었다`는 사실을
확인하는 승인 준비 단계다. 실제 운영 적용 전에는 read-only schema audit, backup/PITR, 대상 project
ref, 영향 범위와 중단 조건을 다시 확인하고 사용자 승인을 받아야 한다. 적용 순서는 schema migration
후 Edge Function이며, 완료 후 read-only smoke와 결과 기록을 남긴다. 장애 시 과거 migration을
수정하거나 무리하게 되돌리기보다 새 migration으로 forward fix한다.

이번 Naver Gateway 작업처럼 기존 CHECK constraint에 새 cache kind를 추가하는 변경은 테이블·컬럼·
데이터를 삭제하지 않는 additive migration이라 구버전과 함께 적용하기 쉽다. 반면 credential row
삭제처럼 옛 앱이 의존하는 변경은 migration 파일이 있다는 이유만으로 안전하지 않다. 최소 지원
버전, 구버전 종료 정책과 rollback·복구 조건까지 함께 설계해야 한다는 교훈을 정리한다.
