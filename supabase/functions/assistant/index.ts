import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai@4";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "npm:ai@7";
import { z } from "npm:zod@3";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "../_shared/run-id.ts";

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const Body = z.object({ threadId: z.string().uuid(), messages: z.array(z.any()).min(1) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: ue } = await db.auth.getUser(auth.replace("Bearer ", ""));
    if (ue || !u.user) return json({ error: "Unauthorized" }, 401);
    const userId = u.user.id;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid request" }, 400);
    const { threadId } = parsed.data;
    const messages = parsed.data.messages as UIMessage[];

    const { data: thread } = await db.from("chat_threads").select("id, title").eq("id", threadId).maybeSingle();
    if (!thread) return json({ error: "Chat not found" }, 404);

    // Save the newest user message
    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      const { error } = await db.from("chat_messages").insert({ thread_id: threadId, user_id: userId, message: last });
      if (error) return json({ error: error.message }, 500);
      if (thread.title === "New chat") {
        const text = last.parts.map((p: any) => (p.type === "text" ? p.text : "")).join(" ").trim();
        await db.from("chat_threads").update({ title: text.slice(0, 60) || "New chat", updated_at: new Date().toISOString() }).eq("id", threadId);
      } else {
        await db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      }
    }

    const { data: biz } = await db.from("business_settings").select("business_name").limit(1).maybeSingle();

    const tools = {
      stock_summary: tool({
        description: "Overall stock summary: number of products in stock, total units, stock value at cost and at sale price, breakdown by category.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data, error } = await db.from("products").select("category, quantity, cost_price, sale_price").eq("status", "in_stock");
          if (error) return { error: error.message };
          const byCat: Record<string, { units: number; value: number }> = {};
          let units = 0, cost = 0, value = 0;
          for (const p of data ?? []) {
            const q = Number(p.quantity ?? 0);
            units += q; cost += q * Number(p.cost_price); value += q * Number(p.sale_price);
            byCat[p.category] ??= { units: 0, value: 0 };
            byCat[p.category].units += q; byCat[p.category].value += q * Number(p.sale_price);
          }
          return { products: data?.length ?? 0, units, costValue: cost, saleValue: value, byCategory: byCat };
        },
      }),
      search_products: tool({
        description: "Search products by brand, model, category or IMEI/serial. Returns up to 30 matches with price, quantity and status.",
        inputSchema: z.object({ query: z.string().describe("Search text") }),
        execute: async ({ query }) => {
          const q = query.replace(/[%,()]/g, " ").trim();
          const { data, error } = await db.from("products")
            .select("brand, model, category, imei_serial, cost_price, sale_price, quantity, status")
            .or(`brand.ilike.%${q}%,model.ilike.%${q}%,category.ilike.%${q}%,imei_serial.ilike.%${q}%`)
            .limit(30);
          return error ? { error: error.message } : { results: data };
        },
      }),
      low_stock: tool({
        description: "List in-stock products with quantity at or below a threshold.",
        inputSchema: z.object({ threshold: z.number().int().min(0).describe("Quantity threshold, use 3 if not specified") }),
        execute: async ({ threshold }) => {
          const { data, error } = await db.from("products").select("brand, model, category, quantity")
            .eq("status", "in_stock").lte("quantity", threshold).order("quantity").limit(50);
          return error ? { error: error.message } : { items: data };
        },
      }),
      sales_report: tool({
        description: "Sales between two dates (inclusive, YYYY-MM-DD): number of sales, revenue, profit, and top products.",
        inputSchema: z.object({ from: z.string(), to: z.string() }),
        execute: async ({ from, to }) => {
          const end = new Date(to); end.setDate(end.getDate() + 1);
          const { data: sales, error } = await db.from("sales").select("id, total, created_at")
            .gte("created_at", from).lt("created_at", end.toISOString().slice(0, 10)).limit(5000);
          if (error) return { error: error.message };
          const ids = (sales ?? []).map((s) => s.id);
          let top: { name: string; units: number; revenue: number }[] = [];
          let profit = 0;
          if (ids.length) {
            const { data: items } = await db.from("sale_items").select("price, products(brand, model, cost_price)").in("sale_id", ids.slice(0, 1000));
            const agg: Record<string, { units: number; revenue: number }> = {};
            for (const it of (items ?? []) as any[]) {
              const n = `${it.products?.brand ?? ""} ${it.products?.model ?? ""}`.trim();
              agg[n] ??= { units: 0, revenue: 0 };
              agg[n].units++; agg[n].revenue += Number(it.price);
              profit += Number(it.price) - Number(it.products?.cost_price ?? 0);
            }
            top = Object.entries(agg).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
          }
          const revenue = (sales ?? []).reduce((s, x) => s + Number(x.total), 0);
          return { salesCount: ids.length, revenue, profit, topProducts: top };
        },
      }),
    };

    const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      system: `You are the shop assistant for ${biz?.business_name ?? "this shop"}'s point of sale system. Today is ${new Date().toISOString().slice(0, 10)}. Answer questions about stock, products, prices and sales using the tools — never invent numbers. Prices are in US dollars ($). Be short and clear, use markdown tables or bullet lists when helpful.`,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(6),
      abortSignal: req.signal,
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    return await withLovableAiGatewayRunIdHeader(
      result.toUIMessageStreamResponse({
        originalMessages: messages,
        sendReasoning: true,
        onFinish: async ({ responseMessage }) => {
          const { error } = await db.from("chat_messages").insert({ thread_id: threadId, user_id: userId, message: responseMessage });
          if (error) console.error("save assistant message failed", error.message);
        },
        onError: (e: any) => {
          console.error(e);
          const s = e?.statusCode ?? e?.status;
          if (s === 429) return "Too many requests — please wait a moment and try again.";
          if (s === 402) return "AI credits are used up. Please add credits to your workspace.";
          return e?.message ?? "Something went wrong";
        },
      }),
      runIdFetch,
      cors,
    );
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
