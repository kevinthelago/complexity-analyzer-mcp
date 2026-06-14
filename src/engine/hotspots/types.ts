export interface Hotspot {
  line: number;
  col: number;
  /** Truncated (≤80 chars) single-line representation of the construct. */
  snippet: string;
  bigO: string;
  /** One-line explanation of why this construct drives the dominant cost. */
  reason: string;
  /** True when this hotspot overlaps an uncertain node from the static pass. */
  uncertain: boolean;
}
