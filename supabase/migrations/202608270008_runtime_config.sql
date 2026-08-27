-- ============================================================
-- BlogGenius Runtime Config (네이버 검색 API 키 중앙 관리)
-- 대상: Supabase SQL Editor
-- ============================================================
-- 목적:
-- 1) 앱에 하드코딩하지 않고 런타임 설정값을 DB에서 조회
-- 2) 키 교체 시 앱 재배포 없이 DB 값만 변경
--
-- 사용:
-- - 아래 스크립트 실행 후, 마지막 UPSERT 예시에 실제 값을 넣어 저장
-- - 앱은 RPC(get_runtime_config)로 필요한 키만 조회합니다.

begin;

create table if not exists public.app_runtime_configs (
    config_key text primary key,
    config_value text not null,
    is_active boolean not null default true,
    note text,
    updated_at timestamptz not null default timezone('utc', now())
);

alter table public.app_runtime_configs enable row level security;
revoke all on table public.app_runtime_configs from anon, authenticated;
grant all on table public.app_runtime_configs to service_role;

drop function if exists public.get_runtime_config(text[]);

create or replace function public.get_runtime_config(
    p_keys text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_result jsonb;
begin
    select coalesce(jsonb_object_agg(config_key, config_value), '{}'::jsonb)
      into v_result
      from public.app_runtime_configs
     where is_active = true
       and (p_keys is null or cardinality(p_keys) = 0 or config_key = any (p_keys));

    return v_result;
end;
$$;

grant execute on function public.get_runtime_config(text[]) to anon, authenticated, service_role;
revoke all on function public.get_runtime_config(text[]) from public;

commit;

-- ------------------------------------------------------------
-- 초기 값 등록/수정 예시 (실행 시 실제 값으로 바꿔서 사용)
-- ------------------------------------------------------------
-- insert into public.app_runtime_configs (config_key, config_value, is_active, note)
-- values
--   ('naver_client_id', '여기에_네이버_Client_ID', true, 'Naver Search API Client ID'),
--   ('naver_client_secret', '여기에_네이버_Client_Secret', true, 'Naver Search API Client Secret'),
--   ('license_registration_code_ttl_seconds', '300', true, '라이선스 등록 인증코드 유효시간(초)')
-- on conflict (config_key) do update
-- set config_value = excluded.config_value,
--     is_active = excluded.is_active,
--     note = excluded.note,
--     updated_at = timezone('utc', now());
