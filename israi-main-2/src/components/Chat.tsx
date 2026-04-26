import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

type Conversation = {
  id: string;
  title: string;
  last_message_at: string;
};
type Msg = { id?: string; role: "user" | "assistant"; content: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export function Chat() {
  const { user, signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,last_message_at")
      .order("last_message_at", { ascending: false });
    if (error) return;
    setConversations(data ?? []);
  };

  const loadMessages = async (cid: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("id,role,content")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true });
    if (error) return;
    setMessages((data ?? []).map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })));
  };

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
    else setMessages([]);
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
    taRef.current?.focus();
  };

  const deleteConv = async (id: string) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) return toast.error("Could not delete");
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    await loadConversations();
  };

  const renameConv = async (id: string, currentTitle: string) => {
    const next = window.prompt("Rename conversation", currentTitle);
    if (!next || next.trim() === "") return;
    const { error } = await supabase.from("conversations").update({ title: next.trim().slice(0, 60) }).eq("id", id);
    if (error) return toast.error("Could not rename");
    await loadConversations();
  };

  const send = async () => {
    const content = input.trim();
    if (!content || streaming || !user) return;

    let convId = activeId;
    if (!convId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title: "New chat" })
        .select()
        .single();
      if (error || !data) return toast.error("Could not start conversation");
      convId = data.id;
      setActiveId(convId);
    }

    const userMsg: Msg = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    // Persist user message
    await supabase.from("messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "user",
      content,
    });

    // Stream assistant response
    const history: Msg[] = [...messages, userMsg];
    let assistantText = "";
    const upsertAssistant = (chunk: string) => {
      assistantText += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantText } : m));
        }
        return [...prev, { role: "assistant", content: assistantText }];
      });
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? SUPABASE_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_KEY,
        },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error("Rate limited", { description: "Please try again in a moment." });
        else if (resp.status === 402) toast.error("Out of AI credits", { description: "Add credits in workspace settings." });
        else toast.error("AI error", { description: `Status ${resp.status}` });
        setStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            done = true;
            break;
          }
          try {
            const json = JSON.parse(payload);
            const c = json.choices?.[0]?.delta?.content;
            if (c) upsertAssistant(c);
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      // Persist assistant message
      if (assistantText) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", convId);

        // Title generation if still default or short history
        const currentConv = conversations.find((c) => c.id === convId);
        const isWeak = !currentConv || currentConv.title === "New chat" || currentConv.title.length < 5;
        if (isWeak) {
          try {
            const { data: sd } = await supabase.auth.getSession();
            const tk = sd.session?.access_token ?? SUPABASE_KEY;
            const tr = await fetch(`${SUPABASE_URL}/functions/v1/title`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tk}`,
                apikey: SUPABASE_KEY,
              },
              body: JSON.stringify({
                messages: [...history, { role: "assistant", content: assistantText }].slice(-6),
              }),
            });
            if (tr.ok) {
              const { title } = await tr.json();
              if (title) {
                await supabase.from("conversations").update({ title }).eq("id", convId);
              }
            }
          } catch {/* ignore */}
        }
        await loadConversations();
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong");
    } finally {
      setStreaming(false);
    }
  };

  const initials = useMemo(() => {
    const n = user?.user_metadata?.full_name || user?.email || "";
    return String(n).trim().slice(0, 1).toUpperCase() || "U";
  }, [user]);

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static inset-y-0 left-0 z-30 w-72 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-500 [transition-timing-function:var(--easing-apple)]`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-[8px] bg-foreground text-background grid place-items-center text-[11px] font-semibold">
              ISR
            </div>
            <span className="text-sm font-semibold tracking-tight">ISR AI</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={newChat}
            className="w-full h-10 rounded-full bg-foreground text-background text-sm font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] shadow-[var(--shadow-soft)]"
          >
            <span className="text-base leading-none">+</span> New chat
          </button>
        </div>

        <div className="px-3 pb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-medium">
          Conversations
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll px-2 pb-3">
          {conversations.length === 0 && (
            <div className="text-xs text-muted-foreground px-3 py-2">No chats yet.</div>
          )}
          {conversations.map((c, i) => (
            <div
              key={c.id}
              onClick={() => {
                setActiveId(c.id);
                setSidebarOpen(false);
              }}
              className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all duration-300 mb-0.5 ${
                activeId === c.id
                  ? "bg-sidebar-accent text-foreground"
                  : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground"
              }`}
              style={{ animation: `apple-slide-in-left 0.4s var(--easing-apple) ${i * 0.03}s both` }}
            >
              <span className="truncate text-sm flex-1">{c.title}</span>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void renameConv(c.id, c.title);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
                >
                  Rename
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteConv(c.id);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-sidebar-border p-3 flex items-center gap-3">
          <div className="size-8 rounded-full bg-foreground text-background grid place-items-center text-xs font-semibold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">
              {user?.user_metadata?.full_name || user?.email}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-foreground/30 animate-apple-fade"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="apple-blur sticky top-0 z-10 h-14 border-b border-border flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden size-8 rounded-full hover:bg-accent grid place-items-center transition-colors"
            aria-label="Open menu"
          >
            <span className="text-base">☰</span>
          </button>
          <div className="text-sm font-semibold tracking-tight truncate">
            {conversations.find((c) => c.id === activeId)?.title || "New chat"}
          </div>
          <div className="ml-auto text-[11px] text-muted-foreground">
            {streaming ? <span className="shimmer-text">Thinking…</span> : "Ready"}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6">
            {messages.length === 0 && !streaming && (
              <div className="text-center pt-16 animate-apple-up">
                <div className="text-4xl md:text-5xl font-semibold tracking-[-0.04em]">
                  How can I help?
                </div>
                <p className="mt-3 text-muted-foreground">
                  Ask anything about Israel — history, current events, or context.
                </p>
                <div className="mt-8 grid sm:grid-cols-2 gap-2.5 text-left max-w-xl mx-auto">
                  {[
                    "Explain what 7.10 refers to",
                    "Summarize the Israel–Iran tensions",
                    "Common myths about Israel — fact-checked",
                    "What is the Abraham Accords?",
                  ].map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="text-sm text-left p-4 rounded-2xl border border-border bg-card hover:bg-accent transition-all duration-300 hover:-translate-y-0.5"
                      style={{ animation: `apple-fade-up 0.6s var(--easing-apple) ${0.1 + i * 0.07}s both` }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} msg={m} streaming={streaming && i === messages.length - 1 && m.role === "assistant"} />
            ))}

            {streaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3 animate-apple-up">
                <Avatar role="assistant" />
                <div className="px-4 py-3 rounded-2xl bg-muted text-sm text-muted-foreground">
                  <span className="shimmer-text">Thinking…</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-background">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-4">
            <div className="flex items-end gap-2 rounded-3xl border border-border bg-card p-2 pl-4 shadow-[var(--shadow-soft)] focus-within:border-foreground transition-all duration-300">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Message ISR AI…"
                className="flex-1 resize-none bg-transparent outline-none text-[15px] py-2.5 placeholder:text-muted-foreground max-h-[200px] thin-scroll"
              />
              <button
                onClick={() => void send()}
                disabled={!input.trim() || streaming}
                className="size-9 rounded-full bg-foreground text-background grid place-items-center transition-all duration-300 hover:scale-[1.05] active:scale-95 disabled:opacity-40 disabled:scale-100"
                aria-label="Send"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground text-center mt-2">
              ISR AI may produce inaccuracies. Verify key facts independently.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <div className="size-7 shrink-0 rounded-full bg-muted border border-border grid place-items-center text-[11px] font-medium text-foreground">
        You
      </div>
    );
  }
  return (
    <div className="size-7 shrink-0 rounded-full bg-foreground text-background grid place-items-center text-[10px] font-semibold">
      ISR
    </div>
  );
}

function Bubble({ msg, streaming }: { msg: Msg; streaming: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 animate-apple-up ${isUser ? "justify-end" : ""}`}>
      {!isUser && <Avatar role="assistant" />}
      <div
        className={`max-w-[82%] rounded-2xl text-[15px] leading-relaxed ${
          isUser
            ? "bg-foreground text-background px-4 py-2.5"
            : "bg-muted text-foreground px-4 py-3 md-body"
        } ${streaming ? "typing-caret" : ""}`}
      >
        {isUser ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
      </div>
      {isUser && <Avatar role="user" />}
    </div>
  );
}