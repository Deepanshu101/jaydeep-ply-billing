"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { brand } from "@/lib/brand";
import { Button } from "@/components/button";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push("/dashboard");
        router.refresh();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      if (data.user && !data.session) {
        setMessage("Account created. Please confirm your email before logging in.");
      } else {
        setMessage("Account created successfully.");
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: magicLinkError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (magicLinkError) throw magicLinkError;
      setMessage("Magic login link sent to your email.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send magic link.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (resetError) throw resetError;
      setMessage("Password reset email sent.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md rounded-md border border-[#d8dfd7] bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#1f6f50]">{brand.businessName}</p>
        <h1 className="mt-2 text-3xl font-bold">{mode === "login" ? "Sign in" : "Create account"}</h1>
        <p className="mt-2 text-sm text-[#5d6b60]">
          {mode === "login" ? "Use your staff email and password." : "Create a staff account for billing access."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold" htmlFor="email">
            Email address
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block text-sm font-semibold" htmlFor="password">
            Password
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-md border border-[#cdd6cf] px-3 py-2 outline-none focus:border-[#1f6f50]"
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </label>

          {error ? <p className="rounded-md bg-[#fff0ed] p-3 text-sm text-[#b42318]">{error}</p> : null}
          {message ? <p className="rounded-md bg-[#eef8f1] p-3 text-sm text-[#17613d]">{message}</p> : null}

          <Button className="w-full" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </Button>

          <Button className="w-full" type="button" variant="secondary" onClick={handleMagicLink} disabled={loading || !email}>
            Send magic link instead
          </Button>

          <button
            type="button"
            onClick={handleResetPassword}
            disabled={loading || !email}
            className="w-full rounded-md px-4 py-2 text-sm font-semibold text-[#1f6f50] disabled:opacity-60"
          >
            Forgot password?
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
              setMessage("");
            }}
            className="w-full rounded-md px-4 py-2 text-sm font-semibold text-[#34513d] hover:bg-[#eef3ee]"
          >
            {mode === "login" ? "Need an account? Create one" : "Already have an account? Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
