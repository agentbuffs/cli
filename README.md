# agentbuffs

Installs the agentbuffs MCP server and the `find-agent-tools` skill for
agents on your machine: Claude Code, Codex, Cursor, VS Code, and others.
Your agent can then search [agentbuffs.com](https://agentbuffs.com) for
MCP servers and skills. `agentbuffs uninstall` removes them again.

## Run it

```sh
curl -fsSL https://agentbuffs.com/install | sh
```

Or, with Node 20 or later:

```sh
npx agentbuffs
```

To pin a version, name it: `npx agentbuffs@0.4.0`. See [Versions](#versions).

In a terminal, the tool runs as a full-screen wizard. Each step replaces the
screen:

1. Agents: the tool detects local agents and selects them by default.
2. Parts: the MCP server, the skill, or both.
3. Plan: one line per agent, for example:

   ```
   ◇  Plan
   │  Claude Code   MCP server + skill
   │  Cursor        MCP server + skill
   │  ChatGPT       manual steps, shown at the end
   ```

   Select Install, Show the changes first (lists every path, entry, and
   command, one page at a time), or Cancel. The tool writes nothing until you
   select Install.
4. Install: a line per agent as each one finishes.

When the run ends, the terminal restores its previous state and leaves a
short summary in the scrollback:

```
┌   agentbuffs 0.4.0
│
◇  Done
│  ✓ Claude Code          MCP server + skill
│  • Codex                already set up
│  ✗ GitHub Copilot CLI   skill (MCP: copilot not found on PATH)
│
└  Restart Claude Code, then ask your agent:
```

The summary also lists manual setup steps and backups. Pressing Ctrl+C
before the install exits the screen and prints `Cancelled. Nothing
was written.`

## Options

| Flag | What it does |
| --- | --- |
| `--client <slug,...>` | Set up these agents, for example `opencode` or `claude-code,codex`. Without a terminal, `--dry-run` alone lists every agent and its slug. |
| `--what mcp\|skill\|both` | Install only the MCP server, only the skill, or both (not for `uninstall`) |
| `--yes` | Install without asking: no questions at all. Without `--what` it installs both parts. Without `--client` it uses the agents it finds. |
| `--dry-run` | Show the plan and every change, and write nothing |
| `--no-reports` | Set up without the rating tools: your agent cannot rate tools on agentbuffs.com. The plan shows `Reports: off`. |
| `--verbose` | Show every change before asking |
| `--no-fullscreen` | Print line by line instead of one screen per step |
| `--api <url>` | Use another setup server (for development) |
| `--version` | Print the version |
| `--help` | Print the options |

In non-interactive environments like scripts or CI, pass `--client` with
`--yes`, or pass `--dry-run`. Otherwise, the tool prints the plan and exits with
code 2. Non-interactive output uses plain text without banners, color, or
spinners. `NO_COLOR` also disables color in terminals. With `--yes`,
`--no-fullscreen`, `NO_COLOR`, `TERM=dumb`, or a terminal smaller than 60 by
18, the tool prints line by line instead of the full-screen wizard.

Exit codes: 0 done, 1 a step failed, 2 a usage problem, 130 cancelled.

## Uninstall

```sh
npx agentbuffs uninstall [--client <slugs>] [--yes] [--dry-run]
```

This removes what install adds, and nothing else. It looks like install: a
banner, a plan, a question, and a line per agent when it is done. It takes the
same `--client`, `--yes`, `--dry-run`, `--verbose`, `--no-fullscreen` and
`--api` options. It does not take `--what`.

For each agent you pick, it does one of these:

- Deletes only the `agentbuffs` entry from the JSON or TOML config file. The
  rest of the file stays as it was, so a file that existed before the install
  comes back byte for byte. It copies the file to `<file>.bak` first and writes
  through a temporary file. If the entry is not there, it says `not set up`
  and writes nothing.
- Runs the agent CLI's remove command, for example
  `claude mcp remove agentbuffs --scope user`, with the same scope the install
  used. The remove commands are in a fixed list in the package, like the add
  commands. Only `claude`, `codex`, `gemini` and `pi` have one. For another CLI,
  the tool prints what to do by hand.
- Deletes `find-agent-tools/SKILL.md`, and its folder if the folder is empty.
  It does this only when the file is the skill the server serves now. A skill
  that you edited, or an older copy, stays, and the tool names its path. Agents
  that share one skill path (`~/.agents/skills`) delete it once, and the plan
  says which other agents use the same file.
- Prints the steps to remove the server for apps that you set up in their own
  settings, such as ChatGPT and Claude Desktop.

Uninstall never deletes a config file. A file that install created ends as
`{}` (JSON) or empty (TOML). A parent object that only held the entry goes
with it.

Without a terminal, pass `--client` with `--yes`, or pass `--dry-run`.
Otherwise it prints the plan and exits with code 2. If you installed with
`--no-reports`, pass `--no-reports` to uninstall too: the skill is a different
file, and uninstall leaves a skill that differs from the one it expects.

## Versions

Every release is a git tag with notes in the [changelog](CHANGELOG.md), and the
`latest` version on npm is always the newest tag. Builds are published from
GitHub Actions with npm provenance.

- `npx agentbuffs` runs the latest version.
- `npx agentbuffs@0.4.0` runs exactly that version.
- `curl -fsSL https://agentbuffs.com/install | sh` runs one exact version. The
  script shows which one. It can lag behind `latest` by a short time.

## What it changes

The tool fetches agent setup definitions from
`https://agentbuffs.com/api/discover/v1/setup` at runtime. For each agent,
it performs one of these actions:

- Runs the agent CLI, for example
  `claude mcp add --scope user --transport http agentbuffs https://agentbuffs.com/api/mcp`.
  It only calls allowlisted binaries (`claude`, `codex`, `gemini`,
  `code`, `copilot`, `pi`, `grok`, `goose`) directly, bypassing the shell.
- Adds an `agentbuffs` entry to a JSON or TOML config file, such as
  `~/.cursor/mcp.json` or `~/.codex/config.toml`. It preserves existing
  content.
- Verifies the SHA-256 hash against the setup payload and writes the skill file,
  for example `~/.claude/skills/find-agent-tools/SKILL.md`.
- Prints instructions for applications that require manual setup.

Install pins the MCP server URL, not the tools behind it. "Show the changes
first" and `--dry-run` print the full skill text, so you can read the
instructions your agent will follow before anything is written.

Before modifying a file, the tool creates a `<file>.bak` copy and prints the
path at the end. It writes updates to a temporary file before replacing the
target. It skips unparseable files and files that already contain the target
entry. If a conflicting `agentbuffs` entry exists, it prompts for
confirmation (`--yes` replaces it without asking). It writes files only within your home directory and the current
directory.

An agent that follows `XDG_CONFIG_HOME` (OpenCode) gets its config there when
the variable is set to an absolute path, and in `~/.config` otherwise. If
`XDG_CONFIG_HOME` points outside your home directory, the tool does not write
there. It tells you so and leaves that agent for you to set up by hand.

## Uninstall by hand

`agentbuffs uninstall --dry-run` lists the exact paths for your machine. If you
prefer to do it yourself, remove these. The paths come from the setup list, so
the list on your machine is the one that counts.

**The MCP server**

- Delete the `agentbuffs` key in the config file:
  - Cursor, `~/.cursor/mcp.json`: `mcpServers.agentbuffs`
  - VS Code, `~/.config/Code/User/mcp.json` (macOS `~/Library/Application Support/Code/User/mcp.json`, Windows `%APPDATA%\Code\User\mcp.json`): `servers.agentbuffs`
  - Gemini CLI, `~/.gemini/settings.json`: `mcpServers.agentbuffs`
  - Antigravity, `~/.gemini/config/mcp_config.json`: `mcpServers.agentbuffs`
  - Windsurf, `~/.config/devin/mcp_config.json` (Windows `%APPDATA%\devin\mcp_config.json`): `mcpServers.agentbuffs`
  - OpenCode, `opencode/opencode.json` in `$XDG_CONFIG_HOME` or `~/.config`: `mcp.agentbuffs`
  - Kilo Code, `~/.config/kilo/kilo.jsonc`: `mcp.agentbuffs`
  - Codex, `~/.codex/config.toml`: the `[mcp_servers.agentbuffs]` table
- Run the agent's own command:
  - Claude Code: `claude mcp remove agentbuffs --scope user`
  - Pi: `pi mcp remove agentbuffs`
  - GitHub Copilot CLI and Grok Build: use the MCP commands of the agent itself.
- Delete the entry you added by hand:
  - ChatGPT and Claude Desktop: delete the `agentbuffs` app or connector, in the settings where you added it.
  - Cline: `mcpServers.agentbuffs` in the file its MCP Servers screen opens.
  - Continue: delete `.continue/mcpServers/agentbuffs.yaml` in your project.
  - Mistral Vibe: the `[[mcp_servers]]` block named `agentbuffs` in `~/.vibe/config.toml`.
  - Zed: `context_servers.agentbuffs` in your Zed `settings.json`.
  - Goose: `extensions.agentbuffs` in `~/.config/goose/config.yaml`.
  - Muse Code: `mcp_servers.agentbuffs` in `~/.config/muse/settings.json`.
- JetBrains and Warp: the tool set up no server there.

**The skill**

Delete the folder `find-agent-tools` in the skills folder of the agent:

- `~/.claude/skills`: Claude Code
- `~/.copilot/skills`: VS Code and GitHub Copilot CLI
- `~/.agents/skills`: Codex, Warp, Pi, Zed, Goose and Muse Code
- `~/.cursor/skills`: Cursor
- `~/.gemini/skills`: Gemini CLI
- `~/.gemini/config/skills`: Antigravity
- `opencode/skills` in `$XDG_CONFIG_HOME` or `~/.config`: OpenCode
- `~/.config/devin/skills`: Windsurf
- `~/.junie/skills`: JetBrains
- `~/.cline/skills`: Cline
- `~/.vibe/skills`: Mistral Vibe
- `~/.kilo/skills`: Kilo Code
- `~/.grok/skills`: Grok Build

Folders that several agents share, like `~/.agents/skills`, stay until you are
done with all of those agents.

## Privacy

The tool sends no telemetry. An install makes two network requests: one for the
setup manifest and one for the skill file. An uninstall makes the first only. Read the
[privacy policy](https://agentbuffs.com/privacy).

## Development

```sh
pnpm install
pnpm check   # typecheck, build dist/cli.mjs, run the tests
```

The build compiles the project into `dist/cli.mjs`. The published package
has no runtime dependencies.

To cut a release, see [RELEASING.md](RELEASING.md).

## License

MIT
