// GET   /api/postulantes — listado con filtros (solo con sesión)
// PATCH /api/postulantes — cambia estado y observaciones

import { sql } from '../lib/db.mjs';
import { protegido } from '../lib/sesion.mjs';

export const ESTADOS = ['Nuevo', 'En revisión', 'Entrevista', 'Seleccionado', 'Descartado'];

async function handler(req, res) {

  /* ---------------- listado ---------------- */
  if (req.method === 'GET') {
    const { puesto = '', estado = '', desde = '', hasta = '', buscar = '' } = req.query;
    const texto = String(buscar).trim();

    try {
      const filas = await sql`
        select id, codigo, nombres, apellido_paterno, apellido_materno,
               tipo_documento, numero_documento, datos_verificados,
               celular, correo, departamento, provincia, distrito,
               nivel_educativo, especialidad, estado_estudios,
               puesto, experiencia_anios, fuente_reclutamiento,
               expectativa_salarial, disponibilidad_inmediata,
               cv_url, cv_nombre, estado, observaciones,
               revisado_por, revisado_en, creado_en
          from postulantes
         where (${String(puesto)} = '' or puesto = ${String(puesto)})
           and (${String(estado)} = '' or estado = ${String(estado)})
           and (${String(desde)}  = '' or creado_en >= ${desde || null}::date)
           and (${String(hasta)}  = '' or creado_en <  ${hasta || null}::date + 1)
           and (${texto} = '' or
                numero_documento ilike ${'%' + texto + '%'} or
                codigo ilike ${'%' + texto + '%'} or
                (nombres || ' ' || apellido_paterno || ' ' || apellido_materno)
                  ilike ${'%' + texto + '%'})
         order by creado_en desc
         limit 1000
      `;
      return res.status(200).json(filas);

    } catch (e) {
      console.error('postulantes GET:', e);
      return res.status(500).json({ error: 'No se pudo cargar el listado.' });
    }
  }

  /* ---------------- cambio de estado ---------------- */
  if (req.method === 'PATCH') {
    const id = Number(req.body?.id);
    const estado = String(req.body?.estado || '');
    const observaciones = req.body?.observaciones ?? null;

    if (!id || !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: 'Datos incorrectos.' });
    }

    try {
      const [fila] = await sql`
        update postulantes
           set estado = ${estado},
               observaciones = ${observaciones ? String(observaciones).slice(0, 1000) : null},
               revisado_por = ${req.sesion.n},
               revisado_en = now()
         where id = ${id}
        returning id, estado, revisado_por, revisado_en
      `;
      if (!fila) return res.status(404).json({ error: 'No se encontró la postulación.' });
      return res.status(200).json(fila);

    } catch (e) {
      console.error('postulantes PATCH:', e);
      return res.status(500).json({ error: 'No se pudo guardar el cambio.' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

export default protegido(handler);
