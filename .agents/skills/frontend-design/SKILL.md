## Frontend Design Skill — Betel Edition (coherent with Biserica Betel)

This skill produces **production-grade, visually distinctive** frontends that **match the Biserica Betel design language** (editorial, high-contrast, typography-led) instead of generic “AI UI”.

---

# Design Thinking

Before coding, commit to a BOLD direction, but **inside the Betel brand box**:

* **Purpose**: Church-facing experiences (info, media, giving, events, locations). Clarity + reverence + modern confidence.
* **Tone (default for Betel projects)**: **Editorial / magazine minimalism**
  High contrast, big type, measured spacing, monochrome photography, tiny color accents.
* **Constraints**:

  * Must work great on mobile first.
  * Accessibility: readable contrast, focus states, overlay for text on photos.
  * Performance: avoid heavy JS effects; prefer CSS + small enhancements.
* **Differentiation (Betel-specific “unforgettable”)**:

  1. The **signature mixed-type titles** (Bold + Condensed Italic)
  2. **Location-coded accent** (one accent per page)

**CRITICAL Betel rule:** Creativity is allowed in layout and atmosphere, but **do not change the core identity** (type system, black/white base, minimal accent).

---

# Non-Negotiables (Brand Lock)

### Typography (must use)

* Base: `Franie-SLight, Arial, sans-serif`
* Bold: `Franie-SBold`
* Accent italic: `Franie-CondensedXLight-Italic`
* Markdown and content heavy: `Lato, sans-serif`

**No replacing these with Inter/Roboto/etc.** If the font files aren’t available, implement fallbacks but keep the same structure and weight contrast.

### Signature title compositions (must replicate)

Use these patterns across hero, section headers, and key modules:

* **BETEL CENTRU**

  * `BETEL` = **Bold**
  * `CENTRU` = **Condensed Italic**
  * Add a **small accent “sprinkle”** to the italic word (partial color, underline, hairline, or subtle gradient edge)

* **BISERICA BETEL**

  * `BISERICA` = **Bold**
  * `BETEL` = **Condensed Italic**
  * Same sprinkle rule

**Sprinkle rule:** Accent is a highlight, never a big colored block.

---

# 3 Color System (Betel locations)

### Base palette (default)

* Mostly **black / white / grayscale**
* Dark UI is common and preferred for hero and giving sections.

### Location accents (choose ONE per page/project)

* Betel Mănăștur: `#17d3c3`
* Betel Centru: `#ff6200`
* Betel Vest: `#a0384b`
* Betel Est: `#ffd000`

**Accent usage rule (strict):**

* Accents should be ~**5–10%** of the screen.
* Use for: italic “sprinkle”, badges, thin rules, icons, hover states, selected tabs.
* Avoid: multi-accent rainbow, full accent backgrounds, loud gradients.

---

# 4 Spatial Composition (the Betel layout DNA)

* **Typography-led hierarchy**: big hero title, short supportive text, clear CTAs.
* **Generous whitespace**: don’t cram; sections breathe.
* **Clean grid**: consistent alignment, repeatable section patterns.
* **Cards and modules**: minimal, high contrast, one small accent detail.

Default spacing feel:

* Desktop sections: **large vertical padding** (don’t compress)
* Mobile: same structure, tighter but still airy.

---

# 5 Imagery & Atmosphere (how Betel looks)

* Prefer **black & white / desaturated** photos.
* If text sits on an image: **add a dark overlay** for legibility.
* Thumbnails: consistent aspect ratios and consistent contrast treatment.
* Avoid “stocky” visuals; use documentary/community moments when possible.

---

# 6 Motion & Interaction (restrained, intentional)

Betel motion is **subtle and editorial**, not playful-app UI.

* Use **one strong moment**: hero load reveal (fade + slight translate + stagger).
* Hover states: tiny lift, underline, accent border, or image zoom (very subtle).
* Avoid excessive parallax, bouncy easings, glowing neon, or “startup gradients”.

---

# 7 Components (implementation rules)

### Buttons

* High-contrast (white on black / black on white)
* Rounded (pill or soft radius)
* Hover: small accent hint (underline, border, icon, hairline)

### Cards

* Clean blocks, minimal shadow
* One accent element max (badge/line/icon)
* Strong typography hierarchy inside

### Links

* Underline on hover
* Accent link color only when location-relevant

### Forms (donate / signup)

* Simple, centered, tall inputs, clear focus state
* Don’t use harsh error red as the primary aesthetic—keep it readable and calm

---

# 8 “Avoid AI Slop” — Betel version

Never introduce:

* Generic font swaps (Inter/Roboto/system UI as primary look)
* Purple-on-white gradients, glassmorphism, random neon glows
* Over-componentized “dashboard UI” patterns
* Busy shadows and cluttered spacing

**The Betel aesthetic is won by restraint + typography precision.**

## The one-sentence “north star”

**Build like a magazine cover: black/white, bold type + condensed italic signature, monochrome imagery, and one location accent used like punctuation.**
