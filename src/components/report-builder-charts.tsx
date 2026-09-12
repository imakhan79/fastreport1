"use client";

export type ChartDatum = { label: string; value: number };

const PALETTE = ["#2563eb", "#ea580c", "#16a34a", "#9333ea", "#db2777", "#0891b2", "#ca8a04", "#dc2626"];

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function chartSummary(data: ChartDatum[]): string {
  return data.map((d) => `${d.label}: ${formatNumber(d.value)}`).join(", ");
}

export function BarChartSVG({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) return <EmptyChart />;
  const width = 640;
  const height = 320;
  const padding = { top: 16, right: 16, bottom: 56, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => d.value), 0);
  const barGap = 12;
  const barW = Math.max(6, plotW / data.length - barGap);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label={`Bar chart. ${chartSummary(data)}`}>
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="var(--color-border)"
      />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="var(--color-border)"
      />
      {data.map((d, i) => {
        const barH = max > 0 ? (d.value / max) * plotH : 0;
        const x = padding.left + i * (barW + barGap) + barGap / 2;
        const y = height - padding.bottom - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={PALETTE[i % PALETTE.length]} />
            <text
              x={x + barW / 2}
              y={height - padding.bottom + 16}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-muted-foreground)"
            >
              {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
            </text>
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="var(--color-foreground)">
              {formatNumber(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChartSVG({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) return <EmptyChart />;
  const width = 640;
  const height = 320;
  const padding = { top: 16, right: 16, bottom: 56, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => d.value), 0);
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = height - padding.bottom - (max > 0 ? (d.value / max) * plotH : 0);
    return { x, y, d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label={`Line chart. ${chartSummary(data)}`}>
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={height - padding.bottom}
        stroke="var(--color-border)"
      />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="var(--color-border)"
      />
      <path d={path} fill="none" stroke={PALETTE[0]} strokeWidth={2} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={PALETTE[0]} />
          <text x={p.x} y={height - padding.bottom + 16} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">
            {p.d.label.length > 10 ? `${p.d.label.slice(0, 9)}…` : p.d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function PieChartSVG({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) return <EmptyChart />;
  const size = 280;
  const r = 110;
  const cx = size / 2;
  const cy = size / 2;
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);

  const slices = data.reduce<{ path: string; color: string; d: ChartDatum; fraction: number; endAngle: number }[]>(
    (acc, d, i) => {
      const startAngle = acc.length > 0 ? acc[acc.length - 1].endAngle : -Math.PI / 2;
      const fraction = total > 0 ? Math.max(0, d.value) / total : 0;
      const endAngle = startAngle + fraction * Math.PI * 2;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      acc.push({ path, color: PALETTE[i % PALETTE.length], d, fraction, endAngle });
      return acc;
    },
    []
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-56 w-56 shrink-0"
        role="img"
        aria-label={`Pie chart. ${chartSummary(data)}`}
      >
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="var(--color-card)" strokeWidth={1} />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5 text-xs">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-foreground">{s.d.label}</span>
            <span className="text-muted-foreground">
              {formatNumber(s.d.value)} ({Math.round(s.fraction * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data to chart.</div>;
}
