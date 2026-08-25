import type { Camera } from '@scrawl/engine';
import type { Point } from '@scrawl/schema';

export interface LaserPoint extends Point {
  startsStroke: boolean;
  timestamp: number;
}

export interface LaserSegment {
  from: LaserPoint;
  to: LaserPoint;
}

export const LASER_TRAIL_TTL = 900;

export function trimLaserTrail(points: LaserPoint[], now: number): LaserPoint[] {
  return points.filter((point) => now - point.timestamp < LASER_TRAIL_TTL);
}

export function laserSegments(points: LaserPoint[]): LaserSegment[] {
  const segments: LaserSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const to = points[index]!;
    if (to.startsStroke) continue;
    segments.push({ from: points[index - 1]!, to });
  }
  return segments;
}

export function drawLaserTrail(
  canvas: HTMLCanvasElement,
  camera: Camera,
  points: LaserPoint[],
  now: number,
  dpr: number,
): void {
  if (points.length === 0) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  context.save();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.translate(camera.x, camera.y);
  context.scale(camera.zoom, camera.zoom);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#ff365d';
  context.fillStyle = '#ff365d';
  context.shadowColor = 'rgba(255, 54, 93, 0.72)';
  context.shadowBlur = 7 / camera.zoom;

  for (const segment of laserSegments(points)) {
    const alpha = Math.max(0, 1 - (now - segment.to.timestamp) / LASER_TRAIL_TTL);
    context.globalAlpha = alpha;
    context.lineWidth = (2.4 + 2.2 * alpha) / camera.zoom;
    context.beginPath();
    context.moveTo(segment.from.x, segment.from.y);
    context.lineTo(segment.to.x, segment.to.y);
    context.stroke();
  }

  const last = points.at(-1)!;
  const lastAlpha = Math.max(0, 1 - (now - last.timestamp) / LASER_TRAIL_TTL);
  context.globalAlpha = lastAlpha;
  context.beginPath();
  context.arc(last.x, last.y, 3.25 / camera.zoom, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
