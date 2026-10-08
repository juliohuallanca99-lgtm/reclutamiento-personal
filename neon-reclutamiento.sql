-- =====================================================================
--  RECLUTAMIENTO DE PERSONAL — CC0174
--  Base de datos: Neon (PostgreSQL)
--  Ejecutar completo en Neon > SQL Editor
-- =====================================================================

-- ---------- 1. Catálogo de puestos --------------------------------
create table if not exists puestos (
  id          bigserial primary key,
  nombre      text not null unique,
  area        text,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

insert into puestos (nombre, area) values
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
create table if not exists postulantes (
  id                  bigserial primary key,
  codigo              text unique,

  -- Información personal
  nombres             text not null,
  apellido_paterno    text not null,
  apellido_materno    text not null,
  tipo_documento      text not null default 'DNI',
  numero_documento    text not null,
  datos_verificados   boolean not null default false,
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

  -- Curriculum Vitae (en Vercel Blob)
  cv_url              text not null,
  cv_nombre           text,

  -- Seguimiento de RR.HH.
  estado              text not null default 'Nuevo',
  observaciones       text,
  revisado_por        text,
  revisado_en         timestamptz,

  creado_en           timestamptz not null default now()
);

create index if not exists idx_postulantes_doc    on postulantes (numero_documento);
create index if not exists idx_postulantes_puesto on postulantes (puesto);
create index if not exists idx_postulantes_estado on postulantes (estado);
create index if not exists idx_postulantes_fecha  on postulantes (creado_en desc);

-- ---------- 3. Correlativo automático  POST-00001 -----------------
create sequence if not exists postulante_correlativo start 1;

create or replace function set_codigo_postulante()
returns trigger language plpgsql as $$
begin
  if new.codigo is null then
    new.codigo := 'POST-' || lpad(nextval('postulante_correlativo')::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_codigo_postulante on postulantes;
create trigger trg_codigo_postulante
  before insert on postulantes
  for each row execute function set_codigo_postulante();

-- ---------- 4. Usuarios de RR.HH. (para el panel) -----------------
create table if not exists usuarios (
  id            bigserial primary key,
  usuario       text not null unique,
  nombre        text not null,
  clave_hash    text not null,
  activo        boolean not null default true,
  ultimo_acceso timestamptz,
  creado_en     timestamptz not null default now()
);

-- La cuenta de RR.HH. se crea desde /api/crear-usuario una sola vez,
-- para que la contraseña quede cifrada y nunca escrita en este archivo.

-- ---------- 5. Registro de consultas de DNI (Ley 29733) -----------
create table if not exists consultas_dni (
  id          bigserial primary key,
  numero      text not null,
  origen_ip   text,
  exito       boolean not null default true,
  consultado_en timestamptz not null default now()
);

create index if not exists idx_consultas_fecha on consultas_dni (consultado_en desc);

-- ---------- 6. Códigos de ubigeo normalizados --------------------
-- Las listas encadenadas del formulario guardan además el código
-- oficial del distrito. Son dos catastros distintos para el mismo
-- lugar (Marcona: INEI 110304, RENIEC 100304), por eso van separados.
alter table postulantes
  add column if not exists ubigeo_inei   text,
  add column if not exists ubigeo_reniec text;

create index if not exists idx_postulantes_ubigeo on postulantes (ubigeo_inei);

-- ---------- 7. Protección de la cuota mensual --------------------
-- El plan contratado tiene un tope de consultas al mes. Los límites
-- deben vivir en la base, no en memoria: en Vercel cada instancia
-- tiene su propia memoria y un contador ahí no frena nada.

-- Distingue una llamada real al proveedor (gasta cuota) de un
-- resultado servido desde la caché (no gasta).
alter table consultas_dni
  add column if not exists origen text not null default 'proveedor';

create index if not exists idx_consultas_ip
  on consultas_dni (origen_ip, consultado_en desc);

create index if not exists idx_consultas_cuota
  on consultas_dni (consultado_en) where origen = 'proveedor';

-- Caché de resultados: evita pagar dos veces por el mismo DNI.
-- No es un padrón paralelo: solo responde cuando se le da el número
-- exacto, se purga sola y guarda únicamente nombres.
create table if not exists cache_identidad (
  numero_documento text primary key,
  nombres          text,
  apellido_paterno text,
  apellido_materno text,
  guardado_en      timestamptz not null default now()
);

-- Purga lo vencido. Conviene correrla de vez en cuando.
-- delete from cache_identidad where guardado_en < now() - interval '30 days';

-- ---------- 8. CV en almacenamiento privado ----------------------
-- Los CV dejan de ser públicos: se leen por su ruta interna desde
-- /api/cv, que exige sesión de RR.HH. La dirección del archivo
-- nunca sale del servidor.
alter table postulantes
  add column if not exists cv_pathname text;

-- cv_url deja de ser obligatorio: las postulaciones nuevas guardan la
-- ruta privada en cv_pathname y ya no tienen enlace público. Sin esto,
-- ninguna postulación nueva podría guardarse.
alter table postulantes
  alter column cv_url drop not null;

-- Al menos uno de los dos debe existir.
alter table postulantes
  drop constraint if exists postulantes_cv_presente;
alter table postulantes
  add constraint postulantes_cv_presente
  check (cv_pathname is not null or cv_url is not null);

-- Los CV subidos antes de este cambio siguen con su enlace público
-- en cv_url. Los nuevos guardan la ruta en cv_pathname.
