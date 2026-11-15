# ASTRA — Installation Guide

## Prerequisites

| Software | Minimum Version | Purpose |
|---|---|---|
| **Python** | 3.11+ | Backend runtime (FastAPI) |
| **Node.js** | 20+ | Frontend build toolchain (Vite, React) |
| **npm** | 10+ | Frontend dependency management (bundled with Node.js) |
| **Git** | 2.30+ | Version control |
| **Docker** *(optional)* | 24+ | Containerized deployment with PostgreSQL |

> [!IMPORTANT]
> Use Python **3.11.x** for the backend. The project has been tested with Python 3.11.9. Newer Python versions (e.g. 3.14) may work but have not been validated.

---

## Option A: Windows (Automated — PowerShell)

The fastest way to get ASTRA running on Windows:

```powershell
# 1. Clone the repository
git clone https://github.com/Mouhamad-MouSou-23278/ASTRA-MouSou.git
cd ASTRA-MouSou

# 2. (Optional) Copy and configure .env
copy .env.example .env
# Edit .env if you want to enable online LLM — see docs/deployment/ENVIRONMENT_CONFIGURATION.md

# 3. Run the automated start script
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```

The `start.ps1` script automatically:
1. Creates a Python virtual environment in `backend\.venv` (if missing).
2. Installs backend Python dependencies from `backend\requirements.txt`.
3. Installs frontend npm packages and builds the React UI.
4. Starts the unified server on **http://localhost:8000**.

To run setup separately without starting the server:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

---

## Option B: macOS / Linux (Manual)

```bash
# 1. Clone the repository
git clone https://github.com/Mouhamad-MouSou-23278/ASTRA-MouSou.git
cd ASTRA-MouSou

# 2. Create and activate Python virtual environment
python3.11 -m venv backend/.venv
source backend/.venv/bin/activate

# 3. Install backend dependencies
pip install -r backend/requirements.txt

# 4. Build the frontend
cd frontend
npm install
npm run build
cd ..

# 5. (Optional) Copy and configure .env
cp .env.example .env

# 6. Start the server
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## Option C: Docker Compose (PostgreSQL)

Docker Compose runs ASTRA with a PostgreSQL 16 database instead of SQLite:

```bash
# 1. Clone the repository
git clone https://github.com/Mouhamad-MouSou-23278/ASTRA-MouSou.git
cd ASTRA-MouSou

# 2. Configure required environment variables
cp .env.example .env
# Edit .env and set:
#   POSTGRES_PASSWORD=your-strong-password
#   ASTRA_SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(48))">
#   ASTRA_PUBLIC_BASE_URL=http://YOUR_LAN_IP:8000  (for QR codes)

# 3. Build and start
docker compose up --build

# 4. Open http://localhost:8000
```

To run in detached mode:
```bash
docker compose up --build -d
docker compose logs -f app    # follow logs
docker compose down            # stop
```

---

## Demo Accounts

On first startup (with `ASTRA_SEED_DEMO_DATA=true`, the default), ASTRA creates five demo accounts with one-click login buttons on the login page:

| Role | Username | Password | Description |
|---|---|---|---|
| **Admin** | `admin` | `astra-admin-2026` | User management, RBAC, audit log, emergency stop |
| **Physical Team** | `physical` | `astra-physical-2026` | 3D spacesuit sensor canvas, calibration, failure signatures |
| **Medical Team** | `medical` | `astra-medical-2026` | NASA sim tests, ML triage, instruments, pre-sim risk |
| **Test Operator** | `operator` | `astra-operator-2026` | Mission control, 3D Mars, NL scenarios, QR generation |
| **Viewer** | `viewer` | `astra-viewer-2026` | Read-only live telemetry stream |

> [!TIP]
> Set `ASTRA_DEMO_PASSWORD` in `.env` to override all demo passwords with a single value. This also hides the one-click login buttons.

---

## Verification

After starting the server, verify the installation:

1. **Open the application**: Navigate to **http://localhost:8000** in your browser.
2. **Log in**: Use any demo account from the table above.
3. **Check the API docs**: Navigate to **http://localhost:8000/api/docs** for the OpenAPI interactive documentation.
4. **Run the test suite**:
   ```powershell
   # Backend tests (97 tests)
   .\backend\.venv\Scripts\pytest.exe -v backend/tests

   # Frontend type check
   cd frontend; npm run typecheck

   # Frontend production build
   cd frontend; npm run build
   ```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `python` is not recognized | Install Python 3.11+ and ensure it is on your PATH |
| `npm` is not recognized | Install Node.js 20+ from https://nodejs.org/ |
| Port 8000 already in use | Use `scripts\start.ps1 -Port 8080` or kill the process on port 8000 |
| Windows Firewall prompt | Allow Python on **private networks** (required for QR/phone access) |
| Frontend shows blank page | Ensure `frontend/dist/` exists — run `npm run build` in the `frontend/` directory |
| `ModuleNotFoundError` | Ensure you are using the venv Python: `.\backend\.venv\Scripts\python.exe` |
