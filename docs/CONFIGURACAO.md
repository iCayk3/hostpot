# Configuração inicial do Conecta+

## 1. Primeiro acesso

Abra `PUBLIC_BASE_URL` e entre com `ADMIN_USERNAME` e `ADMIN_PASSWORD`. Não existe acesso administrativo anônimo.

Depois do primeiro acesso:

1. Confira **Visão geral**.
2. Dê nomes claros aos equipamentos, como `Loja Centro` ou `Recepção Clínica`.
3. Crie operadores em **Usuários e permissões**.
4. Vincule a cada operador somente os equipamentos que ele poderá controlar.

O administrador acessa todas as telas. O operador acessa somente o painel operacional e os equipamentos vinculados.

## 2. Modos de operação

Cada equipamento funciona em um dos modos:

- **Visitante escolhe o tempo**: o visitante escolhe 5, 10, 15, 30 ou 60 minutos e seleciona Pix ou dinheiro.
- **Administrador libera**: o visitante aguarda; um atendente escolhe o tempo no painel operacional.

O modo pode ser alterado pela administração. O servidor envia a atualização ao MikroTik, encerra autorizações incompatíveis e atualiza o portal dos celulares conectados.

## 3. Mercado Pago

Abra **Administração → Integrações** e informe:

- **Access Token**: credencial privada da aplicação Mercado Pago; não use a Public Key.
- **Segredo do webhook**: segredo configurado na assinatura dos Webhooks do Mercado Pago.
- Preço de cada plano.

Salve a integração. Os valores privados são criptografados no banco e nunca são exibidos novamente. Campo vazio em uma edição mantém o valor já cadastrado.

Configure no Mercado Pago o webhook público:

```text
https://wifi.exemplo.com.br/api/payments/webhook
```

Para homologação, use credenciais de teste. Credenciais de produção rejeitam usuários ou compradores de teste em combinações inválidas.

O e-mail do pagador não é obrigatório no portal.

## 4. Regra de pagamento e tempo

Ao gerar um Pix, o cliente recebe uma janela de 2 minutos com banda limitada para concluir o pagamento. Essa janela não conta no plano adquirido.

O plano contratado começa somente após:

1. Mercado Pago aprovar ou o operador confirmar dinheiro;
2. servidor enviar a liberação;
3. MikroTik importar o comando;
4. MikroTik confirmar a instalação ao servidor.

Ao terminar o plano, o dispositivo é devolvido ao portal para comprar novamente. Uma compra nova cancela temporizadores antigos daquele dispositivo.

## 5. Operadores

Em **Usuários e permissões**:

1. Crie nome, usuário e senha.
2. Selecione os equipamentos permitidos.
3. Salve.

É possível retirar apenas um equipamento do operador ou excluir o usuário. Isso não remove o MikroTik do sistema.

O operador pode confirmar dinheiro, conceder mais 2 minutos para pagamento, liberar dispositivos no modo administrativo, nomear clientes e encerrar sessões.

## 6. Banda

Durante a instalação do MikroTik, informe o limite no formato RouterOS, por exemplo:

```text
10M/10M
```

O valor é aplicado individualmente ao IP do dispositivo liberado. A janela Pix usa `PIX_TEMP_RATE_LIMIT`, cujo padrão é `1M/1M`.

## 7. Backup

O banco contém toda a configuração operacional, credenciais criptografadas, equipamentos, usuários e histórico. Faça backup regular e também antes de atualizações.

Para restaurar em outro servidor, preserve o banco e mantenha os mesmos `ACTIVATION_TOKEN_SECRET` e `ADMIN_SESSION_SECRET`.
