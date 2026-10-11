# Cloudflare는 무엇을 해주는 서비스일까요? 대표 기능 6가지로 살펴보기

Cloudflare를 처음 접하면 DNS, CDN, WAF, Workers, Pages, Tunnel처럼 낯선 이름이 한꺼번에 등장합니다. 모두 Cloudflare 제품이지만 같은 일을 하는 것은 아닙니다. 어떤 기능은 도메인 요청을 인터넷에서 안내하고, 어떤 기능은 웹사이트를 빠르게 전달하거나 공격을 막으며, 또 다른 기능은 코드와 파일을 실행하고 배포합니다.

이 글에서는 Cloudflare의 전체 제품을 나열하기보다 웹사이트 운영자가 자주 만나는 기능 여섯 가지를 중심으로 관계를 살펴봅니다. 마지막에는 데이터 저장, 접근 제어, 미디어 등 주변 서비스도 간단히 정리합니다.

## 먼저 알아둘 점: Cloudflare는 한 가지 서비스가 아닙니다

Cloudflare는 도메인 관리, 네트워크 성능, 웹 보안, 개발자 플랫폼, 기업용 네트워크·접근 제어 등 여러 기능을 제공하는 플랫폼입니다. 모든 기능을 한 번에 켜야 하는 것은 아닙니다. 사용 중인 웹사이트와 필요한 문제에 맞춰 일부 기능만 골라 쓸 수 있습니다.

웹사이트를 Cloudflare에 연결할 때 자주 보게 되는 기본 흐름은 다음과 같습니다.

1. 도메인 이름을 등록하거나 이미 보유한 도메인을 준비합니다.
2. DNS에서 도메인이 어디를 가리키는지 설정합니다.
3. 요청을 Cloudflare 프록시를 통과시킬지 정합니다.
4. 필요하다면 Cloudflare의 캐시, 보안 규칙, 코드 실행, 사이트 배포 기능을 사용합니다.

여기서 **도메인 등록**, **DNS 관리**, **웹사이트 호스팅**은 서로 다른 역할입니다. Cloudflare에서 도메인을 관리한다고 해서 그 자체로 웹사이트 파일이 생기는 것은 아닙니다.

## 1. 도메인과 DNS: 인터넷에서 주소를 찾게 합니다

도메인은 `example.com`처럼 사람이 기억하기 쉬운 인터넷 주소입니다. DNS(Domain Name System)는 그 주소로 접속했을 때 어느 서버나 서비스로 연결해야 하는지 알려주는 시스템입니다.

Cloudflare DNS를 사용하면 Cloudflare 대시보드에서 A, AAAA, CNAME, MX, TXT 같은 DNS 레코드를 관리할 수 있습니다. 웹사이트 주소뿐 아니라 메일 서버 연결, 도메인 소유권 확인 등도 DNS 레코드로 설정합니다.

기존 도메인을 Cloudflare의 일반적인 전체 설정 방식으로 옮기는 경우, 레코드를 확인하고 등록기관에서 네임서버를 Cloudflare가 안내한 값으로 바꿉니다. 이 작업은 도메인의 DNS를 누가 관리할지 바꾸는 일입니다. 도메인 등록 업체를 반드시 Cloudflare로 옮겨야 한다는 뜻은 아닙니다.

### 주황색 구름과 회색 구름은 무엇이 다를까요?

Cloudflare DNS 레코드에는 프록시 상태가 표시될 수 있습니다.

- **프록시 사용(주황색 구름)**: 웹 요청이 Cloudflare 네트워크를 통과합니다. 설정과 제품에 따라 캐싱, DDoS 방어, WAF 같은 기능을 적용할 수 있습니다.
- **DNS 전용(회색 구름)**: Cloudflare가 DNS 답변은 제공하지만 웹 요청은 Cloudflare 프록시를 거치지 않고 원본 주소로 갑니다. 따라서 프록시에서 제공하는 웹 보안·캐시 기능은 적용되지 않습니다.

메일이나 프록시를 지원하지 않는 서비스 등은 DNS 전용으로 두어야 할 수 있습니다. 레코드별로 필요한 방식을 확인하고 설정해야 합니다.

## 2. CDN과 캐시: 가까운 곳에서 콘텐츠를 전달합니다

CDN(Content Delivery Network)은 여러 지역에 분산된 서버를 통해 웹 콘텐츠를 방문자와 가까운 곳에서 전달하는 네트워크입니다. Cloudflare의 프록시를 사용하는 웹사이트는 정적 파일 등을 Cloudflare 네트워크에서 캐시해 방문자에게 더 가까운 위치에서 제공할 수 있습니다.

이미지, CSS, JavaScript 파일처럼 자주 바뀌지 않는 자료는 캐시 효과를 얻기 쉽습니다. 반면 로그인 정보나 요청마다 달라지는 개인화 페이지는 아무 설정 없이 캐시하면 안 됩니다. Cloudflare의 기본 캐시 동작과 Cache Rules를 이해하고, 어떤 응답을 저장해도 되는지 구분해야 합니다.

CDN은 사이트를 빠르게 만드는 데 도움을 주지만, 모든 페이지를 무조건 캐시하는 버튼은 아닙니다. 캐시 규칙이 잘못되면 오래된 페이지나 사용자별 정보가 노출되는 문제가 생길 수 있습니다.

## 3. WAF와 DDoS 방어: 요청을 검사하고 공격을 완화합니다

WAF(Web Application Firewall)는 웹사이트와 API로 들어오는 요청을 규칙에 따라 검사하는 방화벽입니다. 의심스러운 요청을 차단하거나, 사람인지 확인하는 챌린지를 띄우거나, 특정 요청을 제한할 수 있습니다.

Cloudflare WAF에는 Cloudflare가 관리하는 규칙과 사용자가 직접 만드는 규칙이 있습니다. 예를 들어 알려진 공격 패턴을 검사하거나, 특정 경로에 반복적으로 들어오는 요청을 제한할 수 있습니다. 플랜에 따라 사용할 수 있는 규칙과 분석 기능은 다를 수 있습니다.

DDoS 공격은 많은 트래픽을 한꺼번에 보내 서비스를 마비시키려는 공격입니다. Cloudflare는 네트워크 가장자리에서 트래픽을 처리해 여러 종류의 DDoS 공격을 완화하는 기능도 제공합니다.

다만 WAF 규칙이 정상 사용자의 요청까지 막을 수 있으므로, 규칙을 켠 뒤 보안 이벤트를 확인하고 필요한 예외를 조정해야 합니다. WAF를 켜면 모든 보안 문제가 자동으로 해결되는 것은 아닙니다. 애플리케이션 자체의 인증, 업데이트, 권한 검증도 계속 필요합니다.

## 4. Workers와 Static Assets: Cloudflare 네트워크에서 코드와 사이트를 실행합니다

Cloudflare Workers는 서버를 직접 준비하고 관리하지 않고도 요청을 처리하는 코드를 Cloudflare 네트워크에서 실행하는 플랫폼입니다. 요청을 확인하고, 응답을 만들고, API를 제공하거나 다른 서비스와 연결하는 데 쓸 수 있습니다.

Workers Static Assets는 HTML, CSS, JavaScript, 이미지 같은 정적 파일을 Worker와 함께 배포하고 제공하는 기능입니다. 간단한 사이트는 정적 파일만 배포할 수 있고, 필요하면 Worker 코드와 함께 사용해 일부 경로에서 API나 동적 응답도 처리할 수 있습니다.

BlogGenius 사이트 호스팅은 이 방식을 사용합니다. Astro 템플릿을 빌드해 `dist`에 정적 파일을 만들고, 그 결과물을 Cloudflare Workers의 Static Assets로 배포합니다. 따라서 BlogGenius에서 사이트를 배포할 때 사용자는 Cloudflare 계정 연결과 배포할 계정을 준비해야 합니다. Astro는 사이트를 생성하는 도구이고, Workers Static Assets는 생성된 결과물을 제공하는 Cloudflare 쪽 기능입니다.

정적 파일 요청과 Worker 코드 실행은 비용과 한도에서 다르게 취급될 수 있습니다. 특히 API나 동적 요청이 Worker 코드를 실행하는지에 따라 사용량이 달라질 수 있으므로, 실제 운영 전에 현재 요금 및 한도를 확인하는 것이 좋습니다.

## 5. Cloudflare Pages: Git 기반 웹사이트 배포 서비스

Cloudflare Pages는 정적 웹사이트를 배포하고 호스팅하는 서비스입니다. GitHub 같은 저장소를 연결해 코드가 바뀔 때 자동으로 빌드·배포하거나, 빌드된 결과물을 직접 업로드할 수 있습니다. 기본 사이트 주소와 브랜치별 미리보기 배포를 제공하며, Pages Functions를 사용하면 서버 기능도 추가할 수 있습니다.

예를 들어 개발자가 저장소에 사이트 코드를 올리면 Pages가 빌드 명령을 실행하고 출력 폴더를 배포합니다. 변경된 브랜치에 미리보기 주소를 만들어 검토한 뒤, 주 브랜치 변경을 운영 사이트에 반영하는 방식으로 쓸 수 있습니다.

### Pages와 Workers Static Assets는 같은 것인가요?

둘 다 정적 파일을 Cloudflare 네트워크에서 제공할 수 있지만 배포 방식과 개발 모델이 다릅니다.

| 구분 | Cloudflare Pages | Workers Static Assets |
| --- | --- | --- |
| 대표 흐름 | Git 저장소 연결 또는 Pages 업로드 | Worker와 정적 파일을 함께 배포하거나 정적 파일만 배포 |
| 미리보기 | 브랜치·커밋별 미리보기 배포에 편리 | Worker 배포 흐름과 버전으로 관리 |
| 동적 기능 | Pages Functions | Worker 코드와 라우팅으로 구성 |
| 잘 맞는 경우 | Git 중심으로 사이트를 자동 빌드하고 미리보기하고 싶을 때 | 코드 실행과 정적 자산을 한 배포 단위로 다루거나 API와 함께 구성할 때 |

Cloudflare 공식 문서는 Pages의 많은 사용 사례를 Workers에서도 지원하며, 새 애플리케이션은 Workers를 시작점으로 고려하라고 안내합니다. 그렇다고 기존 Pages 사이트를 급하게 옮겨야 한다는 뜻은 아닙니다. 이미 Pages로 잘 운영 중인 사이트는 현재 배포와 기능에 맞춰 계속 사용할 수 있습니다.

BlogGenius는 Git 저장소를 연결해 빌드하는 Pages의 전형적인 흐름 대신 Workers Static Assets를 사용합니다. 사용자가 BlogGenius에서 사이트를 만들고 배포하면, 앱이 템플릿을 빌드한 뒤 Cloudflare 계정에 정적 결과물을 올립니다.

## 6. Cloudflare Tunnel: 서버의 포트를 인터넷에 직접 열지 않고 연결합니다

Cloudflare Tunnel은 `cloudflared`라는 프로그램이 내부 서버에서 Cloudflare로 아웃바운드 연결을 만들어, 해당 서버나 사내 네트워크의 애플리케이션을 Cloudflare 네트워크를 통해 접근할 수 있게 하는 기능입니다. 서버에 공인 IP를 할당하거나 방화벽에서 인바운드 포트를 직접 열지 않고도 서비스를 연결할 수 있습니다.

예를 들어 집이나 사무실에 있는 개발용 서버를 잠시 외부에서 확인하거나, 사내에만 있어야 하는 웹 도구에 사용자를 안전하게 연결하는 경우에 쓸 수 있습니다. 공개 웹사이트의 일반 호스팅과 목적이 다르며, Tunnel만으로 사이트 파일을 빌드하거나 콘텐츠를 저장하는 것은 아닙니다.

Tunnel을 공개 서비스에 연결할 때는 인증과 접근 정책도 함께 설계해야 합니다. 주소를 아는 사람 누구나 접속할 수 있도록 둘지, Cloudflare Access를 통해 허용된 사용자만 들어오게 할지 결정해야 합니다.

## 그 밖에 알아둘 Cloudflare 서비스

Cloudflare 플랫폼에는 이 외에도 여러 서비스가 있습니다.

- **R2**: 이미지, 파일, 백업 등 객체 형태의 데이터를 저장하는 오브젝트 스토리지입니다. S3 호환 API를 제공합니다.
- **D1**: Workers와 연결해 쓰는 SQL 데이터베이스입니다.
- **Workers KV**: 전 세계에 배포된 키-값 형태의 데이터 저장소로, 캐시나 설정처럼 읽기 위주의 데이터에 활용할 수 있습니다.
- **Durable Objects**: 상태와 조정이 필요한 실시간 앱, 채팅, 협업 기능 등에 쓸 수 있는 객체형 실행·저장 기능입니다.
- **Cloudflare Access / Zero Trust**: 사용자와 기기를 확인한 뒤 내부 애플리케이션이나 네트워크 접근을 허용하는 기능군입니다.
- **Cloudflare Registrar**: 도메인을 등록하고 갱신하는 서비스입니다. Cloudflare DNS와 도메인 등록은 구분되는 역할입니다.
- **Email Routing**: 도메인으로 온 메일을 다른 메일 주소로 전달하는 기능입니다. 전체 메일 호스팅과는 다릅니다.
- **Images와 Stream**: 이미지 변환·전달 또는 동영상 업로드·인코딩·재생에 초점을 둔 미디어 서비스입니다.
- **Queues와 Workflows**: 백그라운드 작업을 큐로 처리하거나 여러 단계의 비동기 작업을 관리하는 데 사용할 수 있습니다.
- **Load Balancing**: 여러 원본 서버의 상태를 확인하고 트래픽을 나누거나 장애 시 다른 서버로 보내는 서비스입니다.

제품의 정확한 이름, 기능, 가격과 무료 플랜의 한도는 바뀔 수 있습니다. 도입을 결정할 때는 Cloudflare 공식 문서와 요금 페이지에서 현재 계정·플랜에 적용되는 내용을 확인하세요.

## 어떤 기능부터 보면 좋을까요?

| 필요한 일 | 먼저 살펴볼 기능 |
| --- | --- |
| 도메인 주소와 DNS 레코드 관리 | Cloudflare DNS |
| 이미지와 정적 파일을 빠르게 제공 | CDN/Cache, Workers Static Assets 또는 Pages |
| 웹 요청의 공격 패턴을 검사·제한 | WAF, DDoS 방어, Rate Limiting |
| API나 엣지 코드를 실행 | Workers |
| Git 변경 때 자동 빌드하고 미리보기 배포 | Pages |
| 내부 서버에 안전하게 원격 접근 | Tunnel과 Access |
| 파일·이미지 저장 | R2 |
| SQL 데이터를 저장 | D1 |

가장 중요한 것은 Cloudflare 제품 이름을 모두 외우는 일이 아닙니다. 먼저 해결하려는 문제가 도메인 연결인지, 사이트 전달 속도인지, 보안인지, 코드 실행인지, 내부 접근인지 구분하면 필요한 기능을 찾기 쉬워집니다.

## 마무리

Cloudflare는 DNS와 프록시에서 출발해 CDN, 웹 보안, 서버리스 코드 실행, 사이트 배포, 데이터 저장, 내부 네트워크 접근까지 제공하는 플랫폼입니다. 이 기능들은 서로 연결될 수 있지만 각각 다른 문제를 해결합니다.

BlogGenius의 사이트 호스팅에서는 Astro가 사이트 파일을 만들고 Cloudflare Workers Static Assets가 그 결과물을 전달합니다. Pages도 정적 사이트를 배포하는 선택지지만, 현재 BlogGenius가 사용하는 기능은 Pages가 아닙니다. 이 차이를 알고 나면 Cloudflare 대시보드의 다양한 메뉴 중 지금 필요한 기능이 무엇인지 더 쉽게 판단할 수 있습니다.

## 공식 문서

- [Cloudflare DNS](https://developers.cloudflare.com/dns/)
- [Cloudflare Cache와 CDN 시작하기](https://developers.cloudflare.com/cache/get-started/)
- [Cloudflare WAF](https://developers.cloudflare.com/waf/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Cloudflare Tunnel 시작하기](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
