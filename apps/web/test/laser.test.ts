import { describe, expect, it } from 'vitest';
import { laserSegments, trimLaserTrail, type LaserPoint } from '../src/laser';

function point(x: number, y: number, timestamp: number, startsStroke = false): LaserPoint {
  return { x, y, timestamp, startsStroke };
}

describe('laser trail', () => {
  it('never connects two separate pointer gestures', () => {
    const points = [
      point(10, 10, 100, true),
      point(30, 20, 120),
      point(300, 240, 180, true),
      point(320, 250, 200),
    ];

    expect(laserSegments(points)).toEqual([
      { from: points[0], to: points[1] },
      { from: points[2], to: points[3] },
    ]);
  });

  it('keeps stroke boundaries while fading old points', () => {
    const points = [
      point(10, 10, 0, true),
      point(30, 20, 100),
      point(300, 240, 850, true),
      point(320, 250, 900),
    ];

    const visible = trimLaserTrail(points, 950);
    expect(visible).toEqual(points.slice(1));
    expect(laserSegments(visible)).toEqual([{ from: points[2], to: points[3] }]);
  });
});
