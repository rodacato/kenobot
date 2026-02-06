# Getting Started with KenoBot

Esta guía te llevará paso a paso desde cero hasta tener KenoBot funcionando.

## 📋 Prerequisitos

- ✅ Node.js 22+ (ya instalado en devcontainer)
- ✅ Cuenta de Telegram
- ⏳ 10 minutos de tu tiempo

## 🚀 Pasos

### Paso 1: Crear tu bot de Telegram (obtener TOKEN)

> 🎯 **Objetivo**: Obtener el **TOKEN** del bot (credencial de autenticación)

1. **Abre Telegram** en tu teléfono o desktop

2. **Busca @BotFather** (es el bot oficial de Telegram para crear bots)

3. **Envía el comando**:
   ```
   /newbot
   ```

4. **Sigue las instrucciones**:
   - **Bot name**: Elige un nombre (ej: "Mi KenoBot")
   - **Username**: Debe terminar en "bot" (ej: "mi_kenobot_bot")

5. **Copia el TOKEN** que te da BotFather. Se ve así:
   ```
   7891234567:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
   ```

   ⚠️ **Esto es el TOKEN del bot** (la "contraseña" del bot).
   📝 Guárdalo en un lugar seguro, lo necesitarás en el paso 3.

### Paso 2: Obtener TU Chat ID (tu identificación personal)

> 🎯 **Objetivo**: Obtener **TU CHAT ID** (tu identificación como usuario de Telegram)

**⚠️ IMPORTANTE**: Este es un paso **diferente** al anterior. Ahora necesitas **TU** ID, no el del bot.

1. **Busca @userinfobot** en Telegram (bot diferente a BotFather)

2. **Envía el comando**:
   ```
   /start
   ```

3. **Copia el número del "Id:"**. Te responderá algo como:
   ```
   @rodacato
   Id: 63059997          ← COPIA ESTE NÚMERO
   First: Adrian
   Last: Castillo
   Lang: en
   ```

   ⚠️ **Esto es TU CHAT ID** (tu identificación personal).
   📝 Guárdalo, lo necesitarás en el paso 3.

**💡 ¿Por qué necesito esto?**
Para que el bot solo te responda **a ti** y no a cualquier persona que le escriba.

### Paso 3: Configurar KenoBot

Desde la terminal en `/workspaces/kenobot`, ejecuta:

```bash
# Copiar el template de configuración
cp .env.example .env
```

Ahora **edita el archivo `.env`** con tus valores:

```bash
# Opción 1: Usar nano
nano .env

# Opción 2: Usar vim
vim .env

# Opción 3: Usar el editor de VSCode
code .env
```

**Modifica estas líneas**:

```bash
# Pega el token que te dio BotFather
TELEGRAM_BOT_TOKEN=PEGA_AQUI_TU_TOKEN

# Pega tu chat ID (el número que te dio userinfobot)
TELEGRAM_ALLOWED_CHAT_IDS=PEGA_AQUI_TU_CHAT_ID

# Para testing, usa el mock provider
PROVIDER=mock

# Modelo (no importa para mock, pero dejalo)
MODEL=sonnet
```

**Ejemplo completo**:
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ALLOWED_CHAT_IDS=123456789
PROVIDER=mock
MODEL=sonnet
```

Guarda el archivo:
- En nano: `Ctrl+X`, luego `Y`, luego `Enter`
- En vim: `:wq`
- En VSCode: `Ctrl+S`

### Paso 4: Verificar la configuración

```bash
# Ver tu .env (sin mostrar tokens sensibles)
cat .env | grep -v "TOKEN"
```

Deberías ver algo como:
```
TELEGRAM_ALLOWED_CHAT_IDS=123456789
PROVIDER=mock
MODEL=sonnet
```

### Paso 5: Arrancar KenoBot

```bash
npm start
```

**Deberías ver**:
```
🤖 KenoBot starting...
   Provider: mock
   Model: sonnet
   Allowed chat IDs: 123456789
   ⚠️  Using MOCK provider (for testing only)

[telegram] Starting Telegram bot...
[telegram] ✓ Bot started successfully
```

✅ **Si ves esto, KenoBot está corriendo!**

❌ **Si ves errores**:

- `Missing required config: TELEGRAM_BOT_TOKEN`
  → Edita tu `.env`, falta el token

- `Error: 401 Unauthorized`
  → Token de Telegram incorrecto, verifica que lo copiaste bien

- `Cannot find module 'grammy'`
  → Corre `npm install` primero

### Paso 6: Probar tu bot

1. **Abre Telegram**

2. **Busca tu bot** por el username que le diste (ej: `@mi_kenobot_bot`)

3. **Inicia la conversación**:
   ```
   /start
   ```

4. **Envía un mensaje**:
   ```
   Hello there!
   ```

5. **El bot debería responder**:
   ```
   Hello there! General Kenobi! 🤖

   I'm KenoBot, running in mock mode for testing. The Force is strong with this one!
   ```

### Paso 7: Verificar los logs

En la terminal donde corre KenoBot deberías ver:

```
[message:in] 123456789: Hello there!
[mock] Response: Hello there! General Kenobi! 🤖...
```

✅ **Si ves esto, el flow completo funciona!**

### Paso 8: Probar más funcionalidad

**Envía diferentes mensajes**:

```
help
```
```
testing 123
```
```
any message works!
```

**Mensaje largo** (copia este lorem ipsum y envíalo):
```
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. [... repite esto 20 veces para pasar 4000 chars ...]
```

Debería split en múltiples mensajes (chunking).

### Paso 9: Detener el bot

En la terminal, presiona:
```
Ctrl+C
```

Deberías ver:
```
^C
[shutdown] SIGINT received, shutting down gracefully...
[telegram] Stopping bot...
```

✅ **Shutdown limpio!**

---

## 🎯 Validación Completa

- [ ] Bot arranca sin errores
- [ ] Puedes enviar mensaje y recibir respuesta
- [ ] Logs muestran `[message:in]` y `[mock]`
- [ ] Mensajes largos se separan en chunks
- [ ] Ctrl+C detiene el bot limpiamente

**Si todos los checks pasan: ¡Phase 0 funciona! 🎉**

---

## ⏭️ Próximos Pasos

### Cambiar a Claude real (opcional)

Una vez que el mock funciona, puedes cambiar a Claude real:

**Opción A: Claude CLI** (requiere usuario no-root)
```bash
# .env
PROVIDER=claude-cli
MODEL=sonnet
```

**Opción B: Claude API** (requiere API key de Anthropic)
```bash
# .env
PROVIDER=claude-api
MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=tu_api_key_aqui
```

*Nota: La API provider se implementará después del testing con mock.*

### Continuar a Phase 1

Phase 1 agregará:
- Agent loop estructurado
- Context building (identity + memory + history)
- Session persistence (JSONL files)
- Multi-context support (sesiones por chat)

---

## 🆘 Troubleshooting

### El bot no responde

1. **Verifica que está corriendo**:
   - Debe mostrar `[telegram] ✓ Bot started successfully`

2. **Verifica el chat ID**:
   - En logs, cuando envías mensaje, debe mostrar `[message:in] TU_CHAT_ID: ...`
   - Si muestra `Rejected message from unauthorized user`, tu chat ID no coincide

3. **Reinicia el bot**:
   ```bash
   Ctrl+C
   npm start
   ```

### "Error: 401 Unauthorized"

- Token de Telegram incorrecto
- Verifica en BotFather que el token esté activo
- Copia-pega de nuevo el token completo

### "Missing required config"

- Tu `.env` no tiene todos los valores
- Revisa que tenga:
  - `TELEGRAM_BOT_TOKEN=...`
  - `TELEGRAM_ALLOWED_CHAT_IDS=...`

### El bot responde a cualquier persona

- Esto es un problema de seguridad
- Verifica que `TELEGRAM_ALLOWED_CHAT_IDS` tenga TU chat ID
- Verifica los logs: debe rechazar usuarios no autorizados

---

## ❓ FAQ (Preguntas Frecuentes)

### ¿Cuál es la diferencia entre Token y Chat ID?

Son **dos cosas completamente diferentes**:

| Concepto | Qué es | Dónde lo obtienes | Para qué sirve |
|----------|--------|-------------------|----------------|
| **Token del Bot** | Credencial de tu bot | @BotFather | Autenticar tu bot con Telegram |
| **Chat ID** | TU ID de usuario | @userinfobot | Identificarte como usuario autorizado |

**Analogía**:
- **Token** = Contraseña del bot (como la llave de una casa)
- **Chat ID** = Tu identificación personal (como tu cédula)

### ¿Por qué necesito MI chat ID y no el del bot?

Porque KenoBot usa tu Chat ID para **seguridad**:

```javascript
// Cuando TÚ le envías un mensaje al bot:
{
  userId: 63059997,        // TU Chat ID (el que sacaste de @userinfobot)
  text: "Hello there!"
}

// El bot verifica:
if (userId === TELEGRAM_ALLOWED_CHAT_IDS) {
  // ✅ Eres tú, te respondo
} else {
  // ❌ No eres tú, te ignoro
}
```

Esto previene que **otras personas** usen tu bot.

### ¿Qué hace cada bot?

| Bot | Función | Comandos |
|-----|---------|----------|
| **@BotFather** | Crear y gestionar bots | `/newbot` - Crear bot<br>`/mybots` - Ver tus bots |
| **@userinfobot** | Ver tu información de usuario | `/start` - Ver tu ID |
| **@k3noBot** | TU bot (el que creaste) | Lo que tú programes |

### ¿Los números que veo son correctos?

Sí. Ejemplos reales:

```bash
# Token del bot (de @BotFather)
TELEGRAM_BOT_TOKEN=7891234567:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
#                  ^^^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#                  Bot ID    Token secreto (no compartir)

# Tu Chat ID (de @userinfobot)
TELEGRAM_ALLOWED_CHAT_IDS=63059997
#                         ^^^^^^^^
#                         Tu ID de usuario
```

### ¿Puedo usar el mismo bot en varios dispositivos?

Sí. El **token del bot** es el mismo, pero cada **persona** tiene su propio **Chat ID**.

Si quieres que otra persona use el bot:
```bash
# Múltiples usuarios (separados por coma)
TELEGRAM_ALLOWED_CHAT_IDS=63059997,87654321,12345678
```

### ¿Qué pasa si alguien más envía un mensaje a mi bot?

KenoBot lo rechaza automáticamente (deny by default):

```
[telegram] Rejected message from unauthorized user: 87654321
```

Solo TÚ (con tu Chat ID) recibes respuestas.

### ¿Por qué usar mock provider primero?

Porque estamos en **devcontainer como root**, y Claude CLI no permite `--dangerously-skip-permissions` como root (seguridad).

Opciones:
1. **Mock** (actual): Testing sin LLM real ✅
2. **Claude API**: Requiere API key de Anthropic
3. **Claude CLI**: Requiere usuario no-root

Mock te permite probar que **todo el flow funciona** antes de configurar autenticación.

### ¿Cuándo cambio a Claude real?

Después de validar que mock funciona:

```bash
# Opción 1: Claude API (recomendado)
PROVIDER=claude-api
ANTHROPIC_API_KEY=tu_api_key

# Opción 2: Claude CLI (requiere setup de usuario no-root)
PROVIDER=claude-cli
```

---

## 📚 Recursos

- [Telegram BotFather](https://t.me/botfather) - Crear bots
- [Telegram UserInfo Bot](https://t.me/userinfobot) - Obtener tu Chat ID
- [KenoBot Plan](./docs/PLAN.md) - Roadmap completo
- [Architecture Docs](./docs/AGENTS.md) - Diseño del sistema

---

## 💡 Tips

- **Guarda tu token en lugar seguro**: Cualquiera con el token puede controlar tu bot
- **No commitees el `.env`**: Ya está en `.gitignore`, pero verifica
- **Logs son tus amigos**: Si algo falla, `[error]` te dirá qué pasó
- **Mock es temporal**: Una vez que funcione, cambia a provider real

---

**¿Problemas? Revisa los logs, son tu mejor amigo para debugging.**

May the Force be with you! 🤖✨
