/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CaseStatus, CasePriority } from '../types';

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  id?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = '#004B87',
  height = 38,
  width = 110,
  id: _id = 'sparkline',
}) => {
  const safeData = data.length >= 2 ? data : [2, 4, 3, 6, 5, 8, 7];
  const max = Math.max(...safeData, 1);
  const min = Math.min(...safeData, 0);
  const range = max - min || 1;
  const pad = 4;

  const points = safeData.map((val, idx) => {
    const x = pad + (idx / (safeData.length - 1)) * (width - pad * 2);
    const y = height - pad - ((val - min) / range) * (height - pad * 2);
    return { x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;
  const lastPoint = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible select-none shrink-0"
      aria-hidden="true"
    >
      <path d={areaPath} fill={color} fillOpacity="0.1" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r="3"
        fill={color}
        className="animate-pulse"
      />
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r="6"
        fill={color}
        fillOpacity="0.22"
      />
    </svg>
  );
};

export const StatusBadge: React.FC<{ status: CaseStatus | string; size?: 'sm' | 'md' }> = ({
  status,
  size = 'sm',
}) => {
  const isClosed = status === 'مغلقة';
  const isNew = status === 'جديدة' || status === 'مفتوحة';
  const isEscalatedMgmt = status.includes('محولة للإدارة');
  const isEscalatedTech = status.includes('محولة للدعم');
  const isReturned = status.includes('وكيل الاتصال');

  let badgeStyle =
    'bg-emerald-50 dark:bg-emerald-950/60 text-[#008742] dark:text-[#00E676] border-[#00A651]/40';
  let dotColor = 'bg-[#00A651]';
  let pulse = true;

  if (isClosed) {
    badgeStyle =
      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    dotColor = 'bg-slate-500';
    pulse = false;
  } else if (isNew) {
    badgeStyle =
      'bg-[#EBF4FC] dark:bg-[#002B54] text-[#004B87] dark:text-sky-300 border-[#004B87]/35';
    dotColor = 'bg-[#004B87] dark:bg-sky-400';
  } else if (isEscalatedMgmt) {
    badgeStyle =
      'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-500/40';
    dotColor = 'bg-amber-600';
  } else if (isEscalatedTech) {
    badgeStyle =
      'bg-sky-50 dark:bg-sky-950/60 text-[#004B87] dark:text-sky-300 border-sky-500/40';
    dotColor = 'bg-sky-600';
  } else if (isReturned) {
    badgeStyle =
      'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-500/40';
    dotColor = 'bg-rose-600';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border font-bold whitespace-nowrap transition-all ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
      } ${badgeStyle}`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>
      <span>{status}</span>
    </span>
  );
};

export const PriorityIndicator: React.FC<{ priority?: CasePriority | string }> = ({
  priority = 'عادي',
}) => {
  if (priority === 'عاجل') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        <span>عاجل</span>
      </span>
    );
  }
  if (priority === 'هام') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span>هام</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
      <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
      <span>عادي</span>
    </span>
  );
};

export const StatCardSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-saas space-y-4">
    <div className="flex items-center justify-between">
      <div className="h-3.5 w-24 rounded-md skeleton-shimmer" />
      <div className="h-9 w-9 rounded-xl skeleton-shimmer" />
    </div>
    <div className="flex items-end justify-between pt-2">
      <div className="space-y-2">
        <div className="h-7 w-16 rounded-lg skeleton-shimmer" />
        <div className="h-3 w-28 rounded-md skeleton-shimmer" />
      </div>
      <div className="h-9 w-24 rounded-lg skeleton-shimmer" />
    </div>
  </div>
);

export const TableRowsSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 6,
  cols = 8,
}) => (
  <>
    {Array.from({ length: rows }).map((_, rIdx) => (
      <tr key={rIdx} className="border-b border-slate-100 dark:border-slate-800/70">
        {Array.from({ length: cols }).map((__, cIdx) => (
          <td key={cIdx} className="p-3.5">
            <div
              className={`h-4 rounded-md skeleton-shimmer ${
                cIdx === 0 ? 'w-20' : cIdx === cols - 1 ? 'w-16 mx-auto' : 'w-full max-w-[120px]'
              }`}
            />
          </td>
        ))}
      </tr>
    ))}
  </>
);

export const KanbanSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
    {Array.from({ length: 5 }).map((_, colIdx) => (
      <div
        key={colIdx}
        className="bg-slate-100/70 dark:bg-slate-900/60 rounded-2xl p-3 border border-slate-200/70 dark:border-slate-800 space-y-3"
      >
        <div className="flex items-center justify-between p-1">
          <div className="h-4 w-24 rounded-md skeleton-shimmer" />
          <div className="h-5 w-7 rounded-md skeleton-shimmer" />
        </div>
        {Array.from({ length: 3 }).map((__, cardIdx) => (
          <div
            key={cardIdx}
            className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800 space-y-2.5"
          >
            <div className="flex justify-between">
              <div className="h-3.5 w-16 rounded skeleton-shimmer" />
              <div className="h-3.5 w-12 rounded skeleton-shimmer" />
            </div>
            <div className="h-4 w-full rounded skeleton-shimmer" />
            <div className="h-3 w-2/3 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    ))}
  </div>
);
