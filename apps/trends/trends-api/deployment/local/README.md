# Local Trends API Deployment

Local Trends API의 Docker Compose 배포 단위입니다. Compose 파일은 API 컨테이너만 소유하며,
Collector 설정 파일을 직접 읽지 않습니다.

사용자는 repository root에서 다음 검증 명령을 실행합니다.

```bash
npm run trends:api:local:container-smoke
```

이 helper는 다음 작업을 수행합니다.

1. Local Supabase 연결 정보를 확인합니다.
2. Collector의 Local 설정에서 공유 token을 읽습니다.
3. 권한이 제한된 임시 API runtime 환경 파일을 만듭니다.
4. 이 폴더의 `compose.yml`로 컨테이너를 실행하고 인증된 smoke를 수행합니다.
5. 검증 후 컨테이너와 임시 환경 파일을 정리합니다.

따라서 `docker compose up`을 직접 호출하거나 Local Supabase admin key를 영구 파일에 복사하지
않습니다. 실제 Collector 설정은
`apps/trends/trends-collector/config/.env.trends-collector.local`에 둡니다.
