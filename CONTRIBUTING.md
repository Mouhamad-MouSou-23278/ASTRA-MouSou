# Contributing to ASTRA

Thank you for your interest in contributing to **ASTRA (Astronaut Health Monitoring & Mars Mission Simulation)**! This project is developed by **Gravity Brains** for the **NASA Space Apps Challenge 2026**.

---

## 1. Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for all contributors. Please treat fellow contributors with respect, professionalism, and constructive empathy.

---

## 2. Guiding Engineering Principles

When contributing code, adhere strictly to these principles:

1. **Safety & Realism**: ASTRA is an engineering prototype and research simulation conforming to **NASA-STD-3001** and spaceflight avionics specifications. Never introduce fictional physics or claim unverified clinical efficacy.
2. **Deterministic Verification First**: The Trusted Data Layer (TDL) must remain 100% deterministic and mathematically reproducible without requiring internet access or cloud LLM calls.
3. **Zero Secrets in Code**: Never commit API keys, tokens, credentials, or private keys to Git. Use environment variables defined in `.env.example`.
4. **Preserve Commit History**: Do not force-push (`git push --force`) or rewrite shared history on `master`.

---

## 3. Development Workflow

### 3.1 Branching Strategy
- `master`: Canonical production integration branch. Stable and deployable at all times.
- Feature branches: `feat/<feature-name>`, `fix/<bug-name>`, `docs/<topic>`.

### 3.2 Setting Up Local Environment
```bash
# Clone the repository
git clone https://github.com/Mouhamad-MouSou-23278/ASTRA-MouSou.git
cd ASTRA-MouSou

# On Windows:
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

# On macOS/Linux:
python3.11 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
```

### 3.3 Running Tests Before Submitting
Every pull request must pass the full test suite and build pipeline:
```bash
# Backend pytest suite (97 tests)
.\backend\.venv\Scripts\pytest.exe -v backend/tests

# Frontend type checking
npm --prefix frontend run typecheck

# Frontend production compilation
npm --prefix frontend run build
```

---

## 4. Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:

- `feat(...)`: A new user-facing feature or API capability.
- `fix(...)`: A bug fix.
- `test(...)`: Adding or correcting tests.
- `docs(...)`: Documentation additions or modifications.
- `chore(...)`: Maintenance, dependency updates, or build configuration.

Example:
`feat(medical): add automated arrhythmia ECG waveform anomaly detector`

---

## 5. Reporting Issues

When reporting issues or bugs, please include:
- Operating system and Python / Node.js versions.
- Steps to reproduce the anomaly.
- Expected vs. actual behavior.
- Relevant terminal or console logs.
