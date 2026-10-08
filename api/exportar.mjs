// GET /api/exportar — descarga el listado filtrado como archivo Excel.
// Acepta los mismos filtros que /api/postulantes.

import ExcelJS from 'exceljs';
import { sql } from '../lib/db.mjs';
import { protegido } from '../lib/sesion.mjs';

const COLUMNAS = [
  { header: 'Código',              key: 'codigo',               width: 12 },
  { header: 'Fecha',               key: 'creado_en',            width: 18 },
  { header: 'Estado',              key: 'estado',               width: 14 },
  { header: 'Puesto',              key: 'puesto',               width: 30 },
  { header: 'Apellido paterno',    key: 'apellido_paterno',     width: 18 },
  { header: 'Apellido materno',    key: 'apellido_materno',     width: 18 },
  { header: 'Nombres',             key: 'nombres',              width: 24 },
  { header: 'Tipo doc.',           key: 'tipo_documento',       width: 10 },
  { header: 'Documento',           key: 'numero_documento',     width: 13 },
  { header: 'Verificado',          key: 'datos_verificados',    width: 11 },
  { header: 'Nacionalidad',        key: 'nacionalidad',         width: 14 },
  { header: 'Fecha nacimiento',    key: 'fecha_nacimiento',     width: 16 },
  { header: 'Edad',                key: 'edad',                 width: 7  },
  { header: 'Estado civil',        key: 'estado_civil',         width: 14 },
  { header: 'Género',              key: 'genero',               width: 12 },
  { header: 'Celular',             key: 'celular',              width: 13 },
  { header: 'Correo',              key: 'correo',               width: 30 },
  { header: 'Dirección',           key: 'direccion',            width: 32 },
  { header: 'Departamento',        key: 'departamento',         width: 16 },
  { header: 'Provincia',           key: 'provincia',            width: 16 },
  { header: 'Distrito',            key: 'distrito',             width: 16 },
  { header: 'Discapacidad',        key: 'discapacidad',         width: 13 },
  { header: 'Nivel educativo',     key: 'nivel_educativo',      width: 16 },
  { header: 'Centro de estudios',  key: 'centro_estudios',      width: 28 },
  { header: 'Especialidad',        key: 'especialidad',         width: 26 },
  { header: 'Estado estudios',     key: 'estado_estudios',      width: 15 },
  { header: 'Colegiatura',         key: 'numero_colegiatura',   width: 14 },
  { header: 'Años exp.',           key: 'experiencia_anios',    width: 10 },
  { header: 'Fuente',              key: 'fuente_reclutamiento', width: 15 },
  { header: 'Expectativa (S/)',    key: 'expectativa_salarial', width: 16 },
  { header: 'Disp. inmediata',     key: 'disponibilidad',       width: 15 },
  { header: 'CV',                  key: 'cv',                   width: 12 },
  { header: 'Observaciones',       key: 'observaciones',        width: 40 },
  { header: 'Revisado por',        key: 'revisado_por',         width: 22 },
  { header: 'Revisado el',         key: 'revisado_en',          width: 18 }
];

const edadDe = fecha => {
  if (!fecha) return null;
  const n = new Date(fecha), h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
};

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { puesto = '', estado = '', desde = '', hasta = '', buscar = '' } = req.query;
  const texto = String(buscar).trim();

  try {
    const filas = await sql`
      select * from postulantes
       where (${String(puesto)} = '' or puesto = ${String(puesto)})
         and (${String(estado)} = '' or estado = ${String(estado)})
         and (${String(desde)}  = '' or creado_en >= ${desde || null}::date)
         and (${String(hasta)}  = '' or creado_en <  ${hasta || null}::date + 1)
         and (${texto} = '' or
              numero_documento ilike ${'%' + texto + '%'} or
              codigo ilike ${'%' + texto + '%'} or
              (nombres || ' ' || apellido_paterno || ' ' || apellido_materno)
                ilike ${'%' + texto + '%'})
       order by creado_en desc
       limit 5000
    `;

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Reclutamiento CC0174';
    libro.created = new Date();

    const hoja = libro.addWorksheet('Postulantes', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    hoja.columns = COLUMNAS;

    // Encabezado
    const cabecera = hoja.getRow(1);
    cabecera.height = 24;
    cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cabecera.alignment = { vertical: 'middle', horizontal: 'left' };
    cabecera.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16191C' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FFC8102E' } } };
    });

    filas.forEach(f => {
      hoja.addRow({
        ...f,
        creado_en:        f.creado_en ? new Date(f.creado_en) : null,
        revisado_en:      f.revisado_en ? new Date(f.revisado_en) : null,
        fecha_nacimiento: f.fecha_nacimiento ? new Date(f.fecha_nacimiento) : null,
        edad:             edadDe(f.fecha_nacimiento),
        cv:               (f.cv_pathname || f.cv_url) ? f.id : null,
        datos_verificados: f.datos_verificados ? 'Sí' : 'No',
        discapacidad:      f.discapacidad ? 'Sí' : 'No',
        disponibilidad:    f.disponibilidad_inmediata ? 'Sí' : 'No'
      });
    });

    // Formatos de columna
    hoja.getColumn('creado_en').numFmt   = 'dd/mm/yyyy hh:mm';
    hoja.getColumn('revisado_en').numFmt = 'dd/mm/yyyy hh:mm';
    hoja.getColumn('fecha_nacimiento').numFmt = 'dd/mm/yyyy';
    hoja.getColumn('expectativa_salarial').numFmt = '#,##0.00';
    hoja.getColumn('numero_documento').alignment = { horizontal: 'left' };

    // El CV no se enlaza directo al archivo: ahora es privado. El
    // enlace apunta a /api/cv, que pide sesión. Quien abra el Excel
    // sin haber entrado al panel verá el login, no el documento.
    const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
    const colCv = hoja.getColumn('cv').number;
    for (let i = 2; i <= hoja.rowCount; i++) {
      const celda = hoja.getRow(i).getCell(colCv);
      const id = celda.value;
      if (id) {
        celda.value = { text: 'Abrir CV', hyperlink: `${base}/api/cv?id=${id}` };
        celda.font = { color: { argb: 'FF0563C1' }, underline: true };
      }
    }

    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS.length } };

    const buffer = await libro.xlsx.writeBuffer();
    const sello = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="postulantes-${sello}.xlsx"`);
    return res.status(200).send(Buffer.from(buffer));

  } catch (e) {
    console.error('exportar:', e);
    return res.status(500).json({ error: 'No se pudo generar el Excel.' });
  }
}

export default protegido(handler);
