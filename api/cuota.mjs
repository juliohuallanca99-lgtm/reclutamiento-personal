// GET /api/cuota — cuánto queda del plan este mes. Solo con sesión.

import { sql } from '../lib/db.mjs';
import { protegido } from '../lib/sesion.mjs';

const CUOTA_MENSUAL = Number(process.env.DNI_CUOTA_MENSUAL || 100);

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const [r] = await sql`
      select
        count(*) filter (where origen = 'proveedor'
                           and consultado_en >= date_trunc('month', now())) as usadas,
        count(*) filter (where origen = 'cache'
                           and consultado_en >= date_trunc('month', now())) as ahorradas,
        count(*) filter (where origen = 'proveedor'
                           and consultado_en >= current_date)               as hoy
      from consultas_dni
    `;

    const usadas = Number(r.usadas);
    return res.status(200).json({
      plan: CUOTA_MENSUAL,
      usadas,
      disponibles: Math.max(0, CUOTA_MENSUAL - usadas),
      porcentaje: Math.round(usadas / CUOTA_MENSUAL * 100),
      ahorradas_por_cache: Number(r.ahorradas),
      hoy: Number(r.hoy)
    });

  } catch (e) {
    console.error('cuota:', e);
    return res.status(500).json({ error: 'No se pudo leer el consumo.' });
  }
}

export default protegido(handler);
