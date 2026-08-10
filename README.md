# Conecta+ HotSpot

Sistema de portal cativo para MikroTik RouterOS 7, com provisionamento automático, gestão de operadores, telemetria, controle de sessões e venda de acesso por Pix ou dinheiro.

## Documentação

- [Instalação com Docker e Portainer](docs/INSTALACAO-DOCKER.md)
- [Instalação direta no Ubuntu Server 24.04](deploy/ubuntu/README.md)
- [Configuração inicial do sistema](docs/CONFIGURACAO.md)
- [Provisionamento e teste do MikroTik](docs/MIKROTIK.md)

## Recursos

- Modo **Visitante escolhe o tempo**, com planos de 5, 10, 15, 30 ou 60 minutos.
- Pagamento via Pix Mercado Pago ou confirmação de pagamento em espécie.
- Janela temporária de 2 minutos para o cliente efetuar o pagamento; ela não é descontada do plano comprado.
- Modo **Administrador libera**, com painel operacional separado.
- Usuários operadores vinculados somente aos equipamentos autorizados.
- Provisionamento de um RouterOS 7 resetado por um único comando.
- Telemetria, dispositivos aguardando, sessões ativas e tempo restante com dados reais.
- Limitação de banda configurável por equipamento.
- Encerramento manual ou automático; ao expirar, o dispositivo retorna ao portal.
- Relatórios financeiros e histórico de pagamentos.
- Banco SQLite persistente e credenciais do Mercado Pago criptografadas.

## Requisitos de produção

- Domínio público com HTTPS e certificado válido.
- Servidor acessível pelo MikroTik através da internet; o roteador pode estar atrás de NAT.
- Docker Engine com Compose/Portainer, ou Ubuntu Server 24.04 AMD64/ARM64.
- MikroTik com RouterOS 7 e acesso à internet pela porta WAN.
- Proxy reverso para HTTPS quando usar Docker.

## Variáveis obrigatórias

| Variável | Descrição |
| --- | --- |
| `PUBLIC_BASE_URL` | URL pública HTTPS, sem caminho e sem barra final. Ex.: `https://wifi.exemplo.com.br` |
| `ACTIVATION_TOKEN_SECRET` | Segredo aleatório com pelo menos 32 caracteres para tokens dos equipamentos |
| `ADMIN_USERNAME` | Usuário administrativo inicial; normalmente `admin` |
| `ADMIN_PASSWORD` | Senha administrativa forte, com no mínimo 16 caracteres |
| `ADMIN_SESSION_SECRET` | Outro segredo aleatório, diferente do segredo de ativação |

No Docker também são obrigatórias:

| Variável | Descrição |
| --- | --- |
| `DOCKER_NETWORK_NAME` | Nome exato da rede Docker externa já existente |
| `DOCKER_STATIC_IP` | IP livre pertencente à sub-rede dessa rede externa |

Variáveis opcionais:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PIX_TEMP_RATE_LIMIT` | `1M/1M` | Banda da janela temporária de pagamento |
| `PIX_BLOCKED_DOMAINS` | Lista incluída no exemplo | Domínios bloqueados durante a janela de pagamento |
| `PROVISIONING_DATA_DIR` | `/data` no Docker | Diretório persistente do banco |

As credenciais e os preços do Mercado Pago devem ser cadastrados em **Administração → Integrações**. As antigas variáveis `MERCADO_PAGO_*` e `PIX_PRICE_*` continuam aceitas apenas para compatibilidade.

## Verificação rápida

Depois de instalar:

```bash
curl https://wifi.exemplo.com.br/api/health
```

Resultado esperado:

```json
{"status":"ok"}
```

Em seguida, acesse a URL pública, entre com o administrador e siga [Configuração inicial](docs/CONFIGURACAO.md).

## Atualização e backup

Antes de atualizar, faça backup do volume `conecta_data` no Docker ou execute `sudo conecta-backup` na instalação Ubuntu. Não altere `ACTIVATION_TOKEN_SECRET` ou `ADMIN_SESSION_SECRET` depois que equipamentos e usuários estiverem cadastrados.

Nunca publique `.env`, banco SQLite, backups, senhas ou tokens no GitHub.

## Desenvolvimento

Requer Node.js 24.

```bash
npm install
npm run dev
npm test
```

`npm test` compila a versão de produção e executa os testes automatizados do portal, APIs, provisionamento e ciclo de liberação.
