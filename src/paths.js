import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Engine root is always one level up from src/
const engineRoot = resolve(__dirname, '..')

// User home: always ~/.kenobot/ unless KENOBOT_HOME is set
const home = process.env.KENOBOT_HOME || join(homedir(), '.kenobot')

const paths = {
  home,
  engine: engineRoot,

  // Config files (user-owned, never overwritten by updates)
  config: join(home, 'config'),
  envFile: join(home, 'config', '.env'),
  identities: join(home, 'config', 'identities'),
  skills: join(home, 'config', 'skills'),
  tools: join(home, 'config', 'tools'),

  // Runtime data
  data: join(home, 'data'),
  backups: join(home, 'backups'),
  pidFile: join(home, 'data', 'kenobot.pid'),

  // Templates (shipped with engine, used by kenobot setup)
  templates: join(engineRoot, 'templates'),
}

export default paths
