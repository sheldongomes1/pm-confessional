import { gemini, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./client";

export type EmbeddingTaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING";

/**
 * Embed a single piece of text with text-embedding-004.
 * Returns a 768-dim float array suitable for pgvector cosine search.
 *
 * Use task type RETRIEVAL_DOCUMENT for stored regrets, RETRIEVAL_QUERY for
 * user search inputs — Google trains the model so the two spaces are aligned.
 */
export async function embedText(
  text: string,
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[]> {
  const result = await gemini.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding response malformed: expected ${EMBEDDING_DIMENSIONS} dims, got ${values?.length ?? 0}`,
    );
  }
  return values;
}

/**
 * Format a number[] as a pgvector literal: '[0.1,0.2,...]'.
 * pgvector accepts this string when inserting/comparing in raw SQL.
 */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
