const cornerCoords = new Set(['0,0', '0,4', '4,0', '4,4']);

export function isWithinCircularMask(row: number, col: number): boolean {
  return !cornerCoords.has(`${row},${col}`);
}
