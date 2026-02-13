#!/usr/bin/env node

/**
 * Test de integración del sistema cognitivo
 * Verifica que todos los componentes se conecten correctamente
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'

console.log('🧪 Test de Integración del Sistema Cognitivo\n')

const home = join(homedir(), '.kenobot')
const checks = []

// 1. Verificar estructura de archivos
console.log('📁 Verificando estructura de archivos...')

const requiredPaths = [
  ['memory/identity/core.md', 'Identidad Core'],
  ['memory/identity/rules.json', 'Reglas conductuales'],
  ['memory/identity/preferences.md', 'Preferencias'],
  ['memory/semantic/facts.md', 'Memoria semántica - Facts'],
  ['memory/semantic/procedures.md', 'Memoria semántica - Procedures'],
  ['memory/episodic/shared', 'Memoria episódica - Shared'],
  ['memory/episodic/chats', 'Memoria episódica - Chats'],
  ['memory/working', 'Memoria de trabajo'],
  ['memory/procedural/patterns.json', 'Memoria procedimental']
]

for (const [path, label] of requiredPaths) {
  const fullPath = join(home, path)
  const exists = existsSync(fullPath)
  checks.push({ label, exists, path: fullPath })
  console.log(`   ${exists ? '✓' : '✗'} ${label}`)
}

// 2. Verificar contenido de identidad migrada
console.log('\n📝 Verificando migración de identidad...')

const corePath = join(home, 'memory/identity/core.md')
if (existsSync(corePath)) {
  const content = readFileSync(corePath, 'utf-8')
  const hasContent = content.includes('KenoBot') || content.includes('Quién soy')
  console.log(`   ${hasContent ? '✓' : '✗'} Core identity tiene contenido`)
  checks.push({ label: 'Core identity migrada', exists: hasContent })
} else {
  console.log('   ✗ Core identity no encontrada')
  checks.push({ label: 'Core identity migrada', exists: false })
}

const rulesPath = join(home, 'memory/identity/rules.json')
if (existsSync(rulesPath)) {
  try {
    const rules = JSON.parse(readFileSync(rulesPath, 'utf-8'))
    const hasRules = rules.rules && rules.rules.length > 0
    console.log(`   ${hasRules ? '✓' : '✗'} Behavioral rules: ${rules.rules?.length || 0} reglas`)
    checks.push({ label: 'Behavioral rules', exists: hasRules })
  } catch (err) {
    console.log(`   ✗ Error parseando rules.json: ${err.message}`)
    checks.push({ label: 'Behavioral rules', exists: false })
  }
} else {
  console.log('   ✗ rules.json no encontrado')
  checks.push({ label: 'Behavioral rules', exists: false })
}

// 3. Verificar configuración
console.log('\n⚙️  Verificando configuración...')

const envPath = join(home, 'config/.env')
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf-8')
  const hasProvider = env.includes('PROVIDER=claude-cli')
  const hasToken = env.includes('TELEGRAM_BOT_TOKEN=') && !env.includes('your_bot_token_here')
  console.log(`   ${hasProvider ? '✓' : '✗'} Provider configurado`)
  console.log(`   ${hasToken ? '✓' : '✗'} Telegram token configurado`)
  checks.push({ label: 'Provider configurado', exists: hasProvider })
  checks.push({ label: 'Telegram token', exists: hasToken })
} else {
  console.log('   ✗ .env no encontrado')
  checks.push({ label: 'Configuración', exists: false })
}

// 4. Resumen
console.log('\n📊 Resumen:\n')

const passed = checks.filter(c => c.exists).length
const total = checks.length
const percentage = Math.round((passed / total) * 100)

console.log(`   ${passed}/${total} checks pasaron (${percentage}%)`)

if (percentage === 100) {
  console.log('\n✅ Sistema cognitivo completamente instalado y listo!')
  console.log('\n🚀 Próximos pasos:')
  console.log('   1. npm start          # Iniciar bot')
  console.log('   2. Enviar mensaje vía Telegram para probar')
  console.log('   3. Verificar logs para confirmar uso cognitivo')
  process.exit(0)
} else if (percentage >= 80) {
  console.log('\n⚠️  Sistema casi listo - revisa los checks fallidos arriba')
  process.exit(1)
} else {
  console.log('\n❌ Sistema no está listo - ejecuta:')
  console.log('   node src/cli.js init')
  console.log('   node src/cli.js init-cognitive')
  process.exit(1)
}
