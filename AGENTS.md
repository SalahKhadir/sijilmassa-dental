# Sijilmassa Dental — Agent Instructions

These instructions apply to all AI coding agents working in this repository. Read this file before planning or modifying code. Follow any more-specific `AGENTS.md` files in subdirectories where applicable.

## 1. Product mission

Sijilmassa Dental is a **local-first dental practice management web application** for a single dental clinic in Morocco. Its initial users are **one dentist and one receptionist**, working simultaneously from separate computers on the same local network.

The product should make routine clinic work simpler, faster, and safer: patient administration, appointment scheduling, dental records, invoicing and payments, and eventually prescriptions and reports.

- **Interface language:** French (`fr-MA` conventions where appropriate).
- **Currency:** Moroccan dirham (MAD / DH).
- **Default operating model:** The dentist's existing PC hosts the local application and database; the receptionist connects via browser over the clinic LAN.
- **Budget constraint:** No paid backend, database, or cloud hosting subscriptions.
- **Current phase:** Project foundation and incremental development. Do **not** implement deployment, Docker, CI/CD, production infrastructure, or unrelated modules unless explicitly requested.
- Use **fictional/synthetic data only** for development, tests, screenshots, and demonstrations.

## 2. Architecture decisions

The intended stack is:

| Layer                        | Technology                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Frontend                     | Next.js (App Router), React, TypeScript, Tailwind CSS                                              |
| UI                           | Accessible reusable components; shadcn/ui may be adopted when requested                            |
| Backend                      | Java, Spring Boot modular monolith, REST API                                                       |
| Database                     | PostgreSQL, migrations with Flyway                                                                 |
| Authentication/authorization | Spring Security, secure sessions, server-enforced RBAC                                             |
| Documents                    | Reuse/adapt the existing TypeScript `pdf-lib` A5 invoice generator when that module is implemented |
| Development package manager  | `pnpm` for the frontend                                                                            |
| Future deployment            | Self-hosted on the dentist's PC, accessed on the clinic LAN                                        |

Do not introduce microservices, Kubernetes, cloud databases, hosted authentication, paid APIs, or other infrastructure without explicit approval. Do not add dependencies merely for convenience when an existing, well-maintained solution is sufficient.

Keep the monorepo structure:

```text
sijilmassa-dental/
├── frontend/
├── backend/
├── docs/
├── .agents/skills/
├── .editorconfig
├── .gitignore
├── AGENTS.md
└── README.md
```

Do not change the separate `kaoutar_facturation` repository. Its existing invoice branding, layout, and tested calculations are a reference for later integration, not permission to modify that repository.

## 3. Design system — mandatory color palette

**Preserve these exact hex values.** They are the project's canonical design tokens. Do not substitute approximate colors, introduce an unrelated theme, or silently change them. Define the tokens centrally in the frontend stylesheet or theme configuration when frontend setup begins, and reference tokens rather than scattering hex values throughout components.

```css
:root {
  --primary: #5e0b1b;
  --primary-hover: #480815;
  --primary-light: #9a2d43;
  --primary-tint: #f5e1e5;
  --secondary: #2a7f80;
  --secondary-tint: #e0f1f0;
  --accent: #c9a24b;

  --bg: #faf7f6;
  --surface: #ffffff;
  --border: #e8dfe0;
  --text: #2a1a1d;
  --text-muted: #6e5c60;

  --success: #2e7d5b;
  --warning: #d99a1e;
  --danger: #d6293e;
  --info: #2f6fa3;
}
```

### Color usage

- **Primary burgundy:** Main navigation identity, primary actions, active states, and selected controls.
- **Primary hover:** Hover/pressed state for burgundy primary actions.
- **Primary light/tint:** Subtle emphasis, selection backgrounds, and supportive surfaces.
- **Secondary teal:** Supporting actions, informative highlights, and selected healthcare-related visual accents.
- **Secondary tint:** Soft teal surfaces and subtle highlights.
- **Gold accent:** Restrained decorative or premium details; do not use as the default body text or as a status indicator.
- **Background/surface:** Warm off-white page background with white content surfaces.
- **Border:** Soft, unobtrusive separators.
- **Text/text-muted:** Main text and secondary metadata; check actual contrast before using muted text at small sizes.
- **Success/warning/danger/info:** Semantic statuses only. Do not communicate status using color alone.

The palette is a starting point, not proof of accessible contrast. Check contrast for actual text/background pairings against WCAG 2.2 AA. If a combination fails, change the _usage_ (e.g., use a darker foreground, larger text, or a different token pairing) rather than modifying the canonical token values. Avoid low-contrast gold or warning text on white backgrounds.

### Visual direction

- Professional, calm, trustworthy, modern dental-clinic software; **not** a marketing landing page.
- Clean information hierarchy, comfortable spacing, restrained shadows, subtle borders, and consistent radii.
- Prioritize dense-but-readable operational screens: patient lists, appointments, forms, invoices, and clinical workflows.
- Optimize for desktop and laptop use; retain responsive behavior for smaller screens.
- Use clear French labels, helpful empty states, actionable validation messages, and predictable navigation.
- Avoid generic AI aesthetics: excessive gradients, glowing effects, random purple, glassmorphism everywhere, gratuitous animations, and decorative charts with no operational value.
- Support keyboard navigation, visible focus indicators, semantic controls, accessible dialogs, and reduced-motion preferences.
- Keep typography consistent and readable. Do not add custom font dependencies without a clear need.

## 4. Installed agent skill: Stageshow

The project includes the skill at `.agents/skills/stageshow/SKILL.md`.

**Use Stageshow when the task calls for** mocked product UI, static feature illustrations, product screenshots, marketing/demo visuals, animated cursor walkthroughs, or illustrative bento compositions. Read its `SKILL.md` and relevant references before using its kit.

**Do not use Stageshow as the default component framework for the real ERP.** Its UI scenes are authored demonstrations, not functional patient forms, calendars, tables, or business workflows. For production screens, use real accessible React components and the project's design tokens. Do not copy fake interactions or placeholder behavior into operational features.

When making Stageshow illustrations, apply the Sijilmassa Dental palette and use fictional patient information only.

## 5. Roles and privacy boundaries

Initial roles:

- **Dentist:** Authorized clinical records, consultations, treatment plans, prescriptions, appointments, billing, and appropriate administrative functions.
- **Receptionist:** Administrative patient information, scheduling, invoices, and payments; no unrestricted access to confidential clinical notes or medical history.

Enforce authorization **server-side** for every protected resource and operation. Hiding a button in the frontend is not authorization. Follow least privilege, avoid exposing sensitive data in logs, URLs, analytics, screenshots, or test fixtures, and never hardcode credentials or secrets.

This software may eventually process health information. Treat privacy and security as product requirements. Do not claim CNDP or Moroccan Loi 09-08 compliance merely because data is hosted locally; legal and operational validation is required before real clinical use.

## 6. Engineering standards

- Prefer small, reviewable, incremental changes. Implement **only the requested task**.
- Inspect existing files, conventions, and dependencies before adding or replacing anything.
- Use TypeScript strict typing; avoid `any` unless justified and documented.
- Keep UI components focused; separate presentation, validation, data access, and business rules.
- Validate inputs at trust boundaries; never rely solely on frontend validation.
- Use parameterized queries/ORM protections and schema migrations for database changes.
- Preserve monetary precision (integer centimes or exact decimal arithmetic); never use binary floating-point for billing calculations.
- Write tests for business rules, access control, and regressions relevant to each task.
- Provide meaningful error states and avoid leaking sensitive technical details to users.
- Use conventional, descriptive naming and consistent formatting.
- Avoid speculative abstractions, premature optimization, and unnecessary packages.
- Do not commit, push, open pull requests, or alter repository settings unless explicitly requested.

## 7. Agent task workflow

For each requested implementation:

1. **Inspect:** Read the relevant files and this instruction document; identify existing patterns.
2. **Scope:** Summarize the smallest change that fulfills the request. Ask before making major architectural deviations.
3. **Implement:** Make focused changes; avoid unrelated refactors.
4. **Validate:** Run applicable formatting, linting, type checking, tests, and build checks supported by the current repository state. Do not invent successful results.
5. **Report:** State changed files, decisions made, commands run, results, and any outstanding risks or follow-up work.

When a task is documentation-only, do not scaffold application code. When asked to initialize the frontend, do not also initialize the backend. When asked to design UI, do not implement business features unless explicitly requested.

## 8. Product quality bar

The application must be practical for busy clinic staff: quick patient lookup, predictable appointment flows, minimal repetitive entry, clear confirmations, and legible printable documents. Favor correctness and usability over visual spectacle.

Before proposing a new feature, identify its real clinic workflow, who can access it, what data it needs, and how success will be verified. Keep the MVP narrow and evolve it based on actual dentist and receptionist feedback.

## 9. Reference documentation

- Next.js: https://nextjs.org/docs
- React: https://react.dev
- Tailwind CSS: https://tailwindcss.com/docs
- Spring Boot: https://docs.spring.io/spring-boot/index.html
- PostgreSQL: https://www.postgresql.org/docs/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Stageshow: https://github.com/benjitaylor/skills/tree/main/stageshow

## Writing Quality — Unslop

The project includes the Unslop agent skill:
`.agents/skills/unslop/SKILL.md`

Use Unslop when creating or significantly revising:

- User-facing interface copy
- French labels, descriptions, and empty states
- Validation and error messages
- README and project documentation
- Help text and onboarding content

Guidelines:

1. Read the skill instructions before using it.
2. Prefer clear, natural, concise French for the clinic UI.
3. Preserve medical terminology, factual accuracy, and meaning.
4. Avoid generic marketing language and unnecessary filler.
5. Never alter clinical facts or safety warnings for stylistic reasons.
6. Do not rewrite code, identifiers, or structured data merely
   to satisfy writing-style checks.
7. Apply suggestions selectively; do not blindly accept every
   scanner finding.
8. If the skill does not support the content language, perform
   a careful manual editorial review instead.

Unslop supplements existing code quality, accessibility,
security, and UI design requirements. It does not replace them.
