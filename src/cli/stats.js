import { readFile } from 'node:fs/promises'
import { GREEN, YELLOW, RED, BOLD, DIM, NC } from './utils.js'

export default async function stats(args, paths) {
  // Check if bot is running
  let pid
  try {
    pid = parseInt(await readFile(paths.pidFile, 'utf8'))
    process.kill(pid, 0)
  } catch {
    console.log('KenoBot is not running. Start with: kenobot start')
    process.exit(1)
  }

  // Read port from .env (default 3000)
  let port = 3000
  try {
    const env = await readFile(paths.envFile, 'utf8')
    const match = env.match(/^HTTP_PORT=(\d+)/m)
    if (match) port = parseInt(match[1])
  } catch { /* use default */ }

  // Fetch stats from HTTP /health endpoint
  let data
  try {
    const res = await fetch(`http://localhost:${port}/health`)
    data = await res.json()
  } catch {
    console.log('Could not reach /health endpoint.')
    console.log('Make sure HTTP_ENABLED=true is set in your config.')
    process.exit(1)
  }

  // Pretty-print each section
  console.log(`\n${BOLD}KenoBot Stats${NC}\n`)

  // Process
  if (data.process) {
    const p = data.process
    console.log(`${BOLD}Process${NC}`)
    console.log(`  PID ${p.pid} | uptime ${formatUptime(p.uptime)} | RSS ${p.memory?.rss || '?'}MB | heap ${p.memory?.heap || '?'}MB`)
  }

  // Responses
  if (data.responses) {
    const r = data.responses
    const errorColor = r.errors > 0 ? RED : GREEN
    console.log(`${BOLD}Responses${NC}`)
    console.log(`  ${r.total} total | avg ${formatMs(r.avgMs)} | p95 ${formatMs(r.p95Ms)} | max ${formatMs(r.maxMs)} | ${errorColor}${r.errors} errors (${r.errorRate}%)${NC}`)
  }

  // Nervous System
  if (data.nervous) {
    const n = data.nervous
    console.log(`${BOLD}Nervous System${NC}`)
    console.log(`  ${n.fired} signals fired | ${n.inhibited} inhibited`)
  }

  // Consciousness
  if (data.consciousness) {
    const c = data.consciousness
    const statusText = c.enabled ? `${c.calls} calls` : `${DIM}disabled${NC}`
    const fallbackColor = parseFloat(c.fallbackRate) > 50 ? YELLOW : GREEN
    console.log(`${BOLD}Consciousness${NC}`)
    if (c.enabled) {
      console.log(`  ${statusText} | ${c.successes} ok | ${fallbackColor}${c.failures} failures (${c.fallbackRate}%)${NC} | avg ${formatMs(c.avgLatencyMs)}`)
    } else {
      console.log(`  ${statusText}`)
    }
  }

  // Cost
  if (data.cost) {
    const d = data.cost.daily
    const m = data.cost.monthly
    const dailyColor = d.percent >= 100 ? RED : d.percent >= 80 ? YELLOW : GREEN
    const monthlyColor = m.percent >= 100 ? RED : m.percent >= 80 ? YELLOW : GREEN
    console.log(`${BOLD}Cost${NC}`)
    console.log(`  daily: ${dailyColor}$${d.cost.toFixed(2)}/$${d.budget}${NC} (${d.percent.toFixed(0)}%) | ${d.calls} calls`)
    console.log(`  monthly: ${monthlyColor}$${m.cost.toFixed(2)}/$${m.budget}${NC} (${m.percent.toFixed(0)}%) | ${m.calls} calls`)
  }

  // Circuit Breaker
  if (data.circuitBreaker) {
    const cb = data.circuitBreaker
    const cbColor = cb.state === 'CLOSED' ? GREEN : cb.state === 'OPEN' ? RED : YELLOW
    console.log(`${BOLD}Circuit Breaker${NC}`)
    console.log(`  ${cbColor}${cb.state}${NC} | ${cb.failures} failures`)
  }

  // Watchdog
  if (data.watchdog) {
    const w = data.watchdog
    const wColor = w.state === 'HEALTHY' ? GREEN : w.state === 'DEGRADED' ? YELLOW : RED
    const checks = Object.entries(w.checks || {})
    const passing = checks.filter(([, c]) => c.status === 'ok').length
    console.log(`${BOLD}Watchdog${NC}`)
    console.log(`  ${wColor}${w.state}${NC} | ${passing}/${checks.length} checks passing`)
    for (const [name, check] of checks) {
      const icon = check.status === 'ok' ? `${GREEN}[ok]${NC}` : check.status === 'warn' ? `${YELLOW}[!]${NC}` : `${RED}[x]${NC}`
      console.log(`    ${icon} ${name}: ${check.detail}`)
    }
  }

  console.log()
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}
