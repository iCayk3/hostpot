# Conecta+ HotSpot

Portal de acesso Wi-Fi e painel de preparação de MikroTik. Esta versão contém a interface do visitante, os dois modos de liberação e o gerador inicial de scripts RouterOS 7.

## Executar com Docker

```bash
cp .env.example .env
docker compose up -d --build
```

A aplicação estará disponível em `http://localhost:3000`. O estado futuro do provisionamento será persistido no volume `conecta_data`.

Verifique a saúde do serviço:

```bash
curl http://localhost:3000/api/health
```

## Implantar como Stack no Portainer

1. Publique este diretório em um repositório GitHub.
2. No Portainer, abra **Stacks → Add stack → Repository**.
3. Informe a URL do repositório e use `docker-compose.yml` como caminho do Compose.
4. Cadastre as variáveis `PUBLIC_BASE_URL`, `APP_PORT`, `ACTIVATION_TOKEN_SECRET`, `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET`.
5. Faça o deploy da Stack.

O domínio público deverá apontar para um proxy reverso HTTPS, como Nginx Proxy Manager, Traefik ou Cloudflare Tunnel. O MikroTik deverá acessar `PUBLIC_BASE_URL` por HTTPS com certificado válido.

## Variáveis

| Variável | Finalidade |
| --- | --- |
| `APP_PORT` | Porta publicada no host, padrão `3000` |
| `PUBLIC_BASE_URL` | Endereço HTTPS público da aplicação |
| `ACTIVATION_TOKEN_SECRET` | Segredo usado futuramente nos códigos de ativação |
| `ADMIN_PASSWORD` | Senha para abrir o painel administrativo |
| `ADMIN_SESSION_SECRET` | Assinatura das sessões administrativas |
| `PROVISIONING_DATA_DIR` | Diretório interno persistente, configurado como `/data` |

Nunca publique o arquivo `.env`, senhas de roteadores, backups ou tokens no GitHub.

## Desenvolvimento local

Requer Node.js 22.13 ou superior.

```bash
npm install
npm run dev
npm run build
```

## Teste de bancada

1. Implante a Stack e confirme que `/api/health` responde com `status: ok`.
2. Entre em **Administração → Instalar MikroTik** usando `ADMIN_PASSWORD`.
3. Clique em **Gerar código de ativação** e copie o comando.
4. No MikroTik resetado, deixe a WAN com internet e execute o comando no terminal.
5. Aguarde o equipamento aparecer no painel, confira as interfaces e selecione-o.
6. Ajuste as portas, endereços e modo de acesso.
7. Clique em **Liberar instalação automática**.
8. Aguarde o estado mudar para **Instalado**.

Faça o primeiro teste com acesso físico ao equipamento. O firewall final permite gerenciamento somente pela porta e rede definidas no formulário.

## Estado atual

- Portal do visitante responsivo.
- Tempos de 5, 10, 15, 30 e 60 minutos na especificação do MikroTik.
- Modo automático e modo controlado pelo administrador.
- Gerador de script RouterOS 7 com DHCP, HotSpot, NAT e firewall.
- Imagem Docker e Stack para Portainer.
- Endpoint de saúde para monitoramento.
- Registro automático com código temporário e comando único.
- Detecção de modelo, serial, versão e interfaces.
- Banco SQLite persistente em `/data/conecta.db`.
- Entrega automática da configuração e confirmação da instalação.
- Painel administrativo protegido por senha e sessão assinada.
- Agente RouterOS permanente com telemetria a cada 15 segundos.
- Tela operacional separada em `/gestao`.
- Usuários vinculados somente aos MikroTiks autorizados em `/usuarios`.
- Sessões, hosts, contadores e históricos obtidos do banco, sem números demonstrativos.
- Fila de liberação real para 5, 10, 15, 30 ou 60 minutos.
