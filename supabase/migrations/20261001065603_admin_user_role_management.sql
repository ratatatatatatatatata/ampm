begin;
create schema ampm_role_internal;
revoke all on schema ampm_role_internal from public,anon,authenticated;
grant usage on schema ampm_role_internal to authenticated;

-- Privileged implementations are private; every call checks the database role,
-- never user-editable JWT metadata. Existing membership policies stay intact.
create function ampm_role_internal.list_user_roles()
returns table(user_id uuid, user_role text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Admin permission required' using errcode = '42501';
  end if;
  return query select p.id,
    case when a.user_id is not null then 'admin' when e.user_id is not null then 'employee' else 'customer' end
    from public.profiles p left join public.admins a on a.user_id = p.id
    left join public.employees e on e.user_id = p.id;
end;
$$;

create function ampm_role_internal.set_user_role(p_user_id uuid,p_role text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize role mutations so concurrent demotions cannot remove every admin.
  perform pg_catalog.pg_advisory_xact_lock(731044,1);
  if auth.uid() is null or not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Admin permission required' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin','employee','customer') then
    raise exception 'Invalid user role' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id)
     or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'User not found' using errcode = '22023';
  end if;
  if p_role <> 'admin' and exists (select 1 from public.admins a where a.user_id = p_user_id)
     and (select count(*) from public.admins) <= 1 then
    raise exception 'Cannot remove the last administrator' using errcode = '22023';
  end if;
  if p_role = 'admin' then
    insert into public.admins(user_id) values (p_user_id) on conflict do nothing;
    delete from public.employees where user_id = p_user_id;
  elsif p_role = 'employee' then
    delete from public.admins where user_id = p_user_id;
    insert into public.employees(user_id) values (p_user_id) on conflict do nothing;
  else
    delete from public.admins where user_id = p_user_id;
    delete from public.employees where user_id = p_user_id;
  end if;
  return p_role;
end;
$$;
revoke all on function ampm_role_internal.list_user_roles(),ampm_role_internal.set_user_role(uuid,text) from public,anon,authenticated;
grant execute on function ampm_role_internal.list_user_roles(),ampm_role_internal.set_user_role(uuid,text) to authenticated;

create function public.ampm_list_user_roles()
returns table(user_id uuid,user_role text)
language sql security invoker set search_path = '' as $$
  select * from ampm_role_internal.list_user_roles();
$$;
create function public.ampm_set_user_role(p_user_id uuid,p_role text)
returns text language sql security invoker set search_path = '' as $$
  select ampm_role_internal.set_user_role(p_user_id,p_role);
$$;
revoke all on function public.ampm_list_user_roles(),public.ampm_set_user_role(uuid,text) from public,anon,authenticated;
grant execute on function public.ampm_list_user_roles(),public.ampm_set_user_role(uuid,text) to authenticated;
-- Membership writes go through the checked, atomic role-changing function.
revoke insert,update,delete on public.admins from public,anon,authenticated;
revoke insert,update,delete on public.employees from public,anon,authenticated;
commit;
