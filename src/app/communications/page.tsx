import { AppShell } from "@/components/app-shell";
import { TemplateCopyButton } from "@/components/template-copy-button";
import { communicationTemplates } from "@/lib/share-templates";
import { createClient } from "@/lib/supabase/server";

type CommunicationLog = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  status: string;
  follow_up_at: string | null;
  created_at: string;
  customer_id: string | null;
  quotation_id: string | null;
  invoice_id: string | null;
};

export default async function CommunicationsPage() {
  const supabase = await createClient();
  const today = new Date().toISOString();
  const { data, error } = await supabase
    .from("communication_logs")
    .select("id, channel, direction, subject, body, status, follow_up_at, created_at, customer_id, quotation_id, invoice_id")
    .order("created_at", { ascending: false })
    .limit(50);

  const logs = (data ?? []) as CommunicationLog[];
  const dueFollowups = logs.filter((log) => log.follow_up_at && log.follow_up_at <= today && log.status !== "sent").length;
  const whatsappCount = logs.filter((log) => log.channel === "whatsapp").length;
  const emailCount = logs.filter((log) => log.channel === "email").length;

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">Communication Layer</p>
        <h1 className="mt-1 text-3xl font-bold">Client communication memory</h1>
        <p className="mt-2 max-w-3xl text-[#5d6b60]">
          Track quotation shares, reminders, revised quotation responses, payment follow-ups, and polished message templates.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="WhatsApp actions" value={whatsappCount} />
        <Metric label="Email actions" value={emailCount} />
        <Metric label="Follow-ups due" value={dueFollowups} tone={dueFollowups ? "danger" : "normal"} />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white shadow-sm">
          <div className="border-b border-[#d8dfd7] p-4">
            <h2 className="text-xl font-bold">Recent communication log</h2>
            {error ? (
              <p className="mt-2 text-sm text-[#b42318]">Run the latest `supabase/schema.sql` to enable communication logs.</p>
            ) : null}
          </div>
          {!error && logs.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-sm">
                <thead className="bg-[#eef3ee] text-left">
                  <tr>
                    {["When", "Channel", "Subject", "Status", "Linked to"].map((heading) => (
                      <th className="px-4 py-3 font-semibold" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr className="border-t border-[#edf0ed]" key={log.id}>
                      <td className="px-4 py-3">{new Date(log.created_at).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 capitalize">{log.channel}</td>
                      <td className="px-4 py-3">{log.subject || "-"}</td>
                      <td className="px-4 py-3 capitalize">{log.status}</td>
                      <td className="px-4 py-3">
                        {log.quotation_id ? "Quotation" : log.invoice_id ? "Invoice" : log.customer_id ? "Customer" : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-sm text-[#5d6b60]">
              {error ? "Communication table is not ready yet." : "No communication actions logged yet."}
            </p>
          )}
        </div>

        <div className="rounded-md border border-[#d8dfd7] bg-white p-4 shadow-sm">
          <h2 className="text-xl font-bold">Quick templates</h2>
          <div className="mt-4 space-y-4">
            {Object.entries(communicationTemplates).map(([key, value]) => (
              <div className="rounded-md border border-[#edf0ed] p-3" key={key}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{labelTemplate(key)}</p>
                    <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-[#5d6b60]">{value}</p>
                  </div>
                  <TemplateCopyButton text={value} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "danger" }) {
  return (
    <div className={`rounded-md border bg-white p-5 shadow-sm ${tone === "danger" ? "border-[#f2b8b5]" : "border-[#d8dfd7]"}`}>
      <p className="text-sm font-semibold text-[#5d6b60]">{label}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

function labelTemplate(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}
