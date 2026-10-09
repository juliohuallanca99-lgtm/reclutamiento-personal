-- =====================================================================
--  SEGUIMIENTO DE INGRESO DE PERSONAL — Marcobre Bateas
--  Módulo independiente del reclutamiento de postulantes: otras
--  tablas, otra pantalla, otro propósito.
--  Ejecutar en Neon > proyecto neon-erin-ladder > SQL Editor
-- =====================================================================

-- ---------- 1. Personal en proceso de ingreso --------------------
-- Las 7 etapas y las 11 capacitaciones se guardan como jsonb: son
-- listas de posición fija, cada elemento {k, l, c}. Normalizarlas en
-- tablas aparte obligaría a 18 uniones solo para pintar una fila.
create table if not exists seguimiento_personal (
  id               bigserial primary key,
  item             integer,
  dni              text,
  nombre           text not null,
  funcion          text,
  telefono         text,
  tipo             text,
  estado_proceso   text not null default 'EXAMEN MEDICO',
  etapas           jsonb not null default '[]'::jsonb,
  capacitaciones   jsonb not null default '[]'::jsonb,
  movilizacion     jsonb,
  observaciones    text,
  actualizado_por  text,
  actualizado_en   timestamptz,
  creado_en        timestamptz not null default now()
);

-- El DNI es único solo cuando existe: así se puede registrar a alguien
-- antes de tenerlo, sin que dos fichas vacías choquen entre sí.
create unique index if not exists idx_seg_dni_unico
  on seguimiento_personal (dni) where dni is not null and dni <> '';

create index if not exists idx_seg_estado on seguimiento_personal (estado_proceso);
create index if not exists idx_seg_item   on seguimiento_personal (item);

-- Por si las tablas ya existían de una carga anterior.
alter table seguimiento_personal add column if not exists telefono text;

-- ---------- 2. Registro de importaciones -------------------------
-- Cada carga de Excel deja constancia: quién, cuándo y qué cambió.
create table if not exists seguimiento_importaciones (
  id             bigserial primary key,
  archivo        text,
  filas_leidas   integer not null default 0,
  nuevos         integer not null default 0,
  actualizados   integer not null default 0,
  importado_por  text,
  importado_en   timestamptz not null default now()
);

-- ---------- 3. Datos iniciales -----------------------------------
-- Las 12 personas con DNI que ya tenía la página. Las dos fichas
-- vacías de «NUEVO TRABAJADOR» quedaron fuera a propósito.
-- Si el DNI ya existe no se toca: la carga por Excel es la que manda.
insert into seguimiento_personal
  (item, dni, nombre, funcion, tipo, estado_proceso, etapas, capacitaciones)
values
  (1, '29541560', 'ARIZAGA AGUILAR ALEXANDER', 'INGENIERO DE CONSTRUCCION', null, 'EXAMEN MEDICO', '[{"k": "obs", "l": "Observado", "c": "C OFTALMO + REEVALUCION PRESENCIAL CON LENTES EN CLINICA"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "ok", "l": "M10072"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Por tramitar"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Pendiente"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}]'::jsonb),
  (2, '00799474', 'GOMEZ HUARACHE NESTOR ADOLFO', 'INGENIERO DE CONSTRUCCION', null, 'EXAMEN MEDICO', '[{"k": "obs", "l": "Observado", "c": "IC ENDOCRINOLOGIA"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "ok", "l": "M10072"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Por tramitar"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "prog", "l": "06/10"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}]'::jsonb),
  (3, '46121676', 'MORILLO ESCUDERO JHAN', 'TOPÓGRAFO II', null, 'EN MOVILIZACION', '[{"k": "ok", "l": "Apto"}, {"k": "ok", "l": "Apto"}, {"k": "ok", "l": "Apto"}, {"k": "ok", "l": "M10072"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}]'::jsonb),
  (4, '46596364', 'HUMPIRI BRAVO BORIS IVAN', 'TOPOGRAFO II', null, 'EN MOVILIZACION', '[{"k": "ok", "l": "Apto"}, {"k": "ok", "l": "Apto"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "M10072"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}]'::jsonb),
  (5, '44881301', 'EGUIA ALAMO JAFET DANIEL', 'SUPERVISOR DE CAMPO II', null, 'EXAMEN MEDICO', '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Pendiente"}, {"k": "ok", "l": "M10060"}, {"k": "pend", "l": "Pendiente"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Por tramitar"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "prog", "l": "09/10"}, {"k": "prog", "l": "06/10"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}]'::jsonb),
  (6, '25757807', 'SOSA QUINO MIGUEL SANTIAGO', 'SUPERVISOR DE CONTRUCCION', null, 'EN MOVILIZACION', '[{"k": "ok", "l": "Apto"}, {"k": "ok", "l": "Apto"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "M10060"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "prog", "l": "09/10"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}]'::jsonb),
  (7, '40474238', 'TOYOSATO RAMOS, JAVIER RAUL', 'GERENTE DE CONSTRUCCION', null, 'EXAMEN MEDICO', '[{"k": "obs", "l": "Observado", "c": "IC OFTALMO + REEVALUCIÓN C LENTERS"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "ok", "l": "M9992"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Por tramitar"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}, {"k": "pend", "l": "Pendiente"}]'::jsonb),
  (8, '03892158', 'ALEJOS LIZAMA DENNY RONALD', 'JEFE DE SERVICIOS GENERALES I', null, 'LABORANDO', '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Impreso"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}]'::jsonb),
  (9, '77291791', 'CHAVEZ MEDINA DIANA', 'ENFERMERO OCUPACIONAL', null, 'LABORANDO', '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Impreso"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}]'::jsonb),
  (10, '44170875', 'OCHOA ACUÑA ROMAN', 'JEFE DE SSOMA I', null, 'LABORANDO', '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Impreso"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}]'::jsonb),
  (11, '41688529', 'SANCHEZ FERNANDEZ EDINSON OMAR', 'INSPECTOR DE SSOMA', null, 'LABORANDO', '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Impreso"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}]'::jsonb),
  (12, '41225998', 'ZEGARRA GUZMAN JUAN CARLOS', 'SUPERVISOR DE SSOMA', null, 'CON LICENCIA', '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Impreso"}]'::jsonb, '[{"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}, {"k": "ok", "l": "Aprobado"}]'::jsonb)
on conflict do nothing;

update seguimiento_personal set movilizacion = '{"k": "prog", "l": "08/10/2026", "d": "2026-10-08"}'::jsonb where dni = '46121676';
update seguimiento_personal set movilizacion = '{"k": "prog", "l": "08/10/2026", "d": "2026-10-08"}'::jsonb where dni = '46596364';
update seguimiento_personal set movilizacion = '{"k": "prog", "l": "08/10/2026", "d": "2026-10-08"}'::jsonb where dni = '25757807';
update seguimiento_personal set movilizacion = '{"k": "prog", "l": "10/10/2026", "d": "2026-10-10"}'::jsonb where dni = '41225998';
