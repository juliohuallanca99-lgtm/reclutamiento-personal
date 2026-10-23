// Login de RR.HH. sin dependencias externas: contraseña cifrada con
// scrypt y sesión en una cookie firmada. Todo con node:crypto.

import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import { sql } from './db.mjs';

const scryptAsync = promisify(scrypt);
const SECRETO = process.env.SESION_SECRET || '';
const DURACION_HORAS = 12;

/* ---------------- contraseñas ---------------- */

export async function cifrarClave(clave) {
  const sal = randomBytes(16).toString('hex');
  const derivada = await scryptAsync(clave, sal, 64);
  return sal + ':' + derivada.toString('hex');
}

export async function verificarClave(clave, guardada) {
  try {
    const [sal, hex] = String(guardada).split(':');
    if (!sal || !hex) return false;
    const derivada = await scryptAsync(clave, sal, 64);
    const esperado = Buffer.from(hex, 'hex');
    if (esperado.length !== derivada.length) return false;
    return timingSafeEqual(esperado, derivada);
  } catch {
    return false;
  }
}

/* ---------------- sesión en cookie ---------------- */

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const firma = s => createHmac('sha256', SECRETO).update(s).digest('base64url');

export function crearSesion(usuario, nombre) {
  const carga = b64({ u: usuario, n: nombre, exp: Date.now() + DURACION_HORAS * 3600_000 });
  return carga + '.' + firma(carga);
}

export function leerSesion(req) {
  if (!SECRETO) return null;
  const cookies = String(req.headers.cookie || '');
  const par = cookies.split(';').map(c => c.trim()).find(c => c.startsWith('sesion='));
  if (!par) return null;

  const token = decodeURIComponent(par.slice(7));
  const [carga, dada] = token.split('.');
  if (!carga || !dada) return null;

  const esperada = firma(carga);
  if (dada.length !== esperada.length) return null;
  if (!timingSafeEqual(Buffer.from(dada), Buffer.from(esperada))) return null;

  try {
    const datos = JSON.parse(Buffer.from(carga, 'base64url').toString());
    if (!datos.exp || datos.exp < Date.now()) return null;
    return datos;
  } catch {
    return null;
  }
}

export function ponerCookie(res, token) {
  res.setHeader('Set-Cookie',
    `sesion=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DURACION_HORAS * 3600}`);
}

export function borrarCookie(res) {
  res.setHeader('Set-Cookie', 'sesion=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
}

/* Envuelve una función para que solo responda con sesión válida. */
export function protegido(handler) {
  return async (req, res) => {
    const sesion = leerSesion(req);
    if (!sesion) return res.status(401).json({ error: 'Sesión expirada. Vuelve a ingresar.' });
    req.sesion = sesion;
    return handler(req, res);
  };
}

/* ---------------- links de registro para el personal ----------------
   Quien abre un link válido puede usar SOLO el formulario de registro
   (registrar, traer datos del DNI y ver la lista de cargos). El código
   llega en la cabecera «X-Invitacion». RR.HH. puede anularlo cuando
   quiera; también vence solo. */

export const codigoValido = c => /^[A-Za-z0-9_-]{16,40}$/.test(String(c || ''));

export async function leerInvitacion(codigo) {
  if (!codigoValido(codigo)) return null;
  const [i] = await sql`
    select id, creado_por, creado_nombre, expira_en
      from invitaciones
     where codigo = ${codigo} and activo = true and expira_en > now()
     limit 1
  `;
  return i || null;
}

/* Como protegido(), pero también acepta un link de registro vigente. */
export function protegidoOInvitado(handler) {
  return async (req, res) => {
    const sesion = leerSesion(req);
    if (sesion) { req.sesion = sesion; return handler(req, res); }
    let inv = null;
    try { inv = await leerInvitacion(req.headers['x-invitacion']); } catch (e) { console.error('invitación:', e); }
    if (!inv) return res.status(401).json({ error: 'El link de registro venció o fue anulado. Pide uno nuevo a Recursos Humanos.' });
    req.sesion = { u: inv.creado_por, n: inv.creado_nombre || inv.creado_por, invitacion: inv.id };
    return handler(req, res);
  };
}
