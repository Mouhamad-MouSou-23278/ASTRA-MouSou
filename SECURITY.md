# Security Policy

## 1. Supported Versions

Security fixes and dependency updates are actively applied to the following release series:

| Version Series | Supported | Notes |
|---|---|---|
| `2.5.x` | :white_check_mark: | Current active release branch (`master`) |
| `< 2.0.0` | :x: | Legacy development prototypes (unsupported) |

---

## 2. Reporting a Vulnerability

The ASTRA project and Gravity Brains take security and data privacy seriously. If you discover a security vulnerability, credential leak, or authorization flaw within this repository, **do not open a public GitHub issue**.

Please report vulnerabilities privately via:
- **Email**: Send detailed disclosure to the project maintainers (`security@astra-spaceapps.example.com` or team contacts listed in `docs/team_config.json`).
- Include:
  1. Description of the vulnerability and attack vector.
  2. Proof-of-concept steps or payload.
  3. Impact assessment on user roles and telemetry integrity.

We aim to acknowledge reports within 48 hours and provide a coordinated remediation release.

---

## 3. Security Architecture Highlights

ASTRA is engineered with defense-in-depth principles:
- **Zero Committed Secrets**: Continuous scanning ensures no private API keys or certificates exist in the Git tree.
- **Cryptographic JWT Tokens**: User sessions are authenticated via HMAC-SHA256 tokens with configurable expiration (`ASTRA_ACCESS_TOKEN_MINUTES`).
- **Salted Password Hashing**: Passwords stored via `bcrypt` with cryptographic salt rounds.
- **Role-Based Access Control (RBAC)**: Strict permission boundaries separating viewer, operator, medical, physical, and admin tiers.
- **Local Fallback Isolation**: In offline mode, the deterministic explainer executes entirely within the local process with zero external network egress.
