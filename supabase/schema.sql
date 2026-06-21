create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

do $$
begin
  create type public.app_role as enum (
    'SuperAdmin',
    'Admin',
    'Receptionist',
    'LabScientist',
    'Verifier',
    'Accountant'
  );
exception
  when duplicate_object then null;
end
$$;

alter type public.app_role add value if not exists 'SuperAdmin';

do $$
begin
  create type public.sample_status as enum (
    'Registered',
    'Collected',
    'In_Progress',
    'Results_Entered',
    'Verified',
    'Reported'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.invoice_payment_status as enum (
    'Unpaid',
    'Partial',
    'Paid'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.approval_status as enum (
    'Pending',
    'Approved',
    'Rejected'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.facility_access_mode as enum (
    'Demo',
    'FreeTrial',
    'Paid',
    'Locked'
  );
exception
  when duplicate_object then null;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  phone text,
  email text,
  is_active boolean not null default true,
  approval_status public.approval_status not null default 'Approved',
  approval_note text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  access_mode public.facility_access_mode not null default 'Paid',
  access_started_at timestamptz,
  access_ends_at timestamptz,
  annual_fee numeric(12,2) not null default 300000,
  parent_facility_id uuid references public.facilities(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.facilities
  add column if not exists parent_facility_id uuid references public.facilities(id) on delete set null;

alter table if exists public.facilities
  add column if not exists address text;

alter table if exists public.facilities
  add column if not exists phone text;

alter table if exists public.facilities
  add column if not exists email text;

alter table if exists public.facilities
  add column if not exists is_active boolean not null default true;

alter table if exists public.facilities
  add column if not exists approval_status public.approval_status not null default 'Approved';

alter table if exists public.facilities
  add column if not exists approval_note text;

alter table if exists public.facilities
  add column if not exists approved_at timestamptz;

alter table if exists public.facilities
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table if exists public.facilities
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table if exists public.facilities
  add column if not exists access_mode public.facility_access_mode not null default 'Paid';

alter table if exists public.facilities
  add column if not exists access_started_at timestamptz;

alter table if exists public.facilities
  add column if not exists access_ends_at timestamptz;

alter table if exists public.facilities
  add column if not exists annual_fee numeric(12,2) not null default 300000;

insert into public.facilities (name, code)
values ('Main Laboratory', 'MAIN-LAB')
on conflict (code) do update
set name = excluded.name;

create or replace function public.default_facility_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.facilities
  order by created_at asc
  limit 1;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  role public.app_role not null default 'Receptionist',
  facility_id uuid references public.facilities(id) on delete set null default public.default_facility_id(),
  approval_status public.approval_status not null default 'Approved',
  approval_note text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists facility_id uuid references public.facilities(id) on delete set null;

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists approval_status public.approval_status not null default 'Approved';

alter table public.profiles
  add column if not exists approval_note text;

alter table public.profiles
  add column if not exists approved_at timestamptz;

alter table public.profiles
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.profiles
  alter column facility_id set default public.default_facility_id();

update public.profiles profile
set email = auth_user.email
from auth.users auth_user
where profile.id = auth_user.id
  and profile.email is null;

update public.profiles
set approval_status = 'Approved',
    approved_at = coalesce(approved_at, now())
where approval_status is null;

update public.facilities
set approval_status = coalesce(approval_status, 'Approved'::public.approval_status),
    approved_at = case
      when coalesce(approval_status, 'Approved'::public.approval_status)::text = 'Approved'
        then coalesce(approved_at, now())
      else approved_at
    end,
    access_mode = coalesce(access_mode, 'Paid'::public.facility_access_mode),
    access_started_at = coalesce(access_started_at, created_at, now()),
    access_ends_at = coalesce(
      access_ends_at,
      case
        when coalesce(access_mode, 'Paid'::public.facility_access_mode) = 'Paid'::public.facility_access_mode
          then coalesce(created_at, now()) + interval '1 year'
        when coalesce(access_mode, 'Paid'::public.facility_access_mode) = 'Demo'::public.facility_access_mode
          then coalesce(created_at, now()) + interval '7 days'
        when coalesce(access_mode, 'Paid'::public.facility_access_mode) = 'FreeTrial'::public.facility_access_mode
          then coalesce(created_at, now()) + interval '30 days'
        else null
      end
    )
where approval_status is null
   or access_mode is null
   or access_started_at is null
   or (
     access_mode::text in ('Demo', 'FreeTrial', 'Paid')
     and access_ends_at is null
   );

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facilities(id) on delete restrict default public.default_facility_id(),
  lab_id text unique,
  name text,
  phone text,
  dob date,
  sex text,
  address text,
  email text,
  national_id text,
  emergency_contact text,
  lga text,
  state text,
  ndpr_consent boolean not null default false,
  ndpr_consent_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  medical_record_number text unique,
  first_name text,
  last_name text,
  date_of_birth date
);

alter table public.patients
  add column if not exists facility_id uuid references public.facilities(id) on delete restrict;

alter table public.patients
  add column if not exists lab_id text;

alter table public.patients
  add column if not exists name text;

alter table public.patients
  add column if not exists dob date;

alter table public.patients
  add column if not exists notes text;

alter table public.patients
  add column if not exists ndpr_consent boolean not null default false;

alter table public.patients
  add column if not exists ndpr_consent_at timestamptz;

alter table public.patients
  alter column facility_id set default public.default_facility_id();

alter table public.patients
  alter column first_name drop not null;

alter table public.patients
  alter column last_name drop not null;

alter table public.patients
  alter column medical_record_number drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_lab_id_key'
  ) then
    alter table public.patients
      add constraint patients_lab_id_key unique (lab_id);
  end if;
end
$$;

create sequence if not exists public.patient_lab_id_seq start 1000;
create sequence if not exists public.order_number_seq start 1000;
create sequence if not exists public.sample_code_seq start 1000;
create sequence if not exists public.invoice_number_seq start 1000;
create sequence if not exists public.receipt_number_seq start 1000;
create sequence if not exists public.test_code_seq start 1000;

create or replace function public.generate_patient_lab_id()
returns text
language sql
volatile
set search_path = public
as $$
  select 'PAT-' || lpad(nextval('public.patient_lab_id_seq')::text, 6, '0');
$$;

create or replace function public.generate_order_number()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  prefix text := to_char(timezone('Africa/Lagos', now()), 'MMDD');
  next_serial integer;
begin
  perform pg_advisory_xact_lock(hashtext('order-number-' || prefix));

  select coalesce(max(right(order_number, 3)::integer), 0) + 1
  into next_serial
  from public.orders
  where order_number ~ ('^' || prefix || '[0-9]{3}$');

  if next_serial > 999 then
    raise exception 'Test order number limit reached for prefix %', prefix;
  end if;

  return prefix || lpad(next_serial::text, 3, '0');
end;
$$;

create or replace function public.generate_sample_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  prefix text := to_char(timezone('Africa/Lagos', now()), 'MMDD');
  next_serial integer;
begin
  perform pg_advisory_xact_lock(hashtext(prefix));

  select coalesce(max(right(sample_code, 3)::integer), 0) + 1
  into next_serial
  from public.order_tests
  where sample_code ~ ('^' || prefix || '[0-9]{3}$');

  if next_serial > 999 then
    raise exception 'Sample ID limit reached for prefix %', prefix;
  end if;

  return prefix || lpad(next_serial::text, 3, '0');
end;
$$;

create or replace function public.generate_invoice_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;

create or replace function public.generate_receipt_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'RCT-' || lpad(nextval('public.receipt_number_seq')::text, 6, '0');
$$;

create or replace function public.test_category_prefix(category_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text := upper(regexp_replace(coalesce(category_name, 'Test'), '[^A-Za-z]', '', 'g'));
begin
  if lower(coalesce(category_name, '')) in ('haematology', 'hematology') then
    return 'HE';
  end if;

  return rpad(coalesce(nullif(left(cleaned, 2), ''), 'TE'), 2, 'X');
end;
$$;

create or replace function public.generate_test_code_for_category(category_name text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  prefix text := public.test_category_prefix(category_name);
  next_serial integer;
begin
  perform pg_advisory_xact_lock(hashtext('test-code-' || prefix));

  select coalesce(max(substring(test_code from length(prefix) + 1)::integer), 0) + 1
  into next_serial
  from public.tests
  where test_code ~ ('^' || prefix || '[0-9]{5}$');

  if next_serial > 99999 then
    raise exception 'Test ID limit reached for prefix %', prefix;
  end if;

  return prefix || lpad(next_serial::text, 5, '0');
end;
$$;

create or replace function public.generate_test_code()
returns text
language sql
volatile
set search_path = public
as $$
  select public.generate_test_code_for_category(null);
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval_status::text = 'Approved'
      and p.role::text in ('SuperAdmin', 'Admin')
  );
$$;

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval_status::text = 'Approved'
      and p.role::text = 'SuperAdmin'
  );
$$;

create or replace function public.current_user_is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval_status::text = 'Approved'
  );
$$;

create or replace function public.current_user_has_role_text(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.approval_status::text = 'Approved'
      and p.role::text = any (allowed_roles)
  );
$$;

create or replace function public.current_user_can_register_patients()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin', 'Receptionist']);
$$;

create or replace function public.current_user_can_create_orders()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin', 'Receptionist']);
$$;

create or replace function public.current_user_can_move_samples()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin', 'Receptionist', 'LabScientist', 'Verifier']);
$$;

create or replace function public.current_user_can_enter_results()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin', 'LabScientist']);
$$;

create or replace function public.current_user_can_update_results()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin', 'LabScientist', 'Verifier']);
$$;

create or replace function public.current_user_can_verify_results()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin', 'Verifier']);
$$;

create or replace function public.current_user_can_manage_branding()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin']);
$$;

create or replace function public.current_user_can_access_qc()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin', 'LabScientist', 'Verifier']);
$$;

create or replace function public.current_user_can_manage_qc()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_role_text(array['SuperAdmin', 'Admin', 'LabScientist']);
$$;

create or replace function public.current_user_facility_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.facility_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.facility_scope_contains(root_facility_id uuid, target_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive facility_scope as (
    select f.id
    from public.facilities f
    where f.id = root_facility_id

    union all

    select child.id
    from public.facilities child
    inner join facility_scope scope
      on child.parent_facility_id = scope.id
  )
  select exists (
    select 1
    from facility_scope
    where id = target_facility_id
  );
$$;

create or replace function public.facility_management_scope_allowed(target_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'authenticated'
    and target_facility_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.approval_status::text = 'Approved'
        and p.facility_id is not null
        and (
          p.role::text = 'SuperAdmin'
          or public.facility_scope_contains(p.facility_id, target_facility_id)
        )
    );
$$;

create or replace function public.facility_service_active(target_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.facilities f
    where f.id = target_facility_id
      and f.approval_status::text = 'Approved'
      and f.is_active = true
      and (
        f.access_mode::text = 'Paid'
        or (
          f.access_mode::text in ('Demo', 'FreeTrial')
          and f.access_ends_at is not null
          and now() <= f.access_ends_at
        )
      )
  );
$$;

create or replace function public.facility_access_allowed(target_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'authenticated'
    and target_facility_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.approval_status::text = 'Approved'
        and p.facility_id is not null
        and (
          p.role::text = 'SuperAdmin'
          or (
            public.facility_scope_contains(p.facility_id, target_facility_id)
            and public.facility_service_active(target_facility_id)
          )
        )
    );
$$;

create or replace function public.current_user_access_snapshot()
returns table (
  profile_id uuid,
  role public.app_role,
  facility_id uuid,
  facility_name text,
  profile_approval_status public.approval_status,
  facility_approval_status public.approval_status,
  facility_access_mode public.facility_access_mode,
  facility_access_started_at timestamptz,
  facility_access_ends_at timestamptz,
  facility_is_active boolean,
  annual_fee numeric,
  access_state text,
  access_message text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.role,
    p.facility_id,
    f.name,
    p.approval_status,
    coalesce(f.approval_status, 'Pending'::public.approval_status),
    coalesce(f.access_mode, 'Locked'::public.facility_access_mode),
    f.access_started_at,
    f.access_ends_at,
    coalesce(f.is_active, false),
    coalesce(f.annual_fee, 300000),
    case
      when p.approval_status::text = 'Rejected' then 'account_rejected'
      when p.approval_status::text <> 'Approved' then 'account_pending'
      when p.role::text = 'SuperAdmin' then 'active'
      when p.facility_id is null then 'facility_unassigned'
      when f.id is null then 'facility_missing'
      when f.approval_status::text = 'Rejected' then 'facility_rejected'
      when f.approval_status::text <> 'Approved' then 'facility_pending'
      when coalesce(f.is_active, false) = false then 'facility_inactive'
      when f.access_mode::text = 'Locked' then 'payment_required'
      when f.access_mode::text = 'Demo' and (f.access_ends_at is null or now() > f.access_ends_at)
        then 'demo_expired'
      when f.access_mode::text = 'FreeTrial' and (f.access_ends_at is null or now() > f.access_ends_at)
        then 'trial_expired'
      when f.access_mode::text = 'Paid' and f.access_ends_at is not null and now() > f.access_ends_at
        then 'subscription_expired'
      else 'active'
    end,
    case
      when p.approval_status::text = 'Rejected'
        then coalesce(nullif(btrim(p.approval_note), ''), 'Your account request was rejected. Contact the platform owner for review.')
      when p.approval_status::text <> 'Approved'
        then 'Your account is waiting for Super Admin approval before you can use the platform.'
      when p.role::text = 'SuperAdmin'
        then 'Super Admin access is active.'
      when p.facility_id is null
        then 'Your account has not been assigned to a facility yet.'
      when f.id is null
        then 'The facility linked to your account could not be found.'
      when f.approval_status::text = 'Rejected'
        then coalesce(nullif(btrim(f.approval_note), ''), 'This facility request was rejected by the Super Admin.')
      when f.approval_status::text <> 'Approved'
        then 'This facility or branch is waiting for Super Admin approval.'
      when coalesce(f.is_active, false) = false
        then 'This facility is currently inactive. Contact support to reactivate it.'
      when f.access_mode::text = 'Locked'
        then 'Access is locked. Please pay the annual reconnect fee of N300,000 to restore service.'
      when f.access_mode::text = 'Demo' and (f.access_ends_at is null or now() > f.access_ends_at)
        then 'Your one-week demo has ended. Switch this facility to a paid plan to continue.'
      when f.access_mode::text = 'FreeTrial' and (f.access_ends_at is null or now() > f.access_ends_at)
        then 'Your one-month free trial has ended. Please pay the annual reconnect fee of N300,000 to continue.'
      when f.access_mode::text = 'Paid' and f.access_ends_at is not null and now() > f.access_ends_at
        then 'The annual subscription has expired. Renew with N300,000 to reconnect this facility.'
      else 'Access is active.'
    end
  from public.profiles p
  left join public.facilities f
    on f.id = p.facility_id
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.patient_in_current_facility(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.patients p
    where p.id = target_patient_id
      and public.facility_access_allowed(p.facility_id)
  );
$$;

create or replace function public.prevent_non_super_admin_facility_reparent()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
    and new.parent_facility_id is distinct from old.parent_facility_id
    and not public.current_user_is_super_admin() then
    raise exception 'Only the Super Admin can change a facility parent';
  end if;

  if new.parent_facility_id = new.id then
    raise exception 'A facility cannot be its own parent';
  end if;

  return new;
end;
$$;

create or replace function public.sync_facility_access_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  previous_access_mode public.facility_access_mode;
  previous_access_started_at timestamptz;
  start_value timestamptz;
begin
  previous_access_mode := case
    when tg_op = 'UPDATE' then old.access_mode
    else null
  end;

  previous_access_started_at := case
    when tg_op = 'UPDATE' then old.access_started_at
    else null
  end;

  if new.access_mode is null then
    new.access_mode := 'Paid'::public.facility_access_mode;
  end if;

  if new.approval_status is null then
    new.approval_status := 'Approved'::public.approval_status;
  end if;

  if new.access_mode::text = 'Locked' then
    if new.access_started_at is null then
      new.access_started_at := coalesce(
        previous_access_started_at,
        now()
      );
    end if;

    return new;
  end if;

  start_value := coalesce(
    new.access_started_at,
    previous_access_started_at,
    now()
  );
  new.access_started_at := start_value;

  if tg_op = 'INSERT'
    or new.access_mode is distinct from previous_access_mode
    or new.access_started_at is distinct from previous_access_started_at
    or new.access_ends_at is null then
    new.access_ends_at := case
      when new.access_mode::text = 'Demo' then start_value + interval '7 days'
      when new.access_mode::text = 'FreeTrial' then start_value + interval '30 days'
      when new.access_mode::text = 'Paid' then start_value + interval '1 year'
      else new.access_ends_at
    end;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_non_super_admin_facility_control_changes()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
    and (
      new.approval_status is distinct from old.approval_status
      or new.approval_note is distinct from old.approval_note
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
      or new.access_mode is distinct from old.access_mode
      or new.access_started_at is distinct from old.access_started_at
      or new.access_ends_at is distinct from old.access_ends_at
      or new.annual_fee is distinct from old.annual_fee
    )
    and not public.current_user_is_super_admin() then
    raise exception 'Only the Super Admin can change facility approval and subscription controls';
  end if;

  return new;
end;
$$;

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  test_code text not null unique default public.generate_test_code(),
  facility_id uuid references public.facilities(id) on delete restrict,
  name text not null,
  category text,
  price numeric(12,2) not null default 0,
  result_type text not null check (result_type in ('numeric', 'text', 'boolean', 'panel')),
  reference_range jsonb not null default '{"mode":"text","text":"","min":null,"max":null}'::jsonb,
  unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.tests
  add column if not exists test_code text;

alter table if exists public.tests
  add column if not exists facility_id uuid references public.facilities(id) on delete restrict;

update public.tests
set test_code = public.generate_test_code_for_category(category)
where test_code is null
  or btrim(test_code) = ''
  or test_code ~ '^T[0-9]{5}$'
  or left(test_code, 2) <> public.test_category_prefix(category);

alter table if exists public.tests
  alter column test_code drop default;

alter table if exists public.tests
  alter column test_code set not null;

alter table if exists public.tests
  drop constraint if exists tests_name_key;

alter table if exists public.tests
  drop constraint if exists tests_test_code_key;

create unique index if not exists tests_scope_test_code_key
  on public.tests (
    coalesce(facility_id, '00000000-0000-0000-0000-000000000000'::uuid),
    upper(test_code)
  );

create unique index if not exists tests_scope_name_key
  on public.tests (
    coalesce(facility_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

create index if not exists tests_facility_active_name_idx
  on public.tests (facility_id, is_active, name);

create or replace function public.sync_test_code_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  expected_prefix text := public.test_category_prefix(new.category);
begin
  if new.test_code is null
    or btrim(new.test_code) = ''
    or new.test_code ~ '^T[0-9]{5}$'
    or left(new.test_code, 2) <> expected_prefix then
    new.test_code = public.generate_test_code_for_category(new.category);
  else
    new.test_code = upper(btrim(new.test_code));
  end if;

  return new;
end;
$$;

alter table if exists public.tests
  drop constraint if exists tests_result_type_check;

alter table if exists public.tests
  add constraint tests_result_type_check
  check (result_type in ('numeric', 'text', 'boolean', 'panel'));

do $$
begin
  if to_regclass('public.test_catalog') is not null then
    insert into public.tests (
      id,
      name,
      price,
      result_type,
      reference_range,
      unit,
      is_active,
      created_at,
      updated_at
    )
    select
      id,
      name,
      price_ngn,
      'text',
      jsonb_build_object(
        'mode', 'text',
        'text', coalesce(description, ''),
        'min', null,
        'max', null
      ),
      null,
      is_active,
      created_at,
      updated_at
    from public.test_catalog
    on conflict (id) do update
    set
      name = excluded.name,
      price = excluded.price,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at;
  end if;
end $$;

drop table if exists public.test_results cascade;
drop table if exists public.test_orders cascade;
drop table if exists public.test_catalog cascade;
drop function if exists public.legacy_order_in_current_facility(uuid) cascade;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  name text not null,
  category text,
  unit_cost numeric(12,2) not null default 0,
  quantity numeric(12,2) not null default 0,
  unit text not null default 'units',
  lot_number text,
  expiry_date date,
  reorder_level numeric(12,2) not null default 0,
  vendor text,
  storage_location text,
  description text,
  is_active boolean not null default true,
  last_stocked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('stock_in', 'stock_out', 'usage', 'adjustment')),
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  balance_after numeric(12,2) not null,
  reason text,
  reference_number text,
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  order_number text not null unique,
  patient_id uuid not null references public.patients(id) on delete restrict,
  status public.sample_status not null default 'Registered',
  priority text not null default 'routine',
  notes text,
  ordered_by uuid references auth.users(id) on delete set null,
  ordered_at timestamptz not null default now(),
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_tests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  test_id uuid not null references public.tests(id) on delete restrict,
  specimen_label text,
  status public.sample_status not null default 'Registered',
  sample_code text not null,
  barcode_value text not null,
  qr_value text not null,
  collected_at timestamptz,
  collected_by uuid references auth.users(id) on delete set null,
  in_progress_at timestamptz,
  results_entered_at timestamptz,
  verified_at timestamptz,
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, test_id)
);

alter table if exists public.order_tests
  drop constraint if exists order_tests_sample_code_key;

alter table if exists public.order_tests
  drop constraint if exists order_tests_barcode_value_key;

create table if not exists public.sample_custody_logs (
  id uuid primary key default gen_random_uuid(),
  order_test_id uuid not null references public.order_tests(id) on delete cascade,
  action text not null,
  from_status public.sample_status,
  to_status public.sample_status,
  notes text,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_test_results (
  id uuid primary key default gen_random_uuid(),
  order_test_id uuid not null unique references public.order_tests(id) on delete cascade,
  value_text text,
  value_numeric numeric(12,4),
  value_boolean boolean,
  interpretation text,
  abnormal_flag boolean not null default false,
  abnormal_reason text,
  entered_by uuid references auth.users(id) on delete set null,
  entered_at timestamptz not null default now(),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  invoice_number text not null unique default public.generate_invoice_number(),
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  payment_status public.invoice_payment_status not null default 'Unpaid',
  notes text,
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  order_test_id uuid unique references public.order_tests(id) on delete set null,
  test_name text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  receipt_number text not null unique default public.generate_receipt_number(),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null,
  reference_number text,
  notes text,
  received_by uuid references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  title text not null,
  category text not null default 'General',
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'inventory_purchase', 'inventory_usage', 'other')),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  inventory_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.tests
  add column if not exists category text;

update public.tests
set category = case
  when category is null or btrim(category) = '' then null
  when lower(btrim(category)) in ('haematology', 'hematology') then 'Haematology'
  when lower(btrim(category)) in ('blood group serology', 'blood group', 'serology') then 'Blood Group Serology'
  when lower(btrim(category)) = 'microbiology' then 'Microbiology'
  when lower(btrim(category)) in ('chemical pathology', 'chemistry', 'clinical chemistry') then 'Chemical Pathology'
  when lower(btrim(category)) = 'histopathology' then 'Histopathology'
  else null
end;

alter table if exists public.tests
  drop constraint if exists tests_category_allowed;

alter table if exists public.tests
  add constraint tests_category_allowed
  check (
    category is null or
    category in (
      'Haematology',
      'Blood Group Serology',
      'Microbiology',
      'Chemical Pathology',
      'Histopathology'
    )
  );

alter table if exists public.inventory_items
  add column if not exists unit_cost numeric(12,2) not null default 0;

alter table if exists public.inventory_transactions
  add column if not exists unit_cost numeric(12,2) not null default 0;

alter table if exists public.inventory_transactions
  add column if not exists total_cost numeric(12,2) not null default 0;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  entity_table text not null,
  entity_id uuid not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.test_bundles (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade default public.default_facility_id(),
  name text not null,
  description text,
  test_ids uuid[] not null default '{}'::uuid[],
  is_active boolean not null default true,
  usage_count bigint not null default 0,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, name)
);

alter table public.test_bundles
  add column if not exists usage_count bigint not null default 0;

alter table public.test_bundles
  add column if not exists last_used_at timestamptz;

drop function if exists public.bump_test_bundle_usage(uuid);
create or replace function public.bump_test_bundle_usage(target_bundle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_can_create_orders() then
    raise exception 'Only order creators can use facility bundles';
  end if;

  update public.test_bundles
  set
    usage_count = coalesce(usage_count, 0) + 1,
    last_used_at = now()
  where id = target_bundle_id
    and facility_id = public.current_user_facility_id();

  if not found then
    raise exception 'Bundle not found for this facility';
  end if;
end;
$$;

create table if not exists public.lab_branding_settings (
  facility_id uuid primary key references public.facilities(id) on delete cascade,
  lab_name text,
  logo_url text,
  address text,
  support_line text,
  accreditation text,
  signatory_name text,
  signatory_title text,
  report_footer text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_notifications (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  type text not null check (
    type in (
      'pending_verification',
      'low_stock',
      'near_expiry',
      'unpaid_invoice',
      'system'
    )
  ),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  entity_table text,
  entity_id uuid,
  created_for uuid references auth.users(id) on delete cascade,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.qc_controls (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  test_id uuid references public.tests(id) on delete set null,
  name text not null,
  lot_number text,
  level text,
  expected_value text,
  min_value numeric(12,4),
  max_value numeric(12,4),
  unit text,
  expiry_date date,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qc_runs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  control_id uuid not null references public.qc_controls(id) on delete cascade,
  performed_at timestamptz not null default now(),
  value_numeric numeric(12,4),
  value_text text,
  status text not null default 'review' check (status in ('pass', 'fail', 'review')),
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.analyzers (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  name text not null,
  model text,
  serial_number text,
  location text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calibration_logs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  analyzer_id uuid not null references public.analyzers(id) on delete cascade,
  calibration_date date not null default current_date,
  due_date date,
  status text not null default 'current' check (status in ('current', 'due', 'overdue')),
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict default public.default_facility_id(),
  analyzer_id uuid not null references public.analyzers(id) on delete cascade,
  maintenance_date date not null default current_date,
  maintenance_type text not null default 'Preventive',
  due_date date,
  status text not null default 'completed' check (status in ('completed', 'due', 'overdue')),
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.order_record_in_current_facility(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = target_order_id
      and public.facility_access_allowed(o.facility_id)
  );
$$;

create or replace function public.test_available_for_order(
  target_test_id uuid,
  target_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tests t
    join public.orders o on o.id = target_order_id
    where t.id = target_test_id
      and public.facility_access_allowed(o.facility_id)
      and (t.facility_id is null or t.facility_id = o.facility_id)
  );
$$;

create or replace function public.order_test_in_current_facility(target_order_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_tests ot
    join public.orders o on o.id = ot.order_id
    where ot.id = target_order_test_id
      and public.facility_access_allowed(o.facility_id)
  );
$$;

create or replace function public.sample_log_in_current_facility(target_log_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sample_custody_logs scl
    join public.order_tests ot on ot.id = scl.order_test_id
    join public.orders o on o.id = ot.order_id
    where scl.id = target_log_id
      and public.facility_access_allowed(o.facility_id)
  );
$$;

create or replace function public.result_record_in_current_facility(target_result_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_test_results otr
    join public.order_tests ot on ot.id = otr.order_test_id
    join public.orders o on o.id = ot.order_id
    where otr.id = target_result_id
      and public.facility_access_allowed(o.facility_id)
  );
$$;

create or replace function public.current_user_can_manage_billing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('SuperAdmin', 'Admin', 'Accountant')
  );
$$;

create or replace function public.invoice_in_current_facility(target_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invoices i
    where i.id = target_invoice_id
      and public.facility_access_allowed(i.facility_id)
  );
$$;

create or replace function public.invoice_item_in_current_facility(target_invoice_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where ii.id = target_invoice_item_id
      and public.facility_access_allowed(i.facility_id)
  );
$$;

create or replace function public.invoice_payment_in_current_facility(target_payment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invoice_payments ip
    where ip.id = target_payment_id
      and public.facility_access_allowed(ip.facility_id)
  );
$$;

create or replace function public.current_user_can_manage_inventory()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('SuperAdmin', 'Admin', 'LabScientist', 'Accountant')
  );
$$;

create or replace function public.inventory_item_in_current_facility(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inventory_items ii
    where ii.id = target_item_id
      and public.facility_access_allowed(ii.facility_id)
  );
$$;

create or replace function public.inventory_transaction_in_current_facility(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inventory_transactions it
    where it.id = target_transaction_id
      and public.facility_access_allowed(it.facility_id)
  );
$$;

drop function if exists public.apply_inventory_transaction(uuid, text, numeric, text, text, text);

create or replace function public.apply_inventory_transaction(
  target_item_id uuid,
  transaction_type_value text,
  quantity_value numeric,
  reason_value text default null,
  reference_number_value text default null,
  notes_value text default null,
  item_unit_cost_value numeric default null
)
returns table (
  transaction_id uuid,
  item_id uuid,
  facility_id uuid,
  transaction_type text,
  quantity numeric,
  balance_after numeric,
  created_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  item_record public.inventory_items%rowtype;
  next_balance numeric(12,2);
  quantity_delta numeric(12,2);
  normalized_type text;
  normalized_unit_cost numeric(12,2);
  inserted_transaction public.inventory_transactions%rowtype;
begin
  if target_item_id is null then
    raise exception 'Inventory item is required';
  end if;

  if quantity_value is null or quantity_value = 0 then
    raise exception 'Quantity must be greater than zero for stock movement';
  end if;

  normalized_type := lower(coalesce(transaction_type_value, ''));
  if normalized_type not in ('stock_in', 'stock_out', 'usage', 'adjustment') then
    raise exception 'Unsupported inventory transaction type: %', transaction_type_value;
  end if;

  if not public.current_user_can_manage_inventory() then
    raise exception 'Only inventory managers can post stock movements';
  end if;

  select *
  into item_record
  from public.inventory_items ii
  where ii.id = target_item_id
  for update;

  if item_record.id is null then
    raise exception 'Inventory item not found';
  end if;

  if not public.facility_access_allowed(item_record.facility_id) then
    raise exception 'You can only manage inventory inside your assigned facility';
  end if;

  quantity_delta :=
    case
      when normalized_type = 'stock_in' then abs(quantity_value)
      when normalized_type in ('stock_out', 'usage') then -abs(quantity_value)
      else quantity_value
    end;

  next_balance := coalesce(item_record.quantity, 0) + quantity_delta;
  normalized_unit_cost := greatest(
    coalesce(nullif(item_unit_cost_value, 0), item_record.unit_cost, 0),
    0
  );

  if next_balance < 0 then
    raise exception 'Insufficient stock. Current quantity is %', item_record.quantity;
  end if;

  update public.inventory_items
  set
    quantity = next_balance,
    unit_cost = case
      when normalized_type = 'stock_in' and normalized_unit_cost > 0 then normalized_unit_cost
      else unit_cost
    end,
    last_stocked_at = case
      when normalized_type = 'stock_in' then now()
      else last_stocked_at
    end
  where id = item_record.id
  returning * into item_record;

  insert into public.inventory_transactions (
    facility_id,
    item_id,
    transaction_type,
    quantity,
    unit_cost,
    total_cost,
    balance_after,
    reason,
    reference_number,
    notes,
    performed_by
  )
  values (
    item_record.facility_id,
    item_record.id,
    normalized_type,
    quantity_delta,
    normalized_unit_cost,
    abs(quantity_delta) * normalized_unit_cost,
    next_balance,
    nullif(btrim(reason_value), ''),
    nullif(btrim(reference_number_value), ''),
    nullif(btrim(notes_value), ''),
    auth.uid()
  )
  returning * into inserted_transaction;

  insert into public.audit_logs (
    facility_id,
    entity_table,
    entity_id,
    action,
    payload,
    actor_id
  )
  values (
    item_record.facility_id,
    'inventory_transactions',
    inserted_transaction.id,
    'inventory_transaction_posted',
    jsonb_build_object(
      'item_id', item_record.id,
      'item_name', item_record.name,
      'transaction_type', normalized_type,
      'quantity', quantity_delta,
      'balance_after', next_balance
    ),
    auth.uid()
  );

  return query
  select
    inserted_transaction.id,
    inserted_transaction.item_id,
    inserted_transaction.facility_id,
    inserted_transaction.transaction_type,
    inserted_transaction.quantity,
    inserted_transaction.balance_after,
    inserted_transaction.created_at;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    email,
    avatar_url,
    facility_id,
    approval_status,
    approval_note
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.email
    ),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url',
    public.default_facility_id(),
    'Pending'::public.approval_status,
    'Awaiting Super Admin approval'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.prevent_non_admin_role_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null
    and (
      new.role is distinct from old.role
      or new.facility_id is distinct from old.facility_id
      or new.approval_status is distinct from old.approval_status
      or new.approval_note is distinct from old.approval_note
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
    )
  then
    if (
      new.approval_status is distinct from old.approval_status
      or new.approval_note is distinct from old.approval_note
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
    )
    and not public.current_user_is_super_admin() then
      raise exception 'Only the Super Admin can approve or reject platform accounts';
    end if;

    if not public.current_user_is_admin() then
      raise exception 'Only Admin or Super Admin users can change user roles or facility assignments';
    end if;

    if (
      old.role::text = 'SuperAdmin'
      or new.role::text = 'SuperAdmin'
    )
    and not public.current_user_is_super_admin() then
      raise exception 'Only Super Admin users can assign or change the Super Admin role';
    end if;

    if (
      old.role::text = 'Admin'
      or new.role::text = 'Admin'
    )
    and not public.current_user_is_super_admin() then
      raise exception 'Only the Super Admin can assign or change Admin accounts';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_patient_defaults()
returns trigger
language plpgsql
as $$
declare
  derived_name text;
  space_index integer;
begin
  if new.facility_id is null then
    new.facility_id = coalesce(
      public.current_user_facility_id(),
      public.default_facility_id()
    );
  end if;

  if new.created_by is null then
    new.created_by = auth.uid();
  end if;

  if coalesce(nullif(btrim(new.lab_id), ''), '') = '' then
    new.lab_id = coalesce(
      nullif(btrim(new.medical_record_number), ''),
      public.generate_patient_lab_id()
    );
  end if;

  if coalesce(nullif(btrim(new.name), ''), '') = '' then
    new.name = nullif(
      concat_ws(
        ' ',
        nullif(btrim(new.first_name), ''),
        nullif(btrim(new.last_name), '')
      ),
      ''
    );
  end if;

  if coalesce(nullif(btrim(new.name), ''), '') = '' then
    new.name = new.lab_id;
  end if;

  if coalesce(nullif(btrim(new.medical_record_number), ''), '') = '' then
    new.medical_record_number = new.lab_id;
  end if;

  if new.dob is null then
    new.dob = new.date_of_birth;
  end if;

  if new.date_of_birth is null then
    new.date_of_birth = new.dob;
  end if;

  if coalesce(new.ndpr_consent, false) then
    new.ndpr_consent_at = coalesce(new.ndpr_consent_at, now());
  else
    new.ndpr_consent_at = null;
  end if;

  derived_name := nullif(btrim(new.name), '');
  if derived_name is not null then
    if coalesce(nullif(btrim(new.first_name), ''), '') = '' then
      new.first_name = split_part(derived_name, ' ', 1);
    end if;

    if coalesce(nullif(btrim(new.last_name), ''), '') = '' then
      space_index := position(' ' in derived_name);
      if space_index > 0 then
        new.last_name = nullif(trim(substring(derived_name from space_index + 1)), '');
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_order_defaults()
returns trigger
language plpgsql
as $$
declare
  patient_facility uuid;
begin
  select p.facility_id
  into patient_facility
  from public.patients p
  where p.id = new.patient_id;

  if patient_facility is null then
    raise exception 'Patient must belong to a facility before placing an order';
  end if;

  if new.facility_id is null then
    new.facility_id = patient_facility;
  end if;

  if new.facility_id is distinct from patient_facility then
    raise exception 'Order facility must match the patient facility';
  end if;

  if coalesce(nullif(btrim(new.order_number), ''), '') = '' then
    new.order_number = public.generate_order_number();
  end if;

  if new.ordered_by is null then
    new.ordered_by = auth.uid();
  end if;

  if new.ordered_at is null then
    new.ordered_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.sync_order_test_defaults()
returns trigger
language plpgsql
as $$
declare
  derived_specimen_label text;
begin
  if coalesce(nullif(btrim(new.sample_code), ''), '') = '' then
    select o.order_number
    into new.sample_code
    from public.orders o
    where o.id = new.order_id;

    new.sample_code = coalesce(new.sample_code, public.generate_sample_code());
  end if;

  if coalesce(nullif(btrim(new.barcode_value), ''), '') = '' then
    new.barcode_value = new.sample_code;
  end if;

  if coalesce(nullif(btrim(new.qr_value), ''), '') = '' then
    new.qr_value = new.sample_code;
  end if;

  if coalesce(nullif(btrim(new.specimen_label), ''), '') = '' then
    select t.name
    into derived_specimen_label
    from public.tests t
    where t.id = new.test_id;

    new.specimen_label = coalesce(derived_specimen_label, new.sample_code);
  end if;

  if new.status = 'Collected' and new.collected_at is null then
    new.collected_at = now();
    new.collected_by = coalesce(new.collected_by, auth.uid());
  end if;

  if new.status = 'In_Progress' and new.in_progress_at is null then
    new.in_progress_at = now();
  end if;

  if new.status = 'Results_Entered' and new.results_entered_at is null then
    new.results_entered_at = now();
  end if;

  if new.status = 'Verified' and new.verified_at is null then
    new.verified_at = now();
  end if;

  if new.status = 'Reported' and new.reported_at is null then
    new.reported_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.refresh_order_status(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count integer := 0;
  all_reported boolean := false;
  all_verified_or_reported boolean := false;
  all_results_or_better boolean := false;
  all_collected_or_better boolean := false;
  any_in_progress_or_better boolean := false;
  any_collected_or_better boolean := false;
  next_status public.sample_status := 'Registered';
begin
  select
    count(*)::integer,
    coalesce(bool_and(status = 'Reported'), false),
    coalesce(bool_and(status in ('Verified', 'Reported')), false),
    coalesce(bool_and(status in ('Results_Entered', 'Verified', 'Reported')), false),
    coalesce(bool_and(status in ('Collected', 'In_Progress', 'Results_Entered', 'Verified', 'Reported')), false),
    coalesce(bool_or(status in ('In_Progress', 'Results_Entered', 'Verified', 'Reported')), false),
    coalesce(bool_or(status in ('Collected', 'In_Progress', 'Results_Entered', 'Verified', 'Reported')), false)
  into
    total_count,
    all_reported,
    all_verified_or_reported,
    all_results_or_better,
    all_collected_or_better,
    any_in_progress_or_better,
    any_collected_or_better
  from public.order_tests
  where order_id = target_order_id;

  if total_count = 0 then
    next_status := 'Registered';
  elsif all_reported then
    next_status := 'Reported';
  elsif all_verified_or_reported then
    next_status := 'Verified';
  elsif all_results_or_better then
    next_status := 'Results_Entered';
  elsif any_in_progress_or_better then
    next_status := 'In_Progress';
  elsif all_collected_or_better or any_collected_or_better then
    next_status := 'Collected';
  else
    next_status := 'Registered';
  end if;

  update public.orders
  set
    status = next_status,
    reported_at = case when next_status = 'Reported' then coalesce(reported_at, now()) else null end,
    updated_at = now()
  where id = target_order_id;
end;
$$;

drop function if exists public.verify_result(uuid, text);
create or replace function public.verify_result(
  target_result_id uuid,
  verification_notes text default null
)
returns table (
  result_id uuid,
  order_test_id uuid,
  order_id uuid,
  sample_code text,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  result_record record;
  verification_time timestamptz := now();
begin
  if not public.current_user_can_verify_results() then
    raise exception 'Only administrators and HOD of Lab / Chief Scientist can verify results';
  end if;

  select
    otr.id,
    otr.order_test_id,
    ot.order_id,
    ot.sample_code,
    o.facility_id
  into result_record
  from public.order_test_results otr
  join public.order_tests ot on ot.id = otr.order_test_id
  join public.orders o on o.id = ot.order_id
  where otr.id = target_result_id
  for update of otr;

  if result_record.id is null then
    raise exception 'Result was not found';
  end if;

  if not public.facility_access_allowed(result_record.facility_id) then
    raise exception 'You can only verify results inside your assigned facility or branch group';
  end if;

  update public.order_test_results
  set
    verified_at = verification_time,
    verified_by = auth.uid(),
    updated_at = verification_time
  where id = target_result_id;

  update public.order_tests
  set
    status = 'Verified',
    verified_at = verification_time,
    updated_at = verification_time
  where id = result_record.order_test_id;

  insert into public.audit_logs (
    facility_id,
    entity_table,
    entity_id,
    action,
    actor_id,
    payload
  )
  values (
    result_record.facility_id,
    'order_test_results',
    target_result_id,
    'result_verified',
    auth.uid(),
    jsonb_build_object(
      'sample_code', result_record.sample_code,
      'verification_notes', verification_notes,
      'verified_at', verification_time
    )
  );

  perform public.refresh_order_status(result_record.order_id);

  return query
  select
    target_result_id,
    result_record.order_test_id::uuid,
    result_record.order_id::uuid,
    result_record.sample_code::text,
    verification_time;
end;
$$;

create or replace function public.queue_order_status_refresh()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_order_status(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.log_sample_custody_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.sample_custody_logs (
      order_test_id,
      action,
      from_status,
      to_status,
      notes,
      actor_id
    )
    values (
      new.id,
      'Sample registered',
      null,
      new.status,
      'Sample label generated for workflow tracking',
      auth.uid()
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.sample_custody_logs (
      order_test_id,
      action,
      from_status,
      to_status,
      notes,
      actor_id
    )
    values (
      new.id,
      'Status updated',
      old.status,
      new.status,
      'Workflow status changed',
      auth.uid()
    );
  end if;

  return new;
end;
$$;

create or replace function public.sync_order_test_result_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.entered_at is null then
    new.entered_at = now();
  end if;

  if new.entered_by is null then
    new.entered_by = auth.uid();
  end if;

  if new.verified_at is not null and new.verified_by is null then
    new.verified_by = auth.uid();
  end if;

  return new;
end;
$$;

create or replace function public.sync_invoice_for_order(target_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  invoice_record public.invoices%rowtype;
  computed_subtotal numeric(12,2);
  computed_paid numeric(12,2);
begin
  if target_order_id is null then
    raise exception 'Order is required for invoice synchronization';
  end if;

  if auth.role() = 'authenticated'
    and not public.order_record_in_current_facility(target_order_id) then
    raise exception 'You can only sync invoices inside your assigned facility';
  end if;

  select *
  into order_record
  from public.orders o
  where o.id = target_order_id;

  if order_record.id is null then
    raise exception 'Order not found';
  end if;

  insert into public.invoices (
    facility_id,
    order_id,
    created_by,
    issued_at
  )
  values (
    order_record.facility_id,
    order_record.id,
    auth.uid(),
    coalesce(order_record.ordered_at, now())
  )
  on conflict (order_id) do update
  set facility_id = excluded.facility_id
  returning * into invoice_record;

  delete from public.invoice_items
  where invoice_id = invoice_record.id;

  insert into public.invoice_items (
    invoice_id,
    order_test_id,
    test_name,
    quantity,
    unit_price,
    line_total
  )
  select
    invoice_record.id,
    ot.id,
    t.name,
    1,
    t.price,
    t.price
  from public.order_tests ot
  join public.tests t on t.id = ot.test_id
  where ot.order_id = order_record.id
  order by t.name asc;

  select coalesce(sum(ii.line_total), 0)
  into computed_subtotal
  from public.invoice_items ii
  where ii.invoice_id = invoice_record.id;

  select coalesce(sum(ip.amount), 0)
  into computed_paid
  from public.invoice_payments ip
  where ip.invoice_id = invoice_record.id;

  update public.invoices
  set
    subtotal = computed_subtotal,
    total_amount = greatest(computed_subtotal - discount_amount, 0),
    amount_paid = computed_paid,
    payment_status = case
      when computed_paid <= 0 then 'Unpaid'::public.invoice_payment_status
      when computed_paid < greatest(computed_subtotal - discount_amount, 0) then 'Partial'::public.invoice_payment_status
      else 'Paid'::public.invoice_payment_status
    end
  where id = invoice_record.id
  returning * into invoice_record;

  return invoice_record.id;
end;
$$;

create or replace function public.register_invoice_payment(
  target_invoice_id uuid,
  amount_value numeric,
  payment_method_value text,
  reference_number_value text default null,
  notes_value text default null
)
returns table (
  payment_id uuid,
  receipt_number text,
  invoice_id uuid,
  amount numeric,
  amount_paid numeric,
  balance_due numeric,
  payment_status public.invoice_payment_status,
  received_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_record public.invoices%rowtype;
  payment_record public.invoice_payments%rowtype;
  next_paid numeric(12,2);
  next_status public.invoice_payment_status;
begin
  if not public.current_user_can_manage_billing() then
    raise exception 'Only billing managers can register payments';
  end if;

  if amount_value is null or amount_value <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if target_invoice_id is null then
    raise exception 'Invoice is required';
  end if;

  select *
  into invoice_record
  from public.invoices i
  where i.id = target_invoice_id
  for update;

  if invoice_record.id is null then
    raise exception 'Invoice not found';
  end if;

  if not public.facility_access_allowed(invoice_record.facility_id) then
    raise exception 'You can only register payments inside your assigned facility';
  end if;

  if amount_value > greatest(invoice_record.total_amount - invoice_record.amount_paid, 0) then
    raise exception 'Payment amount exceeds the outstanding balance';
  end if;

  insert into public.invoice_payments (
    facility_id,
    invoice_id,
    amount,
    payment_method,
    reference_number,
    notes,
    received_by
  )
  values (
    invoice_record.facility_id,
    invoice_record.id,
    amount_value,
    coalesce(nullif(btrim(payment_method_value), ''), 'Cash'),
    nullif(btrim(reference_number_value), ''),
    nullif(btrim(notes_value), ''),
    auth.uid()
  )
  returning * into payment_record;

  next_paid := invoice_record.amount_paid + amount_value;
  next_status :=
    case
      when next_paid <= 0 then 'Unpaid'::public.invoice_payment_status
      when next_paid < invoice_record.total_amount then 'Partial'::public.invoice_payment_status
      else 'Paid'::public.invoice_payment_status
    end;

  update public.invoices
  set
    amount_paid = next_paid,
    payment_status = next_status
  where id = invoice_record.id
  returning * into invoice_record;

  insert into public.audit_logs (
    facility_id,
    entity_table,
    entity_id,
    action,
    payload,
    actor_id
  )
  values (
    invoice_record.facility_id,
    'invoice_payments',
    payment_record.id,
    'invoice_payment_received',
    jsonb_build_object(
      'invoice_id', invoice_record.id,
      'invoice_number', invoice_record.invoice_number,
      'amount', payment_record.amount,
      'payment_method', payment_record.payment_method,
      'receipt_number', payment_record.receipt_number
    ),
    auth.uid()
  );

  return query
  select
    payment_record.id,
    payment_record.receipt_number,
    payment_record.invoice_id,
    payment_record.amount,
    invoice_record.amount_paid,
    greatest(invoice_record.total_amount - invoice_record.amount_paid, 0),
    invoice_record.payment_status,
    payment_record.received_at;
end;
$$;

create or replace function public.sync_order_invoice_from_order_tests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_invoice_for_order(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.create_order_with_tests(
  patient_uuid uuid,
  selected_test_ids uuid[],
  priority_value text default 'routine',
  order_notes text default null
)
returns table (
  order_id uuid,
  order_number text,
  order_status public.sample_status,
  patient_id uuid,
  order_test_id uuid,
  test_id uuid,
  test_name text,
  sample_code text,
  barcode_value text,
  qr_value text,
  sample_status public.sample_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order public.orders%rowtype;
  patient_facility uuid;
  inserted_count integer;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authentication is required to create an order';
  end if;

  if patient_uuid is null then
    raise exception 'Patient is required';
  end if;

  if selected_test_ids is null or array_length(selected_test_ids, 1) is null then
    raise exception 'At least one test must be selected';
  end if;

  select p.facility_id
  into patient_facility
  from public.patients p
  where p.id = patient_uuid;

  if patient_facility is null then
    raise exception 'Patient not found';
  end if;

  if not public.facility_access_allowed(patient_facility) then
    raise exception 'You can only create orders inside your assigned facility';
  end if;

  insert into public.orders (
    facility_id,
    patient_id,
    priority,
    notes,
    ordered_by
  )
  values (
    patient_facility,
    patient_uuid,
    coalesce(nullif(btrim(priority_value), ''), 'routine'),
    nullif(btrim(order_notes), ''),
    auth.uid()
  )
  returning *
  into created_order;

  insert into public.order_tests (
    order_id,
    test_id,
    specimen_label
  )
  select
    created_order.id,
    t.id,
    t.name
  from public.tests t
  where t.id = any (selected_test_ids)
    and t.is_active = true
    and (t.facility_id is null or t.facility_id = created_order.facility_id)
  on conflict on constraint order_tests_order_id_test_id_key do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    raise exception 'No active tests were inserted for this order';
  end if;

  perform public.refresh_order_status(created_order.id);
  perform public.sync_invoice_for_order(created_order.id);

  return query
  select
    created_order.id,
    created_order.order_number,
    created_order.status,
    created_order.patient_id,
    ot.id,
    t.id,
    t.name,
    ot.sample_code,
    ot.barcode_value,
    ot.qr_value,
    ot.status
  from public.order_tests ot
  join public.tests t on t.id = ot.test_id
  where ot.order_id = created_order.id
  order by t.name asc;
end;
$$;

drop function if exists public.search_patients(text, integer, integer);

create function public.search_patients(
  search_term text default null,
  page_number integer default 1,
  page_size integer default 10
)
returns table (
  id uuid,
  facility_id uuid,
  lab_id text,
  name text,
  phone text,
  dob date,
  sex text,
  address text,
  email text,
  national_id text,
  emergency_contact text,
  lga text,
  state text,
  ndpr_consent boolean,
  ndpr_consent_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint,
  order_count bigint,
  similarity_score real
)
language sql
stable
set search_path = public
as $$
  with params as (
    select
      nullif(btrim(search_term), '') as query,
      greatest(coalesce(page_number, 1), 1) as current_page,
      least(greatest(coalesce(page_size, 10), 1), 100) as current_page_size
  ),
  filtered as (
    select
      p.*,
      greatest(
        similarity(lower(coalesce(p.name, '')), lower(coalesce(params.query, ''))),
        similarity(lower(coalesce(p.phone, '')), lower(coalesce(params.query, ''))),
        similarity(lower(coalesce(p.lab_id, '')), lower(coalesce(params.query, '')))
      ) as similarity_score
    from public.patients p
    cross join params
    where params.query is null
      or lower(coalesce(p.name, '')) % lower(params.query)
      or lower(coalesce(p.phone, '')) % lower(params.query)
      or lower(coalesce(p.lab_id, '')) % lower(params.query)
      or p.name ilike '%' || params.query || '%'
      or p.phone ilike '%' || params.query || '%'
      or p.lab_id ilike '%' || params.query || '%'
  ),
  counted as (
    select count(*)::bigint as total_count
    from filtered
  ),
  paged as (
    select *
    from filtered
    order by similarity_score desc, created_at desc
    limit (select current_page_size from params)
    offset (
      ((select current_page from params) - 1)
      * (select current_page_size from params)
    )
  )
  select
    paged.id,
    paged.facility_id,
    paged.lab_id,
    paged.name,
    paged.phone,
    paged.dob,
    paged.sex,
    paged.address,
    paged.email,
    paged.national_id,
    paged.emergency_contact,
    paged.lga,
    paged.state,
    paged.ndpr_consent,
    paged.ndpr_consent_at,
    paged.notes,
    paged.created_by,
    paged.created_at,
    paged.updated_at,
    counted.total_count,
    (
      select count(*)::bigint
      from public.orders o
      where o.patient_id = paged.id
    ) as order_count,
    paged.similarity_score
  from paged
  cross join counted;
$$;

update public.profiles
set facility_id = coalesce(facility_id, public.default_facility_id())
where facility_id is null;

update public.patients
set facility_id = coalesce(facility_id, public.default_facility_id())
where facility_id is null;

update public.patients
set lab_id = coalesce(
  nullif(btrim(lab_id), ''),
  nullif(btrim(medical_record_number), ''),
  public.generate_patient_lab_id()
)
where coalesce(nullif(btrim(lab_id), ''), '') = '';

update public.patients
set name = coalesce(
  nullif(btrim(name), ''),
  nullif(concat_ws(' ', first_name, last_name), ''),
  lab_id
)
where coalesce(nullif(btrim(name), ''), '') = '';

update public.patients
set ndpr_consent = false
where ndpr_consent is null;

update public.patients
set dob = coalesce(dob, date_of_birth)
where dob is null
  and date_of_birth is not null;

update public.patients
set date_of_birth = coalesce(date_of_birth, dob)
where date_of_birth is null
  and dob is not null;

update public.patients
set medical_record_number = coalesce(
  nullif(btrim(medical_record_number), ''),
  lab_id
)
where coalesce(nullif(btrim(medical_record_number), ''), '') = '';

do $$
declare
  order_row record;
begin
  for order_row in
    select id
    from public.orders
  loop
    perform public.sync_invoice_for_order(order_row.id);
  end loop;
end
$$;

alter table public.patients
  alter column facility_id set not null;

alter table public.patients
  alter column lab_id set not null;

alter table public.patients
  alter column name set not null;

alter table public.patients
  alter column ndpr_consent set not null;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists set_facilities_updated_at on public.facilities;
create trigger set_facilities_updated_at
before update on public.facilities
for each row execute procedure public.set_updated_at();

drop trigger if exists sync_facility_access_window on public.facilities;
create trigger sync_facility_access_window
before insert or update on public.facilities
for each row execute procedure public.sync_facility_access_window();

drop trigger if exists prevent_non_super_admin_facility_reparent on public.facilities;
create trigger prevent_non_super_admin_facility_reparent
before update on public.facilities
for each row execute procedure public.prevent_non_super_admin_facility_reparent();

drop trigger if exists prevent_non_super_admin_facility_control_changes on public.facilities;
create trigger prevent_non_super_admin_facility_control_changes
before update on public.facilities
for each row execute procedure public.prevent_non_super_admin_facility_control_changes();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists prevent_non_admin_role_change on public.profiles;
create trigger prevent_non_admin_role_change
before update on public.profiles
for each row execute procedure public.prevent_non_admin_role_change();

drop trigger if exists sync_patient_defaults on public.patients;
create trigger sync_patient_defaults
before insert or update on public.patients
for each row execute procedure public.sync_patient_defaults();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute procedure public.set_updated_at();

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
before update on public.invoices
for each row execute procedure public.set_updated_at();

drop trigger if exists sync_order_defaults on public.orders;
create trigger sync_order_defaults
before insert or update on public.orders
for each row execute procedure public.sync_order_defaults();

drop trigger if exists sync_order_test_defaults on public.order_tests;
create trigger sync_order_test_defaults
before insert or update on public.order_tests
for each row execute procedure public.sync_order_test_defaults();

drop trigger if exists queue_order_status_refresh_insert on public.order_tests;
create trigger queue_order_status_refresh_insert
after insert on public.order_tests
for each row execute procedure public.queue_order_status_refresh();

drop trigger if exists queue_order_status_refresh_update on public.order_tests;
create trigger queue_order_status_refresh_update
after update on public.order_tests
for each row execute procedure public.queue_order_status_refresh();

drop trigger if exists queue_order_status_refresh_delete on public.order_tests;
create trigger queue_order_status_refresh_delete
after delete on public.order_tests
for each row execute procedure public.queue_order_status_refresh();

drop trigger if exists sync_invoice_after_order_test_insert on public.order_tests;
create trigger sync_invoice_after_order_test_insert
after insert on public.order_tests
for each row execute procedure public.sync_order_invoice_from_order_tests();

drop trigger if exists sync_invoice_after_order_test_delete on public.order_tests;
create trigger sync_invoice_after_order_test_delete
after delete on public.order_tests
for each row execute procedure public.sync_order_invoice_from_order_tests();

drop trigger if exists log_sample_custody_insert on public.order_tests;
create trigger log_sample_custody_insert
after insert on public.order_tests
for each row execute procedure public.log_sample_custody_event();

drop trigger if exists log_sample_custody_update on public.order_tests;
create trigger log_sample_custody_update
after update on public.order_tests
for each row execute procedure public.log_sample_custody_event();

drop trigger if exists sync_order_test_result_defaults on public.order_test_results;
create trigger sync_order_test_result_defaults
before insert or update on public.order_test_results
for each row execute procedure public.sync_order_test_result_defaults();

drop trigger if exists set_patients_updated_at on public.patients;
create trigger set_patients_updated_at
before update on public.patients
for each row execute procedure public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute procedure public.set_updated_at();

drop trigger if exists set_order_tests_updated_at on public.order_tests;
create trigger set_order_tests_updated_at
before update on public.order_tests
for each row execute procedure public.set_updated_at();

drop trigger if exists set_order_test_results_updated_at on public.order_test_results;
create trigger set_order_test_results_updated_at
before update on public.order_test_results
for each row execute procedure public.set_updated_at();

drop trigger if exists set_tests_updated_at on public.tests;
create trigger set_tests_updated_at
before update on public.tests
for each row execute procedure public.set_updated_at();

drop trigger if exists set_test_bundles_updated_at on public.test_bundles;
create trigger set_test_bundles_updated_at
before update on public.test_bundles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_lab_branding_settings_updated_at on public.lab_branding_settings;
create trigger set_lab_branding_settings_updated_at
before update on public.lab_branding_settings
for each row execute procedure public.set_updated_at();

drop trigger if exists set_qc_controls_updated_at on public.qc_controls;
create trigger set_qc_controls_updated_at
before update on public.qc_controls
for each row execute procedure public.set_updated_at();

drop trigger if exists set_analyzers_updated_at on public.analyzers;
create trigger set_analyzers_updated_at
before update on public.analyzers
for each row execute procedure public.set_updated_at();

drop trigger if exists set_calibration_logs_updated_at on public.calibration_logs;
create trigger set_calibration_logs_updated_at
before update on public.calibration_logs
for each row execute procedure public.set_updated_at();

drop trigger if exists set_maintenance_logs_updated_at on public.maintenance_logs;
create trigger set_maintenance_logs_updated_at
before update on public.maintenance_logs
for each row execute procedure public.set_updated_at();

drop trigger if exists sync_test_code_defaults on public.tests;
create trigger sync_test_code_defaults
before insert or update of category, test_code on public.tests
for each row execute procedure public.sync_test_code_defaults();

create index if not exists profiles_facility_id_idx
  on public.profiles (facility_id);

create index if not exists profiles_email_idx
  on public.profiles (email);

create index if not exists patients_facility_id_idx
  on public.patients (facility_id);

create index if not exists patients_name_trgm_idx
  on public.patients using gin (name gin_trgm_ops);

create index if not exists patients_phone_trgm_idx
  on public.patients using gin (phone gin_trgm_ops);

create index if not exists patients_lab_id_trgm_idx
  on public.patients using gin (lab_id gin_trgm_ops);

create index if not exists orders_facility_id_idx
  on public.orders (facility_id);

create index if not exists orders_patient_id_idx
  on public.orders (patient_id);

create index if not exists orders_status_idx
  on public.orders (status);

create index if not exists order_tests_order_id_idx
  on public.order_tests (order_id);

create index if not exists order_tests_status_idx
  on public.order_tests (status);

create index if not exists order_tests_sample_code_idx
  on public.order_tests (sample_code);

create index if not exists tests_category_active_name_idx
  on public.tests (category, is_active, name);

create index if not exists order_tests_barcode_value_idx
  on public.order_tests (barcode_value);

create index if not exists sample_custody_logs_order_test_id_idx
  on public.sample_custody_logs (order_test_id, created_at desc);

create index if not exists order_test_results_order_test_id_idx
  on public.order_test_results (order_test_id);

create index if not exists order_test_results_abnormal_flag_idx
  on public.order_test_results (abnormal_flag);

create index if not exists audit_logs_facility_id_idx
  on public.audit_logs (facility_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_table, entity_id, created_at desc);

create index if not exists test_bundles_facility_name_idx
  on public.test_bundles (facility_id, is_active, name);

create index if not exists test_bundles_facility_usage_idx
  on public.test_bundles (facility_id, is_active, usage_count desc, last_used_at desc);

create index if not exists lab_branding_settings_facility_idx
  on public.lab_branding_settings (facility_id);

create index if not exists activity_notifications_facility_read_idx
  on public.activity_notifications (facility_id, is_read, created_at desc);

create index if not exists activity_notifications_type_idx
  on public.activity_notifications (facility_id, type, severity, created_at desc);

create index if not exists inventory_items_facility_name_idx
  on public.inventory_items (facility_id, name);

create index if not exists inventory_items_alert_idx
  on public.inventory_items (facility_id, is_active, expiry_date, quantity, reorder_level);

create index if not exists inventory_items_facility_category_idx
  on public.inventory_items (facility_id, category);

create index if not exists inventory_transactions_item_created_idx
  on public.inventory_transactions (item_id, created_at desc);

create index if not exists inventory_transactions_facility_created_idx
  on public.inventory_transactions (facility_id, created_at desc);

create index if not exists inventory_transactions_facility_type_created_idx
  on public.inventory_transactions (facility_id, transaction_type, created_at desc);

create index if not exists invoices_facility_status_idx
  on public.invoices (facility_id, payment_status, issued_at desc);

create index if not exists invoices_order_id_idx
  on public.invoices (order_id);

create index if not exists invoice_items_invoice_id_idx
  on public.invoice_items (invoice_id);

create index if not exists invoice_payments_invoice_id_idx
  on public.invoice_payments (invoice_id, received_at desc);

create index if not exists invoice_payments_facility_received_idx
  on public.invoice_payments (facility_id, received_at desc);

create index if not exists expenses_facility_date_idx
  on public.expenses (facility_id, expense_date desc);

create index if not exists expenses_facility_category_idx
  on public.expenses (facility_id, category, expense_date desc);

create index if not exists qc_controls_facility_active_idx
  on public.qc_controls (facility_id, is_active, expiry_date);

create index if not exists qc_runs_control_performed_idx
  on public.qc_runs (control_id, performed_at desc);

create index if not exists analyzers_facility_active_idx
  on public.analyzers (facility_id, is_active, name);

create index if not exists calibration_logs_facility_due_idx
  on public.calibration_logs (facility_id, due_date, status);

create index if not exists maintenance_logs_facility_due_idx
  on public.maintenance_logs (facility_id, due_date, status);

alter table public.facilities enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.orders enable row level security;
alter table public.order_tests enable row level security;
alter table public.sample_custody_logs enable row level security;
alter table public.order_test_results enable row level security;
alter table public.audit_logs enable row level security;
alter table public.tests enable row level security;
alter table public.test_bundles enable row level security;
alter table public.lab_branding_settings enable row level security;
alter table public.activity_notifications enable row level security;
alter table public.qc_controls enable row level security;
alter table public.qc_runs enable row level security;
alter table public.analyzers enable row level security;
alter table public.calibration_logs enable row level security;
alter table public.maintenance_logs enable row level security;

drop policy if exists "Authenticated can read facilities" on public.facilities;
drop policy if exists "Users can read visible facilities" on public.facilities;
create policy "Users can read visible facilities"
on public.facilities
for select
using (public.facility_management_scope_allowed(id));

drop policy if exists "Admins can manage facilities" on public.facilities;
drop policy if exists "Scoped admins can update facilities" on public.facilities;
drop policy if exists "Super admins can create branch facilities" on public.facilities;
drop policy if exists "Super admins can create facilities" on public.facilities;
drop policy if exists "Super admins can delete child facilities" on public.facilities;
drop policy if exists "Super admins can delete facilities" on public.facilities;
create policy "Scoped admins can update facilities"
on public.facilities
for update
using (
  public.current_user_is_admin()
  and public.facility_management_scope_allowed(id)
)
with check (
  public.current_user_is_admin()
  and public.facility_management_scope_allowed(id)
  and (parent_facility_id is null or parent_facility_id <> id)
  and (
    not public.current_user_is_super_admin()
    or parent_facility_id is null
    or public.facility_management_scope_allowed(parent_facility_id)
  )
);

create policy "Super admins can create facilities"
on public.facilities
for insert
with check (
  public.current_user_is_super_admin()
  and (
    parent_facility_id is null
    or public.facility_management_scope_allowed(parent_facility_id)
  )
);

drop policy if exists "Scoped admins can request child facilities" on public.facilities;
create policy "Scoped admins can request child facilities"
on public.facilities
for insert
with check (
  public.current_user_is_admin()
  and not public.current_user_is_super_admin()
  and parent_facility_id is not null
  and public.facility_management_scope_allowed(parent_facility_id)
  and approval_status::text = 'Pending'
  and access_mode::text = 'Locked'
);

create policy "Super admins can delete facilities"
on public.facilities
for delete
using (
  public.current_user_is_super_admin()
  and public.facility_management_scope_allowed(id)
  and id <> public.current_user_facility_id()
);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Scoped admins can read facility profiles" on public.profiles;
create policy "Scoped admins can read facility profiles"
on public.profiles
for select
using (
  public.current_user_is_admin()
  and (facility_id is null or public.facility_management_scope_allowed(facility_id))
  and (role::text <> 'SuperAdmin' or public.current_user_is_super_admin())
);

drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Scoped admins can update facility profiles" on public.profiles;
create policy "Scoped admins can update facility profiles"
on public.profiles
for update
using (
  public.current_user_is_admin()
  and (facility_id is null or public.facility_management_scope_allowed(facility_id))
  and (role::text <> 'SuperAdmin' or public.current_user_is_super_admin())
)
with check (
  public.current_user_is_admin()
  and (facility_id is null or public.facility_management_scope_allowed(facility_id))
  and (role::text <> 'SuperAdmin' or public.current_user_is_super_admin())
);

drop policy if exists "Admins can insert profiles" on public.profiles;
drop policy if exists "Scoped admins can insert facility profiles" on public.profiles;
create policy "Scoped admins can insert facility profiles"
on public.profiles
for insert
with check (
  public.current_user_is_admin()
  and (facility_id is null or public.facility_management_scope_allowed(facility_id))
  and (role::text <> 'SuperAdmin' or public.current_user_is_super_admin())
);

drop policy if exists "Facility users can read patients" on public.patients;
create policy "Facility users can read patients"
on public.patients
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Facility users can insert patients" on public.patients;
create policy "Facility users can insert patients"
on public.patients
for insert
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_register_patients()
);

drop policy if exists "Facility users can update patients" on public.patients;
drop policy if exists "Admins can update patients" on public.patients;
create policy "Admins can update patients"
on public.patients
for update
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_is_admin()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_is_admin()
);

drop policy if exists "Admins can delete patients" on public.patients;
create policy "Admins can delete patients"
on public.patients
for delete
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_is_admin()
);

drop policy if exists "Facility users can read inventory items" on public.inventory_items;
create policy "Facility users can read inventory items"
on public.inventory_items
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Inventory managers can insert items" on public.inventory_items;
create policy "Inventory managers can insert items"
on public.inventory_items
for insert
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_inventory()
);

drop policy if exists "Inventory managers can update items" on public.inventory_items;
create policy "Inventory managers can update items"
on public.inventory_items
for update
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_inventory()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_inventory()
);

drop policy if exists "Inventory managers can delete items" on public.inventory_items;
create policy "Inventory managers can delete items"
on public.inventory_items
for delete
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_inventory()
);

drop policy if exists "Facility users can read inventory transactions" on public.inventory_transactions;
create policy "Facility users can read inventory transactions"
on public.inventory_transactions
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Inventory managers can insert transactions" on public.inventory_transactions;
create policy "Inventory managers can insert transactions"
on public.inventory_transactions
for insert
with check (
  public.facility_access_allowed(facility_id)
  and public.inventory_item_in_current_facility(item_id)
  and public.current_user_can_manage_inventory()
);

drop policy if exists "Facility users can read invoices" on public.invoices;
create policy "Facility users can read invoices"
on public.invoices
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Billing managers can insert invoices" on public.invoices;
create policy "Billing managers can insert invoices"
on public.invoices
for insert
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_billing()
);

drop policy if exists "Billing managers can update invoices" on public.invoices;
create policy "Billing managers can update invoices"
on public.invoices
for update
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_billing()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_billing()
);

drop policy if exists "Facility users can read invoice items" on public.invoice_items;
create policy "Facility users can read invoice items"
on public.invoice_items
for select
using (public.invoice_in_current_facility(invoice_id));

drop policy if exists "Billing managers can manage invoice items" on public.invoice_items;
create policy "Billing managers can manage invoice items"
on public.invoice_items
for all
using (
  public.invoice_in_current_facility(invoice_id)
  and public.current_user_can_manage_billing()
)
with check (
  public.invoice_in_current_facility(invoice_id)
  and public.current_user_can_manage_billing()
);

drop policy if exists "Facility users can read invoice payments" on public.invoice_payments;
create policy "Facility users can read invoice payments"
on public.invoice_payments
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Billing managers can insert invoice payments" on public.invoice_payments;
create policy "Billing managers can insert invoice payments"
on public.invoice_payments
for insert
with check (
  public.facility_access_allowed(facility_id)
  and public.invoice_in_current_facility(invoice_id)
  and public.current_user_can_manage_billing()
);

drop policy if exists "Facility users can read expenses" on public.expenses;
create policy "Facility users can read expenses"
on public.expenses
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Billing managers can insert expenses" on public.expenses;
create policy "Billing managers can insert expenses"
on public.expenses
for insert
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_billing()
);

drop policy if exists "Billing managers can update expenses" on public.expenses;
create policy "Billing managers can update expenses"
on public.expenses
for update
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_billing()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_billing()
);

drop policy if exists "Billing managers can delete expenses" on public.expenses;
create policy "Billing managers can delete expenses"
on public.expenses
for delete
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_billing()
);

drop policy if exists "Facility users can read orders" on public.orders;
create policy "Facility users can read orders"
on public.orders
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Facility users can insert orders" on public.orders;
create policy "Facility users can insert orders"
on public.orders
for insert
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_create_orders()
);

drop policy if exists "Facility users can update orders" on public.orders;
create policy "Facility users can update orders"
on public.orders
for update
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_move_samples()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_move_samples()
);

drop policy if exists "Facility users can read order tests" on public.order_tests;
create policy "Facility users can read order tests"
on public.order_tests
for select
using (public.order_record_in_current_facility(order_id));

drop policy if exists "Facility users can insert order tests" on public.order_tests;
create policy "Facility users can insert order tests"
on public.order_tests
for insert
with check (
  public.order_record_in_current_facility(order_id)
  and public.test_available_for_order(test_id, order_id)
  and public.current_user_can_create_orders()
);

drop policy if exists "Facility users can update order tests" on public.order_tests;
create policy "Facility users can update order tests"
on public.order_tests
for update
using (
  public.order_record_in_current_facility(order_id)
  and public.test_available_for_order(test_id, order_id)
  and public.current_user_can_move_samples()
)
with check (
  public.order_record_in_current_facility(order_id)
  and public.test_available_for_order(test_id, order_id)
  and public.current_user_can_move_samples()
);

drop policy if exists "Facility users can read custody logs" on public.sample_custody_logs;
create policy "Facility users can read custody logs"
on public.sample_custody_logs
for select
using (public.order_test_in_current_facility(order_test_id));

drop policy if exists "Facility users can insert custody logs" on public.sample_custody_logs;
create policy "Facility users can insert custody logs"
on public.sample_custody_logs
for insert
with check (
  public.order_test_in_current_facility(order_test_id)
  and public.current_user_can_move_samples()
);

drop policy if exists "Facility users can read order test results" on public.order_test_results;
create policy "Facility users can read order test results"
on public.order_test_results
for select
using (public.order_test_in_current_facility(order_test_id));

drop policy if exists "Facility users can insert order test results" on public.order_test_results;
create policy "Facility users can insert order test results"
on public.order_test_results
for insert
with check (
  public.order_test_in_current_facility(order_test_id)
  and public.current_user_can_enter_results()
);

drop policy if exists "Facility users can update order test results" on public.order_test_results;
create policy "Facility users can update order test results"
on public.order_test_results
for update
using (
  public.order_test_in_current_facility(order_test_id)
  and public.current_user_can_enter_results()
)
with check (
  public.order_test_in_current_facility(order_test_id)
  and public.current_user_can_enter_results()
);

drop policy if exists "Facility users can read audit logs" on public.audit_logs;
create policy "Facility users can read audit logs"
on public.audit_logs
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Facility users can insert audit logs" on public.audit_logs;
create policy "Facility users can insert audit logs"
on public.audit_logs
for insert
with check (public.facility_access_allowed(facility_id));

drop policy if exists "Facility users can read test bundles" on public.test_bundles;
create policy "Facility users can read test bundles"
on public.test_bundles
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Order creators can manage test bundles" on public.test_bundles;
create policy "Order creators can manage test bundles"
on public.test_bundles
for all
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_create_orders()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_create_orders()
);

drop policy if exists "Facility users can read lab branding" on public.lab_branding_settings;
create policy "Facility users can read lab branding"
on public.lab_branding_settings
for select
using (public.facility_access_allowed(facility_id));

drop policy if exists "Admins can manage lab branding" on public.lab_branding_settings;
create policy "Admins can manage lab branding"
on public.lab_branding_settings
for all
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_branding()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_branding()
);

drop policy if exists "Facility users can read activity notifications" on public.activity_notifications;
create policy "Facility users can read activity notifications"
on public.activity_notifications
for select
using (
  public.facility_access_allowed(facility_id)
  and (created_for is null or created_for = auth.uid())
);

drop policy if exists "Facility users can update own activity notifications" on public.activity_notifications;
create policy "Facility users can update own activity notifications"
on public.activity_notifications
for update
using (
  public.facility_access_allowed(facility_id)
  and (created_for is null or created_for = auth.uid())
)
with check (
  public.facility_access_allowed(facility_id)
  and (created_for is null or created_for = auth.uid())
);

drop policy if exists "Admins can manage activity notifications" on public.activity_notifications;
create policy "Admins can manage activity notifications"
on public.activity_notifications
for all
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_is_admin()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_is_admin()
);

drop policy if exists "QC users can read controls" on public.qc_controls;
create policy "QC users can read controls"
on public.qc_controls
for select
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_access_qc()
);

drop policy if exists "QC managers can manage controls" on public.qc_controls;
create policy "QC managers can manage controls"
on public.qc_controls
for all
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
);

drop policy if exists "QC users can read runs" on public.qc_runs;
create policy "QC users can read runs"
on public.qc_runs
for select
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_access_qc()
);

drop policy if exists "QC managers can insert runs" on public.qc_runs;
create policy "QC managers can insert runs"
on public.qc_runs
for insert
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
);

drop policy if exists "QC users can read analyzers" on public.analyzers;
create policy "QC users can read analyzers"
on public.analyzers
for select
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_access_qc()
);

drop policy if exists "QC managers can manage analyzers" on public.analyzers;
create policy "QC managers can manage analyzers"
on public.analyzers
for all
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
);

drop policy if exists "QC users can read calibration logs" on public.calibration_logs;
create policy "QC users can read calibration logs"
on public.calibration_logs
for select
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_access_qc()
);

drop policy if exists "QC managers can manage calibration logs" on public.calibration_logs;
create policy "QC managers can manage calibration logs"
on public.calibration_logs
for all
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
);

drop policy if exists "QC users can read maintenance logs" on public.maintenance_logs;
create policy "QC users can read maintenance logs"
on public.maintenance_logs
for select
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_access_qc()
);

drop policy if exists "QC managers can manage maintenance logs" on public.maintenance_logs;
create policy "QC managers can manage maintenance logs"
on public.maintenance_logs
for all
using (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
)
with check (
  public.facility_access_allowed(facility_id)
  and public.current_user_can_manage_qc()
);

drop policy if exists "Authenticated can read tests" on public.tests;
create policy "Authenticated can read tests"
on public.tests
for select
using (
  auth.role() = 'authenticated'
  and (facility_id is null or public.facility_access_allowed(facility_id))
);

drop policy if exists "Admins can manage tests" on public.tests;
drop policy if exists "Branch admins can manage facility tests" on public.tests;
create policy "Branch admins can manage facility tests"
on public.tests
for all
using (
  public.current_user_has_role_text(array['Admin'])
  and facility_id = public.current_user_facility_id()
)
with check (
  public.current_user_has_role_text(array['Admin'])
  and facility_id = public.current_user_facility_id()
);

drop policy if exists "Super Admin can manage visible tests" on public.tests;
create policy "Super Admin can manage visible tests"
on public.tests
for all
using (
  public.current_user_is_super_admin()
  and (facility_id is null or public.facility_access_allowed(facility_id))
)
with check (
  public.current_user_is_super_admin()
  and (facility_id is null or public.facility_access_allowed(facility_id))
);
