# Instalação direta no Ubuntu Server 24.04

Esta instalação não usa Docker e não altera os arquivos de implantação Docker do projeto.

## Requisitos

- Ubuntu Server 24.04 AMD64 ou ARM64 atualizado.
- Acesso `sudo`.
- Domínio apontando para o servidor.
- Portas TCP 80 e 443 liberadas no firewall de borda.
- Projeto clonado ou copiado para o servidor.

O instalador cria:

- usuário restrito `conecta`;
- aplicação em `/opt/conecta`;
- dados persistentes em `/var/lib/conecta`;
- configuração em `/etc/conecta/conecta.env`;
- serviço `systemd` chamado `conecta`;
- proxy Nginx local;
- comandos de atualização, backup e desinstalação.

## Instalar

No diretório `portal` do projeto:

```bash
sudo PUBLIC_BASE_URL=https://wifi.exemplo.com.br \
  ADMIN_USERNAME=admin \
  ADMIN_PASSWORD='uma-senha-forte-com-16-ou-mais-caracteres' \
  bash deploy/ubuntu/install-ubuntu.sh
```

O script baixa o Node.js oficial, verifica SHA-256, instala dependências, compila o projeto e inicia o serviço. Os segredos de ativação e sessão são gerados automaticamente.

## Configurar HTTPS

O serviço da aplicação escuta somente em `127.0.0.1:3000`; o Nginx atende publicamente. Depois de o DNS estar apontado, instale o Certbot:

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d wifi.exemplo.com.br
```

Teste:

```bash
curl https://wifi.exemplo.com.br/api/health
```

Não coloque `http://` em `PUBLIC_BASE_URL`: produção exige HTTPS.

## Configuração e logs

```bash
sudo systemctl status conecta
sudo journalctl -u conecta -f
sudo systemctl restart conecta
sudo nginx -t
```

O arquivo `/etc/conecta/conecta.env` pertence a `root:conecta` e usa permissão `0640`. Depois de alterá-lo, reinicie:

```bash
sudo systemctl restart conecta
```

Não altere `ACTIVATION_TOKEN_SECRET` ou `ADMIN_SESSION_SECRET` depois que o sistema estiver em uso.

As credenciais e preços do Mercado Pago são cadastrados em **Administração → Integrações**, não no arquivo de ambiente.

## Backup

```bash
sudo conecta-backup
```

Agende backups e copie-os para outro servidor. O diretório `/var/lib/conecta` contém o banco de dados de produção.

## Atualizar

Depois de baixar uma versão nova do projeto:

```bash
sudo conecta-backup
sudo conecta-update /caminho/para/o/novo/projeto/portal
sudo systemctl status conecta
curl https://wifi.exemplo.com.br/api/health
```

O atualizador cria uma nova release em `/opt/conecta/releases` e mantém dados e configurações.

## Desinstalar

```bash
sudo conecta-uninstall
```

A desinstalação normal preserva dados e configuração. Para também apagar banco e configuração:

```bash
sudo conecta-uninstall --purge-data
```

`--purge-data` é irreversível; faça backup antes.

## Próximos passos

Após o healthcheck responder, entre na aplicação e siga:

- [Configuração inicial do sistema](../../docs/CONFIGURACAO.md)
- [Provisionamento e teste do MikroTik](../../docs/MIKROTIK.md)
