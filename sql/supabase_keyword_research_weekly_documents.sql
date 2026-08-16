begin;

delete from public.keyword_research_cache
where cache_kind = 'blog_total';

alter table public.keyword_research_cache
    drop constraint if exists keyword_research_cache_kind_check;

alter table public.keyword_research_cache
    add constraint keyword_research_cache_kind_check
        check (cache_kind in ('search_ad', 'blog_weekly'));

commit;
