begin;
do $test$
begin
  if public.claim_status_delivery('auxplus_status_diagnostic','00000000-0000-4000-8000-000000000001') is not true then
    raise exception 'Initial lock failed';
  end if;
  if public.claim_status_delivery('auxplus_status_diagnostic','00000000-0000-4000-8000-000000000002') is not false then
    raise exception 'Concurrent lock was allowed';
  end if;
end;
$test$;
rollback;
select 'shared delivery lock verified; diagnostic transaction rolled back' as result;
