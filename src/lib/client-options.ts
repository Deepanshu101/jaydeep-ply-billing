import { createClient } from "@/lib/supabase/server";

export type SharedClientOption = {
  id: string;
  name: string;
  address: string | null;
  gst_number: string | null;
};

type AddressSourceRow = {
  customer_id: string | null;
  client_name: string | null;
  address: string | null;
  created_at: string;
};

export async function loadClientOptionsWithFallback() {
  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, name, address, gst_number")
    .order("name");

  if (error) {
    throw new Error(`Could not load client list: ${error.message}`);
  }

  const clientRows = (customers ?? []) as SharedClientOption[];
  const needsAddressFallback = clientRows.some((customer) => !customer.address?.trim());
  if (!needsAddressFallback) {
    return clientRows.map((customer) => ({
      id: customer.id,
      name: customer.name,
      address: customer.address,
      gst_number: customer.gst_number,
    }));
  }

  const [quotationResult, invoiceResult] = await Promise.all([
    supabase
      .from("quotations")
      .select("customer_id, client_name, address, created_at")
      .not("address", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("invoices")
      .select("customer_id, client_name, address, created_at")
      .not("address", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const fallbackRows = [
    ...(((quotationResult.data ?? []) as AddressSourceRow[]).filter((row) => row.address?.trim())),
    ...(((invoiceResult.data ?? []) as AddressSourceRow[]).filter((row) => row.address?.trim())),
  ].sort((left, right) => right.created_at.localeCompare(left.created_at));

  const addressByCustomerId = new Map<string, string>();
  const addressByName = new Map<string, string>();

  for (const row of fallbackRows) {
    const address = row.address?.trim();
    if (!address) continue;

    if (row.customer_id && !addressByCustomerId.has(row.customer_id)) {
      addressByCustomerId.set(row.customer_id, address);
    }

    const normalizedName = normalizeClientName(row.client_name);
    if (normalizedName && !addressByName.has(normalizedName)) {
      addressByName.set(normalizedName, address);
    }
  }

  return clientRows.map((customer) => ({
    id: customer.id,
    name: customer.name,
    address:
      customer.address?.trim() ||
      addressByCustomerId.get(customer.id) ||
      addressByName.get(normalizeClientName(customer.name)) ||
      null,
    gst_number: customer.gst_number,
  }));
}

function normalizeClientName(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
