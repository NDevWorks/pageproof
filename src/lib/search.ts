// Keyword search (BM25) that runs entirely in the browser. No API key or server needed.
// BM25 ranks passages by how many of the question's words they contain, giving more
// weight to rare words and less to very long passages.

const STOP = new Set(
  (
    "a an the and or but of to in on at for from by with as is are was were be been being " +
    "it its this that these those there their they them he she his her we our you your i me my " +
    "what when where which who whom how why does do did can could should would will shall may might " +
    "about into over under any all some no not if then than so such also just only very more most"
  ).split(" ")
);

// Light stemming so "payments", "paid" and "paying" still meet "pay"-ish words.
function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const suffix of ["ations", "ation", "ments", "ment", "ings", "ing", "ies", "ied", "es", "ed", "ly", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      const base = word.slice(0, -suffix.length);
      return suffix === "ies" || suffix === "ied" ? base + "y" : base;
    }
  }
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

export type Scored<T> = { item: T; score: number };

export function bm25<T extends { content: string }>(query: string, items: T[], topK: number): Scored<T>[] {
  const q = [...new Set(tokenize(query))];
  if (q.length === 0 || items.length === 0) return [];

  const docs = items.map((item) => {
    const tokens = tokenize(item.content);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { item, tf, len: tokens.length };
  });

  const N = docs.length;
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / N || 1;
  const df = new Map<string, number>();
  for (const term of q) df.set(term, docs.filter((d) => d.tf.has(term)).length);

  const k1 = 1.4;
  const b = 0.75;
  const scored = docs.map((d) => {
    let score = 0;
    for (const term of q) {
      const f = d.tf.get(term);
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
    }
    return { item: d.item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
