import { NextResponse } from "next/server";
import { collectNodes, nodeText, parseTallyXml, postToTally, tallyListOfAccountsXml } from "@/lib/tally";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = (url.searchParams.get("type") || "").toLowerCase();

  try {
    if (type === "voucher-types") {
      const rawResponse = await postToTally(tallyListOfAccountsXml("Voucher Types"), "voucher type lookup");
      const root = parseTallyXml(rawResponse);
      const voucherTypes = collectNodes(root, "VOUCHERTYPE")
        .map((voucherType) => ({
          name: getName(voucherType),
          parent: nodeText(voucherType.PARENT),
          affectsStock: nodeText(voucherType.AFFECTSSTOCK).toLowerCase() === "yes",
          isActive: nodeText(voucherType.ISACTIVE).toLowerCase() !== "no",
        }))
        .filter((voucherType) => voucherType.name);

      return NextResponse.json({ ok: true, voucherTypes });
    }

    if (type === "godowns") {
      const rawResponse = await postToTally(tallyListOfAccountsXml("Godowns"), "godown lookup");
      const root = parseTallyXml(rawResponse);
      const godowns = collectNodes(root, "GODOWN")
        .map((godown) => ({
          name: getName(godown),
          parent: nodeText(godown.PARENT),
        }))
        .filter((godown) => godown.name);

      return NextResponse.json({ ok: true, godowns });
    }

    return NextResponse.json({ ok: false, error: "Unsupported Tally master lookup type." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not fetch Tally master data.",
      },
      { status: 500 },
    );
  }
}

function getName(node: Record<string, unknown>) {
  return nodeText(node.NAME) || String(node.NAME ?? "");
}
