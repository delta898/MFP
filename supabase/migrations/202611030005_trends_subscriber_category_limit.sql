alter table mailing.trends_subscribers
    drop constraint trends_subscribers_categories_check;

alter table mailing.trends_subscribers
    add constraint trends_subscribers_categories_check
    check (cardinality(categories) between 1 and 10);
