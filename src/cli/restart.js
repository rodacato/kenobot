export default async function restart(args, paths) {
  // Try to stop (ignore errors if not running)
  try {
    const { default: stop } = await import('./stop.js')
    await stop([], paths)
  } catch {
    // Not running, that's fine
  }

  const { default: start } = await import('./start.js')
  await start(['-d'], paths)
}
