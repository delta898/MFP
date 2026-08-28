begin;

alter table public.knowledge_gateway_cache
    drop constraint if exists knowledge_gateway_cache_kind_check;

alter table public.knowledge_gateway_cache
    add constraint knowledge_gateway_cache_kind_check
    check (kind in ('trends', 'news', 'blog_reference', 'shopping_product'));

commit;
