export function readFlag(args: readonly string[], name: string): string | null {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline !== undefined) {
    const value = inline.slice(name.length + 1);
    if (value.length === 0) {
      throw new Error(`${name} requires a value`);
    }
    return value;
  }
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

export function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

export function requireFlag(args: readonly string[], name: string): string {
  const value = readFlag(args, name);
  if (value === null) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
