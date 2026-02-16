import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Engine root is two levels up from src/infrastructure/
const engineRoot = resolve(__dirname, '../..')

// User home: always ~/.kenobot/
const home = join(homedir(), '.kenobot')

const paths = {
  home,
  engine: engineRoot,

  // Config files (user-owned, never overwritten by updates)
  config: join(home, 'config'),
  envFile: join(home, 'config', '.env'),

  // Runtime data
  data: join(home, 'data'),
  memory: join(home, 'memory'),
  backups: join(home, 'backups'),
  pidFile: join(home, 'data', 'kenobot.pid'),

  // Templates (shipped with engine, used by kenobot setup)
  templates: join(engineRoot, 'templates'),
}

export default paths
