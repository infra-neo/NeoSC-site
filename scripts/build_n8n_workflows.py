"""
Build and upload n8n workflows for NeoSC.
Each workflow demonstrates / validates one operation or flow.

Run: python3 /app/scripts/build_n8n_workflows.py
"""
import json
import os
import sys
import urllib.request
import urllib.error
import uuid

N8N_URL = "https://n8n.kappa4.com"
N8N_KEY = os.environ.get("N8N_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTI4Nzc1OS1kZGRmLTQxZjMtYmU4MS02OGY0N2UwZGM1Y2UiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZjA5MmE1ZTUtNjIzOS00MDE3LWE0Y2MtMjdkNDdlMDJhMGY1IiwiaWF0IjoxNzgyMDI0NTMxLCJleHAiOjE3ODQ2MDY0MDB9.zrfj8zgWEtYCs42mCuRmlixMbJCkWJ1cHhaymDg9IaQ"

# NeoSC backend (preview)
NEOSC_API = "https://action-steps-4.preview.emergentagent.com/api"
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASS = "Admin123!"

# Third-party tokens (same the platform uses)
OPENNEBULA_API = "http://149.56.241.64:3000/api"
OPENNEBULA_TOKEN = "9c632dc1ac0b26ab925717ba62a2b0e535476a1d1b57ecbd7b58aae84cbb9113"
NETBIRD_API = "https://api.netbird.io"
NETBIRD_TOKEN = "nbp_OJadsrm9YusgaWHrnWQpdZZydYffG811DIL9"
ZITADEL_DOMAIN = "https://beyondcloud-nxm7ab.us1.zitadel.cloud"
ZITADEL_TOKEN = "NsXZCNkadmuKysEBT45K88gh8urvDjjwBJCWUhLzHdIAR1qiXbz5tQnV4rniPl12vOuzXMY"


# ── helpers ──────────────────────────────────────────────────────────────────
def uid() -> str:
    return str(uuid.uuid4())


def manual_trigger(name="Manual Trigger", x=240, y=300):
    return {
        "parameters": {},
        "id": uid(),
        "name": name,
        "type": "n8n-nodes-base.manualTrigger",
        "typeVersion": 1,
        "position": [x, y],
    }


def set_node(name, fields, x=460, y=300):
    """fields = list of {'name','value'} dicts (string values)."""
    return {
        "parameters": {
            "assignments": {
                "assignments": [
                    {"id": uid(), "name": f["name"], "value": f["value"], "type": "string"}
                    for f in fields
                ]
            },
            "options": {},
        },
        "id": uid(),
        "name": name,
        "type": "n8n-nodes-base.set",
        "typeVersion": 3.4,
        "position": [x, y],
    }


def http_node(name, method, url, *, body=None, headers=None, query=None, x=680, y=300, auth=None):
    params = {
        "method": method,
        "url": url,
        "sendQuery": bool(query),
        "sendHeaders": bool(headers),
        "sendBody": method in ("POST", "PUT", "PATCH") and body is not None,
        "options": {"response": {"response": {"fullResponse": False, "responseFormat": "json"}}},
    }
    if headers:
        params["headerParameters"] = {
            "parameters": [{"name": k, "value": v} for k, v in headers.items()]
        }
    if query:
        params["queryParameters"] = {
            "parameters": [{"name": k, "value": v} for k, v in query.items()]
        }
    if body:
        params["bodyContentType"] = "json"
        params["specifyBody"] = "json"
        params["jsonBody"] = body if isinstance(body, str) else json.dumps(body)
    return {
        "parameters": params,
        "id": uid(),
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [x, y],
    }


def js_node(name, code, x=680, y=300):
    return {
        "parameters": {"jsCode": code},
        "id": uid(),
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x, y],
    }


def connect(*node_names):
    """Build linear connections between successive nodes."""
    conns = {}
    for i in range(len(node_names) - 1):
        conns[node_names[i]] = {"main": [[{"node": node_names[i + 1], "type": "main", "index": 0}]]}
    return conns


def workflow(name, nodes, connections, tag="NeoSC"):
    return {
        "name": name,
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1"},
    }


# ─── Build workflows ─────────────────────────────────────────────────────────
def wf_1_auth_login():
    trig = manual_trigger("▶ Click to run")
    cfg = set_node("Config", [
        {"name": "api", "value": NEOSC_API},
        {"name": "email", "value": ADMIN_EMAIL},
        {"name": "password", "value": ADMIN_PASS},
    ], 460)
    login = http_node("Login (POST /auth/login)", "POST",
                      "={{$json.api}}/auth/login",
                      body='={"email": $json.email, "password": $json.password}',
                      x=680)
    # Use expression body
    login["parameters"]["jsonBody"] = '={\n  "email": $json.email,\n  "password": $json.password\n}'
    me = http_node("Get my profile (GET /auth/me)", "GET",
                   "={{ $('Config').first().json.api }}/auth/me",
                   headers={"Authorization": "=Bearer {{ $json.access_token }}"},
                   x=900)
    return workflow(
        "NeoSC · 01 · Auth · Login + Get Profile",
        [trig, cfg, login, me],
        connect(trig["name"], cfg["name"], login["name"], me["name"]),
    )


def wf_2_marketplace_list():
    trig = manual_trigger()
    list_tpls = http_node("List Templates (GET /market/templates)", "GET",
                          f"{NEOSC_API}/market/templates", x=460)
    summarize = js_node("Summarize", """
const data = $input.first().json;
const templates = (data.templates || []).map(t => ({
  templateId: t.templateId,
  name: t.name,
  badge: t.badge,
  tier: t.tier,
  cpu: t.cpu,
  ram_mb: t.memory,
  disk_gb: t.disk,
  os: t.os,
  service_id: t.service_id,
  price_monthly: t.price_monthly,
  tsplus_default_users: t.tsplus_users && t.tsplus_users.default,
}));
return [{ json: { api_status: data.api_status, count: templates.length, templates } }];
""", x=680)
    return workflow(
        "NeoSC · 02 · Marketplace · List OpenCloud Templates",
        [trig, list_tpls, summarize],
        connect(trig["name"], list_tpls["name"], summarize["name"]),
    )


def wf_3_marketplace_instantiate():
    trig = manual_trigger()
    cfg = set_node("Config", [
        {"name": "api", "value": NEOSC_API},
        {"name": "email", "value": ADMIN_EMAIL},
        {"name": "password", "value": ADMIN_PASS},
        {"name": "template_id", "value": "14"},
        {"name": "cpu", "value": "4"},
        {"name": "memory_mb", "value": "8192"},
        {"name": "tsplus_users", "value": "3"},
    ], 460)
    login = http_node("Login", "POST",
                      "={{ $json.api }}/auth/login", x=680)
    login["parameters"]["jsonBody"] = '={\n  "email": $json.email,\n  "password": $json.password\n}'
    instantiate = http_node(
        "Instantiate VM (POST /market/templates/{id}/instantiate)", "POST",
        "={{ $('Config').first().json.api }}/market/templates/{{ $('Config').first().json.template_id }}/instantiate",
        headers={"Authorization": "=Bearer {{ $json.access_token }}"},
        x=900,
    )
    instantiate["parameters"]["jsonBody"] = ('={\n  "cpu": parseInt($("Config").first().json.cpu),\n'
                                              '  "memory": parseInt($("Config").first().json.memory_mb),\n'
                                              '  "tsplus_users": parseInt($("Config").first().json.tsplus_users)\n}')
    summary = js_node("Result", """
const o = $input.first().json;
return [{ json: {
  status: 'order_created',
  order_id: o.order_id,
  vm_name: o.vm_name,
  template: o.template && o.template.name,
  total_usd: o.total_usd,
  next_step: `Poll /market/orders/${o.order_id}/status until status=active`
}}];
""", x=1120)
    return workflow(
        "NeoSC · 03 · Marketplace · Instantiate Template 14 (Starter)",
        [trig, cfg, login, instantiate, summary],
        connect(trig["name"], cfg["name"], login["name"], instantiate["name"], summary["name"]),
    )


def wf_4_provision_poll():
    trig = manual_trigger()
    cfg = set_node("Config", [
        {"name": "api", "value": NEOSC_API},
        {"name": "email", "value": ADMIN_EMAIL},
        {"name": "password", "value": ADMIN_PASS},
        {"name": "order_id", "value": "REPLACE_WITH_ORDER_ID"},
    ], 460)
    login = http_node("Login", "POST", "={{ $json.api }}/auth/login", x=680)
    login["parameters"]["jsonBody"] = '={\n  "email": $json.email,\n  "password": $json.password\n}'
    status = http_node(
        "Get Order Status", "GET",
        "={{ $('Config').first().json.api }}/market/orders/{{ $('Config').first().json.order_id }}/status",
        headers={"Authorization": "=Bearer {{ $json.access_token }}"},
        x=900,
    )
    summary = js_node("Pretty Report", """
const d = $input.first().json;
const vm = d.vm || {};
return [{ json: {
  order_status: d.order_status,
  completed: `${d.completed_steps}/${d.total_steps}`,
  steps: (d.steps || []).map(s => ({step: s.step_name, status: s.status})),
  vm_name: vm.name,
  netbird_ip: vm.netbird_ip,
  html5_access_url: vm.html5_access_url,
  netbird_dns_label: vm.netbird_dns_label,
}}];
""", x=1120)
    return workflow(
        "NeoSC · 04 · Marketplace · Poll Provision Status",
        [trig, cfg, login, status, summary],
        connect(trig["name"], cfg["name"], login["name"], status["name"], summary["name"]),
    )


def wf_5_opennebula_direct():
    trig = manual_trigger()
    health = http_node("OpenNebula Health (GET /api/health)", "GET",
                       f"{OPENNEBULA_API}/health",
                       headers={"Authorization": f"Bearer {OPENNEBULA_TOKEN}"},
                       x=460)
    instantiate = http_node("Instantiate VM (POST /api/vm/instantiate)", "POST",
                             f"{OPENNEBULA_API}/vm/instantiate",
                             headers={"Authorization": f"Bearer {OPENNEBULA_TOKEN}"},
                             body={"templateId": 14, "vmName": "NEOSC-VDI-N8NTEST",
                                   "cpu": 4, "memory": 8192},
                             x=680)
    return workflow(
        "NeoSC · 05 · OpenNebula · Direct Wrapper API (health + instantiate)",
        [trig, health, instantiate],
        connect(trig["name"], health["name"], instantiate["name"]),
    )


def wf_6_netbird_peers():
    trig = manual_trigger()
    peers = http_node("List Peers (GET /api/peers)", "GET",
                      f"{NETBIRD_API}/api/peers",
                      headers={"Authorization": f"Token {NETBIRD_TOKEN}"},
                      x=460)
    summary = js_node("Summary", """
const peers = $input.first().json;
const list = Array.isArray(peers) ? peers : [];
return [{ json: {
  total: list.length,
  online: list.filter(p => p.connected).length,
  peers: list.slice(0, 20).map(p => ({
    name: p.name, hostname: p.hostname, ip: p.ip,
    dns_label: p.dns_label, os: p.os, version: p.version,
    connected: p.connected, last_login: p.last_login,
  }))
}}];
""", x=680)
    return workflow(
        "NeoSC · 06 · NetBird · List Peers + Get Mesh IPs",
        [trig, peers, summary],
        connect(trig["name"], peers["name"], summary["name"]),
    )


def wf_7_netbird_setupkey():
    trig = manual_trigger()
    cfg = set_node("Config", [
        {"name": "key_name", "value": "n8n-test-key"},
    ], 460)
    create_key = http_node("Create Setup Key", "POST",
                            f"{NETBIRD_API}/api/setup-keys",
                            headers={"Authorization": f"Token {NETBIRD_TOKEN}"},
                            x=680)
    create_key["parameters"]["jsonBody"] = ('={\n  "name": $json.key_name,\n'
                                             '  "type": "reusable",\n'
                                             '  "expires_in": 86400,\n'
                                             '  "revoked": false,\n'
                                             '  "usage_limit": 0,\n'
                                             '  "ephemeral": false\n}')
    summary = js_node("Result", """
const d = $input.first().json;
return [{ json: {
  setup_key_id: d.id, key: d.key, name: d.name,
  expires_at: d.expires, valid: d.valid, type: d.type,
  install_cmd: `netbird up --setup-key ${d.key}`,
}}];
""", x=900)
    return workflow(
        "NeoSC · 07 · NetBird · Create Setup Key (for VM auto-registration)",
        [trig, cfg, create_key, summary],
        connect(trig["name"], cfg["name"], create_key["name"], summary["name"]),
    )


def wf_8_zitadel_users_orgs():
    trig = manual_trigger()
    users = http_node("List Users (POST /v2/users)", "POST",
                      f"{ZITADEL_DOMAIN}/v2/users",
                      headers={"Authorization": f"Bearer {ZITADEL_TOKEN}"},
                      body={"queries": [], "limit": 50},
                      x=460)
    orgs = http_node("List Orgs (POST /v2/organizations/_search)", "POST",
                     f"{ZITADEL_DOMAIN}/v2/organizations/_search",
                     headers={"Authorization": f"Bearer {ZITADEL_TOKEN}"},
                     body={"queries": [], "limit": 50},
                     x=460, y=460)
    merge = js_node("Merge users + orgs", """
// Use referenced inputs to combine two parallel calls
const u = $('List Users (POST /v2/users)').first().json;
const o = $('List Orgs (POST /v2/organizations/_search)').first().json;
return [{ json: {
  users_total: u.details && u.details.totalResult,
  orgs_total: o.details && o.details.totalResult,
  sample_users: (u.result || []).slice(0,5).map(x => ({
    id: x.userId, email: x.human && x.human.email && x.human.email.email,
    name: x.human && x.human.profile && x.human.profile.displayName, state: x.state
  })),
  orgs: (o.result || []).map(x => ({id: x.id, name: x.name, primaryDomain: x.primaryDomain})),
}}];
""", x=720)
    return workflow(
        "NeoSC · 08 · Zitadel · List Users + Orgs (NeoGuard)",
        [trig, users, orgs, merge],
        {
            trig["name"]: {"main": [[
                {"node": users["name"], "type": "main", "index": 0},
                {"node": orgs["name"], "type": "main", "index": 0},
            ]]},
            users["name"]: {"main": [[{"node": merge["name"], "type": "main", "index": 0}]]},
            orgs["name"]: {"main": [[{"node": merge["name"], "type": "main", "index": 0}]]},
        },
    )


def wf_9_workspaces_list():
    trig = manual_trigger()
    cfg = set_node("Config", [
        {"name": "api", "value": NEOSC_API},
        {"name": "email", "value": ADMIN_EMAIL},
        {"name": "password", "value": ADMIN_PASS},
    ], 460)
    login = http_node("Login", "POST", "={{ $json.api }}/auth/login", x=680)
    login["parameters"]["jsonBody"] = '={\n  "email": $json.email,\n  "password": $json.password\n}'
    vms = http_node("List my VMs (GET /market/my-vms)", "GET",
                    "={{ $('Config').first().json.api }}/market/my-vms",
                    headers={"Authorization": "=Bearer {{ $json.access_token }}"},
                    x=900)
    summary = js_node("VM Catalog", """
const d = $input.first().json;
const vms = d.vms || [];
return [{ json: {
  total: vms.length,
  vms: vms.map(v => ({
    id: v.id, name: v.name, status: v.status,
    source: v.source, netbird_ip: v.netbird_ip,
    html5: v.connection_url || v.html5_access_url,
    tsplus_licenses: v.tsplus_licenses,
    vcpu: v.vcpu, ram_gb: v.ram_gb, disk_gb: v.disk_gb,
  }))
}}];
""", x=1120)
    return workflow(
        "NeoSC · 09 · Workspaces · List User VMs + Access URLs",
        [trig, cfg, login, vms, summary],
        connect(trig["name"], cfg["name"], login["name"], vms["name"], summary["name"]),
    )


def wf_10_e2e_full_flow():
    """Full E2E: login → instantiate → wait → poll → verify in workspaces."""
    trig = manual_trigger()
    cfg = set_node("Config", [
        {"name": "api", "value": NEOSC_API},
        {"name": "email", "value": ADMIN_EMAIL},
        {"name": "password", "value": ADMIN_PASS},
        {"name": "template_id", "value": "14"},
    ], 460)
    login = http_node("1. Login", "POST", "={{ $json.api }}/auth/login", x=680)
    login["parameters"]["jsonBody"] = '={\n  "email": $json.email,\n  "password": $json.password\n}'
    inst = http_node(
        "2. Instantiate",
        "POST",
        "={{ $('Config').first().json.api }}/market/templates/{{ $('Config').first().json.template_id }}/instantiate",
        headers={"Authorization": "=Bearer {{ $json.access_token }}"},
        x=900,
    )
    inst["parameters"]["jsonBody"] = '={\n  "cpu": 4,\n  "memory": 8192,\n  "tsplus_users": 3\n}'
    wait = {
        "parameters": {"amount": 120, "unit": "seconds"},
        "id": uid(), "name": "3. Wait 120s for provisioning",
        "type": "n8n-nodes-base.wait", "typeVersion": 1.1,
        "position": [1120, 300], "webhookId": uid(),
    }
    poll = http_node(
        "4. Poll Status",
        "GET",
        "={{ $('Config').first().json.api }}/market/orders/{{ $('2. Instantiate').first().json.order_id }}/status",
        headers={"Authorization": "=Bearer {{ $('1. Login').first().json.access_token }}"},
        x=1340,
    )
    summary = js_node("5. E2E Result", """
const o = $('2. Instantiate').first().json;
const s = $input.first().json;
const vm = s.vm || {};
return [{ json: {
  status: s.order_status,
  order_id: o.order_id,
  vm_name: vm.name,
  netbird_ip: vm.netbird_ip,
  html5_url: vm.html5_access_url,
  template_used: o.template && o.template.name,
  total_steps: `${s.completed_steps}/${s.total_steps}`,
  e2e_ok: s.order_status === 'active' && !!vm.netbird_ip && !!vm.html5_access_url,
}}];
""", x=1560)
    return workflow(
        "NeoSC · 10 · E2E · Full Flow (Login → Instantiate → Wait → Poll → Verify)",
        [trig, cfg, login, inst, wait, poll, summary],
        connect(trig["name"], cfg["name"], login["name"], inst["name"], wait["name"], poll["name"], summary["name"]),
    )


def wf_11_health_check():
    """Health check for all NeoSC dependencies."""
    trig = manual_trigger()
    backend = http_node("NeoSC Backend", "GET", f"{NEOSC_API}/health", x=460, y=120)
    on = http_node("OpenNebula Wrapper", "GET", f"{OPENNEBULA_API}/health",
                   headers={"Authorization": f"Bearer {OPENNEBULA_TOKEN}"}, x=460, y=260)
    nb = http_node("NetBird Cloud", "GET", f"{NETBIRD_API}/api/users/current",
                   headers={"Authorization": f"Token {NETBIRD_TOKEN}"}, x=460, y=400)
    zit = http_node("Zitadel Cloud", "POST", f"{ZITADEL_DOMAIN}/v2/organizations/_search",
                    headers={"Authorization": f"Bearer {ZITADEL_TOKEN}"},
                    body={"queries": [], "limit": 1}, x=460, y=540)
    # Continue all branches even if some fail
    for node in (backend, on, nb, zit):
        node["parameters"]["options"]["response"]["response"]["fullResponse"] = True
        node["continueOnFail"] = True
    agg = js_node("Aggregate Health", """
function asResult(label, item) {
  if (!item) return { service: label, ok: false, reason: 'no response' };
  const j = item.json || {};
  const code = j.statusCode || (j.error ? 0 : 200);
  return {
    service: label,
    http_status: code,
    ok: code >= 200 && code < 400,
    details: typeof j.body === 'object' ? JSON.stringify(j.body).slice(0,200) : (j.body || '').toString().slice(0,200),
  };
}
const out = [
  asResult('NeoSC Backend', $('NeoSC Backend').first()),
  asResult('OpenNebula Wrapper', $('OpenNebula Wrapper').first()),
  asResult('NetBird Cloud', $('NetBird Cloud').first()),
  asResult('Zitadel Cloud', $('Zitadel Cloud').first()),
];
const all_ok = out.every(r => r.ok);
return [{ json: { timestamp: new Date().toISOString(), all_ok, services: out } }];
""", x=720, y=330)
    return workflow(
        "NeoSC · 11 · Health Check · All 3rd-party Services",
        [trig, backend, on, nb, zit, agg],
        {
            trig["name"]: {"main": [[
                {"node": backend["name"], "type": "main", "index": 0},
                {"node": on["name"], "type": "main", "index": 0},
                {"node": nb["name"], "type": "main", "index": 0},
                {"node": zit["name"], "type": "main", "index": 0},
            ]]},
            backend["name"]: {"main": [[{"node": agg["name"], "type": "main", "index": 0}]]},
            on["name"]: {"main": [[{"node": agg["name"], "type": "main", "index": 0}]]},
            nb["name"]: {"main": [[{"node": agg["name"], "type": "main", "index": 0}]]},
            zit["name"]: {"main": [[{"node": agg["name"], "type": "main", "index": 0}]]},
        },
    )


def wf_12_tenants_management():
    trig = manual_trigger()
    cfg = set_node("Config", [
        {"name": "api", "value": NEOSC_API},
        {"name": "email", "value": ADMIN_EMAIL},
        {"name": "password", "value": ADMIN_PASS},
    ], 460)
    login = http_node("Login", "POST", "={{ $json.api }}/auth/login", x=680)
    login["parameters"]["jsonBody"] = '={\n  "email": $json.email,\n  "password": $json.password\n}'
    my_tenant = http_node("GET /tenants/me", "GET",
                          "={{ $('Config').first().json.api }}/tenants/me",
                          headers={"Authorization": "=Bearer {{ $json.access_token }}"},
                          x=900)
    list_tenants = http_node("GET /tenants (admin)", "GET",
                             "={{ $('Config').first().json.api }}/tenants",
                             headers={"Authorization": "=Bearer {{ $('Login').first().json.access_token }}"},
                             x=900, y=460)
    return workflow(
        "NeoSC · 12 · Multi-Tenant · Get Current + List All",
        [trig, cfg, login, my_tenant, list_tenants],
        {
            trig["name"]: {"main": [[{"node": cfg["name"], "type": "main", "index": 0}]]},
            cfg["name"]: {"main": [[{"node": login["name"], "type": "main", "index": 0}]]},
            login["name"]: {"main": [[
                {"node": my_tenant["name"], "type": "main", "index": 0},
                {"node": list_tenants["name"], "type": "main", "index": 0},
            ]]},
        },
    )


WORKFLOW_BUILDERS = [
    wf_1_auth_login,
    wf_2_marketplace_list,
    wf_3_marketplace_instantiate,
    wf_4_provision_poll,
    wf_5_opennebula_direct,
    wf_6_netbird_peers,
    wf_7_netbird_setupkey,
    wf_8_zitadel_users_orgs,
    wf_9_workspaces_list,
    wf_10_e2e_full_flow,
    wf_11_health_check,
    wf_12_tenants_management,
]


def api_request(method, path, payload=None):
    url = f"{N8N_URL}/api/v1{path}"
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("X-N8N-API-KEY", N8N_KEY)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return e.code, {"error": body}


def find_existing(name):
    code, data = api_request("GET", f"/workflows?limit=200")
    for w in (data.get("data") or []):
        if w.get("name") == name:
            return w.get("id")
    return None


def upload(workflow_data):
    name = workflow_data["name"]
    existing = find_existing(name)
    if existing:
        code, res = api_request("PUT", f"/workflows/{existing}", workflow_data)
        return ("updated", existing, code, res)
    code, res = api_request("POST", "/workflows", workflow_data)
    return ("created", res.get("id"), code, res)


def main():
    out_dir = "/app/n8n-workflows"
    os.makedirs(out_dir, exist_ok=True)
    results = []
    for fn in WORKFLOW_BUILDERS:
        wf = fn()
        # Save JSON file
        fname = wf["name"].replace(" · ", "__").replace(" ", "_").replace("/", "_") + ".json"
        path = os.path.join(out_dir, fname)
        with open(path, "w") as f:
            json.dump(wf, f, indent=2, ensure_ascii=False)
        # Upload to n8n
        action, wid, code, res = upload(wf)
        ok = code in (200, 201)
        results.append((wf["name"], action, wid, code, ok, res if not ok else None))
        print(f"  {action:8} HTTP {code} id={wid}  {wf['name']}")
        if not ok:
            print(f"           ⚠ {json.dumps(res)[:200]}")

    print()
    print(f"Saved {len(results)} workflows in {out_dir}")
    ok_count = sum(1 for r in results if r[4])
    print(f"Upload OK: {ok_count}/{len(results)}")


if __name__ == "__main__":
    main()
