import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Quote { id: string; text: string; author: string; source?: string }

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadQuotes(): Quote[] {
  return JSON.parse(readFileSync(path.join(here, "..", "quotes", "quotes.json"), "utf8"));
}

export function findQuote(id: string | undefined): Quote {
  const quotes = loadQuotes();
  const q = quotes.find((x) => x.id === id);
  if (!q) throw new Error(`unknown quote '${id}'. Run 'sa8 quotes' to list ids.`);
  return q;
}
