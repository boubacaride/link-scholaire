# SchoolFlow (Link Scholaire) — Complete Project Reference

## Owner
**Mr. Boubacar Ide** — building an educational platform for schools in West Africa and beyond.

## Project Overview
A multi-tenant School Management SaaS platform with an integrated **AI-powered MathLab** and **Science Labs**. Built for both public and private schools, spanning kindergarten through PhD-level education.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router, `"use client"` components)
- **Language**: TypeScript 5 (strict mode)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL + Row-Level Security)
- **Auth**: Supabase Auth with `get_user_context()` RPC
- **Math Solver**: Wolfram Alpha APIs (AgentOne + CAG/LLM + Full Results)
- **AI Explanations**: OpenAI GPT-4o (step-by-step generation)
- **Math Rendering**: KaTeX (LaTeX rendering)
- **Animations**: Framer Motion (layout animations, AnimatePresence)
- **Graphing**: Plotly.js (react-plotly.js, dynamic import with SSR disabled)
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts
- **Calendar**: React Big Calendar

---

## API Keys (in .env.local)

| Key | Service | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Database connection |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Client-side auth |
| `OPENAI_API_KEY` | OpenAI | GPT-4o for step-by-step explanations |
| `WOLFRAM_APP_ID` | Wolfram Alpha | Full Results API (original key) |
| `WOLFRAM_AGENTONE_KEY` | Wolfram Alpha | AgentOne API — PRIMARY math solver |
| `WOLFRAM_CAG_KEY` | Wolfram Alpha | LLM/CAG API — rich text results |
| `BIODIGITAL_DEVELOPER_KEY` | BioDigital | Human 3D Anatomy Widget API |

---

## User Roles (5 roles)

| Role | Dashboard | Can Create |
|---|---|---|
| `platform_admin` | Full access | Schools, users, everything |
| `school_admin` | School-wide | Teachers, students, parents, classes, subjects, content |
| `teacher` | Own classes | Content, grades, attendance |
| `student` | Own data | Submissions |
| `parent` | Children's data | Nothing (view only) |

---

## Database Architecture

### Key Tables
- `profiles` — user accounts (linked to `auth.users` via `user_id`)
- `schools` — multi-tenant isolation
- `classes` — school classes with grade level
- `subjects` — academic subjects
- `class_subjects` — teacher ↔ class ↔ subject assignments
- `student_classes` — student enrollment in classes
- `parent_students` — parent ↔ child links
- `grades` — student grades per subject/class/exam
- `content` — lessons, assignments, exams (type field)
- `submissions` — student work submissions
- `student_fees` — fee tracking (private schools)
- `payroll` — salary records
- `events`, `announcements`, `attendance`, `notifications`
- `messages` — direct 1:1 messaging between school members (sender/recipient profiles, `is_read`)
- `meetings`, `meeting_participants`, `meeting_messages`, `meeting_recordings` — Classe Virtuelle

### RLS Architecture
- Helper functions bypass RLS: `auth_school_id()`, `auth_profile_id()`, `auth_role()`, `is_admin()`, `is_parent_of(student_id)`
- All policies use these functions (NOT subqueries on `profiles`) to avoid infinite recursion
- Migration files: `001_initial_schema.sql` through `008_parent_visibility.sql`
  - `006_meetings.sql` — video meeting module
  - `007_messaging.sql` — direct messaging (`messages` table + realtime)
  - `008_parent_visibility.sql` — linked-parent read access to children's grades/submissions

### Role Dashboards
- **Teacher** (`/teacher`): tabbed — Overview, Gradebook (record grades), Roster, Lesson Planner / resource library, Analytics (attendance + grade trends via Recharts), Messages
- **Student** (`/student`): tabbed — Overview, Assignments (due dates + submission status + turn-in), Grades & feedback, Progress tracker, Messages
- **Parent** (`/parent`): read-only child monitor (grades, attendance, upcoming work, derived alerts) + Messages
- Shared `src/components/Messaging.tsx` powers `/list/messages` and every dashboard's Messages tab
- Reusable widgets live in `src/components/dashboard/`

### User Creation
- Uses `create_user_with_profile()` RPC function
- Creates `auth.users` + `auth.identities` + `profiles` in one atomic call
- Only admins can create users
- **School admins can only add users when their school subscription is `active`** (enforced in the RPC; platform admins are exempt)

### Onboarding Hierarchy (migration 009)
```
platform_admin ──onboards──▶ school + subscription + school_admin   (create_school_with_admin RPC)
platform_admin ──authorizes/suspends──▶ school subscription_status
school_admin   ──(once subscription = active)──▶ teachers / students / parents
```
- Platform admin tools: `/list/schools` (Onboard School + authorize/suspend + Manage Admin) and `/list/subscriptions`
- Platform admin can edit or **suspend a school_admin** (`update_school_admin` RPC, migration 010) — suspending sets `is_active = FALSE`, which `get_user_context()` rejects, blocking sign-in (used for non-payment)
- Two-track access control on the `school_admin`: **Suspend** = reversible block; **Delete** = permanent removal of the login (`delete_school_admin` RPC, migration 011 — deletes `auth.users`, cascading the profile/identity after neutralising non-cascading FKs)
- **Suspending the admin locks the entire school** (migration 012): `schools.access_suspended` flag, checked in `get_user_context()` (platform admin exempt), so teachers/students/parents are all blocked from sign-in until reactivated. `update_school_admin` toggles the flag; `signIn` surfaces a clear "school access suspended" message
- **Delete entire school** (`delete_school` RPC, migration 013): platform-admin only "danger zone" in the Manage Admin modal (type-the-name confirmation) — cascades away all school data and deletes every member's `auth.users` login. Guards block deleting a platform school or the caller's own school
- Ready-to-use platform login (provisioned by migration 009): **platform@schoolflow.app / Platform123!**
- Helpers: `is_platform_admin()`; platform admin has cross-school SELECT/INSERT/UPDATE on `schools`
- **Tenant isolation (migration 015)**: the platform admin manages the tenant layer ONLY — schools + their `school_admin`s. It can SELECT `school_admin` profiles (for Manage Admin) but NOT teachers/students/parents (RLS). Its sidebar is restricted (Menu `PLATFORM_ADMIN_ALLOWED`) to Schools/Subscriptions/account pages, and `/admin` renders `PlatformDashboard` (tenant KPIs), never the school operational dashboard. Each school is an independent tenant run by its own `school_admin`

---

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Dashboard shell (sidebar + navbar)
│   │   ├── admin/page.tsx          # Admin dashboard
│   │   ├── teacher/page.tsx        # Teacher dashboard (Wolfram-powered)
│   │   ├── student/page.tsx        # Student dashboard (grades from DB)
│   │   ├── parent/page.tsx         # Parent dashboard (linked children)
│   │   ├── profile/page.tsx        # User profile
│   │   ├── settings/page.tsx       # App settings + sign out
│   │   └── list/
│   │       ├── teachers/           # Teacher CRUD
│   │       ├── students/           # Student CRUD
│   │       ├── parents/            # Parent CRUD + student linking
│   │       ├── classes/            # Class management
│   │       ├── subjects/           # Subject management
│   │       ├── content/            # All content (lessons/assignments/exams)
│   │       ├── lessons/            # Lesson list
│   │       ├── exams/              # Exam list
│   │       ├── assignments/        # Assignment list
│   │       ├── results/            # Grades/results
│   │       ├── attendance/         # Attendance records
│   │       ├── events/             # School events
│   │       ├── announcements/      # Announcements
│   │       ├── messages/           # Messages (placeholder)
│   │       ├── fees/               # Student fees (premium design)
│   │       ├── payroll/            # Payroll management
│   │       └── labs/               # ← SCIENCE LABS
│   │           ├── page.tsx        # Labs landing (4 tabs)
│   │           ├── math/page.tsx   # MathLab (main solver)
│   │           ├── physics/page.tsx # Physics lab (AgentOne chat)
│   │           ├── chemistry/page.tsx # Chimie (zperiod.app iframe)
│   │           └── sciences/page.tsx  # Sciences (biodigital iframe)
│   ├── api/math/
│   │   ├── claude/route.ts         # GPT-4o streaming for explanations
│   │   ├── solve/route.ts          # GPT-4o structured solver (JSON)
│   │   ├── ocr/route.ts            # GPT-4o Vision for photo math
│   │   ├── wolfram/route.ts        # Wolfram Full Results API
│   │   ├── wolfram-llm/route.ts    # Wolfram LLM/CAG API
│   │   └── wolfram-agent/route.ts  # Wolfram AgentOne + GPT step-by-step
│   └── sign-in/page.tsx
├── components/
│   ├── labs/
│   │   ├── MathInput.tsx           # Math keyboard (Mathway-style)
│   │   ├── KaTeXRenderer.tsx       # LaTeX rendering (handles $, $$, \[, \()
│   │   ├── PlotlyGraph.tsx         # Interactive 2D/3D graphing
│   │   ├── PhotoInput.tsx          # Camera/upload for photo OCR
│   │   ├── GraphingCalculator.tsx  # Canvas-based grapher
│   │   ├── PlaybackControls.tsx    # Animation playback UI
│   │   └── VisualizationEngine.tsx # Legacy canvas animation
│   ├── forms/                      # All CRUD forms (11 forms)
│   ├── FormModal.tsx               # Modal wrapper with delete support
│   ├── Menu.tsx                    # Sidebar navigation
│   ├── Navbar.tsx                  # Top navigation bar
│   ├── Table.tsx                   # Generic data table
│   └── ...
├── features/math-animation/        # ← ANIMATION ENGINE
│   ├── index.ts                    # Barrel export
│   ├── SVGVisualizationEngine.tsx  # SVG-based animation (Framer Motion)
│   ├── DESIGN.md                   # Full animation architecture doc
│   ├── engine/
│   │   ├── types.ts                # MathToken, EquationState, AnimationStep
│   │   ├── tokenizer.ts            # LaTeX → MathToken[] with stable IDs
│   │   ├── diffEngine.ts           # Diff two states → AnimationSteps
│   │   ├── levelDetector.ts        # Auto-detect K-2 through grad level
│   │   ├── vocabulary.ts           # 7 vocabulary registers per level
│   │   ├── voiceNarrator.ts        # Browser SpeechSynthesis TTS
│   │   └── i18n.ts                 # en/fr/ar translations
│   ├── components/
│   │   ├── StepByStepAnimator.tsx  # Main animated step-by-step display
│   │   ├── AnimatedEquation.tsx    # Term-level displacement animation
│   │   ├── AnimatedStep.tsx        # Single animated step (SVG)
│   │   ├── AnimatedToken.tsx       # Single animated token (SVG)
│   │   ├── EquationStage.tsx       # SVG container with background
│   │   └── StepConnector.tsx       # Arrow between steps
│   ├── layoutEngine.ts
│   ├── tokenizer.ts
│   ├── types.ts
│   └── useAnimationController.ts
├── lib/
│   ├── equationSolver.ts           # Legacy local solver (1700+ lines)
│   ├── math/
│   │   ├── solvePipeline.ts        # ← MAIN SOLVE PIPELINE
│   │   ├── wolframService.ts       # Wolfram Full Results client
│   │   ├── wolframAgent.ts         # Wolfram AgentOne client
│   │   ├── wolframLLM.ts           # Wolfram LLM/CAG client
│   │   ├── claudeService.ts        # GPT-4o streaming client
│   │   ├── gptSolver.ts            # GPT structured solver
│   │   ├── newtonApi.ts            # Newton API (legacy fallback)
│   │   └── equationToLatex.ts      # Plain text → LaTeX conversion
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client
│   │   └── server.ts               # Server Supabase client
│   └── data.ts                     # Mock/seed data
├── contexts/
│   └── AuthContext.tsx             # Auth state (user, role, school)
├── hooks/
│   └── useSupabaseQuery.ts         # Generic data fetching hook
└── types/
    └── index.ts                    # All TypeScript interfaces
```

---

## Math Solve Pipeline (CRITICAL)

**File: `src/lib/math/solvePipeline.ts`**

Pipeline order (accuracy-first):

1. **Graph requests** ("plot x^2") → Plotly chart
2. **Natural language** (no math operators) → GPT-4o streaming
3. **Pure arithmetic** (2+3, 5!) → local solver (instant)
4. **EVERYTHING ELSE** → **Wolfram AgentOne** (PRIMARY solver)
5. **Fallback** → Wolfram Full Results API + LLM API
6. **Last resort** → GPT-4o with verification prompt

**IMPORTANT**: The local solver and Newton API are NEVER used for equations with variables. Wolfram AgentOne handles ALL algebra, calculus, differential equations, matrices, etc.

**When Wolfram solves a problem:**
- AgentOne returns structured pods (Input, Solution, Plots, etc.)
- GPT-4o generates step-by-step solution using Wolfram's VERIFIED answer as ground truth
- Steps are animated with the StepByStepAnimator

---

## MathLab Features

### Math Keyboard (MathInput.tsx)
- **Basic Math keyboard**: shapes (rectangle, circle, triangle, pyramid, etc.), fractions, exponents, subscripts, sqrt, nth root, scientific notation, mixed numbers, coordinate pairs
- **Algebra keyboard**: matrix input, xy grid, f(x), ln, log, braces, ∩, ∪, π, ∞, i, e
- All geometry shapes have SVG icons and editable parameter fields
- Matrix button opens a size selector modal → editable grid → solve
- Fraction button shows visual stacked numerator/denominator in editor

### Shape Calculator
- 11 shapes: Circle, Triangle, Rectangle, Rectangular Prism, Pyramid, Sphere, Cone, Cylinder, Parallelogram, Trapezoid, Composite
- Each has correct formulas with step-by-step calculation
- "How should I answer?" modal shows calculation options per shape

### Animation Engine
- Auto-detects level (K-2 through grad) from equation content
- 7 animation phases per term: idle → highlight → detach → moving → landing → morphing → result
- Each term individually addressable with Framer Motion layoutId
- Level-aware speed (0.3× for K-2 to 1.0× for grad)
- Level-aware vocabulary (playful → elementary → standard → formal → rigorous)
- Voice narration (browser SpeechSynthesis, auto-on for K-8)
- i18n: English, French, Arabic (RTL support)
- Playback controls: play/pause, prev/next, replay, show all, speed display

### Photo OCR
- Camera/upload → sends base64 to GPT-4o Vision → extracts math expression

### Interactive Graphing
- Plotly.js with dark theme
- Supports: x^2, sin(x), cos(x), tan(x), sqrt(x), log(x), ln(x), abs(x), e^x
- Auto-generated from "plot" requests or inline in chat

### Follow-up Questions
- Text input appears after first answer
- Context-aware: includes last solved equation in GPT prompt
- Graph requests use last solved equation if no function specified

---

## Science Labs

| Tab | Route | Content |
|---|---|---|
| Mathematics | `/list/labs/math` | Full MathLab with Wolfram solver |
| Physics | `/list/labs/physics` | AgentOne-powered chat + topics sidebar |
| Chimie | `/list/labs/chemistry` | zperiod.app iframe (periodic table) |
| Sciences | `/list/labs/sciences` | BioDigital Human 3D Anatomy (API widget) |

---

## Student Fees Page (Premium Design)

- **Admin view**: KPI cards (collected/expected/outstanding/fully paid), search + filters, premium table with avatars, progress bars, status pills
- **Parent view**: Progress ring, fee breakdown by category, payment history timeline, "Pay now" button
- Auto-switches based on user role

---

## Forms (11 total, all write to Supabase)

All forms use `school_id` from `useAuth()` and include:
- Teacher, Student, Parent (use `create_user_with_profile` RPC)
- Subject, Class, Lesson, Exam, Assignment, Result, Event, Announcement
- All show success/error messages and reload page after save

---

## Key Design Decisions

1. **Wolfram Alpha is the source of truth** for math solving — never use local solver for equations with variables
2. **GPT-4o generates step-by-step** using Wolfram's verified answer as ground truth — GPT never invents its own solution
3. **KaTeX handles all math rendering** — supports $, $$, \[, \(, ###, **bold**, and strips duplicate plaintext
4. **RLS uses SECURITY DEFINER helper functions** to avoid infinite recursion on `profiles` table
5. **Dark theme** for MathLab (navy gradient), **light theme** for keyboard (Mathway-exact)
6. **All forms reload page** after successful create/update
7. **FormModal** maps table names to Supabase tables and handles delete with confirmation

---

## Coding Conventions

- `"use client"` on all interactive components
- All DB queries through Supabase client with RLS enforced
- API keys in `.env.local`, never hardcoded
- All forms use Zod validation (optional fields for non-critical data)
- Component files ≤ reasonable size, extract utilities to separate files
- TypeScript strict mode, no `any` where avoidable
- Tailwind CSS for all styling, no external CSS frameworks
- SVG icons inline (no icon library dependency for math keyboard)

---

## Common Issues & Solutions

| Issue | Solution |
|---|---|
| RLS infinite recursion on profiles | Use `auth_school_id()`, `auth_profile_id()`, `is_admin()` functions |
| `user_id` NOT NULL on profile create | Use `create_user_with_profile()` RPC |
| Manually-created user can't log in ("Database error querying schema") | `auth.users` token columns (`recovery_token`, `email_change_token_new`, `email_change`, …) must be `''` not NULL — fixed in migration 014 |
| Zod validation blocking form submit | Make optional fields use `.optional()` |
| KaTeX showing raw `$$` | Parser handles `$$` on own line, strips remaining delimiters |
| GPT duplicating LaTeX as plaintext | Prompt explicitly forbids duplicates, `cleanGPTOutput()` strips fragments |
| Wolfram returning wrong answer | Always use AgentOne as primary, never local solver for complex math |
| Animation too fast | Speed is 0.3-1.0× (not >1.0×), phase durations are 1200-3000ms |
| zod v4 breaking build | Pin to `zod@3.23.8` (v3.25+ has different file structure) |
