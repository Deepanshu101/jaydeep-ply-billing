import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const logSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  quotation_id: z.string().uuid().nullable().optional(),
  invoice_id: z.string().uuid().nullable().optional(),
  channel: z.enum(["whatsapp", "email", "call", "meeting", "system"]),
  direction: z.enum(["inbound", "outbound"]).default("outbound"),
  subject: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  status: z.enum(["draft", "sent", "failed", "received"]).default("sent"),
  follow_up_at: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const input = logSchema.parse(await request.json());
    const supabase = await createClient();
    const { error } = await supabase.from("communication_logs").insert(input);
    if (error) throw error;

    if (input.quotation_id && input.status === "sent") {
      await supabase.from("quotations").update({ sent_at: new Date().toISOString() }).eq("id", input.quotation_id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Communication log failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
