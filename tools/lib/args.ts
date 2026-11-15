/** What a tool was run with, after `node` and the script name. */
export const args = process.argv.slice(2);

/** The value after `--name`, or `fallback` when the flag is missing or is the last word. */
export function flag(name: string, fallback = ''): string {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
}

/** Every value after each `--name`, for a flag that may be given more than once. */
export function flags(name: string): string[] {
  return args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1] ?? ''] : []));
}
