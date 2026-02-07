import { readFile, writeFile, unlink } from 'node:fs/promises'

const DEFAULT_PID_FILE = process.env.KENOBOT_PID_FILE || '/tmp/kenobot.pid'

/**
 * Get current process health status.
 * Used by bin/health CLI and HTTP /health endpoint.
 */
export function getStatus() {
  const mem = process.memoryUsage()
  return {
    status: 'ok',
    pid: process.pid,
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.floor(mem.rss / 1024 / 1024),
      heap: Math.floor(mem.heapUsed / 1024 / 1024)
    },
    timestamp: Date.now()
  }
}

/**
 * Write current PID to file. Called on startup.
 */
export async function writePid(pidFile = DEFAULT_PID_FILE) {
  await writeFile(pidFile, String(process.pid))
}

/**
 * Remove PID file. Called on graceful shutdown.
 */
export async function removePid(pidFile = DEFAULT_PID_FILE) {
  try {
    await unlink(pidFile)
  } catch {
    // File may not exist, that's fine
  }
}

/**
 * Check if KenoBot is running by reading PID file and signaling the process.
 * @returns {Promise<number>} The PID if running
 * @throws If PID file doesn't exist or process is not running
 */
export async function checkPid(pidFile = DEFAULT_PID_FILE) {
  const pid = parseInt(await readFile(pidFile, 'utf8'))
  process.kill(pid, 0) // throws if process not running
  return pid
}
