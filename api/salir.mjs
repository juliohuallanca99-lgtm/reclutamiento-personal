// POST /api/salir — cierra la sesión de RR.HH.

import { borrarCookie } from '../lib/sesion.mjs';

export default async function handler(req, res) {
  borrarCookie(res);
  return res.status(200).json({ ok: true });
}
