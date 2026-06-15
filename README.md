# claude-smartwork

A public **Claude Code plugin marketplace**. Everything here shares one goal: make Claude Code
**more token-efficient** and improve **how it reasons about a task** — what to load into context,
how to plan, how to remember, how to think.

## Add the marketplace

```bash
/plugin marketplace add kanganapong-s/claude-smartwork-plugin
```

(Replace `kanganapong-s/claude-smartwork-plugin` with this repository's `owner/repo` if you forked it.)

## Install a plugin

```bash
/plugin install <plugin>@claude-smartwork
```

`claude-smartwork` is the marketplace id; `<plugin>` is one of the plugins below.

## Plugins

| Plugin | What it does |
|--------|--------------|
| **[cortex](./cortex)** | A human-brain-like **memory + cognition** layer, always-on via lifecycle hooks. Compresses what Claude reads, keeps output terse (EN/TH), remembers lessons & knowledge across sessions (episodic · semantic LLM-Wiki · Core Memory), and injects lightweight thinking discipline — all **cooperating with** native Claude Code, never replacing it. Offloads cheap work to a local/cloud **ollama** model so Claude tokens go to high-value reasoning. Built on **Bun + TypeScript**. |

```bash
/plugin install cortex@claude-smartwork
```

See [`cortex/README.md`](./cortex/README.md) for prerequisites, configuration, and the full brain model.

## License

**BUSL-1.1** (Business Source License) — source-available: study and reuse the *concepts* freely,
but the code may not be reused without reimplementation. Converts to **Apache-2.0** on 2030-06-15.
See [`LICENSE`](./LICENSE).
