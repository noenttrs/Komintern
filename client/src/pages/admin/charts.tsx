import { type ReactNode, useEffect, useRef, useState } from "react";

import { useI18n } from "../../i18n";

// Petits graphiques SVG du tableau de bord admin, sans dépendance. Règles suivies : barres fines
// (24 px max) arrondies côté valeur, 2 px d'écart entre segments, grille en filet discret, une
// seule échelle, légende dès deux séries, info-bulle au survol et tableau des valeurs.

/** Palette validée (contraste et daltonisme) sur le fond blanc du site. */
// Valeurs dans styles.css (--series-*, --chart-*), redéfinies pour le thème sombre.
export const SERIES = { blue: "var(--series-blue)", orange: "var(--series-orange)", gray: "var(--series-gray)" } as const;
const GRID = "var(--chart-grid)";
const AXIS = "var(--chart-axis)";
const MUTED = "var(--chart-muted)";

export type Series = { name: string; color: string };
export type Row = { key: string; label: string; values: number[]; tooltip?: string };

/** Largeur réelle du conteneur : le SVG est dessiné à la taille affichée (texte net, pas étiré). */
function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  // 0 tant que le conteneur n'est pas mesuré : un SVG de largeur fixe l'élargirait avant la mesure.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const update = () => setWidth(Math.max(0, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Pas « rond » pour l'axe : 1, 2, 5 × 10^n. */
function niceMax(value: number): { max: number; step: number } {
  if (value <= 0) return { max: 1, step: 1 };
  const raw = value / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= raw) ?? power * 10;
  return { max: Math.ceil(value / step) * step, step };
}

/** Barre arrondie (4 px) côté valeur, carrée côté ligne de base. */
function barPath(x: number, y: number, width: number, height: number, rounded: boolean): string {
  if (height <= 0) return "";
  const r = rounded ? Math.min(4, width / 2, height) : 0;
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

export function Legend({ series }: { series: Series[] }): JSX.Element | null {
  if (series.length < 2) return null;
  return (
    <ul className="chart-legend">
      {series.map((entry) => (
        <li key={entry.name}>
          <span className="chart-legend__swatch" style={{ background: entry.color }} aria-hidden="true" />
          {entry.name}
        </li>
      ))}
    </ul>
  );
}

export function ChartFrame({ title, subtitle, children, table }: { title: string; subtitle?: string; children: ReactNode; table?: ReactNode }): JSX.Element {
  const { t } = useI18n();
  return (
    <figure className="chart">
      <figcaption>
        <h3>{title}</h3>
        {subtitle !== undefined ? <p className="chart__subtitle">{subtitle}</p> : null}
      </figcaption>
      {children}
      {table !== undefined ? (
        <details className="chart__table">
          <summary>{t("insights.showValues")}</summary>
          {table}
        </details>
      ) : null}
    </figure>
  );
}

/**
 * Colonnes (empilées si plusieurs séries). `reference` trace un repère horizontal (ex. 50 %).
 * `format` met en forme les valeurs de l'axe et des info-bulles.
 */
export function ColumnChart({
  rows,
  series,
  format = (value) => String(value),
  reference,
  fixedMax,
  labelEvery = 1,
  height = 200,
}: {
  rows: Row[];
  series: Series[];
  format?: (value: number) => string;
  reference?: { value: number; label: string };
  fixedMax?: number;
  labelEvery?: number;
  height?: number;
}): JSX.Element {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 12, right: 8, bottom: 26, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const totals = rows.map((row) => row.values.reduce((sum, value) => sum + value, 0));
  const { max, step } = fixedMax !== undefined ? { max: fixedMax, step: fixedMax / 4 } : niceMax(Math.max(0, ...totals));
  const band = rows.length === 0 ? plotWidth : plotWidth / rows.length;
  const barWidth = Math.max(2, Math.min(24, band * 0.6));
  const y = (value: number) => margin.top + plotHeight - (value / max) * plotHeight;
  const ticks: number[] = [];
  for (let tick = 0; tick <= max + 1e-9; tick += step) ticks.push(tick);
  const hovered = hover === null ? null : rows[hover];

  const last = rows.length - 1;
  // Étiquettes de l'axe : une sur `labelEvery`, plus la dernière (sans chevaucher la précédente).
  const labelled = (index: number) => index === last || (index % labelEvery === 0 && last - index >= Math.max(1, labelEvery / 2));
  // Le repère est légendé hors du tracé : un texte dans le graphique finirait sous une barre.
  const referenceKey =
    reference !== undefined ? (
      <p className="chart-reference">
        <span className="chart-reference__line" aria-hidden="true" /> {reference.label} ({format(reference.value)})
      </p>
    ) : null;
  if (width === 0) return <div className="chart__plot" ref={ref} style={{ height }} />;
  return (
    <div className="chart__plot" ref={ref}>
      {referenceKey}
      <svg width={width} height={height} role="img" aria-label={series.map((entry) => entry.name).join(", ")} onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} style={{ stroke: tick === 0 ? AXIS : GRID }} strokeWidth={1} />
            <text x={margin.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="chart__tick">{format(tick)}</text>
          </g>
        ))}
        {reference !== undefined ? <line x1={margin.left} x2={width - margin.right} y1={y(reference.value)} y2={y(reference.value)} style={{ stroke: MUTED }} strokeWidth={1} /> : null}
        {rows.map((row, index) => {
          const x = margin.left + index * band + (band - barWidth) / 2;
          let base = 0;
          const lastVisible = row.values.reduce((last, value, position) => (value > 0 ? position : last), -1);
          return (
            <g key={row.key}>
              {row.values.map((value, position) => {
                if (value <= 0) return null;
                const top = y(base + value);
                // 2 px de fond entre deux segments empilés.
                const bottom = y(base) - (base > 0 ? 2 : 0);
                base += value;
                return <path key={position} d={barPath(x, top, barWidth, Math.max(0, bottom - top), position === lastVisible)} style={{ fill: series[position]?.color ?? SERIES.blue }} opacity={hover === null || hover === index ? 1 : 0.45} />;
              })}
              {labelled(index) ? (
                <text x={margin.left + index * band + band / 2} y={height - 8} textAnchor="middle" className="chart__tick">{row.label}</text>
              ) : null}
              {/* Zone de survol : toute la colonne, plus large que la barre. */}
              <rect x={margin.left + index * band} y={margin.top} width={band} height={plotHeight} fill="transparent" onMouseEnter={() => setHover(index)} onClick={() => setHover(index)} />
            </g>
          );
        })}
      </svg>
      {hovered !== null && hovered !== undefined && hover !== null ? (
        <div className="chart__tooltip" style={{ left: Math.min(width - 160, Math.max(0, margin.left + hover * band + band / 2 - 80)) }} role="status">
          <strong>{hovered.label}</strong>
          {hovered.tooltip !== undefined ? <span>{hovered.tooltip}</span> : null}
          {series.map((entry, position) => (
            <span key={entry.name}>
              <span className="chart-legend__swatch" style={{ background: entry.color }} aria-hidden="true" /> {entry.name} : {format(hovered.values[position] ?? 0)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Tableau des valeurs d'un graphique (accessibilité, lecture exacte). */
export function ValuesTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }): JSX.Element {
  return (
    <div className="table-scroll">
      <table className="rules-table">
        <thead>
          <tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, position) => <td key={position}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Barre horizontale « partie d'un tout » (réponses au bouton Rejouer). */
export function ShareBar({ parts }: { parts: Array<{ name: string; value: number; color: string }> }): JSX.Element {
  const { t } = useI18n();
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total === 0) return <p className="chart__subtitle">{t("insights.noData")}</p>;
  return (
    <div>
      <div className="share-bar" role="img" aria-label={parts.map((part) => `${part.name} ${part.value}`).join(", ")}>
        {parts.map((part) =>
          part.value > 0 ? (
            <span key={part.name} className="share-bar__part" style={{ flexGrow: part.value, background: part.color }} title={`${part.name} : ${part.value} (${Math.round((part.value / total) * 100)} %)`} />
          ) : null,
        )}
      </div>
      <ul className="chart-legend">
        {parts.map((part) => (
          <li key={part.name}>
            <span className="chart-legend__swatch" style={{ background: part.color }} aria-hidden="true" />
            {part.name} · {part.value} ({Math.round((part.value / total) * 100)} %)
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rampe séquentielle bleue (clair → foncé) pour la carte de chaleur de la rétention. */
const RAMP = ["var(--chart-grid)", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];

export function heatColor(share: number): { background: string; color: string } {
  const index = share <= 0 ? 0 : Math.min(RAMP.length - 1, 1 + Math.floor(share * (RAMP.length - 1)));
  return { background: RAMP[index] as string, color: index === 0 ? "var(--ink)" : index >= 4 ? "#ffffff" : "#0b0b0b" };
}
