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

  /* ---------------- crear ficha ---------------- */
  if (req.method === 'POST') {
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
export { celdas, N_ETAPAS, N_CAPACITACIONES, ETIQUETAS, ESTADOS_CELDA };
