import { NextResponse } from "next/server";
import { z } from "zod";
import { communicationTemplates } from "@/lib/share-templates";
import { inr } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const commandSchema = z.object({ command: z.string().min(2) });

export async function POST(request: Request) {
  try {
    const { command } = commandSchema.parse(await request.json());
    const supabase = await createClient();
    const normalized = command.toLowerCase();

    if (normalized.includes("payment") || normalized.includes("overdue") || normalized.includes("reminder")) {
      const { data } = await supabase
        .from("invoices")
        .select("invoice_no, client_name, grand_total, paid_amount, due_date")
        .order("due_date", { ascending: true })
        .limit(10);
      const overdue = (data ?? []).filter((invoice) => {
        if (!invoice.due_date) return false;
        return new Date(invoice.due_date).getTime() < Date.now() && Number(invoice.paid_amount || 0) < Number(invoice.grand_total);
      });
      return NextResponse.json({
        title: "Payment recovery",
        answer: overdue.length
          ? `Found ${overdue.length} overdue invoice(s). Highest priority: ${overdue[0].client_name} / ${overdue[0].invoice_no}. Suggested message:\n\n${communicationTemplates.paymentReminder}`
          : "No overdue invoices found in the latest invoice list.",
        items: overdue.map((invoice) => ({
          label: `${invoice.client_name} - ${invoice.invoice_no}`,
          value: inr(Number(invoice.grand_total) - Number(invoice.paid_amount || 0)),
        })),
      });
    }

    if (normalized.includes("margin") || normalized.includes("rate") || normalized.includes("price")) {
      const { data } = await supabase
        .from("quotations")
        .select("quotation_no, client_name, project_name, expected_margin_percent, grand_total")
        .order("created_at", { ascending: false })
        .limit(20);
      const risky = (data ?? []).filter((quote) => Number(quote.expected_margin_percent ?? 100) < 12);
      return NextResponse.json({
        title: "Margin intelligence",
        answer: risky.length
          ? `Found ${risky.length} quotation(s) below the margin floor. Review before sending or revising.`
          : "No low-margin quotations found. Add expected margin values to unlock stronger alerts.",
        items: risky.map((quote) => ({
          label: `${quote.quotation_no} - ${quote.client_name}`,
          value: `${quote.expected_margin_percent ?? 0}% margin`,
        })),
      });
    }

    if (normalized.includes("tally")) {
      const { data } = await supabase
        .from("invoices")
        .select("invoice_no, client_name, tally_sync_status")
        .neq("tally_sync_status", "synced")
        .limit(20);
      return NextResponse.json({
        title: "Tally sync",
        answer: data?.length ? `${data.length} invoice(s) are pending Tally sync.` : "All visible invoices are synced to Tally.",
        items: (data ?? []).map((invoice) => ({ label: `${invoice.invoice_no} - ${invoice.client_name}`, value: invoice.tally_sync_status })),
      });
    }

    if (normalized.includes("quote") || normalized.includes("quotation")) {
      const { data } = await supabase
        .from("quotations")
        .select("quotation_no, client_name, project_name, status, grand_total")
        .order("created_at", { ascending: false })
        .limit(8);
      return NextResponse.json({
        title: "Quotation queue",
        answer: `Showing latest ${data?.length ?? 0} quotation(s). Use Import BOQ for new drafts or share actions for communication tracking.`,
        items: (data ?? []).map((quote) => ({ label: `${quote.quotation_no} - ${quote.client_name}`, value: quote.status })),
      });
    }

    return NextResponse.json({
      title: "Command understood",
      answer:
        "I can currently help with payment reminders, overdue invoices, margin/rate alerts, Tally sync, and quotation queues. More actions will be added as the Sales OS grows.",
      items: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI command failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
