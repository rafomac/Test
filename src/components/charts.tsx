"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis, ComposedChart,
} from "recharts";
import { formatCompact, formatINR, formatPct, formatNum, type NumberFormat } from "@/lib/format";

export const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)", "var(--c9)"];
export type YFmt = "inr" | "pct" | "num" | "x";

function f(kind: YFmt, nf: NumberFormat, compact = true) {
  return (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return "—";
    if (kind === "pct") return formatPct(n, 1);
    if (kind === "x") return n.toFixed(2) + "×";
    if (kind === "num") return formatNum(n, 2, nf);
    return compact ? formatCompact(n, nf).replace(/\.0+(?=\s?[A-Z])/, "").replace(/(\.\d)0(?=\s?[A-Z])/, "$1") : formatINR(n, { fmt: nf });
  };
}

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />;
const tip = (kind: YFmt, nf: NumberFormat) => (
  <Tooltip
    contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" }}
    labelStyle={{ color: "var(--muted)" }}
    formatter={(v) => f(kind, nf, false)(v)}
  />
);

export interface SeriesDef { key: string; name: string; color?: string; dash?: boolean; area?: boolean; bar?: boolean; stack?: string; yAxis?: "left" | "right" }

export function LineSeries({ data, xKey, lines, y = "inr", nf = "indian", height = 260, refY, rightY }: { data: object[]; xKey: string; lines: SeriesDef[]; y?: YFmt; nf?: NumberFormat; height?: number; refY?: number; rightY?: YFmt }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey={xKey} {...axis} minTickGap={40} />
          <YAxis yAxisId="left" {...axis} tickFormatter={f(y, nf)} width={72} />
          {rightY && <YAxis yAxisId="right" orientation="right" {...axis} tickFormatter={f(rightY, nf)} width={56} />}
          {tip(y, nf)}
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {refY !== undefined && <ReferenceLine yAxisId="left" y={refY} stroke="var(--muted)" />}
          {lines.map((l, i) =>
            l.bar ? <Bar key={l.key} yAxisId={l.yAxis ?? "left"} dataKey={l.key} name={l.name} fill={l.color ?? PALETTE[i % 9]} stackId={l.stack} isAnimationActive={false} /> :
            l.area ? <Area key={l.key} yAxisId={l.yAxis ?? "left"} type="monotone" dataKey={l.key} name={l.name} stroke={l.color ?? PALETTE[i % 9]} fill={l.color ?? PALETTE[i % 9]} fillOpacity={0.12} strokeWidth={1.6} dot={false} connectNulls={false} isAnimationActive={false} /> :
            <Line key={l.key} yAxisId={l.yAxis ?? "left"} type="monotone" dataKey={l.key} name={l.name} stroke={l.color ?? PALETTE[i % 9]} strokeDasharray={l.dash ? "5 4" : undefined} strokeWidth={1.8} dot={false} connectNulls={false} isAnimationActive={false} />,
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, xKey, bars, y = "inr", nf = "indian", height = 260, signColor, horizontal, refY }: { data: object[]; xKey: string; bars: SeriesDef[]; y?: YFmt; nf?: NumberFormat; height?: number; signColor?: boolean; horizontal?: boolean; refY?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 5, right: 10, bottom: 0, left: horizontal ? 10 : 0 }}>
          {grid}
          {horizontal ? <><XAxis type="number" {...axis} tickFormatter={f(y, nf)} /><YAxis type="category" dataKey={xKey} {...axis} width={120} interval={0} /></> : <><XAxis dataKey={xKey} {...axis} minTickGap={20} /><YAxis {...axis} tickFormatter={f(y, nf)} width={72} /></>}
          {tip(y, nf)}
          {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {refY !== undefined && <ReferenceLine y={refY} stroke="var(--muted)" strokeDasharray="4 4" />}
          {bars.map((b, i) => (
            <Bar key={b.key} dataKey={b.key} name={b.name} stackId={b.stack} fill={b.color ?? PALETTE[i % 9]} radius={b.stack ? 0 : 3} isAnimationActive={false}>
              {signColor && data.map((d, j) => <Cell key={j} fill={Number((d as Record<string, unknown>)[b.key]) >= 0 ? "var(--pos)" : "var(--neg)"} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, nf = "indian", height = 240, y = "inr" }: { data: { name: string; value: number }[]; nf?: NumberFormat; height?: number; y?: YFmt }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="var(--panel)" isAnimationActive={false}>
            {data.filter((d) => d.value > 0).map((_, i) => <Cell key={i} fill={PALETTE[i % 9]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => `${f(y, nf, false)(v)} (${formatPct(Number(v) / (total || 1), 1)})`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function TreeCell(props: { x?: number; y?: number; width?: number; height?: number; name?: string; index?: number; value?: number; total?: number }) {
  const { x = 0, y = 0, width = 0, height = 0, name, index = 0, value = 0, total = 1 } = props;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={PALETTE[index % 9]} fillOpacity={0.85} stroke="var(--panel)" strokeWidth={2} />
      {width > 60 && height > 28 && <text x={x + 6} y={y + 16} fill="#fff" fontSize={11} fontWeight={600}>{name}</text>}
      {width > 60 && height > 42 && <text x={x + 6} y={y + 31} fill="#fff" fontSize={10}>{((value / total) * 100).toFixed(1)}%</text>}
    </g>
  );
}

export function TreemapChart({ data, height = 280 }: { data: { name: string; value: number }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <Treemap data={data.filter((d) => d.value > 0).map((d) => ({ ...d, total }))} dataKey="value" nameKey="name" isAnimationActive={false} content={<TreeCell total={total} />} />
      </ResponsiveContainer>
    </div>
  );
}

export function Spark({ data, height = 40 }: { data: { v: number | null }[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={data}><Area dataKey="v" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.15} dot={false} isAnimationActive={false} /></AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export { LineChart };
