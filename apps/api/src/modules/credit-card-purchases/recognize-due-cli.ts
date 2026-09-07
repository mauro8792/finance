export type RecognizeDueCliArgs = {
  asOf?: string;
  dryRun: boolean;
  userId?: string;
  help: boolean;
};

/**
 * Parse CLI flags for installments:recognize-due.
 * Supports: --as-of=ISO|--as-of ISO, --dry-run, --user-id=UUID, --help
 */
export function parseRecognizeDueCliArgs(
  argv: string[]
): RecognizeDueCliArgs {
  const args: RecognizeDueCliArgs = {
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token.startsWith("--as-of=")) {
      args.asOf = token.slice("--as-of=".length);
      continue;
    }
    if (token === "--as-of") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--as-of requiere un valor ISO (fecha o datetime UTC).");
      }
      args.asOf = next;
      index += 1;
      continue;
    }
    if (token.startsWith("--user-id=")) {
      args.userId = token.slice("--user-id=".length);
      continue;
    }
    if (token === "--user-id") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--user-id requiere un UUID.");
      }
      args.userId = next;
      index += 1;
      continue;
    }
    throw new Error(`Argumento desconocido: ${token}`);
  }

  return args;
}

export function parseAsOfArgument(raw: string | undefined, now: Date): Date {
  if (raw === undefined || raw.trim() === "") {
    return now;
  }
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`asOf inválido: ${raw}`);
  }
  return parsed;
}

/**
 * Monitoring/automation guardrail:
 * failed > 0 => non-zero exit; failed = 0 => success.
 * Does not undo partial commits; retry processes remaining.
 */
export function exitCodeForRecognizeDueResult(result: {
  failed: number;
}): number {
  return result.failed > 0 ? 1 : 0;
}
