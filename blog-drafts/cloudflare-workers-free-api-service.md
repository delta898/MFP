# Cloudflare Workers로 무료 API 서버 만들기: 사용법과 무료 한도, 주의사항

“간단한 API 하나를 운영하려고 서버부터 마련해야 할까?”

Cloudflare 계정이 있다면 **Cloudflare Workers**로 작은 HTTP API를 만들 수 있습니다. 별도 서버를 직접 띄우거나 운영하지 않고 코드를 배포하는 방식이며, 무료 플랜에서도 정해진 사용 한도 안에서 요청을 처리할 수 있습니다.

다만 “무료 API 서버”가 곧 무제한·무비용을 뜻하지는 않습니다. 어떤 작업에 잘 맞는지, 무료 한도에서 어디까지 할 수 있는지부터 살펴보겠습니다.

## 먼저, 정확한 이름은 Cloudflare Workers

공식 제품 이름은 **Cloudflare Workers**입니다. 대화에서는 “Cloudflare Worker 서비스”라고 부르기도 하지만, Cloudflare가 제공하는 개발 플랫폼과 실행 환경을 가리킬 때는 보통 Workers라고 합니다.

Worker는 HTTP 요청을 받아 JavaScript 또는 TypeScript 코드로 처리한 뒤 응답을 돌려주는 프로그램입니다. Cloudflare의 글로벌 네트워크에서 실행되므로 사용자가 직접 가상 머신을 만들고, 운영체제를 업데이트하고, 웹 서버를 계속 켜 두는 과정을 관리하지 않아도 됩니다.

처음 배포하면 `https://프로젝트이름.계정이름.workers.dev` 형태의 주소로 접근할 수 있습니다. 원한다면 본인이 관리하는 도메인을 연결해 API 주소로 사용할 수도 있습니다.

> **한 줄로 정리하면:** Cloudflare Workers는 서버 운영 부담 없이 요청을 처리하는 서버리스 컴퓨팅 플랫폼이고, API는 그 위에 작성하는 프로그램입니다.

[Cloudflare Workers 개념 안내](https://developers.cloudflare.com/learning-paths/workers/concepts/workers-concepts/) · [API 배포 사용 사례](https://developers.cloudflare.com/use-cases/apis/deploy-apis/)

## Workers로 무엇을 만들 수 있을까?

Worker는 요청이 들어올 때 코드를 실행합니다. 그래서 다음과 같은 기능을 구현하기 좋습니다.

- 웹사이트와 앱이 호출하는 JSON API
- 폼 제출, 웹훅 수신, 데이터 검증
- 외부 API를 호출하고 결과를 가공하는 중계 API
- 인증 확인, 요청 제한, 간단한 접근 제어
- URL 리다이렉트와 요청·응답 헤더 처리
- 정적 사이트에 로그인, 검색, 폼 처리 같은 동적 기능 추가
- KV, D1, R2, Durable Objects 등 Cloudflare 저장소와 연결한 작은 서비스

예를 들어 모바일 앱이 `GET /api/status`를 호출하면 Worker가 상태 정보를 JSON으로 돌려줄 수 있습니다. 폼에서 받은 데이터를 검증해 데이터베이스에 저장하거나, 브라우저에 공개하면 안 되는 외부 API 키를 Worker 안에 보관하고 외부 API를 호출하는 식으로도 사용할 수 있습니다.

Worker 자체는 실행 코드입니다. 데이터를 보관해야 한다면 별도의 저장소를 연결해야 합니다. 예를 들어 단순한 키와 값 저장에는 Workers KV, 관계형 데이터가 필요하면 D1, 파일이나 이미지 저장에는 R2를 검토할 수 있습니다. 저장소별 무료 한도와 과금은 Workers 요청 한도와 별개로 확인해야 합니다.

## 가장 간단한 JSON API 만들기

아래 예시는 이름을 받아 인사말을 JSON으로 반환하는 API입니다.

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/hello") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (request.method !== "GET") {
      return Response.json(
        { error: "Method not allowed" },
        {
          status: 405,
          headers: { Allow: "GET" },
        },
      );
    }

    const name = url.searchParams.get("name")?.trim() || "방문자";

    return Response.json({
      message: `안녕하세요, ${name}님!`,
    });
  },
};
```

배포한 뒤 다음 주소를 호출하면 JSON 응답을 확인할 수 있습니다.

```text
https://프로젝트이름.계정이름.workers.dev/api/hello?name=민지
```

응답 예시:

```json
{
  "message": "안녕하세요, 민지님!"
}
```

Cloudflare는 대시보드에서 Worker를 만들거나, 공식 CLI인 **Wrangler**를 사용해 로컬에서 개발하고 배포하는 흐름을 제공합니다. 일반적인 CLI 절차는 다음과 같습니다.

```bash
npm create cloudflare@latest -- my-first-api
cd my-first-api
npx wrangler dev
npx wrangler deploy
```

먼저 `wrangler dev`로 로컬에서 확인한 다음 `wrangler deploy`로 배포합니다. 배포 후에는 `workers.dev` 주소 또는 설정한 사용자 도메인에서 API를 호출할 수 있습니다.

[Cloudflare 공식 CLI 시작 안내](https://developers.cloudflare.com/workers/get-started/guide/) · [첫 Worker 배포 안내](https://developers.cloudflare.com/learning-paths/workers/get-started/first-worker/)

## 무료 플랜의 한도는 어느 정도일까?

**2026년 10월 11일 Cloudflare 공식 문서 기준**, Workers Free 플랜의 주요 한도는 다음과 같습니다.

| 항목 | Workers Free 한도 | 의미 |
| --- | ---: | --- |
| Worker 요청 | 하루 100,000건 | 계정 전체의 일일 요청 한도이며 UTC 자정에 초기화됩니다. |
| CPU 실행 시간 | 요청당 10ms | 코드가 실제 CPU를 사용하는 시간 기준입니다. 외부 네트워크 응답을 기다리는 시간과는 다릅니다. |
| 메모리 | 128MB | Worker 실행 환경의 메모리 한도입니다. |
| 하위 요청 | 요청당 50건 | Worker가 외부 주소나 Cloudflare 서비스에 보내는 요청 수입니다. |
| 계정 내 Worker 수 | 100개 | 계정에서 만들 수 있는 Worker 수입니다. |
| Cron Trigger | 계정당 5개 | 예약 실행을 설정할 때 고려할 한도입니다. |

일일 요청 한도에 도달하면 Worker 요청은 **Error 1027**로 거부될 수 있습니다. CPU 한도를 넘는 요청은 **Error 1102**로 종료될 수 있습니다. 개인 도구나 소규모 API에는 넉넉할 수 있지만, 공개 API를 운영한다면 사용량과 오류를 모니터링해야 합니다.

요청당 10ms는 “응답을 10ms 안에 끝내야 한다”는 뜻과 다릅니다. Worker가 데이터베이스나 외부 API의 응답을 기다리는 시간은 CPU 시간에 포함되지 않습니다. 대신 데이터를 대량으로 변환하거나, 무거운 계산을 하거나, 큰 입력을 복잡하게 처리하는 코드는 한도에 걸릴 수 있습니다.

Workers Free는 작은 코드 실행을 시작하기에 좋지만, 데이터베이스나 저장소, AI, 외부 API 등 연결한 제품은 각각 다른 한도와 요금이 적용될 수 있습니다. 무료로 시작하더라도 연결한 서비스의 가격과 사용량을 함께 확인하세요.

[Workers 공식 한도 표](https://developers.cloudflare.com/workers/platform/limits/) · [Workers 공식 요금 안내](https://developers.cloudflare.com/workers/platform/pricing/)

## 무료 API 운영에서 놓치기 쉬운 점

### 1. 공개 주소는 누구나 호출할 수 있습니다

`workers.dev` 주소를 공개하면 누구나 요청을 보낼 수 있다고 생각하고 설계하는 편이 안전합니다. 사용자 인증이 필요한 API라면 인증 토큰이나 세션을 검사하고, 요청 데이터도 서버에서 검증하세요.

### 2. 비밀 키를 코드에 넣지 마세요

외부 서비스 키나 비밀번호를 소스 코드에 직접 적어 배포하지 마세요. Wrangler의 secret 설정이나 Cloudflare 대시보드의 비밀 값 관리 기능을 사용하고, 저장소에도 비밀 값이 포함되지 않도록 주의해야 합니다.

### 3. 브라우저에서 호출한다면 CORS를 확인하세요

다른 도메인의 웹 페이지에서 API를 호출하면 브라우저의 CORS 정책이 적용됩니다. API가 허용할 출처와 메서드를 응답 헤더에 정확히 설정해야 합니다. 모든 출처를 무조건 허용하는 설정은 인증 정보가 필요한 API에 적합하지 않을 수 있습니다.

### 4. 무제한 무료라고 홍보하지 마세요

무료 한도 안에서는 비용이 발생하지 않더라도, 트래픽이 커지거나 연결된 저장소·제품을 사용하면 상황이 달라집니다. 공개 서비스라면 사용량 알림, 요청 제한, 오류 모니터링을 준비하세요. 무료 한도에 도달했을 때 서비스가 어떤 응답을 보낼지도 미리 정해두면 좋습니다.

## Static Assets, Workers, Pages는 어떻게 다를까?

이름이 비슷해 처음 접하면 헷갈릴 수 있습니다.

- **Workers**: HTTP 요청에 따라 코드와 API 로직을 실행합니다.
- **Workers Static Assets**: HTML, CSS, JavaScript, 이미지 같은 파일을 배포하고 제공합니다. 동적 API가 필요하면 Worker 코드와 함께 구성할 수 있습니다.
- **Cloudflare Pages**: Git 저장소 기반으로 정적 사이트를 배포하는 제품으로 널리 사용되어 왔고, Pages Functions를 붙이면 서버 코드를 실행할 수 있습니다.

Cloudflare 문서는 새 프로젝트에서 Workers를 기본 플랫폼으로 권하고 있으며, Pages의 정적 파일 요청은 무료·무제한이지만 Pages Functions 요청은 Workers 요청 한도를 사용한다고 안내합니다. 즉, 정적 파일을 제공하는 것과 API 코드를 실행하는 것은 구분해서 생각해야 합니다.

[Workers Static Assets 요금 및 한도](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [Pages Functions 요금 안내](https://developers.cloudflare.com/pages/functions/pricing/) · [Cloudflare Pages 안내](https://developers.cloudflare.com/pages/)

## 비슷한 대안은 무엇이 있을까?

| 서비스 | 간단한 특징 |
| --- | --- |
| **AWS Lambda + API Gateway** | AWS 서비스와 연동하기 좋고 다양한 운영 옵션을 제공합니다. 설정할 구성 요소가 많아 처음에는 Workers보다 학습 부담이 클 수 있습니다. |
| **Vercel Functions** | Vercel에 배포하는 웹 애플리케이션에서 API 경로를 함께 만들기 편합니다. 사용량과 실행 자원에 따라 플랜 한도를 확인해야 합니다. |
| **Netlify Functions** | Netlify 사이트에 서버 기능을 덧붙이는 방식으로 시작하기 쉽습니다. Netlify 배포 흐름을 이미 쓰는 프로젝트에 자연스럽습니다. |
| **Deno Deploy** | Deno 및 표준 웹 API 중심으로 서버 코드를 배포하는 대안입니다. 런타임과 생태계 선호에 따라 비교할 수 있습니다. |

무료 제공량, 실행 시간, 데이터 저장 비용, 상업적 사용 조건은 제공사와 플랜에 따라 자주 바뀝니다. 단순히 “무료인가?”만 비교하기보다, 필요한 런타임과 저장소, 배포 방식, 트래픽 한도를 함께 비교하는 편이 좋습니다.

[Vercel Functions 안내](https://vercel.com/docs/functions) · [AWS Lambda 안내](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html) · [Netlify Functions 안내](https://docs.netlify.com/build/functions/overview/) · [Deno Deploy 안내](https://docs.deno.com/deploy/)

## 이런 API에 잘 맞습니다

Cloudflare Workers는 다음처럼 작고 빠르게 응답하는 API를 만들 때 매력적입니다.

- 개인 프로젝트나 프로토타입 API
- 프런트엔드와 외부 API 사이의 간단한 중계
- 웹훅 수신, 입력 검증, URL 변환
- 정적 웹사이트에 필요한 소규모 동적 기능
- 사용자가 여러 지역에 있어 엣지에서 요청을 처리하고 싶은 서비스

반대로, 장시간 실행되는 작업이나 큰 메모리·CPU가 필요한 계산, 상시 연결이 중요한 작업, 기존 서버 런타임의 특정 기능에 강하게 의존하는 프로그램이라면 제약을 먼저 검토해야 합니다. Worker 한도 안에 들어오는지, 저장소와 외부 서비스 비용이 어떻게 붙는지 작은 실험으로 확인한 뒤 선택하는 것이 좋습니다.

## 마무리

Cloudflare Workers는 서버를 직접 운영하지 않고도 HTTP API를 만들고 배포할 수 있는 플랫폼입니다. 공식 무료 플랜은 작은 API를 시작하기에 유용하지만, 하루 요청 수와 CPU 시간 같은 분명한 제한이 있습니다.

처음에는 인증 없는 민감하지 않은 예제 API를 만들고, 로컬 테스트 후 배포해 보세요. 실제 데이터를 저장하거나 외부 서비스와 연결할 때는 인증, 입력 검증, CORS, 비밀 키 관리, 각 제품의 요금을 함께 설계해야 합니다.

**확인 기준일: 2026년 10월 11일.** Cloudflare와 대안 서비스의 가격·한도는 변경될 수 있으므로 실제 운영 전 공식 요금 및 제한 문서를 다시 확인하세요.
