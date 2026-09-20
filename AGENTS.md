# AGENTS.md

`opencode-local-context` is an OpenCode 2 plugin: it injects developer-local
Markdown context (`.opencode/context.local.md` plus per-agent files) into
assembled system prompts and resolves `{env:NAME}` placeholders. See
`README.md` for the behavior and the install.

## The nature of this repo

- **ESM only**, Node ≥ 26, no CommonJS anywhere.
- **Type-stripped TypeScript**: `src/*.ts` and `test/*.ts` are executed
  directly by node — there is no build step and no emitted JavaScript. Only
  erasable syntax is allowed (no enums, no parameter properties); type-only
  imports must use `import type` (`verbatimModuleSyntax` +
  `erasableSyntaxOnly` in `tsconfig.json` enforce both).
- The published entry is the raw source (`exports` → `./src/index.ts`), so
  the type-strip constraints hold forever, not just in development.
- **OpenCode 2 plugin API only** (`@opencode/plugin`, `Plugin.define` with
  `setup(ctx)`). The OpenCode 1 plugin API is not supported; do not
  reintroduce it.
- Tests are `node:test` (`npm test`): the option, file-discovery, and
  interpolation logic is tested as pure functions, and the plugin's `setup`
  is called directly with the fake OpenCode context in `test/support.ts`. Do
  not add a test framework or mock OpenCode beyond that fake.
- Formatting and lint are Biome with stock defaults (`biome.json`) — tabs,
  double quotes. Let `biome check --write` decide; do not rehand-format.

## Definition of done

Every time you think you are done — before committing, before reporting
success — run:

```sh
npm run agentic:verify
```

It runs Biome (with fixes), the strict typecheck, and the full test suite. If
it fails, fix the cause and run it again; never declare done on a red verify.
`npm run check` is the same gate without the autofixes — that is what CI
runs.
