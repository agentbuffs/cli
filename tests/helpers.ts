/**
 * Test fixtures: a temp home and project, a fixture setup document served on
 * 127.0.0.1, scripted answers, and an in-process run of `main`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { main, type CliIo } from '../src/main.ts';
import type { RunContext } from '../src/paths.ts';
import type { What } from '../src/plan.ts';
import { CancelledError, type PlanAction, type Prompter } from '../src/prompts.ts';
import { execWithoutShell, type ExecFn } from '../src/run-action.ts';
import { plainScreen } from '../src/screen.ts';

export const MCP_URL = 'https://agentbuffs.com/api/mcp';
export const SKILL_TEXT = '---\nname: find-agent-tools\ndescription: Find MCP servers and skills.\n---\n\nAsk agentbuffs.\n';

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** A setup document in the spec's shape, with one harness per action kind. */
export function fixtureDocument(opts: { origin: string; skillSha?: string; mcpUrl?: string; skillQuery?: string }): Record<string, unknown> {
  const url = opts.mcpUrl ?? MCP_URL;
  return {
    setupVersion: 1,
    mcpUrl: url,
    serverName: 'agentbuffs',
    skill: { name: 'find-agent-tools', url: `${opts.origin}/api/discover/v1/setup/skill.md${opts.skillQuery ?? ''}`, sha256: opts.skillSha ?? sha256(SKILL_TEXT) },
    harnesses: [
      {
        slug: 'claude-code',
        name: 'Claude Code',
        detect: { commands: ['claude'], paths: ['~/.claude'] },
        mcp: { kind: 'run', command: 'claude', args: ['mcp', 'add', '--transport', 'http', 'agentbuffs', url] },
        skill: { kind: 'file', path: '~/.claude/skills/find-agent-tools/SKILL.md' },
      },
      {
        slug: 'cursor',
        name: 'Cursor',
        detect: { commands: ['cursor'], paths: ['~/.cursor'] },
        mcp: { kind: 'json-merge', path: '~/.cursor/mcp.json', keyPath: ['mcpServers', 'agentbuffs'], value: { url } },
        skill: null,
      },
      {
        slug: 'vscode',
        name: 'VS Code',
        detect: { commands: ['code'], paths: ['${PROJECT}/.vscode'] },
        mcp: {
          kind: 'json-merge',
          path: '${PROJECT}/.vscode/mcp.json',
          keyPath: ['servers', 'agentbuffs'],
          value: { type: 'http', url },
        },
        skill: null,
      },
      {
        slug: 'codex',
        name: 'Codex',
        detect: { commands: ['codex'], paths: ['~/.codex'] },
        mcp: { kind: 'toml-merge', path: '~/.codex/config.toml', keyPath: ['mcp_servers', 'agentbuffs'], value: { url } },
        skill: { kind: 'file', path: '~/.codex/skills/find-agent-tools/SKILL.md' },
      },
      {
        slug: 'goose',
        name: 'Goose',
        detect: { commands: ['goose'], paths: ['~/.config/goose'] },
        mcp: {
          kind: 'yaml-merge',
          path: '~/.config/goose/config.yaml',
          keyPath: ['extensions', 'agentbuffs'],
          value: { name: 'agentbuffs', enabled: true, type: 'streamable_http', uri: url },
        },
        skill: null,
      },
      {
        slug: 'chatgpt',
        name: 'ChatGPT',
        detect: { commands: [], paths: [] },
        mcp: { kind: 'manual', steps: ['Settings > Apps > Advanced settings > turn on Developer mode', 'Create app', `URL: ${url}`], docsUrl: 'https://agentbuffs.com/clients/chatgpt' },
        skill: null,
      },
    ],
  };
}

export type FixtureServer = { origin: string; requests: string[]; close: () => Promise<void> };

/** Serves a document (built from the origin) and the skill text on 127.0.0.1. */
export async function startFixtureServer(opts: {
  /** The setup document for an origin and the query string of the request (`?reports=off` or ''). */
  document: (origin: string, search: string) => unknown;
  /** The skill file, or a function of the skill request's query string. */
  skillText?: string | ((search: string) => string);
  delayMs?: number;
}): Promise<FixtureServer> {
  const requests: string[] = [];
  let origin = '';
  const server: Server = createServer((request, response) => {
    requests.push(request.url ?? '');
    const send = (): void => {
      const { pathname, search } = new URL(request.url ?? '/', 'http://fixture.invalid');
      if (pathname === '/api/discover/v1/setup') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(opts.document(origin, search)));
        return;
      }
      if (pathname === '/api/discover/v1/setup/skill.md') {
        const text = typeof opts.skillText === 'function' ? opts.skillText(search) : (opts.skillText ?? SKILL_TEXT);
        response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
        response.end(text);
        return;
      }
      response.writeHead(404);
      response.end();
    };
    if (opts.delayMs === undefined) {
      send();
      return;
    }
    setTimeout(send, opts.delayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The fixture server has no port');
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export type TempEnv = { root: string; home: string; project: string; bin: string; ctx: RunContext; cleanup: () => void };

/** A temp home, project and PATH dir. PATH holds only the temp bin dir, so real harnesses on this machine do not count. */
export function makeTempEnv(): TempEnv {
  const root = mkdtempSync(path.join(os.tmpdir(), 'agentbuffs-cli-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  const bin = path.join(root, 'bin');
  for (const dir of [home, project, bin]) mkdirSync(dir, { recursive: true });
  const ctx: RunContext = { home, project, platform: 'linux', env: { PATH: bin, HOME: home } };
  return { root, home, project, bin, ctx, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Writes an executable fake harness CLI into the temp bin dir. */
export function fakeCommand(env: TempEnv, opts: { name: string; script: string }): string {
  const file = path.join(env.bin, opts.name);
  writeFileSync(file, opts.script);
  chmodSync(file, 0o755);
  return file;
}

export function writeFile(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export function readText(file: string): string {
  return readFileSync(file, 'utf8');
}

/** Every file under `dir` with its content, to prove a run wrote nothing. */
export function snapshotTree(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      result[path.relative(dir, full)] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return result;
}

export type Answers = {
  harnesses?: string[] | 'cancel';
  what?: What | 'cancel';
  /** Answers to the plan question, in order; 'ctrl-c' cancels. */
  plan?: Array<PlanAction | 'ctrl-c'>;
  /** Answers to confirm questions, in order. */
  confirms?: Array<boolean | 'cancel'>;
};

/** A prompter that answers from a script and records each question. */
export function scriptedPrompter(answers: Answers, onAsk: () => void = () => undefined): Prompter & { asked: string[] } {
  const asked: string[] = [];
  const confirms = [...(answers.confirms ?? [])];
  const plan = [...(answers.plan ?? [])];
  return {
    asked,
    async chooseHarnesses({ choices, preselected }) {
      asked.push(`harnesses preselected=${preselected.join(',')} choices=${choices.map((c) => `${c.slug}(${c.hint ?? ''})`).join(',')}`);
      if (answers.harnesses === 'cancel') throw new CancelledError('cancelled');
      return answers.harnesses ?? [...preselected];
    },
    async chooseWhat() {
      asked.push('what');
      if (answers.what === 'cancel') throw new CancelledError('cancelled');
      return answers.what ?? 'both';
    },
    async choosePlanAction({ details }) {
      asked.push(`plan details=${details !== null}`);
      onAsk();
      const answer = plan.shift();
      if (answer === undefined) throw new Error('Unexpected plan question');
      if (answer === 'ctrl-c') throw new CancelledError('cancelled');
      return answer;
    },
    async confirm(message) {
      asked.push(message);
      const answer = confirms.shift();
      if (answer === undefined) throw new Error(`Unexpected question: ${message}`);
      if (answer === 'cancel') throw new CancelledError('cancelled');
      return answer;
    },
  };
}

export type RunOutcome = { code: number; out: string; err: string; asked: string[] };

/** Runs `main` in-process against the temp env. */
export async function runCli(opts: {
  env: TempEnv;
  argv: string[];
  interactive?: boolean;
  answers?: Answers;
  exec?: ExecFn;
  /** Called each time the plan question is asked, to look at the world at that moment. */
  onPlanQuestion?: () => void;
}): Promise<RunOutcome> {
  const out: string[] = [];
  const err: string[] = [];
  const prompter = scriptedPrompter(opts.answers ?? {}, opts.onPlanQuestion);
  const io: CliIo = {
    argv: opts.argv,
    out: (text) => out.push(text),
    screen: plainScreen({ out: (text) => out.push(text), err: (text) => err.push(text) }),
    isInteractive: opts.interactive ?? false,
    ctx: opts.env.ctx,
    prompter,
    exec: opts.exec ?? execWithoutShell,
    version: '0.0.0-test',
  };
  const code = await main(io);
  return { code, out: out.join('\n'), err: err.join('\n'), asked: prompter.asked };
}
