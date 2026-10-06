# Site Hosting 연결 해제와 삭제 안전성

## 상태

방향 합의 및 API 조사 완료. 난수 hostname 실험에서 Worker Custom Domain 해제 직후 Cloudflare가 생성한 DNS 레코드가 사라지는 것을 확인했다. 실제 사이트 해제·삭제 기능은 아직 구현하지 않았다.

## 맥락

Site Hosting의 생성과 운영은 세 단계로 이해한다.

1. 사이트 생성: `workspace/site-hosting/sites/{site_id}`에 로컬 사이트 파일을 만든다.
2. 기본 연결: Cloudflare Worker를 만들거나 기존 Worker를 재사용해 기본 주소(`workers.dev`)를 제공한다.
3. 도메인 연결: Worker Custom Domain을 연결하고 Cloudflare가 해당 호스트 이름을 DNS와 인증서 설정에 연결한다.

해제와 삭제도 이 단계의 역순으로 다루되, 사용자 데이터와 외부 DNS 변경을 추측으로 정리하지 않는다.

## 사용자와 합의한 방향

- 사용자 도메인 연결 해제와 기본 주소(Worker) 연결 해제는 서로 다른 작업이다.
- 사용자 도메인만 해제하면 Worker와 기본 주소는 유지한다.
- 기본 연결을 해제하면 Worker를 삭제하며, 기본 주소도 사라진다.
- 사용자 도메인이 연결된 동안에는 기본 연결 해제를 허용하지 않는다. 먼저 사용자 도메인을 해제하게 한다.
- 사이트 삭제는 연결된 사용자 도메인과 앱 소유가 확인된 Worker를 정리한 후 진행한다.
- 사이트 로컬 파일은 바로 지우지 않는다. `workspace/site-hosting/archive/` 아래로 옮겨 보존하고, 사용자가 직접 확인·이동·삭제한다. 앱의 archive 복원/정리 기능은 범위에 포함하지 않는다.
- 설정, DNS, 사용자 데이터의 변경은 보수적으로 처리한다. 복합 작업 중 하나라도 실패하거나 예상과 다른 상태를 발견하면 이후 단계를 강제로 진행하지 않고 멈춘다.

## 현재 코드와 Cloudflare API 조사

- 앱은 `workers.domains.update`로 Worker Custom Domain을 연결한다. 앱이 DNS Records API를 직접 호출해 레코드를 만드는 흐름은 없다.
- Cloudflare 문서는 Worker Custom Domain을 붙일 때 DNS 레코드와 인증서를 자동으로 만든다고 설명한다. 같은 호스트에 기존 CNAME이 있으면 연결이 실패할 수 있다.
- 연결 API 응답과 로컬 manifest에는 Worker 도메인 binding의 ID, 호스트 이름, zone ID/name, 서비스 이름 등이 기록된다. DNS 레코드 ID나 연결 전 레코드 상태는 기록하지 않는다.
- 앱은 `zone.read`와 `dns.read` scope를 요청한다. 사용자는 Cloudflare OAuth client에 DNS Read를 추가하고 재인증했으며, DNS Records API 읽기와 Worker custom-domain 목록 조회를 확인했다. DNS Write는 요청하지 않는다.
- 배포는 `bg-{site_id}` 이름의 Worker가 이미 있으면 새로 만들지 않고 재사용할 수 있다. 따라서 manifest의 `worker_name`만으로 앱이 만든 Worker라고 단정할 수 없다. 생성/재사용 여부나 소유권 증거도 현재 저장하지 않는다.
- 현재 Custom Domain 연결 외에 연결 해제, 기본 Worker 해제, 사이트 삭제 기능은 없다.

## Dry-run 범위

Dry-run은 변경 없이 현재 Cloudflare 상태를 조회해 작업 계획과 차단 사유를 보여주는 단계로 정의한다.

1. 저장된 binding ID로 계정의 Worker Domain 목록/상세를 확인한다. ID, hostname, zone, service가 로컬 manifest와 예상 Worker에 모두 일치하는지 검증한다.
2. Worker에 붙은 전체 도메인 binding을 확인해 manifest에 없는 추가 연결도 찾는다. 하나라도 알 수 없거나 예상 밖이면 Worker 삭제를 막는다.
3. DNS Read 권한이 준비된 경우, 정확한 zone 및 hostname으로 레코드를 조회해 레코드 종류·값·프록시 상태·ID를 계획에 표시한다.
4. binding 또는 zone이 없거나, 로컬 값과 Cloudflare 값이 다르거나, 권한/조회가 실패하면 “안전하게 확인할 수 없음”으로 중단한다. 이름이 같다는 이유만으로 DNS 레코드 소유권을 인정하지 않는다.
5. Dry-run 결과는 조회 시점의 스냅샷일 뿐이다. 실제 변경 직전 동일 검증을 다시 수행한다.

기존 hostname의 DNS Read 결과만으로 과거 레코드의 생성 주체를 증명할 수는 없다. 다만 임의 hostname 실험에서는 Worker Custom Domain 연결 시 proxied `AAAA 100::` 레코드가 생성됐고, binding DELETE 직후 해당 레코드가 사라졌다. 이는 한 번의 API 동작 관찰이며 Cloudflare 공식 문서는 DNS 삭제를 보장하지 않는다. 제품 해지 로직은 DNS DELETE를 직접 호출하지 않고 binding 해제 후 DNS 상태를 다시 조회해야 한다. 레코드가 남거나 결과가 불명확하면 성공으로 간주하지 않고 중단·안내한다.

Cloudflare의 Advanced Certificate는 Custom Domain 삭제만으로 자동 삭제되지 않는다고 문서에 명시되어 있다. 인증서는 남아 있어도 동작 문제는 없다고 하나 목록에 혼동을 줄 수 있으므로, 우선 자동 삭제하지 않고 사용자에게 남을 수 있음을 알리는 방향으로 둔다.

## 제안 작업 순서와 중단 규칙

### 사용자 도메인 해제

1. Dry-run으로 저장된 binding과 Cloudflare 실제 상태를 대조한다.
2. 사용자에게 해제 대상 hostname과 인증서/DNS 처리 범위를 보여주고 확인받는다.
3. binding ID로 Worker Domain 연결만 해제하고, 결과를 다시 조회해 분리 여부를 확인한다.
4. 앱은 DNS DELETE를 호출하지 않는다. binding 해제 후 DNS Read로 해당 hostname을 다시 조회한다. 레코드가 남거나 조회가 실패하면 해지를 완료 상태로 기록하지 않고 멈춰 안내한다. 자동 정리는 이번 실험에서 관찰했지만 문서상 보장이 아니므로 재조회가 필요하다.
5. 로컬 binding metadata는 분리 성공 확인 후 갱신한다. 실패 시 기존 정보는 보존한다.

Cloudflare 공식 문서는 Custom Domain 삭제 API의 DNS 레코드 잔존/삭제 결과를 명확히 보장하지 않는다. 임의 hostname 실험에서는 자동 삭제를 확인했으나, 제품 로직은 해제 후 DNS를 다시 조회해야 한다.

### 기본 Worker 연결 해제

1. Worker에 연결된 모든 Custom Domain binding을 조회한다. 하나라도 있으면 해제를 거부하고 도메인부터 해제하도록 안내한다.
2. 현재 배포 과정은 같은 이름의 기존 Worker를 재사용할 수 있으므로, Worker 소유권이 앱 생성으로 확정되지 않으면 자동 삭제하지 않는다.
3. 소유권과 의존 관계가 확인된 경우에만 Worker를 non-force 삭제하고, 삭제를 재조회해 확인한다. Cloudflare의 force 삭제 옵션은 의존 서비스 손상을 허용할 수 있어 사용하지 않는다.
4. Worker 삭제 확인 뒤에만 로컬 deployment metadata를 갱신한다.

### 사이트 삭제

1. 한 번의 사전 계획에서 hostname/binding, Worker 소유권/의존성, archive 목적지를 모두 확인하고 사용자에게 요약한다.
2. 외부 작업은 사용자 확인 후 수행한다. Custom Domain 해제 검증, Worker 삭제 검증 순서로 진행한다.
3. 어느 단계든 실패, drift, 모호한 소유권이 나오면 즉시 멈춘다. Worker 삭제를 강행하거나 로컬 파일을 이동하지 않는다.
4. 모든 외부 자원 정리가 확인된 뒤에만 사이트 디렉터리를 archive로 이동한다. 파일 이동은 같은 workspace 안에서 원자적으로 수행하고, 이동 실패 시 원본을 보존한다.
5. archive 경로를 사용자에게 알린다. 앱은 archive의 복원이나 영구 삭제를 자동 관리하지 않는다.

## 확인한 실험

- `scripts/cloudflare-domain-detach-test.js --run`으로 난수 Worker와 `<random>.bloggenius.kr` custom domain을 생성했다.
- 연결 뒤 DNS Read에서 proxied `AAAA 100::` 레코드와 Worker domain binding을 확인했다.
- Worker domain DELETE 후 binding 목록이 비었고, 직후 DNS 레코드 조회도 비었다(약 225ms). 임시 Worker 삭제 후에도 DNS 레코드는 없었다.
- 실험은 DNS Records DELETE API를 호출하지 않았다. 스크립트는 `--run` 없이는 변경하지 않으며 `--inspect-only`로 특정 난수 리소스를 읽기 전용 조회할 수 있다.
- 첫 업로드는 multipart 형식 오류로 실패했고, API로 테스트 리소스가 남지 않았음을 확인했다. metadata JSON multipart 파트를 명시한 재시도는 성공했다.

## 구현 전에 해결할 항목

- 연결 해지 UI에서 대상 hostname과 Cloudflare가 DNS 레코드를 자동 정리할 것으로 기대한다는 점을 사용자에게 어떻게 안내할지 결정한다.
- DNS 정리가 필요하다고 확인되면 DNS Read/Write 권한 범위, 레코드 ownership marker/ID 보존 방식, 사전/사후 재검증, 충돌 시 중단 정책을 별도 합의한다. 단순한 hostname 매칭 기반 삭제는 금지한다.
- Worker 생성/재사용 구분을 새 manifest에 기록하는 계약을 설계한다. 기존 사이트처럼 소유권 증거가 없는 Worker는 삭제 전에 사용자 선택/확인이 필요한지 결정한다.
- Worker를 참조하는 다른 서비스가 발견될 때 사이트 삭제를 어떻게 안내할지 정한다. 기본값은 force 없이 중단이다.
- archive 디렉터리 이름 충돌, 권한 오류, 다른 볼륨 여부, 이동 검증, 사용자가 직접 파일을 제거한 경우의 UX를 정한다.

## 공식 자료

- [Cloudflare Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Attach a Worker Custom Domain API](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/)
- [Delete a Worker Custom Domain binding API](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/delete/)
- [List DNS Records API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/)
- [Delete DNS Record API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/delete/)
- [Delete Worker script API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/delete/)
- [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
