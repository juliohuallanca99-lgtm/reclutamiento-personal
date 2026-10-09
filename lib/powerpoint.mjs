// Presentación del seguimiento de ingreso de personal.
//
// Se arma en el servidor, no en el navegador: así no depende de que
// cargue una librería externa, y el resultado es siempre el mismo.

// Vercel compila estos .mjs a CommonJS y, en ese contexto, la versión
// ESM de pptxgenjs falla al cargarse ("Cannot use import statement
// outside a module"). Por eso pedimos directamente el archivo CommonJS,
// y lo cargamos recién al momento de generar: si la librería diera
// problemas, el listado del módulo sigue funcionando igual.
const cargarPptx = async () => {
  const { createRequire } = await import('node:module');
  // __filename existe cuando Vercel convirtió este archivo a CommonJS;
  // import.meta.url cuando corre como módulo normal.
  const base = typeof __filename !== 'undefined' ? __filename : import.meta.url;
  const m = createRequire(base)('pptxgenjs');
  return m?.default || m;
};

const NAVY   = '16222C';
const AMBAR  = 'F0B400';
const VERDE  = '1D8A5A';
const ROJO   = 'C8372D';
const GRIS   = '5D6B78';
const LINEA  = 'D9DFE5';
const FONDO  = 'EEF1F4';
const BLANCO = 'FFFFFF';

export const ETAPAS_NOMBRES = [
  'EMO', 'Validación JJC', 'Validación UME', 'Anexo 8',
  'Anexo A', 'Aut-Rec', 'Fotocheck'
];

export const CAPACITACIONES_NOMBRES = [
  'Inducción Anexo 4', 'Prevención lesiones en manos', 'IPERC',
  'Ácido sulfúrico', 'Sustancias y productos químicos', 'Riesgos eléctricos',
  'Sistema de izaje', 'Seguridad con herramientas', 'Trabajos en altura',
  'Trabajos en caliente', 'Bloqueo de energía'
];

const COLOR_ESTADO = { ok: VERDE, obs: ROJO, prog: AMBAR, pend: GRIS, na: LINEA };
const SIGLA_ESTADO = { ok: 'OK', obs: 'OBS', prog: 'PROG', pend: '—', na: '' };

const titulo = s => String(s || '').toLowerCase()
  .replace(/(^|[\s,.])(\S)/g, (m, a, b) => a + b.toUpperCase());

const contar = (lista, k = 'ok') => lista.filter(c => c.k === k).length;

/* Clasifica a una persona: laborando, observada o en trámite. */
function grupo(p) {
  if (String(p.e).toUpperCase() === 'LABORANDO') return 'L';
  if (p.st.some(c => c.k === 'obs')) return 'O';
  return 'T';
}

const avance = p =>
  Math.round((contar(p.st) + contar(p.tr)) / (p.st.length + p.tr.length) * 100);

/* Banda superior común a todas las láminas de contenido. */
function encabezado(lamina, texto, subtexto) {
  lamina.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: NAVY } });
  lamina.addShape('rect', { x: 0, y: 0.9, w: 13.33, h: 0.06, fill: { color: AMBAR } });
  lamina.addText(texto, {
    x: 0.5, y: 0.12, w: 9, h: 0.45,
    fontSize: 22, bold: true, color: BLANCO, fontFace: 'Arial'
  });
  if (subtexto) {
    lamina.addText(subtexto, {
      x: 0.5, y: 0.55, w: 9, h: 0.3,
      fontSize: 11, color: 'B9C3CC', fontFace: 'Arial'
    });
  }
}

/* Barra de avance con su conteo al costado. */
function barra(lamina, y, etiqueta, hechos, total, ancho = 7.4) {
  const proporcion = total ? hechos / total : 0;
  lamina.addText(etiqueta, {
    x: 0.6, y, w: 3.2, h: 0.28, fontSize: 11, color: NAVY, fontFace: 'Arial',
    valign: 'middle'
  });
  lamina.addShape('roundRect', {
    x: 3.9, y: y + 0.07, w: ancho, h: 0.16,
    fill: { color: LINEA }, rectRadius: 0.08, line: { type: 'none' }
  });
  if (proporcion > 0) {
    lamina.addShape('roundRect', {
      x: 3.9, y: y + 0.07, w: Math.max(0.18, ancho * proporcion), h: 0.16,
      fill: { color: proporcion === 1 ? VERDE : AMBAR },
      rectRadius: 0.08, line: { type: 'none' }
    });
  }
  lamina.addText(`${hechos}/${total}`, {
    x: 3.9 + ancho + 0.15, y, w: 1, h: 0.28,
    fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial', valign: 'middle'
  });
}

export async function construirPresentacion(personal, opciones = {}) {
  const PptxGenJS = await cargarPptx();
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';   // 13.33 x 7.5 pulgadas
  pptx.author = 'JJC Contratistas Generales';
  pptx.company = 'JJC Contratistas Generales';
  pptx.title = 'Seguimiento de ingreso de personal';

  const hoy = new Date().toLocaleDateString('es-PE',
    { day: '2-digit', month: 'long', year: 'numeric' });

  const total = personal.length;
  const laborando = personal.filter(p => grupo(p) === 'L').length;
  const observados = personal.filter(p => grupo(p) === 'O').length;
  const tramite = total - laborando - observados;
  const promedio = total
    ? Math.round(personal.reduce((a, p) => a + avance(p), 0) / total) : 0;

  /* ---------------- 1. Portada ---------------- */
  const portada = pptx.addSlide();
  portada.background = { color: NAVY };
  portada.addShape('rect', { x: 0, y: 2.9, w: 13.33, h: 0.08, fill: { color: AMBAR } });
  portada.addText('Alineamiento de faja CV-315', {
    x: 0.9, y: 1.9, w: 11.5, h: 0.8,
    fontSize: 40, bold: true, color: BLANCO, fontFace: 'Arial'
  });
  portada.addText('Seguimiento de ingreso de personal · Marcobre Bateas', {
    x: 0.9, y: 3.15, w: 11.5, h: 0.4,
    fontSize: 16, color: AMBAR, fontFace: 'Arial'
  });
  portada.addText(`${total} personas en proceso   ·   ${promedio}% de avance promedio`, {
    x: 0.9, y: 3.75, w: 11.5, h: 0.35,
    fontSize: 13, color: 'B9C3CC', fontFace: 'Arial'
  });
  portada.addText(`Actualizado al ${hoy}`, {
    x: 0.9, y: 6.5, w: 11.5, h: 0.3,
    fontSize: 11, color: GRIS, fontFace: 'Arial'
  });

  /* ---------------- 2. Resumen ---------------- */
  const resumen = pptx.addSlide();
  resumen.background = { color: FONDO };
  encabezado(resumen, 'Resumen', `Al ${hoy}`);

  const tarjetas = [
    ['Personal total', total, NAVY],
    ['Laborando', laborando, VERDE],
    ['En trámite', tramite, AMBAR],
    ['Con observación', observados, ROJO],
    ['Avance promedio', `${promedio}%`, NAVY]
  ];
  tarjetas.forEach(([etiqueta, valor, color], i) => {
    const x = 0.5 + i * 2.5;
    resumen.addShape('roundRect', {
      x, y: 1.3, w: 2.25, h: 1.2, fill: { color: BLANCO },
      line: { color: LINEA, width: 0.5 }, rectRadius: 0.06
    });
    resumen.addShape('rect', { x, y: 1.3, w: 0.07, h: 1.2, fill: { color } });
    resumen.addText(String(valor), {
      x: x + 0.2, y: 1.45, w: 2, h: 0.6,
      fontSize: 30, bold: true, color: NAVY, fontFace: 'Arial'
    });
    resumen.addText(etiqueta, {
      x: x + 0.2, y: 2.05, w: 2, h: 0.3,
      fontSize: 10, color: GRIS, fontFace: 'Arial'
    });
  });

  // Dónde está cada persona, por estado del proceso
  const porEstado = new Map();
  personal.forEach(p => {
    const e = titulo(p.e);
    if (!porEstado.has(e)) porEstado.set(e, []);
    porEstado.get(e).push(p);
  });
  const estados = [...porEstado.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  const anchoCol = 12.33 / Math.max(estados.length, 1);

  resumen.addText('Dónde está cada persona hoy', {
    x: 0.5, y: 2.8, w: 6, h: 0.3,
    fontSize: 14, bold: true, color: NAVY, fontFace: 'Arial'
  });

  estados.forEach(([estado, gente], i) => {
    const x = 0.5 + i * anchoCol;
    resumen.addShape('roundRect', {
      x, y: 3.2, w: anchoCol - 0.25, h: 3.6, fill: { color: BLANCO },
      line: { color: LINEA, width: 0.5 }, rectRadius: 0.06
    });
    resumen.addText(`${estado}  (${gente.length})`, {
      x: x + 0.15, y: 3.32, w: anchoCol - 0.5, h: 0.3,
      fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial'
    });
    gente.slice(0, 8).forEach((p, j) => {
      resumen.addText(`${titulo(p.n)}\n${titulo(p.f || '')} · ${avance(p)}%`, {
        x: x + 0.15, y: 3.68 + j * 0.39, w: anchoCol - 0.5, h: 0.37,
        fontSize: 8, color: NAVY, fontFace: 'Arial', lineSpacingMultiple: 0.9
      });
    });
    if (gente.length > 8) {
      resumen.addText(`y ${gente.length - 8} más`, {
        x: x + 0.15, y: 6.5, w: anchoCol - 0.5, h: 0.25,
        fontSize: 8, italic: true, color: GRIS, fontFace: 'Arial'
      });
    }
  });

  /* ---------------- 3. Avance por etapa ---------------- */
  const etapas = pptx.addSlide();
  etapas.background = { color: FONDO };
  encabezado(etapas, 'Etapas del proceso', 'Personas que completaron cada etapa');
  etapas.addShape('roundRect', {
    x: 0.3, y: 1.3, w: 12.73, h: 3.6, fill: { color: BLANCO },
    line: { color: LINEA, width: 0.5 }, rectRadius: 0.06
  });
  ETAPAS_NOMBRES.forEach((nombre, j) => {
    barra(etapas, 1.55 + j * 0.47, nombre,
          personal.filter(p => p.st[j]?.k === 'ok').length, total);
  });

  const cuelloEtapa = ETAPAS_NOMBRES
    .map((n, j) => ({ n, ok: personal.filter(p => p.st[j]?.k === 'ok').length }))
    .sort((a, b) => a.ok - b.ok)[0];
  if (cuelloEtapa && total) {
    etapas.addText(
      `La etapa más rezagada es ${cuelloEtapa.n}: ${total - cuelloEtapa.ok} de ${total} personas aún no la completan.`,
      { x: 0.5, y: 5.2, w: 12.3, h: 0.4, fontSize: 12, color: NAVY, fontFace: 'Arial' });
  }

  /* ---------------- 4. Avance por capacitación ---------------- */
  const capac = pptx.addSlide();
  capac.background = { color: FONDO };
  encabezado(capac, 'Capacitaciones', 'Personas con cada capacitación aprobada');
  capac.addShape('roundRect', {
    x: 0.3, y: 1.3, w: 12.73, h: 5.2, fill: { color: BLANCO },
    line: { color: LINEA, width: 0.5 }, rectRadius: 0.06
  });
  CAPACITACIONES_NOMBRES.forEach((nombre, j) => {
    barra(capac, 1.5 + j * 0.45, nombre,
          personal.filter(p => p.tr[j]?.k === 'ok').length, total);
  });

  /* ---------------- 5. Matriz por persona ---------------- */
  const matriz = pptx.addSlide();
  matriz.background = { color: FONDO };
  encabezado(matriz, 'Detalle por persona', 'Estado de cada etapa del proceso');

  const cabecera = ['#', 'Trabajador', 'Función', ...ETAPAS_NOMBRES, 'Avance']
    .map(t => ({
      text: t,
      options: { bold: true, color: BLANCO, fill: { color: NAVY }, fontSize: 8, align: 'center' }
    }));

  const cuerpo = personal.map(p => ([
    { text: String(p.i ?? ''), options: { fontSize: 8, align: 'center' } },
    { text: titulo(p.n), options: { fontSize: 8, bold: true } },
    { text: titulo(p.f || ''), options: { fontSize: 7, color: GRIS } },
    ...p.st.map(c => ({
      text: SIGLA_ESTADO[c.k] ?? '',
      options: {
        fontSize: 7, align: 'center', bold: c.k === 'ok' || c.k === 'obs',
        color: c.k === 'pend' || c.k === 'na' ? GRIS : BLANCO,
        fill: { color: c.k === 'pend' || c.k === 'na' ? 'F3F5F6' : COLOR_ESTADO[c.k] }
      }
    })),
    { text: `${avance(p)}%`, options: { fontSize: 8, bold: true, align: 'center' } }
  ]));

  // La altura de fila se reparte el espacio disponible: con pocas
  // personas la tabla no queda perdida arriba, y con muchas no se sale.
  const altoFila = Math.min(0.42, Math.max(0.24, 5.3 / (cuerpo.length + 1)));

  matriz.addTable([cabecera, ...cuerpo], {
    x: 0.3, y: 1.25, w: 12.73,
    colW: [0.4, 2.5, 2.3, ...Array(7).fill(0.93), 0.82],
    border: { type: 'solid', color: LINEA, pt: 0.5 },
    fontFace: 'Arial', valign: 'middle', rowH: altoFila, autoPage: false
  });

  matriz.addText('OK aprobado · OBS observado · PROG programado · — pendiente', {
    x: 0.3, y: Math.min(7.0, 1.4 + altoFila * (cuerpo.length + 1)), w: 12.73, h: 0.25,
    fontSize: 8, color: GRIS, fontFace: 'Arial'
  });

  /* ---------------- 6. Qué está frenando ---------------- */
  const frenos = [];
  personal.forEach(p => {
    p.st.forEach((c, j) => {
      if (c.k === 'obs') frenos.push({ p, etapa: ETAPAS_NOMBRES[j], detalle: c.c || '' });
    });
  });

  if (frenos.length) {
    const bloqueo = pptx.addSlide();
    bloqueo.background = { color: FONDO };
    encabezado(bloqueo, 'Qué está frenando el ingreso',
               `${frenos.length} observación${frenos.length === 1 ? '' : 'es'} por resolver`);
    // La tarjeta crece con la cantidad de observaciones: con una sola
    // no queda un recuadro vacío ocupando media lámina.
    const visibles = Math.min(frenos.length, 11);
    bloqueo.addShape('roundRect', {
      x: 0.3, y: 1.3, w: 12.73, h: Math.min(5.2, 0.5 + visibles * 0.44),
      fill: { color: BLANCO }, line: { color: LINEA, width: 0.5 }, rectRadius: 0.06
    });
    frenos.slice(0, 11).forEach((f, i) => {
      const y = 1.55 + i * 0.44;
      bloqueo.addShape('rect', { x: 0.55, y: y + 0.04, w: 0.06, h: 0.26, fill: { color: ROJO } });
      bloqueo.addText(titulo(f.p.n), {
        x: 0.75, y, w: 3.2, h: 0.32, fontSize: 10, bold: true,
        color: NAVY, fontFace: 'Arial', valign: 'middle'
      });
      bloqueo.addText(f.etapa, {
        x: 4.0, y, w: 1.9, h: 0.32, fontSize: 10, color: ROJO,
        fontFace: 'Arial', valign: 'middle'
      });
      bloqueo.addText(f.detalle || 'Sin detalle registrado', {
        x: 6.0, y, w: 6.9, h: 0.32, fontSize: 9, color: GRIS,
        fontFace: 'Arial', valign: 'middle'
      });
    });
  }

  /* ---------------- cierre ---------------- */
  const cierre = pptx.addSlide();
  cierre.background = { color: NAVY };
  cierre.addShape('rect', { x: 0, y: 3.3, w: 13.33, h: 0.06, fill: { color: AMBAR } });
  cierre.addText(`${laborando} de ${total} ya están laborando`, {
    x: 0.9, y: 2.5, w: 11.5, h: 0.7,
    fontSize: 32, bold: true, color: BLANCO, fontFace: 'Arial'
  });
  cierre.addText(
    observados
      ? `Quedan ${observados} con observación médica y ${tramite} en trámite documentario.`
      : `Quedan ${tramite} en trámite documentario.`,
    { x: 0.9, y: 3.55, w: 11.5, h: 0.4, fontSize: 14, color: 'B9C3CC', fontFace: 'Arial' });
  if (opciones.generadoPor) {
    cierre.addText(`Generado por ${opciones.generadoPor} · ${hoy}`, {
      x: 0.9, y: 6.5, w: 11.5, h: 0.3, fontSize: 10, color: GRIS, fontFace: 'Arial'
    });
  }

  return pptx.write({ outputType: 'nodebuffer' });
}
