export type Mode = "self" | "admin";

export type RouterConfig = {
  identity: string;
  wan: string;
  management: string;
  guests: string;
  guestSubnet: string;
  guestGateway: string;
  guestPool: string;
  managementAddress: string;
  dnsName: string;
  adminUser: string;
  adminPassword: string;
  rateLimit: string;
};

function quote(value: string) {
  return value.replace(/["\\\r\n]/g, "");
}

export function buildRouterScript(config: RouterConfig, mode: Mode) {
  const safe = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, quote(value)]),
  ) as RouterConfig;
  const guestPorts = safe.guests.split(",").map((port) => port.trim()).filter(Boolean);
  const profiles = [["5m", "5m"], ["10m", "10m"], ["15m", "15m"], ["30m", "30m"], ["60m", "1h"]];
  const managementNetwork = safe.managementAddress.split("/")[0].replace(/\.\d+$/, ".0") + "/24";
  const prefix = safe.guestSubnet.split("/")[1] || "24";

  return [
    "# Conecta+ | Configuracao automatica RouterOS 7",
    `# Modo: ${mode === "self" ? "visitante escolhe o tempo" : "administrador libera o tempo"}`,
    "# Gerado individualmente pelo servidor de provisionamento.",
    "",
    `/system identity set name=\"${safe.identity}\"`,
    ":if ([:len [/interface list find name=WAN]] = 0) do={/interface list add name=WAN comment=\"Conecta+\"}",
    `:if ([:len [/interface list member find list=WAN interface=${safe.wan}]] = 0) do={/interface list member add list=WAN interface=${safe.wan}}`,
    ":if ([:len [/interface bridge find name=bridge-hotspot]] = 0) do={/interface bridge add name=bridge-hotspot protocol-mode=rstp comment=\"Rede isolada de visitantes\"}",
    ...guestPorts.map((port) => `:if ([:len [/interface bridge port find interface=${port}]] = 0) do={/interface bridge port add bridge=bridge-hotspot interface=${port} horizon=1}`),
    `:if ([:len [/ip dhcp-client find interface=${safe.wan}]] = 0) do={/ip dhcp-client add interface=${safe.wan} disabled=no use-peer-dns=no comment=\"Internet\"}`,
    `/ip address remove [find comment=\"Conecta+ Gateway HotSpot\"]`,
    `/ip address add address=${safe.guestGateway}/${prefix} interface=bridge-hotspot comment=\"Conecta+ Gateway HotSpot\"`,
    `/ip address remove [find comment=\"Conecta+ Gerencia local\"]`,
    `/ip address add address=${safe.managementAddress} interface=${safe.management} comment=\"Conecta+ Gerencia local\"`,
    ":if ([:len [/ip pool find name=pool-hotspot]] > 0) do={/ip pool set [find name=pool-hotspot] ranges=" + safe.guestPool + "} else={/ip pool add name=pool-hotspot ranges=" + safe.guestPool + "}",
    ":if ([:len [/ip dhcp-server find name=dhcp-hotspot]] > 0) do={/ip dhcp-server set [find name=dhcp-hotspot] interface=bridge-hotspot address-pool=pool-hotspot lease-time=1h disabled=no} else={/ip dhcp-server add name=dhcp-hotspot interface=bridge-hotspot address-pool=pool-hotspot lease-time=1h disabled=no}",
    `/ip dhcp-server network remove [find comment=\"Conecta+\"]`,
    `/ip dhcp-server network add address=${safe.guestSubnet} gateway=${safe.guestGateway} dns-server=${safe.guestGateway} comment=\"Conecta+\"`,
    "/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8",
    ":if ([:len [/ip hotspot profile find name=conecta-hotspot]] > 0) do={/ip hotspot profile set [find name=conecta-hotspot] hotspot-address=" + safe.guestGateway + " dns-name=" + safe.dnsName + " html-directory=hotspot login-by=http-chap,cookie http-cookie-lifetime=1h} else={/ip hotspot profile add name=conecta-hotspot hotspot-address=" + safe.guestGateway + " dns-name=" + safe.dnsName + " html-directory=hotspot login-by=http-chap,cookie http-cookie-lifetime=1h}",
    ":if ([:len [/ip hotspot find name=hotspot-conecta]] > 0) do={/ip hotspot set [find name=hotspot-conecta] interface=bridge-hotspot address-pool=pool-hotspot profile=conecta-hotspot disabled=no} else={/ip hotspot add name=hotspot-conecta interface=bridge-hotspot address-pool=pool-hotspot profile=conecta-hotspot disabled=no}",
    ...profiles.map(([name, time]) => `:if ([:len [/ip hotspot user profile find name=conecta-${name}]] > 0) do={/ip hotspot user profile set [find name=conecta-${name}] session-timeout=${time} idle-timeout=2m keepalive-timeout=2m shared-users=${mode === "self" ? "200" : "1"} rate-limit=\"${safe.rateLimit}\" add-mac-cookie=no} else={/ip hotspot user profile add name=conecta-${name} session-timeout=${time} idle-timeout=2m keepalive-timeout=2m shared-users=${mode === "self" ? "200" : "1"} rate-limit=\"${safe.rateLimit}\" add-mac-cookie=no}`),
    ...(mode === "self" ? profiles.map(([name]) => `:if ([:len [/ip hotspot user find name=portal-${name}]] = 0) do={/ip hotspot user add name=portal-${name} password=Conecta${name} profile=conecta-${name} comment=\"Portal automatico\"}`) : []),
    "/ip firewall nat remove [find comment~\"^Conecta\\+\"]",
    "/ip firewall filter remove [find comment~\"^Conecta\\+\"]",
    "/ip firewall nat add chain=srcnat out-interface-list=WAN action=masquerade comment=\"Conecta+ NAT\"",
    "/ip firewall filter add chain=input connection-state=established,related action=accept comment=\"Conecta+ estabelecidas\"",
    "/ip firewall filter add chain=input connection-state=invalid action=drop comment=\"Conecta+ invalidas\"",
    "/ip firewall filter add chain=input protocol=icmp action=accept comment=\"Conecta+ diagnostico\"",
    `/ip firewall filter add chain=input in-interface=${safe.management} action=accept comment=\"Conecta+ gerencia dedicada\"`,
    "/ip firewall filter add chain=input in-interface=bridge-hotspot protocol=udp dst-port=53,67,68 action=accept comment=\"Conecta+ DNS DHCP\"",
    "/ip firewall filter add chain=input in-interface=bridge-hotspot protocol=tcp dst-port=53 action=accept comment=\"Conecta+ DNS TCP\"",
    "/ip firewall filter add chain=input action=drop comment=\"Conecta+ bloqueia roteador\"",
    "/ip firewall filter add chain=forward connection-state=established,related action=accept comment=\"Conecta+ forward estabelecidas\"",
    "/ip firewall filter add chain=forward connection-state=invalid action=drop comment=\"Conecta+ forward invalidas\"",
    "/ip firewall filter add chain=forward in-interface=bridge-hotspot out-interface-list=WAN action=accept comment=\"Conecta+ visitantes internet\"",
    "/ip firewall filter add chain=forward in-interface=bridge-hotspot action=drop comment=\"Conecta+ isola visitantes\"",
    "/ip firewall filter add chain=forward action=drop comment=\"Conecta+ bloqueio final\"",
    `:if ([:len [/user find name=${safe.adminUser}]] = 0) do={/user add name=${safe.adminUser} password=\"${safe.adminPassword}\" group=full address=${managementNetwork} comment=\"Administrador Conecta+\"} else={/user set [find name=${safe.adminUser}] password=\"${safe.adminPassword}\" address=${managementNetwork}}`,
    "/ip service disable telnet,ftp,www,api",
    `/ip service set winbox address=${managementNetwork}`,
    "/system clock set time-zone-name=America/Sao_Paulo",
    ":log info \"Conecta+: configuracao de rede concluida\"",
  ].join("\n");
}
