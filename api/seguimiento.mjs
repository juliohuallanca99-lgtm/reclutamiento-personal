// Seguimiento de ingreso de personal — Marcobre Bateas.
// Módulo aparte del reclutamiento: otras tablas, otro propósito.
//
//  GET    /api/seguimiento        listado completo
//  PUT    /api/seguimiento        guarda una ficha
//  POST   /api/seguimiento        crea una ficha vacía
//  DELETE /api/seguimiento?id=    elimina una ficha
//
// Todo exige sesión de RR.HH.

import { sql } from '../lib/db.mjs';
import { protegido } from '../lib/sesion.mjs';

const ESTADOS_CELDA = ['ok', 'pend', 'obs', 'prog', 'na'];
const ETIQUETAS = {
  ok: 'Aprobado', pend: 'Pendiente', obs: 'Observado',
  prog: 'Programado', na: 'Sin dato'
};
const N_ETAPAS = 7;
const N_CAPACITACIONES = 11;

const texto = (v, max = 200) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

// Normaliza una lista de celdas a su largo fijo, descartando lo que
// venga mal formado. Evita que un guardado raro corrompa la ficha.
function celdas(entrada, largo) {
  const lista = Array.isArray(entrada) ? entrada : [];
  return Array.from({ length: largo }, (_, i) => {
    const c = lista[i] || {};
    const k = ESTADOS_CELDA.includes(c.k) ? c.k : 'na';
    const salida = { k, l: texto(c.l, 40) || ETIQUETAS[k] };
    if (c.c) salida.c = texto(c.c, 500);
    if (k === 'prog' && c.d) salida.d = texto(c.d, 20);
    return salida;
  });
}

// Forma que espera la página: nombres cortos, como venía del archivo.
const aPagina = f => ({
  id: f.id,
  i: f.item,
  dni: f.dni || '',
  n: f.nombre,
  f: f.funcion || '',
  tel: f.telefono || '',
  t: f.tipo || '',
  e: f.estado_proceso,
  st: f.etapas,
  tr: f.capacitaciones,
  mov: f.movilizacion || { k: 'na', l: 'Sin dato' },
  obs: f.observaciones || '',
  por: f.actualizado_por,
  en: f.actualizado_en
});

// ---------------------------------------------------------------
//  Carga desde Excel
//
//  Vive aquí y no en su propio archivo porque el plan Hobby de Vercel
//  admite como máximo 12 funciones por despliegue.
// ---------------------------------------------------------------

// Nombres de etapas y capacitaciones, en el orden fijo de la página.
const ETAPAS = [
  ['EMO'],
  ['VALIDACION JJC', 'VALIDACION / JJC'],
  ['VALIDACION UME', 'VALIDACION / UME'],
  ['ANEXO 8'],
  ['ANEXO A'],
  ['AUT REC', 'AUT- REC', 'AUTORIZACION RECONOCIMIENTO'],
  ['FOTOCHECK']
];

// El primer nombre de cada lista es el que trae el cuadro real; los
// demás son variantes aceptadas por si alguien reescribe el encabezado.
const CAPACITACIONES = [
  ['INDUCCION ANEXO 4', 'INDUCCION - ANEXO 4'],
  ['PREVENCION DE LESIONES EN MANOS', 'PREVENCION LESIONES EN MANOS'],
  ['IPERC'],
  ['ACIDO SULFURICO'],
  ['SUSTANCIAS Y PRODUCTOS QUIMICOS', 'SUSTANCIAS QUIMICAS'],
  ['RIESGOS ELECTRICOS'],
  ['SISTEMA DE IZAJE'],
  ['SEG CON HERRAMIENTAS', 'SEGURIDAD CON HERRAMIENTAS'],
  ['TRABAJOS EN ALTURA'],
  ['TRABAJOS EN CALIENTE'],
  ['BLOQUEO DE ENERGIA', 'BLOQUEO Y SEÑALIZACION', 'BLOQUEO Y SENALIZACION']
];

const COL_DNI      = ['DNI', 'DOCUMENTO', 'NRO DOCUMENTO', 'NUMERO DE DOCUMENTO'];
const COL_NOMBRE   = ['NOMBRES Y APELLIDOS', 'NOMBRE', 'APELLIDOS Y NOMBRES', 'TRABAJADOR'];
const COL_FUNCION  = ['FUNCION', 'CARGO', 'PUESTO'];
const COL_ITEM     = ['ITEM', 'N', 'NRO', '#'];
const COL_ESTADO   = ['ESTADO DEL PROCESO', 'ESTADO', 'ESTADO PROCESO'];
const COL_MOV      = ['MOVILIZACION', 'MOVILIZACION FECHA PROBABLE'];
const COL_OBS      = ['OBSERVACIONES', 'OBSERVACION', 'COMENTARIOS'];
const COL_TEL      = ['N TELEFONO', 'TELEFONO', 'CELULAR', 'N CELULAR'];

// Quita acentos, signos y espacios de más para comparar encabezados.
const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9Ñ]+/g, ' ').trim();

// Vocabulario del cuadro real, más variantes razonables.
// Los casos que importan: APTO (EMO), IMPRESO (fotocheck),
// POR TRAMITAR, los códigos M##### del Anexo 8 y las fechas sueltas.
const MESES = 'ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC|JAN|APR|AUG|DEC';

function estadoCelda(valor) {
  const crudo = String(valor ?? '').trim();
  const v = norm(crudo);
  if (!v) return { k: 'na', l: 'Sin dato' };

  if (/^(OK|APROBADO|APROBADA|APTO|APTA|IMPRESO|IMPRESA|ENTREGADO|SI|X|CONFORME|COMPLETO|CUMPLE|REALIZADO|FIRMADO)$/.test(v))
    return { k: 'ok', l: 'Aprobado' };

  if (/^(OBS|OBSERVADO|OBSERVADA|NO APTO|NO CUMPLE|RECHAZADO)$/.test(v))
    return { k: 'obs', l: 'Observado' };

  if (/^(PEND|PENDIENTE|POR TRAMITAR|POR TRAMITARSE|EN TRAMITE|NO|FALTA|SIN INICIAR)$/.test(v))
    return { k: 'pend', l: 'Pendiente' };

  if (/^(PROG|PROGRAMADO|PROGRAMADA|EN PROCESO)$/.test(v))
    return { k: 'prog', l: 'Programado' };

  // Un código tipo M10072 en Anexo 8 significa que el documento ya se
  // emitió: cuenta como aprobado y el número queda como referencia.
  if (/^[A-Z]{1,3}\d{3,8}$/.test(v))
    return { k: 'ok', l: 'Aprobado', c: crudo };

  // Una fecha suelta («6-Oct») indica el día en que quedó programado.
  if (new RegExp('^\\d{1,2}[ -/](' + MESES + ')', 'i').test(v) ||
      /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(crudo))
    return { k: 'prog', l: crudo.slice(0, 40) };

  // Cualquier otro texto se conserva como observación: mejor eso que
  // perderlo silenciosamente.
  return { k: 'obs', l: 'Observado', c: crudo.slice(0, 500) };
}

const buscar = (mapa, nombres) => {
  for (const n of nombres) {
    const i = mapa.get(norm(n));
    if (i !== undefined) return i;
  }
  return -1;
};

async function importar(req, res) {
  const filas = Array.isArray(req.body?.filas) ? req.body.filas : null;
  if (!filas || filas.length < 2) {
    return res.status(400).json({ error: 'El archivo no tiene filas de datos.' });
  }
  if (filas.length > 2000) {
    return res.status(400).json({ error: 'El archivo tiene demasiadas filas (máximo 2000).' });
  }

  // El cuadro trae una banda de grupos encima («ESTAPAS DEL PROCESO»,
  // «CAPACITACIONES TECSUP»). Los encabezados buenos son la primera
  // fila que contiene DNI y nombres, no necesariamente la primera.
  let fEnc = 0;
  for (let n = 0; n < Math.min(filas.length, 8); n++) {
    const celdas = (filas[n] || []).map(norm);
    if (celdas.some(c => COL_DNI.includes(c)) &&
        celdas.some(c => COL_NOMBRE.map(norm).includes(c))) { fEnc = n; break; }
  }

  // Mapa encabezado normalizado -> posición de columna
  const mapa = new Map();
  (filas[fEnc] || []).forEach((h, i) => {
    const k = norm(h);
    if (k && !mapa.has(k)) mapa.set(k, i);
  });

  const iDni    = buscar(mapa, COL_DNI);
  const iNombre = buscar(mapa, COL_NOMBRE);

  if (iNombre === -1) {
    return res.status(400).json({
      error: 'No encontré la columna de nombres. Debe llamarse «NOMBRES Y APELLIDOS».'
    });
  }
  if (iDni === -1) {
    return res.status(400).json({
      error: 'No encontré la columna «DNI». Es necesaria para saber a quién actualizar.'
    });
  }

  const iFuncion = buscar(mapa, COL_FUNCION);
  const iItem    = buscar(mapa, COL_ITEM);
  const iEstado  = buscar(mapa, COL_ESTADO);
  const iMov     = buscar(mapa, COL_MOV);
  const iObs     = buscar(mapa, COL_OBS);
  const iTel     = buscar(mapa, COL_TEL);
  const iEtapas  = ETAPAS.map(n => buscar(mapa, n));
  const iCapac   = CAPACITACIONES.map(n => buscar(mapa, n));

  const faltantes = [
    ...ETAPAS.filter((_, j) => iEtapas[j] === -1).map(n => n[0]),
    ...CAPACITACIONES.filter((_, j) => iCapac[j] === -1).map(n => n[0])
  ];

  const dato = (fila, i) => (i === -1 ? '' : fila[i]);
  let nuevos = 0, actualizados = 0, omitidas = 0;
  const avisos = [];

  try {
    for (let n = fEnc + 1; n < filas.length; n++) {
      const fila = filas[n];
      if (!Array.isArray(fila)) { omitidas++; continue; }

      const nombre = String(dato(fila, iNombre) ?? '').trim();
      const dni = String(dato(fila, iDni) ?? '').replace(/\D/g, '');

      if (!nombre) { omitidas++; continue; }
      if (!/^\d{6,12}$/.test(dni)) {
        omitidas++;
        avisos.push(`Fila ${n + 1}: «${nombre.slice(0, 40)}» sin DNI válido.`);
        continue;
      }

      const etapas = celdas(iEtapas.map(i => estadoCelda(dato(fila, i))), N_ETAPAS);
      const capac  = celdas(iCapac.map(i => estadoCelda(dato(fila, i))), N_CAPACITACIONES);

      const crudoMov = String(dato(fila, iMov) ?? '').trim();
      const mov = crudoMov
        ? JSON.stringify({ k: 'prog', l: crudoMov.slice(0, 60) })
        : null;

      const item = Number(dato(fila, iItem)) || n;
      const estado = String(dato(fila, iEstado) ?? '').trim().toUpperCase() || 'EXAMEN MEDICO';
      const obs = String(dato(fila, iObs) ?? '').trim() || null;

      const [r] = await sql`
        insert into seguimiento_personal
          (item, dni, nombre, funcion, telefono, estado_proceso, etapas,
           capacitaciones, movilizacion, observaciones, actualizado_por, actualizado_en)
        values
          (${item}, ${dni}, ${nombre.slice(0, 150)},
           ${String(dato(fila, iFuncion) ?? '').trim().slice(0, 150) || null},
           ${String(dato(fila, iTel) ?? '').replace(/\D/g, '').slice(0, 15) || null},
           ${estado.slice(0, 60)},
           ${JSON.stringify(etapas)}::jsonb, ${JSON.stringify(capac)}::jsonb,
           ${mov}::jsonb, ${obs ? obs.slice(0, 2000) : null},
           ${req.sesion.n}, now())
        on conflict (dni) where dni is not null and dni <> ''
        do update set
          item            = excluded.item,
          nombre          = excluded.nombre,
          funcion         = coalesce(excluded.funcion, seguimiento_personal.funcion),
          telefono        = coalesce(excluded.telefono, seguimiento_personal.telefono),
          estado_proceso  = excluded.estado_proceso,
          etapas          = excluded.etapas,
          capacitaciones  = excluded.capacitaciones,
          movilizacion    = excluded.movilizacion,
          observaciones   = coalesce(excluded.observaciones, seguimiento_personal.observaciones),
          actualizado_por = excluded.actualizado_por,
          actualizado_en  = now()
        -- xmax = 0 solo en una inserción; en una actualización trae la
        -- transacción que la hizo. Es la forma fiable de distinguirlas.
        returning (xmax = 0) as es_nuevo
      `;
      if (r?.es_nuevo) nuevos++; else actualizados++;
    }

    await sql`
      insert into seguimiento_importaciones
        (archivo, filas_leidas, nuevos, actualizados, importado_por)
      values (${String(req.body?.archivo ?? '').slice(0, 200) || null},
              ${filas.length - fEnc - 1}, ${nuevos}, ${actualizados}, ${req.sesion.n})
    `.catch(e => console.error('registro importación:', e));

    return res.status(200).json({
      nuevos, actualizados, omitidas,
      columnas_no_encontradas: faltantes,
      avisos: avisos.slice(0, 20)
    });

  } catch (e) {
    console.error('seguimiento-importar:', e);
    return res.status(500).json({ error: 'No se pudo completar la carga.' });
  }
}

async function handler(req, res) {

  /* ---------------- listado ---------------- */
  if (req.method === 'GET') {
    try {
      const filas = await sql`
        select id, item, dni, nombre, funcion, telefono, tipo, estado_proceso,
               etapas, capacitaciones, movilizacion, observaciones,
               actualizado_por, actualizado_en
          from seguimiento_personal
         order by item nulls last, id
      `;
      return res.status(200).json(filas.map(aPagina));
    } catch (e) {
      console.error('seguimiento GET:', e);
      return res.status(500).json({ error: 'No se pudo cargar el seguimiento.' });
    }
  }

  /* ---------------- crear ficha o importar ---------------- */
  if (req.method === 'POST') {
    if (req.query.accion === 'importar') return importar(req, res);

    try {
      const [{ siguiente }] = await sql`
        select coalesce(max(item), 0) + 1 as siguiente from seguimiento_personal
      `;
      const [fila] = await sql`
        insert into seguimiento_personal
          (item, nombre, estado_proceso, etapas, capacitaciones,
           actualizado_por, actualizado_en)
        values
          (${siguiente}, 'NUEVO TRABAJADOR', 'EXAMEN MEDICO',
           ${JSON.stringify(celdas([], N_ETAPAS))}::jsonb,
           ${JSON.stringify(celdas([], N_CAPACITACIONES))}::jsonb,
           ${req.sesion.n}, now())
        returning id, item, dni, nombre, funcion, telefono, tipo, estado_proceso,
                  etapas, capacitaciones, movilizacion, observaciones,
                  actualizado_por, actualizado_en
      `;
      return res.status(201).json(aPagina(fila));
    } catch (e) {
      console.error('seguimiento POST:', e);
      return res.status(500).json({ error: 'No se pudo crear la ficha.' });
    }
  }

  /* ---------------- guardar ficha ---------------- */
  if (req.method === 'PUT') {
    const d = req.body || {};
    const id = Number(d.id);
    if (!id) return res.status(400).json({ error: 'Falta la ficha.' });
    if (!texto(d.n)) return res.status(400).json({ error: 'El nombre no puede quedar vacío.' });

    const dni = texto(d.dni, 15);
    if (dni && !/^\d{6,12}$/.test(dni)) {
      return res.status(400).json({ error: 'El DNI debe tener entre 6 y 12 dígitos.' });
    }

    try {
      const [fila] = await sql`
        update seguimiento_personal set
          dni             = ${dni},
          nombre          = ${texto(d.n, 150)},
          funcion         = ${texto(d.f, 150)},
          telefono        = ${String(d.tel ?? '').replace(/\D/g, '').slice(0, 15) || null},
          tipo            = ${texto(d.t, 60)},
          estado_proceso  = ${texto(d.e, 60) || 'EXAMEN MEDICO'},
          etapas          = ${JSON.stringify(celdas(d.st, N_ETAPAS))}::jsonb,
          capacitaciones  = ${JSON.stringify(celdas(d.tr, N_CAPACITACIONES))}::jsonb,
          movilizacion    = ${d.mov && d.mov.k === 'prog'
                               ? JSON.stringify({ k: 'prog', l: texto(d.mov.l, 60) || 'Programado', d: texto(d.mov.d, 20) })
                               : null}::jsonb,
          observaciones   = ${texto(d.obs, 2000)},
          actualizado_por = ${req.sesion.n},
          actualizado_en  = now()
        where id = ${id}
        returning id, item, dni, nombre, funcion, telefono, tipo, estado_proceso,
                  etapas, capacitaciones, movilizacion, observaciones,
                  actualizado_por, actualizado_en
      `;
      if (!fila) return res.status(404).json({ error: 'No se encontró la ficha.' });
      return res.status(200).json(aPagina(fila));

    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: 'Ya existe otra ficha con ese DNI.' });
      }
      console.error('seguimiento PUT:', e);
      return res.status(500).json({ error: 'No se pudo guardar.' });
    }
  }

  /* ---------------- eliminar ficha ---------------- */
  if (req.method === 'DELETE') {
    const id = Number(req.query.id);
    if (!id) return res.status(400).json({ error: 'Falta la ficha.' });
    try {
      const [fila] = await sql`
        delete from seguimiento_personal where id = ${id} returning id
      `;
      if (!fila) return res.status(404).json({ error: 'No se encontró la ficha.' });
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('seguimiento DELETE:', e);
      return res.status(500).json({ error: 'No se pudo eliminar.' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

export default protegido(handler);
