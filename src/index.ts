import type { Config, Plugin, PluginModule } from "@opencode-ai/plugin";
import { loadContextFiles } from "./context.ts";
import { interpolateEnv } from "./interpolate.ts";
import { resolveContextDirectory, resolveOptions } from "./options.ts";

type AgentConfig = NonNullable<NonNullable<Config["agent"]>[string]>;

function appendContext(prompt: string | undefined, context: string): string {
  if (!prompt) return context;
  if (prompt === context || prompt.endsWith(`\n\n${context}`)) return prompt;
  return `${prompt}\n\n${context}`;
}

export const LocalContextPlugin: Plugin = async (input, rawOptions) => {
  const options = resolveOptions(rawOptions);
  const contextDirectory = resolveContextDirectory(options, input);
  const files = await loadContextFiles(
    contextDirectory,
    options.generalFile,
    options.agentFilePattern,
  );
  const warned = new Set<string>();

  const warnOnce = (name: string, source: string): void => {
    if (warned.has(name)) return;
    warned.add(name);
    void input.client.app
      .log({
        body: {
          service: "opencode-local-context",
          level: "warn",
          message: `Environment variable ${name} is not set; substituting an empty string`,
          extra: { source },
        },
      })
      .catch(() => undefined);
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
    files.general === undefined ? undefined : interpolate(files.general, files.sources.general);
  const agentContexts = new Map(
    [...files.agents].map(([agentName, context]) => [
      agentName,
      interpolate(context, files.sources.agents.get(agentName) as string),
    ]),
  );

  const configureAgents = (config: Config): void => {
    for (const [agentName, agent] of Object.entries(config.agent ?? {})) {
      if (agent === undefined) continue;
      const mutableAgent = agent as AgentConfig;
      if (mutableAgent.prompt !== undefined) {
        mutableAgent.prompt = interpolate(mutableAgent.prompt, `agent "${agentName}" prompt`);
      }
      if (mutableAgent.description !== undefined) {
        mutableAgent.description = interpolate(
          mutableAgent.description,
          `agent "${agentName}" description`,
        );
      }

      const localContext = agentContexts.get(agentName);
      if (localContext === undefined || mutableAgent.prompt === undefined) continue;
      mutableAgent.prompt = appendContext(mutableAgent.prompt, localContext);
    }
  };

  return {
    config: async (config) => {
      configureAgents(config);
    },
    "experimental.chat.system.transform": async (_hookInput, output) => {
      for (let index = 0; index < output.system.length; index += 1) {
        const system = output.system[index];
        if (system !== undefined) {
          output.system[index] = interpolate(system, `assembled system prompt ${index + 1}`);
        }
      }

      if (generalContext === undefined) return;
      if (!output.system.includes(generalContext)) output.system.push(generalContext);
    },
  };
};

export default {
  id: "opencode-local-context",
  server: LocalContextPlugin,
} satisfies PluginModule;
