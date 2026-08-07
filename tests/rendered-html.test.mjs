import assert from "node:assert/strict";
import test from "node:test";

process.env.PUBLIC_BASE_URL = "https://localhost.example";
process.env.ACTIVATION_TOKEN_SECRET = "test-activation-secret-at-least-32-chars";
process.env.ADMIN_SESSION_SECRET = "test-session-secret-at-least-32-chars";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "test-admin-password-secure";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);

async function request(pathname = "/", init = {}) {
  const url = new URL(workerUrl);
  url.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(url.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html", ...(init.headers || {}) }, ...init }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renderiza o login administrativo Conecta+", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Conecta\+/);
  assert.match(html, /Carregando acesso seguro/);
  assert.doesNotMatch(html, /Portal do visitante/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});

test("expõe endpoint de saúde", async () => {
  const response = await request("/api/health");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.service, "conecta-mais-hotspot");
});

test("protege e cria ativações de provisionamento", async () => {
  const unauthorized = await request("/api/provisioning/devices");
  assert.equal(unauthorized.status, 401);

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME || "admin", password: process.env.ADMIN_PASSWORD || "admin" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);

  const activation = await request("/api/provisioning/activations", { method: "POST", headers: { cookie } });
  assert.equal(activation.status, 201);
  const payload = await activation.json();
  assert.match(payload.code, /^[A-F0-9]{6}$/);
  assert.match(payload.command, /conecta-bootstrap\.rsc/);

  const register = await request(`/api/provisioning/register/${payload.token}`, {
    method: "POST", headers: { "content-type": "text/plain" },
    body: "serial=TEST-SECURITY\nmodel=RB-Test\narchitecture=arm\nversion=7.20\nidentity=Teste\ninterfaces=ether1,ether2,ether3,ether4,ether5",
  });
  assert.equal(register.status, 200);
  const devicesResponse = await request("/api/provisioning/devices", { headers: { cookie } });
  const devicesPayload = await devicesResponse.json();
  const device = devicesPayload.devices.find((item) => item.serial === "TEST-SECURITY");
  assert.ok(device);
  const configure = await request(`/api/provisioning/devices/${device.id}/configure`, {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ mode: "self", config: { identity: "MK-CONNECTA-01", wan: "ether1", management: "ether2", guests: "ether3,ether4,ether5", guestSubnet: "10.50.0.0/24", guestGateway: "10.50.0.1", guestPool: "10.50.0.10-10.50.0.254", managementAddress: "192.168.99.1/24", dnsName: "wifi.conecta.local", adminUser: "conecta-admin", adminPassword: "Troque-Esta-Senha-2026", rateLimit: "10M/10M" } }),
  });
  assert.equal(configure.status, 200, await configure.text());
});
