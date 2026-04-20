import { AppShell } from "@/components/app-shell";
import { ImportDesk } from "@/components/import/import-desk";

export default function ImportPage() {
  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">AI Import Desk</p>
        <h1 className="mt-1 text-3xl font-bold">Upload first. Extract first. Review first.</h1>
        <p className="mt-2 max-w-3xl text-[#5d6b60]">
          Bring in product lists from images, PDFs, pasted text, or a backup manual row, then approve clean rows for quotations
          and the product master.
        </p>
      </div>
      <ImportDesk />
    </AppShell>
  );
}
