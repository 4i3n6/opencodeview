export type BoundedIntOptions = {
  readonly fallback: number;
  readonly min: number;
  readonly max: number;
};

export function parseBoundedInt(raw: string | null | undefined, options: BoundedIntOptions): number {
  const parsed = raw === null || raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  const finite = Number.isFinite(parsed) ? Math.trunc(parsed) : options.fallback;
  return Math.min(Math.max(finite, options.min), options.max);
}
