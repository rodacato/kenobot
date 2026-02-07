import { readFile } from 'node:fs/promises'

export default async function status(args, paths) {
  let pid
  try {
    pid = parseInt(await readFile(paths.pidFile, 'utf8'))
  } catch {
    console.log('KenoBot is not running')
    process.exit(1)
  }

  try {
    process.kill(pid, 0) // check if alive
  } catch {
    console.log(`KenoBot is not running (stale PID ${pid})`)
    process.exit(1)
  }

  // Get uptime from /proc if available (Linux)
  let uptime = ''
  try {
    const procStat = await readFile(`/proc/${pid}/stat`, 'utf8')
    const startTicks = parseInt(procStat.split(' ')[21])
    const uptimeSec = await readFile('/proc/uptime', 'utf8')
    const bootSeconds = parseFloat(uptimeSec.split(' ')[0])
    const hz = 100 // standard on Linux
    const processSeconds = bootSeconds - (startTicks / hz)
    uptime = formatUptime(Math.floor(processSeconds))
  } catch {
    uptime = 'unknown'
  }

  console.log(`KenoBot is running (PID ${pid}) | uptime: ${uptime}`)
  console.log(`  home:   ${paths.home}`)
  console.log(`  config: ${paths.envFile}`)
  console.log(`  data:   ${paths.data}`)
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
