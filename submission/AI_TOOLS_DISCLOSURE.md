# NASA Space Apps Challenge 2026 — AI Tools & Methodology Disclosure

This disclosure provides complete transparency regarding the application of Artificial Intelligence within the ASTRA project, in accordance with the NASA Space Apps Challenge 2026 rules.

---

## 1. Runtime AI (Integrated into Application)

| Component | AI Architecture / Model | Offline Fallback Mechanism | Status |
|---|---|---|---|
| **Clinical Triage Classifier** | 18-Feature Random Forest Classifier (trained on 10,000 synthetic NASA EVA records) | 100% offline self-contained model file. No external internet access required. | **IMPLEMENTED** (95.15% validation accuracy) |
| **Conversational AI Explainer & Assistant** | Configurable via OpenRouter (Llama 3.3 70B, Gemini Flash), Groq, or Anthropic | **Deterministic local rule-based engine**: When no API key is provided or the device is offline, ASTRA automatically executes rule-based NASA-STD-3001 diagnostic protocols locally. | **IMPLEMENTED** (Zero-Key Fallback) |
| **Natural Language Scenario Parser** | LLM-assisted or regex-based medical entity extractor | Local regex & symptom keyword mapping table. | **IMPLEMENTED** |

> [!NOTE]
> **The Trusted Data Layer is NOT AI**: The sensor verification pipeline (TDL) is completely deterministic and uses mathematical physics equations (Gaussian likelihood, rate-of-change derivatives, statistical outlier filtering). It does not use neural networks or black-box heuristics.

---

## 2. Development-Time AI Tools

The following AI tools assisted the engineering team during development:

| Tool | Application Scope | Verification Method |
|---|---|---|
| **Google Antigravity (Gemini / Claude)** | Automated test creation, documentation consolidation, repository cleanup | All code and tests were compiled, executed, and verified locally on `master` with zero baseline regressions. |
| **Code Review Assistants** | Syntax checking, OpenAPI schema validation, TypeScript interface typing | 97 automated tests executed and passed via pytest; TypeScript compiled via `tsc --noEmit` with zero errors. |

---

## 3. Ethical Safeguards & Safety Disclaimers

1. **Synthetic Data Only**: No confidential or private human medical records were used to train or evaluate the system.
2. **Decision-Support Scope**: ASTRA is explicitly designed as a clinical decision-support assistant for astronauts, not as an autonomous surgical or prescribing agent.
3. **Transparent Protocol Citations**: Every triage diagnosis outputs traceable references to published NASA standards (e.g., NASA-STD-3001 Vol 1 Rev C).
