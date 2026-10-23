import { Chart, registerables } from 'chart.js';
import { SPEED_LIMIT_KMH } from '../constants/index.js';
import { buildReportMetrics, EVENT_GAP_MS, SEVERITY } from './reportMetrics.js';

Chart.register(...registerables);

// ─── Paleta corporativa (ARGB) ─────────────────────────────────────────────
const C = {
  navy: 'FF0F172A',
  slate: 'FF1E293B',
  text: 'FF0F172A',
  muted: 'FF64748B',
  border: 'FFE2E8F0',
  zebra: 'FFF8FAFC',
  white: 'FFFFFFFF',
  cyan: 'FF06B6D4',
  cyanLight: 'FFECFEFF',
  indigo: 'FF6366F1',
  indigoLight: 'FFEEF2FF',
  rose: 'FFE11D48',
  roseLight: 'FFFFF1F2',
  amber: 'FFF59E0B',
  amberLight: 'FFFEF3C7',
  orange: 'FFF97316',
  orangeLight: 'FFFFEDD5',
  yellowLight: 'FFFEF9C3',
  emerald: 'FF10B981',
};

const THEMES = {
  conductores: { accent: C.indigo, light: C.indigoLight, hex: '#6366f1' },
  kilometraje: { accent: C.cyan, light: C.cyanLight, hex: '#06b6d4' },
  excesos: { accent: C.rose, light: C.roseLight, hex: '#e11d48' },
};

const SEVERITY_STYLE = {
  LEVE: { fill: C.yellowLight, font: 'FFA16207', hex: '#facc15' },
  MODERADO: { fill: C.orangeLight, font: 'FFC2410C', hex: '#f97316' },
  GRAVE: { fill: C.roseLight, font: 'FFBE123C', hex: '#e11d48' },
};

const SHEETS = {
  portada: 'Portada',
  condResumen: 'Conductores - Resumen',
  condDetalle: 'Conductores - Detalle',
  kmResumen: 'Kilometraje - Resumen',
  kmDetalle: 'Kilometraje - Detalle',
  excResumen: 'Excesos - Resumen',
  excDetalle: 'Excesos - Detalle',
};

const FMT = {
  date: 'dd/mm/yyyy',
  time: 'hh:mm:ss',
  duration: '[h]:mm:ss',
  int: '#,##0',
  dec1: '#,##0.0',
  km: '#,##0.0 "km"',
  kmh: '0 "km/h"',
  pct: '0.0%',
};

// ─── Helpers de estilo ─────────────────────────────────────────────────────
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = (argb = C.border) => ({ style: 'thin', color: { argb } });
const boxBorder = (argb) => ({ top: thin(argb), left: thin(argb), bottom: thin(argb), right: thin(argb) });
const colLetter = (n) => {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};
const toTime = (ms) => (ms === null || ms === undefined ? null : ms / 86400000);
const toDuration = (sec) => sec / 86400;
const internalLink = (sheet, cell) => `#'${sheet}'!${cell}`;
const fmtDate = (d) => (d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const isoDate = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '');

function setupSheet(ws, widths, { landscape = true, printTitleRow, isDetail = false } = {}) {
  ws.columns = widths.map(w => ({ width: w }));
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: landscape ? 'landscape' : 'portrait',
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
  };
  // fitToPage solo debe aplicarse en hojas resumen, NUNCA en hojas de detalle con outlineProperties,
  // ya que ExcelJS emite <pageSetUpPr> antes de <outlinePr>, violando el esquema estricto ECMA-376
  // y haciendo que Excel rechace el XML de la hoja.
  if (!isDetail) {
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 0;
  }
  if (printTitleRow) ws.pageSetup.printTitlesRow = `${printTitleRow}:${printTitleRow}`;
  ws.headerFooter = {
    oddFooter: '&L&8Reporte Operativo de Flota&C&8Página &P de &N&R&8Generado &D &T',
  };
}

function addBanner(ws, { title, subtitle, cols, accent }) {
  const last = colLetter(cols);
  ws.mergeCells(`A1:${last}1`);
  ws.mergeCells(`A2:${last}2`);
  const t = ws.getCell('A1');
  t.value = title;
  t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: C.white } };
  t.alignment = { vertical: 'middle', indent: 1 };
  const s = ws.getCell('A2');
  s.value = subtitle;
  s.font = { name: 'Calibri', size: 10, color: { argb: 'FFCBD5E1' } };
  s.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 36;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 4;
  for (let c = 1; c <= cols; c++) {
    ws.getCell(1, c).fill = fill(C.navy);
    ws.getCell(2, c).fill = fill(C.navy);
    ws.getCell(3, c).fill = fill(accent);
  }
  return 5;
}

/** Tarjetas de indicadores: cada tarjeta ocupa `span` columnas, etiqueta arriba y valor abajo. */
function addKpiCards(ws, row, cards, theme, span = 2) {
  ws.getRow(row).height = 18;
  ws.getRow(row + 1).height = 34;
  cards.forEach((card, i) => {
    const c1 = i * span + 1;
    const c2 = c1 + span - 1;
    ws.mergeCells(row, c1, row, c2);
    ws.mergeCells(row + 1, c1, row + 1, c2);
    const label = ws.getCell(row, c1);
    label.value = card.label.toUpperCase();
    label.font = { size: 8, bold: true, color: { argb: C.muted } };
    label.alignment = { horizontal: 'center', vertical: 'middle' };
    const value = ws.getCell(row + 1, c1);
    value.value = card.value;
    value.numFmt = card.numFmt || FMT.int;
    value.font = { size: card.small ? 12 : 18, bold: true, color: { argb: card.color || theme.accent } };
    value.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let c = c1; c <= c2; c++) {
      ws.getCell(row, c).fill = fill(theme.light);
      ws.getCell(row + 1, c).fill = fill(theme.light);
      ws.getCell(row, c).border = { top: { style: 'medium', color: { argb: card.color || theme.accent } } };
    }
  });
  return row + 3;
}

function styleHeaderRow(ws, row, cols, theme) {
  const r = ws.getRow(row);
  r.height = 30;
  for (let c = 1; c <= cols; c++) {
    const cell = r.getCell(c);
    cell.fill = fill(C.navy);
    cell.font = { bold: true, size: 10, color: { argb: C.white } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: theme.accent } }, left: thin(C.slate), right: thin(C.slate) };
  }
}

/**
 * Escribe una tabla con encabezado, filas cebra y fila de totales opcional (fórmulas SUBTOTAL).
 * columns: [{ header, numFmt, align, total: 'sum' | 'label' | 'avg' }]
 */
function addTable(ws, startRow, columns, rows, theme, { totals = false } = {}) {
  const cols = columns.length;
  columns.forEach((col, i) => { ws.getCell(startRow, i + 1).value = col.header; });
  styleHeaderRow(ws, startRow, cols, theme);

  rows.forEach((values, idx) => {
    const rowNum = startRow + 1 + idx;
    const r = ws.getRow(rowNum);
    r.height = 18;
    values.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      const col = columns[i];
      if (col.numFmt) cell.numFmt = col.numFmt;
      cell.alignment = { vertical: 'middle', horizontal: col.align || (typeof v === 'number' ? 'right' : 'left'), indent: col.align === 'center' ? 0 : 1 };
      cell.border = { bottom: thin(), left: thin(), right: thin() };
      if (idx % 2 === 1) cell.fill = fill(C.zebra);
      if (v && typeof v === 'object' && v.hyperlink) cell.font = { color: { argb: theme.accent }, underline: true, bold: true };
    });
  });

  const firstDataRow = startRow + 1;
  const lastDataRow = startRow + Math.max(rows.length, 1);
  let nextRow = lastDataRow + 1;

  if (rows.length) {
    ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: lastDataRow, column: cols } };
  }

  if (totals && rows.length) {
    const r = ws.getRow(nextRow);
    r.height = 22;
    columns.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      const L = colLetter(i + 1);
      if (col.total === 'label') cell.value = 'TOTAL';
      else if (col.total === 'sum') {
        const result = rows.reduce((s, row) => s + (Number(row[i]) || 0), 0);
        cell.value = { formula: `SUBTOTAL(109,${L}${firstDataRow}:${L}${lastDataRow})`, result };
      } else if (col.total === 'avg') {
        const nums = rows.map(row => Number(row[i]) || 0);
        cell.value = { formula: `SUBTOTAL(101,${L}${firstDataRow}:${L}${lastDataRow})`, result: nums.reduce((a, b) => a + b, 0) / nums.length };
      }
      if (col.numFmt && col.total && col.total !== 'label') cell.numFmt = col.numFmt;
      cell.font = { bold: true, color: { argb: C.text } };
      cell.fill = fill(theme.light);
      cell.alignment = { vertical: 'middle', horizontal: col.total === 'label' ? 'left' : 'right', indent: 1 };
      cell.border = { top: { style: 'medium', color: { argb: theme.accent } }, bottom: thin() };
    });
    nextRow++;
  }

  return { headerRow: startRow, firstDataRow, lastDataRow, nextRow };
}

function addDataBar(ws, ref, argb) {
  ws.addConditionalFormatting({
    ref,
    rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb } }],
  });
}

function addEmptyNotice(ws, row, cols, text) {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { italic: true, color: { argb: C.muted }, size: 11 };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.fill = fill(C.zebra);
  ws.getRow(row).height = 40;
}

function addNote(ws, row, cols, text) {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { italic: true, size: 9, color: { argb: C.muted } };
  cell.alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(row).height = 30;
}

/** Fila de agrupación (nivel superior) del detalle. */
function styleGroupRow(row, cols, bg, accent, level = 0) {
  row.height = level === 0 ? 22 : 18;
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(bg);
    cell.font = { bold: true, size: level === 0 ? 11 : 10, color: { argb: C.text } };
    cell.alignment = { vertical: 'middle', indent: 1, horizontal: cell.alignment?.horizontal };
    cell.border = level === 0
      ? { top: { style: 'medium', color: { argb: accent } }, bottom: thin() }
      : { bottom: thin() };
  }
}

function styleDetailRow(row, cols, zebra) {
  row.height = 17;
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.font = { size: 10, color: { argb: c === 1 ? C.muted : C.text } };
    cell.alignment = { vertical: 'middle', indent: 1, horizontal: cell.alignment?.horizontal };
    cell.border = { bottom: thin() };
    if (zebra) cell.fill = fill(C.zebra);
  }
}

// ─── Gráficos (Chart.js → PNG) ─────────────────────────────────────────────
const WHITE_BG = {
  id: 'whiteBg',
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

function renderChart({ type = 'bar', labels, datasets, title, horizontal = false, stacked = false, width = 680, height = 400 }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const chart = new Chart(canvas.getContext('2d'), {
    type,
    data: { labels, datasets },
    plugins: [WHITE_BG],
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 2,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: {
        title: { display: true, text: title, color: '#0f172a', font: { size: 16, weight: 'bold', family: 'Calibri, Arial' }, padding: { bottom: 14 } },
        legend: { display: datasets.length > 1, position: 'bottom', labels: { color: '#334155', font: { family: 'Calibri, Arial' } } },
      },
      scales: {
        x: { stacked, ticks: { color: '#475569', font: { size: 11, family: 'Calibri, Arial' } }, grid: { color: horizontal ? '#e2e8f0' : 'transparent' } },
        y: { stacked, beginAtZero: true, ticks: { color: '#475569', font: { size: 11, family: 'Calibri, Arial' } }, grid: { color: horizontal ? 'transparent' : '#e2e8f0' } },
      },
    },
  });
  const data = chart.toBase64Image('image/png');
  chart.destroy();
  return { data, width, height };
}

function placeChart(wb, ws, chart, col, row) {
  const base64Data = (chart.data || '').replace(/^data:image\/\w+;base64,/, '');
  const id = wb.addImage({ base64: base64Data, extension: 'png' });
  ws.addImage(id, {
    tl: { col, row },
    ext: { width: chart.width, height: chart.height },
    editAs: 'oneCell',
  });
}

// ─── Portada ───────────────────────────────────────────────────────────────
function buildPortada(wb, ws, ctx) {
  setupSheet(ws, [3, 26, 22, 22, 22, 22, 3], { landscape: false });
  const cols = 7;
  for (let r = 1; r <= 6; r++) for (let c = 1; c <= cols; c++) ws.getCell(r, c).fill = fill(C.navy);
  for (let c = 1; c <= cols; c++) ws.getCell(7, c).fill = fill(C.cyan);
  ws.getRow(7).height = 5;
  ws.getRow(1).height = 20;

  // TODO: insertar aquí el logo de la empresa cuando el usuario lo comparta (filas 1-6, columna B).
  ws.mergeCells('B2:F2');
  ws.mergeCells('B3:F3');
  ws.mergeCells('B4:F4');
  ws.mergeCells('B5:F5');
  ws.getCell('B2').value = 'CONTROL DE FLOTAS';
  ws.getCell('B2').font = { size: 10, bold: true, color: { argb: 'FF67E8F9' } };
  ws.getCell('B3').value = 'Reporte Operativo de Flota';
  ws.getCell('B3').font = { size: 26, bold: true, color: { argb: C.white } };
  ws.getRow(3).height = 40;
  ws.getCell('B4').value = `Período: ${ctx.periodoTexto}`;
  ws.getCell('B4').font = { size: 13, color: { argb: 'FFCBD5E1' } };
  ws.getRow(4).height = 22;
  ws.getCell('B5').value = ctx.filtroTexto;
  ws.getCell('B5').font = { size: 10, italic: true, color: { argb: 'FF94A3B8' } };

  let r = 9;
  const section = (title, accent = C.cyan) => {
    ws.mergeCells(r, 2, r, 6);
    const cell = ws.getCell(r, 2);
    cell.value = title.toUpperCase();
    cell.font = { bold: true, size: 11, color: { argb: C.navy } };
    cell.border = { bottom: { style: 'medium', color: { argb: accent } } };
    ws.getRow(r).height = 22;
    r += 1;
  };
  const infoRow = (label, value) => {
    ws.getCell(r, 2).value = label;
    ws.getCell(r, 2).font = { bold: true, size: 10, color: { argb: C.muted } };
    ws.mergeCells(r, 3, r, 6);
    ws.getCell(r, 3).value = value;
    ws.getCell(r, 3).font = { size: 10, color: { argb: C.text } };
    for (let c = 2; c <= 6; c++) ws.getCell(r, c).border = { bottom: thin() };
    ws.getRow(r).height = 18;
    r += 1;
  };

  section('Información del reporte');
  infoRow('Generado por', ctx.usuario || 'N/D');
  infoRow('Fecha de generación', ctx.generado.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }));
  infoRow('Período analizado', ctx.periodoTexto);
  infoRow('Días con viajes', ctx.metrics.diasConViajes.length);
  infoRow('Días con telemetría', ctx.metrics.diasConTelemetria.length);
  r += 1;

  section('Contenido');
  const index = [];
  if (ctx.reportes.conductores) index.push(['Viajes por conductor', SHEETS.condResumen, SHEETS.condDetalle, THEMES.conductores.accent]);
  if (ctx.reportes.kilometraje) index.push(['Total kilometraje', SHEETS.kmResumen, SHEETS.kmDetalle, THEMES.kilometraje.accent]);
  if (ctx.reportes.excesos) index.push(['Excesos de velocidad', SHEETS.excResumen, SHEETS.excDetalle, THEMES.excesos.accent]);
  index.forEach(([name, resumen, detalle, accent]) => {
    ws.getCell(r, 2).value = name;
    ws.getCell(r, 2).font = { bold: true, size: 11, color: { argb: C.text } };
    ws.getCell(r, 2).border = { left: { style: 'thick', color: { argb: accent } } };
    ws.getCell(r, 3).value = { text: '→ Resumen', hyperlink: internalLink(resumen, 'A1') };
    ws.getCell(r, 3).font = { color: { argb: accent }, underline: true, bold: true };
    ws.getCell(r, 4).value = { text: '→ Detalle', hyperlink: internalLink(detalle, 'A1') };
    ws.getCell(r, 4).font = { color: { argb: accent }, underline: true, bold: true };
    ws.getRow(r).height = 20;
    r += 1;
  });
  r += 1;

  if (ctx.avisos.length) {
    section('Avisos de calidad de datos', C.amber);
    ctx.avisos.forEach(aviso => {
      ws.mergeCells(r, 2, r, 6);
      const cell = ws.getCell(r, 2);
      cell.value = `⚠  ${aviso}`;
      cell.font = { size: 10, color: { argb: 'FF92400E' } };
      cell.fill = fill(C.amberLight);
      cell.alignment = { wrapText: true, vertical: 'middle', indent: 1 };
      ws.getRow(r).height = aviso.length > 95 ? 32 : 20;
      r += 1;
    });
    r += 1;
  }

  section('Criterios utilizados', C.muted);
  [
    'Viajes por conductor: solo se cuentan los viajes cuyo código cruza con una planilla intermunicipal que tenga conductor asignado.',
    'Kilometraje: suma de la distancia total reportada en los archivos de Tiempos y Viajes.',
    `Exceso de velocidad: registro GPS superior a ${SPEED_LIMIT_KMH} km/h. Los registros del mismo vehículo separados por ${EVENT_GAP_MS / 60000} minutos o menos se agrupan en un solo evento.`,
    `Gravedad del evento según su velocidad máxima: Leve ${SPEED_LIMIT_KMH + 1}–${SEVERITY.LEVE.max} km/h · Moderado ${SEVERITY.LEVE.max + 1}–${SEVERITY.MODERADO.max} km/h · Grave > ${SEVERITY.MODERADO.max} km/h.`,
    'Conductor del exceso: se toma del viaje en curso (planilla). Si no es posible ubicar el viaje, se usa el reportado por el GPS y se marca "(GPS)".',
    'Las hojas de detalle se pueden contraer y expandir con los botones [+]/[−] o con los niveles 1 / 2 / 3 en la esquina superior izquierda.',
  ].forEach(text => {
    ws.mergeCells(r, 2, r, 6);
    const cell = ws.getCell(r, 2);
    cell.value = `•  ${text}`;
    cell.font = { size: 9, color: { argb: C.slate } };
    cell.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(r).height = 28;
    r += 1;
  });
}

// ─── Reporte 1: Viajes por conductor ───────────────────────────────────────
function buildConductores(wb, wsRes, wsDet, ctx) {
  const data = ctx.metrics.conductores;
  const theme = THEMES.conductores;
  const subtitle = `Período: ${ctx.periodoTexto}  ·  Solo viajes con planilla intermunicipal`;

  // Detalle
  const detCols = 7;
  setupSheet(wsDet, [34, 13, 16, 11, 12, 34, 13], { printTitleRow: 5, isDetail: true });
  addBanner(wsDet, { title: 'Viajes por conductor — Detalle', subtitle, cols: detCols, accent: theme.accent });
  wsDet.getRow(4).height = 18;
  wsDet.getCell('A4').value = { text: '← Volver al Resumen', hyperlink: internalLink(SHEETS.condResumen, 'A1') };
  wsDet.getCell('A4').font = { size: 9, bold: true, color: { argb: theme.accent }, underline: true };
  ['Conductor', 'Fecha', 'Código viaje', 'Interno', 'Placa', 'Ruta', 'Hora salida'].forEach((h, i) => { wsDet.getCell(5, i + 1).value = h; });
  styleHeaderRow(wsDet, 5, detCols, theme);
  wsDet.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
  wsDet.properties.outlineProperties = { summaryBelow: false, summaryRight: false };

  const anchors = new Map();
  let r = 6;
  if (!data.conductores.length) {
    addEmptyNotice(wsDet, r, detCols, 'No hay viajes con planilla en el período seleccionado.');
  }
  data.conductores.forEach(cond => {
    anchors.set(cond.conductor, `A${r}`);
    const g = wsDet.getRow(r);
    g.getCell(1).value = cond.conductor;
    g.getCell(2).value = `${cond.diasTrabajados} día(s) trabajado(s)`;
    g.getCell(7).value = cond.totalViajes;
    g.getCell(7).numFmt = '0 "viajes"';
    styleGroupRow(g, detCols, theme.light, theme.accent);
    g.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    r++;
    cond.viajes.forEach((v, i) => {
      const row = wsDet.getRow(r);
      row.values = [cond.conductor, v.fecha, v.viaje, v.interno, v.placa, v.ruta, toTime(v.horaMs)];
      row.getCell(2).numFmt = FMT.date;
      row.getCell(7).numFmt = FMT.time;
      row.outlineLevel = 1;
      styleDetailRow(row, detCols, i % 2 === 1);
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      r++;
    });
  });
  if (data.conductores.length) {
    const t = wsDet.getRow(r);
    t.getCell(1).value = 'TOTAL GENERAL';
    t.getCell(7).value = data.totalViajes;
    t.getCell(7).numFmt = '0 "viajes"';
    styleGroupRow(t, detCols, C.navy, theme.accent);
    for (let c = 1; c <= detCols; c++) t.getCell(c).font = { bold: true, color: { argb: C.white } };
    t.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // Resumen
  const cols = 8;
  setupSheet(wsRes, [6, 34, 13, 13, 13, 26, 30, 11]);
  let row = addBanner(wsRes, { title: 'Viajes por conductor', subtitle, cols, accent: theme.accent });
  wsRes.getRow(4).height = 18;
  wsRes.getCell('A4').value = { text: '← Volver a la Portada', hyperlink: internalLink(SHEETS.portada, 'A1') };
  wsRes.getCell('A4').font = { size: 9, bold: true, color: { argb: theme.accent }, underline: true };
  row = addKpiCards(wsRes, row, [
    { label: 'Viajes con planilla', value: data.totalViajes },
    { label: 'Conductores activos', value: data.totalConductores },
    { label: 'Promedio por conductor', value: data.promedioPorConductor, numFmt: FMT.dec1 },
    { label: 'Viajes sin planilla (excluidos)', value: data.excluidos, color: data.excluidos ? C.amber : C.emerald },
  ], theme);

  if (!data.conductores.length) {
    addEmptyNotice(wsRes, row, cols, 'No hay viajes con planilla en el período seleccionado.');
    return;
  }

  const columns = [
    { header: '#', align: 'center', total: 'label' },
    { header: 'Conductor' },
    { header: 'Total viajes', numFmt: FMT.int, total: 'sum' },
    { header: 'Días trabajados', numFmt: FMT.int, align: 'center' },
    { header: 'Prom. viajes / día', numFmt: FMT.dec1, align: 'center' },
    { header: 'Vehículos usados' },
    { header: 'Rutas' },
    { header: '% del total', numFmt: FMT.pct, total: 'sum' },
  ];
  const rows = data.conductores.map((c, i) => [
    i + 1,
    { text: c.conductor, hyperlink: internalLink(SHEETS.condDetalle, anchors.get(c.conductor)) },
    c.totalViajes,
    c.diasTrabajados,
    c.promedioDia,
    c.vehiculos.join(', '),
    c.rutas.join(', '),
    c.porcentaje,
  ]);
  const tbl = addTable(wsRes, row, columns, rows, theme, { totals: true });
  addDataBar(wsRes, `C${tbl.firstDataRow}:C${tbl.lastDataRow}`, theme.accent);

  const top = data.conductores.slice(0, 15);
  const chart = renderChart({
    labels: top.map(c => c.conductor.length > 28 ? `${c.conductor.slice(0, 26)}…` : c.conductor),
    datasets: [{ label: 'Viajes', data: top.map(c => c.totalViajes), backgroundColor: theme.hex, borderRadius: 4 }],
    title: `Top ${top.length} conductores por número de viajes`,
    horizontal: true,
    height: Math.max(320, 60 + top.length * 26),
  });
  placeChart(wb, wsRes, chart, cols + 1, tbl.headerRow - 1);
  addNote(wsRes, tbl.nextRow + 1, cols, 'Haz clic en el nombre de un conductor para ver el detalle de sus viajes.');
}

// ─── Reporte 2: Kilometraje ────────────────────────────────────────────────
function buildKilometraje(wb, wsRes, wsDet, ctx) {
  const data = ctx.metrics.kilometraje;
  const theme = THEMES.kilometraje;
  const subtitle = `Período: ${ctx.periodoTexto}  ·  Fuente: archivos de Tiempos y Viajes`;

  // Detalle (vehículo → día → viaje)
  const detCols = 7;
  setupSheet(wsDet, [14, 12, 13, 16, 34, 34, 14], { printTitleRow: 5, isDetail: true });
  addBanner(wsDet, { title: 'Kilometraje por vehículo — Detalle', subtitle, cols: detCols, accent: theme.accent });
  wsDet.getRow(4).height = 18;
  wsDet.getCell('A4').value = { text: '← Volver al Resumen', hyperlink: internalLink(SHEETS.kmResumen, 'A1') };
  wsDet.getCell('A4').font = { size: 9, bold: true, color: { argb: theme.accent }, underline: true };
  ['Interno', 'Placa', 'Fecha', 'Código viaje', 'Ruta', 'Conductor', 'Km'].forEach((h, i) => { wsDet.getCell(5, i + 1).value = h; });
  styleHeaderRow(wsDet, 5, detCols, theme);
  wsDet.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
  wsDet.properties.outlineProperties = { summaryBelow: false, summaryRight: false };

  const anchors = new Map();
  let r = 6;
  if (!data.vehiculos.length) addEmptyNotice(wsDet, r, detCols, 'No hay viajes en el período seleccionado.');
  data.vehiculos.forEach(v => {
    anchors.set(v.interno, `A${r}`);
    const g = wsDet.getRow(r);
    g.values = [v.interno, v.placa, '', '', `${v.totalViajes} viaje(s) · ${v.diasOperados} día(s)`, '', v.km];
    g.getCell(7).numFmt = FMT.km;
    styleGroupRow(g, detCols, theme.light, theme.accent);
    g.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    r++;
    v.dias.forEach(d => {
      const dr = wsDet.getRow(r);
      dr.values = [v.interno, v.placa, d.fecha, '', `${d.viajes.length} viaje(s)`, '', d.km];
      dr.getCell(3).numFmt = FMT.date;
      dr.getCell(7).numFmt = FMT.km;
      dr.outlineLevel = 1;
      styleGroupRow(dr, detCols, 'FFF1F5F9', theme.accent, 1);
      dr.getCell(1).font = { size: 10, color: { argb: C.muted } };
      dr.getCell(2).font = { size: 10, color: { argb: C.muted } };
      dr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      dr.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      r++;
      d.viajes.forEach(t => {
        const tr = wsDet.getRow(r);
        tr.values = [v.interno, v.placa, t.fecha, t.viaje, t.ruta, t.conductor, t.km];
        tr.getCell(3).numFmt = FMT.date;
        tr.getCell(7).numFmt = FMT.dec1;
        tr.outlineLevel = 2;
        styleDetailRow(tr, detCols, false);
        tr.getCell(2).font = { size: 10, color: { argb: C.muted } };
        tr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        tr.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
        r++;
      });
    });
  });
  if (data.vehiculos.length) {
    const t = wsDet.getRow(r);
    t.getCell(1).value = 'TOTAL FLOTA';
    t.getCell(5).value = `${data.viajesFlota} viaje(s) · ${data.totalVehiculos} vehículo(s)`;
    t.getCell(7).value = data.kmFlota;
    t.getCell(7).numFmt = FMT.km;
    styleGroupRow(t, detCols, C.navy, theme.accent);
    for (let c = 1; c <= detCols; c++) t.getCell(c).font = { bold: true, color: { argb: C.white } };
    t.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // Resumen
  const cols = 9;
  setupSheet(wsRes, [6, 13, 12, 11, 16, 15, 13, 14, 12]);
  let row = addBanner(wsRes, { title: 'Total kilometraje de la flota', subtitle, cols, accent: theme.accent });
  wsRes.getRow(4).height = 18;
  wsRes.getCell('A4').value = { text: '← Volver a la Portada', hyperlink: internalLink(SHEETS.portada, 'A1') };
  wsRes.getCell('A4').font = { size: 9, bold: true, color: { argb: theme.accent }, underline: true };
  row = addKpiCards(wsRes, row, [
    { label: 'Km totales de la flota', value: data.kmFlota, numFmt: FMT.km },
    { label: 'Vehículos activos', value: data.totalVehiculos },
    { label: 'Km promedio por vehículo', value: data.kmPromVehiculo, numFmt: FMT.km },
    { label: 'Km promedio por viaje', value: data.kmPromViaje, numFmt: FMT.km },
  ], theme);

  if (!data.vehiculos.length) {
    addEmptyNotice(wsRes, row, cols, 'No hay viajes en el período seleccionado.');
    return;
  }

  const columns = [
    { header: '#', align: 'center', total: 'label' },
    { header: 'Interno', align: 'center' },
    { header: 'Placa', align: 'center' },
    { header: 'Viajes', numFmt: FMT.int, total: 'sum' },
    { header: 'Km recorridos', numFmt: FMT.dec1, total: 'sum' },
    { header: 'Km prom. / viaje', numFmt: FMT.dec1 },
    { header: 'Días operados', numFmt: FMT.int, align: 'center' },
    { header: 'Km prom. / día', numFmt: FMT.dec1 },
    { header: '% de la flota', numFmt: FMT.pct, total: 'sum' },
  ];
  const rows = data.vehiculos.map((v, i) => [
    i + 1,
    { text: v.interno, hyperlink: internalLink(SHEETS.kmDetalle, anchors.get(v.interno)) },
    v.placa,
    v.totalViajes,
    v.km,
    v.kmPromViaje,
    v.diasOperados,
    v.kmPromDia,
    v.porcentaje,
  ]);
  const tbl = addTable(wsRes, row, columns, rows, theme, { totals: true });
  addDataBar(wsRes, `E${tbl.firstDataRow}:E${tbl.lastDataRow}`, theme.accent);

  const top = data.vehiculos.slice(0, 20);
  const chart = renderChart({
    labels: top.map(v => v.interno),
    datasets: [{ label: 'Km', data: top.map(v => Number(v.km.toFixed(1))), backgroundColor: theme.hex, borderRadius: 4 }],
    title: `Km recorridos — Top ${top.length} vehículos`,
    width: 720,
    height: 380,
  });
  placeChart(wb, wsRes, chart, cols + 1, tbl.headerRow - 1);
  addNote(wsRes, tbl.nextRow + 1, cols, 'Haz clic en el número interno para ver el kilometraje día a día y viaje a viaje de ese vehículo.');
}

// ─── Reporte 3: Excesos de velocidad ───────────────────────────────────────
function severityCell(cell, sev) {
  const st = SEVERITY_STYLE[sev.key];
  cell.value = sev.label;
  cell.fill = fill(st.fill);
  cell.font = { bold: true, size: 10, color: { argb: st.font } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function buildExcesos(wb, wsRes, wsDet, ctx) {
  const data = ctx.metrics.excesos;
  const theme = THEMES.excesos;
  const subtitle = `Período: ${ctx.periodoTexto}  ·  Límite: ${SPEED_LIMIT_KMH} km/h  ·  Eventos = registros agrupados a ≤ ${EVENT_GAP_MS / 60000} min`;
  const emptyMsg = ctx.metrics.diasConTelemetria.length
    ? 'No se registraron excesos de velocidad en el período seleccionado.'
    : 'No hay datos de telemetría GPS cargados para el período seleccionado.';

  // Detalle
  const detCols = 12;
  setupSheet(wsDet, [18, 12, 11, 11, 11, 34, 26, 11, 11, 12, 10, 12], { printTitleRow: 5, isDetail: true });
  addBanner(wsDet, { title: 'Excesos de velocidad — Detalle por vehículo', subtitle, cols: detCols, accent: theme.accent });
  wsDet.getRow(4).height = 18;
  wsDet.getCell('A4').value = { text: '← Volver al Resumen', hyperlink: internalLink(SHEETS.excResumen, 'A1') };
  wsDet.getCell('A4').font = { size: 9, bold: true, color: { argb: theme.accent }, underline: true };
  ['Interno', 'Fecha', 'Hora inicio', 'Hora fin', 'Duración', 'Conductor', 'Ruta / Viaje', 'Vel. máx', 'Vel. prom.', 'Gravedad', 'Registros', 'Ubicación'].forEach((h, i) => { wsDet.getCell(5, i + 1).value = h; });
  styleHeaderRow(wsDet, 5, detCols, theme);
  wsDet.views = [{ state: 'frozen', ySplit: 5, showGridLines: false }];
  wsDet.properties.outlineProperties = { summaryBelow: false, summaryRight: false };

  const anchors = new Map();
  let r = 6;
  if (!data.vehiculos.length) addEmptyNotice(wsDet, r, detCols, emptyMsg);
  data.vehiculos.forEach(v => {
    anchors.set(v.interno, `A${r}`);
    const g = wsDet.getRow(r);
    g.values = [
      v.placa ? `${v.interno} · ${v.placa}` : v.interno, '', '', '', toDuration(v.tiempoTotalSeg),
      `${v.totalEventos} evento(s)  ·  ${v.graves} grave(s)`, '', v.velMax, v.velProm, '', v.registros, '',
    ];
    g.getCell(5).numFmt = FMT.duration;
    g.getCell(8).numFmt = FMT.kmh;
    g.getCell(9).numFmt = FMT.kmh;
    styleGroupRow(g, detCols, theme.light, theme.accent);
    [5, 8, 9, 11].forEach(c => { g.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
    r++;
    v.eventos.forEach((e, i) => {
      const row = wsDet.getRow(r);
      row.values = [
        v.interno, e.fecha, toTime(e.horaMs), toTime(e.horaFinMs), toDuration(e.duracionSeg),
        e.conductor, [e.ruta, e.viaje].filter(Boolean).join(' / '), e.velMax, Math.round(e.velProm), '', e.registros,
        (e.lat && e.lng) ? { text: '📍 Ver mapa', hyperlink: `https://www.google.com/maps?q=${e.lat},${e.lng}` } : '',
      ];
      row.outlineLevel = 1;
      styleDetailRow(row, detCols, i % 2 === 1);
      row.getCell(2).numFmt = FMT.date;
      row.getCell(3).numFmt = FMT.time;
      row.getCell(4).numFmt = FMT.time;
      row.getCell(5).numFmt = FMT.duration;
      row.getCell(8).numFmt = FMT.kmh;
      row.getCell(9).numFmt = FMT.kmh;
      [2, 3, 4, 5, 8, 9, 11, 12].forEach(c => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' }; });
      row.getCell(8).font = { bold: true, size: 10, color: { argb: SEVERITY_STYLE[e.gravedad.key].font } };
      if (e.fuenteConductor === 'GPS') row.getCell(6).font = { italic: true, size: 10, color: { argb: C.muted } };
      row.getCell(12).font = { size: 10, color: { argb: 'FF2563EB' }, underline: true };
      severityCell(row.getCell(10), e.gravedad);
      r++;
    });
  });
  if (data.vehiculos.length) {
    const t = wsDet.getRow(r);
    t.getCell(1).value = 'TOTAL FLOTA';
    t.getCell(6).value = `${data.totalEventos} evento(s) en ${data.vehiculosConExcesos} vehículo(s)`;
    t.getCell(11).value = data.totalRegistros;
    styleGroupRow(t, detCols, C.navy, theme.accent);
    for (let c = 1; c <= detCols; c++) t.getCell(c).font = { bold: true, color: { argb: C.white } };
    t.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Resumen
  const cols = 11;
  setupSheet(wsRes, [6, 12, 12, 11, 11, 13, 11, 11, 11, 15, 40]);
  let row = addBanner(wsRes, { title: 'Excesos de velocidad', subtitle, cols, accent: theme.accent });
  wsRes.getRow(4).height = 18;
  wsRes.getCell('A4').value = { text: '← Volver a la Portada', hyperlink: internalLink(SHEETS.portada, 'A1') };
  wsRes.getCell('A4').font = { size: 9, bold: true, color: { argb: theme.accent }, underline: true };
  const max = data.maxFlota;
  row = addKpiCards(wsRes, row, [
    { label: 'Total eventos', value: data.totalEventos },
    { label: 'Vehículos con excesos', value: data.vehiculosConExcesos },
    { label: 'Eventos graves (> 100 km/h)', value: data.totalesGravedad.GRAVE, color: C.rose },
    {
      label: 'Velocidad máxima de la flota',
      value: max ? `${Math.round(max.velMax)} km/h · Int. ${max.interno} · ${fmtDate(max.fecha)}` : '—',
      numFmt: '@',
      small: true,
    },
  ], theme, 2);

  if (!data.vehiculos.length) {
    addEmptyNotice(wsRes, row, cols, emptyMsg);
    return;
  }

  const columns = [
    { header: '#', align: 'center', total: 'label' },
    { header: 'Interno', align: 'center' },
    { header: 'Placa', align: 'center' },
    { header: 'Eventos', numFmt: FMT.int, total: 'sum', align: 'center' },
    { header: `Leves\n(${SPEED_LIMIT_KMH + 1}–${SEVERITY.LEVE.max})`, numFmt: FMT.int, total: 'sum', align: 'center' },
    { header: `Moderados\n(${SEVERITY.LEVE.max + 1}–${SEVERITY.MODERADO.max})`, numFmt: FMT.int, total: 'sum', align: 'center' },
    { header: `Graves\n(> ${SEVERITY.MODERADO.max})`, numFmt: FMT.int, total: 'sum', align: 'center' },
    { header: 'Vel. máx', numFmt: FMT.kmh, align: 'center' },
    { header: 'Vel. prom.', numFmt: FMT.kmh, align: 'center' },
    { header: 'Tiempo en exceso', numFmt: FMT.duration, total: 'sum', align: 'center' },
    { header: 'Conductores' },
  ];
  const rows = data.vehiculos.map((v, i) => [
    i + 1,
    { text: v.interno, hyperlink: internalLink(SHEETS.excDetalle, anchors.get(v.interno)) },
    v.placa,
    v.totalEventos,
    v.leves,
    v.moderados,
    v.graves,
    v.velMax,
    Math.round(v.velProm),
    toDuration(v.tiempoTotalSeg),
    v.conductores.join(', '),
  ]);
  const tbl = addTable(wsRes, row, columns, rows, theme, { totals: true });
  // Encabezados de gravedad con su color
  [[5, 'LEVE'], [6, 'MODERADO'], [7, 'GRAVE']].forEach(([c, k]) => {
    const cell = wsRes.getCell(tbl.headerRow, c);
    cell.border = { ...cell.border, bottom: { style: 'thick', color: { argb: 'FF' + SEVERITY_STYLE[k].hex.slice(1).toUpperCase() } } };
  });
  addDataBar(wsRes, `D${tbl.firstDataRow}:D${tbl.lastDataRow}`, theme.accent);
  wsRes.addConditionalFormatting({
    ref: `G${tbl.firstDataRow}:G${tbl.lastDataRow}`,
    rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: [0], priority: 2, style: { font: { bold: true, color: { argb: 'FFBE123C' } }, fill: fill(C.roseLight) } }],
  });
  wsRes.addConditionalFormatting({
    ref: `H${tbl.firstDataRow}:H${tbl.lastDataRow}`,
    rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: [SEVERITY.MODERADO.max], priority: 3, style: { font: { bold: true, color: { argb: 'FFBE123C' } } } }],
  });

  const top = data.vehiculos.slice(0, 15);
  const chart = renderChart({
    labels: top.map(v => v.interno),
    datasets: [
      { label: 'Leves', data: top.map(v => v.leves), backgroundColor: SEVERITY_STYLE.LEVE.hex },
      { label: 'Moderados', data: top.map(v => v.moderados), backgroundColor: SEVERITY_STYLE.MODERADO.hex },
      { label: 'Graves', data: top.map(v => v.graves), backgroundColor: SEVERITY_STYLE.GRAVE.hex },
    ],
    title: `Eventos de exceso por vehículo — Top ${top.length}`,
    stacked: true,
    width: 720,
    height: 400,
  });
  placeChart(wb, wsRes, chart, cols + 1, tbl.headerRow - 1);
  addNote(wsRes, tbl.nextRow + 1, cols, 'Haz clic en el número interno para ver cada evento con fecha, hora, conductor y ubicación en el mapa. Los conductores marcados "(GPS)" no pudieron cruzarse con un viaje.');
}

// ─── Punto de entrada ──────────────────────────────────────────────────────
/**
 * Genera y descarga el libro Excel.
 * @param {object} p
 * @param {Array} p.trips              viajes validados (filtrados por fecha)
 * @param {Array} p.telemetry          telemetría filtrada (solo excesos)
 * @param {Map|null} p.planillasMap
 * @param {{start:string,end:string}} p.dateRange
 * @param {{conductores:boolean,kilometraje:boolean,excesos:boolean}} p.reportes
 * @param {{vehiculo:string,conductor:string}} p.filtros
 * @param {string} p.usuario
 * @param {string[]} p.diasSinPlanillas
 */
export async function exportExcelReport({ trips, telemetry, planillasMap, dateRange = {}, reportes, filtros = {}, usuario, diasSinPlanillas = [] }) {
  const mod = await import('exceljs');
  const ExcelJS = mod.default ?? mod;

  const metrics = buildReportMetrics({ trips, telemetry, planillasMap, filtros });

  // Período: el filtro activo o, si no hay, el rango real de los datos
  const allDays = [...new Set([...metrics.diasConViajes, ...metrics.diasConTelemetria])].sort();
  const startIso = dateRange.start || dateRange.end || allDays[0] || '';
  const endIso = dateRange.end || dateRange.start || allDays[allDays.length - 1] || '';
  const toLocal = (iso) => { if (!iso) return null; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const inicio = toLocal(startIso);
  const fin = toLocal(endIso);
  const periodoTexto = inicio ? (startIso === endIso ? fmtDate(inicio) : `${fmtDate(inicio)} al ${fmtDate(fin)}`) : 'Sin datos';

  const filtrosTexto = [];
  if (filtros.vehiculo && filtros.vehiculo !== 'ALL') filtrosTexto.push(`Vehículo ${filtros.vehiculo}`);
  if (filtros.conductor && filtros.conductor !== 'ALL') filtrosTexto.push(`Conductor ${filtros.conductor}`);
  const filtroTexto = filtrosTexto.length ? `Filtrado por: ${filtrosTexto.join(' · ')}` : 'Toda la flota';

  const avisos = [];
  if (reportes.conductores && metrics.conductores.excluidos > 0) {
    avisos.push(`${metrics.conductores.excluidos} viaje(s) no tienen planilla con conductor y no se incluyen en "Viajes por conductor".`);
  }
  if (diasSinPlanillas.length) {
    avisos.push(`Días sin planillas cargadas: ${diasSinPlanillas.map(d => fmtDate(toLocal(d))).join(', ')}.`);
  }
  if (reportes.excesos && !metrics.diasConTelemetria.length) {
    avisos.push('No hay telemetría GPS cargada para el período; el reporte de excesos aparece vacío.');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = usuario || 'Control de Flotas';
  wb.created = new Date();
  wb.title = 'Reporte Operativo de Flota';

  const ctx = { metrics, periodoTexto, filtroTexto, usuario, generado: new Date(), avisos, reportes };

  // Crear las hojas en orden y luego llenarlas
  const wsPortada = wb.addWorksheet(SHEETS.portada, { properties: { tabColor: { argb: C.navy } } });
  const sheets = {};
  if (reportes.conductores) {
    sheets.cr = wb.addWorksheet(SHEETS.condResumen, { properties: { tabColor: { argb: THEMES.conductores.accent } } });
    sheets.cd = wb.addWorksheet(SHEETS.condDetalle, { properties: { tabColor: { argb: THEMES.conductores.accent } } });
  }
  if (reportes.kilometraje) {
    sheets.kr = wb.addWorksheet(SHEETS.kmResumen, { properties: { tabColor: { argb: THEMES.kilometraje.accent } } });
    sheets.kd = wb.addWorksheet(SHEETS.kmDetalle, { properties: { tabColor: { argb: THEMES.kilometraje.accent } } });
  }
  if (reportes.excesos) {
    sheets.er = wb.addWorksheet(SHEETS.excResumen, { properties: { tabColor: { argb: THEMES.excesos.accent } } });
    sheets.ed = wb.addWorksheet(SHEETS.excDetalle, { properties: { tabColor: { argb: THEMES.excesos.accent } } });
  }

  buildPortada(wb, wsPortada, ctx);
  if (reportes.conductores) buildConductores(wb, sheets.cr, sheets.cd, ctx);
  if (reportes.kilometraje) buildKilometraje(wb, sheets.kr, sheets.kd, ctx);
  if (reportes.excesos) buildExcesos(wb, sheets.er, sheets.ed, ctx);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const suffix = filtros.vehiculo && filtros.vehiculo !== 'ALL' ? `_Int${filtros.vehiculo}` : (filtros.conductor && filtros.conductor !== 'ALL' ? '_Conductor' : '');

  // Nombre según cantidad de reportes: si es 1 individual toma su nombre; si son 2 o más, 'Reporte_Flota'
  const activeReports = [];
  if (reportes.conductores) activeReports.push('conductores');
  if (reportes.kilometraje) activeReports.push('kilometraje');
  if (reportes.excesos) activeReports.push('excesos');

  let reportPrefix = 'Reporte_Flota';
  if (activeReports.length === 1) {
    const single = activeReports[0];
    if (single === 'kilometraje') reportPrefix = 'Reporte_Kilometraje';
    else if (single === 'conductores') reportPrefix = 'Reporte_Viajes_Conductor';
    else if (single === 'excesos') reportPrefix = 'Reporte_Excesos_Velocidad';
  }

  const datePart = `${isoDate(inicio) || 'sin-fecha'}${startIso !== endIso ? `_a_${isoDate(fin)}` : ''}`;
  const fileName = `${reportPrefix}_${datePart}${suffix}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { fileName, metrics, buffer };
}
