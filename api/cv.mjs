// GET /api/cv?id=123 — entrega el CV de un postulante.
//
// Los CV viven en almacenamiento privado: su dirección real nunca sale
// del servidor. Esta función comprueba la sesión, lee el archivo y lo
// envía al navegador. Sin sesión no hay forma de llegar al PDF.

import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import { sql } from '../lib/db.mjs';
import { leerSesion } from '../lib/sesion.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // Si no hay sesión, al panel. Así el enlace del Excel abre el login
  // en vez de un error, y después de entrar se vuelve a intentar.
  const sesion = leerSesion(req);
  if (!sesion) {
    res.setHeader('Location', '/panel.html');
    return res.status(302).end();
  }

  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Falta el postulante.' });

  try {
    const [fila] = await sql`
      select codigo, cv_pathname, cv_url, cv_nombre,
             apellido_paterno, apellido_materno, nombres
        from postulantes
       where id = ${id}
       limit 1
    `;
    if (!fila) return res.status(404).json({ error: 'No se encontró la postulación.' });

    // Postulaciones anteriores al almacenamiento privado: su CV quedó
    // con enlace público. Se redirige para no perderlas.
    if (!fila.cv_pathname) {
      if (!fila.cv_url) return res.status(404).json({ error: 'Esta postulación no tiene CV.' });
      res.setHeader('Location', fila.cv_url);
      return res.status(302).end();
    }

    const archivo = await get(fila.cv_pathname, { access: 'private' });
    if (!archivo || archivo.statusCode !== 200) {
      console.error('CV no encontrado en el almacén:', fila.cv_pathname);
      return res.status(404).json({ error: 'El archivo ya no está disponible.' });
    }

    // Nombre legible al descargar: POST-00001 HUALLANCA HUAMANI, JULIO.pdf
    const nombre = `${fila.codigo} ${fila.apellido_paterno} ${fila.apellido_materno}, ${fila.nombres}.pdf`
      .replace(/[^\w\sÁÉÍÓÚÑáéíóúñ.,-]/g, '');

    res.setHeader('Content-Type', archivo.blob.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    if (archivo.blob.size) res.setHeader('Content-Length', String(archivo.blob.size));

    Readable.fromWeb(archivo.stream).pipe(res);

  } catch (e) {
    console.error('cv:', e);
    return res.status(500).json({ error: 'No se pudo abrir el CV.' });
  }
}
