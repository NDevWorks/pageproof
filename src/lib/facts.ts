// Key facts: dates, money, percentages and time periods found in a document.
// Pure pattern matching, so it's instant, free and needs no AI.
import type { StoredChunk } from "./types";

export type FactKind = "date" | "money" | "percent" | "period";

export type Fact = {
  kind: FactKind;
  value: string; // as written in the document
  context: string; // the sentence it appears in
  page: number;
};

export const FACT_LABELS: Record<FactKind, string> = {
  date: "Dates",
  money: "Amounts",
  percent: "Percentages",
  period: "Time periods",
};

const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const NUMBER_WORDS =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|sixty|ninety|a|an)";

const PATTERNS: Record<FactKind, RegExp[]> = {
  date: [
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\.?,?\\s+\\d{4}\\b`, "gi"), // 1 January 2027
    new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"), // January 1, 2027
    /\b\d{4}-\d{2}-\d{2}\b/g, // 2027-01-01
    /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b/g, // 01/01/2027
  ],
  money: [
    /(?:₹|\bRs\.?|\bINR|\bUSD|US\$|\$|€|£)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:lakhs?|crores?|thousand|million|billion|k)\b)?/gi,
    /\b\d[\d,]*(?:\.\d+)?\s?(?:lakhs?|crores?)\b(?:\s?rupees)?/gi,
    /\b\d[\d,]*(?:\.\d+)?\s?(?:rupees|dollars|euros|pounds)\b/gi,
  ],
  percent: [/\b\d+(?:\.\d+)?\s?(?:%|percent\b|per\s?cent\b)/gi],
  period: [
    new RegExp(
      `\\b(?:${NUMBER_WORDS}\\s+\\(\\d+\\)|\\d+|${NUMBER_WORDS})\\s+(?:business\\s+|working\\s+|calendar\\s+)?(?:days?|weeks?|months?|years?)\\b`,
      "gi"
    ),
  ],
};

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    // Don't treat abbreviations like "Rs." or "No." as the end of a sentence
    .split(/(?<!\b(?:Rs|No|Nos|Mr|Mrs|Ms|Dr|St|Co|Ltd|Inc|vs|approx|e\.g|i\.e|etc|\d)\.)(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Chunks overlap, so the same fact can appear twice: keep one per page, value and sentence.
export function extractFacts(chunks: StoredChunk[]): Fact[] {
  const seen = new Set<string>();
  const facts: (Fact & { order: number })[] = [];
  let order = 0;

  for (const chunk of chunks) {
    for (const sentence of sentences(chunk.content)) {
      for (const kind of Object.keys(PATTERNS) as FactKind[]) {
        const taken: [number, number][] = [];
        for (const re of PATTERNS[kind]) {
          for (const m of sentence.matchAll(re)) {
            const start = m.index ?? 0;
            const end = start + m[0].length;
            // Skip overlaps between patterns of the same kind (e.g. "Rs. 500" and "500 rupees")
            if (taken.some(([s, e]) => start < e && end > s)) continue;
            taken.push([start, end]);

            const value = m[0].trim().replace(/[,.]$/, "");
            // "a day" or "an hour" alone is noise, not a fact
            if (kind === "period" && /^(a|an)\s/i.test(value)) continue;
            // Identify the occurrence by its nearby words, since overlapping chunks cut sentences differently
            const near = sentence.slice(Math.max(0, start - 12), end + 12).toLowerCase();
            const key = `${kind}|${chunk.page}|${value.toLowerCase()}|${near}`;
            if (seen.has(key)) continue;
            seen.add(key);
            facts.push({ kind, value, context: sentence, page: chunk.page, order: order++ });
          }
        }
      }
    }
  }

  // A passage can end mid-sentence: drop a fact whose sentence is just a cut-off copy of another's
  const complete = facts.filter(
    (f) =>
      !facts.some(
        (o) =>
          o !== f &&
          o.kind === f.kind &&
          o.page === f.page &&
          o.value.toLowerCase() === f.value.toLowerCase() &&
          o.context.length > f.context.length &&
          o.context.includes(f.context)
      )
  );

  return complete
    .sort((a, b) => a.page - b.page || a.order - b.order)
    .map((f) => ({ kind: f.kind, value: f.value, context: f.context, page: f.page }));
}
