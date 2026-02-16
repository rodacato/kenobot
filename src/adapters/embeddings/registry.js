const providers = new Map()

export function registerEmbeddingProvider(name, factory) {
  providers.set(name, factory)
}

export function createEmbeddingProvider(name, config) {
  const factory = providers.get(name)
  if (!factory) {
    const available = [...providers.keys()].join(', ')
    throw new Error(`Unknown embedding provider: ${name} (available: ${available})`)
  }
  return factory(config)
}
