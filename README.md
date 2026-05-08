# Polla Mundialista 2026 ⚽

App de pronósticos deportivos para el Mundial 2026 con sincronización automática de resultados, sistema de puntos y notificaciones por WhatsApp.

---

## Stack

- **Framework**: Next.js 14 (App Router, Server Components)
- **Base de datos**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth v5 (JWT, Credentials)
- **API de fútbol**: [football-data.org](https://www.football-data.org/) (plan gratuito disponible)
- **WhatsApp**: Twilio WhatsApp API
- **Deploy**: Vercel (con Cron Jobs integrado)

---

## Configuración inicial

### 1. Variables de entorno

Completa los valores en `.env`:

```env
# Base de datos PostgreSQL
DATABASE_URL="postgresql://user:password@host:5432/polla_db"

# NextAuth
NEXTAUTH_URL="https://tu-dominio.com"
NEXTAUTH_SECRET="genera-con: openssl rand -base64 32"

# football-data.org (registrate en https://www.football-data.org/client/register)
FOOTBALL_API_KEY="tu-api-key"
FOOTBALL_API_BASE_URL="https://api.football-data.org/v4"
FOOTBALL_COMPETITION_ID="2000"   # ID del Mundial 2026

# Twilio WhatsApp (https://www.twilio.com/whatsapp)
TWILIO_ACCOUNT_SID="ACxxxxxxx"
TWILIO_AUTH_TOKEN="tu-auth-token"
TWILIO_WHATSAPP_FROM="whatsapp:+14155238886"

# Proteccion del endpoint de cron
CRON_SECRET="genera-con: openssl rand -hex 32"
```

### 2. Base de datos

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 3. Primera sincronizacion de datos

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync
```

### 4. Arrancar en desarrollo

```bash
npm run dev
```

---

## Cron Job (sincronizacion automatica cada hora)

### En Vercel (recomendado)
El archivo `vercel.json` ya lo configura. Requiere plan Vercel Pro.

### En servidor propio
```bash
# crontab -e
0 * * * * curl -s -H "Authorization: Bearer TU_CRON_SECRET" https://tu-app.com/api/cron/sync
```

---

## Sistema de puntos

| Resultado | Puntos |
|-----------|--------|
| Marcador exacto (ej. 2-1 = 2-1) | **+5** |
| Ganador correcto (ej. 2-1, predijo 1-0) | **+3** |
| Empate correcto (sin importar goles) | **+1** |
| Equipo favorito avanza de fase | **+2** (bonus automatico) |

Los pronosticos se cierran **5 minutos antes** del inicio del partido.

---

## Notificaciones WhatsApp

Desde Perfil > "Enviar resultados del dia", se envia a cada jugador:

```
Hola Juan! Resultados procesados:
Acertaste 2 marcadores exactos.
Sumaste 13 puntos hoy.
Posicion actual en la tabla: #3.
```

---

## Estructura

```
src/
  app/
    (app)/          # Paginas autenticadas con navbar
      dashboard/    # Inicio: resumen + partidos del dia
      matches/      # Partidos + formulario de pronostico
      standings/    # Tabla de clasificacion con podium
      history/      # Historial de pronosticos
      profile/      # Perfil, edicion y notificaciones
    (auth)/         # Login y registro
    api/            # API routes
      auth/         # NextAuth + registro
      matches/      # GET partidos con prediccion del usuario
      predictions/  # GET/POST pronosticos
      standings/    # GET clasificacion
      teams/        # GET equipos
      profile/      # GET/PATCH perfil
      cron/sync/    # GET sync API externa (protegido)
      notifications/ # POST envio WhatsApp masivo
  lib/
    auth/           # NextAuth config
    db/             # Prisma client
    football-api/   # Cliente API + sync service
    scoring/        # Motor de puntuacion
    whatsapp/       # Servicio Twilio
  types/            # Tipos TypeScript compartidos
```


e9a39ce8bf26869a839656b656ed5a08c40099da1db309e39187ef39b1101010


curl -H "Authorization: Bearer 50d853b1710ee7a478c6f9a57463e8afbcf3b03187f386fd2402ae3530e8b028" http://localhost:3000/api/cron/sync