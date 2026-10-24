// Llena el formato Anexo 8 (Lista de seleccionados, Marcobre) con los
// postulantes elegidos. Devuelve el .xlsx listo para descargar.

import ExcelJS from 'exceljs';
import { PLANTILLA_ANEXO8 } from './plantilla-anexo8.mjs';

const FILA_MODELO = 9;          // primera fila de datos del formato
const COLUMNAS = 26;            // A … Z
const HOJA = 'Hoja2';           // nombre de la hoja en el formato vigente
const EMPRESA = 'JJC CONTRATISTAS GENERALES S.A';

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

const copiarEstilo = (origen, destino, columnas) => {
  for (let c = 1; c <= columnas; c++) {
    destino.getCell(c).style = JSON.parse(JSON.stringify(origen.getCell(c).style || {}));
  }
  if (origen.height) destino.height = origen.height;
};

export async function construirAnexo8(personas) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(PLANTILLA_ANEXO8, 'base64'));
  const hoja = wb.getWorksheet(HOJA);
  const modelo = hoja.getRow(FILA_MODELO);
  const ver = wb.getWorksheet('Verificación');
  const modeloVer = ver.getRow(3);

  personas.forEach((p0, i) => {
    // La fecha de nacimiento llega como texto 'AAAA-MM-DD' si la consulta la
    // formateó; si no, como Date. fecha() entiende las dos.
    const p = { ...p0, fecha_nacimiento: p0.nacimiento_txt ?? p0.fecha_nacimiento };
    const n = FILA_MODELO + i;
    const fila = hoja.getRow(n);
    if (i) copiarEstilo(modelo, fila, COLUMNAS);

    const doc = String(p.numero_documento ?? '').trim();   // texto: conserva ceros iniciales
    const cel = String(p.celular ?? '').replace(/\D/g, '');

    // Mismo orden de columnas que el formato JU-RSO-PRO-002.F04 vigente
    const valores = [
      fecha(p.registro),                                   // A  Fecha de registro
      mayus(p.nombres),                                    // B  Nombres
      mayus(p.apellido_paterno),                           // C  Apellido paterno
      mayus(p.apellido_materno),                           // D  Apellido materno
      doc,                                                 // E  DNI (texto)
      p.nac_ubigeo || null,                                // F  N.º de ubigeo
      mayus(p.brevete) || 'NO APLICA',                     // G  Brevete
      fecha(p.fecha_nacimiento),                           // H  Fecha de nacimiento
      mayus(p.nac_distrito), mayus(p.nac_provincia), mayus(p.nac_departamento), // I J K
      mayus(p.estado_civil),                               // L  Estado civil, p. ej. SOLTERO(A)
      cel || null,                                         // M  Teléfono (texto)
      p.correo ? String(p.correo).toLowerCase() : null,    // N  Correo
      mayus(p.direccion),                                  // O  Dirección
      mayus(p.distrito), mayus(p.provincia), mayus(p.departamento), // P Q R
      mayus(p.nivel_educativo),                            // S  Último grado
      mayus(p.puesto),                                     // T  Especialidad laboral
      mayus(p.genero),                                     // U  Sexo
      p.tipo_mano_obra || null,                            // V  MOC/MOSC/MONC
      edad(p.fecha_nacimiento),                            // W  Edad (número)
      null, null, null                                     // X Y Z: los completa RR.HH.
    ];
    // Celda por celda: así se conserva el formato de cada columna.
    valores.forEach((v, c) => { fila.getCell(c + 1).value = v; });
    // Fecha de registro siempre como día/mes/año, sin depender del idioma del Excel
    fila.getCell(1).numFmt = 'dd/mm/yyyy';

    // Hoja «Verificación»: la misma persona, en el orden que pide Marcobre
    const fv = ver.getRow(3 + i);
    if (i) copiarEstilo(modeloVer, fv, 10);
    fv.getCell('B').value = fecha(p.registro);
    fv.getCell('B').numFmt = 'dd/mm/yyyy';
    fv.getCell('C').value = mayus(p.apellido_paterno);
    fv.getCell('D').value = mayus(p.apellido_materno);
    fv.getCell('E').value = mayus(p.nombres);
    fv.getCell('F').value = doc;
    fv.getCell('G').value = EMPRESA;
    fv.getCell('H').value = mayus(p.puesto);
  });

  const ultima = FILA_MODELO + Math.max(personas.length, 1) - 1;
  hoja.autoFilter = `A8:Z${ultima}`;
  // Que el archivo abra en la hoja del formato
  wb.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
  return wb.xlsx.writeBuffer();
}
