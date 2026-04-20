import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ClientMatch = {
  id: string;
  name: string;
  address: string | null;
  gst_number: string | null;
  score: number;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const name = String(url.searchParams.get("name") || "").trim();
  if (!name) return NextResponse.json({ found: false, matches: [] });

  const { data, error } = await supabase
    .from("customers")
    .select("id, name, address, gst_number")
    .ilike("name", `%${name.replace(/[%_]/g, "")}%`)
    .order("name")
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const normalizedInput = normalize(name);
  const matches = (data ?? [])
    .map((customer) => ({
      ...customer,
      score: similarity(normalizedInput, normalize(customer.name)),
    }))
    .sort((left, right) => right.score - left.score) satisfies ClientMatch[];

  return NextResponse.json({
    found: matches.some((match) => match.score >= 0.9 || normalize(match.name) === normalizedInput),
    matches,
  });
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;

  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const hits = [...a].filter((token) => b.has(token)).length;
  return hits / Math.max(a.size, b.size);
}
