import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Bot, Plus, Send, Square, Trash2, Wrench, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Thread { id: string; title: string; updated_at: string }

const SUGGESTIONS = [
  "What's my total stock value?",
  "Which products are running low?",
  "How much did I sell this week?",
  "Show me all Samsung phones in stock",
];

const Assistant = () => {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loaded, setLoaded] = useState<{ id: string; messages: UIMessage[] } | null>(null);

  const loadThreads = async () => {
    const { data, error } = await supabase.from("chat_threads").select("id, title, updated_at").order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setThreads((data ?? []) as Thread[]);
    return (data ?? []) as Thread[];
  };

  const newThread = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("chat_threads").insert({ user_id: user.id }).select("id").single();
    if (error) return toast.error(error.message);
    await loadThreads();
    navigate(`/assistant/${data.id}`);
  };

  useEffect(() => {
    loadThreads().then((list) => {
      if (!threadId) {
        if (list[0]) navigate(`/assistant/${list[0].id}`, { replace: true });
        else newThread();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    setLoaded(null);
    supabase.from("chat_messages").select("message").eq("thread_id", threadId).order("created_at").then(({ data, error }) => {
      if (error) toast.error(error.message);
      setLoaded({ id: threadId, messages: (data ?? []).map((r: any) => r.message as UIMessage) });
    });
  }, [threadId]);

  const deleteThread = async (id: string) => {
    const { error } = await supabase.from("chat_threads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    const list = await loadThreads();
    if (id === threadId) navigate(list[0] ? `/assistant/${list[0].id}` : "/assistant");
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-8rem)]">
      <Card className="md:w-64 shrink-0 p-2 flex md:flex-col gap-1 overflow-auto max-h-32 md:max-h-none">
        <Button onClick={newThread} className="shrink-0 justify-start" size="sm"><Plus className="h-4 w-4 mr-2" />New chat</Button>
        {threads.map((t) => (
          <div key={t.id} className={cn("group flex items-center rounded-md shrink-0", t.id === threadId ? "bg-accent" : "hover:bg-accent/60")}>
            <button className="flex-1 text-left text-sm px-2 py-2 truncate max-w-[10rem] md:max-w-none" onClick={() => navigate(`/assistant/${t.id}`)}>{t.title}</button>
            <button aria-label="Delete chat" className="p-2 text-muted-foreground hover:text-destructive md:opacity-0 group-hover:opacity-100" onClick={() => deleteThread(t.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </Card>
      <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {loaded && loaded.id === threadId ? (
          <ChatWindow key={threadId} threadId={threadId} initial={loaded.messages} onSent={loadThreads} />
        ) : (
          <div className="flex-1 flex items-center justify-center"><div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        )}
      </Card>
    </div>
  );
};

const ChatWindow = ({ threadId, initial, onSent }: { threadId: string; initial: UIMessage[]; onSent: () => void }) => {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({
    api: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant`,
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      return {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      };
    },
    body: { threadId },
  }), [threadId]);

  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onError: (e) => {
      const m = e.message || "Something went wrong";
      toast.error(m.includes("402") ? "AI credits are used up." : m.includes("429") ? "Too many requests, try again shortly." : m);
    },
    onFinish: () => { onSent(); inputRef.current?.focus(); },
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, status]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    sendMessage({ text: text.trim() });
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center"><Bot className="h-6 w-6 text-primary-foreground" /></div>
            <div>
              <h2 className="text-lg font-semibold">Shop Assistant</h2>
              <p className="text-sm text-muted-foreground">Ask anything about your stock and sales.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-left text-sm p-3 rounded-lg border hover:bg-accent transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start gap-2")}>
            {m.role !== "user" && <div className="h-7 w-7 shrink-0 rounded-lg bg-gradient-primary flex items-center justify-center"><Bot className="h-4 w-4 text-primary-foreground" /></div>}
            <div className={cn("max-w-[85%] text-sm space-y-2", m.role === "user" && "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2")}>
              {m.parts.map((p: any, i) => {
                if (p.type === "text") return (
                  <div key={i} className="assistant-md"><ReactMarkdown>{p.text}</ReactMarkdown></div>
                );
                if (p.type === "reasoning" && p.text) return (
                  <details key={i} className="text-xs text-muted-foreground"><summary className="cursor-pointer">Thinking</summary><p className="mt-1 whitespace-pre-wrap">{p.text}</p></details>
                );
                if (typeof p.type === "string" && p.type.startsWith("tool-")) return (
                  <details key={i} className="text-xs rounded-md border bg-muted/40 px-2 py-1">
                    <summary className="cursor-pointer flex items-center gap-1.5 list-none">
                      <Wrench className="h-3 w-3" /> {p.type.slice(5).replace(/_/g, " ")}
                      <span className="text-muted-foreground">· {p.state === "output-available" ? "done" : p.state === "output-error" ? "failed" : "working…"}</span>
                      <ChevronDown className="h-3 w-3 ml-auto" />
                    </summary>
                    <pre className="mt-1 overflow-auto max-h-48 text-[10px]">{JSON.stringify(p.output ?? p.input, null, 2)}</pre>
                  </details>
                );
                return null;
              })}
            </div>
          </div>
        ))}
        {status === "submitted" && (
          <div className="flex gap-2 items-center text-sm text-muted-foreground">
            <div className="h-7 w-7 rounded-lg bg-gradient-primary flex items-center justify-center"><Bot className="h-4 w-4 text-primary-foreground" /></div>
            <span className="animate-pulse">Checking your shop data…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t p-3 flex gap-2 items-end">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about stock, prices, sales…"
          rows={1}
          className="min-h-10 max-h-32 resize-none"
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" onClick={() => stop()} aria-label="Stop"><Square className="h-4 w-4" /></Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
        )}
      </form>
    </>
  );
};

export default Assistant;
