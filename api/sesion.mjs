// Sesión de RR.HH., en una sola función:
//
//   GET    /api/sesion   ¿hay sesión activa?
//   POST   /api/sesion   iniciar sesión
//   DELETE /api/sesion   cerrar sesión
//
//   Links de registro para el personal:
//   GET  /api/sesion?invitacion=CODIGO     ¿el link sigue vigente? (público)
//   GET  /api/sesion?accion=invitaciones&tipo=…   links vigentes (RR.HH.)
//   POST /api/sesion?accion=invitacion     crear link   { dias, nota, tipo }
//
//   tipo: 'registro' (formulario para el personal, por defecto) o
//         'consulta' (ver el Seguimiento sin editar, para gerencia).
//   POST /api/sesion?accion=anular         anular link  { id }
//
// Van juntas porque el plan Hobby de Vercel admite como máximo 12
// funciones por despliegue, y son tres caras del mismo asunto.

import { sql } from '../lib/db.mjs';
import { randomBytes } from 'node:crypto';
import { verificarClave, crearSesion, ponerCookie, borrarCookie, leerSesion, leerInvitacion } from '../lib/sesion.mjs';

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

const DIAS_PERMITIDOS = { registro: [1, 3, 7, 15, 30], consulta: [7, 15, 30, 60, 90] };
const tipoDe = v => (v === 'consulta' ? 'consulta' : 'registro');

async function invitaciones(req, res) {
  const accion = req.query.accion;

  // Público: la página de registro pregunta si su link sigue vigente.
  if (req.method === 'GET' && req.query.invitacion !== undefined) {
    const inv = await leerInvitacion(String(req.query.invitacion));
    return inv
      ? res.status(200).json({ ok: true, expira: inv.expira_en })
      : res.status(404).json({ error: 'Este link de registro venció o fue anulado. Pide uno nuevo a Recursos Humanos.' });
  }

  const s = leerSesion(req);
  if (!s) return res.status(401).json({ error: 'Sesión expirada. Vuelve a ingresar.' });

  if (req.method === 'GET' && accion === 'invitaciones') {
    const filas = await sql`
      select id, codigo, nota, creado_nombre, creado_en, expira_en, usos
        from invitaciones
       where activo = true and expira_en > now() and tipo = ${tipoDe(req.query.tipo)}
       order by creado_en desc
       limit 30
    `;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(filas);
  }

  if (req.method === 'POST' && accion === 'invitacion') {
    const tipo = tipoDe(req.body?.tipo);
    const dias = Number(req.body?.dias);
    if (!DIAS_PERMITIDOS[tipo].includes(dias)) return res.status(400).json({ error: 'Vigencia no válida.' });
    const nota = String(req.body?.nota || '').trim().slice(0, 80) || null;
    const codigo = randomBytes(18).toString('base64url');
    const [f] = await sql`
      insert into invitaciones (codigo, nota, creado_por, creado_nombre, expira_en, tipo)
      values (${codigo}, ${nota}, ${s.u}, ${s.n}, now() + make_interval(days => ${dias}), ${tipo})
      returning id, codigo, nota, creado_nombre, creado_en, expira_en, usos
    `;
    return res.status(201).json(f);
  }

  if (req.method === 'POST' && accion === 'anular') {
    const id = Number(req.body?.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Link no válido.' });
    await sql`update invitaciones set activo = false where id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Acción no válida.' });
}

export default async function handler(req, res) {
  if (req.query?.invitacion !== undefined || ['invitaciones', 'invitacion', 'anular'].includes(req.query?.accion)) {
    try { return await invitaciones(req, res); }
    catch (e) { console.error('invitaciones:', e); return res.status(500).json({ error: 'No se pudo procesar el link de registro.' }); }
  }

  if (req.method === 'GET') {
    const s = leerSesion(req);
    return s ? res.status(200).json({ usuario: s.u, nombre: s.n })
             : res.status(401).json({ error: 'Sin sesión' });
  }

  if (req.method === 'DELETE') {
    borrarCookie(res);
    return res.status(200).json({ ok: true });
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
