// POST /api/ingresar — inicio de sesión de RR.HH.
// GET  /api/ingresar — ¿hay sesión activa?

import { sql } from '../lib/db.mjs';
import { verificarClave, crearSesion, ponerCookie, leerSesion } from '../lib/sesion.mjs';

// Freno contra adivinar contraseñas: 6 intentos por IP cada 15 minutos.
const intentos = new Map();
const VENTANA = 15 * 60 * 1000;

function demasiados(ip) {
  const ahora = Date.now();
  const previos = (intentos.get(ip) || []).filter(t => ahora - t < VENTANA);
  previos.push(ahora);
  intentos.set(ip, previos);
  if (intentos.size > 2000) intentos.clear();
  return previos.length > 6;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const s = leerSesion(req);
    return s ? res.status(200).json({ usuario: s.u, nombre: s.n })
             : res.status(401).json({ error: 'Sin sesión' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!process.env.SESION_SECRET) {
    return res.status(500).json({ error: 'Falta configurar SESION_SECRET.' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';
  if (demasiados(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  }

  const usuario = String(req.body?.usuario || '').trim().toLowerCase();
  const clave   = String(req.body?.clave || '');
  if (!usuario || !clave) {
    return res.status(400).json({ error: 'Escribe tu usuario y contraseña.' });
  }

  try {
    const [u] = await sql`
      select usuario, nombre, clave_hash
        from usuarios
       where usuario = ${usuario} and activo = true
       limit 1
    `;

    // Mismo mensaje en ambos casos: no revelamos si el usuario existe.
    if (!u || !(await verificarClave(clave, u.clave_hash))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    await sql`update usuarios set ultimo_acceso = now() where usuario = ${usuario}`;

    ponerCookie(res, crearSesion(u.usuario, u.nombre));
    return res.status(200).json({ usuario: u.usuario, nombre: u.nombre });

  } catch (e) {
    console.error('ingresar:', e);
    return res.status(500).json({ error: 'No se pudo verificar el acceso.' });
  }
}
