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
4. Cadastre as variáveis `PUBLIC_BASE_URL`, `APP_PORT` e `ACTIVATION_TOKEN_SECRET`.
5. Faça o deploy da Stack.

O domínio público deverá apontar para um proxy reverso HTTPS, como Nginx Proxy Manager, Traefik ou Cloudflare Tunnel. O MikroTik deverá acessar `PUBLIC_BASE_URL` por HTTPS com certificado válido.

## Variáveis

| Variável | Finalidade |
| --- | --- |
| `APP_PORT` | Porta publicada no host, padrão `3000` |
| `PUBLIC_BASE_URL` | Endereço HTTPS público da aplicação |
| `ACTIVATION_TOKEN_SECRET` | Segredo usado futuramente nos códigos de ativação |
| `PROVISIONING_DATA_DIR` | Diretório interno persistente, configurado como `/data` |

Nunca publique o arquivo `.env`, senhas de roteadores, backups ou tokens no GitHub.

## Desenvolvimento local

Requer Node.js 22.13 ou superior.

```bash
npm install
npm run dev
npm run build
```

## Estado atual

- Portal do visitante responsivo.
- Tempos de 5, 10, 15, 30 e 60 minutos na especificação do MikroTik.
- Modo automático e modo controlado pelo administrador.
- Gerador de script RouterOS 7 com DHCP, HotSpot, NAT e firewall.
- Imagem Docker e Stack para Portainer.
- Endpoint de saúde para monitoramento.

O registro automático do MikroTik, emissão dos códigos de ativação e armazenamento dos equipamentos serão a próxima etapa do backend.
