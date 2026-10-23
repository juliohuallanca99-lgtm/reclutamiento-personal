// GET /api/puestos — lista de puestos abiertos para el formulario.

import { sql } from '../lib/db.mjs';
import { protegidoOInvitado } from '../lib/sesion.mjs';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const filas = await sql`
      select nombre, area
        from puestos
       where activo = true
       order by area nulls last, nombre
    `;
    // Privada: que ningún caché compartido la guarde y la sirva a otros.
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json(filas);
  } catch (e) {
    console.error('puestos:', e);
    return res.status(500).json({ error: 'No se pudieron cargar los puestos.' });
  }
}

export default protegidoOInvitado(handler);
