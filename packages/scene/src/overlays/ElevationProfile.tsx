import type { ElevationProfile, ElevationReading } from '@travel-route-animator/core';
import { useId, useMemo, type CSSProperties, type FC } from 'react';

// The height profile of the profile track (ADR 0012): the whole route as an area, the part
// already walked in full colour, a point where the vehicle is. Everything comes from the
// frame's reading, nothing is animated by the browser.

const metres = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });

/** The chart is drawn from at most this many points; a pixel would not show more. */
const MAX_POINTS = 400;
/** A flat route would turn every metre into a mountain; the chart spans at least this much. */
const MIN_RANGE_M = 80;

export function climbText({ gainM, lossM }: Pick<ElevationReading, 'gainM' | 'lossM'>): string {
  return `↑ ${metres.format(gainM)} m   ↓ ${metres.format(lossM)} m`;
}

interface ChartGeometry {
  /** The profile's outline from start to end, in chart units. */
  line: string;
  /** The same, closed along the bottom. */
  area: string;
  y: (elevationM: number) => number;
}

function chartOf(profile: ElevationProfile, width: number, height: number): ChartGeometry {
  const { elevationsM, stepM, lengthM, minM, maxM } = profile;
  const range = Math.max(MIN_RANGE_M, maxM - minM);
  const bottom = minM - (range - (maxM - minM)) / 2;
  const y = (elevationM: number) => height - ((elevationM - bottom) / range) * height;
  const every = Math.max(1, Math.ceil(elevationsM.length / MAX_POINTS));
  const points: string[] = [];
  for (let i = 0; i < elevationsM.length; i += every) {
    const x = lengthM > 0 ? (Math.min(i * stepM, lengthM) / lengthM) * width : 0;
    points.push(`${x.toFixed(1)},${y(elevationsM[i]!).toFixed(1)}`);
  }
  points.push(`${width},${y(elevationsM.at(-1)!).toFixed(1)}`);
  const line = `M${points.join('L')}`;
  return { line, area: `${line}L${width},${height}L0,${height}Z`, y };
}

export const ElevationProfileChart: FC<{
  profile: ElevationProfile;
  reading: ElevationReading;
  color: string;
  width: number;
  /** Also shows the metres climbed and descended. */
  counter: boolean;
  style?: CSSProperties;
}> = ({ profile, reading, color, width, counter, style }) => {
  const clipId = useId();
  const chartWidth = width - 44;
  const chartHeight = 120;
  const chart = useMemo(
    () => chartOf(profile, chartWidth, chartHeight),
    [profile, chartWidth, chartHeight],
  );
  const x = profile.lengthM > 0 ? (reading.atM / profile.lengthM) * chartWidth : 0;
  const y = chart.y(reading.elevationM);
  // The height label sits beside the point, on the side with room.
  const labelLeft = x < chartWidth - 150;

  return (
    <div
      style={{
        width,
        padding: '16px 22px 18px',
        borderRadius: 18,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        color: '#ffffff',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {counter && (
        <div style={{ fontSize: 34, fontWeight: 700, marginBottom: 10, whiteSpace: 'pre' }}>
          {climbText(reading)}
        </div>
      )}
      <svg
        width={chartWidth}
        height={chartHeight}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={-10} width={x} height={chartHeight + 20} />
          </clipPath>
        </defs>
        <path d={chart.area} fill="#ffffff" fillOpacity={0.14} />
        <path d={chart.line} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={2} />
        <g clipPath={`url(#${clipId})`}>
          <path d={chart.area} fill={color} fillOpacity={0.8} />
          <path d={chart.line} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" />
        </g>
        <line
          x1={x}
          x2={x}
          y1={y}
          y2={chartHeight}
          stroke="#ffffff"
          strokeOpacity={0.6}
          strokeWidth={2}
        />
        <circle cx={x} cy={y} r={11} fill="#ffffff" />
        <circle cx={x} cy={y} r={7} fill={color} />
        <text
          x={labelLeft ? x + 18 : x - 18}
          y={Math.max(24, y - 14)}
          textAnchor={labelLeft ? 'start' : 'end'}
          fill="#ffffff"
          fontSize={28}
          fontWeight={700}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {metres.format(reading.elevationM)} m
        </text>
      </svg>
    </div>
  );
};
