// POST /api/postular — guarda la postulación en Neon.

import { sql } from '../lib/db.mjs';

const texto = (v, max = 200) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const numero = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const d = req.body || {};

  // --- validación del lado del servidor -----------------------------
  const faltan = [];
  if (!texto(d.nombres))          faltan.push('nombres');
  if (!texto(d.apellido_paterno)) faltan.push('apellido paterno');
  if (!texto(d.apellido_materno)) faltan.push('apellido materno');
  if (!texto(d.numero_documento)) faltan.push('documento');
  if (!texto(d.puesto))           faltan.push('puesto');
  if (!texto(d.cv_url, 600))      faltan.push('CV');

  if (faltan.length) {
    return res.status(400).json({ error: 'Faltan datos: ' + faltan.join(', ') + '.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(d.correo || ''))) {
    return res.status(400).json({ error: 'El correo no es válido.' });
  }
  if (!/^9\d{8}$/.test(String(d.celular || ''))) {
    return res.status(400).json({ error: 'El celular debe tener 9 dígitos y empezar con 9.' });
  }
  if (d.tipo_documento === 'DNI' && !/^\d{8}$/.test(String(d.numero_documento))) {
    return res.status(400).json({ error: 'El DNI debe tener 8 dígitos.' });
  }
  // El CV tiene que venir del almacén propio, no de un enlace cualquiera.
  if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(String(d.cv_url))) {
    return res.status(400).json({ error: 'El archivo del CV no es válido.' });
  }

  try {
    // Evita el doble envío por doble clic o recarga.
    const repetida = await sql`
      select codigo from postulantes
       where numero_documento = ${texto(d.numero_documento, 15)}
         and puesto = ${texto(d.puesto)}
         and creado_en > now() - interval '10 minutes'
       limit 1
    `;
    if (repetida.length) {
      return res.status(200).json({ codigo: repetida[0].codigo, repetida: true });
    }

    const [fila] = await sql`
      insert into postulantes (
        nombres, apellido_paterno, apellido_materno,
        tipo_documento, numero_documento, datos_verificados,
        nacionalidad, fecha_nacimiento, estado_civil, genero,
        celular, correo, direccion, departamento, provincia, distrito,
        ubigeo_inei, ubigeo_reniec,
        discapacidad,
        nivel_educativo, centro_estudios, especialidad, estado_estudios,
        numero_colegiatura,
        puesto, experiencia_anios, fuente_reclutamiento,
        expectativa_salarial, disponibilidad_inmediata,
        cv_url, cv_nombre
      ) values (
        ${texto(d.nombres)}, ${texto(d.apellido_paterno)}, ${texto(d.apellido_materno)},
        ${texto(d.tipo_documento, 10) || 'DNI'}, ${texto(d.numero_documento, 15)},
        ${d.datos_verificados === true},
        ${texto(d.nacionalidad) || 'Peruana'}, ${d.fecha_nacimiento || null},
        ${texto(d.estado_civil, 30)}, ${texto(d.genero, 20)},
        ${texto(d.celular, 12)}, ${String(d.correo).trim().toLowerCase().slice(0, 150)},
        ${texto(d.direccion, 300)}, ${texto(d.departamento, 60)},
        ${texto(d.provincia, 60)}, ${texto(d.distrito, 60)},
        ${/^\d{6}$/.test(String(d.ubigeo_inei ?? '')) ? d.ubigeo_inei : null},
        ${/^\d{6}$/.test(String(d.ubigeo_reniec ?? '')) ? d.ubigeo_reniec : null},
        ${d.discapacidad === true},
        ${texto(d.nivel_educativo, 40)}, ${texto(d.centro_estudios, 150)},
        ${texto(d.especialidad, 150)}, ${texto(d.estado_estudios, 40)},
        ${texto(d.numero_colegiatura, 30)},
        ${texto(d.puesto, 120)}, ${numero(d.experiencia_anios)},
        ${texto(d.fuente_reclutamiento, 40)}, ${numero(d.expectativa_salarial)},
        ${d.disponibilidad_inmediata !== false},
        ${texto(d.cv_url, 600)}, ${texto(d.cv_nombre, 200)}
      )
      returning codigo
    `;

    return res.status(201).json({ codigo: fila.codigo });

  } catch (e) {
    console.error('postular:', e);
    return res.status(500).json({ error: 'No se pudo registrar la postulación.' });
  }
}
