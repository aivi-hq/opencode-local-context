// Plugin entry. The behaviour lives in context.ts, interpolate.ts and
// options.ts; this file only wires the loaded context into OpenCode 2: an
// agent transform for per-agent prompts and session request hooks for every
// assembled system prompt.

import { Plugin } from "@opencode/plugin";
import { loadContextFiles } from "./context.ts";
import { interpolateEnv } from "./interpolate.ts";
import { resolveContextDirectory, resolveOptions } from "./options.ts";

interface TextPart {
	type: "text";
	text: string;
}

interface SystemRequest {
	system: TextPart[];
}

// The system transform must see every request kind OpenCode issues — the
// agent loop, compaction summaries, transient generate calls and title
// generation — so one callback is registered per kind.
const REQUEST_KINDS = ["context", "compaction", "generate", "title"] as const;

function appendContext(system: string | undefined, context: string): string {
	if (!system) return context;
	if (system === context || system.endsWith(`\n\n${context}`)) return system;
	return `${system}\n\n${context}`;
}

export const LocalContextPlugin = Plugin.define({
	id: "opencode-local-context",
	async setup(ctx) {
		const options = resolveOptions(ctx.options);
		const contextDirectory = resolveContextDirectory(options, {
			worktree: ctx.location.project.canonical,
			directory: ctx.location.directory,
		});
		const files = await loadContextFiles(
			contextDirectory,
			options.generalFile,
			options.agentFilePattern,
		);
		const warned = new Set<string>();

		// OpenCode 2 gives plugins no logging API; console output is
		// captured into the OpenCode logs, and each variable warns at most
		// once for the plugin lifetime.
		const warnOnce = (name: string, source: string): void => {
			if (warned.has(name)) return;
			warned.add(name);
			console.warn(
				`opencode-local-context: environment variable ${name} is not set; substituting an empty string (${source})`,
			);
		};

		const interpolate = (text: string, source: string): string => {
			if (!options.interpolate) return text;
			return interpolateEnv(text, {
				policy: options.missingEnv,
				source,
				onMissing: warnOnce,
			});
		};

		const generalContext =
			files.general === undefined
				? undefined
				: interpolate(files.general, files.sources.general);
		const agentContexts = new Map(
			[...files.agents].map(([agentName, context]) => [
				agentName,
				interpolate(context, files.sources.agents.get(agentName) as string),
			]),
		);

		// The deliberate V1 limitation carries over: context is appended
		// only to agents that already define an explicit prompt, never to
		// built-in or promptless ones, and interpolation touches only the
		// values that are set.
		await ctx.agent.transform((editor) => {
			for (const agent of editor.list()) {
				const id = String(agent.id);
				const localContext = agentContexts.get(id);
				editor.update(id, (draft) => {
					if (draft.system !== undefined) {
						draft.system = interpolate(draft.system, `agent "${id}" prompt`);
					}
					if (draft.description !== undefined) {
						draft.description = interpolate(
							draft.description,
							`agent "${id}" description`,
						);
					}
					if (localContext === undefined || draft.system === undefined) return;
					draft.system = appendContext(draft.system, localContext);
				});
			}
		});

		const transformSystem = (event: SystemRequest): void => {
			for (const [index, part] of event.system.entries()) {
				part.text = interpolate(
					part.text,
					`assembled system prompt ${index + 1}`,
				);
			}
			if (generalContext === undefined) return;
			if (!event.system.some((part) => part.text === generalContext)) {
				event.system.push({ type: "text", text: generalContext });
			}
		};

		for (const kind of REQUEST_KINDS) {
			await ctx.session.hook(kind, transformSystem);
		}
	},
});

export default LocalContextPlugin;
