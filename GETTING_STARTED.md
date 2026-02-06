# Getting Started with KenoBot

Esta guía te llevará paso a paso desde cero hasta tener KenoBot funcionando.

## 📋 Prerequisitos

- ✅ Node.js 22+ (ya instalado en devcontainer)
- ✅ Cuenta de Telegram
- ⏳ 10 minutos de tu tiempo

## 🚀 Pasos

### Paso 1: Crear tu bot de Telegram

1. **Abre Telegram** en tu teléfono o desktop

2. **Busca @BotFather** (es el bot oficial para crear bots)

3. **Envía el comando**:
   ```
   /newbot
   ```

4. **Sigue las instrucciones**:
   - **Bot name**: Elige un nombre (ej: "Mi KenoBot")
   - **Username**: Debe terminar en "bot" (ej: "mi_kenobot_bot")

5. **Copia el token** que te da BotFather. Se ve así:
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

   ⚠️ **IMPORTANTE**: Guarda este token, lo necesitarás en el paso 3.

### Paso 2: Obtener tu Telegram Chat ID

1. **Busca @userinfobot** en Telegram

2. **Envía el comando**:
   ```
   /start
   ```

3. **Copia tu ID**. Te responderá algo como:
   ```
   Id: 123456789
   First name: Tu Nombre
   Username: @tu_username
   ```

   ⚠️ **Copia solo el número** (ej: `123456789`), lo necesitarás en el paso 3.

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

## 📚 Recursos

- [Telegram BotFather](https://t.me/botfather)
- [Telegram UserInfo Bot](https://t.me/userinfobot)
- [KenoBot Plan](./docs/PLAN.md)
- [Architecture Docs](./docs/AGENTS.md)

---

**¿Problemas? Revisa los logs, son tu mejor amigo para debugging.**

May the Force be with you! 🤖✨
