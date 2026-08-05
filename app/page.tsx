"use client";

import { useMemo, useState } from "react";

type Mode = "self" | "admin";
type View = "portal" | "admin";
type AdminSection = "overview" | "setup";

type RouterConfig = {
  identity: string; wan: string; management: string; guests: string;
  guestSubnet: string; guestGateway: string; guestPool: string;
  managementAddress: string; dnsName: string; adminUser: string; adminPassword: string;
  rateLimit: string;
};

function buildRouterScript(config: RouterConfig, mode: Mode) {
  const guestPorts = config.guests.split(",").map((port) => port.trim()).filter(Boolean);
  const profiles = [["5m","5m"],["10m","10m"],["15m","15m"],["30m","30m"],["60m","1h"]];
  const lines = [
    "# Conecta+ | Instalacao RouterOS 7 em equipamento resetado sem configuracao padrao",
    `# Modo: ${mode === "self" ? "visitante escolhe o tempo" : "administrador libera o tempo"}`,
    "# Revise os nomes das interfaces antes de importar. Mantenha acesso fisico ao equipamento.",
    "",
    `/system identity set name=\"${config.identity}\"`,
    "/interface list add name=WAN comment=\"Conecta+\"",
    `/interface list member add list=WAN interface=${config.wan}`,
    "/interface bridge add name=bridge-hotspot protocol-mode=rstp comment=\"Rede isolada de visitantes\"",
    ...guestPorts.map((port) => `/interface bridge port add bridge=bridge-hotspot interface=${port} horizon=1`),
    `/ip dhcp-client add interface=${config.wan} disabled=no use-peer-dns=no comment=\"Internet\"`,
    `/ip address add address=${config.guestGateway}/${config.guestSubnet.split("/")[1] || "24"} interface=bridge-hotspot comment=\"Gateway HotSpot\"`,
    `/ip address add address=${config.managementAddress} interface=${config.management} comment=\"Gerencia local\"`,
    "/ip pool add name=pool-hotspot ranges=" + config.guestPool,
    "/ip dhcp-server add name=dhcp-hotspot interface=bridge-hotspot address-pool=pool-hotspot lease-time=1h disabled=no",
    `/ip dhcp-server network add address=${config.guestSubnet} gateway=${config.guestGateway} dns-server=${config.guestGateway}`,
    "/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8",
    `/ip hotspot profile add name=conecta-hotspot hotspot-address=${config.guestGateway} dns-name=${config.dnsName} html-directory=hotspot login-by=http-chap,cookie http-cookie-lifetime=1h`,
    "/ip hotspot add name=hotspot-conecta interface=bridge-hotspot address-pool=pool-hotspot profile=conecta-hotspot disabled=no",
    ...profiles.map(([name,time]) => `/ip hotspot user profile add name=conecta-${name} session-timeout=${time} idle-timeout=2m keepalive-timeout=2m shared-users=${mode === "self" ? "200" : "1"} rate-limit=\"${config.rateLimit}\" add-mac-cookie=no`),
    ...(mode === "self" ? profiles.map(([name]) => `/ip hotspot user add name=portal-${name} password=Conecta${name} profile=conecta-${name} comment=\"Portal automatico\"`) : []),
    "/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade comment=\"Conecta+ NAT\"",
    "/ip firewall filter add chain=input connection-state=established,related action=accept comment=\"Conecta+ estabelecidas\"",
    "/ip firewall filter add chain=input connection-state=invalid action=drop comment=\"Conecta+ invalidas\"",
    "/ip firewall filter add chain=input protocol=icmp action=accept comment=\"Conecta+ diagnostico\"",
    `/ip firewall filter add chain=input in-interface=${config.management} action=accept comment=\"Conecta+ gerencia somente porta dedicada\"`,
    "/ip firewall filter add chain=input in-interface=bridge-hotspot protocol=udp dst-port=53,67,68 action=accept comment=\"Conecta+ DNS DHCP\"",
    "/ip firewall filter add chain=input in-interface=bridge-hotspot protocol=tcp dst-port=53 action=accept comment=\"Conecta+ DNS TCP\"",
    "/ip firewall filter add chain=input action=drop comment=\"Conecta+ bloqueia acesso ao roteador\"",
    "/ip firewall filter add chain=forward connection-state=established,related action=accept comment=\"Conecta+ forward estabelecidas\"",
    "/ip firewall filter add chain=forward connection-state=invalid action=drop comment=\"Conecta+ forward invalidas\"",
    "/ip firewall filter add chain=forward in-interface=bridge-hotspot out-interface-list=WAN action=accept comment=\"Conecta+ visitantes para internet\"",
    "/ip firewall filter add chain=forward in-interface=bridge-hotspot action=drop comment=\"Conecta+ isola visitantes da rede interna\"",
    "/ip firewall filter add chain=forward action=drop comment=\"Conecta+ bloqueio final\"",
    `/user add name=${config.adminUser} password=\"${config.adminPassword}\" group=full address=${config.managementAddress.split("/")[0].replace(/\.1$/, ".0")}/24 comment=\"Administrador Conecta+\"`,
    "/ip service disable telnet,ftp,www,api",
    `/ip service set winbox address=${config.managementAddress.split("/")[0].replace(/\.1$/, ".0")}/24`,
    "/system clock set time-zone-name=America/Sao_Paulo",
    ":log info \"Conecta+: configuracao concluida. Envie a pasta hotspot personalizada em Files.\"",
  ];
  return lines.join("\n");
}

const durations = [
  { minutes: 30, label: "30 min", note: "Acesso rápido" },
  { minutes: 60, label: "1 hora", note: "Mais escolhido" },
  { minutes: 120, label: "2 horas", note: "Para ficar à vontade" },
  { minutes: 240, label: "4 horas", note: "Dia inteiro" },
];

const initialSessions = [
  { device: "iPhone de Marina", mac: "A4:83:E7:••:91:2B", time: "1h 42min", status: "Ativo" },
  { device: "Galaxy A55", mac: "6C:5A:B0:••:3F:18", time: "48min", status: "Ativo" },
  { device: "Notebook Lenovo", mac: "D8:12:65:••:C4:09", time: "12min", status: "Expirando" },
];

export default function Home() {
  const [view, setView] = useState<View>("portal");
  const [adminSection, setAdminSection] = useState<AdminSection>("overview");
  const [mode, setMode] = useState<Mode>("self");
  const [duration, setDuration] = useState(60);
  const [customMinutes, setCustomMinutes] = useState(90);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState("");
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

  async function copyScript() {
    await navigator.clipboard.writeText(routerScript);
    notify("Script copiado para a área de transferência.");
  }

  function downloadScript() {
    const blob = new Blob([routerScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `conecta-${mode === "self" ? "automatico" : "administrador"}.rsc`; link.click();
    URL.revokeObjectURL(url);
    notify("Arquivo de instalação gerado.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("portal")} aria-label="Ir para o portal">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>Conecta<span>+</span></span>
        </button>
        <nav className="view-switch" aria-label="Navegação principal">
          <button className={view === "portal" ? "active" : ""} onClick={() => setView("portal")}>Portal do visitante</button>
          <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>Administração</button>
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
            <div><span className="sidebar-label">GESTÃO DA REDE</span><button className={adminSection === "overview" ? "side-active" : ""} onClick={() => setAdminSection("overview")}>⌂ <span>Visão geral</span></button><button>◷ <span>Sessões ativas</span></button><button className={adminSection === "setup" ? "side-active" : ""} onClick={() => setAdminSection("setup")}>⚙ <span>Instalar MikroTik</span></button></div>
            <div className="admin-user"><span>JS</span><div><strong>João Silva</strong><small>Administrador</small></div></div>
          </aside>
          <div className="admin-content">
            {adminSection === "overview" ? <>
            <div className="admin-title"><div><span className="eyebrow">PAINEL DE CONTROLE</span><h1>Boa tarde, João.</h1><p>Acompanhe e controle os acessos da sua rede.</p></div><button className="outline-button" onClick={() => notify("Dados atualizados.")}>↻ Atualizar dados</button></div>
            <div className="stats-grid">
              <article><span className="stat-icon green">↗</span><small>Conectados agora</small><strong>24</strong><em>+8% na última hora</em></article>
              <article><span className="stat-icon blue">◷</span><small>Acessos hoje</small><strong>186</strong><em>Tempo médio: 1h 18min</em></article>
              <article><span className="stat-icon orange">⌁</span><small>Aguardando liberação</small><strong>{mode === "admin" ? 3 : 0}</strong><em>{mode === "admin" ? "Requer sua atenção" : "Modo automático ativo"}</em></article>
            </div>

            <div className="control-grid">
              <article className="mode-card">
                <div className="section-heading"><div><h2>Modo de liberação</h2><p>Defina como o tempo de internet será concedido.</p></div><span className="live-dot">● Configuração ativa</span></div>
                <div className="mode-options">
                  <button className={mode === "self" ? "selected" : ""} onClick={() => setMode("self")}><span className="radio" /><div><strong>Visitante escolhe o tempo</strong><small>As opções de duração aparecem no portal de acesso.</small></div><b>Automático</b></button>
                  <button className={mode === "admin" ? "selected" : ""} onClick={() => setMode("admin")}><span className="radio" /><div><strong>Administrador libera o tempo</strong><small>Cada novo dispositivo aguarda sua aprovação.</small></div><b>Controle total</b></button>
                </div>
                <div className="mode-footer"><span>Alterações afetam apenas novas conexões.</span><button onClick={() => notify("Modo de acesso salvo com sucesso.")}>Salvar configuração</button></div>
              </article>

              <article className="quick-release">
                <div className="section-heading"><div><h2>Liberação rápida</h2><p>Conceda acesso a um dispositivo.</p></div></div>
                <label>DISPOSITIVO / MAC<input defaultValue="7C:8B:CA:42:11" /></label>
                <label>TEMPO DE ACESSO<select value={customMinutes} onChange={(e) => setCustomMinutes(Number(e.target.value))}><option value={30}>30 minutos</option><option value={60}>1 hora</option><option value={90}>1 hora e 30 minutos</option><option value={120}>2 horas</option><option value={240}>4 horas</option></select></label>
                <button onClick={() => notify(`Acesso liberado por ${customMinutes} minutos.`)}>Liberar acesso <span>→</span></button>
              </article>
            </div>

            <article className="sessions-card">
              <div className="section-heading"><div><h2>Sessões ativas</h2><p>Dispositivos conectados à rede neste momento.</p></div><button className="text-button">Ver todas →</button></div>
              <div className="session-table">
                <div className="table-row table-head"><span>DISPOSITIVO</span><span>IDENTIFICAÇÃO</span><span>TEMPO RESTANTE</span><span>STATUS</span><span /></div>
                {initialSessions.map((session) => <div className="table-row" key={session.mac}><span><i className="device-dot">⌁</i><strong>{session.device}</strong></span><span>{session.mac}</span><span>{session.time}</span><span><b className={session.status === "Ativo" ? "status-active" : "status-warning"}>{session.status}</b></span><span><button aria-label={`Opções para ${session.device}`}>•••</button></span></div>)}
              </div>
            </article>
            </> : <section className="setup-page">
              <div className="admin-title"><div><span className="eyebrow">IMPLANTAÇÃO GUIADA</span><h1>Configurar novo MikroTik</h1><p>Gere uma instalação completa para RouterOS 7 resetado, com HotSpot e firewall.</p></div><span className="setup-badge">● Script pronto para revisão</span></div>
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
                </article>
                <aside className="script-card">
                  <div className="script-head"><div><span>ROUTEROS 7</span><strong>conecta-{mode === "self" ? "automatico" : "administrador"}.rsc</strong></div><span className="script-lines">{routerScript.split("\n").length} linhas</span></div>
                  <pre>{routerScript}</pre>
                  <div className="script-actions"><button className="copy-button" onClick={copyScript}>Copiar script</button><button className="download-button" onClick={downloadScript}>Baixar .rsc ↓</button></div>
                </aside>
              </div>
              <article className="install-steps"><div><span>01</span><strong>Resetar sem configuração padrão</strong><small>Use System → Reset Configuration e marque “No Default Configuration”.</small></div><i>→</i><div><span>02</span><strong>Importar o arquivo</strong><small>Envie o .rsc em Files e execute /import file-name=arquivo.rsc.</small></div><i>→</i><div><span>03</span><strong>Enviar a pasta hotspot</strong><small>Substitua os arquivos visuais e teste os cinco tempos.</small></div></article>
            </section>}
          </div>
        </section>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
