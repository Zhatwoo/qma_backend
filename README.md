# QMA Backend

NestJS REST API for the Quality Management Application.

## Stack

- NestJS + TypeScript
- Prisma ORM + PostgreSQL (Supabase)
- JWT auth with refresh token rotation
- RBAC permissions
- Socket.IO WebSockets
- Supabase Storage for file uploads

## Setup

```bash
# Create .env in this folder with:
# DATABASE_URL, DIRECT_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY
# JWT_SECRET, JWT_REFRESH_SECRET, FRONTEND_URL, API_PUBLIC_URL, PORT
# FILE_RETENTION_DAYS, RESEND_API_KEY, RESEND_FROM_EMAIL

npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run start:dev
```

API runs at `http://localhost:3001/api/v1`

## Key Modules

- Auth, Projects, Members, Issues, Testing, Planning, Files, Analytics, WebSocket

## Tenant Isolation

All resources are scoped by `companyId` from the JWT — never trust client-provided company IDs.
