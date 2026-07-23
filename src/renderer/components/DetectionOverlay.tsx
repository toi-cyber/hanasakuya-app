import React, { useRef, useEffect } from 'react';

interface DetectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  track_id: number;
}

// トラックIDに対応した色を返す（8色パレット循環）
const TRACK_HUES = [142, 210, 45, 280, 0, 170, 60, 320];
function trackColor(trackId: number): { stroke: string; fill: string } {
  const hue = trackId > 0 ? TRACK_HUES[(trackId - 1) % TRACK_HUES.length] : 142;
  return {
    stroke: `hsl(${hue}, 85%, 55%)`,
    fill: `hsla(${hue}, 85%, 55%, 0.75)`,
  };
}

interface DetectionOverlayProps {
  boxes: DetectionBox[];
  width: number;
  height: number;
}

// 補間係数: 0に近いほど滑らか、1で即座に追従
const LERP = 0.35;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function DetectionOverlay({
  boxes,
  width,
  height,
}: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // トラックIDごとの平滑化済み座標を保持
  const smoothedRef = useRef<Map<number, { x1: number; y1: number; x2: number; y2: number }>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas内部解像度を表示サイズに合わせる（歪み防止）
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = displayW;
    canvas.height = displayH;
    ctx.clearRect(0, 0, displayW, displayH);

    // 今フレームに存在するトラックIDを記録（古いエントリ削除用）
    const activeIds = new Set<number>();

    boxes.forEach((box) => {
      activeIds.add(box.track_id);

      // 平滑化: 前フレームの座標に向かって補間
      const prev = smoothedRef.current.get(box.track_id);
      const s = prev
        ? { x1: lerp(prev.x1, box.x1, LERP), y1: lerp(prev.y1, box.y1, LERP),
            x2: lerp(prev.x2, box.x2, LERP), y2: lerp(prev.y2, box.y2, LERP) }
        : { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
      smoothedRef.current.set(box.track_id, s);

      // 正規化座標 (0-1) → 表示ピクセル座標
      const x1 = s.x1 * displayW;
      const y1 = s.y1 * displayH;
      const x2 = s.x2 * displayW;
      const y2 = s.y2 * displayH;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;

      // 真円: 幅と高さの平均を半径にする
      const radius = ((x2 - x1) + (y2 - y1)) / 4;

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // ラベル
      const label = `#${box.track_id}`;
      ctx.font = 'bold 14px sans-serif';
      const metrics = ctx.measureText(label);
      const labelW = metrics.width + 8;
      const labelH = 20;
      const labelX = cx - labelW / 2;
      const labelY = cy - radius - labelH - 4;

      ctx.fillStyle = 'rgba(236, 72, 153, 0.85)';
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, 4);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(label, labelX + 4, labelY + 15);
    });

    // 消えたトラックの平滑化データを削除
    for (const id of smoothedRef.current.keys()) {
      if (!activeIds.has(id)) smoothedRef.current.delete(id);
    }
  }, [boxes, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
