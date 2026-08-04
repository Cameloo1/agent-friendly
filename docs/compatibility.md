# Compatibility matrix

Verified against the official documentation and the live scanner contract on 2026-08-04.

| Requirement | Codex | Claude Code | OpenCode stable |
| --- | --- | --- | --- |
| Package manifest | Required `.codex-plugin/plugin.json` | Optional `.claude-plugin/plugin.json`; this package ships one for metadata | No equivalent skill-plus-MCP bundle manifest; use `opencode.json` or the installer |
| Marketplace manifest | `.agents/plugins/marketplace.json` with `plugins[].source.path`, policy, and category | `.claude-plugin/marketplace.json` with owner and `plugins[].name` plus `source` | No marketplace manifest for this shape |
| Skill layout | `skills/<name>/SKILL.md` inside a plugin | `skills/<name>/SKILL.md` inside a plugin | Directory `SKILL.md` under a discovered or explicitly configured skill source |
| Portable frontmatter | `name` and `description` are required; the description drives matching | Fields are optional, but `description` is recommended for automatic use | `name` and `description` are required; optional `license`, `compatibility`, and string-map `metadata` are recognized |
| Name constraints | Lowercase kebab-case, maximum 64 characters; directory matches name | Name may be omitted, but portable names use lowercase letters, digits, and hyphens, maximum 64 characters | Lowercase kebab-case, 1-64 characters, no consecutive hyphens; directory must match |
| MCP config | Manifest embeds the named server map in `mcpServers`; relative stdio command runs from plugin root | Manifest `mcpServers` points to `.mcp.json`; config uses `mcpServers` and `${CLAUDE_PLUGIN_ROOT}` | `opencode.json` uses `mcp.<name>`, `type: "local"`, an enabled flag, and a command array |
| Remote HTTP shape | Streamable HTTP is configured with an HTTPS URL when used directly | Remote server uses `type: "http"` and `url` | Remote server uses `type: "remote"`, `url`, and `oauth: false` when auth must be disabled |

The shared `SKILL.md` uses only the common `name` and `description` fields. Platform-specific plugin and MCP manifests resolve the incompatible package/config shapes without duplicating agent instructions.

OpenCode's separate V2 preview currently conflicts with stable: it makes skill frontmatter optional and moves servers to `mcp.servers.<name>`, using `disabled` instead of `enabled`. This package also ships `opencode.v2.json`; `node ./scripts/install-opencode.mjs --v2` selects that merge shape. The default installer targets the current stable CLI and requires no manual JSON editing.

## MCP transport decision

The released MCP 2025-11-25 specification defines Streamable HTTP as a single endpoint supporting POST and GET; a stateless server simply does not return `MCP-Session-Id`. The 2026-07-28 draft is a breaking transport revision: it removes GET and protocol sessions and requires per-request metadata headers. The live `https://isitagentready.com/mcp` endpoint currently negotiates `2025-06-18`, returns SSE responses, exposes no session header, and requires no authentication.

The package therefore uses a local stdio safety gateway for all three harnesses and a version-negotiating Streamable HTTP client upstream. It does not hard-code draft-only headers against the older live server.

## Official sources

- OpenAI: [Build skills](https://developers.openai.com/plugins/build/skills), [package plugins](https://developers.openai.com/plugins/build/plugins), and [Codex MCP](https://developers.openai.com/codex/mcp/)
- Anthropic: [Claude Code skills](https://code.claude.com/docs/en/slash-commands), [plugin reference](https://code.claude.com/docs/en/plugins-reference), [plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), and [MCP](https://code.claude.com/docs/en/mcp)
- OpenCode: [stable skills](https://opencode.ai/docs/skills), [stable MCP servers](https://opencode.ai/docs/mcp-servers/), [V2 skills](https://opencode.ai/v2/docs/skills), and [V2 MCP servers](https://opencode.ai/v2/docs/mcp-servers)
- Model Context Protocol: [2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [2026-07-28 draft Streamable HTTP](https://modelcontextprotocol.io/specification/draft/basic/transports/streamable-http), and [draft changelog](https://modelcontextprotocol.io/specification/draft/changelog)
- Runtime support: [Node.js releases](https://nodejs.org/en/about/previous-releases)
