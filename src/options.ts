import path from "node:path";

export type MissingEnvPolicy = "error" | "warn" | "empty";
export type ContextRoot = "worktree" | "directory";

export interface LocalContextOptions {
  /** Base used to resolve a relative contextDir. Defaults to the Git worktree. */
  root?: ContextRoot;
  /** Directory containing local context files. Defaults to .opencode. */
  contextDir?: string;
  /** General context filename inside contextDir. Defaults to context.local.md. */
  generalFile?: string;
  /** Per-agent filename pattern. Must contain {agent}. */
  agentFilePattern?: string;
  /** Handling for referenced environment variables that are not set. */
  missingEnv?: MissingEnvPolicy;
  /** Whether {env:NAME} interpolation is enabled. Defaults to true. */
  interpolate?: boolean;
}

export interface ResolvedLocalContextOptions {
  root: ContextRoot;
  contextDir: string;
  generalFile: string;
  agentFilePattern: string;
  missingEnv: MissingEnvPolicy;
  interpolate: boolean;
}

const DEFAULTS: ResolvedLocalContextOptions = {
  root: "worktree",
  contextDir: ".opencode",
  generalFile: "context.local.md",
  agentFilePattern: "context.{agent}.local.md",
  missingEnv: "error",
  interpolate: true,
};

const OPTION_NAMES = new Set<keyof LocalContextOptions>([
  "root",
  "contextDir",
  "generalFile",
  "agentFilePattern",
  "missingEnv",
  "interpolate",
]);

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`opencode-local-context: ${name} must be a non-empty string`);
  }
  return value;
}

function requireFilename(value: unknown, name: string): string {
  const filename = requireNonEmptyString(value, name);
  if (path.basename(filename) !== filename || filename === "." || filename === "..") {
    throw new TypeError(`opencode-local-context: ${name} must be a filename, not a path`);
  }
  return filename;
}

export function resolveOptions(options: unknown = {}): ResolvedLocalContextOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("opencode-local-context: plugin options must be an object");
  }

  const input = options as Record<string, unknown>;
  for (const name of Object.keys(input)) {
    if (!OPTION_NAMES.has(name as keyof LocalContextOptions)) {
      throw new TypeError(`opencode-local-context: unknown option "${name}"`);
    }
  }

  const root = input.root ?? DEFAULTS.root;
  if (root !== "worktree" && root !== "directory") {
    throw new TypeError('opencode-local-context: root must be "worktree" or "directory"');
  }

  const missingEnv = input.missingEnv ?? DEFAULTS.missingEnv;
  if (missingEnv !== "error" && missingEnv !== "warn" && missingEnv !== "empty") {
    throw new TypeError('opencode-local-context: missingEnv must be "error", "warn", or "empty"');
  }

  const contextDir = requireNonEmptyString(input.contextDir ?? DEFAULTS.contextDir, "contextDir");
  const generalFile = requireFilename(input.generalFile ?? DEFAULTS.generalFile, "generalFile");
  const agentFilePattern = requireFilename(
    input.agentFilePattern ?? DEFAULTS.agentFilePattern,
    "agentFilePattern",
  );
  if (agentFilePattern.split("{agent}").length !== 2) {
    throw new TypeError(
      "opencode-local-context: agentFilePattern must contain {agent} exactly once",
    );
  }

  const interpolate = input.interpolate ?? DEFAULTS.interpolate;
  if (typeof interpolate !== "boolean") {
    throw new TypeError("opencode-local-context: interpolate must be a boolean");
  }

  return { root, contextDir, generalFile, agentFilePattern, missingEnv, interpolate };
}

export function resolveContextDirectory(
  options: ResolvedLocalContextOptions,
  locations: { worktree: string; directory: string },
): string {
  const base = options.root === "worktree" ? locations.worktree : locations.directory;
  return path.resolve(base, options.contextDir);
}
