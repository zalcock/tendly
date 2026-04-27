# Design Steering: Tendly

## Design Philosophy
Government systems are "brutalist" and overwhelming. Tendly must be **Empathetic, Authoritative, and Clean**. The UI should feel like a premium financial tool (e.g., Stripe or Mercury), not a government form.

## Visual Identity
* **Primary Palette:** * `Federal Blue (#1B365D)`: Evokes trust and authority.
    * `Action Mint (#00D1B2)`: High-contrast call-to-actions for "Apply" or "Match."
* **Typography:** Inter (Sans-serif) for maximum readability in data-dense tables.

## Component Guidelines
* **The "Match Card":** Must prioritize: 1) Solicitations Title, 2) Deadline (Color-coded: Red < 48h), 3) Estimated Value, 4) "Why this matches you" snippet.
* **Empty States:** Use encouraging illustrations/text when no matches are found, suggesting profile optimizations.
* **Progress Indicators:** Steppers are mandatory for long "Registration" workflows to prevent user fatigue.

## Accessibility (A11y)
* **Standard:** WCAG 2.1 AA compliance is non-negotiable, given the proximity to government-adjacent services.
* **Contrast:** Minimum 4.5:1 ratio for all functional text.
* **Navigation:** Full keyboard navigability for power users managing large bid volumes.