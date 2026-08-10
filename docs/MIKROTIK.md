# Provisionamento e teste do MikroTik

## Requisitos

- RouterOS 7.
- Equipamento resetado, sem configuração padrão.
- Link de internet conectado à porta que será usada como WAN.
- DHCP ou conectividade válida na WAN.
- DNS e relógio funcionando para validar HTTPS.
- Acesso físico ou console durante o primeiro provisionamento.

O MikroTik pode estar atrás de NAT ou CGNAT. Ele inicia todas as conexões com o servidor; não é necessário IP público nem redirecionamento de portas para o roteador.

## Ordem de instalação

1. Conecte o link de internet ao MikroTik resetado.
2. Verifique no terminal se o roteador alcança a internet e resolve o domínio do Conecta+.
3. No sistema, entre em **Administração → Instalar MikroTik**.
4. Clique em **Gerar código de ativação**.
5. Copie e execute o comando `/tool fetch ...; /import ...` no terminal do RouterOS.
6. Aguarde o equipamento aparecer em **Equipamentos detectados**.
7. Dê um nome ao equipamento.
8. Confira modelo, serial e interfaces detectadas.
9. Selecione WAN, porta de gerenciamento e portas dos visitantes.
10. Defina rede de gerenciamento, rede HotSpot, limite de banda e modo de operação.
11. Clique em **Liberar instalação automática**.
12. Aguarde a confirmação de instalação.

O agente consulta o servidor periodicamente. A aplicação entrega o script, o MikroTik importa e confirma a execução. Por isso, uma alteração pode levar até aproximadamente 30 segundos para chegar ao equipamento.

## Cuidados com interfaces e redes

- A WAN precisa ser diferente das portas de visitantes.
- Use uma porta física dedicada para gerenciamento durante o primeiro teste.
- Não reutilize uma sub-rede já presente no local para a rede HotSpot.
- O gateway e a faixa DHCP dos visitantes devem pertencer à mesma sub-rede.
- Confirme os nomes das interfaces detectadas; eles podem variar por modelo.

## Teste de bancada

1. Conecte um celular à rede Wi-Fi/bridge de visitantes.
2. Confirme a abertura do portal cativo.
3. No modo visitante, escolha um plano e uma forma de pagamento.
4. Para dinheiro, confirme no painel operacional.
5. Confirme que o painel mostra a sessão ativa e o tempo restante.
6. Faça um teste de velocidade para validar o limite configurado.
7. Espere o tempo terminar.
8. Confirme que o acesso é encerrado e o portal volta a ser apresentado.
9. Compre/libere novamente e confirme que o novo período é contado integralmente.

## Logs úteis no RouterOS

```routeros
/log print where message~"Conecta+"
/system scheduler print detail where name~"conecta-"
/ip hotspot ip-binding print detail where comment~"conecta-"
/queue simple print detail where name~"conecta-"
/ip hotspot host print
```

Depois de uma liberação correta, o log deve indicar que o acesso começou e que o comando foi confirmado. Ao expirar, a regra, a fila e o temporizador daquela liberação são removidos.

## Diagnóstico

- `connection refused`: endereço/porta incorretos, proxy indisponível ou serviço fora do ar.
- `certificate validation failed`: certificado público inválido, DNS ou relógio do roteador incorreto.
- Script baixado mas não aplicado: use `/file get <arquivo>.rsc contents` e consulte `/log print`.
- Equipamento detectado mas não instala: confira se a instalação foi liberada no painel e aguarde a próxima consulta do agente.
- Painel diz aguardando confirmação: o servidor enviou o comando, mas o MikroTik ainda não confirmou uma importação bem-sucedida.
- Portal não abre automaticamente: abra uma página HTTP; alguns sistemas operacionais demoram para reexecutar a detecção de portal cativo.

Não exponha Winbox, SSH ou API do MikroTik à internet. Gerencie pela rede dedicada ou por VPN.
