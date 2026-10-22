
create table public.policies (
  policy_number text primary key,
  registration text not null,
  mobile text not null,
  make text not null, model text not null, year int not null,
  cover_type text not null,
  start_date date not null, end_date date not null,
  idv int not null default 0,
  zero_dep boolean not null default false,
  own_damage boolean not null default true,
  claims_this_year int not null default 0
);
create table public.vehicle_segments (make text not null, model text not null, segment text not null, primary key(make, model));
create table public.repair_costs (
  id serial primary key,
  part text not null, action text not null, segment text not null,
  parts_cost int not null, labour_cost int not null, paint_cost int not null,
  material text not null default 'metal',
  unique(part, action, segment)
);
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('AS-' || upper(substr(md5(random()::text),1,8))),
  policy_number text,
  incident_date date not null,
  status text not null default 'draft',
  escalation_reasons jsonb not null default '[]',
  assessment jsonb,
  estimate jsonb,
  limits jsonb,
  current_offer int,
  round int not null default 0,
  manipulation_attempts int not null default 0,
  settlement_amount int,
  model_calls int not null default 0,
  priority text not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.media (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'image',
  source text,
  phash text,
  quality jsonb,
  exif jsonb,
  detection jsonb,
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  role text not null, content text not null, amount int, action text,
  created_at timestamptz not null default now()
);
create table public.audit_entries (
  id bigserial primary key,
  claim_id uuid references public.claims(id) on delete cascade,
  actor text not null, step text not null,
  input_summary text, output_summary text, rule text, confidence numeric,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.verify_attempts (key text primary key, failures int not null default 0, updated_at timestamptz not null default now());

do $$ declare t text; begin
  foreach t in array array['policies','vehicle_segments','repair_costs','claims','media','messages','audit_entries','verify_attempts'] loop
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

insert into public.policies values
('DEMO-1001','UP65AB1234','9000000000','Maruti','Swift',2021,'comprehensive','2026-03-01','2027-02-28',450000,true,true,0),
('DEMO-1002','UP65CD5678','9000000000','Hyundai','i20',2019,'comprehensive','2025-01-01','2025-12-31',300000,false,true,0),
('DEMO-1003','UP32EF9012','9000000000','Tata','Nexon',2022,'third-party only','2026-01-01','2026-12-31',0,false,false,0),
('DEMO-1004','DL8CGH3456','9000000000','Honda','City',2018,'comprehensive','2026-01-01','2026-12-31',380000,false,true,0),
('DEMO-1005','MH12JK7890','9000000000','Kia','Seltos',2023,'comprehensive','2026-01-01','2026-12-31',900000,true,true,2);

insert into public.vehicle_segments values
('Maruti','Swift','hatchback'),('Hyundai','i20','hatchback'),('Tata','Nexon','suv'),('Honda','City','sedan'),('Kia','Seltos','suv');

insert into public.repair_costs(part,action,segment,parts_cost,labour_cost,paint_cost,material)
select p.part, a.action, s.segment,
  case when a.action='repair' then 0 else round(p.base * s.mult)::int end,
  round(case when a.action='repair' then p.labour*1.0 else p.labour*0.6 end * s.mult)::int,
  case when p.paintable then round(p.paint * s.mult)::int else 0 end,
  p.material
from (values
 ('front_bumper',6500,1800,3000,'plastic',true),('rear_bumper',6000,1800,3000,'plastic',true),
 ('hood',9000,2200,4000,'metal',true),('front_door',11000,2500,4000,'metal',true),('rear_door',10000,2500,4000,'metal',true),
 ('fender',4500,1600,3000,'metal',true),('roof',14000,3500,5000,'metal',true),('boot',9500,2200,4000,'metal',true),
 ('windshield',8000,1200,0,'glass',false),('rear_windshield',6500,1200,0,'glass',false),
 ('headlight',7000,600,0,'plastic',false),('taillight',3500,500,0,'plastic',false),('side_mirror',3200,500,800,'plastic',true),
 ('quarter_panel',12000,3500,4500,'metal',true),('other',3000,1500,2000,'metal',true)
) as p(part,base,labour,paint,material,paintable)
cross join (values ('repair'),('replace')) a(action)
cross join (values ('hatchback',1.0),('sedan',1.25),('suv',1.5)) s(segment,mult);
