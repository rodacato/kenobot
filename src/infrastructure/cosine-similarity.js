/**
 * Compute cosine similarity between two vectors.
 *
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Cosine similarity in range [-1, 1]
 * @throws {Error} If vectors have different dimensions or zero magnitude
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`)
  }

  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) {
    throw new Error('Cannot compute cosine similarity for zero-magnitude vector')
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
