# KenoBot Roadmap — OpenClaw Parity & Beyond

> Plan de mejoras para alcanzar paridad con OpenClaw y más allá.
> Cada feature incluye: descripción, uso ejemplo, implementación sugerida, y prioridad.

---

## 📊 Estado Actual vs OpenClaw

| Feature | OpenClaw | KenoBot | Prioridad |
|---------|:--------:|:-------:|:---------:|
| Telegram channel | ✅ | ✅ | — |
| Memory (daily + long-term) | ✅ | ✅ | — |
| Tool system | ✅ | ✅ | — |
| Skills/plugins | ✅ | ✅ | — |
| Self-improvement | ✅ | ✅ | — |
| Git/PR tools | ✅ | ✅ | — |
| Heartbeats | ✅ | ❌ | **P0** |
| Memory search | ✅ Semántico | ❌ | **P0** |
| Web search | ✅ Brave API | ❌ | **P1** |
| Image analysis | ✅ | ❌ | **P1** |
| Cron with context | ✅ | ⚠️ Básico | **P1** |
| Reactions | ✅ | ❌ | **P2** |
| Multi-channel | ✅ 7+ channels | ❌ Solo Telegram | **P2** |
| TTS | ✅ ElevenLabs | ❌ | **P3** |
| Browser automation | ✅ Playwright | ❌ | **P3** |
| Sub-agents | ✅ | ❌ | **P3** |
| Nodes (devices) | ✅ | ❌ | **P4** |

---

## P0 — Critical (Hacen al bot útil)

### 1. Heartbeat System

**Qué es:** Polling periódico que permite al bot ser proactivo en vez de solo reactivo.

**Cómo se usaría:**
```
# El bot revisa cada 30 minutos automáticamente
# Si hay algo importante, te notifica:

KenoBot: "Hey, tienes una reunión en 2 horas y 3 emails sin leer. ¿Quieres que te haga un resumen?"

# Si no hay nada:
# (silencio — no molesta)
```

**Configuración (.env):**
```bash
HEARTBEAT_ENABLED=true
HEARTBEAT_INTERVAL_MS=1800000  # 30 minutos
HEARTBEAT_QUIET_HOURS=23-8     # No molestar de 11pm a 8am
```

**Archivo HEARTBEAT.md:**
```markdown
# HEARTBEAT.md - Checklist Periódico

## Cada heartbeat
- [ ] ¿Emails urgentes sin leer?
- [ ] ¿Eventos en el calendario próximas 2 horas?
- [ ] ¿Tareas pendientes que vencen hoy?

## Si no hay nada que reportar
Responde: HEARTBEAT_OK
```

**Implementación sugerida:**

```javascript
// src/heartbeat.js
export default class Heartbeat {
  constructor(bus, config, { logger }) {
    this.bus = bus
    this.interval = config.heartbeatIntervalMs || 1800000
    this.quietHours = this._parseQuietHours(config.heartbeatQuietHours)
    this.logger = logger
    this.timer = null
  }

  start() {
    this.timer = setInterval(() => this._tick(), this.interval)
    this.logger.info('heartbeat', 'started', { intervalMs: this.interval })
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  async _tick() {
    if (this._isQuietHour()) return

    // Emit heartbeat event — AgentLoop picks it up
    this.bus.emit('heartbeat', {
      prompt: 'Read HEARTBEAT.md. Follow it. Reply HEARTBEAT_OK if nothing needs attention.',
      timestamp: Date.now()
    })
  }

  _isQuietHour() {
    const hour = new Date().getHours()
    return hour >= this.quietHours.start || hour < this.quietHours.end
  }
}
```

**Archivos a crear/modificar:**
- `src/heartbeat.js` — Heartbeat service
- `src/index.js` — Wire heartbeat to bus
- `src/agent/loop.js` — Handle heartbeat events
- `templates/HEARTBEAT.md` — Default checklist

**Esfuerzo estimado:** 4-6 horas

---

### 2. Memory Search

**Qué es:** Buscar en la memoria del bot (MEMORY.md + daily logs) por términos o semánticamente.

**Cómo se usaría:**
```
User: /memory search proyecto monato
Bot: Encontré 3 menciones:

1. memory/2026-02-04.md:15 — "Decidimos usar DDD para Monato"
2. memory/2026-02-10.md:42 — "Monato: reunión con el equipo de backend"
3. MEMORY.md:78 — "Proyectos activos: Monato (fintech)"

¿Quieres que expanda alguno?
```

```
User: ¿Qué decidimos sobre la arquitectura de Monato?
Bot: [busca automáticamente, encuentra contexto, responde informado]
```

**Implementación — Fase 1 (grep básico):**

```javascript
// src/tools/memory-search.js
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import BaseTool from './base.js'

export default class MemorySearchTool extends BaseTool {
  constructor(memoryDir) {
    super()
    this.memoryDir = memoryDir
  }

  get definition() {
    return {
      name: 'memory_search',
      description: 'Search through memory files (MEMORY.md and daily logs)',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or phrase' },
          limit: { type: 'number', description: 'Max results (default 10)' }
        },
        required: ['query']
      }
    }
  }

  get trigger() {
    return /^\/memory\s+search\s+(.+)/i
  }

  async execute({ query, limit = 10 }) {
    const results = []
    const files = await this._getMemoryFiles()

    for (const file of files) {
      const content = await readFile(file, 'utf8')
      const lines = content.split('\n')

      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            file: file.replace(this.memoryDir, ''),
            line: idx + 1,
            content: line.trim().slice(0, 100)
          })
        }
      })
    }

    return results.slice(0, limit)
  }

  async _getMemoryFiles() {
    // Get MEMORY.md + all daily logs
    const files = [join(this.memoryDir, 'MEMORY.md')]
    const entries = await readdir(this.memoryDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(join(this.memoryDir, entry.name))
      }
    }

    return files
  }
}
```

**Implementación — Fase 2 (semántico con embeddings):**

```javascript
// Usar sqlite-vec o similar para embeddings locales
// Requiere más investigación — OpenClaw usa un servicio externo

// Alternativa: usar el LLM para "resumir" la memoria
// y buscar en el resumen (más costoso pero funciona)
```

**Archivos a crear:**
- `src/tools/memory-search.js` — Search tool
- `test/tools/memory-search.test.js` — Tests

**Esfuerzo estimado:** 2-3 horas (grep), 8-12 horas (semántico)

---

## P1 — High (Mejoran significativamente la experiencia)

### 3. Web Search

**Qué es:** Buscar en la web directamente desde el chat.

**Cómo se usaría:**
```
User: /search mejores prácticas DDD Ruby
Bot: Encontré 5 resultados relevantes:

1. "Domain-Driven Design in Ruby" — martinfowler.com
   Guía completa de DDD aplicado a Ruby...

2. "Hanami and DDD" — hanami.dev
   Framework Ruby diseñado con DDD en mente...

[...]

¿Quieres que profundice en alguno?
```

**Configuración (.env):**
```bash
BRAVE_API_KEY=your_key_here  # Gratis para uso personal
# o
SEARCH_PROVIDER=duckduckgo   # Sin API key, scraping
```

**Implementación:**

```javascript
// src/tools/web-search.js
import BaseTool from './base.js'

export default class WebSearchTool extends BaseTool {
  constructor(apiKey) {
    super()
    this.apiKey = apiKey
    this.baseUrl = 'https://api.search.brave.com/res/v1/web/search'
  }

  get definition() {
    return {
      name: 'web_search',
      description: 'Search the web for current information',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: { type: 'number', description: 'Number of results (1-10)' }
        },
        required: ['query']
      }
    }
  }

  get trigger() {
    return /^\/search\s+(.+)/i
  }

  async execute({ query, count = 5 }) {
    const url = new URL(this.baseUrl)
    url.searchParams.set('q', query)
    url.searchParams.set('count', Math.min(count, 10))

    const response = await fetch(url, {
      headers: {
        'X-Subscription-Token': this.apiKey,
        'Accept': 'application/json'
      }
    })

    const data = await response.json()

    return data.web.results.map(r => ({
      title: r.title,
      url: r.url,
      description: r.description
    }))
  }
}

export function register(registry, { config }) {
  if (!config.braveApiKey) return
  registry.register(new WebSearchTool(config.braveApiKey))
}
```

**Esfuerzo estimado:** 2-3 horas

---

### 4. Image Analysis

**Qué es:** Recibir imágenes en Telegram y analizarlas con vision models.

**Cómo se usaría:**
```
User: [envía foto de un error en la terminal]
Bot: Veo un error de Node.js:

"TypeError: Cannot read property 'map' of undefined"

El problema está en la línea 42 de index.js. Parece que `data.items`
es undefined. ¿Quieres que te ayude a debuggearlo?
```

```
User: [envía screenshot de diseño]
Bot: Es un mockup de dashboard con:
- Sidebar izquierdo con navegación
- Header con search y user avatar
- Grid de cards con métricas
- Gráfico de barras en el centro

¿Necesitas que lo implemente o tienes preguntas sobre el diseño?
```

**Implementación:**

```javascript
// src/channels/telegram.js — modificar handleMessage
async handleMessage(ctx) {
  const photos = ctx.message?.photo
  if (photos && photos.length > 0) {
    // Get highest resolution photo
    const photo = photos[photos.length - 1]
    const file = await ctx.api.getFile(photo.file_id)
    const url = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`

    // Download and convert to base64
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    // Add to message context for provider
    return {
      text: ctx.message.caption || 'Describe this image',
      image: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64
      }
    }
  }
  // ... rest of handler
}

// src/providers/claude-api.js — modificar chat()
async chat(messages, options = {}) {
  const formattedMessages = messages.map(m => {
    if (m.image) {
      return {
        role: m.role,
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: m.image.media_type,
              data: m.image.data
            }
          },
          { type: 'text', text: m.text }
        ]
      }
    }
    return { role: m.role, content: m.text }
  })
  // ... rest of method
}
```

**Nota:** Requiere `claude-api` provider (claude-cli no soporta imágenes bien).

**Esfuerzo estimado:** 4-6 horas

---

### 5. Enhanced Scheduler

**Qué es:** Cron mejorado con contexto de sesión y lenguaje natural.

**Cómo se usaría:**
```
User: Recuérdame en 2 horas revisar el PR
Bot: ✅ Recordatorio programado para 20:39

[2 horas después]
Bot: ⏰ Recordatorio: Revisar el PR
¿Ya lo hiciste o lo reprogramamos?
```

```
User: Todos los lunes a las 9am hazme un resumen de la semana
Bot: ✅ Tarea programada: Resumen semanal (lunes 9:00)

[Lunes 9am]
Bot: 📋 Resumen de tu semana:
- 12 commits en kenobot
- 3 PRs mergeados
- 2 reuniones pendientes hoy
- Emails sin leer: 5
```

**Implementación — Natural language parsing:**

```javascript
// src/tools/remind.js
import BaseTool from './base.js'
import { parseDate } from 'chrono-node'  // npm package for natural dates

export default class RemindTool extends BaseTool {
  constructor(scheduler) {
    super()
    this.scheduler = scheduler
  }

  get definition() {
    return {
      name: 'remind',
      description: 'Set a reminder using natural language',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Reminder with time, e.g., "in 2 hours check PR"' }
        },
        required: ['text']
      }
    }
  }

  get trigger() {
    return /^\/remind\s+(.+)/i
  }

  async execute({ text }) {
    const parsed = parseDate(text)
    if (!parsed) {
      return "No pude entender cuándo. Intenta: 'in 2 hours', 'tomorrow at 9am', 'next monday'"
    }

    const task = text.replace(parsed.text, '').trim()
    const id = await this.scheduler.addOnce(parsed.date, {
      type: 'reminder',
      message: task
    })

    return `✅ Recordatorio programado para ${parsed.date.toLocaleString()}`
  }
}
```

**Dependencias:** `chrono-node` para parsing de fechas naturales

**Esfuerzo estimado:** 4-6 horas

---

## P2 — Medium (Nice to have)

### 6. Telegram Reactions

**Qué es:** Responder con emoji reactions en vez de mensajes completos.

**Cómo se usaría:**
```
User: Ya terminé el deploy
Bot: [reacciona con 🎉]

User: Me trabé con este bug 3 horas
Bot: [reacciona con 😅] ¿Quieres que le eche un ojo?
```

**Implementación:**

```javascript
// src/channels/telegram.js
async react(chatId, messageId, emoji) {
  await this.bot.api.setMessageReaction(chatId, messageId, [
    { type: 'emoji', emoji }
  ])
}

// En el agent loop, detectar cuándo reaccionar vs responder
// Criterios:
// - Mensaje corto de confirmación → reacción
// - Buenas noticias → 🎉
// - Frustración → 😅 + oferta de ayuda
// - Agradecimiento → ❤️
```

**Esfuerzo estimado:** 2-3 horas

---

### 7. Discord Channel

**Qué es:** Soporte para Discord además de Telegram.

**Implementación:**

```javascript
// src/channels/discord.js
import { Client, GatewayIntentBits } from 'discord.js'
import BaseChannel from './base.js'

export default class DiscordChannel extends BaseChannel {
  constructor(config, { bus, logger }) {
    super(config, { bus, logger })
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    })
  }

  async start() {
    this.client.on('messageCreate', (msg) => this.handleMessage(msg))
    await this.client.login(this.config.discordToken)
  }

  async handleMessage(msg) {
    if (msg.author.bot) return
    if (!this.isAllowed(msg.author.id)) return

    this.bus.emit('message:in', {
      channel: 'discord',
      chatId: msg.channelId,
      userId: msg.author.id,
      text: msg.content,
      replyTo: msg.id
    })
  }

  async send(chatId, text, options = {}) {
    const channel = await this.client.channels.fetch(chatId)
    await channel.send(text)
  }
}
```

**Esfuerzo estimado:** 6-8 horas

---

## P3 — Low (Futuro)

### 8. Text-to-Speech

**Qué es:** Convertir respuestas a audio para mensajes de voz.

**Cómo se usaría:**
```
User: /voice Cuéntame un resumen de mi día
Bot: [envía mensaje de voz con el resumen narrado]
```

**Implementación:** Integrar ElevenLabs API o Google TTS.

**Esfuerzo estimado:** 4-6 horas

---

### 9. Browser Automation

**Qué es:** Controlar un navegador para scraping avanzado o automatización.

**Implementación:** Playwright headless, similar a OpenClaw.

**Esfuerzo estimado:** 12-16 horas

---

### 10. Sub-agents

**Qué es:** Spawnar sesiones aisladas para tareas largas.

**Cómo se usaría:**
```
User: Investiga las mejores opciones de hosting para n8n y hazme un reporte
Bot: Voy a investigar en background. Te aviso cuando termine.

[30 minutos después]
Bot: 📋 Reporte listo: Comparativa de hosting para n8n
[adjunta documento]
```

**Esfuerzo estimado:** 12-16 horas

---

## 📅 Roadmap Sugerido

### Fase 1 — Fundamentos (2-3 semanas)
- [ ] Heartbeat system
- [ ] Memory search (grep)
- [ ] Web search (Brave)

### Fase 2 — Multimedia (2-3 semanas)
- [ ] Image analysis
- [ ] Telegram reactions
- [ ] Enhanced scheduler

### Fase 3 — Expansión (4-6 semanas)
- [ ] Discord channel
- [ ] TTS
- [ ] Memory search (semántico)

### Fase 4 — Avanzado (ongoing)
- [ ] Browser automation
- [ ] Sub-agents
- [ ] Más canales (Slack, WhatsApp)

---

## 🤝 Contribuir

Cada feature puede ser un PR independiente. Sigue el patrón:

1. Crear branch: `feat/heartbeat-system`
2. Implementar con tests
3. Actualizar docs
4. PR con changelog

El bot (yo) puede ayudar a implementar estas features vía `/dev kenobot`.

---

*Documento creado por KenoBot durante la migración desde OpenClaw — 2026-02-11*
