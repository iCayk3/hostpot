"use client";

import { useEffect, useMemo, useState } from "react";
import { buildRouterScript, type Mode, type RouterConfig } from "@/lib/router-script";

type View = "portal" | "admin";
type AdminSection = "overview" | "sessions" | "setup";
type ProvisionedDevice = {
  id: string; code: string; serial: string; model: string; architecture: string; routerosVersion: string;
  identity: string; interfaces: string[]; status: string; lastSeen: string; installedAt: string | null;
};
type Activation = { code: string; command: string; expiresAt: string };

const durations = [
  { minutes: 5, label: "5 min", note: "Acesso rápido" },
  { minutes: 10, label: "10 min", note: "Pausa curta" },
  { minutes: 15, label: "15 min", note: "Uso essencial" },
  { minutes: 30, label: "30 min", note: "Mais escolhido" },
  { minutes: 60, label: "60 min", note: "Acesso estendido" },
];

export default function Home() {
  const [view, setView] = useState<View>("admin");
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const [mode, setMode] = useState<Mode>("self");
  const [duration, setDuration] = useState(30);
  const [customMinutes, setCustomMinutes] = useState(90);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [activation, setActivation] = useState<Activation | null>(null);
  const [devices, setDevices] = useState<ProvisionedDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [provisioningBusy, setProvisioningBusy] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginUsername,setLoginUsername]=useState("admin");
  const [authChecked,setAuthChecked]=useState(false);
  const [overviewData,setOverviewData]=useState<{totals:{routers:number;active:number;hosts:number;updated_at:string|null};sessions:Array<{identity:string;username:string;address:string;mac:string;uptime:string;time_left:string}>}>({totals:{routers:0,active:0,hosts:0,updated_at:null},sessions:[]});
  const [routerConfig, setRouterConfig] = useState<RouterConfig>({
    identity: "MK-CONNECTA-01", wan: "ether1", management: "ether2", guests: "ether3,ether4,ether5",
    guestSubnet: "10.50.0.0/24", guestGateway: "10.50.0.1", guestPool: "10.50.0.10-10.50.0.254",
    managementAddress: "192.168.99.1/24", dnsName: "wifi.conecta.local", adminUser: "conecta-admin",
    adminPassword: "Troque-Esta-Senha-2026", rateLimit: "10M/10M",
  });

  const selectedLabel = useMemo(() => {
    const preset = durations.find((item) => item.minutes === duration);
    if (preset) return preset.label;
    return duration < 60 ? `${duration} min` : `${Math.floor(duration / 60)}h ${duration % 60 ? `${duration % 60}min` : ""}`;
  }, [duration]);

  async function refreshDevices() {
    const response = await fetch("/api/provisioning/devices", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { devices: ProvisionedDevice[] };
    setDevices(payload.devices);
    if (!selectedDeviceId && payload.devices[0]) setSelectedDeviceId(payload.devices[0].id);
  }

  useEffect(() => {
    if (adminSection !== "setup") return;
    refreshDevices();
    const timer = window.setInterval(refreshDevices, 5000);
    return () => window.clearInterval(timer);
  }, [adminSection, selectedDeviceId]);
  useEffect(()=>{if(adminAuthenticated)refreshDevices()},[adminAuthenticated]);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()).then((payload: { authenticated: boolean }) => setAdminAuthenticated(payload.authenticated)).catch(() => {}).finally(()=>setAuthChecked(true));
  }, []);
  useEffect(()=>{if(view!=="admin"||!adminAuthenticated)return;const load=()=>fetch("/api/operations/overview",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(p=>p&&setOverviewData(p));load();const t=window.setInterval(load,10000);return()=>window.clearInterval(t)},[view,adminAuthenticated]);

  function openAdministration() {
    if (adminAuthenticated) return setView("admin");
    setLoginOpen(true);
  }

  async function submitAdminLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!loginPassword) return;
    setLoginBusy(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username:loginUsername,password: loginPassword }) });
      if (!response.ok){const operator=await fetch("/api/operations/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:loginUsername,password:loginPassword})});if(operator.ok){window.location.href="/gestao";return}return notify("Usuário ou senha inválidos.")}
      setAdminAuthenticated(true); setLoginOpen(false); setLoginPassword(""); setView("admin"); notify("Painel administrativo liberado.");
    } finally { setLoginBusy(false); }
  }

  async function logoutAdmin() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAdminAuthenticated(false);
    setLoginPassword("");
    setLoginUsername("admin");
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function startAccess() {
    setConnected(true);
    notify(`Internet liberada por ${selectedLabel}.`);
  }

  const routerScript = useMemo(() => buildRouterScript(routerConfig, mode), [routerConfig, mode]);

  function updateRouterConfig(field: keyof RouterConfig, value: string) {
    setRouterConfig((current) => ({ ...current, [field]: value }));
  }

  async function copyText(value: string) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Alguns navegadores negam a permissão mesmo em HTTPS; usa o fallback abaixo.
      }
    }

    const field = document.createElement("textarea");
    const activeElement = document.activeElement as HTMLElement | null;
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    field.style.top = "0";
    document.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      field.remove();
      activeElement?.focus();
    }
    return copied;
  }

  async function copyScript() {
    const copied = await copyText(routerScript);
    notify(copied ? "Script copiado para a área de transferência." : "O navegador bloqueou a cópia. Use Baixar .rsc.");
  }

  function downloadScript() {
    const blob = new Blob([routerScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `conecta-${mode === "self" ? "automatico" : "administrador"}.rsc`; link.click();
    URL.revokeObjectURL(url);
    notify("Arquivo de instalação gerado.");
  }

  async function createNewActivation() {
    setProvisioningBusy(true);
    try {
      const response = await fetch("/api/provisioning/activations", { method: "POST" });
      const raw = await response.text();
      let payload: Activation & { error?: string };
      try { payload = JSON.parse(raw) as Activation & { error?: string }; }
      catch { throw new Error(`O servidor respondeu com erro (${response.status}).`); }
      if (!response.ok) throw new Error(payload.error || "Não foi possível criar a ativação.");
      setActivation(payload);
      notify("Código de ativação criado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Falha ao criar ativação.");
    } finally { setProvisioningBusy(false); }
  }

  async function copyActivationCommand() {
    if (!activation) return;
    const copied = await copyText(activation.command);
    notify(copied ? "Comando de vínculo copiado." : "O navegador bloqueou a cópia. Selecione o comando manualmente.");
  }

  function useDetectedInterfaces(device: ProvisionedDevice) {
    const physical = device.interfaces.filter((name) => /^(ether|sfp|wifi|wlan)/i.test(name));
    setRouterConfig((current) => ({
      ...current,
      identity: `MK-CONNECTA-${device.serial.slice(-4).toUpperCase()}`,
      wan: physical[0] || current.wan,
      management: physical[1] || current.management,
      guests: physical.slice(2).join(",") || current.guests,
    }));
    setSelectedDeviceId(device.id);
    notify("Interfaces detectadas aplicadas ao formulário.");
  }

  async function sendConfiguration() {
    if (!selectedDeviceId) return notify("Selecione um MikroTik detectado.");
    setProvisioningBusy(true);
    try {
      const response = await fetch(`/api/provisioning/devices/${selectedDeviceId}/configure`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: routerConfig, mode }),
      });
      if (!response.ok) {const payload=await response.json().catch(()=>({})) as {error?:string};throw new Error(payload.error||"Não foi possível liberar a configuração.");}
      notify("Configuração liberada. O MikroTik instalará em até 30 segundos.");
      await refreshDevices();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Falha no provisionamento.");
    } finally { setProvisioningBusy(false); }
  }

  async function saveAccessMode(){if(!selectedDeviceId)return notify("Selecione o MikroTik que receberá esta configuração.");setProvisioningBusy(true);try{const response=await fetch(`/api/provisioning/devices/${selectedDeviceId}/mode`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode})});if(!response.ok)throw new Error("Não foi possível alterar o modo.");notify("Modo salvo e atualização enviada ao MikroTik. Aguarde até 15 segundos.");await refreshDevices()}catch(error){notify(error instanceof Error?error.message:"Falha ao alterar o modo.")}finally{setProvisioningBusy(false)}}

  if(!authChecked)return <main className="ops-login"><p>Carregando acesso seguro...</p></main>;
  if(!adminAuthenticated)return <main className="ops-login"><form onSubmit={submitAdminLogin}><span className="brand-mark"><i/><i/><i/></span><span className="eyebrow">ACESSO AO SISTEMA</span><h1>Entrar no Conecta+</h1><p>Administradores acessam a configuração; usuários são direcionados aos MikroTiks permitidos.</p><label>USUÁRIO<input value={loginUsername} onChange={e=>setLoginUsername(e.target.value)} autoFocus autoComplete="username"/></label><label>SENHA<input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} autoComplete="current-password"/></label><button disabled={loginBusy||!loginUsername||!loginPassword}>{loginBusy?"Entrando...":"Entrar →"}</button></form></main>;
  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" aria-label="Conecta+ administração">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>Conecta<span>+</span></span>
        </button>
        <nav className="view-switch" aria-label="Navegação principal">
          <button className="active">Administração</button>
          <button onClick={()=>window.location.href="/gestao"}>Painel operacional</button>
        </nav>
        <span className="network-pill"><i /> Rede online</span>
      </header>

      {view === "portal" ? (
        <section className="portal-view">
          <div className="ambient ambient-one" /><div className="ambient ambient-two" />
          <div className="portal-copy">
            <span className="eyebrow">Wi-Fi de cortesia</span>
            <h1>Você chegou.<br /><em>Fique à vontade.</em></h1>
            <p>Conecte-se em poucos segundos e aproveite uma internet rápida, segura e por sua conta.</p>
            <div className="trust-row"><span>✓ Sem cadastro</span><span>✓ Conexão segura</span><span>✓ Acesso imediato</span></div>
          </div>

          <div className="access-card">
            {!connected ? (
              <>
                <div className="card-heading">
                  <span className="step">01</span>
                  <div><h2>{mode === "self" ? "Quanto tempo você precisa?" : "Solicite seu acesso"}</h2><p>{mode === "self" ? "Escolha uma opção para continuar." : "A equipe vai liberar o tempo para este dispositivo."}</p></div>
                </div>
                {mode === "self" ? (
                  <div className="duration-grid">
                    {durations.map((item) => (
                      <button key={item.minutes} className={duration === item.minutes ? "selected" : ""} onClick={() => setDuration(item.minutes)}>
                        <span>{item.label}</span><small>{item.note}</small>{duration === item.minutes && <b>✓</b>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="request-box">
                    <span className="device-icon">⌁</span>
                    <div><strong>Este dispositivo está aguardando</strong><small>Identificação: 7C:8B:CA:••:42:11</small></div>
                    <span className="waiting">Aguardando</span>
                  </div>
                )}
                <label className="terms"><input type="checkbox" defaultChecked /> <span>Li e concordo com os <u>termos de uso</u> da rede.</span></label>
                <button className="primary-action" onClick={mode === "self" ? startAccess : () => notify("Solicitação enviada para a equipe.")}>
                  {mode === "self" ? <>Conectar por {selectedLabel} <span>→</span></> : <>Solicitar liberação <span>→</span></>}
                </button>
                <p className="privacy">Seus dados de navegação não são armazenados.</p>
              </>
            ) : (
              <div className="success-state">
                <span className="success-icon">✓</span><span className="eyebrow">Conexão liberada</span>
                <h2>Você está online.</h2><p>Aproveite sua conexão. O acesso ficará disponível neste dispositivo.</p>
                <div className="time-left"><small>Tempo restante</small><strong>{selectedLabel}</strong><div><i style={{ width: "100%" }} /></div></div>
                <button className="secondary-action" onClick={() => setConnected(false)}>Encerrar demonstração</button>
              </div>
            )}
          </div>
          <p className="powered">Gerenciado por <strong>Conecta+</strong> · suporte@conectamais.com.br</p>
        </section>
      ) : (
        <section className="admin-view">
          <aside className="admin-sidebar">
            <div><span className="sidebar-label">GESTÃO DA REDE</span><button className={adminSection === "overview" ? "side-active" : ""} onClick={() => setAdminSection("overview")}>⌂ <span>Visão geral</span></button><button className={adminSection === "sessions" ? "side-active" : ""} onClick={() => setAdminSection("sessions")}>◷ <span>Sessões ativas</span></button><button className={adminSection === "setup" ? "side-active" : ""} onClick={() => setAdminSection("setup")}>⚙ <span>Instalar MikroTik</span></button><button onClick={()=>window.location.href="/usuarios"}>♙ <span>Usuários e permissões</span></button><button onClick={()=>window.location.href="/gestao"}>↗ <span>Painel operacional</span></button></div>
            <div className="admin-user"><span>AD</span><div><strong>Administrador</strong><small>{loginUsername}</small></div><button type="button" onClick={logoutAdmin}>Sair</button></div>
          </aside>
          <div className="admin-content">
            {adminSection !== "setup" ? <>
            {adminSection === "overview" && <>
            <div className="admin-title"><div><span className="eyebrow">PAINEL DE CONTROLE</span><h1>Painel do administrador</h1><p>Acompanhe e controle os acessos da sua rede.</p></div><button className="outline-button" onClick={() => notify("Dados atualizados.")}>↻ Atualizar dados</button></div>
            <div className="stats-grid">
              <article><span className="stat-icon green">↗</span><small>Conectados agora</small><strong>{overviewData.totals.active}</strong><em>Telemetria real dos roteadores</em></article>
              <article><span className="stat-icon blue">◷</span><small>MikroTiks cadastrados</small><strong>{overviewData.totals.routers}</strong><em>{overviewData.totals.updated_at?`Atualizado ${new Date(overviewData.totals.updated_at).toLocaleTimeString("pt-BR")}`:"Sem telemetria"}</em></article>
              <article><span className="stat-icon orange">⌁</span><small>Hosts aguardando</small><strong>{overviewData.totals.hosts}</strong><em>Dados recebidos do HotSpot</em></article>
            </div>

            <div className="control-grid">
              <article className="mode-card">
                <div className="section-heading"><div><h2>Modo de liberação</h2><p>Defina como o tempo de internet será concedido.</p></div><span className="live-dot">● Configuração ativa</span></div>
                <div className="mode-options">
                  <button className={mode === "self" ? "selected" : ""} onClick={() => setMode("self")}><span className="radio" /><div><strong>Visitante escolhe o tempo</strong><small>As opções de duração aparecem no portal de acesso.</small></div><b>Automático</b></button>
                  <button className={mode === "admin" ? "selected" : ""} onClick={() => setMode("admin")}><span className="radio" /><div><strong>Administrador libera o tempo</strong><small>Cada novo dispositivo aguarda sua aprovação.</small></div><b>Controle total</b></button>
                </div>
                <div className="mode-footer"><select aria-label="MikroTik que receberá o modo" value={selectedDeviceId} onChange={e=>setSelectedDeviceId(e.target.value)}><option value="">Selecione o MikroTik</option>{devices.map(device=><option key={device.id} value={device.id}>{device.identity} · {device.model}</option>)}</select><span>A alteração será enviada ao equipamento selecionado.</span><button disabled={provisioningBusy||!selectedDeviceId} onClick={saveAccessMode}>{provisioningBusy?"Enviando...":"Salvar configuração"}</button></div>
              </article>

              <article className="quick-release">
                <div className="section-heading"><div><h2>Painel operacional</h2><p>Liberações reais são feitas na área separada por usuário e MikroTik.</p></div></div>
                <div className="request-box"><span className="device-icon">⌁</span><div><strong>Acesso com permissão individual</strong><small>Somente equipamentos autorizados aparecem para cada operador.</small></div></div>
                <button onClick={() => window.location.href="/gestao"}>Abrir gestão de acessos <span>→</span></button>
              </article>
            </div>

            </>}
            {adminSection === "sessions" && <div className="admin-title"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h1>Sessões ativas</h1><p>Consulte e gerencie os dispositivos conectados neste momento.</p></div><button className="outline-button" onClick={() => notify("Sessões atualizadas.")}>↻ Atualizar sessões</button></div>}
            <article className="sessions-card" id="sessoes-ativas">
              <div className="section-heading"><div><h2>Sessões ativas</h2><p>Dispositivos conectados à rede neste momento.</p></div>{adminSection === "overview" && <button className="text-button" onClick={() => setAdminSection("sessions")}>Ver todas →</button>}</div>
              <div className="session-table">
                <div className="table-row table-head"><span>DISPOSITIVO</span><span>IDENTIFICAÇÃO</span><span>TEMPO RESTANTE</span><span>STATUS</span><span /></div>
                {overviewData.sessions.length===0?<div className="empty">Nenhuma sessão recebida dos MikroTiks.</div>:overviewData.sessions.map((session) => <div className="table-row" key={`${session.identity}-${session.mac}`}><span><i className="device-dot">⌁</i><strong>{session.username||session.identity}</strong></span><span>{session.mac}</span><span>{session.time_left||session.uptime||"—"}</span><span><b className="status-active">Ativo</b></span><span><button onClick={() => notify(`${session.identity} · ${session.address}`)} aria-label={`Detalhes de ${session.mac}`}>•••</button></span></div>)}
              </div>
            </article>
            </> : <section className="setup-page">
              <div className="admin-title"><div><span className="eyebrow">IMPLANTAÇÃO GUIADA</span><h1>Configurar novo MikroTik</h1><p>Gere uma instalação completa para RouterOS 7 resetado, com HotSpot e firewall.</p></div><span className="setup-badge">● Script pronto para revisão</span></div>
              <article className="activation-panel">
                <div className="activation-intro"><span className="activation-number">01</span><div><h2>Vincular equipamento</h2><p>Deixe o MikroTik com internet e cole um único comando no terminal.</p></div></div>
                {!activation ? <button className="activation-create" onClick={createNewActivation} disabled={provisioningBusy}>{provisioningBusy ? "Gerando..." : "Gerar código de ativação"}</button> : <div className="activation-ready">
                  <div className="activation-code"><small>CÓDIGO TEMPORÁRIO</small><strong>{activation.code}</strong><span>Expira em 30 minutos</span></div>
                  <code>{activation.command}</code>
                  <button type="button" onClick={copyActivationCommand}>Copiar comando</button>
                </div>}
              </article>
              <article className="detected-card">
                <div className="section-heading"><div><h2>Equipamentos detectados</h2><p>A lista é atualizada automaticamente a cada cinco segundos.</p></div><button className="text-button" onClick={refreshDevices}>Atualizar agora ↻</button></div>
                {devices.length === 0 ? <div className="empty-device"><span>⌁</span><div><strong>Aguardando o primeiro MikroTik</strong><small>Gere o código acima e execute o comando no equipamento conectado à internet.</small></div></div> : <div className="device-list">{devices.map((device) => <button key={device.id} className={selectedDeviceId === device.id ? "selected" : ""} onClick={() => useDetectedInterfaces(device)}>
                  <span className={`device-state ${device.status}`} />
                  <div><strong>{device.model}</strong><small>{device.identity} · Serial {device.serial}</small></div>
                  <span>RouterOS {device.routerosVersion}</span><span>{device.interfaces.length} interfaces</span>
                  <b>{device.status === "installed" ? "Instalado" : device.status === "ready" ? "Instalando" : "Detectado"}</b>
                </button>)}</div>}
              </article>
              <div className="safety-banner"><strong>Antes de aplicar</strong><p>Conecte-se fisicamente à porta de gerenciamento e confirme os nomes das interfaces. O script pressupõe um equipamento resetado sem configuração padrão.</p></div>
              <div className="setup-layout">
                <article className="setup-form-card">
                  <div className="section-heading"><div><h2>1. Identificação e modo</h2><p>Esses dados personalizam a implantação.</p></div></div>
                  <div className="form-grid">
                    <label>IDENTIDADE DO ROTEADOR<input value={routerConfig.identity} onChange={(e) => updateRouterConfig("identity", e.target.value)} /></label>
                    <label>MODO DE ACESSO<select value={mode} onChange={(e) => setMode(e.target.value as Mode)}><option value="self">Visitante escolhe o tempo</option><option value="admin">Administrador libera</option></select></label>
                  </div>
                  <div className="setup-divider" />
                  <div className="section-heading"><div><h2>2. Interfaces físicas</h2><p>Mantenha internet, gerenciamento e visitantes separados.</p></div></div>
                  <div className="form-grid three">
                    <label>PORTA DE INTERNET<input value={routerConfig.wan} onChange={(e) => updateRouterConfig("wan", e.target.value)} /></label>
                    <label>PORTA DE GERENCIAMENTO<input value={routerConfig.management} onChange={(e) => updateRouterConfig("management", e.target.value)} /></label>
                    <label>PORTAS DOS VISITANTES<input value={routerConfig.guests} onChange={(e) => updateRouterConfig("guests", e.target.value)} /></label>
                  </div>
                  <div className="setup-divider" />
                  <div className="section-heading"><div><h2>3. Endereçamento</h2><p>Rede isolada usada exclusivamente pelo HotSpot.</p></div></div>
                  <div className="form-grid three">
                    <label>REDE HOTSPOT<input value={routerConfig.guestSubnet} onChange={(e) => updateRouterConfig("guestSubnet", e.target.value)} /></label>
                    <label>GATEWAY<input value={routerConfig.guestGateway} onChange={(e) => updateRouterConfig("guestGateway", e.target.value)} /></label>
                    <label>FAIXA DHCP<input value={routerConfig.guestPool} onChange={(e) => updateRouterConfig("guestPool", e.target.value)} /></label>
                    <label>IP DE GERENCIAMENTO<input value={routerConfig.managementAddress} onChange={(e) => updateRouterConfig("managementAddress", e.target.value)} /></label>
                    <label>DOMÍNIO DO PORTAL<input value={routerConfig.dnsName} onChange={(e) => updateRouterConfig("dnsName", e.target.value)} /></label>
                    <label>VELOCIDADE POR USUÁRIO<input value={routerConfig.rateLimit} onChange={(e) => updateRouterConfig("rateLimit", e.target.value)} /></label>
                  </div>
                  <div className="setup-divider" />
                  <div className="section-heading"><div><h2>4. Acesso administrativo</h2><p>Válido somente pela porta dedicada de gerenciamento.</p></div></div>
                  <div className="form-grid">
                    <label>USUÁRIO<input value={routerConfig.adminUser} onChange={(e) => updateRouterConfig("adminUser", e.target.value)} /></label>
                    <label>SENHA INICIAL<input type="password" value={routerConfig.adminPassword} onChange={(e) => updateRouterConfig("adminPassword", e.target.value)} /></label>
                  </div>
                  <button className="provision-button" onClick={sendConfiguration} disabled={!selectedDeviceId || provisioningBusy}>{provisioningBusy ? "Enviando..." : selectedDeviceId ? "Liberar instalação automática →" : "Aguardando equipamento detectado"}</button>
                </article>
                <aside className="script-card">
                  <div className="script-head"><div><span>ROUTEROS 7</span><strong>conecta-{mode === "self" ? "automatico" : "administrador"}.rsc</strong></div><span className="script-lines">{routerScript.split("\n").length} linhas</span></div>
                  <pre>{routerScript}</pre>
                  <div className="script-actions"><button type="button" className="copy-button" onClick={copyScript}>Copiar script</button><button type="button" className="download-button" onClick={downloadScript}>Baixar .rsc ↓</button></div>
                </aside>
              </div>
              <article className="install-steps"><div><span>01</span><strong>Internet e comando</strong><small>O técnico deixa a WAN online e cola o comando de vínculo.</small></div><i>→</i><div><span>02</span><strong>Servidor configura</strong><small>Escolha as portas e libere a instalação pelo painel.</small></div><i>→</i><div><span>03</span><strong>Confirmação automática</strong><small>O equipamento instala, remove o agente e confirma o resultado.</small></div></article>
            </section>}
          </div>
        </section>
      )}
      {loginOpen && <div className="login-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
        <form className="login-modal" onSubmit={submitAdminLogin} role="dialog" aria-modal="true" aria-labelledby="login-title">
          <button type="button" className="login-close" onClick={() => setLoginOpen(false)} aria-label="Fechar login">×</button>
          <span className="brand-mark"><i /><i /><i /></span>
          <span className="eyebrow">ÁREA PROTEGIDA</span>
          <h2 id="login-title">Acessar administração</h2>
          <p>Informe a senha configurada no servidor.</p>
          <label>SENHA ADMINISTRATIVA<input autoFocus type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" /></label>
          <button type="submit" disabled={loginBusy || !loginPassword}>{loginBusy ? "Entrando..." : "Entrar no painel →"}</button>
        </form>
      </div>}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
