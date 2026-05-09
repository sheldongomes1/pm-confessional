export {
  gemini,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  FLASH_MODEL,
  FLASH_LITE_MODEL,
} from "./client";
export { embedText, toVectorLiteral, type EmbeddingTaskType } from "./embed";
export {
  batchProcess,
  isRateLimitError,
  type BatchOptions,
} from "./batch";
