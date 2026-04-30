export type TallyAlternateUnitMeta = {
  rate: number;
  per: string;
  factor: number;
};

const TALLY_ALT_MARKER = /\s*\[\[TALLY_ALT:(\{[\s\S]*\})\]\]\s*$/;

export function stripTallyItemMeta(value: string | null | undefined) {
  return String(value ?? "").replace(TALLY_ALT_MARKER, "").trim();
}

export function readTallyItemMeta(value: string | null | undefined) {
  const text = String(value ?? "");
  const match = text.match(TALLY_ALT_MARKER);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]) as Partial<TallyAlternateUnitMeta>;
    const rate = Number(parsed.rate);
    const factor = Number(parsed.factor);
    const per = String(parsed.per ?? "").trim();
    if (!per || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(factor) || factor <= 0) return null;
    return {
      rate: round2(rate),
      per,
      factor: round2(factor),
    } satisfies TallyAlternateUnitMeta;
  } catch {
    return null;
  }
}

export function writeTallyItemMeta(
  specification: string | null | undefined,
  meta?: TallyAlternateUnitMeta | null,
) {
  const cleanSpecification = stripTallyItemMeta(specification);
  if (!meta) return cleanSpecification;

  const payload = JSON.stringify({
    rate: round2(meta.rate),
    per: String(meta.per || "").trim(),
    factor: round2(meta.factor),
  });

  return cleanSpecification ? `${cleanSpecification}\n[[TALLY_ALT:${payload}]]` : `[[TALLY_ALT:${payload}]]`;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
