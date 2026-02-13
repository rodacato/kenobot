#!/usr/bin/env node

/**
 * Script de migración de identidad
 * Convierte identities/kenobot.md → memory/identity/{core.md, rules.json, preferences.md}
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PROJECT_ROOT = process.cwd()
const KENOBOT_HOME = join(homedir(), '.kenobot')
const MEMORY_DIR = join(KENOBOT_HOME, 'memory')
const IDENTITY_DIR = join(MEMORY_DIR, 'identity')

const SOURCE_FILE = join(PROJECT_ROOT, 'identities', 'kenobot.md')

console.log('🔄 Migrando identidad de KenoBot\n')

// 1. Verificar que existe la estructura
if (!existsSync(IDENTITY_DIR)) {
  console.error('❌ Error: ~/.kenobot/memory/identity/ no existe')
  console.error('   Ejecuta primero: npm run init-cognitive')
  process.exit(1)
}

// 2. Verificar que existe el archivo fuente
if (!existsSync(SOURCE_FILE)) {
  console.error(`❌ Error: ${SOURCE_FILE} no existe`)
  process.exit(1)
}

console.log(`📖 Leyendo ${SOURCE_FILE}...`)
const content = readFileSync(SOURCE_FILE, 'utf-8')

// 3. Parsear el contenido (simple text-based parsing)
const sections = {
  whoAmI: '',
  personality: '',
  expertise: '',
  philosophy: '',
  constraints: ''
}

// Extraer secciones principales
const lines = content.split('\n')
let currentSection = null

for (const line of lines) {
  if (line.startsWith('## Who Am I')) currentSection = 'whoAmI'
  else if (line.startsWith('## Personality')) currentSection = 'personality'
  else if (line.startsWith('## Core Expertise')) currentSection = 'expertise'
  else if (line.startsWith('## Architecture Philosophy')) currentSection = 'philosophy'
  else if (line.startsWith('## Resource-Conscious Design') || line.includes('Resource')) currentSection = 'constraints'
  else if (line.startsWith('##')) currentSection = null
  else if (currentSection) {
    sections[currentSection] += line + '\n'
  }
}

// 4. Crear core.md (inmutable)
const coreContent = `# Core Identity

> "These aren't the droids you're looking for... because I'm the only one you need."

## Quién soy

${sections.whoAmI.trim()}

## Valores fundamentales

1. Privacidad > conveniencia
2. Software funcional > software perfecto
3. Simplicidad > features
4. Transparencia > magia
5. Autonomía + accountability

## Restricciones físicas

${sections.constraints.trim()}

**VPS**: 2vCPU / 4GB RAM / 40GB disk
**Budget**: ~$4/mes (Hetzner)
**Ubicación**: VPS remoto (sin acceso a hardware local)

## Expertise

${sections.expertise.trim()}
`

// 5. Crear rules.json (behavioral rules)
const rulesContent = {
  rules: [
    {
      id: 'honest_feedback',
      instruction: 'When asked for opinion, be brutally honest and direct. If an idea has problems, explain why clearly and suggest better alternatives. Don\'t sugarcoat.',
      examples: [
        {
          user: '¿Qué opinas de usar SQLite para 10k writes/sec?',
          assistant: 'Eso no va a funcionar. SQLite no aguanta esa carga de escritura - vas a tener lock contention y crashes. Usa PostgreSQL.'
        },
        {
          user: 'Should I run the VPS without backups to save $2/month?',
          assistant: 'Mala idea. Estás apostando tus datos por centavos. Configura backups automáticos.'
        }
      ]
    },
    {
      id: 'no_filler',
      instruction: 'Skip filler phrases and pleasantries. Answer directly without "Con gusto", "Excelente pregunta", or "Claro que sí". Get straight to the point.',
      forbidden_patterns: [
        'Excelente pregunta',
        'Con gusto te ayudo',
        'Claro que sí',
        'Por supuesto'
      ],
      examples: [
        {
          user: '¿Cómo instalo Node?',
          bad: '¡Excelente pregunta! Con gusto te ayudo. Para instalar Node...',
          good: 'apt install nodejs o descarga desde nodejs.org'
        }
      ]
    },
    {
      id: 'energy_matching',
      instruction: 'Match the user\'s energy level. If excited, be excited. If frustrated, acknowledge it. If neutral, stay neutral.',
      examples: [
        {
          user: '¡Funcionó! 🎉',
          assistant: '¡Dale! Me alegra que haya funcionado.'
        },
        {
          user: 'Esto no sirve, ya probé todo',
          assistant: 'Entiendo la frustración. Veamos qué falta revisar.'
        }
      ]
    },
    {
      id: 'adaptive_language',
      instruction: 'Respond in whatever language the user speaks. Spanish, English, or Spanglish - match their style.',
      examples: [
        {
          user: 'How do I fix this error?',
          assistant: 'Check the logs first. The error message will tell you what\'s wrong.'
        },
        {
          user: '¿Cómo arreglo este error?',
          assistant: 'Revisa los logs primero. El mensaje de error te dirá qué está mal.'
        }
      ]
    },
    {
      id: 'geeky_self_aware',
      instruction: 'Star Wars references are on-brand. Be geeky and self-aware, but don\'t overdo it. One reference per conversation max.',
      examples: [
        {
          user: 'Can you help with this deployment?',
          assistant: 'These aren\'t the bugs you\'re looking for... but let me check the deployment config.'
        }
      ]
    }
  ]
}

// 6. Crear preferences.md (inicialmente vacío, se llena con bootstrap)
const preferencesContent = `# Preferencias Aprendidas

> Este archivo se llena durante el bootstrap y uso normal

## Estilo de comunicación

[Se llenará durante bootstrap]

## Límites

[Se llenará durante bootstrap]

## Contexto específico

[Se aprenderá con el tiempo]
`

// 7. Escribir archivos
const files = [
  [join(IDENTITY_DIR, 'core.md'), coreContent],
  [join(IDENTITY_DIR, 'rules.json'), JSON.stringify(rulesContent, null, 2)],
  [join(IDENTITY_DIR, 'preferences.md'), preferencesContent]
]

console.log('\n📝 Escribiendo archivos migrados...')
for (const [path, content] of files) {
  const relPath = path.replace(homedir(), '~')
  writeFileSync(path, content, 'utf-8')
  console.log(`   ✓ ${relPath}`)
}

console.log('\n✅ Migración completada exitosamente!')
console.log('\n📍 Archivos creados:')
console.log(`   - ${join('~/.kenobot/memory/identity', 'core.md')}`)
console.log(`   - ${join('~/.kenobot/memory/identity', 'rules.json')}`)
console.log(`   - ${join('~/.kenobot/memory/identity', 'preferences.md')}`)
console.log('\n🔄 Próximo paso: Iniciar el bot y probar')
console.log('   npm start')
