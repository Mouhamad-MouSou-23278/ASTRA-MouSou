# ASTRA — Environment Configuration Reference

> [!NOTE]
> Every value is **optional** for a local development run. With no `.env` file at all, ASTRA starts with SQLite, a generated secret key, the seeded demo catalogue, and fully offline AI.

## Configuration File Locations

ASTRA reads environment variables from two locations (in order):

1. **`<repo-root>/.env`** — Primary configuration file.
2. **`backend/.env`** — Alternative location (overrides repo-root values).

Both files use standard `KEY=VALUE` syntax. Copy `.env.example` to `.env` and adjust as needed.

## Environment Variable Reference

### Database

| Variable | Default | Description |
|---|---|---|
| `ASTRA_DATABASE_URL` | *(empty → SQLite)* | Database connection string. Empty uses a local SQLite file at `backend/data/astra.db`. For PostgreSQL: `postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME`. |
| `POSTGRES_PASSWORD` | `change-me` | Used **only** by `docker-compose.yml` for the bundled PostgreSQL 16 container. Not read by the ASTRA application. |

### Security

| Variable | Default | Description |
|---|---|---|
| `ASTRA_SECRET_KEY` | *(empty → auto-generated)* | Signs JWT login tokens. When empty, a random key is generated once and stored in `backend/data/secret.key`. **Required** when running via Docker. Generate with: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ASTRA_ACCESS_TOKEN_MINUTES` | `480` | JWT token expiry in minutes (default 8 hours). |
| `ASTRA_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated list of browser origins allowed to call the API. Only needed for the Vite dev server during frontend development. |

### Demo Data

| Variable | Default | Description |
|---|---|---|
| `ASTRA_SEED_DEMO_DATA` | `true` | When `true`, seeds demo users, sensors, medical rules, and scenarios into an **empty** database on first startup. |
| `ASTRA_DEMO_PASSWORD` | *(empty)* | Set to give all five demo accounts the same password instead of the documented per-role passwords. Also hides the one-click demo sign-in buttons on the login page. |

### Networking

| Variable | Default | Description |
|---|---|---|
| `ASTRA_PUBLIC_BASE_URL` | *(empty → auto-detected)* | The base URL phones should open when scanning QR codes, e.g. `http://192.168.1.20:8000`. When empty, ASTRA derives the URL from the request and replaces `localhost` with the detected LAN IP. **Set this when running in Docker.** |
| `ASTRA_FRONTEND_DIST` | `<repo>/frontend/dist` | Path to the built frontend bundle directory. Normally does not need to be changed. |
| `ASTRA_TERRAIN_DIR` | `backend/assets/terrain` | Path to Mars terrain heightmap assets. |

### AI / LLM

| Variable | Default | Description |
|---|---|---|
| `ASTRA_LLM_PROVIDER` | `local` | LLM provider. Options: `local` (deterministic offline), `openrouter` (recommended free), `groq`, `gemini`, `anthropic`, `openai_compatible`. Falls back to `local` if the provider is unavailable. |
| `ASTRA_LLM_MODEL` | *(empty → provider default)* | Model identifier. Provider defaults: OpenRouter → `meta-llama/llama-3.3-70b-instruct:free`, Groq → `llama-3.3-70b-versatile`, Gemini → `gemini-1.5-flash`. |
| `ASTRA_LLM_BASE_URL` | *(empty)* | Base URL for `openai_compatible` provider (e.g. `http://localhost:11434/v1` for Ollama). Pre-configured for OpenRouter and Groq. |
| `ASTRA_LLM_API_KEY` | *(empty)* | API key for the configured LLM provider. |
| `ASTRA_LLM_TIMEOUT_S` | `25.0` | HTTP timeout in seconds for LLM API calls. |

**Provider-specific API key variables** (alternatives to `ASTRA_LLM_API_KEY`):

| Variable | Provider |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter |
| `GROQ_API_KEY` | Groq |
| `GEMINI_API_KEY` | Google Gemini |
| `ANTHROPIC_API_KEY` | Anthropic Claude |

### Speech (Text-to-Speech / Speech-to-Text)

| Variable | Default | Description |
|---|---|---|
| `ASTRA_SPEECH_PROVIDER` | `browser` | Speech provider. `browser` uses the Web Speech API (works offline). `openai_compatible` uses server-side STT/TTS. |
| `ASTRA_SPEECH_BASE_URL` | *(empty)* | Base URL for `openai_compatible` speech provider. |
| `ASTRA_SPEECH_API_KEY` | *(empty)* | API key for `openai_compatible` speech provider. |
| `ASTRA_STT_MODEL` | `whisper-1` | Speech-to-text model name. |
| `ASTRA_TTS_MODEL` | `tts-1` | Text-to-speech model name. |
| `ASTRA_TTS_VOICE` | `alloy` | TTS voice selection. |

## Quick Setup Examples

### Minimal Local Development (No .env Needed)

```powershell
# Just run ASTRA — uses SQLite, generated secret, offline AI
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```

### With Free OpenRouter AI

```ini
# .env
ASTRA_LLM_PROVIDER=openrouter
ASTRA_LLM_API_KEY=sk-or-v1-your-free-key-here
```

### Docker Compose (PostgreSQL)

```ini
# .env
POSTGRES_PASSWORD=your-strong-password-here
ASTRA_SECRET_KEY=your-generated-secret-key
ASTRA_PUBLIC_BASE_URL=http://192.168.1.20:8000
```

## File Auto-Generation

The following files are auto-generated and **gitignored**:

| File | Purpose |
|---|---|
| `backend/data/astra.db` | SQLite database (created on first run) |
| `backend/data/secret.key` | JWT signing key (created when `ASTRA_SECRET_KEY` is empty) |
