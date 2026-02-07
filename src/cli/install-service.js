import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'

export default async function installService(args, paths) {
  const unitDir = join(homedir(), '.config', 'systemd', 'user')
  const unitFile = join(unitDir, 'kenobot.service')

  // Resolve kenobot binary dynamically (works with npm install -g and npm link)
  let kenobotBin
  try {
    kenobotBin = execSync('which kenobot', { encoding: 'utf8' }).trim()
  } catch {
    kenobotBin = join(paths.engine, 'src', 'cli.js')
  }

  const unit = `[Unit]
Description=KenoBot Telegram AI Assistant
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${kenobotBin} start
Restart=on-failure
RestartSec=10
Environment=KENOBOT_HOME=%h/.kenobot

[Install]
WantedBy=default.target
`

  await mkdir(unitDir, { recursive: true })
  await writeFile(unitFile, unit)
  console.log(`Service file written to ${unitFile}`)

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'pipe' })
    execSync('systemctl --user enable kenobot', { stdio: 'pipe' })
    console.log('Service enabled. Commands:')
    console.log('  systemctl --user start kenobot')
    console.log('  systemctl --user status kenobot')
    console.log('  systemctl --user stop kenobot')
    console.log('  journalctl --user -u kenobot -f')
    console.log('\nFor auto-start on boot:')
    console.log('  loginctl enable-linger $USER')
  } catch {
    console.log('\nSystemd not available. You can still use the unit file manually.')
    console.log(`Unit file: ${unitFile}`)
  }
}
