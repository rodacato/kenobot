#!/usr/bin/env node

/**
 * Script de inicialización del sistema cognitivo
 * Crea la estructura de archivos ~/.kenobot/memory/ desde cero
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const KENOBOT_HOME = join(homedir(), '.kenobot')
const MEMORY_DIR = join(KENOBOT_HOME, 'memory')

console.log('🧠 Inicializando sistema cognitivo de KenoBot\n')

// 1. Crear estructura de directorios
const dirs = [
  MEMORY_DIR,
  join(MEMORY_DIR, 'identity'),
  join(MEMORY_DIR, 'semantic'),
  join(MEMORY_DIR, 'episodic'),
  join(MEMORY_DIR, 'episodic', 'shared'),
  join(MEMORY_DIR, 'episodic', 'chats'),
  join(MEMORY_DIR, 'working'),
  join(MEMORY_DIR, 'procedural'),
  join(KENOBOT_HOME, 'sleep'),
  join(KENOBOT_HOME, 'sleep', 'proposals'),
  join(KENOBOT_HOME, 'sleep', 'logs')
]

console.log('📁 Creando directorios...')
for (const dir of dirs) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`   ✓ ${dir.replace(homedir(), '~')}`)
  } else {
    console.log(`   - ${dir.replace(homedir(), '~')} (ya existe)`)
  }
}

// 2. Crear archivos template
console.log('\n📝 Creando archivos template...')

// identity/core.md (se llenará con migrate-identity)
const coreTemplate = `# Core Identity

> Placeholder - usar migrate-identity para migrar desde identities/kenobot.md

## Quién soy

[Pendiente migración]

## Valores fundamentales

[Pendiente migración]

## Restricciones físicas

[Pendiente migración]
`

// identity/rules.json
const rulesTemplate = {
  rules: [
    {
      id: 'example_rule',
      instruction: 'This is an example rule. Use migrate-identity to populate real rules.',
      examples: [
        {
          user: 'Example question?',
          assistant: 'Example response.'
        }
      ]
    }
  ]
}

// identity/preferences.md
const preferencesTemplate = `# Preferencias Aprendidas

> Este archivo se llena automáticamente durante el bootstrap y uso normal

## Estilo de comunicación

[Se llenará durante bootstrap]

## Límites

[Se llenará durante bootstrap]

## Contexto específico

[Se aprenderá con el tiempo]
`

// semantic/facts.md
const factsTemplate = `# Hechos

> Conocimiento general que aplica en todos los chats

## Sobre el usuario

[Se llenará con el tiempo]

## Sobre el entorno

[Se llenará con el tiempo]
`

// semantic/procedures.md
const proceduresTemplate = `# Procedimientos

> Cómo hacer cosas específicas, aprendido de experiencia

[Se llenará durante sleep cycles]
`

// semantic/concepts.md
const conceptsTemplate = `# Conceptos

> Conceptos técnicos y conocimiento aprendido

[Se llenará con el tiempo]
`

// semantic/errors.md
const errorsTemplate = `# Errores y Lecciones

> Errores cometidos y qué aprendí de ellos

[Se llenará durante sleep cycles]
`

// procedural/patterns.json
const patternsTemplate = {
  patterns: []
}

// Escribir archivos
const files = [
  [join(MEMORY_DIR, 'identity', 'core.md'), coreTemplate],
  [join(MEMORY_DIR, 'identity', 'rules.json'), JSON.stringify(rulesTemplate, null, 2)],
  [join(MEMORY_DIR, 'identity', 'preferences.md'), preferencesTemplate],
  [join(MEMORY_DIR, 'semantic', 'facts.md'), factsTemplate],
  [join(MEMORY_DIR, 'semantic', 'procedures.md'), proceduresTemplate],
  [join(MEMORY_DIR, 'semantic', 'concepts.md'), conceptsTemplate],
  [join(MEMORY_DIR, 'semantic', 'errors.md'), errorsTemplate],
  [join(MEMORY_DIR, 'procedural', 'patterns.json'), JSON.stringify(patternsTemplate, null, 2)]
]

for (const [path, content] of files) {
  const relPath = path.replace(homedir(), '~')
  if (!existsSync(path)) {
    writeFileSync(path, content, 'utf-8')
    console.log(`   ✓ ${relPath}`)
  } else {
    console.log(`   - ${relPath} (ya existe, no sobrescribir)`)
  }
}

console.log('\n✅ Estructura cognitiva creada exitosamente!')
console.log('\n📍 Ubicación:', MEMORY_DIR.replace(homedir(), '~'))
console.log('\n🔄 Próximo paso: Ejecutar migrate-identity para migrar la identidad actual')
console.log('   npm run migrate-identity')
