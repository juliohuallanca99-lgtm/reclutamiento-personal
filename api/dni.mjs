// =====================================================================
//  GET /api/dni?numero=########
//
//  Consulta de identidad contra un proveedor autorizado. El token vive
//  en una variable de entorno, nunca en el HTML.
//
//  El plan contratado tiene un tope mensual de consultas, así que el
//  orden importa: primero la caché (gratis), después los límites por
//  IP, después la cuota, y recién entonces el proveedor.
// =====================================================================

import { sql } from '../lib/db.mjs';

const TOKEN = process.env.DNI_API_TOKEN;
const URL_PROVEEDOR = 'https://api.decolecta.com/v1/reniec/dni?numero=';

// Tope del plan. Se detiene un poco antes para dejar margen.
const CUOTA_MENSUAL = Number(process.env.DNI_CUOTA_MENSUAL || 100);
const MARGEN = Math.max(2, Math.ceil(CUOTA_MENSUAL * 0.05));
const TOPE = CUOTA_MENSUAL - MARGEN;

// Límites por IP. Ajustados a una cuota chica: con 12 cada 10 minutos
// una sola persona agotaba el mes en menos de dos horas.
const POR_IP_10MIN = Number(process.env.DNI_LIMITE_10MIN || 3);
const POR_IP_DIA   = Number(process.env.DNI_LIMITE_DIA   || 8);

const DIAS_CACHE = 30;

// Interruptor de emergencia: apaga la consulta sin desplegar código.
const APAGADO = process.env.DNI_CONSULTA_ACTIVA === 'false';

const responder = (res, estado, cuerpo) => res.status(estado).json(cuerpo);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return responder(res, 405, { error: 'Método no permitido' });
  }

  const numero = String(req.query.numero || '').trim();
  if (!/^\d{8}$/.test(numero)) {
    return responder(res, 400, { error: 'El DNI debe tener 8 dígitos.' });
  }

  if (APAGADO) {
    return responder(res, 503, { error: 'La consulta está desactivada. Escribe tus datos a mano.' });
  }
  if (!TOKEN) {
    return responder(res, 500, { error: 'Falta configurar DNI_API_TOKEN.' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';

  try {
    // ---- 1. Caché: no gasta cuota ---------------------------------
    const [guardado] = await sql`
      select nombres, apellido_paterno, apellido_materno
        from cache_identidad
       where numero_documento = ${numero}
         and guardado_en > now() - make_interval(days => ${DIAS_CACHE}::int)
       limit 1
    `;

    if (guardado) {
      await sql`insert into consultas_dni (numero, origen_ip, exito, origen)
                values (${numero}, ${ip}, true, 'cache')`;
      return responder(res, 200, { numero, ...guardado, origen: 'cache' });
    }

    // ---- 2. Límites por IP, contados en la base --------------------
    const [uso] = await sql`
      select
        count(*) filter (where consultado_en > now() - interval '10 minutes') as recientes,
        count(*) filter (where consultado_en > now() - interval '24 hours')   as del_dia
      from consultas_dni
      where origen_ip = ${ip}
    `;

    if (Number(uso.recientes) >= POR_IP_10MIN) {
      res.setHeader('Retry-After', '600');
      return responder(res, 429, { error: 'Demasiadas consultas seguidas. Espera unos minutos.' });
    }
    if (Number(uso.del_dia) >= POR_IP_DIA) {
      res.setHeader('Retry-After', '3600');
      return responder(res, 429, { error: 'Alcanzaste el máximo de consultas por hoy. Escribe tus datos a mano.' });
    }

    // ---- 3. Cuota mensual del plan --------------------------------
    const [cuota] = await sql`
      select count(*) as usadas
        from consultas_dni
       where origen = 'proveedor'
         and consultado_en >= date_trunc('month', now())
    `;

    if (Number(cuota.usadas) >= TOPE) {
      console.warn(`cuota mensual agotada: ${cuota.usadas}/${CUOTA_MENSUAL}`);
      return responder(res, 507, { error: 'La consulta no está disponible este mes. Escribe tus datos a mano.' });
    }

    // ---- 4. Proveedor ---------------------------------------------
    const corte = AbortSignal.timeout(8000);
    const r = await fetch(URL_PROVEEDOR + numero, {
      headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' },
      signal: corte
    });

    // La llamada ya se hizo: cuenta contra la cuota, haya salido o no.
    const registrar = exito =>
      sql`insert into consultas_dni (numero, origen_ip, exito, origen)
          values (${numero}, ${ip}, ${exito}, 'proveedor')`
        .catch(e => console.error('registro consulta:', e));

    if (r.status === 401 || r.status === 403) {
      await registrar(false);
      console.error('el proveedor rechazó el token');
      return responder(res, 502, { error: 'El servicio de consulta no está disponible. Escribe tus datos a mano.' });
    }
    if (r.status === 404) {
      await registrar(false);
      return responder(res, 404, { error: 'No se encontró ese DNI. Escribe tus datos a mano.' });
    }
    if (r.status === 429) {
      await registrar(false);
      return responder(res, 502, { error: 'El servicio está saturado. Inténtalo en un momento.' });
    }
    if (!r.ok) {
      await registrar(false);
      return responder(res, 502, { error: 'El servicio de consulta no respondió. Escribe tus datos a mano.' });
    }

    const d = await r.json();
    const persona = {
      nombres:          d.first_name       || d.nombres          || '',
      apellido_paterno: d.first_last_name  || d.apellido_paterno || '',
      apellido_materno: d.second_last_name || d.apellido_materno || ''
    };

    // Respuesta vacía: gastó cuota pero no sirve de nada.
    if (!persona.nombres && !persona.apellido_paterno) {
      await registrar(false);
      return responder(res, 422, { error: 'El documento no devolvió datos. Escribe tus datos a mano.' });
    }

    await registrar(true);
    await sql`
      insert into cache_identidad (numero_documento, nombres, apellido_paterno, apellido_materno)
      values (${numero}, ${persona.nombres}, ${persona.apellido_paterno}, ${persona.apellido_materno})
      on conflict (numero_documento) do update
        set nombres = excluded.nombres,
            apellido_paterno = excluded.apellido_paterno,
            apellido_materno = excluded.apellido_materno,
            guardado_en = now()
    `.catch(e => console.error('guardar cache:', e));

    return responder(res, 200, { numero, ...persona, origen: 'proveedor' });

  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return responder(res, 504, { error: 'La consulta tardó demasiado. Escribe tus datos a mano.' });
    }
    console.error('dni:', e);
    return responder(res, 502, { error: 'No se pudo consultar. Escribe tus datos a mano.' });
  }
}
