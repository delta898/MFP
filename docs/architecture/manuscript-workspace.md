# Manuscript Workspace

## Purpose

Blog Beta의 `원고 폴더`, `원고 붙여넣기`, `바로 생성`은 입력 방식만 다르고 이후 이미지 보정·미리보기·발행은
하나의 canonical Manuscript Draft 계약을 사용한다. 발행기는 원래 입력을 다시 읽지 않고 사용자가 확인한
`draft_id + revision` snapshot만 사용한다.

## Storage Ownership

```text
workspace/manuscript-drafts/{draft_id}/
  draft.json       # revision, settings, image slots, lifecycle
  source/          # canonical contents.md and current managed images
  originals/       # restore-only copies imported with the source
  assets/          # validated generation staging area
```

- 모든 파일은 앱이 소유하는 private workspace다.
- 사용자가 선택한 원본 폴더와 외부 이미지 파일은 읽기 전용이며 정리 대상이 아니다.
- 이미지 교체는 새 파일 검증과 저장이 성공한 뒤 manifest revision을 바꾼다. 실패하면 마지막 정상 asset을 유지한다.
- 폴더, 붙여넣기, AI adapter는 모두 동일한 stable image slot과 revision 규칙을 사용한다.

## Publish Contract

1. 클라이언트가 현재 `draft_id + revision + publish settings`를 보낸다.
2. 서버가 프롬프트가 있지만 이미지가 없는 포함 대상 slot을 자동 완성한다.
3. 최신 revision으로 publish payload를 만든다.
4. 공개·예약 요청인데 프롬프트 이미지 생성이 끝내 실패한 경우에만 임시 저장으로 안전 전환한다.
5. 발행기가 응답한 뒤 실제 결과와 최신 preview를 함께 반환한다.
6. 성공적으로 처리된 Draft는 revision을 바꾸지 않고 `completed`로 표시한다.

이미지와 프롬프트가 모두 없거나 사용자가 `사용 안 함`으로 제외한 slot은 의도적인 무이미지 상태이므로 공개·예약
발행을 막지 않는다.

## Lifecycle

- `active`: 생성, 이미지 보정, 설정 변경 또는 재시도가 가능한 상태. 마지막 변경 후 7일간 보존한다.
- `completed`: 임시 저장·즉시 발행·예약 등록 중 사용자가 요청한 플랫폼 처리가 성공한 상태. 결과 화면의 image URL과
  revision을 유지하기 위해 즉시 삭제하지 않고 24시간 보존한다.
- 앱 API runtime이 초기화될 때 만료된 앱 소유 Draft를 best-effort로 정리한다.
- 손상된 manifest도 디렉터리 수정 시각을 기준으로 7일간 보존한 뒤 정리할 수 있다.
- 정리 실패는 앱 시작이나 발행을 막지 않으며, 개수와 실패 사유를 운영 로그에 남긴다.

현재 UI는 앱 재시작 뒤 Draft 목록을 복구하는 기능을 제공하지 않는다. 7일 보존은 실패 진단과 안전한 유예를 위한
정책이며, 사용자-facing 복구 목록은 향후 별도 기능으로 다룬다.

## Direct-AI Transient Preview

바로 생성은 기존 생성기를 platform-neutral adapter로 사용하기 위해 잠시 플랫폼 workspace를 만든다. 생성 폴더에는
BlogGenius 전용 marker를 기록하고 canonical Draft import가 성공하면 preview session과 폴더를 함께 정리한다.
프로세스가 중단된 경우 marker가 있는 폴더만 6시간 TTL 뒤 다음 시작 시 정리한다. marker가 없는 기존 원고·발행
workspace는 이 정책으로 삭제하지 않는다.

모든 삭제 경로는 설정된 `WORKSPACE_DIR` 하위인지 확인한다. workspace root 자체, 외부 경로, 원본 source는 삭제하지 않는다.

## Failure and Logging Policy

- Draft 생성 중 실패: 해당 새 Draft 디렉터리만 회수한다.
- AI 이미지 생성 실패: 마지막 정상 이미지와 성공한 다른 slot을 유지한다.
- 발행 실패: Draft를 `active`로 보존해 같은 revision에서 보완·재시도할 수 있게 한다.
- cleanup 실패: warning을 남기고 계속 시작한다.
- 로그에는 Draft ID, revision, 처리 개수와 실패 단계만 남기며 원고 본문, 프롬프트, 이미지 데이터는 기록하지 않는다.

## Deferred Work

- canonical Markdown 제목·본문 편집
- 이미지 block 추가·이동·완전 삭제
- 앱 재시작 후 사용자-facing Draft 복구 목록
- Shopping Connect source adapter
