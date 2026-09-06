const COLORS = ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04", "#db2777"];

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export type ChartPoint = { label: string; value: number };

/** Draws within [x, y, width, height] using absolute coordinates only - never touches doc's text cursor. */
export function drawBarChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  points: ChartPoint[]
): void {
  if (points.length === 0) return;
  const labelHeight = 22;
  const valueHeight = 10;
  const chartHeight = height - labelHeight - valueHeight;
  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const gap = 6;
  const barWidth = Math.max(4, (width - gap * (points.length - 1)) / points.length);

  doc.save();
  points.forEach((p, i) => {
    const barHeight = maxValue > 0 ? Math.max(0, (p.value / maxValue) * chartHeight) : 0;
    const barX = x + i * (barWidth + gap);
    const barY = y + valueHeight + (chartHeight - barHeight);
    doc.rect(barX, barY, barWidth, Math.max(barHeight, 1)).fill(COLORS[i % COLORS.length]);
    doc
      .fillColor("#334155")
      .fontSize(6.5)
      .text(formatShort(p.value), barX - 3, y + valueHeight + (chartHeight - barHeight) - 9, {
        width: barWidth + 6,
        align: "center",
      })
      .text(truncate(p.label, 10), barX - 3, y + valueHeight + chartHeight + 3, {
        width: barWidth + 6,
        align: "center",
      });
  });
  doc.restore();
  doc.fillColor("#000000");
}

export function drawLineChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  points: ChartPoint[]
): void {
  if (points.length === 0) return;
  const labelHeight = 14;
  const chartHeight = height - labelHeight;
  const values = points.map((p) => p.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: x + i * stepX,
    y: y + chartHeight - ((p.value - minValue) / range) * chartHeight,
  }));

  doc.save();
  doc.strokeColor(COLORS[0]).lineWidth(1.5);
  doc.moveTo(coords[0].x, coords[0].y);
  for (const c of coords.slice(1)) doc.lineTo(c.x, c.y);
  doc.stroke();

  coords.forEach((c, i) => {
    doc.circle(c.x, c.y, 2).fill(COLORS[0]);
    doc
      .fillColor("#334155")
      .fontSize(6)
      .text(truncate(points[i].label, 8), c.x - 15, y + chartHeight + 3, { width: 30, align: "center" });
  });
  doc.restore();
  doc.fillColor("#000000");
}

export function drawPieChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  points: ChartPoint[]
): void {
  if (points.length === 0) return;
  const total = points.reduce((s, p) => s + p.value, 0) || 1;
  const radius = Math.min(height, width * 0.45) / 2;
  const cx = x + radius + 4;
  const cy = y + height / 2;

  doc.save();
  let angle = -Math.PI / 2;
  points.forEach((p, i) => {
    const slice = (p.value / total) * Math.PI * 2;
    const endAngle = angle + slice;
    const x1 = cx + radius * Math.cos(angle);
    const y1 = cy + radius * Math.sin(angle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const largeArc = slice > Math.PI ? 1 : 0;
    doc
      .path(`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`)
      .fill(COLORS[i % COLORS.length]);
    angle = endAngle;
  });
  doc.restore();

  const legendX = cx + radius + 16;
  let legendY = y + 2;
  const swatch = 7;
  doc.fontSize(7);
  for (const [i, p] of points.slice(0, 8).entries()) {
    if (legendY > y + height - swatch) break;
    doc.rect(legendX, legendY, swatch, swatch).fill(COLORS[i % COLORS.length]);
    doc
      .fillColor("#334155")
      .text(
        `${truncate(p.label, 18)} (${Math.round((p.value / total) * 100)}%)`,
        legendX + swatch + 4,
        legendY - 1,
        { width: width - (legendX - x) - swatch - 4 }
      );
    legendY += swatch + 4;
  }
  doc.fillColor("#000000");
}
