# Enterprise After-Sales Service CRM

> High-Integrity Post-Purchase Service Operations & Inventory Management Platform.  
> Architecture: Next.js App Router (Frontend) + Express REST API (Backend) + Oracle Database 23c Free.

---

## 1. Architecture Overview

This monorepo establishes the **Phase 0 Foundation** for replacing the legacy PHP-based After-Sales Service CRM. It provides strict end-to-end type safety, structured logging, centralized API envelopes, Oracle connection pooling with Thin mode, versioned SQL/PL-SQL migrations with SHA-256 integrity tracking, and a custom Material UI enterprise design system.

### Technology Stack

| Layer | Technology | Key Highlights |
| :--- | :--- | :--- |
| **Monorepo** | pnpm 12 Workspaces | Strict dependency isolation, pinned dependencies, zero hoisted contamination |
| **Frontend** | Next.js 14 (App Router) + React 18 | Strict TypeScript, custom enterprise MUI v6 theme, TanStack Query v5, React Hook Form + Zod |
| **Backend** | Node.js (LTS) + Express 4 | Strict TypeScript, Zod request validation, Winston structured JSON logging, Helmet, CORS, RateLimiter |
| **Database** | Oracle Database 23c Free | `node-oracledb` Thin mode, connection pool with lifecycle management, Flyway-style SQL/PL-SQL migration runner |
| **Tracing** | `x-correlation-id` | `AsyncLocalStorage` correlation ID injection across all backend logs and API client envelopes |

---

## 2. Repository Structure

```text
crm/
├── frontend/                     # Next.js 14 App Router UI Workspace
│   ├── src/
│   │   ├── app/                  # App Router pages and layouts
│   │   │   ├── layout.tsx        # HTML root + Emotion & TanStack Query providers
│   │   │   ├── page.tsx          # Phase 0 System Verification Overview & Probes
│   │   │   └── (workspace)/      # Role-tailored workspace routes (call-center, asf, warehouse, admin)
│   │   ├── components/
│   │   │   ├── layout/           # AppHeader, AppSidebar, BreadcrumbBar, WorkspaceShell
│   │   │   ├── feedback/         # SlaCounter, StatusBadge, ErrorDisplay, LoadingSkeleton, ConfirmationDialog
│   │   │   ├── forms/            # FormFieldWrapper, Search fields
│   │   │   └── data-display/     # ResponsiveCard, EmptyState, DataTablePrimitives (EnterpriseTable)
│   │   ├── theme/                # Enterprise tokens (8pt grid, semantic HSL colors), MUI createTheme, ThemeRegistry
│   │   ├── lib/                  # Typed apiClient (envelope unwrapping, correlation ID), queryClient
│   │   └── providers/            # Consolidated client providers (ThemeRegistry + QueryClientProvider)
│   ├── tests/                    # Vitest frontend unit tests
│   └── package.json
├── backend/                      # Express REST API Workspace
│   ├── src/
│   │   ├── app.ts                # Express app configuration (Helmet, CORS, RateLimiter, error handling)
│   │   ├── server.ts             # Server bootstrap and graceful shutdown handler
│   │   ├── config/               # Zod-validated environment configuration (env.ts)
│   │   ├── middleware/           # correlationId (AsyncLocalStorage), errorHandler (API envelopes)
│   │   ├── logging/              # Winston JSON logger with secret redaction
│   │   └── database/             # Oracle connection pool manager, migrationRunner, runMigrations CLI
│   ├── tests/                    # Vitest API and unit test suite
│   └── package.json
├── database/                     # Database Schema & Versioned Migrations
│   ├── migrations/               # Versioned migration scripts (V001__..., V002__...)
│   ├── rollback/                 # Tested rollback scripts (U001__..., U002__...)
│   ├── plsql/                    # Stored procedures, packages, and trigger source files
│   ├── seeds/                    # Development reference seeds
│   └── README.md                 # Migration guide, integrity rules, and forward-fix runbook
├── docs/                         # Authoritative Architectural & Functional Documentation
├── docker-compose.yml            # Local Oracle Database 23c Free container specification
├── .env.example                  # Validated environment configuration template
├── pnpm-workspace.yaml           # pnpm workspace definition and build policies
├── package.json                  # Root monorepo scripts
└── README.md                     # This developer documentation
```

---

## 3. Prerequisites

- **Node.js**: `v20.x` or `v22.x` (or newer LTS).
- **pnpm**: `v10.x` or `v12.x`.
- **Docker Desktop** (optional for local Oracle 23c container): Required if running Oracle locally in Docker.
- **Oracle Database**: Oracle Database 23c Free or 19c Enterprise Edition reachable via network.

---

## 4. Environment Configuration

Copy the sample environment file to create your local `.env`:

```bash
cp .env.example .env
```

Review and adjust settings in `.env` if your local Oracle ports or credentials differ:

```ini
# Backend API Configuration
PORT=4000
NODE_ENV=development
API_PREFIX=/api/v1
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info

# Oracle Database Configuration (Thin Mode - No Instant Client Required)
ORACLE_USER=crm_app
ORACLE_PASSWORD=crm_dev_password_change_me
ORACLE_CONNECT_STRING=localhost:1521/FREEPDB1
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=10
ORACLE_POOL_INCREMENT=2

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:4000
```

> **Security Guardrail**: Never commit real database passwords, secret keys, or `.env` files to source control. `.env` is explicitly ignored by `.gitignore`.

---

## 5. Development Quickstart

### 1. Install Dependencies
```bash
pnpm install
```

### 2. (Optional) Start Local Oracle Database Container
If running Oracle locally via Docker:
```bash
docker compose up -d
```
*Wait ~60 seconds for the database to complete initial database creation (`FREEPDB1`).*

### 3. Run Database Migrations
Once Oracle is accessible:
```bash
# Check current migration status
pnpm db:status

# Apply pending versioned migrations
pnpm db:migrate
```

### 4. Start Development Servers
Run both backend and frontend concurrently in watch mode:
```bash
pnpm dev
```

Or run individual services:
```bash
# Start backend API (http://localhost:4000)
pnpm dev:backend

# Start frontend application (http://localhost:3000)
pnpm dev:frontend
```

---

## 6. Health Probes & Diagnostics

The Express API exposes standardized liveness and readiness endpoints:

### Liveness Probe: `GET /health/live`
Confirms the Node.js process is active and accepting requests.
```bash
curl http://localhost:4000/health/live
```
**Response (HTTP 200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "UP",
    "uptimeSeconds": 42.15,
    "environment": "development"
  },
  "meta": {
    "correlationId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-10-19T15:30:00.000Z"
  }
}
```

### Readiness Probe: `GET /health/ready`
Executes an honest `SELECT 1 FROM DUAL` query against the Oracle connection pool.
- **When Oracle is reachable**: Returns `HTTP 200 OK` with database status `UP`.
- **When Oracle is not connected/unreachable**: Returns `HTTP 503 Service Unavailable` with sanitized telemetry (`DATABASE_UNAVAILABLE`). It **never** fakes readiness.

```bash
curl http://localhost:4000/health/ready
```

---

## 7. Migration System & Integrity Rules

The custom migration runner (`backend/src/database/migrationRunner.ts`) enforces enterprise database discipline:

1. **Strict Version Ordering**: Executes migrations strictly in numerical version order (`V001__...`, `V002__...`).
2. **SHA-256 Checksums**: Every migration file's normalized content is hashed. If a previously applied migration script is modified, the runner aborts with `CHECKSUM_MISMATCH` to prevent silent drift.
3. **Execution Tracking**: All executions are logged in `CRM_SCHEMA_HISTORY` with version, description, file name, checksum, installed by, execution duration (ms), and success status.
4. **Repeatable Execution**: Re-running `pnpm db:migrate` safely skips already applied migrations.
5. **Forward-Fix Discipline**: In production, do not edit existing migration scripts. Instead, add a new forward version (e.g., `V003__...`).

See [`database/README.md`](database/README.md) for rollback and disaster recovery runbooks.

---

## 8. Frontend Enterprise Design System

The frontend is built on a custom enterprise design system aligned with operational field CRM requirements:

- **Typography**: Inter with strict tabular numeral spacing (`tnum`) for monetary, serial, and SLA data.
- **Grid**: 8pt layout grid with a compact 4pt subgrid for high-density tabular views.
- **Color Tokens**: Refined slate neutrals with semantic accents (Status: Registered, Assigned, Dispatched, In-Progress, Cancelled, Closed).
- **Navigation Shell**:
  - Responsive collapsible sidebar (240px expanded → 64px icon rail).
  - Quick omnibox search shortcut (`Ctrl+K`).
  - Dark / Light mode toggle.
  - Workspace views tailored for **Call Center**, **ASF (Franchise)**, **Warehouse**, and **System Admin**.

---

## 9. Quality Gates & Testing

Run all quality checks from the repository root:

```bash
# 1. Strict TypeScript validation across all workspaces
pnpm type-check

# 2. Automated unit and integration test suite
pnpm test

# 3. Production optimized builds (Next.js static generation + Express TypeScript compile)
pnpm build
```

### Test Coverage Summary (Phase 0)
- **Backend Tests (`backend/tests/`)**:
  - Environment validation and fallback safety.
  - Correlation ID propagation and header capture.
  - Centralized error formatting (validation, operational, and unexpected 500s).
  - Liveness probe (`/health/live`) and readiness probe behavior when database is offline.
  - Migration runner version parsing, SHA-256 checksum calculation, and drift detection.
- **Frontend Tests (`frontend/tests/`)**:
  - `apiClient` JSON unwrap, correlation ID capture, and `ApiClientError` formatting.
  - Theme design tokens verification (contrast, primary color, 8pt grid base).

---

## 10. Architectural Guardrails

1. **No Frontend Secrets**: Database credentials and internal connection strings belong exclusively to the backend runtime.
2. **Strict API Envelope**: All API endpoints return `{ success: true, data, meta: { correlationId, timestamp } }` or `{ success: false, error: { code, message }, meta }`.
3. **Correlation ID Everywhere**: Incoming `x-correlation-id` headers are carried through Winston logs, database telemetry, and outgoing client responses.
4. **No Feature Pretending**: Unimplemented business features (e.g. ticket creation, inventory ledgering) display informative Phase roadmap empty states rather than fake mock data.

---

## 11. Phase 1A: Authentication & Role-Based Access Control (RBAC)

### Security & Architecture
- **Session Strategy**: Server-side session store in Oracle Database (`USER_SESSIONS`), keyed by a SHA-256 hash of a cryptographically secure 32-byte session token transmitted via an `HttpOnly`, `SameSite=Lax` cookie (`crm_session`). No JWT revocation latency; instant server-side revocation upon logout.
- **CSRF Protection**: All mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require an `x-csrf-token` header matching the active session's cryptographic CSRF token.
- **Brute-Force & Lockout**: Rate limiting on `/api/v1/auth/login` (15 requests / 15 minutes / IP). Account lockout triggers after 5 consecutive failed attempts, locking the account for 15 minutes.
- **Generic 401 Responses**: Timing-attack resistant constant-time comparison prevents username enumeration. Both invalid username and incorrect password return identical `INVALID_CREDENTIALS` responses.

### Provisioning Initial System Administrator
Run the idempotent administrator bootstrap command:

```bash
pnpm db:bootstrap-admin
```

To provide custom credentials via environment variables:
```bash
BOOTSTRAP_ADMIN_USERNAME=admin \
BOOTSTRAP_ADMIN_EMAIL=admin@crm.internal \
BOOTSTRAP_ADMIN_PASSWORD=YourSecurePassword123! \
BOOTSTRAP_ADMIN_NAME="System Operations Lead" \
pnpm db:bootstrap-admin
```

*Note: Repeated execution is safe; existing accounts are not overwritten.*

#### Rotating Administrator Credentials
To rotate an administrator password to a fresh Argon2id hash and immediately invalidate all active sessions:
```bash
ADMIN_ROTATION_PASSWORD=YourNewSecureSecret! pnpm db:rotate-admin
# or generate a cryptographically strong unique secret automatically:
pnpm db:rotate-admin
```

### Core Authentication API Endpoints
| Endpoint | Method | Security | Description |
| :--- | :---: | :---: | :--- |
| `/api/v1/auth/login` | `POST` | Public (Rate Limited) | Validates credentials, sets `crm_session` HttpOnly cookie & `crm_csrf` cookie |
| `/api/v1/auth/logout` | `POST` | `requireAuth` + `requireCsrf` | Revokes database session, clears cookies |
| `/api/v1/auth/me` | `GET` | `requireAuth` | Restores session, returns user profile, roles, and effective permissions |
| `/api/v1/workspace/admin` | `GET` | `requirePermission('users:read')` | Verifies System Administrator workspace capabilities |
| `/api/v1/workspace/call-center` | `GET` | `requirePermission('calls:read')` | Verifies Call Center operational capabilities |
| `/api/v1/workspace/warehouse` | `GET` | `requirePermission('inventory:read')` | Verifies Warehouse logistics capabilities |

### Frontend Protected Routes & RBAC Navigation
- **Login Experience (`/login`)**: Built with React Hook Form, Zod validation, password toggle, accessible labels, and automatic redirect restoration (`?redirect=...`).
- **Route Guard (`ProtectedRoute.tsx`)**: Reusable wrapper verifying `useAuth()`. Unauthenticated requests redirect to `/login`; authenticated users lacking permissions receive a dedicated `403 Forbidden` card.
- **Dynamic Sidebar**: `AppSidebar.tsx` dynamically filters workspace links according to server-confirmed permissions (`user.permissions`).

