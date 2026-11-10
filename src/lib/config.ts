// Central place for limits and settings, so they're easy to tune per client.

export const LIMITS = {
  maxFileSizeMb: 10,
  maxPages: 200,
  maxDocuments: 25,
  maxQuestionLength: 1000,
};

export const RAG = {
  chunkSize: 1000, // characters per chunk
  chunkOverlap: 200, // characters shared between neighbouring chunks
  topK: 6, // how many chunks to send to the model
  minSimilarity: 0.2, // ignore weak matches
};

export const MODELS = {
  embedding: process.env.EMBEDDING_MODEL || "text-embedding-3-small", // 1536 dims
  provider: (process.env.LLM_PROVIDER || "openai") as "openai" | "anthropic",
  openaiChat: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  anthropicChat: process.env.ANTHROPIC_CHAT_MODEL || "claude-haiku-4-5",
};
