# pordee — Design Spec

**Date:** 2026-05-07
**Author:** Vatunyoo Suwannapisit
**Status:** Draft (pending implementation)

---

## 1. Overview

### 1.1 What

`pordee` (พอดี — Thai for "just right") is a Claude Code plugin that compresses agent output into terse, simple Thai while preserving full technical accuracy. It mirrors the proven approach of [`caveman`](https://github.com/JuliusBrussee/caveman) but is purpose-built for Thai+English bilingual developers.

### 1.2 Why

Caveman shows that instructing the agent to "talk like a caveman" cuts ~75% of output tokens with no loss of technical substance. Thai-speaking developers writing prompts in Thai get verbose, polite, hedged responses that waste tokens. `pordee` fixes that for Thai conversations specifically — drop polite particles, drop hedging, keep technical English terms intact.

### 1.3 Cultural framing (Thai)

> ทำไมใช้คำเยอะ ตอบสั้นๆ ก็เข้าใจ — ภาษาไทยมีคำสุภาพและคำขยายเยอะ ทำให้ token งอก แต่ความหมายเท่าเดิม pordee ตัดส่วนที่ไม่จำเป็นทิ้ง เก็บ technical term ภาษาอังกฤษไว้ อ่านแล้วเข้าใจตรงประเด็นเหมือนเดิม

### 1.4 Non-goals

- **No 文言文 / Wenyan / classical mode.** Per requirement.
- **No multi-agent installer.** Claude Code only for v1.
- **No sub-skills.** No pordee-commit / pordee-review / pordee-stats / compress / cavecrew. v1 is the core skill only.
- **No MCP shrink middleware.** Defer.
- **No statusline badge.** Defer.

---

## 2. Architecture

### 2.1 Plugin shape

Standard Claude Code plugin. `claude plugin install` wires hooks via the `hooks` block in `plugin.json` — no separate shell installer needed for the plugin path. Cross-platform free because hook logic runs on Node.

### 2.2 File layout

```
pordee/
├── .claude-plugin/
│   ├── plugin.json              # name, desc, hooks block
│   └── marketplace.json         # marketplace manifest
├── skills/
│   └── pordee/
│       └── SKILL.md             # main skill (Thai compression rules)
├── hooks/
│   ├── pordee-activate.js       # SessionStart hook
│   ├── pordee-mode-tracker.js   # UserPromptSubmit hook
│   └── pordee-config.js         # state read/write helper
├── tests/
│   ├── test_state.js
│   ├── test_hooks.js
│   ├── test_triggers.js
│   └── test_cross_platform.js
├── docs/
│   └── superpowers/specs/2026-05-07-pordee-design.md
├── README.md                     # Thai-only
├── LICENSE                       # MIT
└── .gitignore
```

### 2.3 State

State file: `<homedir>/.pordee/state.json`. Resolved via Node `os.homedir()` — works on macOS, Linux, Windows.

```json
{
  "enabled": true,
  "level": "full",
  "version": 1,
  "lastChanged": "2026-05-07T10:30:00.000Z"
}
```

Defaults when missing or malformed:
```json
{ "enabled": false, "level": "full", "version": 1 }
```

### 2.4 Cross-platform strategy

- All hook logic = Node.js. No bash, no PowerShell.
- `os.homedir()` for state path.
- `path.join` for separators.
- Atomic writes: write to `state.json.tmp`, `fs.renameSync` to `state.json`.
- Plugin manifest hooks block uses `${CLAUDE_PLUGIN_ROOT}` — resolved by Claude Code on every platform.

---

## 3. Skill

### 3.1 Frontmatter

```yaml
---
name: pordee
description: |
  Ultra-compressed Thai+English communication mode. Cuts ~60-75% of tokens by
  speaking simple Thai while preserving technical accuracy. Use when user
  says "/pordee", "พอดี", "พอดีโหมด", "พูดสั้นๆ", or invokes /pordee.
  Stops on "หยุดพอดี", "พูดปกติ", or /pordee stop.
---
```

### 3.2 Body sections (in order)

1. **Persistence** — Active every response. No drift. Off only via stop triggers.
2. **Rules** — drop list, terse swaps, technical-term preservation
3. **Levels table** — lite, full
4. **Examples** — 3 dev + 3 daily-life (also in README)
5. **Auto-Clarity** — when to drop pordee mode briefly
6. **Boundaries** — code/commits/errors stay normal

### 3.3 Compression rules

#### 3.3.1 Always drop

| Category | Words / phrases |
|---|---|
| Polite particles | ครับ, ค่ะ, นะคะ, นะครับ, จ้ะ, จ้า |
| Hedging | อาจจะ, น่าจะ, ค่อนข้างจะ, จริงๆ, จริงๆแล้ว, ความจริงแล้ว, อันที่จริง |
| Filler | ก็, ก็คือ, นั่นคือ, แบบว่า, เอ่อ, อืม |
| Pleasantries | ยินดีครับ, ได้เลยครับ, แน่นอน, แน่นอนครับ |
| English-style filler that leaks in | just, really, basically, actually, simply |

#### 3.3.2 Verbose → terse swaps

| Verbose | Terse |
|---|---|
| เนื่องจาก / เพราะว่า | เพราะ |
| หากว่า / ในกรณีที่ | ถ้า |
| ดำเนินการ X | X |
| พิจารณา | ดู |
| ในการที่จะ | เพื่อ |
| มีความจำเป็นต้อง | ต้อง |
| อย่างไรก็ตาม | แต่ |
| ดังนั้น | เลย |
| ทำการแก้ไข | แก้ |
| ทำการตรวจสอบ | เช็ก / ดู |
| มีความเป็นไปได้ | อาจ |
| ทำให้เกิด | ทำให้ |
| โดยทั่วไปแล้ว | ปกติ |

### 3.4 Levels

| Level | Trigger | Behavior |
|---|---|---|
| **Lite** | `/pordee lite` | Drop polite particles + hedging + pleasantries. Keep grammar intact (subjects, verbs, common particles ที่/ว่า/จะ stay). Professional Thai prose, no fluff. |
| **Full** *(default)* | `/pordee` or `/pordee full` | Lite rules + drop redundant particles (ที่, ซึ่ง, ว่า after verbs of speech, อยู่, กำลัง). Drop nominalizer prefixes (การ-, ความ-) when root verb works. Fragments OK. Short synonyms (ดู not ตรวจสอบ, แก้ not ทำการแก้ไข). |

Pattern for full: `[ของ] [ทำ] [เหตุผล]. [ขั้นต่อ].`

### 3.5 Examples

#### 3.5.1 Dev: "ทำไม React component ถึง re-render?"

| Mode | Tokens (est) | Response |
|---|---|---|
| Normal | ~80 | "แน่นอนครับ ผมยินดีจะอธิบายให้นะครับ จริงๆ แล้วเหตุผลที่ React component ของคุณ re-render นั้น น่าจะเกิดจากการที่คุณส่ง object reference ใหม่เป็น prop ในทุกครั้งที่ component ถูก render ซึ่งทำให้ React มองว่า prop เปลี่ยน และทำการ re-render component ลูก ดังนั้นคุณอาจจะลองใช้ useMemo เพื่อ memoize object นั้นดูครับ" |
| Lite | ~45 | "React component re-render เพราะส่ง object reference ใหม่เป็น prop ทุกครั้งที่ render ทำให้ React มองว่า prop เปลี่ยน และ re-render component ลูก ลองใช้ useMemo เพื่อ memoize object นั้น" |
| Full | ~22 | "Object ref ใหม่ทุก render. Inline object prop = ref ใหม่ = re-render. ห่อด้วย `useMemo`." |

#### 3.5.2 Dev: "อธิบาย database connection pooling"

| Mode | Tokens (est) | Response |
|---|---|---|
| Normal | ~70 | "ครับ การทำ database connection pooling นั้น โดยทั่วไปแล้วก็คือการที่เราเก็บ connection ของ database ที่เปิดไว้แล้ว เพื่อนำกลับมาใช้ใหม่อีกครั้ง แทนที่จะต้องเปิด connection ใหม่ทุกครั้งที่มี request เข้ามา ซึ่งจะช่วยลด overhead ของการทำ TCP handshake และ authentication ได้อย่างมีประสิทธิภาพ" |
| Lite | ~35 | "Connection pooling เก็บ connection database ที่เปิดไว้แล้ว เพื่อนำกลับมาใช้ใหม่ ไม่ต้องเปิดใหม่ทุก request ลด overhead ของ TCP handshake และ authentication" |
| Full | ~18 | "Pool reuse connection ที่เปิดไว้. ไม่เปิดใหม่ทุก request. ข้าม TCP handshake." |

#### 3.5.3 Dev: Bug report (auth middleware)

| Mode | Tokens (est) | Response |
|---|---|---|
| Normal | ~55 | "ครับ ผมตรวจสอบให้แล้วนะครับ ปัญหาที่คุณเจอน่าจะเกิดจาก bug ใน auth middleware ครับ จริงๆ แล้วในส่วนของ token expiry check นั้น โค้ดใช้เครื่องหมาย `<` แทนที่จะเป็น `<=` ซึ่งทำให้ token ที่หมดอายุพอดีไม่ถูก reject ดังนั้นเราควรจะแก้ตรงจุดนี้ครับ" |
| Lite | ~30 | "Bug อยู่ที่ auth middleware ส่วน token expiry check ใช้ `<` แทนที่จะเป็น `<=` ทำให้ token ที่หมดอายุพอดีไม่ถูก reject แก้:" |
| Full | ~14 | "Bug ที่ auth middleware. Token expiry ใช้ `<` ไม่ใช่ `<=`. Fix:" |

#### 3.5.4 Daily: "แนะนำอาหารกลางวันให้หน่อย"

| Mode | Tokens (est) | Response |
|---|---|---|
| Normal | ~70 | "ได้เลยครับ จริงๆ แล้วการเลือกอาหารกลางวันก็ขึ้นอยู่กับหลายปัจจัยนะครับ เช่น งบประมาณ เวลาที่มี และความต้องการทางโภชนาการของคุณ ถ้าคุณอยากทานอาหารที่ทำง่ายและมีประโยชน์ ผมขอแนะนำว่าน่าจะลองทำสลัดไก่ย่างดูครับ เพราะว่ามีโปรตีนสูงและไม่ใช้เวลาเตรียมนานเลย" |
| Lite | ~32 | "อาหารกลางวันขึ้นอยู่กับงบ เวลา และโภชนาการ ถ้าอยากกินง่ายและมีประโยชน์ ลองสลัดไก่ย่าง โปรตีนสูงและเตรียมไม่นาน" |
| Full | ~14 | "งบ + เวลา + โภชนาการ. ง่ายและดี → สลัดไก่ย่าง. โปรตีนสูง, เตรียมเร็ว." |

#### 3.5.5 Daily: "เที่ยวเชียงใหม่ ไปเดือนไหนดี"

| Mode | Tokens (est) | Response |
|---|---|---|
| Normal | ~75 | "ครับ ถ้าคุณอยากไปเที่ยวเชียงใหม่ ผมแนะนำว่าน่าจะไปช่วงเดือนพฤศจิกายนถึงกุมภาพันธ์ครับ เพราะว่าเป็นช่วงที่อากาศเย็นสบาย ไม่ร้อนเกินไป และไม่มีฝนตกบ่อยเหมือนช่วงอื่นๆ จริงๆ แล้วเดือนธันวาคมก็เป็นเดือนที่นิยมที่สุดเลยนะครับ แต่ก็จะคนเยอะหน่อย" |
| Lite | ~30 | "ไปเชียงใหม่ ช่วงพฤศจิกายน-กุมภาพันธ์ดีที่สุด อากาศเย็นสบาย ไม่ร้อน ฝนน้อย ธันวาคมนิยมที่สุดแต่คนเยอะ" |
| Full | ~12 | "พ.ย.-ก.พ. ดีสุด. อากาศเย็น, ฝนน้อย. ธ.ค. คนเยอะ." |

#### 3.5.6 Daily: "วิธีนอนหลับให้สนิท"

| Mode | Tokens (est) | Response |
|---|---|---|
| Normal | ~70 | "ครับ การนอนหลับให้สนิทนั้นมีหลายวิธีนะครับ ก่อนอื่นเลย คุณควรจะหลีกเลี่ยงการดื่มกาแฟหรือเครื่องดื่มที่มีคาเฟอีนหลังบ่ายสาม จริงๆ แล้วก็ควรจะปิดหน้าจอทุกชนิดอย่างน้อย 30 นาทีก่อนนอนนะครับ และพยายามเข้านอนเวลาเดิมทุกวันเพื่อให้ร่างกายปรับนาฬิกาชีวิต" |
| Lite | ~32 | "นอนหลับสนิทมีหลายวิธี เลี่ยงคาเฟอีนหลังบ่ายสาม ปิดหน้าจอ 30 นาทีก่อนนอน เข้านอนเวลาเดิมทุกวันเพื่อปรับนาฬิกาชีวิต" |
| Full | ~14 | "เลี่ยงคาเฟอีนหลังบ่าย 3. ปิดจอ 30 นาทีก่อนนอน. เข้านอนเวลาเดิม → ปรับ circadian." |

### 3.6 Auto-clarity (drop pordee briefly)

Resume normal Thai for these cases, then return to pordee:

- Security warnings (`Warning:`, ⚠️)
- Irreversible action confirmations (`DROP TABLE`, `rm -rf`, `git push --force`, `git reset --hard`, `git branch -D`)
- Multi-step sequences where order matters and fragments could be misread
- User asks for clarification: "อะไรนะ", "พูดอีกที", "อธิบายชัดๆ", "ไม่เข้าใจ", "งง", "ขยายความ"

### 3.7 Boundaries (NEVER caveman)

- Code blocks → byte-for-byte unchanged
- Commits, PRs, code review comments → normal English
- Error messages → exact quote
- File paths, URLs, identifiers, function names → exact
- Stack traces → exact
- Technical English terms (token, function, async, middleware, hook, plugin, build, deploy, error, bug, fix) → keep English

---

## 4. Hooks

### 4.1 SessionStart — `pordee-activate.js`

```
read state.json
if not exists: write defaults, return silently (exit 0)
if enabled === false: return silently
if enabled === true:
  emit additionalContext to stdout:
    "PORDEE MODE ACTIVE — level: <level>
     Respond terse like simple Thai. Keep technical English terms.
     Drop polite particles, hedging, pleasantries. Fragments OK.
     Code/commits/security: write normal."
```

### 4.2 UserPromptSubmit — `pordee-mode-tracker.js`

```
read user prompt from stdin (JSON: { prompt, ... })
parse triggers (table below)
if trigger found: update state.json
if state.enabled === true: emit reminder w/ current level
exit 0
```

### 4.3 Trigger parsing table

| Pattern (case-insensitive) | Action |
|---|---|
| `/pordee` (alone) | enabled=true, level unchanged (default full if first) |
| `/pordee lite` | enabled=true, level=lite |
| `/pordee full` | enabled=true, level=full |
| `/pordee stop` | enabled=false |
| `พอดี` (alone) | enabled=true |
| `พอดีโหมด` | enabled=true |
| `พูดสั้นๆ` | enabled=true |
| `หยุดพอดี` | enabled=false |
| `พูดปกติ` | enabled=false |

Trigger detection: regex on prompt body. Skip detection inside code blocks (` ``` `) to avoid false positives.

### 4.4 Failure mode

Hook errors → catch, log to `~/.pordee/error.log`, exit code 0. Never block the prompt. Hooks are non-essential — if they fail, user gets normal verbose response, not an error.

### 4.5 Timeout

5 seconds per hook (matches caveman). Hooks only do fs read/write — should complete in <50ms.

### 4.6 plugin.json hooks block

```json
{
  "name": "pordee",
  "description": "โหมดสื่อสารแบบกระชับสำหรับภาษาไทย+อังกฤษ ลด token ~60-75% โดยพูดไทยสั้น ๆ แต่ยังถูกต้องทาง technical (Pordee — terse Thai+English mode that cuts ~60-75% tokens while keeping full technical accuracy.)",
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pordee-activate.js\"",
        "timeout": 5,
        "statusMessage": "Loading pordee mode..."
      }]
    }],
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pordee-mode-tracker.js\"",
        "timeout": 5
      }]
    }]
  }
}
```

### 4.7 marketplace.json

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "pordee",
  "description": "Terse Thai+English communication mode for Claude Code. ~60-75% fewer output tokens.",
  "owner": { "name": "Vatunyoo Suwannapisit" },
  "plugins": [{
    "name": "pordee",
    "description": "พอดี — พูดไทยสั้นๆ ตัด token ลง 60-75% โดยไม่เสีย technical accuracy",
    "source": "./",
    "category": "productivity"
  }]
}
```

---

## 5. Testing

Use Node's built-in test runner (`node --test`) — no Jest, no extra deps.

### 5.1 `tests/test_state.js`

- read state.json when file missing → returns defaults
- read state.json when JSON malformed → returns defaults + writes error log
- write state.json when `~/.pordee/` missing → creates dir
- atomic write: write fails mid-flight → original state.json untouched

### 5.2 `tests/test_hooks.js`

- `pordee-activate.js` with enabled=true → stdout contains "PORDEE MODE ACTIVE"
- `pordee-activate.js` with enabled=false → stdout empty
- `pordee-mode-tracker.js` with trigger in prompt → state updated
- both hooks exit 0 on internal error

### 5.3 `tests/test_triggers.js`

Table-driven test. Each row: `{ input, expectedEnabled, expectedLevel }`. Cover all 9 trigger patterns from §4.3 plus negative cases (no trigger → state unchanged, trigger inside code fence → ignored).

### 5.4 `tests/test_cross_platform.js`

Mock `os.homedir()` to return `C:\Users\test` style path. Verify `STATE_PATH` resolves to `C:\Users\test\.pordee\state.json` and writes don't break on backslash separators.

---

## 6. README structure (Thai-only)

**Attribution requirement:** README MUST open with a Thai-language credit to caveman, including a hyperlink to https://github.com/JuliusBrussee/caveman. Place this immediately after the title/tagline, before "Pordee คืออะไร".

Suggested phrasing:
> ได้แรงบันดาลใจมาจาก [caveman](https://github.com/JuliusBrussee/caveman) — pordee เป็นรุ่นภาษาไทยที่ตัด token ทิ้งโดยไม่เสียความถูกต้อง

```
# pordee 🪨 (พอดี)

> ทำไมใช้คำเยอะ ตอบสั้นๆ ก็เข้าใจ

ได้แรงบันดาลใจมาจาก [caveman](https://github.com/JuliusBrussee/caveman) —
pordee เป็นรุ่นภาษาไทยที่ตัด token ทิ้งโดยไม่เสียความถูกต้อง

## Pordee คืออะไร
[Thai paragraph]

## ติดตั้ง
### ผ่าน Claude Code plugin (แนะนำ)
claude plugin marketplace add <user>/pordee
claude plugin install pordee@pordee

### Manual
[fallback steps]

## วิธีใช้
- /pordee — เปิด default level (full)
- /pordee lite — โหมดเบา
- /pordee full — โหมดเต็ม
- หยุดพอดี / พูดปกติ — ปิด

## ระดับ (Levels)
[Lite vs Full table]

## ก่อน / หลัง (Before / After)
[6 examples — 3 dev, 3 daily life from §3.5]

## กลไกการทำงาน
[Hook flow summary]

## License — MIT
```

---

## 7. Acceptance criteria

- [ ] `claude plugin install pordee@pordee` wires hooks correctly on macOS, Linux, Windows
- [ ] All 9 trigger phrases switch state correctly (verified by `tests/test_triggers.js`)
- [ ] State persists across sessions (file-backed, atomic writes)
- [ ] Hooks fail silent — never block prompts (verified by `tests/test_hooks.js`)
- [ ] All 4 test files pass on `node --test`
- [ ] README renders Thai cleanly, includes plugin install instructions, includes 6 before/after examples
- [ ] Manual smoke test: invoke `/pordee` → response shrinks; invoke `หยุดพอดี` → back to normal Thai

## 8. Out of scope (deferred)

- Stats / token tracking — `/pordee-stats`
- Sub-skills: `/pordee-commit`, `/pordee-review`, `/pordee-help`, `/pordee-compress`
- MCP shrink middleware
- Multi-agent installer (Cursor / Windsurf / Codex / Gemini / 30+ others)
- Statusline savings badge
- Wenyan / classical mode (rejected per requirement, never)
- Standalone hooks installer (`hooks/install.sh` / `hooks/install.ps1`) for users who want hooks without the plugin

## 9. Risks

| Risk | Mitigation |
|---|---|
| Thai compression rules feel off to native speakers | Examples in §3.5 are sanity-checked. Add eval harness in v2 with Thai dev panel review. |
| Hook injection drift after long sessions | UserPromptSubmit re-injects every turn — same pattern caveman uses successfully |
| Trigger phrases collide with normal Thai | All triggers use distinctive markers (`/`, "พอดีโหมด", "หยุดพอดี" — not common conversational phrases). Code-fence skip prevents false positives in code samples. |
| State file corrupted by concurrent writes | Atomic write via `rename`, single-writer model (only mode-tracker writes) |

## 10. References

- caveman repo: `/Users/kerlos/projects/caveman` — pattern source
- Caveman README: token compression evidence
- Claude Code plugin docs: `${CLAUDE_PLUGIN_ROOT}` resolution, hooks block schema
