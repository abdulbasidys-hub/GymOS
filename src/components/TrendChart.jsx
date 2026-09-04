import { useState } from "react";
import { formatDate } from "../lib/helpers";

// A small hand-rolled daily line/trend chart — no charting library, this app
// has none. `data` is exactly what logic/timeseries.js's dailyBuckets()
// returns: [{ date, value }, ...], oldest first.
//
// The SVG holds only geometric shapes (line + area + dots + baseline) —
// never text. With preserveAspectRatio="none" the chart stretches to fill
// any container width, and non-uniform scaling would visibly distort SVG
// <text>, so day labels and the hover tooltip are ordinary HTML/CSS
// instead, positioned by percentage. That keeps the chart responsive
// without any resize-observer machinery.
const VB_W = 700;
const VB_H = 160;
const TOP_PAD = 14;
const BOTTOM_PAD = 10;
const PLOT_H = VB_H - TOP_PAD - BOTTOM_PAD;
const BASELINE_Y = VB_H - BOTTOM_PAD;

function shortLabel(date) {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export default function TrendChart({ data, valueLabel, formatValue = String, color = "var(--text-secondary)" }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const n = data.length;
  const maxValue = Math.max(...data.map((d) => d.value), 0);
  const isEmpty = maxValue === 0;
  const slotWidth = VB_W / n;
  const gradientId = `trend-fill-${valueLabel.replace(/[^a-z0-9]/gi, "")}`;

  const points = data.map((d, i) => {
    const x = n > 1 ? (i / (n - 1)) * VB_W : VB_W / 2;
    const h = maxValue > 0 ? (d.value / maxValue) * PLOT_H : 0;
    return { x, y: BASELINE_Y - h };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[n - 1].x.toFixed(2)} ${BASELINE_Y} L ${points[0].x.toFixed(2)} ${BASELINE_Y} Z`
      : "";

  function hoverOff(i) {
    setHoverIdx((cur) => (cur === i ? null : cur));
  }

  return (
    <div className="trend-chart">
      <h2>
        {valueLabel} — last {n} days
      </h2>

      <div className="trend-chart__plot">
        <div className="trend-chart__yaxis">
          <span>{formatValue(maxValue)}</span>
          <span>{formatValue(maxValue / 2)}</span>
          <span>{formatValue(0)}</span>
        </div>

        <div className="trend-chart__graph-col">
          <div className="trend-chart__graph">
            <svg
              className="trend-chart__svg"
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${valueLabel} over the last ${n} days`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>

              <line x1="0" y1={BASELINE_Y} x2={VB_W} y2={BASELINE_Y} className="trend-chart__baseline" />

              {!isEmpty && <path d={areaPath} fill={`url(#${gradientId})`} />}
              {!isEmpty && (
                <path
                  d={linePath}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="trend-chart__line"
                />
              )}

              {points.map((p, i) => (
                <g
                  key={i}
                  tabIndex={0}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => hoverOff(i)}
                  onFocus={() => setHoverIdx(i)}
                  onBlur={() => hoverOff(i)}
                >
                  {/* Full-height, invisible — keeps every point hoverable/focusable
                      even where the line sits flat at the baseline. */}
                  <rect x={i * slotWidth} y={TOP_PAD} width={slotWidth} height={PLOT_H} fill="transparent" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hoverIdx === i ? 4.5 : 3}
                    fill={hoverIdx === i ? color : "var(--surface)"}
                    stroke={color}
                    strokeWidth="2"
                    className="trend-chart__dot"
                  >
                    <title>
                      {formatDate(data[i].date)}: {formatValue(data[i].value)}
                    </title>
                  </circle>
                </g>
              ))}
            </svg>

            {hoverIdx != null && (
              <div
                className="trend-chart__tooltip"
                style={{ left: `${(points[hoverIdx].x / VB_W) * 100}%` }}
              >
                {formatDate(data[hoverIdx].date)}: <strong>{formatValue(data[hoverIdx].value)}</strong>
              </div>
            )}

            {isEmpty && <div className="trend-chart__empty">No {valueLabel.toLowerCase()} in this period.</div>}
          </div>

          <div className="trend-chart__labels">
            {data.map((d, i) => (
              <span key={i} className="trend-chart__label">
                {i === 0 || i === n - 1 || i % 2 === 0 ? shortLabel(d.date) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
