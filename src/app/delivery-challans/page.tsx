import { AppShell } from "@/components/app-shell";
import { ButtonLink } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryChallan } from "@/lib/types";

export default async function DeliveryChallansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("delivery_challans").select("*").order("created_at", { ascending: false });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Delivery challans</h1>
        <p className="mt-2 text-[#5d6b60]">Create dispatch documents from approved quotations and choose PDF columns before printing.</p>
      </div>

      {error ? (
        <div className="rounded-md border border-[#f5c2bd] bg-[#fff4f2] p-4 text-sm text-[#b42318]">
          Delivery challan tables are not available yet. Apply the latest SQL schema in Supabase, then refresh this page.
        </div>
      ) : null}
      {params.error ? (
        <div className="mb-4 rounded-md border border-[#f5c2bd] bg-[#fff4f2] p-4 text-sm text-[#b42318]">
          Could not create delivery challan: {params.error}. Apply the delivery challan SQL schema in Supabase if the table is missing.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-[#d8dfd7] bg-white">
        {!(data ?? []).length ? (
          <EmptyState title="No delivery challans yet" actionHref="/quotations" actionLabel="Convert approved quotation" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-[#eef3ee] text-left">
                <tr>
                  {["No.", "Client", "Project", "Date", "Status", "Actions"].map((heading) => (
                    <th className="px-4 py-3 font-semibold" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {((data ?? []) as DeliveryChallan[]).map((challan) => (
                  <tr className="border-t border-[#edf0ed]" key={challan.id}>
                    <td className="px-4 py-3 font-semibold">{challan.challan_no}</td>
                    <td className="px-4 py-3">{challan.client_name}</td>
                    <td className="px-4 py-3">{challan.project_name}</td>
                    <td className="px-4 py-3">{challan.challan_date}</td>
                    <td className="px-4 py-3 capitalize">{challan.status}</td>
                    <td className="px-4 py-3">
                      <ButtonLink variant="secondary" href={`/delivery-challans/${challan.id}`}>Open</ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
