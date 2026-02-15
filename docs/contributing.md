# Contributing

## Development Setup

```bash
# Install dependencies
npm install

# Start dev server (port 3001, Turbopack disabled)
npm run dev

# Or with custom port
PORT=3005 npm run dev
```

## Code Conventions

### File Organization
- **API routes** go in `src/app/api/<resource>/route.ts`
- **Components** go in `src/components/<Name>.tsx`
- **Hooks** go in `src/hooks/use<Name>.ts`
- **Utilities** go in `src/lib/<name>.ts`
- **Types** are centralized in `src/lib/types.ts`

### Naming
- Components: PascalCase (`TaskModal.tsx`)
- Hooks: camelCase with `use` prefix (`useSSE.ts`)
- API routes: kebab-case directories (`voice-call/`)
- Database columns: snake_case (`assigned_agent_id`)
- TypeScript interfaces: PascalCase (`TaskActivity`)

### State Management
- Server state is fetched via API calls and stored in the Zustand store
- Real-time updates come via SSE and are merged into the store
- Local UI state (modals, forms) uses React `useState`
- No Redux, no React Context for global state (Zustand only)

### Database
- All queries use parameterized statements (no string interpolation)
- Use `queryAll<T>()`, `queryOne<T>()`, and `run()` from `src/lib/db/index.ts`
- Migrations are in `src/lib/db/index.ts` inside `runMigrations()`
- New tables should be added to `src/lib/db/schema.ts`

### Styling
- Tailwind CSS utility classes
- CSS custom properties for theme colors (`--mc-bg`, `--mc-text`, etc.)
- No CSS modules or styled-components
- Responsive design using Tailwind breakpoints (`md:`, `max-md:`)

### API Routes
- Use Next.js App Router route handlers (`export async function GET/POST/PATCH/DELETE`)
- Return `NextResponse.json()` for all responses
- Include error handling with try/catch
- Broadcast SSE events for state changes using `broadcast()` from `src/lib/events.ts`
- Use UUID for all primary keys

## Adding a New Feature

### 1. Define Types

Add interfaces to `src/lib/types.ts`:

```typescript
export interface MyFeature {
  id: string;
  name: string;
  // ...
}
```

### 2. Add Database Table

Add the CREATE TABLE statement to `src/lib/db/schema.ts` and add a migration in `src/lib/db/index.ts`:

```typescript
// In runMigrations()
try {
  db.exec(`CREATE TABLE IF NOT EXISTS my_feature (...)`);
} catch {}
```

### 3. Create API Route

Create `src/app/api/my-feature/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { queryAll, run } from '@/lib/db';
import { broadcast } from '@/lib/events';

export async function GET() {
  const items = queryAll('SELECT * FROM my_feature');
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // ... validate, insert, broadcast
  return NextResponse.json(item, { status: 201 });
}
```

### 4. Add to Zustand Store

Update `src/lib/store.ts` (or create the store if it doesn't exist):

```typescript
myFeatures: MyFeature[],
setMyFeatures: (items: MyFeature[]) => set({ myFeatures: items }),
```

### 5. Create Component

Create `src/components/MyFeature.tsx` using existing patterns.

### 6. Handle SSE Events

If the feature emits events, handle them in `src/hooks/useSSE.ts`.

## Database Migrations

Migrations run automatically on server startup. To add a new migration:

1. Open `src/lib/db/index.ts`
2. Add a new block in `runMigrations()`:

```typescript
// Migration: Add my_column to tasks
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN my_column TEXT`);
} catch {
  // Column already exists
}
```

The try/catch pattern ensures migrations are idempotent.

## Building for Production

```bash
npm run build
npm start
```

The production server uses the same SQLite database. Ensure `better-sqlite3` is in `serverExternalPackages` in `next.config.mjs` if you encounter bundling issues.
