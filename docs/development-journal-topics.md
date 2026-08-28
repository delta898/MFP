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
