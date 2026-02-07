import { readFile, unlink } from 'node:fs/promises'

export default async function stop(args, paths) {
  let pid
  try {
    pid = parseInt(await readFile(paths.pidFile, 'utf8'))
  } catch {
    console.error('KenoBot is not running (no PID file found)')
    process.exit(1)
  }

  try {
    process.kill(pid, 0) // check if alive
  } catch {
    console.error(`KenoBot is not running (stale PID file for ${pid})`)
    await unlink(paths.pidFile).catch(() => {})
    process.exit(1)
  }

  process.kill(pid, 'SIGTERM')
  console.log(`Sent SIGTERM to KenoBot (PID ${pid})`)

  // Wait for process to exit (up to 10s)
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
      await new Promise(r => setTimeout(r, 200))
    } catch {
      console.log('KenoBot stopped')
      return
    }
  }
  console.warn('KenoBot did not stop within 10s. You may need to kill it manually.')
}
