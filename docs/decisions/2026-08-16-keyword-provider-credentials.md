# Keyword Provider Credentials Are Server Managed

## Decision

BlogGenius가 사용하는 Naver Search Ads와 NAVER API HUB 자격증명은 사용자
설정이 아니라 BlogGenius 서비스 자격증명으로 관리한다. 운영 자격증명은 원격
keyword gateway의 secret store에만 보관한다.

## Context

사용자 직접 설정에는 Search Ads access license, secret key, customer ID와 API
HUB client ID, client secret이 필요하다. 일반 사용자에게는 발급 절차와 항목 수가
과도하다. 반면 공용 자격증명을 데스크톱 앱에 포함하면 패키지에서 추출할 수 있고,
공용 quota와 광고 계정 권한이 노출된다.

API HUB Search API는 일 25,000회 제한이 있다. 기존 후보 30개 방식은 입력
키워드 1개당 Blog Search를 최대 31회 호출하므로 서비스 제공 방식에 맞지 않는다.

## Consequences

- 사용자 설정 화면과 `config.json`에서 네이버 키워드 API credential을 제거한다.
- 로컬 환경변수는 개발 및 진단 목적으로만 유지한다.
- 운영 호출은 라이선스 인증, cache, rate limit, backoff가 있는 gateway를 통한다.
- 기본 연관 후보를 8개로 제한하고 API 호출 전 검색량과 주제 관련성으로 선별한다.
- 서버 장애나 quota 부족 시 검색 지표 없이 AI 제목 추천을 계속 제공한다.
- gateway 구현 전에는 운영 빌드에서 검색 지표가 연결되지 않은 상태가 정상이다.
