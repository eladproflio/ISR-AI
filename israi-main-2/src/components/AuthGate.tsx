import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function AuthGate() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<0 | 1>(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name || email.split("@")[0] },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Welcome to ISR AI", { description: "You're signed in." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error("Authentication failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground">
      <header className="apple-blur sticky top-0 z-10 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 animate-apple-fade">
            <div className="size-7 rounded-[8px] bg-foreground text-background grid place-items-center text-[11px] font-semibold tracking-tight">
              ISR
            </div>
            <span className="text-[15px] font-semibold tracking-tight">ISR AI</span>
          </div>
          <div className="text-xs text-muted-foreground hidden sm:block animate-apple-fade">
            Israel context · clarified
          </div>
        </div>
      </header>

      <main className="flex-1 grid lg:grid-cols-2 max-w-6xl w-full mx-auto px-6 py-12 lg:py-20 gap-12 items-center">
        {step === 0 ? (
          <section className="animate-apple-up">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              About the project
            </div>
            <h1 className="text-5xl lg:text-6xl font-semibold tracking-[-0.04em] leading-[1.02]">
              Israel context,
              <br />
              <span className="shimmer-text">clarified.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
              A precise assistant built to explain Israel, its history, and current events with
              clear framing — readable answers, no slogans, no fluff.
            </p>

            <div className="mt-10 grid sm:grid-cols-2 gap-3">
              {[
                { t: "Understands context", d: "Recognizes shorthand like 7.10 → October 7, 2023." },
                { t: "Built for explaining", d: "Answers framed for clarity, not jargon." },
                { t: "Right-sized replies", d: "Detailed enough, never bloated." },
                { t: "Conversation memory", d: "Threads with meaningful, auto-named titles." },
              ].map((f, i) => (
                <div
                  key={f.t}
                  className="rounded-2xl border border-border p-4 bg-card hover:bg-accent transition-all duration-300 hover:-translate-y-0.5"
                  style={{ animation: `apple-fade-up 0.6s var(--easing-apple) ${0.1 + i * 0.07}s both` }}
                >
                  <div className="text-sm font-semibold">{f.t}</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.d}</div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center gap-3">
              <button
                onClick={() => setStep(1)}
                className="h-11 px-6 rounded-full bg-foreground text-background text-sm font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-[var(--shadow-soft)]"
              >
                Continue
              </button>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-foreground" />
                <span className="size-1.5 rounded-full bg-border" />
              </div>
            </div>
          </section>
        ) : (
          <section className="animate-slide-left">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </div>
            <h1 className="text-5xl lg:text-6xl font-semibold tracking-[-0.04em] leading-[1.02]">
              {mode === "signin" ? "Sign in." : "Get started."}
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
              Your conversations are private to you. Sign{" "}
              {mode === "signin" ? "in" : "up"} to start chatting and keep your history.
            </p>
            <button
              onClick={() => setStep(0)}
              className="mt-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          </section>
        )}

        <section className="animate-apple-up" style={{ animationDelay: "0.15s" }}>
          <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-elevated)]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold tracking-tight">
                {mode === "signin" ? "Sign in" : "Create account"}
              </h2>
              <button
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {mode === "signin" ? "Need an account?" : "Have one already?"}
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === "signup" && (
                <Field label="Name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="appleInput"
                  />
                </Field>
              )}
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="appleInput"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="appleInput"
                />
              </Field>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 mt-2 rounded-full bg-foreground text-background text-sm font-medium transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:scale-100"
              >
                {loading ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <p className="text-[11px] text-muted-foreground mt-5 text-center leading-relaxed">
              By continuing you agree to use ISR AI for informational purposes.
            </p>
          </div>
        </section>
      </main>

      <style>{`
        .appleInput {
          width: 100%;
          height: 44px;
          padding: 0 14px;
          border-radius: 12px;
          background: var(--muted);
          border: 1px solid transparent;
          color: var(--foreground);
          font-size: 15px;
          transition: all 0.25s var(--easing-apple);
          outline: none;
        }
        .appleInput::placeholder { color: var(--muted-foreground); }
        .appleInput:focus {
          background: var(--background);
          border-color: var(--foreground);
          box-shadow: 0 0 0 4px color-mix(in oklab, var(--foreground) 8%, transparent);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-medium">
        {label}
      </div>
      {children}
    </label>
  );
}