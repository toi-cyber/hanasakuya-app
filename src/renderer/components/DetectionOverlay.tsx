import React, { useRef, useEffect } from 'react';

interface DetectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

interface DetectionOverlayProps {
  boxes: DetectionBox[];
  width: number;
  height: number;
}

export default function DetectionOverlay({
  boxes,
  width,
  height,
}: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    boxes.forEach((box, i) => {
      // 正規化座標 (0-1) → 表示ピクセル座標
      const x1 = box.x1 * displayW;
      const y1 = box.y1 * displayH;
      const x2 = box.x2 * displayW;
      const y2 = box.y2 * displayH;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;

      // 真円: 幅と高さの平均を半径にする
      const radius = ((x2 - x1) + (y2 - y1)) / 4;

      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      // ラベル
      const label = `#${i + 1} ${Math.round(box.confidence * 100)}%`;
      ctx.font = 'bold 14px sans-serif';
      const metrics = ctx.measureText(label);
      const labelW = metrics.width + 8;
      const labelH = 20;
      const labelX = cx - labelW / 2;
      const labelY = cy - radius - labelH - 4;

      ctx.fillStyle = 'rgba(74, 222, 128, 0.75)';
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, 4);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(label, labelX + 4, labelY + 15);
    });
  }, [boxes, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
