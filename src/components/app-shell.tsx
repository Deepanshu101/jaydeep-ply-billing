import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/lib/brand";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#d8dfd7] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Link href="/dashboard" className="text-2xl font-bold text-[#1f6f50]">
              {brand.businessName}
            </Link>
            <p className="text-sm text-[#5d6b60]">Quotation and billing desk</p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-semibold">
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/dashboard">
              Dashboard
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/quotations">
              Quotations
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/import">
              Import
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/communications">
              Communications
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/pricing">
              Pricing
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/clients">
              Clients
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/orders">
              Orders
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/delivery-challans">
              Challans
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/recovery">
              Recovery
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/invoices">
              Invoices
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ee]" href="/tally-sync">
              Tally Sync
            </Link>
            <form action="/auth/signout" method="post">
              <button className="rounded-md px-3 py-2 font-semibold hover:bg-[#eef3ee]">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
