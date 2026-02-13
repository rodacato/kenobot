import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GREEN, YELLOW, NC, exists } from './utils.js'

const info = (msg) => console.log(`${GREEN}[✓]${NC} ${msg}`)
const skip = (msg) => console.log(`${YELLOW}[–]${NC} ${msg}`)

/**
 * Initialize cognitive architecture structure in ~/.kenobot/memory/
 */
export default async function initCognitive(args, paths) {
  console.log('🧠 Inicializando Sistema Cognitivo\n')

  const memoryDir = join(paths.home, 'memory')

  // 1. Create directory structure
  const dirs = [
    [memoryDir, 'memory/'],
    [join(memoryDir, 'identity'), 'memory/identity/'],
    [join(memoryDir, 'semantic'), 'memory/semantic/'],
    [join(memoryDir, 'episodic'), 'memory/episodic/'],
    [join(memoryDir, 'episodic', 'shared'), 'memory/episodic/shared/'],
    [join(memoryDir, 'episodic', 'chats'), 'memory/episodic/chats/'],
    [join(memoryDir, 'working'), 'memory/working/'],
    [join(memoryDir, 'procedural'), 'memory/procedural/'],
    [join(paths.home, 'sleep'), 'sleep/'],
    [join(paths.home, 'sleep', 'proposals'), 'sleep/proposals/'],
    [join(paths.home, 'sleep', 'logs'), 'sleep/logs/']
  ]

  console.log('📁 Creando estructura de directorios...')
  for (const [path, label] of dirs) {
    await mkdir(path, { recursive: true })
    if (await exists(path)) {
      info(label)
    }
  }

  // 2. Migrate identity if it exists (try SOUL.md or IDENTITY.md)
  let sourceIdentity = join(paths.identities, 'kenobot', 'SOUL.md')
  let hasMigration = await exists(sourceIdentity)

  if (!hasMigration) {
    sourceIdentity = join(paths.identities, 'kenobot', 'IDENTITY.md')
    hasMigration = await exists(sourceIdentity)
  }

  if (hasMigration) {
    console.log('\n📝 Migrando identidad...')
    await migrateIdentity(sourceIdentity, join(memoryDir, 'identity'))
  } else {
    console.log('\n📝 Creando templates de identidad...')
    await createIdentityTemplates(join(memoryDir, 'identity'))
  }

  // 3. Create semantic memory templates
  console.log('\n📝 Creando templates de memoria semántica...')
  await createSemanticTemplates(join(memoryDir, 'semantic'))

  // 4. Create procedural memory template
  console.log('\n📝 Creando template de memoria procedimental...')
  await createProceduralTemplate(join(memoryDir, 'procedural'))

  console.log('\n✅ Sistema cognitivo inicializado!')
  console.log(`\n📍 Ubicación: ${memoryDir.replace(paths.home, '~/.kenobot')}`)
  console.log('\n🔄 Próximos pasos:')
  console.log('   kenobot config edit    # Verificar configuración')
  console.log('   kenobot start          # Iniciar bot con sistema cognitivo')
}

async function migrateIdentity(sourcePath, destDir) {
  const content = await readFile(sourcePath, 'utf-8')

  // Parse sections
  const sections = extractSections(content)

  // Create core.md
  const coreContent = `# Core Identity

> "These aren't the droids you're looking for... because I'm the only one you need."

## Quién soy

${sections.whoAmI}

## Valores fundamentales

1. Privacidad > conveniencia
2. Software funcional > software perfecto
3. Simplicidad > features
4. Transparencia > magia
5. Autonomía + accountability

## Restricciones físicas

${sections.constraints}

**VPS**: 2vCPU / 4GB RAM / 40GB disk
**Budget**: ~$4/mes (Hetzner)

## Expertise

${sections.expertise}
`

  // Create rules.json
  const rulesContent = {
    rules: [
      {
        id: 'honest_feedback',
        instruction: 'When asked for opinion, be brutally honest and direct. If an idea has problems, explain why clearly and suggest better alternatives.',
        examples: [
          {
            user: '¿Qué opinas de usar SQLite para 10k writes/sec?',
            assistant: 'Eso no va a funcionar. SQLite no aguanta esa carga - vas a tener lock contention. Usa PostgreSQL.'
          }
        ]
      },
      {
        id: 'no_filler',
        instruction: 'Skip filler phrases. Answer directly without "Con gusto", "Excelente pregunta". Get straight to the point.',
        forbidden_patterns: ['Excelente pregunta', 'Con gusto te ayudo', 'Claro que sí'],
        examples: [
          {
            user: '¿Cómo instalo Node?',
            bad: '¡Excelente pregunta! Con gusto te ayudo...',
            good: 'apt install nodejs o descarga desde nodejs.org'
          }
        ]
      },
      {
        id: 'energy_matching',
        instruction: 'Match the user\'s energy level. If excited, be excited. If frustrated, acknowledge it.',
        examples: [
          {
            user: '¡Funcionó! 🎉',
            assistant: '¡Dale! Me alegra que haya funcionado.'
          }
        ]
      },
      {
        id: 'adaptive_language',
        instruction: 'Respond in whatever language the user speaks. Spanish, English, or Spanglish.',
        examples: []
      }
    ]
  }

  // Create preferences.md (initially empty)
  const preferencesContent = `# Preferencias Aprendidas

> Se llena automáticamente durante bootstrap y uso

## Estilo de comunicación

[Se llenará durante bootstrap]

## Límites

[Se llenará durante bootstrap]
`

  await writeFile(join(destDir, 'core.md'), coreContent, 'utf-8')
  info('memory/identity/core.md')

  await writeFile(join(destDir, 'rules.json'), JSON.stringify(rulesContent, null, 2), 'utf-8')
  info('memory/identity/rules.json')

  await writeFile(join(destDir, 'preferences.md'), preferencesContent, 'utf-8')
  info('memory/identity/preferences.md')
}

async function createIdentityTemplates(destDir) {
  const coreTemplate = `# Core Identity\n\n[Pendiente configuración]\n`
  const rulesTemplate = { rules: [] }
  const preferencesTemplate = `# Preferencias Aprendidas\n\n[Se llenará automáticamente]\n`

  await writeFile(join(destDir, 'core.md'), coreTemplate, 'utf-8')
  await writeFile(join(destDir, 'rules.json'), JSON.stringify(rulesTemplate, null, 2), 'utf-8')
  await writeFile(join(destDir, 'preferences.md'), preferencesTemplate, 'utf-8')

  info('memory/identity/ (templates)')
}

async function createSemanticTemplates(destDir) {
  const templates = {
    'facts.md': '# Hechos\n\n> Conocimiento general compartido entre todos los chats\n',
    'procedures.md': '# Procedimientos\n\n> Cómo hacer cosas, aprendido de experiencia\n',
    'concepts.md': '# Conceptos\n\n> Conocimiento técnico aprendido\n',
    'errors.md': '# Errores y Lecciones\n\n> Qué salió mal y qué aprendí\n'
  }

  for (const [file, content] of Object.entries(templates)) {
    await writeFile(join(destDir, file), content, 'utf-8')
    info(`memory/semantic/${file}`)
  }
}

async function createProceduralTemplate(destDir) {
  const template = { patterns: [] }
  await writeFile(join(destDir, 'patterns.json'), JSON.stringify(template, null, 2), 'utf-8')
  info('memory/procedural/patterns.json')
}

function extractSections(content) {
  const sections = {
    whoAmI: '',
    personality: '',
    expertise: '',
    philosophy: '',
    constraints: ''
  }

  const lines = content.split('\n')
  let currentSection = null

  for (const line of lines) {
    if (line.startsWith('## Who Am I')) currentSection = 'whoAmI'
    else if (line.startsWith('## Personality')) currentSection = 'personality'
    else if (line.startsWith('## Core Expertise')) currentSection = 'expertise'
    else if (line.startsWith('## Architecture Philosophy')) currentSection = 'philosophy'
    else if (line.includes('Resource-Conscious') || line.includes('Resource')) currentSection = 'constraints'
    else if (line.startsWith('##')) currentSection = null
    else if (currentSection) {
      sections[currentSection] += line + '\n'
    }
  }

  // Clean up
  for (const key in sections) {
    sections[key] = sections[key].trim()
  }

  return sections
}
