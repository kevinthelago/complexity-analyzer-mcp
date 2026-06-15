/** O(n²) — double nested loop (all pairs). */
export function quadraticPairs(arr) {
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) count++;
    }
  }
  return count;
}
