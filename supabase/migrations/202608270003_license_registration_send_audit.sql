-- License registration email send audit hotfix
-- Safe to run on an existing database. It preserves existing rows and adds
-- explicit send state metadata for registration/recovery verification codes.

create extension if not exists pgcrypto;

alter table public.license_registration_codes
    add column if not exists send_status text not null default 'created',
    add column if not exists send_attempted_at timestamptz,
    add column if not exists sent_at timestamptz,
    add column if not exists send_error text,
    add column if not exists send_provider_status text,
    add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
    if not exists (
        select 1
          from pg_constraint
         where conname = 'license_registration_codes_send_status_check'
           and conrelid = 'public.license_registration_codes'::regclass
    ) then
        alter table public.license_registration_codes
            add constraint license_registration_codes_send_status_check
            check (send_status in ('created', 'sent', 'failed'));
    end if;
end $$;

create index if not exists idx_license_registration_codes_send_status
    on public.license_registration_codes (send_status, created_at desc);

drop function if exists public.mark_license_registration_code_send_status(text, text, text, text, text);

create or replace function public.mark_license_registration_code_send_status(
    p_email text,
    p_code text,
    p_send_status text,
    p_error text default null,
    p_provider_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := timezone('utc', now());
    v_email text := lower(trim(coalesce(p_email, '')));
    v_code text := trim(coalesce(p_code, ''));
    v_status text := lower(trim(coalesce(p_send_status, '')));
    v_code_hash text;
    v_row_id bigint;
begin
    if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('success', false, 'message', '유효한 이메일 주소를 입력해 주세요.');
    end if;

    if v_code !~ '^[0-9]{6}$' then
        return jsonb_build_object('success', false, 'message', '유효한 인증 코드가 아닙니다.');
    end if;

    if v_status not in ('sent', 'failed') then
        return jsonb_build_object('success', false, 'message', '유효한 발송 상태가 아닙니다.');
    end if;

    v_code_hash := encode(digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex');

    select id
      into v_row_id
      from public.license_registration_codes
     where email = v_email
       and code_hash = v_code_hash
     order by created_at desc
     limit 1
     for update;

    if v_row_id is null then
        return jsonb_build_object('success', false, 'message', '발송 상태를 기록할 인증 코드가 없습니다.');
    end if;

    update public.license_registration_codes
       set send_status = v_status,
           send_attempted_at = v_now,
           sent_at = case when v_status = 'sent' then v_now else sent_at end,
           send_error = case
               when v_status = 'failed' then nullif(left(trim(coalesce(p_error, '')), 1000), '')
               else null
           end,
           send_provider_status = nullif(left(trim(coalesce(p_provider_status, '')), 120), ''),
           updated_at = v_now
     where id = v_row_id;

    return jsonb_build_object(
        'success', true,
        'id', v_row_id,
        'send_status', v_status
    );
end;
$$;

grant execute on function public.mark_license_registration_code_send_status(text, text, text, text, text)
    to anon, authenticated, service_role;
revoke all on function public.mark_license_registration_code_send_status(text, text, text, text, text)
    from public;
