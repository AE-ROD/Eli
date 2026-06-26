# Stripe Checkout Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Subagents are not authorized for this task.

**Goal:** Connect paid-plan selection in the dashboard pricing modal to the existing Stripe Checkout endpoint with loading and readable errors.

**Architecture:** `ProviderPrecios` owns the network request and transient checkout state. `ModalPrecios` remains presentational, consuming a loading plan ID and an error message to render feedback and prevent duplicate submissions.

**Tech Stack:** React 19, TypeScript, Next.js App Router, existing `BotonPrimario` and design tokens.

## Global Constraints

- Do not modify `app/reservar/[slug]/`.
- Do not modify `__tests__/`.
- Ignore annual billing until the checkout endpoint supports it.
- Verify with `npm test` and `npx tsc --noEmit`.

---

### Task 1: Implement Stripe Checkout state and request

**Files:**
- Modify: `components/app/modales/provider-precios.tsx`

**Interfaces:**
- Produces: `planCargando: string | null` and `error: string | null` for `ModalPrecios`.
- Consumes: `POST /api/stripe/checkout` with `{ plan: "pro" | "team" }`.

- [ ] Add loading and error state.
- [ ] Implement an async selection handler that rejects `free` locally, posts paid plans, parses errors defensively, and redirects with `window.location.href` when `url` exists.
- [ ] Clear loading in `finally` so failures remain retryable.

### Task 2: Render loading and error feedback

**Files:**
- Modify: `components/app/modales/modal-precios.tsx`

**Interfaces:**
- Consumes: `planCargando?: string | null` and `error?: string | null`.

- [ ] Add the two optional props.
- [ ] Render the error above the plan grid using `role="alert"`, `bg-destructive/10`, `border-destructive/20`, and `text-destructive`.
- [ ] Pass `cargando={planCargando === plan.id}` and `disabled={planCargando !== null}` to each CTA.

### Task 3: Verify

**Files:**
- No code changes.

- [ ] Run `npm test`; expect all existing tests to pass.
- [ ] Run `npx tsc --noEmit`; expect exit code 0.
- [ ] Inspect scoped git status and confirm no modifications under the forbidden paths were introduced by this task.
