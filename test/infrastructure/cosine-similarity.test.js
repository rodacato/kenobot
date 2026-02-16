import { cosineSimilarity } from '../../src/infrastructure/cosine-similarity.js'

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 10)
  })

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 10)
  })

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 10)
  })

  it('computes correct similarity for known vectors', () => {
    // cos(45°) ≈ 0.7071
    const a = [1, 0]
    const b = [1, 1]
    expect(cosineSimilarity(a, b)).toBeCloseTo(1 / Math.sqrt(2), 10)
  })

  it('is independent of vector magnitude', () => {
    const a = [1, 2, 3]
    const b = [2, 4, 6] // same direction, 2x magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10)
  })

  it('handles high-dimensional vectors', () => {
    const dims = 768
    const a = Array.from({ length: dims }, (_, i) => Math.sin(i))
    const b = Array.from({ length: dims }, (_, i) => Math.sin(i + 0.01))
    const similarity = cosineSimilarity(a, b)
    expect(similarity).toBeGreaterThan(0.99)
    expect(similarity).toBeLessThanOrEqual(1.0)
  })

  it('throws on dimension mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Dimension mismatch: 2 vs 3')
  })

  it('throws on zero vector (first argument)', () => {
    expect(() => cosineSimilarity([0, 0, 0], [1, 2, 3])).toThrow('zero-magnitude')
  })

  it('throws on zero vector (second argument)', () => {
    expect(() => cosineSimilarity([1, 2, 3], [0, 0, 0])).toThrow('zero-magnitude')
  })

  it('handles floating point precision', () => {
    const a = [0.1, 0.2, 0.3]
    const b = a.map(x => x * 1.0000001) // tiny numerical drift
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5)
  })

  it('handles negative values correctly', () => {
    const a = [-0.5, 0.3, -0.8]
    const b = [0.5, -0.3, 0.8]
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10)
  })

  it('handles single-dimension vectors', () => {
    expect(cosineSimilarity([5], [3])).toBeCloseTo(1.0, 10)
    expect(cosineSimilarity([5], [-3])).toBeCloseTo(-1.0, 10)
  })
})
