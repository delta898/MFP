-- Add the required SNS distribution entitlement to existing license plan rows.
-- The application checks only this capability. Plan-to-capability assignment
-- remains server-owned policy.

begin;

update public.license_plans
set features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
        'enable_sns_distribution',
        lower(plan_code) in ('test', 'pro', 'ultra')
    ),
    updated_at = timezone('utc', now());

commit;
