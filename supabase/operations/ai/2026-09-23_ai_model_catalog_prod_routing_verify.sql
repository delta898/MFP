-- Read-only Production routing verification after version-segmented publish.

select
    requested_app_version,
    catalog->>'version' as catalog_version,
    catalog->>'minimum_app_version' as minimum_app_version,
    jsonb_array_length(catalog->'payload'->'models') as model_count
from (
    values
        ('0.1.15', public.get_ai_model_catalog('stable', '0.1.15')),
        ('0.1.16', public.get_ai_model_catalog('stable', '0.1.16')),
        ('0.5.1', public.get_ai_model_catalog('stable', '0.5.1')),
        ('0.5.2', public.get_ai_model_catalog('stable', '0.5.2'))
) checks(requested_app_version, catalog)
order by public.ai_catalog_version_tuple(requested_app_version);
