/**
 * The text the CLI shows: the compact plan (one line per harness), the
 * detailed changes, the result lines, the manual steps and the closing words.
 * Every function returns plain lines, coloured only through the `Paint` it is
 * given, so a pipe, a test and a terminal share the same words. Pure.
 */
import type { Paint } from './ansi.ts';
import type { StepResult } from './apply.ts';
import { displayPath, type RunContext } from './paths.ts';
import type { Command, Part, Step, StepPlan, What } from './plan.ts';
import { commandLine } from './run-action.ts';
import type { Harness } from './setup-document.ts';

const PART_NAME: Readonly<Record<Part, string>> = { mcp: 'MCP server', skill: 'skill' };
const PART_SHORT: Readonly<Record<Part, string>> = { mcp: 'MCP', skill: 'skill' };

/** The three answers to "What should they get?", as the question and the summary show them. */
export const PART_CHOICE: Readonly<Record<What, string>> = { both: 'MCP server and skill', mcp: 'MCP server only', skill: 'Skill only' };

/** The example the closing words suggest. */
export const EXAMPLE_ASK = 'Find me an MCP server for Postgres.';

type Wording = {
  /** The plan's phrase for what will happen to these parts. */
  planned: (parts: string) => string;
  /** The result's phrase for what happened to these parts. */
  done: (parts: string) => string;
  /** What a harness that needs nothing says. */
  already: string;
};

const WORDING: Readonly<Record<Command, Wording>> = {
  install: { planned: (parts) => parts, done: (parts) => parts, already: 'already set up' },
  uninstall: { planned: (parts) => `remove ${parts}`, done: (parts) => `${parts} removed`, already: 'not set up' },
};

/** Step kinds that change something: write or delete a file, or run a program. */
const CHANGING_KINDS: readonly StepPlan['kind'][] = ['write', 'run', 'run-remove', 'delete'];

/** The reason a step leaves something alone (refused or kept), or null for any other step. */
function reasonOf(plan: StepPlan): string | null {
  return plan.kind === 'refused' || plan.kind === 'kept' ? plan.reason : null;
}

/** Groups items by harness, in first-seen order. */
function byHarness<Item>(items: readonly Item[], harnessOf: (item: Item) => Harness): Array<[Harness, Item[]]> {
  const groups = new Map<Harness, Item[]>();
  for (const item of items) groups.set(harnessOf(item), [...(groups.get(harnessOf(item)) ?? []), item]);
  return [...groups];
}

/** The harness name padded so the second column lines up. */
function nameColumn(names: readonly string[]): (name: string) => string {
  const width = Math.max(0, ...names.map((name) => name.length)) + 3;
  return (name) => name.padEnd(width);
}

/** The first phrase as it is, the others in parentheses: `MCP server (skill already set up)`. */
function joinPhrases(phrases: readonly string[]): string {
  const [first, ...rest] = phrases;
  if (first === undefined) return 'nothing to do';
  if (rest.length === 0) return first;
  return `${first} (${rest.join(', ')})`;
}

/** `MCP server + skill`, or `skill` alone. */
function partNames(parts: readonly Part[]): string {
  return parts.map((part) => PART_NAME[part]).join(' + ');
}

/** `already set up` when it is the whole story, else `skill already set up`. */
function sharedPhrase(opts: { parts: readonly Part[]; isAlone: boolean; phrase: string }): string {
  return opts.isAlone ? opts.phrase : `${partNames(opts.parts)} ${opts.phrase}`;
}

function planSummary(steps: readonly Step[], wording: Wording): string {
  const partsWhere = (kinds: readonly StepPlan['kind'][]): Part[] => steps.filter((step) => kinds.includes(step.plan.kind)).map((step) => step.part);
  const installs = partsWhere(CHANGING_KINDS);
  const already = partsWhere(['already']);
  const manual = partsWhere(['manual']);
  const refusals = steps.flatMap((step) => {
    const reason = reasonOf(step.plan);
    return reason === null ? [] : [`${PART_SHORT[step.part]}: ${reason}`];
  });
  const groupCount = [installs, already, manual].filter((parts) => parts.length > 0).length + refusals.length;
  const isAlone = groupCount === 1;
  const phrases = [
    ...(installs.length > 0 ? [wording.planned(partNames(installs))] : []),
    ...refusals,
    ...(already.length > 0 ? [sharedPhrase({ parts: already, isAlone, phrase: wording.already })] : []),
    ...(manual.length > 0 ? [sharedPhrase({ parts: manual, isAlone, phrase: isAlone ? 'manual steps, shown at the end' : 'by hand, steps at the end' })] : []),
  ];
  return joinPhrases(phrases);
}

/** One line per harness: `Claude Code    MCP server + skill`, or `remove MCP server + skill` for an uninstall. */
export function planLines(steps: readonly Step[], command: Command): string[] {
  const groups = byHarness(steps, (step) => step.harness);
  const pad = nameColumn(groups.map(([harness]) => harness.name));
  return groups.map(([harness, list]) => `${pad(harness.name)}${planSummary(list, WORDING[command])}`);
}

const CHANGE_TEXT = {
  create: 'create',
  add: 'add to',
  replace: 'replace the agentbuffs entry in',
  remove: 'remove the agentbuffs entry in',
} as const;

function detailOf(plan: StepPlan, ctx: RunContext, command: Command): string[] {
  switch (plan.kind) {
    case 'write': {
      const backup = plan.original === null ? '' : ', backup first';
      return [`${CHANGE_TEXT[plan.change]} ${displayPath(plan.file, ctx)}${backup}`, ...plan.preview];
    }
    case 'already':
      return [command === 'uninstall' ? `nothing to remove at ${displayPath(plan.file, ctx)}` : `already in ${displayPath(plan.file, ctx)}`];
    case 'run':
    case 'run-remove':
      return [`run ${commandLine(plan.action)}`];
    case 'delete':
      return [`delete ${displayPath(plan.file, ctx)}${plan.folder === null ? '' : ' and its folder, if the folder is empty'}`, ...(plan.note === null ? [] : [plan.note])];
    case 'kept':
      return [`will not change: ${plan.reason}`];
    case 'manual':
      return ['manual steps:', ...plan.lines.map((line) => `  ${line}`)];
    case 'refused':
      return [`will not change: ${plan.reason}`];
    case 'not-offered':
      return ['not offered for this agent'];
  }
}

/**
 * Breaks `text` at spaces into lines of at most `width` columns. Leading
 * spaces stay; later lines start with `indent` spaces. A word longer than the
 * width stays whole.
 */
export function wrapText(opts: { text: string; width: number; indent: number }): string[] {
  if (opts.text.length <= opts.width) return [opts.text];
  const lead = /^ */.exec(opts.text)?.[0] ?? '';
  const pad = ' '.repeat(opts.indent);
  const lines: string[] = [];
  let line = lead;
  for (const word of opts.text.slice(lead.length).split(' ')) {
    const isLineEmpty = line.trim() === '';
    // A word that cannot fit on a line of its own (a long URL) stays where it is, whole.
    const fitsAlone = pad.length + word.length <= opts.width;
    if (!isLineEmpty && fitsAlone && line.length + 1 + word.length > opts.width) {
      lines.push(line);
      line = pad + word;
      continue;
    }
    line = isLineEmpty ? line + word : `${line} ${word}`;
  }
  return [...lines, line];
}

/** Every change, per harness and part: paths, entries and commands, wrapped to `width`. */
export function detailLines(opts: { steps: readonly Step[]; ctx: RunContext; paint: Paint; width: number; command: Command }): string[] {
  const label = (part: Part): string => PART_SHORT[part].padEnd(7);
  const indent = label('mcp').length + 2;
  const wrap = (text: string): string[] => wrapText({ text, width: opts.width, indent: indent + 2 });
  return byHarness(opts.steps, (step) => step.harness).flatMap(([harness, list], index) => [
    ...(index === 0 ? [] : ['']),
    opts.paint.bold(harness.name),
    ...list.flatMap((step) => {
      const [first = '', ...rest] = detailOf(step.plan, opts.ctx, opts.command);
      return [...wrap(`  ${label(step.part)}${first}`), ...rest.flatMap((line) => (line === '' ? [''] : wrap(`${' '.repeat(indent)}${line}`))).map(opts.paint.dim)];
    }),
  ]);
}

type Mark = 'done' | 'same' | 'failed';

const MARK_TEXT: Readonly<Record<Mark, string>> = { done: '✓', same: '•', failed: '✗' };

function markOf(results: readonly StepResult[]): Mark {
  if (results.some((result) => result.status === 'failed')) return 'failed';
  if (results.some((result) => result.status === 'done')) return 'done';
  return 'same';
}

function paintMark(mark: Mark, paint: Paint): string {
  switch (mark) {
    case 'done':
      return paint.green(MARK_TEXT.done);
    case 'same':
      return paint.dim(MARK_TEXT.same);
    case 'failed':
      return paint.red(MARK_TEXT.failed);
  }
}

function resultSummary(results: readonly StepResult[], wording: Wording): string {
  const partsWith = (status: StepResult['status']): Part[] => results.filter((result) => result.status === status).map((result) => result.step.part);
  const explained = (status: StepResult['status']): string[] =>
    results.filter((result) => result.status === status).map((result) => `${PART_SHORT[result.step.part]}: ${result.detail}`);
  const failures = explained('failed');
  const skips = explained('skipped');
  const done = partsWith('done');
  const already = partsWith('already');
  const manual = partsWith('manual');
  const groupCount = failures.length + skips.length + [done, already, manual].filter((parts) => parts.length > 0).length;
  const isAlone = groupCount === 1;
  return joinPhrases([
    ...(done.length > 0 ? [wording.done(partNames(done))] : []),
    ...failures,
    ...skips,
    ...(already.length > 0 ? [sharedPhrase({ parts: already, isAlone, phrase: wording.already })] : []),
    ...(manual.length > 0 ? [sharedPhrase({ parts: manual, isAlone, phrase: isAlone ? 'manual steps below' : 'by hand, steps below' })] : []),
  ]);
}

/**
 * One line per harness: `✓ Claude Code    MCP server + skill`, `• Codex    already set up`, `✗ ...`.
 * `names` sets the name column's width; pass every harness of the run, so the
 * lines do not move while results arrive one by one.
 */
export function resultLines(opts: { results: readonly StepResult[]; paint: Paint; command: Command; names?: readonly string[] }): string[] {
  const groups = byHarness(opts.results, (result) => result.step.harness);
  const pad = nameColumn(opts.names ?? groups.map(([harness]) => harness.name));
  return groups.map(([harness, list]) => `${paintMark(markOf(list), opts.paint)} ${pad(harness.name)}${resultSummary(list, WORDING[opts.command])}`);
}

/** The manual steps of every harness that has some, under its name, wrapped to `width`. */
export function manualLines(opts: { steps: readonly Step[]; paint: Paint; width: number }): string[] {
  return byHarness(opts.steps, (step) => step.harness).flatMap(([harness, list]) => {
    const lines = list.flatMap((step) => (step.plan.kind === 'manual' ? step.plan.lines : []));
    if (lines.length === 0) return [];
    return [opts.paint.bold(harness.name), ...lines.flatMap((line) => wrapText({ text: `  ${line}`, width: opts.width, indent: 4 }))];
  });
}

/** `Backups: ~/.cursor/mcp.json.bak, ...`, or null when nothing was backed up. */
export function backupLine(opts: { results: readonly StepResult[]; ctx: RunContext }): string | null {
  const backups = opts.results.flatMap((result) => (result.backup === null ? [] : [displayPath(result.backup, opts.ctx)]));
  if (backups.length === 0) return null;
  return `Backups: ${backups.join(', ')}`;
}

/** One line per harness, slug first so it can be copied into --client: `  claude-code   Claude Code`. */
export function agentSlugLines(harnesses: readonly Harness[]): string[] {
  const pad = nameColumn(harnesses.map((harness) => harness.slug));
  return harnesses.map((harness) => `  ${pad(harness.slug)}${harness.name}`);
}

/** `Claude Code, Cursor and Codex`. */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

export type Closing = { lines: string[]; aside: string | null };

const RATE_ASIDE = 'After your agent installs a tool, it can rate it on agentbuffs.com.';

function namesWith(results: readonly StepResult[], status: StepResult['status']): string[] {
  return [...new Set(results.filter((result) => result.status === status).map((result) => result.step.harness.name))];
}

function installClosing(opts: { results: readonly StepResult[]; hasReports: boolean }): Closing {
  const { results } = opts;
  const restart = namesWith(results, 'done');
  const ask = `"${EXAMPLE_ASK}"`;
  const aside = opts.hasReports ? RATE_ASIDE : null;
  if (restart.length > 0) return { lines: [`Restart ${listNames(restart)}, then ask your agent:`, ask], aside };
  if (namesWith(results, 'failed').length > 0) return { lines: ['Nothing new was installed. Fix the problem above and run agentbuffs again.'], aside: null };
  if (namesWith(results, 'already').length > 0) return { lines: ['Everything was already set up. Ask your agent:', ask], aside };
  if (namesWith(results, 'manual').length > 0) return { lines: ['Follow the steps above, then ask your agent:', ask], aside };
  return { lines: ['Nothing was installed.'], aside: null };
}

function uninstallClosing(results: readonly StepResult[]): Closing {
  const restart = namesWith(results, 'done');
  if (restart.length > 0) return { lines: [`Restart ${listNames(restart)} so it stops loading agentbuffs.`], aside: null };
  if (namesWith(results, 'failed').length > 0) return { lines: ['Nothing was removed. Fix the problem above and run agentbuffs uninstall again.'], aside: null };
  if (namesWith(results, 'skipped').length > 0) return { lines: ['Nothing was removed. The files named above stay as they are.'], aside: null };
  if (namesWith(results, 'already').length > 0) return { lines: ['Nothing to remove. agentbuffs was not set up.'], aside: null };
  if (namesWith(results, 'manual').length > 0) return { lines: ['Follow the steps above to finish.'], aside: null };
  return { lines: ['Nothing was removed.'], aside: null };
}

/**
 * The last words: what to restart and what to ask the agent. `hasReports` is
 * false after `--no-reports`, which leaves out the line about rating tools.
 */
export function closing(opts: { results: readonly StepResult[]; command: Command; hasReports: boolean }): Closing {
  if (opts.command === 'uninstall') return uninstallClosing(opts.results);
  return installClosing(opts);
}
