import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111';
const customer='22222222-2222-4222-8222-222222222222';
const staff='33333333-3333-4333-8333-333333333333';
async function database(t) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table public.profiles(id uuid primary key);
 create table public.admins(user_id uuid primary key);
 create table public.employees(user_id uuid primary key);
 alter table public.admins enable row level security;
 alter table public.employees enable row level security;
 grant usage on schema public,auth to anon,authenticated;
 grant select,insert,update,delete on public.admins,public.employees to authenticated;
 create policy self_admin on public.admins for select to authenticated using(user_id=auth.uid());
 create policy self_staff on public.employees for select to authenticated using(user_id=auth.uid());
 insert into auth.users values('${admin}'),('${customer}'),('${staff}');
 insert into public.profiles select id from auth.users;
 insert into public.admins values('${admin}');insert into public.employees values('${staff}');`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261001065603_admin_user_role_management.sql',import.meta.url),'utf8'));
 return db;
}
async function login(db,id){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated`);}
const change=(id,role)=>`select public.ampm_set_user_role('${id}','${role}')`;
test('admin sees every role and can grant/demote admin and employee with exclusive memberships',async t=>{
 const d=await database(t);await login(d,admin);
 const roles=(await d.query('select * from public.ampm_list_user_roles() order by user_id')).rows;
 assert.deepEqual(roles.map(r=>r.user_role),['admin','customer','employee']);
 await d.query(change(customer,'admin'));
 await login(d,customer);
 await d.query(change(staff,'admin'));
 await d.exec('reset role');
 assert.equal((await d.query(`select * from public.employees where user_id='${staff}'`)).rows.length,0);
 await login(d,admin);await d.query(change(staff,'employee'));await d.query(change(customer,'customer'));
 assert.deepEqual((await d.query('select * from public.ampm_list_user_roles() order by user_id')).rows.map(r=>r.user_role),['admin','customer','employee']);
});
test('customers, employees and anonymous callers cannot read role lists or promote anyone',async t=>{
 const d=await database(t);
 for(const user of [customer,staff,'']){
  await login(d,user);
  await assert.rejects(d.query('select * from public.ampm_list_user_roles()'),/Admin permission required/);
  await assert.rejects(d.query(change(user||customer,'admin')),/Admin permission required/);
  await assert.rejects(d.query(`insert into public.admins values('${customer}')`),/permission denied/);
  await assert.rejects(d.query(`delete from public.employees`),/permission denied/);
 }
 await d.exec('reset role;set role anon');
 await assert.rejects(d.query(change(customer,'admin')),/permission denied/);
 await assert.rejects(d.query('select * from public.ampm_list_user_roles()'),/permission denied/);
});
test('last admin, invalid roles and nonexistent users are rejected without changing memberships',async t=>{
 const d=await database(t);await login(d,admin);
 for(const role of ['customer','employee']) await assert.rejects(d.query(change(admin,role)),/last administrator/);
 await assert.rejects(d.query(change(customer,'owner')),/Invalid user role/);
 await assert.rejects(d.query(change('44444444-4444-4444-8444-444444444444','admin')),/User not found/);
 await d.query(change(customer,'admin'));await d.query(change(admin,'customer'));
 await assert.rejects(d.query(change(staff,'admin')),/Admin permission required/);
 await login(d,customer);
 assert.equal((await d.query('select * from public.ampm_list_user_roles()')).rows.find(r=>r.user_id===admin).user_role,'customer');
});
