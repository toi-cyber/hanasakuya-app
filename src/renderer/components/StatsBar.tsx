import React from 'react';

interface StatsBarProps {
  count: number;
  inferenceMs: number;
  fps: number;
}

export default function StatsBar({ count, inferenceMs, fps }: StatsBarProps) {
  return (
    <div className="flex justify-around px-6 py-4 bg-white border-t border-sakura-100">
      <StatItem label="検出数" value={`${count} 個`} highlight={count > 0} />
      <StatItem label="推論" value={`${inferenceMs} ms`} />
      <StatItem label="FPS" value={fps.toFixed(1)} />
    </div>
  );
}

function StatItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`text-xl font-bold ${highlight ? 'text-sakura-500' : 'text-gray-700'}`}
      >
        {value}
      </span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  );
}
