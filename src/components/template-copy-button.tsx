"use client";

import { useState } from "react";
import { Button } from "./button";

export function TemplateCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" onClick={copy}>
        Copy
      </Button>
      {copied ? <span className="text-sm font-semibold text-[#17613d]">Copied</span> : null}
    </div>
  );
}
