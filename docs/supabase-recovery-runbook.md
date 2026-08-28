# Supabase Forward Fix와 데이터 복구 Runbook

이 문서는 development 또는 production Supabase 변경 이후 문제가 발견됐을 때의 기본 절차다.
자동 rollback script가 아니며, production 조치는 매번 별도 사용자 승인을 요구한다.

## 기본 원칙

1. 적용된 migration을 삭제·수정하거나 migration history를 임의로 되돌리지 않는다.
2. schema와 Function 문제는 새 migration 또는 새 Function revision의 **forward fix**로 해결한다.
3. 데이터 손상이 의심되면 추가 쓰기를 먼저 제한하고 원본을 보존한다.
4. production 복구는 project identity, incident 범위, backup 시점과 복구 대상을 확인한 후 승인한다.
5. development에서 동일 artifact와 복구 절차를 검증하기 전 production에 적용하지 않는다.

## Schema 또는 Function 장애

1. 영향받은 기능과 최초 실패 시각을 기록한다.
2. 배포에 사용한 Git revision, release artifact fingerprint, development evidence를 보존한다.
3. 현재 production schema를 읽기 전용으로 감사해 기대 상태와 차이를 확인한다.
4. 기존 migration을 고치지 않고 다음 순번의 migration 또는 새 Function 변경을 작성한다.
5. local reset과 unit test를 통과시킨다.
6. development에 적용하고 drift, HTTP smoke, 실제 영향 기능을 검증한다.
7. 새로운 artifact와 production checklist를 만들고 사용자 승인을 받는다.

## 데이터 손상 또는 유실

1. 자동 작업과 관련 쓰기 경로를 중단해 손상 확대를 막는다.
2. 삭제·덮어쓰기 범위, 테이블, owner, 시간 범위를 읽기 전용으로 산정한다.
3. Supabase backup/PITR 가용 여부와 가장 가까운 안전 복구 시점을 확인한다.
4. 가능하면 backup을 별도 격리 project에 복원해 필요한 행만 비교·추출한다.
5. 복구 SQL은 대상 행과 예상 변경 건수를 명시하고 development fixture로 먼저 검증한다.
6. production 실행 전 사용자에게 영향 범위, 복구 원본, 변경 건수, 검증·중단 조건을 제시한다.
7. 복구 후 무결성 검사와 핵심 read-only smoke를 실행하고 결과를 incident 기록에 남긴다.

## 금지 사항

- production `db reset`, development seed 또는 test fixture 적용
- 승인 없는 backup restore, 대량 UPDATE/DELETE, migration history 조작
- production 데이터를 local 또는 일반 CI artifact로 복사
- Secret, 사용자 데이터, 원본 SQL dump를 GitHub artifact나 로그에 출력
