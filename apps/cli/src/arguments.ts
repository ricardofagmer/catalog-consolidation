import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import {
  isReviewStatus,
  REVIEW_PAGE_DEFAULT_LIMIT,
  REVIEW_PAGE_MAX_LIMIT,
  REVIEW_STATUSES,
  type ResolveCommand,
  type ReviewStatus,
} from "@catalog/domain";

export type ParsedCommand =
  | { readonly kind: "help"; readonly text: string }
  | { readonly kind: "usage-error"; readonly usage: string; readonly message: string }
  | { readonly kind: "migrate"; readonly db: string }
  | {
      readonly kind: "consolidate";
      readonly db: string;
      readonly input: string;
      readonly report: string | null;
      readonly dryRun: boolean;
    }
  | {
      readonly kind: "review-list";
      readonly db: string;
      readonly status: ReviewStatus;
      readonly limit: number;
      readonly afterId: number;
    }
  | { readonly kind: "review-resolve"; readonly db: string; readonly command: ResolveCommand };

// Q6: help and usage name the installed bin, not the Python module invocation.
const PROGRAM_NAME = "catalog-consolidation";
const PROGRAM_DESCRIPTION = "Consolidate seller product files into the marketplace catalog.";
const HELP_FLAGS: ReadonlySet<string> = new Set(["-h", "--help"]);
// argparse expands a bundle of short flags, so `-hh` (any run of h) is help at every level.
const BUNDLED_HELP_PATTERN = /^-h+$/u;
const HELP_ROW: HelpRow = { indent: 2, label: "-h, --help", help: "show this help message and exit" };
// argparse moves a help string to its own line once the label column would pass this position.
const MAX_HELP_POSITION = 24;
const DEFAULT_REVIEW_STATUS: ReviewStatus = "PENDING";
const DEFAULT_AFTER_ID = 0;
const MIN_REVIEW_ID = 1;
const MIN_PRODUCT_ID = 1;
const MIN_PAGE_LIMIT = 1;
// Python int() minus underscores and non-ASCII digits: `\d` stays ASCII-only even under the u flag.
const INTEGER_PATTERN = /^\s*[+-]?[0-9]+\s*$/u;
// argparse reads a token shaped like a negative number as an option value, never as an option.
const NEGATIVE_NUMBER_PATTERN = /^-\d+$|^-\d*\.\d+$/u;
const DECISION_FLAGS = ["create", "reject", "link"] as const;

type OptionValues = Readonly<Record<string, unknown>>;

interface HelpRow {
  readonly indent: number;
  readonly label: string;
  readonly help: string;
}

interface OptionSpec {
  readonly name: string;
  readonly kind: "string" | "boolean";
  readonly metavar: string | null;
  readonly required: boolean;
  readonly help: string;
}

interface LeafInput {
  readonly values: OptionValues;
  // Option names in command-line order; argparse names the later flag in a mutual-exclusion error.
  readonly order: readonly string[];
}

interface CommandNode {
  readonly name: string;
  readonly help: string;
  readonly parse: (args: readonly string[]) => ParsedCommand;
}

interface LeafSpec {
  readonly path: string;
  readonly usageTail: string;
  readonly options: readonly OptionSpec[];
  readonly build: (input: LeafInput) => ParsedCommand;
}

interface GroupSpec {
  readonly path: string;
  readonly description: string | null;
  readonly metavar: string;
  readonly children: readonly CommandNode[];
}

// Internal control flow only: every instance becomes a `usage-error` result before leaving this module.
class UsageError extends Error {}

const DB_OPTION: OptionSpec = {
  name: "db",
  kind: "string",
  metavar: "PATH",
  required: true,
  help: "path to the SQLite catalog",
};

const MIGRATE: LeafSpec = {
  path: "migrate",
  usageTail: "[-h] --db PATH",
  options: [DB_OPTION],
  build: ({ values }) => ({ kind: "migrate", db: requireString(values, "db") }),
};

const CONSOLIDATE: LeafSpec = {
  path: "consolidate",
  usageTail: "[-h] --db PATH --input PATH [--report PATH] [--dry-run]",
  options: [
    DB_OPTION,
    { name: "input", kind: "string", metavar: "PATH", required: true, help: "seller JSON file (array of entries)" },
    {
      name: "report",
      kind: "string",
      metavar: "PATH",
      required: false,
      help: "write one JSON line per entry to this path",
    },
    {
      name: "dry-run",
      kind: "boolean",
      metavar: null,
      required: false,
      help: "run every decision, then roll back instead of committing",
    },
  ],
  build: ({ values }) => ({
    kind: "consolidate",
    db: requireString(values, "db"),
    input: requireString(values, "input"),
    report: optionalString(values, "report") ?? null,
    dryRun: values["dry-run"] === true,
  }),
};

const STATUS_METAVAR = REVIEW_STATUSES.join("|");

const REVIEW_LIST: LeafSpec = {
  path: "review list",
  usageTail: `[-h] --db PATH [--status ${STATUS_METAVAR}] [--limit N] [--after-id ID]`,
  options: [
    DB_OPTION,
    {
      name: "status",
      kind: "string",
      metavar: STATUS_METAVAR,
      required: false,
      help: `queue status to list (default ${DEFAULT_REVIEW_STATUS})`,
    },
    {
      name: "limit",
      kind: "string",
      metavar: "N",
      required: false,
      help: `rows per page, 1..${String(REVIEW_PAGE_MAX_LIMIT)} (default ${String(REVIEW_PAGE_DEFAULT_LIMIT)})`,
    },
    {
      name: "after-id",
      kind: "string",
      metavar: "ID",
      required: false,
      help: "return rows with an Id greater than this (from the previous page's next: line)",
    },
  ],
  build: ({ values }) => ({
    kind: "review-list",
    db: requireString(values, "db"),
    status: parseStatus(optionalString(values, "status")),
    limit: parsePageLimit(optionalString(values, "limit")),
    afterId: parseAfterId(optionalString(values, "after-id")),
  }),
};

const REVIEW_RESOLVE: LeafSpec = {
  path: "review resolve",
  usageTail: "[-h] --db PATH --id N (--create | --reject | --link PRODUCT_ID)",
  options: [
    DB_OPTION,
    { name: "id", kind: "string", metavar: "N", required: true, help: "review row Id" },
    {
      name: "create",
      kind: "boolean",
      metavar: null,
      required: false,
      help: "create a new catalog product from the seller's values and link it",
    },
    {
      name: "reject",
      kind: "boolean",
      metavar: null,
      required: false,
      help: "reject the row; later re-sends stay held for review",
    },
    {
      name: "link",
      kind: "string",
      metavar: "PRODUCT_ID",
      required: false,
      help: "link the seller SKU to this existing catalog product",
    },
  ],
  build: ({ values, order }) => ({
    kind: "review-resolve",
    db: requireString(values, "db"),
    command: buildResolveCommand(values, order),
  }),
};

const REVIEW: GroupSpec = {
  path: "review",
  description: null,
  metavar: "ACTION",
  children: [
    { name: "list", help: "list review queue rows, oldest first", parse: (args) => parseLeaf(REVIEW_LIST, args) },
    { name: "resolve", help: "resolve one PENDING review row", parse: (args) => parseLeaf(REVIEW_RESOLVE, args) },
  ],
};

const ROOT: GroupSpec = {
  path: "",
  description: PROGRAM_DESCRIPTION,
  metavar: "COMMAND",
  children: [
    { name: "migrate", help: "apply pending schema migrations", parse: (args) => parseLeaf(MIGRATE, args) },
    { name: "consolidate", help: "consolidate a seller product file", parse: (args) => parseLeaf(CONSOLIDATE, args) },
    { name: "review", help: "list or resolve held review queue rows", parse: (args) => parseGroup(REVIEW, args) },
  ],
};

export function parseCommandLine(argv: readonly string[]): ParsedCommand {
  return parseGroup(ROOT, argv);
}

function parseGroup(group: GroupSpec, args: readonly string[]): ParsedCommand {
  const usage = usageLine(group.path, `[-h] ${group.metavar} ...`);
  const commandIndex = args.findIndex((arg) => !arg.startsWith("-"));
  const leadingOptions = commandIndex === -1 ? args : args.slice(0, commandIndex);
  if (leadingOptions.some(isHelpFlag)) {
    return { kind: "help", text: groupHelp(group, usage) };
  }
  if (leadingOptions.length > 0) {
    return usageError(usage, `unrecognized arguments: ${leadingOptions.join(" ")}`);
  }
  const name = args[commandIndex];
  if (name === undefined) {
    return usageError(usage, `the following arguments are required: ${group.metavar}`);
  }
  const child = group.children.find((candidate) => candidate.name === name);
  if (child === undefined) {
    const choices = group.children.map((candidate) => candidate.name).join(", ");
    return usageError(usage, `argument ${group.metavar}: invalid choice: '${name}' (choose from ${choices})`);
  }
  return child.parse(args.slice(commandIndex + 1));
}

function parseLeaf(spec: LeafSpec, args: readonly string[]): ParsedCommand {
  const usage = usageLine(spec.path, spec.usageTail);
  if (requestsHelp(spec.options, args)) {
    return { kind: "help", text: leafHelp(spec, usage) };
  }
  try {
    const { values, tokens } = parseArgs({
      args: joinNegativeNumberValues(spec.options, args),
      options: toParseArgsOptions(spec.options),
      strict: true,
      allowPositionals: false,
      tokens: true,
    });
    // Mixed short-flag bundles that set help slip past the pre-scan but still set it here;
    // argparse answers them with help too, so the command must not run.
    if (values["help"] === true) {
      return { kind: "help", text: leafHelp(spec, usage) };
    }
    const order = tokens.flatMap((token) => (token.kind === "option" ? [token.name] : []));
    requirePresent(spec.options, values);
    return spec.build({ values, order });
  } catch (error) {
    if (error instanceof UsageError) {
      return usageError(usage, error.message);
    }
    if (isParseArgsError(error)) {
      // Node appends multi-line hints about positionals; this CLI takes none, so keep the first line.
      return usageError(usage, error.message.split("\n")[0] ?? error.message);
    }
    throw error;
  }
}

function usageError(usage: string, message: string): ParsedCommand {
  return { kind: "usage-error", usage, message };
}

function isParseArgsError(error: unknown): error is Error & { readonly code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("ERR_PARSE_ARGS_")
  );
}

function isHelpFlag(arg: string): boolean {
  return HELP_FLAGS.has(arg) || BUNDLED_HELP_PATTERN.test(arg);
}

// argparse lets -h win over unknown or missing flags, so help is resolved before strict parsing.
function requestsHelp(options: readonly OptionSpec[], args: readonly string[]): boolean {
  const valued = valuedOptionFlags(options);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined || arg === "--") {
      return false;
    }
    if (isHelpFlag(arg)) {
      return true;
    }
    if (valued.has(arg) && isOptionValue(args[index + 1])) {
      index += 1;
    }
  }
  return false;
}

// parseArgs rejects `--limit -5` as ambiguous where argparse reads -5 as the value; joining keeps
// argparse's behavior (exit 2 on the range check, and `--after-id -0` still meaning 0).
function joinNegativeNumberValues(options: readonly OptionSpec[], args: readonly string[]): string[] {
  const valued = valuedOptionFlags(options);
  const joined: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      break;
    }
    const next = args[index + 1];
    if (valued.has(arg) && next !== undefined && NEGATIVE_NUMBER_PATTERN.test(next)) {
      joined.push(`${arg}=${next}`);
      index += 1;
    } else {
      joined.push(arg);
    }
  }
  return joined;
}

function valuedOptionFlags(options: readonly OptionSpec[]): ReadonlySet<string> {
  return new Set(options.filter((option) => option.kind === "string").map((option) => `--${option.name}`));
}

function isOptionValue(arg: string | undefined): boolean {
  return arg !== undefined && (!arg.startsWith("-") || NEGATIVE_NUMBER_PATTERN.test(arg));
}

function toParseArgsOptions(options: readonly OptionSpec[]): ParseArgsOptionsConfig {
  const config: ParseArgsOptionsConfig = { help: { type: "boolean", short: "h" } };
  for (const option of options) {
    config[option.name] = { type: option.kind };
  }
  return config;
}

function requirePresent(options: readonly OptionSpec[], values: OptionValues): void {
  const missing = options
    .filter((option) => option.required && optionalString(values, option.name) === undefined)
    .map((option) => `--${option.name}`);
  if (missing.length > 0) {
    throw new UsageError(`the following arguments are required: ${missing.join(", ")}`);
  }
}

function optionalString(values: OptionValues, name: string): string | undefined {
  const value = values[name];
  return typeof value === "string" ? value : undefined;
}

function requireString(values: OptionValues, name: string): string {
  const value = optionalString(values, name);
  if (value === undefined) {
    throw new UsageError(`the following arguments are required: --${name}`);
  }
  return value;
}

function parseStatus(text: string | undefined): ReviewStatus {
  if (text === undefined) {
    return DEFAULT_REVIEW_STATUS;
  }
  if (!isReviewStatus(text)) {
    throw new UsageError(`argument --status: invalid choice: '${text}' (choose from ${REVIEW_STATUSES.join(", ")})`);
  }
  return text;
}

function parsePageLimit(text: string | undefined): number {
  if (text === undefined) {
    return REVIEW_PAGE_DEFAULT_LIMIT;
  }
  const value = parseInteger("--limit", text);
  if (value < MIN_PAGE_LIMIT || value > REVIEW_PAGE_MAX_LIMIT) {
    throw new UsageError(
      `argument --limit: must be between ${String(MIN_PAGE_LIMIT)} and ${String(REVIEW_PAGE_MAX_LIMIT)}`,
    );
  }
  return value;
}

function parseAfterId(text: string | undefined): number {
  return text === undefined ? DEFAULT_AFTER_ID : parseAtLeast("--after-id", text, DEFAULT_AFTER_ID);
}

function buildResolveCommand(values: OptionValues, order: readonly string[]): ResolveCommand {
  const reviewId = parseAtLeast("--id", requireString(values, "id"), MIN_REVIEW_ID);
  const decisions = [...new Set(order.filter((name) => DECISION_FLAGS.some((flag) => flag === name)))];
  const [first, second] = decisions;
  if (first === undefined) {
    throw new UsageError(`one of the arguments ${DECISION_FLAGS.map((flag) => `--${flag}`).join(" ")} is required`);
  }
  if (second !== undefined) {
    throw new UsageError(`argument --${second}: not allowed with argument --${first}`);
  }
  if (first === "link") {
    return { kind: "link", reviewId, productId: parseAtLeast("--link", requireString(values, "link"), MIN_PRODUCT_ID) };
  }
  return first === "create" ? { kind: "create", reviewId } : { kind: "reject", reviewId };
}

function parseAtLeast(flag: string, text: string, minimum: number): number {
  const value = parseInteger(flag, text);
  if (value < minimum) {
    throw new UsageError(`argument ${flag}: must be >= ${String(minimum)}, got ${String(value)}`);
  }
  return value;
}

function parseInteger(flag: string, text: string): number {
  if (!INTEGER_PATTERN.test(text)) {
    throw new UsageError(`argument ${flag}: not an integer: '${text}'`);
  }
  const value = Number.parseInt(text.trim(), 10);
  // Ids are bound to SQLite as JS numbers; beyond 2^53 they would silently round to another id.
  if (!Number.isSafeInteger(value)) {
    throw new UsageError(`argument ${flag}: out of range: '${text}'`);
  }
  // `-0` is a valid Python int (0); normalize so callers never see negative zero.
  return value === 0 ? 0 : value;
}

function usageLine(path: string, tail: string): string {
  const prefix = path === "" ? PROGRAM_NAME : `${PROGRAM_NAME} ${path}`;
  return `usage: ${prefix} ${tail}`;
}

function groupHelp(group: GroupSpec, usage: string): string {
  const choiceRows = group.children.map((child) => ({ indent: 4, label: child.name, help: child.help }));
  const metavarRow: HelpRow = { indent: 2, label: group.metavar, help: "" };
  const helpPosition = helpColumn([metavarRow, ...choiceRows, HELP_ROW]);
  const sections = [
    usage,
    ...(group.description === null ? [] : [group.description]),
    ["positional arguments:", ...[metavarRow, ...choiceRows].map((row) => formatRow(row, helpPosition))].join("\n"),
    ["options:", formatRow(HELP_ROW, helpPosition)].join("\n"),
  ];
  return sections.join("\n\n");
}

function leafHelp(spec: LeafSpec, usage: string): string {
  const rows = [
    HELP_ROW,
    ...spec.options.map((option) => ({
      indent: 2,
      label: option.metavar === null ? `--${option.name}` : `--${option.name} ${option.metavar}`,
      help: option.help,
    })),
  ];
  const helpPosition = helpColumn(rows);
  return [usage, ["options:", ...rows.map((row) => formatRow(row, helpPosition))].join("\n")].join("\n\n");
}

function helpColumn(rows: readonly HelpRow[]): number {
  const widest = Math.max(...rows.map((row) => row.indent + row.label.length));
  return Math.min(widest + 2, MAX_HELP_POSITION);
}

function formatRow(row: HelpRow, helpPosition: number): string {
  const label = " ".repeat(row.indent) + row.label;
  if (row.help === "") {
    return label;
  }
  if (label.length + 2 <= helpPosition) {
    return label.padEnd(helpPosition) + row.help;
  }
  return `${label}\n${" ".repeat(helpPosition)}${row.help}`;
}
