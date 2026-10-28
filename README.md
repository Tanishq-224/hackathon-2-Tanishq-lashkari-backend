# Repairex Backend

Express + TypeScript API for the Repairex electronics repair marketplace.

**Phase 0:** Environment validation, security middleware, health route, Swagger UI at `/api-docs`, Jest + Supertest. Auth, repair workflow, and MongoDB-backed features arrive in later phases.

## Prerequisites

- Node.js 20+
- npm
- MongoDB Atlas URI when you begin database-backed features (optional for health checks)

## Setup

```bash
npm install
```

Copy the environment template:

```powershell
Copy-Item .env.example .env
```

## Scripts

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `npm run dev`          | Run API with hot reload (`tsx`) |
| `npm run build`        | Compile TypeScript to `dist/`   |
| `npm start`            | Run compiled server             |
| `npm test`             | Jest + Supertest                |
| `npm run lint`         | ESLint                          |
| `npm run format:check` | Prettier check                  |

## Local URLs

- API base: `http://localhost:5000/api`
- Health: `GET /api/health`
- Swagger UI: `http://localhost:5000/api-docs`

## API response conventions

**Success:**

```json
{ "success": true, "message": "...", "data": {} }
```

**Error:**

```json
{ "success": false, "message": "..." }
```

Frontend repo is separate; keep `CLIENT_URL` aligned with the Vite dev server.
