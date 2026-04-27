/**
 * Bug Condition Exploration Tests
 *
 * These tests assert the CORRECT (fixed) state of the codebase.
 * On UNFIXED code they are EXPECTED TO FAIL — that failure is the proof each bug exists.
 * After each fix is applied the corresponding test will pass.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '../../')

// ---------------------------------------------------------------------------
// Bug 1 — middleware.ts must exist at the project root
// ---------------------------------------------------------------------------
describe('Bug 1 — middleware.ts at project root', () => {
  it('middleware.ts exists at the project root', () => {
    const middlewarePath = path.join(root, 'middleware.ts')
    expect(fs.existsSync(middlewarePath), `Expected ${middlewarePath} to exist`).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Bug 2 (CI) — .github/workflows/ci.yml must contain a pnpm vitest --run step
// ---------------------------------------------------------------------------
describe('Bug 2 (CI) — CI workflow contains vitest step', () => {
  it('.github/workflows/ci.yml contains "pnpm vitest --run"', () => {
    const ciPath = path.join(root, '.github', 'workflows', 'ci.yml')
    expect(fs.existsSync(ciPath), `Expected ${ciPath} to exist`).toBe(true)
    const content = fs.readFileSync(ciPath, 'utf-8')
    expect(content).toContain('pnpm vitest --run')
  })
})

// ---------------------------------------------------------------------------
// Bug 3 (netlify) — netlify.toml build command must be "pnpm build"
// ---------------------------------------------------------------------------
describe('Bug 3 (netlify) — netlify.toml uses pnpm build', () => {
  it('netlify.toml build command is "pnpm build"', () => {
    const tomlPath = path.join(root, 'netlify.toml')
    expect(fs.existsSync(tomlPath), `Expected ${tomlPath} to exist`).toBe(true)
    const content = fs.readFileSync(tomlPath, 'utf-8')
    // Must contain pnpm build, must NOT be npm run build
    expect(content).toContain('pnpm build')
    expect(content).not.toContain('npm run build')
  })
})

// ---------------------------------------------------------------------------
// Bug 4 — .env.local must contain NEXT_PUBLIC_BASE_URL key
// ---------------------------------------------------------------------------
describe('Bug 4 — .env.local contains NEXT_PUBLIC_BASE_URL', () => {
  it('.env.local has a NEXT_PUBLIC_BASE_URL entry', () => {
    const envPath = path.join(root, '.env.local')
    expect(fs.existsSync(envPath), `Expected ${envPath} to exist`).toBe(true)
    const content = fs.readFileSync(envPath, 'utf-8')
    // Must have NEXT_PUBLIC_BASE_URL (not just NEXT_PUBLIC_APP_URL)
    expect(content).toMatch(/^NEXT_PUBLIC_BASE_URL=/m)
  })
})

// ---------------------------------------------------------------------------
// Bug 5 — RESEND_API_KEY must appear exactly once in .env.local
// ---------------------------------------------------------------------------
describe('Bug 5 — RESEND_API_KEY appears exactly once in .env.local', () => {
  it('RESEND_API_KEY is declared exactly once', () => {
    const envPath = path.join(root, '.env.local')
    const content = fs.readFileSync(envPath, 'utf-8')
    const matches = content.match(/^RESEND_API_KEY=/gm) ?? []
    expect(matches.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Bug 6 — migration 006 must use $$ as the dollar-quote delimiter
// ---------------------------------------------------------------------------
describe('Bug 6 — migration 006 uses $$ dollar-quote delimiter', () => {
  it('006_auto_create_profile.sql contains $$ as delimiter', () => {
    const migPath = path.join(root, 'supabase', 'migrations', '006_auto_create_profile.sql')
    expect(fs.existsSync(migPath), `Expected ${migPath} to exist`).toBe(true)
    const content = fs.readFileSync(migPath, 'utf-8')
    // Must contain $$ (double dollar) as the PL/pgSQL delimiter
    expect(content).toContain('$$')
  })
})

// ---------------------------------------------------------------------------
// Bug 7 — app/admin/ingestion/page.tsx must NOT import from @supabase/supabase-js
// ---------------------------------------------------------------------------
describe('Bug 7 — app/admin/ingestion/page.tsx does not import from @supabase/supabase-js', () => {
  it('ingestion page has no @supabase/supabase-js import', () => {
    const filePath = path.join(root, 'app', 'admin', 'ingestion', 'page.tsx')
    expect(fs.existsSync(filePath), `Expected ${filePath} to exist`).toBe(true)
    const content = fs.readFileSync(filePath, 'utf-8')
    expect(content).not.toContain('@supabase/supabase-js')
  })
})

// ---------------------------------------------------------------------------
// Bug 8 — app/admin/digest/page.tsx must NOT import from @supabase/supabase-js
// ---------------------------------------------------------------------------
describe('Bug 8 — app/admin/digest/page.tsx does not import from @supabase/supabase-js', () => {
  it('digest page has no @supabase/supabase-js import', () => {
    const filePath = path.join(root, 'app', 'admin', 'digest', 'page.tsx')
    expect(fs.existsSync(filePath), `Expected ${filePath} to exist`).toBe(true)
    const content = fs.readFileSync(filePath, 'utf-8')
    expect(content).not.toContain('@supabase/supabase-js')
  })
})
