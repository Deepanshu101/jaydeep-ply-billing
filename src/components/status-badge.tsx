const styles: Record<string, string> = {
  draft: "bg-[#eef3ee] text-[#34513d]",
  pending_approval: "bg-[#fff4cc] text-[#775f00]",
  approved: "bg-[#dff3e7] text-[#17613d]",
  converted: "bg-[#e4eefb] text-[#22528a]",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${styles[status] ?? styles.draft}`}>
      {status.replace("_", " ")}
    </span>
  );
}
