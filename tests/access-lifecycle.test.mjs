import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("../lib/operations-store.ts",import.meta.url),"utf8");

test("temporizadores de acesso começam no momento da criação",()=>{
  const release=source.match(/system scheduler add name=\$\{tag\} interval=\$\{minutes\}m[^\n]*/)?.[0]||"";
  const pix=source.match(/system scheduler add name=\$\{tag\} interval=2m[^\n]*/)?.[0]||"";
  assert.ok(release,"scheduler do plano não encontrado");
  assert.ok(pix,"scheduler da janela Pix não encontrado");
  assert.doesNotMatch(release,/start-time=startup/);
  assert.doesNotMatch(pix,/start-time=startup/);
});

test("expiração remove somente a regra identificada pela liberação",()=>{
  assert.match(source,/ip hotspot ip-binding find comment=\$\{tag\}/);
  assert.match(source,/ip hotspot ip-binding remove .*accessBinding/);
  assert.doesNotMatch(source,/acesso expirado[\s\S]{0,300}ip hotspot ip-binding remove \[find mac-address=\$\{expired\.mac\}\]/);
});

test("fim do plano devolve o dispositivo ao portal sem encerrar uma liberação nova",()=>{
  assert.match(source,/:local accessBinding \[\/ip hotspot ip-binding find comment=\$\{tag\}\]/);
  assert.match(source,/ip hotspot host remove \[find mac-address=\$\{safeMac\}\]/);
  assert.match(source,/UPDATE access_releases SET status='superseded'/);
});

test("comando exige confirmação do equipamento antes de iniciar o período",()=>{
  assert.match(source,/status='sent'/);
  assert.match(source,/command-ack/);
  assert.match(source,/UPDATE access_releases SET status='delivered',executed_at=/);
});
