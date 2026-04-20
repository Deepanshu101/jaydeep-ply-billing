import { ButtonLink } from "./button";

export function EmptyState({ title, actionHref, actionLabel }: { title: string; actionHref: string; actionLabel: string }) {
  return (
    <div className="rounded-md border border-dashed border-[#bdc8be] bg-white p-8 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ButtonLink className="mt-4" href={actionHref}>
        {actionLabel}
      </ButtonLink>
    </div>
  );
}
