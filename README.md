# Conecta+ HotSpot

Portal de acesso Wi-Fi e painel de preparação de MikroTik. Esta versão contém a interface do visitante, os dois modos de liberação e o gerador inicial de scripts RouterOS 7.

## Executar com Docker

```bash
cp .env.example .env
docker compose up -d --build
```

A aplicação estará disponível em `http://localhost` (porta 80). O estado do provisionamento é persistido no volume `conecta_data`.

O container escuta diretamente na porta 80, sem tradução ou publicação de portas. A Stack cria automaticamente uma rede bridge própria. Informe a rede e a máscara em `DOCKER_NETWORK_SUBNET` e o IP fixo do container em `DOCKER_STATIC_IP`. Por exemplo: sub-rede `10.12.0.0/24` e IP `10.12.0.205`. Se não informar, serão usados `conecta-mais-network`, `172.30.250.0/24` e `172.30.250.10`.
O processo permanece no usuário restrito `node`. O container permite portas não privilegiadas a partir de 0, possibilitando escutar na porta 80 sem executar a aplicação como root.

Verifique a saúde do serviço:

```bash
curl http://localhost/api/health
```

## Implantar como Stack no Portainer

1. Publique este diretório em um repositório GitHub.
2. No Portainer, abra **Stacks → Add stack → Repository**.
3. Informe a URL do repositório e use `docker-compose.yml` como caminho do Compose.
4. Cadastre `PUBLIC_BASE_URL`, `ACTIVATION_TOKEN_SECRET`, `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET`. `DOCKER_NETWORK_NAME`, `DOCKER_NETWORK_SUBNET` e `DOCKER_STATIC_IP` possuem valores padrão e podem ser personalizados.
5. Faça o deploy da Stack.

O domínio público deverá apontar para um proxy reverso HTTPS, como Nginx Proxy Manager, Traefik ou Cloudflare Tunnel. O MikroTik deverá acessar `PUBLIC_BASE_URL` por HTTPS com certificado válido.

## Variáveis

| Variável | Finalidade |
| --- | --- |
| `ADMIN_USERNAME` | Usuário administrador, padrão `admin` |
| `DOCKER_NETWORK_NAME` | Nome da rede criada pela Stack, padrão `conecta-mais-network` |
| `DOCKER_NETWORK_SUBNET` | Rede e máscara em CIDR, padrão `172.30.250.0/24` |
| `DOCKER_STATIC_IP` | IP fixo reservado ao container, padrão `172.30.250.10` |
| `PUBLIC_BASE_URL` | Endereço HTTPS público da aplicação |
| `ACTIVATION_TOKEN_SECRET` | Segredo usado futuramente nos códigos de ativação |
| `ADMIN_PASSWORD` | Senha para abrir o painel administrativo |
| `ADMIN_SESSION_SECRET` | Assinatura das sessões administrativas |
| `PROVISIONING_DATA_DIR` | Diretório interno persistente, configurado como `/data` |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token privado usado somente pelo backend para criar e consultar Pix |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Assinatura secreta configurada nos Webhooks do Mercado Pago |
| `PIX_PRICE_5` ... `PIX_PRICE_60` | Preços dos planos de 5, 10, 15, 30 e 60 minutos |

## Pagamento Pix

Com `MERCADO_PAGO_ACCESS_TOKEN` configurado, o modo **Visitante escolhe** passa a direcionar os planos para `/comprar`, onde é criado um QR Code Pix dinâmico. O pagamento aprovado gera automaticamente a liberação temporária do MAC no MikroTik. Use credenciais de teste durante a homologação e configure `PUBLIC_BASE_URL` com HTTPS público para o recebimento do webhook.

Nunca publique o arquivo `.env`, senhas de roteadores, backups ou tokens no GitHub.

## Checklist obrigatório para publicar

1. Crie um domínio exclusivo, aponte-o ao proxy reverso e emita um certificado TLS válido.
2. No proxy, encaminhe o domínio para `conecta:80` pela mesma rede Docker. Não publique a porta 80 do contêiner diretamente na Internet.
3. Defina `PUBLIC_BASE_URL=https://seu-dominio` sem caminho adicional.
4. Gere valores aleatórios diferentes para `ACTIVATION_TOKEN_SECRET` e `ADMIN_SESSION_SECRET` (por exemplo, `openssl rand -base64 48`) e use uma senha administrativa única com gerenciador de senhas.
5. Se o Mercado Pago estiver ativo, configure também `MERCADO_PAGO_WEBHOOK_SECRET`; a aplicação recusa iniciar em produção sem ele.
6. Faça backup periódico do volume `conecta_data`, restrinja o acesso ao Portainer e mantenha Docker/host atualizados.
7. No proxy ou firewall de borda, aplique limitação adicional por IP. A proteção interna atende uma única réplica; para escalar horizontalmente, use um limitador compartilhado no proxy/Redis.

Em produção, a aplicação recusa iniciar com HTTP, senha `admin`, segredos ausentes ou segredos curtos. Os cookies administrativos usam `HttpOnly`, `SameSite=Strict` e `Secure` quando o endereço público é HTTPS.

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
