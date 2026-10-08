// POST /api/crear-usuario — alta de cuentas de RR.HH.
//
// Se usa una sola vez para crear la primera cuenta, protegida por la
// clave maestra CLAVE_INSTALACION. Después, cualquier cuenta con
// sesión activa puede crear otras.
//
// Ejemplo desde la consola del navegador:
//   fetch('/api/crear-usuario', {
//     method:'POST', headers:{'Content-Type':'application/json'},
//     body: JSON.stringify({
//       instalacion:'TU-CLAVE-INSTALACION',
//       usuario:'rrhh', nombre:'Recursos Humanos', clave:'...' })
//   }).then(r=>r.json()).then(console.log)

import { sql } from '../lib/db.mjs';
import { cifrarClave, leerSesion } from '../lib/sesion.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const maestra = process.env.CLAVE_INSTALACION;
  const autorizado =
    leerSesion(req) ||
    (maestra && req.body?.instalacion === maestra);

  if (!autorizado) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const usuario = String(req.body?.usuario || '').trim().toLowerCase();
  const nombre  = String(req.body?.nombre  || '').trim();
  const clave   = String(req.body?.clave   || '');

  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
    return res.status(400).json({ error: 'El usuario admite entre 3 y 30 letras, números, punto, guion o guion bajo.' });
  }
  if (!nombre) {
    return res.status(400).json({ error: 'Falta el nombre.' });
  }
  if (clave.length < 10) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 10 caracteres.' });
  }

  try {
    const hash = await cifrarClave(clave);
    await sql`
      insert into usuarios (usuario, nombre, clave_hash)
      values (${usuario}, ${nombre}, ${hash})
      on conflict (usuario) do update
        set clave_hash = excluded.clave_hash,
            nombre     = excluded.nombre,
            activo     = true
    `;
    return res.status(201).json({ ok: true, usuario });

  } catch (e) {
    console.error('crear-usuario:', e);
    return res.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
}
