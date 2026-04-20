"use client";

import { useState } from "react";
import { Button } from "@/components/button";

type CommandResult = {
  title: string;
  answer: string;
  items: { label: string; value: string }[];
};

export function CommandBox() {
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState("");

  async function runCommand() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Command failed.");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="min-h-10 flex-1 rounded-md border border-[#cdd6cf] px-3 py-2"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="Try: draft payment reminder, find low margin quotes, check Tally sync"
        />
        <Button type="button" onClick={runCommand} disabled={loading || !command.trim()}>
          {loading ? "Thinking..." : "Run"}
        </Button>
      </div>
      {error ? <p className="mt-3 rounded-md bg-[#fff0ed] p-3 text-sm text-[#b42318]">{error}</p> : null}
      {result ? (
        <div className="mt-4 rounded-md border border-[#d8dfd7] bg-[#f6f7f4] p-4">
          <p className="font-bold">{result.title}</p>
          <p className="mt-2 whitespace-pre-line text-sm text-[#34513d]">{result.answer}</p>
          {result.items.length ? (
            <div className="mt-3 space-y-2">
              {result.items.map((item) => (
                <div className="flex justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm" key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <span className="font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
