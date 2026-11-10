// Central place for limits and settings, so they're easy to tune per client.

export const LIMITS = {
  maxFileSizeMb: 15,
  maxPages: 300,
  maxDocuments: 30,
  maxQuestionLength: 1000,
};

export const SEARCH = {
  chunkSize: 1000, // characters per chunk
  chunkOverlap: 200, // characters shared between neighbouring chunks
  topK: 6, // passages sent to the AI
  passagesWithoutAi: 3, // passages shown when no AI is connected
};
