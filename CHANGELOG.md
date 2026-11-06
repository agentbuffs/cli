# Changelog

All notable changes to this project are written here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- "Show the changes first" and `--dry-run` print the full text of the skill file, not only its size and checksum. The skill holds instructions your agent follows, so you can now read them before you approve.
- The skill preview shows control characters and invisible characters, such as escape codes and zero-width marks, as `<U+XXXX>` codes. The file is still written exactly as downloaded.

## [0.4.1] - 2026-11-01

### Fixed

- `repository.url` in `package.json` uses the GitHub organization name in lower case, `agentbuffs`. npm compares it with the provenance of the build and refused the 0.4.0 publish. 0.4.0 has a git tag but was never on npm. 0.4.1 has the same changes.

## [0.4.0] - 2026-11-01

### Added

- `agentbuffs uninstall` removes what install added: the `agentbuffs` entry in a JSON or TOML config file, the server in agents that use their own CLI, and the `find-agent-tools` skill. It takes `--client`, `--yes` and `--dry-run`, like install.
- Uninstall writes a `.bak` copy before it edits a file and leaves the rest of the file as it was. It never deletes a config file.
- Uninstall leaves the skill in place when you edited it or it is outdated, and tells you the path. A skill shared by several agents is deleted once.
- `--no-reports` sets up the MCP server and the skill without the rating tools. The plan shows `Reports: off`, and the last screen leaves out the line about rating tools.
- `npx agentbuffs install` works as a spelled-out form of the default command.
- This changelog, tagged releases, and published builds with npm provenance. `RELEASING.md` describes the steps.

### Fixed

- A server already added to an agent with a different URL (for example one with `?reports=off`) is no longer reported as "already set up". The check now compares the whole URL.

## [0.3.2] - 2026-10-31

### Fixed

- The `--help` example names `opencode`, so it no longer reads as the full list of agents.
- `--dry-run` alone, without a terminal, lists every agent slug and exits 0. A plain run without `--client` lists them in its error.

## [0.3.1] - 2026-10-30

### Fixed

- `--yes` never asks. Without `--what` it installs both parts. Without `--client` it uses the agents it finds, and exits 2 with the known slugs when it finds none.
- OpenCode follows `XDG_CONFIG_HOME` when it is an absolute path.
- An `XDG_CONFIG_HOME` that points outside your home folder and the project is refused. The tool says so and leaves that agent for you to set up by hand.

## [0.3.0] - 2026-10-30

### Added

- In a terminal, the installer runs as a full-screen wizard with one screen per step: agents, parts, plan, install.
- Long lists and the list of changes page inside the prompt. Every screen fits 80 by 24.
- `--no-fullscreen` prints line by line instead.

### Changed

- Every way out (done, cancel, Ctrl+C, SIGTERM, an error) restores the terminal and leaves a short summary in the scrollback.
- With `--yes`, `NO_COLOR`, `TERM=dumb`, no terminal, or a terminal smaller than 60 by 18, the output stays line by line.

## [0.2.0] - 2026-10-30

### Added

- A banner with the flame mark, in 24-bit, 256 or 16 colors, with a shape-only form for `NO_COLOR`.
- `--verbose` shows every change before it asks.

### Changed

- The plan is one line per agent. "Show the changes first" and `--dry-run` list the paths, entries and commands.
- One result line per agent, with a check, a dot or a cross. Backups are listed in one line, and manual steps get their own section.
- The spinner is the tool's own, so Ctrl+C still cancels while an agent CLI runs.
- Without a terminal, the output is plain text with the same lines.

## [0.1.0] - 2026-10-30

### Added

- First release. It adds the agentbuffs MCP server and the `find-agent-tools` skill to the agents on your machine, from the setup list at agentbuffs.com.
- It edits JSON and TOML config files in place and keeps the rest of the file. It copies a file to `<file>.bak` first and writes through a temporary file.
- It runs an agent's own CLI (for example `claude mcp add`) only from a fixed list, never through a shell.
- It checks the skill file against its SHA-256 before it writes it.
- The options are `--client`, `--what`, `--yes`, `--dry-run`, `--api`, `--version` and `--help`. The exit codes are 0, 1, 2 and 130.

[0.4.1]: https://github.com/agentbuffs/cli/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/agentbuffs/cli/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/agentbuffs/cli/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/agentbuffs/cli/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/agentbuffs/cli/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/agentbuffs/cli/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/agentbuffs/cli/releases/tag/v0.1.0
