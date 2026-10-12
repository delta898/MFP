# UI Progress Feedback

## 목적

시간이 걸리는 동작의 진행 표현을 공통화하고, 사용자가 작업 중 할 수 있는 행동을 일관되게 정의한다. 각 화면은 자체 spinner나 overlay를 만들지 않고 이 문서의 패턴과 `ui/scripts/foundation/ui-progress.js`를 사용한다.

현재 공통 layer는 진행률을 알 수 없는 비동기 작업을 대상으로 한다. 서버가 실제 진행률을 제공하지 않으면 퍼센트나 완료 단계를 추정해 표시하지 않는다.

## 패턴 선택

| 패턴 | 사용 조건 | 잠기는 범위 | 바깥 동작 | 구현 |
|---|---|---|---|---|
| `region-indeterminate` | 한 콘텐츠 영역을 불러오거나 갱신하며 그 영역의 입력을 잠가야 함 | 전달한 콘텐츠 영역 | 영역 밖 탐색과 닫기는 가능 | `showUiProgress(region, { type: UI_PROGRESS_TYPES.REGION_INDETERMINATE, message })` |
| `blocking-indeterminate` | 저장·생성·반영 중 폼이나 transaction 입력이 바뀌면 안 됨 | 전달한 transaction surface 전체 | 취소 계약이 없으면 surface와 dialog 닫기를 막음 | `showUiProgress(surface, { type: UI_PROGRESS_TYPES.BLOCKING_INDETERMINATE, message })` |
| 단일 action loading | 하나의 버튼 작업만 진행되고 나머지 화면은 계속 사용할 수 있음 | 실행 버튼만 | 나머지 화면은 계속 사용 | 공통 `.ui-loading-action.is-loading` 버튼 상태 |

두 layer 패턴은 같은 불확정 막대, 상태 문구, 접근성 상태를 사용한다. 차이는 잠금·focus·dialog 처리 계약뿐이다. `region-indeterminate`도 지정 영역의 자식 입력은 잠그지만 focus를 빼앗거나 dialog의 Escape를 막지 않는다. `blocking-indeterminate`는 작업 중 dialog 취소/Escape를 막고 진행 표시로 focus를 이동한 뒤 종료 시 이전 focus를 복구한다.

레이어의 표현 밀도는 `presentation` 옵션으로 조정할 수 있다. `compact`는 진행 범위와 잠금 동작은 유지하면서 중앙 상태 패널만 작게 띄우고 뒤 콘텐츠를 더 잘 보이게 한다. `visual` 옵션은 필요할 때 결과물과 관련된 상태 표현을 추가한다. 예를 들어 `browser-preview`는 빈 미리보기 창에 강조된 테두리 카드, 제목, 회전형 표시를 보여준다. 실제 진행률이나 결과물 형태를 꾸며내지 않는다. `title`은 필요한 경우 카드 안의 짧은 제목을 제공하며, 기존 `message`가 보조 설명으로 표시된다. 별도 상호작용 계약이 아니므로 새 타입은 만들지 않는다.

새 타입을 화면마다 추가하지 않는다. 새 타입은 위 세 패턴으로 설명할 수 없는 반복 요구가 있고, 잠금 범위·focus 처리·취소 가능성 중 적어도 하나의 계약 차이가 있을 때만 제안한다. 사용자 동작만 다른 경우에는 별도 타입을 만들지 말고 기존 타입의 상태 문구를 구체화한다.

## 사용 계약

```js
const finishProgress = showUiProgress(surface, {
  type: UI_PROGRESS_TYPES.REGION_INDETERMINATE,
  message: '사이트 목록을 불러오는 중입니다.'
});

try {
  await loadSites();
} finally {
  finishProgress();
}
```

- `surface`는 진행 중 안정적으로 유지할 최소 영역이다. 더 넓은 상위 화면을 잠그지 않는다.
- `presentation: 'compact'`는 시각 표현만 바꾸며 잠금 범위나 focus, dialog 동작을 바꾸지 않는다.
- `visual: 'browser-preview'`는 빈 미리보기 창에서 테두리 카드, 제목, 회전형 표시를 추가하며, 실제 단계를 표시하거나 진행률을 추정하지 않는다.
- 미리보기 준비가 매우 빨리 끝나 진행 상태를 인지하기 어려운 경우, 해당 기능에서 최소 표시 시간을 둘 수 있다. 실제 작업이 더 오래 걸리면 작업이 끝날 때까지 표시하고, 최소 시간은 완료 시점을 지연시키지 않는다.
- 작업 시작 전에 중복 실행을 막고, 현재 작업 대상과 실제 단계를 알려주는 짧은 `message`를 제공한다.
- layer는 surface에 덧붙고 `aria-busy="true"`를 설정한다. 종료 함수는 layer, inert, `aria-busy`, component class와 해당 타입의 focus 상태를 이전 값으로 복원한다.
- 정상 완료, 오류, 조기 return 모두 cleanup을 보장하도록 `try/finally`를 사용한다. DOM 재렌더로 surface가 교체되는 흐름도 cleanup을 호출한다.
- action-level loading은 전용 버튼을 비활성화하고 `.ui-loading-action.is-loading`을 사용한다. 같은 동작에 버튼 spinner와 progress layer를 중복 표시하지 않는다.
- 완료 진행률을 실제로 제공받게 되면 determinate pattern을 별도로 설계한다. 현재 indeterminate API에 임의 퍼센트를 얹지 않는다.
- 실제 취소가 구현되어 있지 않으면 `취소` 버튼, 닫기, Escape가 작업을 멈춘다고 암시하지 않는다. `blocking-indeterminate`가 막는 것은 transaction 창을 닫는 동작이며 서버 작업을 취소하는 기능이 아니다.
- 사용자가 확인하는 상태 문구는 내부 API나 구현 세부사항보다 결과와 현재 작업을 설명한다.

## 공통 구현

- API와 타입: `ui/scripts/foundation/ui-progress.js`
- 공통 markup/style, reduced-motion 처리: `ui/styles/components/feedback.css`
- `ui/app.js`에서 공통 foundation script로 포함한다.
- 공통 markup의 모양과 접근성 처리는 foundation/CSS에서 관리한다. feature는 타입, target surface와 사용자용 message만 정한다.
- 같은 출처의 별도 문서에서 사용할 때도 `surface.ownerDocument` 기준으로 DOM과 focus를 다룬다. 해당 문서가 공통 stylesheet를 불러오지 않으면 layer를 사용하기 전에 스타일을 제공한다.
- `browser-preview` visual은 별도 미리보기 문서에서 공통 stylesheet가 적용되지 않거나 일부만 적용되는 경우에도 공통 모듈의 스타일 fallback으로 카드, 텍스트, 회전 표시를 제공한다.

## 적용 예

- 프로젝트 전환, 사이트 목록·템플릿 카탈로그 로딩, 프로젝트 미리보기, 사이트 미리보기, 내 정보 최초 로딩 및 강제 새로고침: `region-indeterminate`
- 사이트 생성과 설정 반영: `blocking-indeterminate`
- 결과가 버튼 하나에 국한된 새로고침이나 단순 요청: 공통 action loading 상태

새 사용처를 추가하면 해당 화면의 기존 spinner/진행 문구를 제거하고 공통 패턴 하나만 남긴다. 상호작용 범위가 달라졌다면 이 문서와 `design-component-patterns.md`를 함께 갱신한다.
