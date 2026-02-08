const providers = new Map()

export function registerProvider(name, factory) {
  providers.set(name, factory)
}

export function createProvider(name, config) {
  const factory = providers.get(name)
  if (!factory) {
    const available = [...providers.keys()].join(', ')
    throw new Error(`Unknown provider: ${name} (available: ${available})`)
  }
  return factory(config)
}
