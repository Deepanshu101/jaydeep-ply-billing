import { NextResponse } from "next/server";
import { collectNodes, nodeText, parseTallyXml, postToTally, tallyListOfAccountsXml } from "@/lib/tally";

export const runtime = "nodejs";

type TallyLedgerOption = {
  name: string;
  group: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const group = url.searchParams.get("group") || "sales";

  try {
    const rawResponse = await postToTally(tallyListOfAccountsXml("Ledgers"), `ledger lookup ${group}`);
    const root = parseTallyXml(rawResponse);
    const ledgers = collectNodes(root, "LEDGER")
      .map((ledger) => ({
        name: getName(ledger),
        group: nodeText(ledger.PARENT),
      }))
      .filter((ledger) => ledger.name);

    return NextResponse.json({
      ok: true,
      ledgers: filterLedgers(ledgers, group).slice(0, 200),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not fetch Tally ledgers.",
      },
      { status: 500 },
    );
  }
}

function filterLedgers(ledgers: TallyLedgerOption[], group: string) {
  const normalizedGroup = group.toLowerCase();
  if (normalizedGroup === "sales") {
    return ledgers.filter((ledger) => {
      return ledger.group.toLowerCase().includes("sales") || /^sales\b/i.test(ledger.name);
    });
  }

  if (normalizedGroup === "tax") {
    return ledgers.filter((ledger) => {
      return (
        ledger.group.toLowerCase().includes("duties") ||
        ledger.group.toLowerCase().includes("tax") ||
        /\bcgst\b/i.test(ledger.name) ||
        /\bsgst\b/i.test(ledger.name) ||
        /\bigst\b/i.test(ledger.name) ||
        /\butgst\b/i.test(ledger.name) ||
        /\bgst\b/i.test(ledger.name)
      );
    });
  }

  return ledgers;
}

function getName(node: Record<string, unknown>) {
  return nodeText(node.NAME) || String(node.NAME ?? "");
}
