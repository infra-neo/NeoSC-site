# NeoSC MCP Server

Bridges NeoSC platform + n8n workflows + 3rd-party services (NetBird, OpenNebula, Zitadel)
into MCP tools that any LLM client (Claude Desktop, Cursor, n8n MCP node, custom agents)
can invoke via natural language.

## Quick start

### Option A — Use with Claude Desktop (stdio)

Install dependencies once:

```bash
pip install mcp httpx
```

Edit `~/.config/claude-desktop/claude_desktop_config.json` (or the equivalent on macOS):

```json
{
  "mcpServers": {
    "neosc": {
      "command": "python3",
      "args": ["/app/mcp/neosc_mcp_server.py"],
      "env": {
        "NEOSC_MCP_MODE": "stdio"
      }
    }
  }
}
```

Restart Claude Desktop. The 12 NeoSC tools will appear in the tool tray.

### Option B — HTTP testing (no MCP SDK required)

```bash
pip install aiohttp httpx
python3 /app/mcp/neosc_mcp_server.py     # listens on :8765
```

```bash
curl http://localhost:8765/tools
curl -X POST http://localhost:8765/tools/health_check_all -d '{}' -H 'Content-Type: application/json'
curl -X POST http://localhost:8765/tools/netbird_list_peers -d '{}' -H 'Content-Type: application/json'
curl -X POST http://localhost:8765/tools/neosc_instantiate_vm \
  -d '{"template_id":14,"cpu":4,"memory":8192,"tsplus_users":3}' \
  -H 'Content-Type: application/json'
```

### Option C — Use from n8n directly (MCP Client node)

n8n 1.55+ ships with an "MCP Client" node. Point it to the server URL where this
process runs, and the 12 tools become callable from any workflow.

## Tools exposed

| Tool | Purpose |
|------|---------|
| `neosc_login` | Authenticate with NeoSC platform |
| `neosc_list_marketplace` | List OpenCloud templates (Starter/Business/Enterprise) |
| `neosc_instantiate_vm` | Create a Windows VDI VM with TSplus |
| `neosc_provision_status` | Poll provisioning steps + VM data |
| `neosc_list_workspaces` | List user's provisioned VMs + HTML5 URLs |
| `netbird_list_peers` | List NetBird Cloud peers + mesh IPs |
| `netbird_create_setup_key` | Mint a NetBird setup key |
| `zitadel_list_users` | List NeoGuard SSO users |
| `zitadel_list_orgs` | List NeoGuard SSO orgs |
| `opennebula_health` | Wrapper API health |
| `n8n_run_workflow` | Execute any n8n workflow by ID |
| `health_check_all` | Aggregate health of all services |
