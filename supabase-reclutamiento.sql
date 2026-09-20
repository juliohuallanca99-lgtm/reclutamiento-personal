-- =====================================================================
--  RECLUTAMIENTO DE PERSONAL — CC0174
--  Ejecutar completo en Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- 1. Catálogo de puestos --------------------------------
create table if not exists public.puestos (
  id          bigserial primary key,
  nombre      text not null unique,
  area        text,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

insert into public.puestos (nombre, area) values
  ('Asistente de Almacén',              'Logística'),
  ('Almacenero',                        'Logística'),
  ('Controlador de Materiales',         'Logística'),
  ('Asistente de SSOMA',                'SSOMA'),
  ('Supervisor de Seguridad',           'SSOMA'),
  ('Ingeniero de Campo',                'Producción'),
  ('Maestro de Obra',                   'Producción'),
  ('Operario de Construcción Civil',    'Producción'),
  ('Oficial de Construcción Civil',     'Producción'),
  ('Peón',                              'Producción'),
  ('Soldador',                          'Producción'),
  ('Electricista',                      'Producción'),
  ('Operador de Equipo Pesado',         'Equipos'),
  ('Mecánico de Equipos',               'Equipos'),
  ('Asistente Administrativo',          'Administración'),
  ('Asistente de Recursos Humanos',     'Administración')
on conflict (nombre) do nothing;

-- ---------- 2. Postulantes ----------------------------------------
create table if not exists public.postulantes (
  id                  bigserial primary key,
  codigo              text unique,

  -- Información personal
  nombres             text not null,
  apellido_paterno    text not null,
  apellido_materno    text not null,
  tipo_documento      text not null default 'DNI',
  numero_documento    text not null,
  nacionalidad        text not null default 'Peruana',
  fecha_nacimiento    date,
  estado_civil        text,
  genero              text,
  celular             text not null,
  correo              text not null,
  direccion           text,
  departamento        text,
  provincia           text,
  distrito            text,
  discapacidad        boolean not null default false,

  -- Información académica
  nivel_educativo     text,
  centro_estudios     text,
  especialidad        text,
  estado_estudios     text,
  numero_colegiatura  text,

  -- Información de postulación
  puesto              text not null,
  experiencia_anios   numeric(4,1),
  fuente_reclutamiento text,
  expectativa_salarial numeric(10,2),
  disponibilidad_inmediata boolean not null default true,

  -- Curriculum Vitae (obligatorio)
  cv_path             text not null,
  cv_nombre           text,

  -- Seguimiento de RR.HH.
  estado              text not null default 'Nuevo',
  observaciones       text,
  revisado_por        text,
  revisado_en         timestamptz,

  creado_en           timestamptz not null default now()
);

create index if not exists idx_postulantes_doc    on public.postulantes (numero_documento);
create index if not exists idx_postulantes_puesto on public.postulantes (puesto);
create index if not exists idx_postulantes_estado on public.postulantes (estado);
create index if not exists idx_postulantes_fecha  on public.postulantes (creado_en desc);

-- ---------- 3. Correlativo automático  POST-00001 -----------------
create sequence if not exists public.postulante_correlativo start 1;

create or replace function public.set_codigo_postulante()
returns trigger language plpgsql as $$
begin
  if new.codigo is null then
    new.codigo := 'POST-' || lpad(nextval('public.postulante_correlativo')::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_codigo_postulante on public.postulantes;
create trigger trg_codigo_postulante
  before insert on public.postulantes
  for each row execute function public.set_codigo_postulante();

-- ---------- 4. Seguridad (RLS) ------------------------------------
alter table public.postulantes enable row level security;
alter table public.puestos     enable row level security;

-- Cualquier persona puede ver los puestos abiertos
drop policy if exists "puestos_lectura_publica" on public.puestos;
create policy "puestos_lectura_publica" on public.puestos
  for select to anon, authenticated using (activo = true);

-- Cualquier persona puede postular…
drop policy if exists "postular_publico" on public.postulantes;
create policy "postular_publico" on public.postulantes
  for insert to anon with check (true);

-- …pero solo RR.HH. (usuarios con sesión) puede leer y actualizar
drop policy if exists "rrhh_lee" on public.postulantes;
create policy "rrhh_lee" on public.postulantes
  for select to authenticated using (true);

drop policy if exists "rrhh_actualiza" on public.postulantes;
create policy "rrhh_actualiza" on public.postulantes
  for update to authenticated using (true) with check (true);

-- ---------- 5. Almacén de CV (privado) ----------------------------
insert into storage.buckets (id, name, public)
values ('cv', 'cv', false)
on conflict (id) do nothing;

drop policy if exists "cv_subida_publica" on storage.objects;
create policy "cv_subida_publica" on storage.objects
  for insert to anon with check (bucket_id = 'cv');

drop policy if exists "cv_lectura_rrhh" on storage.objects;
create policy "cv_lectura_rrhh" on storage.objects
  for select to authenticated using (bucket_id = 'cv');

-- ---------- 6. Marca de datos traídos de la consulta de DNI --------
alter table public.postulantes
  add column if not exists datos_verificados boolean not null default false;
