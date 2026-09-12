import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SPEED_LIMIT_KMH, PUNCTUALITY_TOLERANCE_MIN } from '../constants/index.js';

// ─── Paleta corporativa ────────────────────────────────────────────────────
const C = {
  bg:        [11,  10,  21],   // #0b0a15
  bgPanel:   [20,  22,  40],   // panel oscuro
  bgAlt:     [26,  28,  52],   // fila alternada
  primary:   [6,  182, 212],   // cyan-400
  fuchsia:   [192, 38, 211],   // fuchsia-600
  indigo:    [99, 102, 241],   // indigo-500
  emerald:   [16, 185, 129],   // emerald-500
  amber:     [245,158,  11],   // amber-500
  rose:      [244,  63,  94],  // rose-500
  white:     [255, 255, 255],
  muted:     [148, 163, 184],  // slate-400
  faint:     [71,  85, 105],   // slate-600
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function hex(arr) { return arr.map(v => v.toString(16).padStart(2,'0')).join(''); }

function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function pct(num, total) { return total > 0 ? Math.round((num / total) * 100) : 0; }

export function generateReport(allTrips, telemetryData = []) {
  const doc  = new jsPDF('p', 'mm', 'a4');
  const PW   = doc.internal.pageSize.getWidth();
  const PH   = doc.internal.pageSize.getHeight();
  const M    = 18;
  const CW   = PW - M * 2;
  let y      = 0;

  // ──────────────────────────────────────────────────────────────────────────
  // PRE-COMPUTE ALL STATISTICS
  // ──────────────────────────────────────────────────────────────────────────
  let totalDist    = 0;
  let vehMap       = {};
  let routeMap     = {};
  let driverSet    = new Set();
  let antes = 0, tiempo = 0, tarde = 0;
  let totalExcesos = 0;
  let worstDelay   = { trip: null, val: 0 };
  let fechas       = [];

  allTrips.forEach((t, idx) => {
    const int  = t.interno  || 'N/A';
    const ruta = t.ruta     || 'N/D';
    totalDist += (t.totalDistancia || 0);
    if (t.fecha) fechas.push(t.fecha);

    if (!vehMap[int])   vehMap[int]   = { viajes: 0, retraso: 0, adelanto: 0, dist: 0, puntual: 0, totalPts: 0 };
    if (!routeMap[ruta]) routeMap[ruta] = { viajes: 0, retraso: 0, puntual: 0, totalPts: 0 };

    vehMap[int].viajes++;
    const net = t.totalDiferencia || 0;
    if (net > 0) vehMap[int].retraso   += net;
    else         vehMap[int].adelanto  += Math.abs(net);
    vehMap[int].dist += (t.totalDistancia || 0);

    routeMap[ruta].viajes++;

    if (net > worstDelay.val) { worstDelay.val = net; worstDelay.trip = t; }

    (t.puntos || []).forEach(p => {
      if (p.conductor) driverSet.add(p.conductor);
      const diff = p.diferencia ?? 0;

      vehMap[int].totalPts++;
      routeMap[ruta].totalPts++;

      if (diff < -PUNCTUALITY_TOLERANCE_MIN)      { antes++; }
      else if (diff > PUNCTUALITY_TOLERANCE_MIN)  { tarde++; vehMap[int].retraso += 0; routeMap[ruta].retraso++; }
      else                                         { tiempo++; vehMap[int].puntual++; routeMap[ruta].puntual++; }
    });
  });

  telemetryData.forEach(v => { totalExcesos += (v.excesos || 0); });

  const totalPts    = antes + tiempo + tarde;
  const punctRate   = pct(antes + tiempo, totalPts);
  const lateRate    = pct(tarde, totalPts);
  const nowDate     = new Date();
  const dateStr     = cap(nowDate.toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric' }));
  const fileName    = `Reporte_Flotas_${nowDate.toISOString().split('T')[0]}.pdf`;

  // Sorted arrays
  const vehRows   = Object.entries(vehMap).sort((a, b) => b[1].viajes - a[1].viajes);
  const routeRows = Object.entries(routeMap).sort((a, b) => b[1].viajes - a[1].viajes);

  // ──────────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────────────────────
  const fillBg = () => {
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, PW, PH, 'F');
  };

  const addPage = () => {
    doc.addPage();
    fillBg();
    // top accent line
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, PW, 1.5, 'F');
    y = M + 6;
  };

  const pageFooter = (label) => {
    doc.setFontSize(7.5);
    doc.setTextColor(...C.faint);
    doc.text(label, M, PH - 8);
    doc.text(`${nowDate.toLocaleDateString('es-CO')}`, PW - M, PH - 8, { align: 'right' });
  };

  const sectionTitle = (title, color = C.primary) => {
    if (y > PH - 50) addPage();
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(title.toUpperCase(), M, y);
    y += 3;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.line(M, y, M + CW, y);
    y += 9;
  };

  // Colored KPI box
  const kpiBox = (x, bY, w, h, label, value, color, unit='') => {
    // box
    doc.setFillColor(...C.bgPanel);
    doc.roundedRect(x, bY, w, h, 3, 3, 'F');
    // accent left bar
    doc.setFillColor(...color);
    doc.roundedRect(x, bY, 2.5, h, 1, 1, 'F');
    // value
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(String(value), x + w / 2, bY + h * 0.52, { align: 'center' });
    // unit
    if (unit) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.muted);
      doc.text(unit, x + w / 2, bY + h * 0.52 + 5.5, { align: 'center' });
    }
    // label
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.muted);
    doc.text(label.toUpperCase(), x + w / 2, bY + h - 4.5, { align: 'center' });
  };

  // Horizontal progress bar
  const progressBar = (label, value, total, color, barY) => {
    const ratio = total > 0 ? value / total : 0;
    const pctLabel = `${Math.round(ratio * 100)}%`;
    const barW = CW * 0.55;
    // label
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.white);
    doc.text(label, M, barY + 3.5);
    // bg track
    doc.setFillColor(...C.bgAlt);
    doc.roundedRect(M + 70, barY - 0.5, barW, 7, 2, 2, 'F');
    // fill
    if (ratio > 0) {
      doc.setFillColor(...color);
      doc.roundedRect(M + 70, barY - 0.5, barW * ratio, 7, 2, 2, 'F');
    }
    // pct label
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(pctLabel, M + 70 + barW + 5, barY + 3.5);
    doc.text(String(value), PW - M, barY + 3.5, { align: 'right' });
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ══════════════════════════════════════════════════════════════════════════
  fillBg();

  // Gradient header band (simulated with layered rects)
  for (let i = 0; i < 80; i++) {
    const ratio = i / 80;
    const r = Math.round(C.primary[0] * (1 - ratio) + C.indigo[0] * ratio);
    const g = Math.round(C.primary[1] * (1 - ratio) + C.indigo[1] * ratio);
    const b = Math.round(C.primary[2] * (1 - ratio) + C.indigo[2] * ratio);
    doc.setFillColor(r, g, b);
    doc.rect(0, i * (PH * 0.4 / 80), PW, PH * 0.4 / 80 + 0.5, 'F');
  }

  // Cover title
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text('REPORTE EJECUTIVO', PW / 2, 50, { align: 'center' });
  doc.setFontSize(20);
  doc.setFont('helvetica', 'normal');
  doc.text('Control de Flotas', PW / 2, 63, { align: 'center' });

  // Thin divider
  doc.setDrawColor(...C.white);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([3, 2], 0);
  doc.line(M + 20, 70, PW - M - 20, 70);
  doc.setLineDashPattern([], 0);

  // Tagline
  doc.setFontSize(10);
  doc.setTextColor(200, 240, 255);
  doc.text('Análisis de Tiempos, Movimientos y Seguridad Vial', PW / 2, 79, { align: 'center' });

  // Cover KPI summary strip
  const stripY = PH * 0.4 + 10;
  const boxW   = (CW) / 4;
  const boxH   = 32;
  const kpiData = [
    { label: 'Viajes',        value: allTrips.length,          unit: '',     color: C.primary  },
    { label: 'Vehículos',     value: Object.keys(vehMap).length, unit: '',  color: C.indigo   },
    { label: 'Conductores',   value: driverSet.size,            unit: '',    color: C.fuchsia  },
    { label: 'Puntualidad',   value: `${punctRate}%`,           unit: '',    color: C.emerald  },
  ];
  kpiData.forEach((k, i) => kpiBox(M + i * boxW + (i > 0 ? i * 2 : 0), stripY, boxW - 1, boxH, k.label, k.value, k.color, k.unit));

  // Date & generator
  doc.setFontSize(9.5);
  doc.setTextColor(...C.muted);
  doc.text(dateStr, PW / 2, stripY + boxH + 20, { align: 'center' });
  doc.setFontSize(8.5);
  doc.text('Generado automáticamente — Dashboard de Control de Flotas', PW / 2, stripY + boxH + 28, { align: 'center' });

  // Bottom brand bar
  doc.setFillColor(...C.primary);
  doc.rect(0, PH - 3, PW, 3, 'F');

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2 — RESUMEN EJECUTIVO + SEMÁFORO DE PUNTUALIDAD
  // ══════════════════════════════════════════════════════════════════════════
  addPage();
  pageFooter('Dashboard de Control de Flotas — Resumen Ejecutivo');

  sectionTitle('KPIs Clave del Período');

  // Big KPI grid — 2 rows × 4 cols
  const bigW  = CW / 4 - 2;
  const bigH  = 30;
  const row1  = [
    { label:'Total Viajes',     value: allTrips.length,              color: C.primary  },
    { label:'Km Recorridos',    value: totalDist.toFixed(0),         color: C.indigo,   unit:'km' },
    { label:'Vehículos',        value: Object.keys(vehMap).length,   color: C.fuchsia  },
    { label:'Conductores',      value: driverSet.size,               color: C.emerald  },
  ];
  const row2 = [
    { label:'Marcaciones',       value: totalPts.toLocaleString(),   color: C.primary  },
    { label:'A Tiempo',          value: tiempo.toLocaleString(),     color: C.emerald  },
    { label:'Con Retraso',       value: tarde.toLocaleString(),      color: C.rose     },
    { label:'Excesos Velocidad', value: totalExcesos,                color: C.amber    },
  ];
  row1.forEach((k, i) => kpiBox(M + i * (bigW + 2), y, bigW, bigH, k.label, k.value, k.color, k.unit || ''));
  y += bigH + 4;
  row2.forEach((k, i) => kpiBox(M + i * (bigW + 2), y, bigW, bigH, k.label, k.value, k.color, ''));
  y += bigH + 14;

  // ── Semáforo de Puntualidad ──────────────────────────────────────────────
  sectionTitle('Distribución de Puntualidad', C.emerald);

  const bars = [
    { label: 'A Tiempo (dentro de tolerancia)',  value: tiempo, color: C.emerald },
    { label: 'Antes de Tiempo',                  value: antes,  color: C.indigo  },
    { label: 'Con Retraso',                      value: tarde,  color: C.rose    },
  ];
  bars.forEach(b => {
    progressBar(b.label, b.value, totalPts, b.color, y);
    y += 13;
  });

  y += 6;

  // Effectivity call-out box
  doc.setFillColor(...C.bgPanel);
  doc.roundedRect(M, y, CW, 22, 3, 3, 'F');
  doc.setFillColor(...C.emerald);
  doc.roundedRect(M, y, 3, 22, 1, 1, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text('Efectividad Global de Puntualidad:', M + 10, y + 9);
  doc.setFontSize(18);
  doc.setTextColor(...C.emerald);
  doc.text(`${punctRate}%`, M + 10, y + 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  const rating = punctRate >= 90 ? 'EXCELENTE ✓' : punctRate >= 75 ? 'SATISFACTORIO' : punctRate >= 60 ? 'REQUIERE ATENCIÓN' : 'CRÍTICO — Acción Inmediata';
  const ratingColor = punctRate >= 90 ? C.emerald : punctRate >= 75 ? C.primary : punctRate >= 60 ? C.amber : C.rose;
  doc.setTextColor(...ratingColor);
  doc.text(`Nivel: ${rating}`, PW - M - 4, y + 13, { align: 'right' });
  y += 30;

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3 — RANKING DE VEHÍCULOS
  // ══════════════════════════════════════════════════════════════════════════
  addPage();
  pageFooter('Dashboard de Control de Flotas — Ranking de Vehículos');
  sectionTitle('Ranking de Desempeño por Vehículo');

  const vehTableRows = vehRows.map(([int, d], i) => {
    const efic  = d.totalPts > 0 ? pct(d.puntual, d.totalPts) : 0;
    const riesgo = d.retraso > 60 ? '⚠ Alto' : d.retraso > 20 ? '— Medio' : '✓ Bajo';
    return [
      `#${i + 1}`,
      int,
      String(d.viajes),
      `${d.dist.toFixed(0)} km`,
      `${d.puntual} / ${d.totalPts}`,
      `${efic}%`,
      `+${d.retraso.toFixed(0)} min`,
      riesgo,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Vehículo', 'Viajes', 'Distancia', 'Puntuales/Total', 'Efic.', 'Retraso Acum.', 'Riesgo']],
    body: vehTableRows,
    margin: { left: M, right: M },
    theme: 'plain',
    headStyles: {
      fillColor: C.bgAlt,
      textColor: C.primary,
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 4,
    },
    bodyStyles: {
      fillColor: C.bgPanel,
      textColor: C.white,
      fontSize: 8,
      cellPadding: 3.5,
    },
    alternateRowStyles: { fillColor: C.bgAlt },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center', textColor: C.muted },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'center', fontStyle: 'bold' },
      6: { halign: 'center', textColor: [245, 158, 11] },
      7: { halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 7) {
        const v = data.cell.raw;
        if (v.includes('Alto'))  data.cell.styles.textColor = C.rose;
        else if (v.includes('Medio')) data.cell.styles.textColor = C.amber;
        else data.cell.styles.textColor = C.emerald;
      }
      if (data.section === 'body' && data.column.index === 5) {
        const pctVal = parseInt(data.cell.raw);
        if (pctVal >= 80)       data.cell.styles.textColor = C.emerald;
        else if (pctVal >= 60)  data.cell.styles.textColor = C.amber;
        else                    data.cell.styles.textColor = C.rose;
      }
    },
  });

  y = doc.lastAutoTable.finalY + 15;

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 4 — ANÁLISIS DE RUTAS
  // ══════════════════════════════════════════════════════════════════════════
  addPage();
  pageFooter('Dashboard de Control de Flotas — Análisis de Rutas');
  sectionTitle('Análisis por Ruta (Top ' + Math.min(routeRows.length, 15) + ')');

  const routeTableRows = routeRows.slice(0, 15).map(([ruta, d], i) => {
    const rutaEfic = pct(d.puntual, d.totalPts);
    const avgDelay = d.viajes > 0 ? (d.retraso / d.viajes).toFixed(1) : '0';
    return [
      `#${i + 1}`,
      ruta.length > 30 ? ruta.slice(0, 28) + '…' : ruta,
      String(d.viajes),
      String(d.totalPts),
      `${rutaEfic}%`,
      `${avgDelay} min`,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['#', 'Ruta', 'Viajes', 'Marcaciones', 'Puntualidad', 'Retraso Promedio']],
    body: routeTableRows,
    margin: { left: M, right: M },
    theme: 'plain',
    headStyles: {
      fillColor: C.bgAlt,
      textColor: C.indigo,
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 4,
    },
    bodyStyles: {
      fillColor: C.bgPanel,
      textColor: C.white,
      fontSize: 8,
      cellPadding: 3.5,
    },
    alternateRowStyles: { fillColor: C.bgAlt },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center', textColor: C.muted },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center', fontStyle: 'bold' },
      5: { halign: 'center', textColor: C.amber },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const pctVal = parseInt(data.cell.raw);
        if (pctVal >= 80)       data.cell.styles.textColor = C.emerald;
        else if (pctVal >= 60)  data.cell.styles.textColor = C.amber;
        else                    data.cell.styles.textColor = C.rose;
      }
    },
  });

  y = doc.lastAutoTable.finalY + 15;

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 5 — SEGURIDAD VIAL (solo si hay telemetría)
  // ══════════════════════════════════════════════════════════════════════════
  if (telemetryData.length > 0) {
    addPage();
    pageFooter('Dashboard de Control de Flotas — Seguridad Vial');
    sectionTitle(`Infracciones de Velocidad (> ${SPEED_LIMIT_KMH} km/h)`, C.rose);

    // Summary strip
    const withExcesos = telemetryData.filter(v => v.excesos > 0);
    const safeVehs    = telemetryData.length - withExcesos.length;
    const maxSpeed    = Math.max(...telemetryData.flatMap(v => v.puntos.filter(p => p.esExceso).map(p => p.velocidad)), 0);

    const secKpis = [
      { label:'Vehículos con Excesos', value: withExcesos.length,         color: C.rose    },
      { label:'Vehículos Sin Excesos', value: safeVehs,                   color: C.emerald },
      { label:'Total Infracciones',    value: totalExcesos,               color: C.amber   },
      { label:'Vel. Máx. Registrada',  value: `${maxSpeed} km/h`,         color: C.fuchsia },
    ];
    const sKpiW = CW / 4 - 2;
    secKpis.forEach((k, i) => kpiBox(M + i * (sKpiW + 2), y, sKpiW, 28, k.label, k.value, k.color));
    y += 36;

    if (withExcesos.length > 0) {
      const speedRows = withExcesos
        .sort((a, b) => b.excesos - a.excesos)
        .map((v, i) => {
          const vMaxSpeed = Math.max(...v.puntos.filter(p => p.esExceso).map(p => p.velocidad), 0);
          const crit = v.excesos >= 10 ? '🔴 Crítico' : v.excesos >= 5 ? '🟡 Atención' : '🟢 Leve';
          return [
            `#${i + 1}`,
            v.interno,
            String(v.excesos),
            `${vMaxSpeed} km/h`,
            v.conductores.join(', ').slice(0, 35) || 'N/D',
            crit,
          ];
        });

      autoTable(doc, {
        startY: y,
        head: [['#', 'Vehículo', 'Excesos', 'Vel. Máx.', 'Conductor(es)', 'Severidad']],
        body: speedRows,
        margin: { left: M, right: M },
        theme: 'plain',
        headStyles: {
          fillColor: [40, 15, 20],
          textColor: C.rose,
          fontStyle: 'bold',
          fontSize: 8.5,
          cellPadding: 4,
        },
        bodyStyles: {
          fillColor: C.bgPanel,
          textColor: C.white,
          fontSize: 8,
          cellPadding: 3.5,
        },
        alternateRowStyles: { fillColor: [26, 15, 22] },
        columnStyles: {
          0: { cellWidth: 9,  halign: 'center', textColor: C.muted },
          2: { halign: 'center', fontStyle: 'bold', textColor: C.rose },
          3: { halign: 'center', textColor: C.amber },
          5: { halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 5) {
            const v = data.cell.raw;
            if (v.includes('Crítico'))   data.cell.styles.textColor = C.rose;
            else if (v.includes('Atención')) data.cell.styles.textColor = C.amber;
            else data.cell.styles.textColor = C.emerald;
          }
        },
      });
      y = doc.lastAutoTable.finalY + 15;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÚLTIMA PÁGINA — CONCLUSIONES EJECUTIVAS
  // ══════════════════════════════════════════════════════════════════════════
  addPage();
  pageFooter('Dashboard de Control de Flotas — Conclusiones');
  sectionTitle('Hallazgos y Recomendaciones Ejecutivas', C.fuchsia);

  const findings = [];

  // Puntualidad
  if (punctRate >= 90) {
    findings.push({ color: C.emerald, title: 'Desempeño de Puntualidad Sobresaliente', text: `La flota alcanzó una efectividad del ${punctRate}% de las marcaciones dentro del margen de tolerancia (±${PUNCTUALITY_TOLERANCE_MIN} min). Se recomienda mantener las prácticas operativas actuales y documentar las buenas prácticas para replicarlas.` });
  } else if (punctRate >= 70) {
    findings.push({ color: C.amber, title: 'Puntualidad en Nivel Mejorable', text: `Con un ${punctRate}% de efectividad, la operación tiene margen de mejora. Se sugiere identificar las rutas con mayor índice de retraso y revisar los tiempos de holgura asignados en el planning.` });
  } else {
    findings.push({ color: C.rose, title: 'Puntualidad Requiere Acción Inmediata', text: `El ${lateRate}% de las marcaciones presentaron retraso. Esto puede indicar problemas de tráfico, capacidad vehicular insuficiente, o planning de rutas inadecuado. Se recomienda revisión urgente de los itinerarios.` });
  }

  // Seguridad
  if (totalExcesos > 0) {
    const topSpeeder = telemetryData.sort((a, b) => b.excesos - a.excesos)[0];
    findings.push({ color: C.rose, title: 'Alertas de Seguridad Vial', text: `Se registraron ${totalExcesos} incidentes de exceso de velocidad (> ${SPEED_LIMIT_KMH} km/h). El vehículo ${topSpeeder?.interno || 'N/D'} concentra el mayor número de infracciones. Se requiere capacitación inmediata a los conductores involucrados y consideración de medidas disuasoras.` });
  } else if (telemetryData.length > 0) {
    findings.push({ color: C.emerald, title: 'Seguridad Vial Sin Incidentes', text: `No se registraron excesos de velocidad durante el período analizado. La flota cumple con el límite interno de ${SPEED_LIMIT_KMH} km/h. Se reconoce el buen comportamiento de los conductores.` });
  }

  // Vehículo más eficiente
  if (vehRows.length > 0) {
    const best = vehRows.sort((a, b) => pct(b[1].puntual, b[1].totalPts) - pct(a[1].puntual, a[1].totalPts))[0];
    const bestEfic = pct(best[1].puntual, best[1].totalPts);
    findings.push({ color: C.primary, title: 'Unidad de Mayor Rendimiento', text: `El vehículo ${best[0]} lidera el ranking de eficiencia con ${bestEfic}% de puntualidad en ${best[1].viajes} viajes realizados y ${best[1].dist.toFixed(0)} km recorridos. Esta unidad y su(s) conductor(es) son referentes positivos para la flota.` });
  }

  // Render findings
  findings.forEach(f => {
    if (y > PH - 50) addPage();
    // Box
    doc.setFillColor(...C.bgPanel);
    doc.roundedRect(M, y, CW, 36, 3, 3, 'F');
    doc.setFillColor(...f.color);
    doc.roundedRect(M, y, 3, 36, 1, 1, 'F');
    // Title
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...f.color);
    doc.text(f.title, M + 9, y + 9);
    // Body text (wrapped)
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    const lines = doc.splitTextToSize(f.text, CW - 14);
    doc.text(lines, M + 9, y + 17);
    y += 42;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES (page numbers)
  // ══════════════════════════════════════════════════════════════════════════
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.faint);
    doc.text(`Pág. ${i} / ${totalPages}`, PW - M, PH - 8, { align: 'right' });
    // Bottom accent line
    doc.setFillColor(...C.primary);
    doc.rect(0, PH - 1.5, PW, 1.5, 'F');
  }

  doc.save(fileName);
}
