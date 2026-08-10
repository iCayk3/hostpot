# Instalação com Docker e Portainer

## 1. Preparar domínio e rede

1. Crie um domínio, por exemplo `wifi.exemplo.com.br`.
2. Aponte o DNS para o servidor ou para o proxy reverso.
3. Emita um certificado HTTPS válido no Nginx Proxy Manager, Traefik, Cloudflare Tunnel ou proxy equivalente.
4. Crie ou identifique uma rede Docker externa na qual o proxy também esteja conectado.
5. Reserve um IP livre nessa rede para o Conecta+.

Exemplo: se a rede existente é `local-rede-external`, sub-rede `10.12.0.0/24`, o endereço `10.12.0.205` pode ser usado se estiver livre.

O Compose não publica nem mapeia portas no host. O container escuta diretamente na porta 80 e é acessado pelo proxy através da rede externa.

## 2. Preparar variáveis

Copie `.env.example` para `.env` ou cadastre as variáveis na Stack do Portainer.

Gere os segredos:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Exemplo mínimo:

```env
DOCKER_NETWORK_NAME=local-rede-external
DOCKER_STATIC_IP=10.12.0.205
PUBLIC_BASE_URL=https://wifi.exemplo.com.br
ACTIVATION_TOKEN_SECRET=primeiro-segredo-aleatorio
ADMIN_SESSION_SECRET=segundo-segredo-aleatorio-diferente
ADMIN_USERNAME=admin
ADMIN_PASSWORD=uma-senha-forte-com-16-ou-mais-caracteres
PIX_TEMP_RATE_LIMIT=1M/1M
```

Não use a URL do Portainer como `PUBLIC_BASE_URL`. Essa variável deve conter o domínio público do Conecta+.

## 3. Subir com Docker Compose

```bash
cp .env.example .env
# edite o arquivo .env
docker compose up -d --build
docker compose ps
docker compose logs -f conecta
```

## 4. Subir pelo Portainer

1. Publique o projeto em um repositório privado ou público sem o arquivo `.env`.
2. Abra **Stacks → Add stack → Repository**.
3. Informe o repositório e `docker-compose.yml` como caminho do Compose.
4. Cadastre as variáveis obrigatórias na seção de ambiente.
5. Faça o deploy.
6. Conecte o proxy à mesma rede configurada em `DOCKER_NETWORK_NAME`.
7. No proxy, encaminhe o domínio para `conecta-mais:80` ou para o `DOCKER_STATIC_IP` na porta 80.

Não configure publicação `80:80` no Compose. O acesso interno ocorre diretamente pela rede Docker externa.

## 5. Validar

```bash
docker compose ps
docker compose logs --tail=100 conecta
curl https://wifi.exemplo.com.br/api/health
```

O container deve aparecer como `healthy` e o endpoint deve responder `{"status":"ok"}`.

## Persistência e backup

O banco fica em `/data/conecta.db`, persistido no volume `conecta_data`. Faça backup do volume antes de atualizar ou migrar.

Uma recriação normal da Stack preserva o volume. Remover o volume apaga equipamentos, usuários, configurações, pagamentos e histórico.

## Atualização

```bash
git pull
docker compose up -d --build
docker image prune
```

Confirme o healthcheck e faça um teste de liberação depois da atualização.

## Problemas comuns

- `EACCES 0.0.0.0:80`: use o Compose fornecido, que habilita porta não privilegiada para o usuário restrito do container.
- `readonly database`: confirme que `/data` está ligado ao volume e não a uma pasta sem permissão de escrita.
- `500` nas APIs: consulte `docker compose logs conecta`; normalmente indica volume sem escrita ou variável obrigatória inválida.
- MikroTik não baixa comandos: confirme DNS, HTTPS válido e saída TCP/443 do roteador.
- Proxy retorna erro: confirme que proxy e aplicação estão na mesma rede Docker externa.
