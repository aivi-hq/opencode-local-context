import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

export interface ContextFiles {
  general: string | undefined;
  agents: ReadonlyMap<string, string>;
  sources: {
    general: string;
    agents: ReadonlyMap<string, string>;
  };
}

async function readMarkdown(filename: string): Promise<string | undefined> {
  try {
    const contents = await readFile(filename, "utf8");
    return contents.trim() || undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw new Error(`opencode-local-context: failed to read ${filename}`, { cause: error });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function loadContextFiles(
  contextDirectory: string,
  generalFile: string,
  agentFilePattern: string,
): Promise<ContextFiles> {
  const generalSource = path.join(contextDirectory, generalFile);
  const [prefix, suffix] = agentFilePattern.split("{agent}") as [string, string];
  const agents = new Map<string, string>();
  const agentSources = new Map<string, string>();

  let entries: Dirent[];
  try {
    entries = await readdir(contextDirectory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        general: undefined,
        agents,
        sources: { general: generalSource, agents: agentSources },
      };
    }
    throw new Error(`opencode-local-context: failed to scan ${contextDirectory}`, { cause: error });
  }

  const general = await readMarkdown(generalSource);

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile() || !entry.name.startsWith(prefix) || !entry.name.endsWith(suffix)) return;
      const end = suffix.length === 0 ? undefined : -suffix.length;
      const agentName = entry.name.slice(prefix.length, end);
      if (!agentName) return;
      const source = path.join(contextDirectory, entry.name);
      const context = await readMarkdown(source);
      if (context === undefined) return;
      agents.set(agentName, context);
      agentSources.set(agentName, source);
    }),
  );

  return { general, agents, sources: { general: generalSource, agents: agentSources } };
}
