export type HotspotKind = "loop-nest" | "costly-call" | "recursion" | "allocation" | "unknown";

export interface Hotspot {
  kind: HotspotKind;
  line: number;
  col: number;
  snippet: string;
  bigO: string;
  reason: string;
  uncertain: boolean;
}
