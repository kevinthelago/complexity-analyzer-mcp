/** O(n) — single linear scan. */
export function linearScan(arr) {
  let sum = 0;
  for (const x of arr) sum += x;
  return sum;
}
