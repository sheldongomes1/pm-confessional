import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY must be set. Get one free at https://aistudio.google.com/apikey",
  );
}

// Direct Google AI Studio client (NOT the Replit-managed Gemini integration —
// that proxy doesn't support embeddings, which we need for vector search).
export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// gemini-embedding-001 is the current production embedding model in v1beta
// (text-embedding-004 was retired). Supports configurable output dim:
// 768 / 1536 / 3072. We use 768 for compact pgvector storage and HNSW speed.
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
export const FLASH_MODEL = "gemini-2.5-flash";
