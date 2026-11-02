import { useState } from 'react';
import { formatDateLong, formatHours } from '../utils/format';

// Single-series bar chart: hours worked per day, this month.
// Outlined bars, hairline baseline, sparse axis labels, per-bar tooltip
// (hover on desktop, tap on phones).
export default function MonthlyHoursChart({ days, todayDate }) {
  const [hovered, setHovered] = useState(null);

  const width = 720;
  const height = 200;
  const padLeft = 58;
  const padBottom = 34;
  const padTop = 22;
  const innerW = width - padLeft - 8;
  const innerH = height - padBottom - padTop;

  const maxHours = Math.max(8, ...days.map((d) => d.hours), 1);
  const yMax = Math.ceil(maxHours / 2) * 2;
  const ticks = [0, yMax / 2, yMax];

  const n = days.length || 1;
  const slot = innerW / n;
  const barW = Math.min(22, slot * 0.6);
  const gap = slot - barW;

  const xFor = (i) => padLeft + i * slot + gap / 2;
  const yFor = (h) => padTop + innerH - (h / yMax) * innerH;
  // The rendered bar top: same as yFor(h), except tiny nonzero values are
  // clamped to a minimum visible height, anchored to the baseline (grows upward).
  const barTopFor = (h) => (h > 0 ? yFor(0) - Math.max((h / yMax) * innerH, 3) : yFor(0));

  const labelEvery = n > 20 ? 5 : n > 10 ? 3 : 1;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="ساعات العمل لكل يوم في هذا الشهر">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padLeft} x2={width - 8} y1={yFor(t)} y2={yFor(t)} className="chart-gridline" />
            <text x={padLeft - 10} y={yFor(t) + 7} textAnchor="end" className="chart-axis-label">
              {t} س
            </text>
          </g>
        ))}
        <line x1={padLeft} x2={width - 8} y1={yFor(0)} y2={yFor(0)} className="chart-baseline" />

        {days.map((d, i) => {
          const h = Math.max(d.hours, 0);
          const barY = barTopFor(h);
          const barH = yFor(0) - barY;
          const isToday = d.date === todayDate;
          const isHovered = hovered === i;
          return (
            <g key={d.date}>
              <rect
                x={xFor(i)}
                y={barY}
                width={barW}
                height={barH}
                rx={3}
                className={`chart-bar ${isHovered ? 'chart-bar-hover' : ''}`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((v) => (v === i ? null : v))}
                onClick={() => setHovered((v) => (v === i ? null : i))}
              />
              {isToday && <circle cx={xFor(i) + barW / 2} cy={barY - 8} r={3.5} className="chart-today-dot" />}
              {i % labelEvery === 0 && (
                <text x={xFor(i) + barW / 2} y={height - 6} textAnchor="middle" className="chart-axis-label">
                  {Number(d.date.slice(-2))}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered !== null && days[hovered] && (
        <div
          className="chart-tooltip"
          style={{
            left: `${((xFor(hovered) + barW / 2) / width) * 100}%`,
            top: `${(barTopFor(days[hovered].hours) / height) * 100}%`,
          }}
        >
          <strong>{formatHours(days[hovered].hours.toFixed(2))}</strong>
          <span>{formatDateLong(days[hovered].date)}</span>
        </div>
      )}
    </div>
  );
}
