# SEV MCP

Ask a financial research question. In seconds, get a ranked shortlist of public companies, each with vetted original SEC filing passages and key reported financials: a few paragraphs per company instead of whole filings.

SEV searches its supported SEC corpus and returns a ranked company shortlist with precise filing references. Your agent handles further analysis. Results are research leads; omissions and empty results are possible.

## Connect

1. Install [Node.js](https://nodejs.org/) 20.19 or later.
2. Sign in at [etsquare.ai/account](https://etsquare.ai/account), accept the released Terms, and create an API key. Save its secret when shown.
3. Add one of the configurations below, replace YOUR_SEV_API_KEY, and restart your MCP client. Keep your other server entries.

Each new start uses npm with --prefer-online to check the latest published version. Restart your MCP client after an update; an already-running process does not hot-update. No source checkout is required. The [Build page](https://etsquare.ai/build) shows the same setup for your platform.

### Codex - macOS / Linux

Add to ~/.codex/config.toml:

```toml
[mcp_servers.sev]
command = "npx"
args = ["-y","--prefer-online","@etsquare/sev-mcp@latest"]
startup_timeout_sec = 30
tool_timeout_sec = 25

[mcp_servers.sev.env]
SEV_BASE_URL = "https://etsquare.ai"
SEV_API_KEY = "YOUR_SEV_API_KEY"
```

### Codex - Windows

```toml
[mcp_servers.sev]
command = "cmd"
args = ["/c","npx","-y","--prefer-online","@etsquare/sev-mcp@latest"]
startup_timeout_sec = 30
tool_timeout_sec = 25

[mcp_servers.sev.env]
SEV_BASE_URL = "https://etsquare.ai"
SEV_API_KEY = "YOUR_SEV_API_KEY"
```

### Claude Desktop - macOS / Linux

Merge into your Claude Desktop configuration JSON:

```json
{
  "mcpServers": {
    "sev": {
      "command": "npx",
      "args": [
        "-y",
        "--prefer-online",
        "@etsquare/sev-mcp@latest"
      ],
      "env": {
        "SEV_BASE_URL": "https://etsquare.ai",
        "SEV_API_KEY": "YOUR_SEV_API_KEY"
      }
    }
  }
}
```

### Claude Desktop - Windows

```json
{
  "mcpServers": {
    "sev": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "--prefer-online",
        "@etsquare/sev-mcp@latest"
      ],
      "env": {
        "SEV_BASE_URL": "https://etsquare.ai",
        "SEV_API_KEY": "YOUR_SEV_API_KEY"
      }
    }
  }
}
```

## Tools

- **discover_sec_companies**: required question; optional tickers **or** four-digit sic_codes, inclusive filed_since (YYYY-MM-DD), and max_companies (default 10, maximum 50). Explicit filters are never relaxed. There is no hidden date default.
- **get_sec_passage**: retrieve a returned passage_id and available neighboring context without restarting discovery. Clients supporting MCP resources can also read sev://passages/{passage_id}.

Passage IDs accept uppercase, lowercase or mixed-case hexadecimal. Returned IDs may use their canonical uppercase form.

Returned references include company identity, accession, form, filing date, section, source URL and stable passage identifier. Optional previews are verbatim. Rankings describe research relevance, not investment merit or proof of current impact.

Try: "Which retailers describe overseas factories or sourcing agents and exposure to higher merchandise costs?"

## Access and timeouts

Your account's evaluation allowance is shared by Playground, REST and MCP. A successful search consumes one discovery, including a valid empty result; failed searches do not. Source reads have a separate rate limit. Paid plans are coming soon.

This is a local stdio MCP client of the hosted REST service, not a remote /mcp endpoint. SEV_BASE_URL is the service origin; the default is https://etsquare.ai. Do not append /SEV or /mcp. HTTPS is required except loopback HTTP for local development. A key created on a local service does not authorize production.

The client has a 20-second HTTP deadline and no automatic discovery retry. Codex's example allows 30 seconds for startup (including the first npm download) and 25 seconds per tool call. Those settings belong to Codex; do not add them to Claude Desktop JSON. These are timeout limits, not response-speed guarantees. A submitted request may finish on the server if the caller stops waiting.

Keep your key private, including in MCP configuration. Revoke it from Account when no longer needed. An invalid configured key never falls back to anonymous access. The client does not write credentials or cached research results to disk. Protocol messages alone go to stdout.

Anonymous use is optional and requires explicit acceptance of the service's released Terms: read the Terms and Privacy Policy first, then set SEV_ACCEPT_TERMS_VERSION to the exact version you accepted. The client never accepts a new agreement automatically. A missing or outdated agreement fails before discovery. Use an account key for normal integrations.

## Support

[Documentation](https://etsquare.ai/documentation) - [Terms](https://etsquare.ai/terms) - [Privacy](https://etsquare.ai/privacy) - [Support](https://etsquare.ai/support)

MIT licensed thin client. This package is separate from the historical @etsquare/mcp-server-sec package.
