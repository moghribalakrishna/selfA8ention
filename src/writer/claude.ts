import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.SA8_MODEL ?? "claude-opus-5";

let client: Anthropic | undefined;

class RefusalError extends Error {}

/**
 * One structured-output call: the response is validated against `schema`.
 * Streams so long storyboards don't hit HTTP timeouts, and opts into
 * server-side refusal fallbacks so a false-positive decline is retried.
 */
export async function structured<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  opts: { effort?: "low" | "medium" | "high" | "xhigh" | "max"; label?: string } = {},
): Promise<z.infer<S>> {
  const label = opts.label ?? "claude";
  try {
    return await call(schema, system, user, opts.effort ?? "high", label);
  } catch (e) {
    // API errors (auth, rate limits, 5xx) are already retried by the SDK; only
    // retry here when the model's output failed client-side schema parsing.
    if (e instanceof Anthropic.APIError || e instanceof RefusalError) throw e;
    process.stderr.write(`! ${label}: ${e instanceof Error ? e.message.slice(0, 300) : e} — retrying once\n`);
    const hint = `\n\nA previous attempt failed schema validation: ${e instanceof Error ? e.message.slice(0, 1500) : e}\nUse only the allowed enum values and field types.`;
    return call(schema, system, user + hint, opts.effort ?? "high", `${label} (retry)`);
  }
}

async function call<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  effort: "low" | "medium" | "high" | "xhigh" | "max",
  label: string,
): Promise<z.infer<S>> {
  client ??= new Anthropic();
  const t0 = Date.now();
  process.stderr.write(`… ${label} (${MODEL})\n`);
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") {
    throw new RefusalError(`${label}: request was declined (${msg.stop_details?.category ?? "no category"})`);
  }
  if (msg.stop_reason === "max_tokens") throw new Error(`${label}: output hit max_tokens`);
  if (msg.parsed_output == null) throw new Error(`${label}: response did not match the schema`);
  process.stderr.write(`✓ ${label} in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  return msg.parsed_output as z.infer<S>;
}
