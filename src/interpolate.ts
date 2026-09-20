import type { MissingEnvPolicy } from "./options.ts";

const ENV_PLACEHOLDER = /\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

export interface InterpolateEnvOptions {
	policy?: MissingEnvPolicy;
	env?: Readonly<Record<string, string | undefined>>;
	source?: string;
	onMissing?: (name: string, source: string) => void;
}

export function interpolateEnv(
	text: string,
	options: InterpolateEnvOptions = {},
): string {
	const policy = options.policy ?? "error";
	const env = options.env ?? process.env;
	const source = options.source ?? "prompt";

	return text.replace(ENV_PLACEHOLDER, (placeholder, name: string) => {
		const value = env[name];
		if (value !== undefined) return value;

		if (policy === "error") {
			throw new Error(
				`opencode-local-context: environment variable ${name} referenced by ${placeholder} is not set (${source})`,
			);
		}
		if (policy === "warn") options.onMissing?.(name, source);
		return "";
	});
}
