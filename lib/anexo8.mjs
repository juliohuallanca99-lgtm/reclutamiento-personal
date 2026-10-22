// Llena el formato Anexo 8 (Lista de seleccionados, Marcobre) con los
// postulantes elegidos. Devuelve el .xlsx listo para descargar.

import ExcelJS from 'exceljs';
import { PLANTILLA_ANEXO8 } from './plantilla-anexo8.mjs';

const EMPRESA = 'JJC CONTRATISTAS GENERALES S.A.';
const FILA_MODELO = 9;          // primera fila de datos del formato
const COLUMNAS = 27;            // A … AA

/* El formato va en mayúsculas y sin tildes, como el catastro de ubigeo.
   La Ñ se conserva: es parte del nombre. */
const mayus = v => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return s.toUpperCase().replace(/Ñ/g, '\u0000')
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/\u0000/g, 'Ñ');
};

/* Fecha 'AAAA-MM-DD' (o un Date, según cómo la entregue la base) a fecha
   de Excel, sin corrimiento por zona horaria. */
const fecha = v => {
  if (v instanceof Date && !isNaN(v)) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};

const edad = v => {
  const f = fecha(v); if (!f) return null;
  const hoy = new Date();
  let e = hoy.getUTCFullYear() - f.getUTCFullYear();
  const m = hoy.getUTCMonth() - f.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < f.getUTCDate())) e--;
  return e;
};

/* «Soltero(a)» → SOLTERO o SOLTERA según el sexo. */
function estadoCivil(ec, sexo) {
  const base = mayus(String(ec || '').replace(/\(a\)/i, ''));
  if (!base) return null;
  if (mayus(sexo) === 'FEMENINO' && /O$/.test(base)) return base.slice(0, -1) + 'A';
  return base;
}

const copiarEstilo = (origen, destino, columnas) => {
  for (let c = 1; c <= columnas; c++) {
    destino.getCell(c).style = JSON.parse(JSON.stringify(origen.getCell(c).style || {}));
  }
  if (origen.height) destino.height = origen.height;
};

export async function construirAnexo8(personas) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(PLANTILLA_ANEXO8, 'base64'));
  const hoja = wb.getWorksheet('ANEXO 8');
  const ver  = wb.getWorksheet('Verificación');
  const modelo = hoja.getRow(FILA_MODELO);
  const modeloVer = ver.getRow(3);

  personas.forEach((p0, i) => {
    // La fecha de nacimiento llega como texto 'AAAA-MM-DD' si la consulta la
    // formateó; si no, como Date. fecha() entiende las dos.
    const p = { ...p0, fecha_nacimiento: p0.nacimiento_txt ?? p0.fecha_nacimiento };
    const n = FILA_MODELO + i;
    const fila = hoja.getRow(n);
    if (i) copiarEstilo(modelo, fila, COLUMNAS);

    const pat = mayus(p.apellido_paterno), mat = mayus(p.apellido_materno), nom = mayus(p.nombres);
    const doc = String(p.numero_documento ?? '').trim();   // texto: conserva ceros iniciales
    const cel = String(p.celular ?? '').replace(/\D/g, '');

    const valores = [
      fecha(p.registro),                                   // A  Fecha de registro
      [pat, mat, nom].filter(Boolean).join(' '),           // B  Apellidos y nombres
      nom, pat, mat,                                       // C D E
      doc,                                                 // F  DNI
      p.nac_ubigeo || null,                                // G  N.º de ubigeo
      mayus(p.brevete),                                    // H  Brevete
      fecha(p.fecha_nacimiento),                           // I  Fecha de nacimiento
      mayus(p.nac_distrito), mayus(p.nac_provincia), mayus(p.nac_departamento), // J K L
      estadoCivil(p.estado_civil, p.genero),               // M
      cel ? Number(cel) : null,                            // N  Teléfono
      p.correo ? String(p.correo).toLowerCase() : null,    // O
      mayus(p.direccion),                                  // P
      mayus(p.distrito), mayus(p.provincia), mayus(p.departamento), // Q R S
      mayus(p.nivel_educativo),                            // T  Último grado
      mayus(p.puesto),                                     // U  Especialidad laboral
      mayus(p.genero),                                     // V  Sexo
      p.tipo_mano_obra || null,                            // W  MOC/MOSC/MONC
      // X  Edad: fórmula, como en el formato, con el resultado ya calculado
      p.fecha_nacimiento ? { formula: `IF(I${n}="","",DATEDIF(I${n},TODAY(),"Y"))`, result: edad(p.fecha_nacimiento) } : null,
      null, null, null                                     // Y Z AA: los completa RR.HH.
    ];
    // Celda por celda: así se conserva el formato de cada columna.
    valores.forEach((v, c) => { fila.getCell(c + 1).value = v; });

    // Hoja de verificación: la misma persona, en el orden que pide
    const fv = ver.getRow(3 + i);
    if (i) copiarEstilo(modeloVer, fv, 10);
    fv.getCell('B').value = fecha(p.registro);
    fv.getCell('C').value = pat;
    fv.getCell('D').value = mat;
    fv.getCell('E').value = nom;
    fv.getCell('F').value = doc;
    fv.getCell('G').value = EMPRESA;
    fv.getCell('H').value = mayus(p.puesto);
  });

  const ultima = FILA_MODELO + Math.max(personas.length, 1) - 1;
  hoja.autoFilter = `A8:AA${ultima}`;
  return wb.xlsx.writeBuffer();
}
