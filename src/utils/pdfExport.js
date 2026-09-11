import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SPEED_LIMIT_KMH, PUNCTUALITY_TOLERANCE_MIN } from '../constants/index.js';

export function generateReport(allTrips, telemetryData = []) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 0;

  // === COLORS ===
  const primary = [6, 182, 212];    // cyan-400
  const dark = [11, 10, 21];        // bg
  const white = [255, 255, 255];
  const muted = [148, 163, 184];     // slate-400
  const accent = [244, 63, 94];      // rose-500

  // === HELPERS ===
  const addPage = () => {
    doc.addPage();
    // Dark background
    doc.setFillColor(...dark);
    doc.rect(0, 0, pageW, pageH, 'F');
    y = margin;
  };

  const addSectionTitle = (title) => {
    if (y > pageH - 40) addPage();
    doc.setFontSize(16);
    doc.setTextColor(...primary);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, y);
    y += 4;
    doc.setDrawColor(...primary);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentW, y);
    y += 10;
  };

  // ========================
  // PAGE 1: COVER
  // ========================
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Decorative bar
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 4, 'F');

  // Title
  doc.setFontSize(32);
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.text('Dashboard de', pageW / 2, 80, { align: 'center' });
  doc.text('Control de Flotas', pageW / 2, 95, { align: 'center' });

  // Subtitle
  doc.setFontSize(14);
  doc.setTextColor(...muted);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte Ejecutivo de Operaciones', pageW / 2, 115, { align: 'center' });

  // Date
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  doc.setFontSize(11);
  doc.setTextColor(...primary);
  doc.text(dateStr.charAt(0).toUpperCase() + dateStr.slice(1), pageW / 2, 135, { align: 'center' });

  // Decorative bottom bar
  doc.setFillColor(...primary);
  doc.rect(0, pageH - 4, pageW, 4, 'F');

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text('Generado automáticamente por Dashboard de Control de Flotas', pageW / 2, pageH - 12, { align: 'center' });

  // ========================
  // PAGE 2: KPIs
  // ========================
  addPage();

  // Compute stats
  let totalDist = 0;
  let vehiculosSet = new Set();
  let conductoresSet = new Set();
  let antes = 0, tiempo = 0, tarde = 0;
  let totalExcesos = 0;

  allTrips.forEach(t => {
    totalDist += (t.totalDistancia || 0);
    vehiculosSet.add(t.interno || 'N/A');
    (t.puntos || []).forEach(p => {
      if (p.conductor) conductoresSet.add(p.conductor);
      if (p.diferencia < -PUNCTUALITY_TOLERANCE_MIN) antes++;
      else if (p.diferencia > PUNCTUALITY_TOLERANCE_MIN) tarde++;
      else tiempo++;
    });
  });

  telemetryData.forEach(v => {
    totalExcesos += v.excesos || 0;
  });

  const effectivity = (antes + tiempo + tarde) > 0
    ? Math.round((antes + tiempo) / (antes + tiempo + tarde) * 100)
    : 0;

  addSectionTitle('Resumen Ejecutivo');

  const kpis = [
    ['Viajes Registrados', String(allTrips.length)],
    ['Distancia Total', `${totalDist.toFixed(1)} km`],
    ['Vehículos Diferentes', String(vehiculosSet.size)],
    ['Conductores', String(conductoresSet.size)],
    ['Efectividad Puntualidad', `${effectivity}%`],
    ['Marcaciones Antes de Tiempo', String(antes)],
    ['Marcaciones A Tiempo', String(tiempo)],
    ['Marcaciones con Retraso', String(tarde)],
    ['Total Excesos de Velocidad (GPS)', String(totalExcesos)],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Indicador', 'Valor']],
    body: kpis,
    margin: { left: margin, right: margin },
    theme: 'plain',
    headStyles: {
      fillColor: [20, 25, 45],
      textColor: primary,
      fontStyle: 'bold',
      fontSize: 11,
      cellPadding: 5,
    },
    bodyStyles: {
      fillColor: [15, 18, 35],
      textColor: white,
      fontSize: 10,
      cellPadding: 5,
    },
    alternateRowStyles: {
      fillColor: [20, 25, 50],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: contentW * 0.6 },
      1: { halign: 'right', cellWidth: contentW * 0.4 },
    },
  });

  y = doc.lastAutoTable.finalY + 15;

  // ========================
  // PAGE 3: TOP VEHICLES TABLE
  // ========================
  addSectionTitle('Detalle por Vehículo');

  const vehMap = {};
  allTrips.forEach(t => {
    const int = t.interno || 'N/A';
    if (!vehMap[int]) vehMap[int] = { viajes: 0, retraso: 0, adelanto: 0, distancia: 0 };
    vehMap[int].viajes++;
    const net = t.totalDiferencia || 0;
    if (net > 0) vehMap[int].retraso += net;
    else vehMap[int].adelanto += Math.abs(net);
    vehMap[int].distancia += (t.totalDistancia || 0);
  });

  const vehRows = Object.entries(vehMap)
    .sort((a, b) => b[1].viajes - a[1].viajes)
    .map(([int, data]) => [
      int,
      String(data.viajes),
      `${data.distancia.toFixed(1)} km`,
      `+${data.retraso.toFixed(0)} min`,
      `-${data.adelanto.toFixed(0)} min`,
    ]);

  autoTable(doc, {
    startY: y,
    head: [['Vehículo', 'Viajes', 'Distancia', 'Retraso Acum.', 'Adelanto Acum.']],
    body: vehRows,
    margin: { left: margin, right: margin },
    theme: 'plain',
    headStyles: {
      fillColor: [20, 25, 45],
      textColor: primary,
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4,
    },
    bodyStyles: {
      fillColor: [15, 18, 35],
      textColor: white,
      fontSize: 9,
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: [20, 25, 50],
    },
  });

  y = doc.lastAutoTable.finalY + 15;

  // ========================
  // SPEED INFRACTIONS TABLE (if telemetry exists)
  // ========================
  if (telemetryData.length > 0) {
    if (y > pageH - 60) addPage();
    addSectionTitle(`Infracciones de Velocidad (> ${SPEED_LIMIT_KMH} km/h)`);

    const speedRows = telemetryData
      .filter(v => v.excesos > 0)
      .sort((a, b) => b.excesos - a.excesos)
      .map(v => {
        const maxSpeed = Math.max(...v.puntos.filter(p => p.esExceso).map(p => p.velocidad), 0);
        return [
          v.interno,
          String(v.excesos),
          `${maxSpeed} km/h`,
          v.conductores.join(', ')
        ];
      });

    if (speedRows.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Vehículo', 'Excesos', 'Vel. Máxima', 'Conductor(es)']],
        body: speedRows,
        margin: { left: margin, right: margin },
        theme: 'plain',
        headStyles: {
          fillColor: [40, 15, 20],
          textColor: [244, 63, 94],
          fontStyle: 'bold',
          fontSize: 10,
          cellPadding: 4,
        },
        bodyStyles: {
          fillColor: [15, 18, 35],
          textColor: white,
          fontSize: 9,
          cellPadding: 4,
        },
        alternateRowStyles: {
          fillColor: [25, 15, 25],
        },
      });
    }
  }

  // ========================
  // FOOTER on all pages
  // ========================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    if (i > 1) {
      doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
      doc.text('Dashboard de Control de Flotas — Reporte Ejecutivo', margin, pageH - 8);
    }
  }

  // Save
  const fileName = `Reporte_Flotas_${now.toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
