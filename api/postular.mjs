// POST /api/postular — guarda la postulación en Neon.

import { sql } from '../lib/db.mjs';
import { protegido } from '../lib/sesion.mjs';

const texto = (v, max = 200) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const numero = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
const TIPOS_MO = ['MOC', 'MOSC', 'MONC'];
const N_ETAPAS = 7, N_CAPACITACIONES = 11;
const pendientes = n => JSON.stringify(Array.from({ length: n }, () => ({ k: 'pend', l: 'Pendiente' })));

// Desde que el formulario es privado, solo Recursos Humanos registra.
async function handler(req, res) {
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
  // Lo que el formato Anexo 8 no puede llevar vacío
  if (!d.fecha_nacimiento)        faltan.push('fecha de nacimiento');
  if (!texto(d.estado_civil))     faltan.push('estado civil');
  if (!texto(d.genero))           faltan.push('sexo');
  if (!texto(d.nac_distrito))     faltan.push('lugar de nacimiento');
  if (!texto(d.direccion))        faltan.push('dirección');
  if (!texto(d.distrito))         faltan.push('residencia');
  if (!texto(d.nivel_educativo))  faltan.push('grado de instrucción');
  if (!TIPOS_MO.includes(d.tipo_mano_obra)) faltan.push('tipo de mano de obra');

  if (faltan.length) {
    return res.status(400).json({ error: 'Faltan datos: ' + faltan.join(', ') + '.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(d.correo || ''))) {
    return res.status(400).json({ error: 'El correo no es válido.' });
  }
  if (!/^9\d{8}$/.test(String(d.celular || ''))) {
    return res.status(400).json({ error: 'El celular debe tener 9 dígitos y empezar con 9.' });
  }
  if (d.nac_ubigeo && !/^\d{6}$/.test(String(d.nac_ubigeo))) {
    return res.status(400).json({ error: 'El N.º de ubigeo de nacimiento debe tener 6 dígitos.' });
  }
  if (d.fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha_nacimiento))) {
    return res.status(400).json({ error: 'La fecha de nacimiento no es válida.' });
  }
  if (d.tipo_documento === 'DNI' && !/^\d{8}$/.test(String(d.numero_documento))) {
    return res.status(400).json({ error: 'El DNI debe tener 8 dígitos.' });
  }
  // La ruta la define el almacén al subir: año/documento con sufijo.
  // Así nadie puede registrar una ruta arbitraria.
  if (d.cv_pathname && !/^\d{4}\/[\w-]+\.pdf$/i.test(String(d.cv_pathname))) {
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
        cv_pathname, cv_nombre,
        brevete, nac_departamento, nac_provincia, nac_distrito, nac_ubigeo,
        tipo_mano_obra
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
        ${texto(d.cv_pathname, 600)}, ${texto(d.cv_nombre, 200)},
        ${texto(d.brevete, 40)}, ${texto(d.nac_departamento, 60)},
        ${texto(d.nac_provincia, 60)}, ${texto(d.nac_distrito, 60)},
        ${/^\d{6}$/.test(String(d.nac_ubigeo ?? '')) ? d.nac_ubigeo : null},
        ${d.tipo_mano_obra}
      )
      returning codigo
    `;

    // Pasa a Seguimiento con sus etapas en «Pendiente» y sin servicio. Si
    // ya tenía ficha (mismo documento), no se toca: ahí puede haber avance.
    // Un fallo aquí no anula el registro, que ya quedó guardado.
    let seguimiento = 'error';
    try {
      const doc = String(d.numero_documento).trim();
      const dni = /^\d{6,12}$/.test(doc) ? doc : null;
      const nombre = [d.apellido_paterno, d.apellido_materno, d.nombres]
        .map(x => String(x || '').trim()).join(' ').toUpperCase().slice(0, 150);
      const alta = await sql`
        insert into seguimiento_personal
          (item, dni, nombre, funcion, telefono, servicio, estado_proceso,
           etapas, capacitaciones, actualizado_por, actualizado_en)
        values (
          (select coalesce(max(item), 0) + 1 from seguimiento_personal),
          ${dni}, ${nombre}, ${String(d.puesto).trim().toUpperCase().slice(0, 150)},
          ${texto(d.celular, 12)}, null, 'EXAMEN MEDICO',
          ${pendientes(N_ETAPAS)}::jsonb, ${pendientes(N_CAPACITACIONES)}::jsonb,
          ${req.sesion.n}, now())
        on conflict (dni) where dni is not null and dni <> '' do nothing
        returning id
      `;
      seguimiento = alta.length ? 'creado' : 'existente';
    } catch (e) {
      console.error('postular → seguimiento:', e);
    }

    return res.status(201).json({ codigo: fila.codigo, seguimiento });

  } catch (e) {
    console.error('postular:', e);
    return res.status(500).json({ error: 'No se pudo registrar la postulación.' });
  }
}

export default protegido(handler);
