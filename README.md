# opencode-local-context

Inject developer-local Markdown context into [OpenCode](https://opencode.ai/)
agents and resolve explicit OpenCode-style `{env:NAME}` placeholders in
prompts.

Requires **OpenCode 2**—the OpenCode 1 plugin API is not supported—and runs as
type-stripped TypeScript on **Node 26+**.

## TL;DR

Think of it as **`.env` for your agents**: keep developer- or machine-specific
context out of shared `AGENTS.md` and agent definitions.

Create `.opencode/context.local.md` in your project:

```markdown
# My local context

- My team is {env:TEAM_NAME}.
- My issue tracker project is {env:ISSUE_PROJECT}.
- My local service runs at http://localhost:3000.
```

Start OpenCode with those environment variables available:

```sh
TEAM_NAME="team-analytics" ISSUE_PROJECT="big-platform" opencode
```

The resolved Markdown is included in your agents' context, while the local
file can remain uncommitted. Use `context.<agent>.local.md` when context
should apply to one configured agent only.

The `.env` comparison is a mental model: this plugin does not load `.env`
files. It reads local Markdown and resolves `{env:NAME}` from OpenCode's
existing environment. Because resolved values are sent to the model, use this
only for non-secret context—never tokens, passwords, or credentials.

Use it for information that is useful to your local agent sessions but should
not live in shared instructions: your team, development environment,
issue-tracker project, preferred test device, or other developer-specific
context.

## Quickstart

```sh
# 1. Install the plugin for every project
#    (or add "opencode-local-context" to the plugins array of ./opencode.jsonc)
opencode plugin add opencode-local-context

# 2. Write your project context and keep it out of git
mkdir -p .opencode
cat > .opencode/context.local.md <<'EOF'
# Local developer context

- My team is {env:TEAM_NAME}.
- My local service runs at http://localhost:3000.
EOF
echo '.opencode/context*.local.md' >> .gitignore

# 3. Start OpenCode with the referenced variables available
TEAM_NAME="team-analytics" opencode
```

Done—every agent now sees the resolved context. Quit and restart OpenCode
after editing the file; each project supplies its own
`.opencode/context.local.md`, so one global install serves them all.

## Features

- Adds `.opencode/context.local.md` to every assembled system prompt—the
  agent loop and OpenCode's internal compaction, generate, and title requests
  alike.
- Adds `.opencode/context.<agent>.local.md` only to that agent's configured
  prompt.
- Supports Markdown and file-based agent definitions that carry their own
  prompt.
- Resolves `{env:NAME}` in assembled system prompts, general and per-agent
  local context, and configured agent prompts and descriptions.
- Reads only explicitly referenced environment variables. It never copies the
  whole environment into a prompt.
- Reads context files once at plugin startup, not on every model call.
- Its only dependency is `@opencode/plugin`.

## Install

Add the package to the `plugins` array in `opencode.json` or `opencode.jsonc`:

```json
{
	"$schema": "https://opencode.ai/config.json",
	"plugins": ["opencode-local-context"]
}
```

To pass options, use the object form:

```json
{
	"$schema": "https://opencode.ai/config.json",
	"plugins": [
		{
			"package": "opencode-local-context",
			"options": { "missingEnv": "warn" }
		}
	]
}
```

## Default files

Files are resolved from the project's canonical checkout by default, so
nested OpenCode working directories share the same predictable project-level
context:

```text
your-project/
└── .opencode/
    ├── context.local.md
    ├── context.build.local.md
    └── context.review.local.md
```

`context.local.md` is appended as a separate system-prompt block to every
request kind.

`context.<agent>.local.md` is appended to only the matching agent's explicit
prompt. For example, `context.review.local.md` applies to an agent configured
as `review` in `opencode.json` or loaded from `.opencode/agents/review.md`.

The plugin deliberately does not create or replace prompts for built-in or
promptless agents. Doing so would replace OpenCode's built-in provider or
specialized agent instructions rather than append to them. General local
context still applies to every agent.

All files are optional. An absent context directory or absent files are
silent no-ops.

### Example

`.opencode/context.local.md`:

```markdown
# Local developer context

- My team is {env:TEAM_NAME}.
- My local service URL is {env:LOCAL_SERVICE_URL}.
- Prefer examples for my time zone: {env:TIME_ZONE}.
```

`.opencode/context.review.local.md`:

```markdown
When reviewing, pay extra attention to backwards compatibility with my local
integration branch.
```

A generic team or issue-tracker context is equally valid—the plugin has no
tracker-specific logic:

```markdown
- Team: {env:TEAM_NAME}
- Issue tracker project: {env:ISSUE_PROJECT}
- Current iteration: {env:ITERATION_NAME}
```

## Environment interpolation

The supported syntax is `{env:NAME}`, where `NAME` matches a normal
environment variable name (`A-Z`, `a-z`, digits after the first character, and
`_`). For example:

```markdown
Use the local account for {env:DEVELOPER_EMAIL}.
```

Interpolation covers:

1. every text part of OpenCode's assembled system prompt, including
   `AGENTS.md`, global instructions, and custom instructions;
2. general and per-agent local context;
3. configured agent prompt and `description` values.

Only names that occur in placeholders are read from `process.env`.

### Missing variables

`missingEnv` controls references to variables that are not set:

| Value   | Behavior                                                              |
| ------- | --------------------------------------------------------------------- |
| `error` | **Default.** Throw a clear error naming the variable and prompt source. |
| `warn`  | Substitute `""` and log one warning per variable to the OpenCode logs. |
| `empty` | Silently substitute `""`.                                             |

The `warn` policy deduplicates warnings for the plugin lifetime, avoiding a
warning on every model call. Warnings go to `console.warn`, which OpenCode
captures into its logs.

Set `interpolate` to `false` to leave all `{env:NAME}` placeholders unchanged.

> [!WARNING]
> Interpolated values become part of the prompt and are sent to the configured
> model provider. **Never interpolate API tokens, passwords, private keys,
> credentials, or other secrets.** This plugin limits environment access to
> explicitly referenced variables, but it cannot make a secret safe after you
> reference it.

## Options

All options are optional and validated at startup.

| Option             | Type                                 | Default                      | Description                                                                     |
| ------------------ | ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `root`             | `"worktree" \| "directory"`          | `"worktree"`                 | Base for a relative `contextDir`: the canonical checkout or the working directory. |
| `contextDir`       | `string`                             | `".opencode"`                | Context directory. Absolute paths are accepted.                                 |
| `generalFile`      | `string`                             | `"context.local.md"`         | General context filename within `contextDir`.                                   |
| `agentFilePattern` | `string` containing `{agent}` once   | `"context.{agent}.local.md"` | Pattern used to discover per-agent files. Must be a filename, not a path.       |
| `missingEnv`       | `"error" \| "warn" \| "empty"`       | `"error"`                    | Missing environment-variable policy.                                            |
| `interpolate`      | `boolean`                            | `true`                       | Enables `{env:NAME}` interpolation.                                             |

Example with a directory relative to OpenCode's active directory:

```json
{
	"$schema": "https://opencode.ai/config.json",
	"plugins": [
		{
			"package": "opencode-local-context",
			"options": {
				"root": "directory",
				"contextDir": ".developer-context",
				"generalFile": "all.md",
				"agentFilePattern": "agent-{agent}.md",
				"missingEnv": "warn"
			}
		}
	]
}
```

## Programmatic API

The package default-exports the OpenCode 2 plugin definition; the same object
is also a named export:

```ts
import localContext, { LocalContextPlugin } from "opencode-local-context";
```

## Lifecycle

OpenCode loads configuration, agents, and plugins at startup. This plugin
snapshots local context files during plugin startup and interpolates them
immediately. Changes to context files, plugin options, or relevant environment
variables require quitting and restarting OpenCode.

Per-agent context is applied through an agent transform, so it targets only
agents that carry an explicit prompt; files for built-in or promptless agents
are ignored to avoid replacing OpenCode's own instructions. The general
context and the assembled-system interpolation are registered for every
request kind—`context`, `compaction`, `generate`, and `title`—so OpenCode's
internal model calls see them too.

## Development

The package is published as type-stripped TypeScript source and loaded
directly by OpenCode. There is no transpilation, bundling, generated
declaration output, or build step.

```sh
npm install
npm run check
```

`npm run check` verifies formatting, lint, strict TypeScript, and the test
suite (`node --test`). Agents should run `npm run agentic:verify` instead: it
applies Biome's autofixes first, then runs the same typecheck and tests.

## License

[MIT](LICENSE)
