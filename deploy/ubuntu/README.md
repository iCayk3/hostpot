# Instalação nativa no Ubuntu Server 24.04

Execute no diretório do projeto:

```bash
sudo PUBLIC_BASE_URL=https://wifi.exemplo.com.br \
  ADMIN_USERNAME=admin \
  ADMIN_PASSWORD='uma-senha-forte-com-16-ou-mais-caracteres' \
  bash deploy/ubuntu/install-ubuntu.sh
```

O instalador baixa o Node.js oficial com verificação SHA-256, cria o usuário restrito `conecta`, compila uma versão em `/opt/conecta`, grava dados em `/var/lib/conecta`, cria o serviço `systemd` e configura o Nginx. AMD64 e ARM64 são suportados.

Depois, configure TLS. Com DNS já apontado, uma opção é instalar o Certbot e emitir o certificado para o domínio. O `PUBLIC_BASE_URL` deve continuar sendo HTTPS.

Comandos operacionais:

```bash
sudo systemctl status conecta
sudo journalctl -u conecta -f
sudo conecta-backup
sudo conecta-update /caminho/do/projeto-atualizado
sudo conecta-uninstall
sudo conecta-uninstall --purge-data  # também apaga banco e configuração
```

O arquivo `/etc/conecta/conecta.env` pertence a `root:conecta` com modo `0640`. Não altere `ACTIVATION_TOKEN_SECRET` nem `ADMIN_SESSION_SECRET` após começar a usar o sistema. As credenciais do Mercado Pago são cadastradas no painel **Integrações** e ficam criptografadas no banco.

Recomenda-se agendar `conecta-backup` diariamente e copiar os backups para outro servidor. A desinstalação comum preserva dados e configuração; `--purge-data` é irreversível.
