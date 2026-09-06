// Calls Claude (with web search) to find new Wuthering Waves leaks,
// merges them into docs/leaks.json, dedupes by name.
// Requires ANTHROPIC_API_KEY as an env var (set as a GitHub Actions secret).

import { readFileSync, writeFileSync, existsSync } from "fs";

const DATA_PATH = "docs/leaks.json";
const VALID_CATS = ["characters", "weapons", "echoes", "bosses", "maps"];
const VALID_TIERS = ["confirmed", "likely", "speculative"];

function loadExisting() {
  if (!existsSync(DATA_PATH)) return [];
  try {
    return JSON.parse(readFileSync(DATA_PATH, "utf8"));
  } catch {
    return [];
  }
}

async function main() {
  const existing = loadExisting();
  const existingNames = existing.map(e => e.name).join("; ");

  const prompt = `Search the web for the most recent Wuthering Waves (video game by Kuro Games) leaks, rumors, and datamine findings currently circulating on places like Reddit (r/wutheringwavesleaks), leaker X/Twitter accounts, and fan wikis.

Skip anything matching these already-tracked items: ${existingNames || "(none yet)"}

Return ONLY a raw JSON array (no markdown fences, no commentary), up to 8 items, each shaped exactly like:
{"name": "short title", "cat": "characters|weapons|echoes|bosses|maps", "desc": "1-2 sentence plain-language summary", "src": "specific leaker name, subreddit, or outlet", "ver": "version/date this is tied to, or empty string", "tier": "confirmed|likely|speculative"}

Tier guide: "confirmed" = stated in official Kuro channels; "likely" = from an established leaker/datamine with a track record; "speculative" = early rumor, fan theory, or unverified claim. If nothing genuinely new, return [].`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });

  if (!response.ok) {
    console.error("API error:", response.status, await response.text());
    process.exit(1);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n");

  const match = text.replace(/```json|```/g, "").match(/\[[\s\S]*\]/);
  const found = match ? JSON.parse(match[0]) : [];

  let added = 0;
  found.forEach(item => {
    if (!item.name || !item.desc) return;
    if (existing.some(e => e.name.toLowerCase() === String(item.name).toLowerCase())) return;
    existing.unshift({
      id: "ai-" + Date.now() + "-" + Math.random().toString(36).slice(2),
      name: item.name,
      cat: VALID_CATS.includes(item.cat) ? item.cat : "characters",
      desc: item.desc,
      src: item.src || "AI web scan",
      ver: item.ver || "",
      tier: VALID_TIERS.includes(item.tier) ? item.tier : "speculative",
      ts: Date.now(),
    });
    added++;
  });

  writeFileSync(DATA_PATH, JSON.stringify(existing, null, 2));
  console.log(`Scan complete. Added ${added} new item(s). Total: ${existing.length}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
