/**
 * Synthetic embedding vectors for deterministic testing.
 *
 * These are hand-crafted low-dimensional vectors with known cosine similarities.
 * Use for unit/integration tests where real API embeddings are not needed.
 *
 * All vectors are 8-dimensional for simplicity.
 * Real embeddings use 768 dimensions, but cosine similarity properties are the same.
 */

// Food-related cluster (high mutual similarity)
export const FOOD_PREF = [0.9, 0.1, 0.0, 0.0, 0.05, 0.0, 0.0, 0.0]
export const FOOD_QUERY = [0.85, 0.15, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0]

// Weather-related cluster (orthogonal to food)
export const WEATHER_OBS = [0.0, 0.0, 0.9, 0.1, 0.0, 0.0, 0.0, 0.0]
export const WEATHER_QUERY = [0.0, 0.0, 0.85, 0.15, 0.0, 0.0, 0.0, 0.0]

// Tech-related cluster
export const TECH_ERROR = [0.0, 0.0, 0.0, 0.0, 0.9, 0.1, 0.0, 0.0]
export const TECH_QUERY = [0.0, 0.0, 0.0, 0.0, 0.85, 0.15, 0.0, 0.0]

// Mixed/general (some similarity to both food and tech)
export const GENERAL = [0.3, 0.1, 0.1, 0.1, 0.3, 0.1, 0.0, 0.0]

/**
 * Generate a random normalized vector of given dimensions.
 * Useful for performance tests.
 */
export function randomVector(dims) {
  const v = Array.from({ length: dims }, () => Math.random() * 2 - 1)
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  return v.map(x => x / norm)
}
