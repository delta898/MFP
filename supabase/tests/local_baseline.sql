do $$
declare
    v_public_tables integer;
    v_trends_tables integer;
    v_custom_functions integer;
    v_rls_disabled integer;
    v_seeded_licenses integer;
    v_superseded_tables integer;
    v_anon_functions integer;
    v_unsafe_helper_grants integer;
begin
    select count(*)
      into v_public_tables
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r';

    select count(*)
      into v_trends_tables
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'trends'
       and c.relkind = 'r';

    select count(*)
      into v_custom_functions
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'trends');

    select count(*)
      into v_rls_disabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'trends')
       and c.relkind = 'r'
       and c.relrowsecurity is not true;

    select count(*)
      into v_seeded_licenses
      from public.licenses
     where note = 'local Supabase seed only';

    select count(*)
      into v_superseded_tables
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname in (
           'license_access_keys',
           'license_policies',
           'free_license_usages',
           '_del_license_access_keys',
           '_del_license_policies',
           '_del_free_license_usages'
       );

    select count(*)
      into v_anon_functions
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join lateral aclexplode(
          coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl on true
      join pg_roles granted_role on granted_role.oid = acl.grantee
     where n.nspname in ('public', 'trends')
       and granted_role.rolname = 'anon'
       and acl.privilege_type = 'EXECUTE';

    select count(*)
      into v_unsafe_helper_grants
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
           '_license_calc_period_bounds',
           '_smart_usage_kst_period_bounds',
           '_smart_usage_authorize',
           'set_current_timestamp_updated_at',
           'set_app_surface_updated_at',
           'mark_license_registration_code_send_status'
       )
       and (
           has_function_privilege('anon', p.oid, 'EXECUTE')
           or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       );

    if v_public_tables <> 23 then
        raise exception 'expected 23 public tables, found %', v_public_tables;
    end if;
    if v_trends_tables <> 1 then
        raise exception 'expected one trends table, found %', v_trends_tables;
    end if;
    if v_custom_functions <> 44 then
        raise exception 'expected 44 baseline functions, found %', v_custom_functions;
    end if;
    if v_rls_disabled <> 0 then
        raise exception 'expected RLS on every custom table, found % disabled', v_rls_disabled;
    end if;
    if v_seeded_licenses <> 1 then
        raise exception 'expected one local fake license, found %', v_seeded_licenses;
    end if;
    if v_superseded_tables <> 0 then
        raise exception 'found % superseded license tables', v_superseded_tables;
    end if;
    if v_anon_functions <> 18 then
        raise exception 'expected 18 explicit desktop RPCs for anon, found %', v_anon_functions;
    end if;
    if v_unsafe_helper_grants <> 0 then
        raise exception 'found % internal/helper RPC grants for client roles', v_unsafe_helper_grants;
    end if;
end $$;
