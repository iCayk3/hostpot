import assert from "node:assert/strict";
import test from "node:test";

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

test("renderiza o portal Conecta+", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Conecta\+/);
  assert.match(html, /Portal do visitante/);
  assert.match(html, /Administração/);
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
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || "admin" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);

  const activation = await request("/api/provisioning/activations", { method: "POST", headers: { cookie } });
  assert.equal(activation.status, 201);
  const payload = await activation.json();
  assert.match(payload.code, /^[A-F0-9]{6}$/);
  assert.match(payload.command, /conecta-bootstrap\.rsc/);
});
