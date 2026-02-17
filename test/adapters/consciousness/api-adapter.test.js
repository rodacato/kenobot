vi.mock('../../../src/infrastructure/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// Mock the @google/genai SDK
const mockGenerateContent = vi.fn()
vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    constructor() {
      this.models = { generateContent: mockGenerateContent }
    }
  }
  return { GoogleGenAI: MockGoogleGenAI }
})

// Must set env before importing adapter
process.env.GEMINI_API_KEY = 'test-key-for-unit-tests'

const { default: APIConsciousnessAdapter } = await import('../../../src/adapters/consciousness/api-adapter.js')

describe('APIConsciousnessAdapter', () => {
  let adapter

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new APIConsciousnessAdapter({
      model: 'gemini-2.0-flash',
      timeout: 5000
    })
  })

  describe('constructor', () => {
    it('initializes with default config', () => {
      const a = new APIConsciousnessAdapter()
      expect(a.model).toBe('gemini-2.0-flash')
      expect(a.timeout).toBe(30000)
    })

    it('accepts custom model and timeout', () => {
      const a = new APIConsciousnessAdapter({ model: 'gemini-2.5-flash', timeout: 10000 })
      expect(a.model).toBe('gemini-2.5-flash')
      expect(a.timeout).toBe(10000)
    })

    it('throws without GEMINI_API_KEY', () => {
      const original = process.env.GEMINI_API_KEY
      delete process.env.GEMINI_API_KEY
      expect(() => new APIConsciousnessAdapter()).toThrow('GEMINI_API_KEY')
      process.env.GEMINI_API_KEY = original
    })
  })

  describe('call', () => {
    it('sends system prompt as systemInstruction and task as user content', async () => {
      mockGenerateContent.mockResolvedValue({ text: '{"result": true}' })

      await adapter.call('You are an expert.', 'Evaluate this.')

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Evaluate this.' }] }],
        config: {
          systemInstruction: 'You are an expert.'
        }
      })
    })

    it('returns trimmed text response', async () => {
      mockGenerateContent.mockResolvedValue({ text: '  {"expanded": ["a", "b"]}  \n' })

      const result = await adapter.call('sys', 'task')

      expect(result).toBe('{"expanded": ["a", "b"]}')
    })

    it('returns empty string when response has no text', async () => {
      mockGenerateContent.mockResolvedValue({ text: '' })

      const result = await adapter.call('sys', 'task')

      expect(result).toBe('')
    })

    it('throws on API error', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API rate limit exceeded'))

      await expect(adapter.call('sys', 'task')).rejects.toThrow('API rate limit exceeded')
    })

    it('uses configured model', async () => {
      const customAdapter = new APIConsciousnessAdapter({ model: 'gemini-2.5-flash' })
      mockGenerateContent.mockResolvedValue({ text: 'ok' })

      await customAdapter.call('sys', 'task')

      expect(mockGenerateContent.mock.calls[0][0].model).toBe('gemini-2.5-flash')
    })
  })
})
