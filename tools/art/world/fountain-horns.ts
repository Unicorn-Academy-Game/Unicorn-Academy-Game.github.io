import { STATUE, statueHornTip } from './statue';

/**
 * The tip of a statue's horn in whole pixels, right of and below the statue's ground anchor, which
 * is where the map places its sprite. The tip is found where the statue is drawn, so it cannot
 * drift from the art.
 */
export function hornFromAnchor(facing: 'east' | 'west'): { x: number; y: number } {
  const [x, y] = statueHornTip(facing);
  return { x: Math.round(x - STATUE.canvas.ox), y: Math.round(y - STATUE.canvas.oy) };
}
