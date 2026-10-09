// POST /api/seguimiento-importar
//
// Recibe las filas de un Excel ya leído en el navegador y las carga.
// El navegador manda { archivo, filas: [[...], ...] } donde la primera
// fila son los encabezados.
//
// Las columnas se reconocen por su nombre, no por su posición: así la
// carga no se rompe si el Excel trae una columna de más, en otro orden
// o escrita distinto.

import { sql } from '../lib/db.mjs';
import { protegido } from '../lib/sesion.mjs';
import { celdas, N_ETAPAS, N_CAPACITACIONES } from './seguimiento.mjs';

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

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

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

export default protegido(handler);
