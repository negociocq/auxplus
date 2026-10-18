# Leitura de fotos no atendimento

O webhook `evolution-webhook` aceita fotos durante a coleta do MAC/Device ID,
inclusive na confirmação de instalação e nas telas adicionais do plano.
Fotos fora dessas etapas continuam com o comportamento anterior.

## Configuração no servidor

Alternativa pelo AuxPlus: **Admin → API → OpenAI — leitura de fotos**.
Cole a chave e confirme a senha do administrador. A função `admin-photo-config`
confere a senha e a permissão no servidor e grava a chave em
`platform_private_secrets`, tabela sem acesso para anon/authenticated.
O campo nunca carrega a chave salva. Não há cópia no localStorage.
Aplique `20261018210000_private_api_secrets.sql` antes de publicar a função.
O webhook prioriza a chave salva no Admin; a variável de ambiente é o fallback.

No painel Supabase, em **Edge Functions → Secrets**, configure:

- `OPENAI_API_KEY`: chave de um projeto OpenAI com acesso à API e faturamento.
- `DEVICE_PHOTO_MODEL`: opcional; padrão `gpt-4.1-mini`.
- `DEVICE_GUIDE_ASSET_BASE_URL`: opcional; endereço HTTPS público do AuxPlus,
  sem barra final, após publicar os arquivos de `public/atendimento/`.
  Quando configurado, envia a imagem de exemplo do aplicativo junto das
  instruções para localizar os dados. Sem endereço, envia somente o texto.
  Se a Evolution recusar a imagem, tenta enviar as instruções em texto.

Não coloque a chave em variáveis `VITE_*`, no navegador, no Git ou em mensagens.
Publique o webhook e os módulos compartilhados depois da configuração.
Sem chave, o bot não oferece leitura automática; se receber uma foto nessa
etapa, orienta digitar os dados ou chamar um atendente.

A integração usa a configuração Evolution já salva na conta para baixar a
imagem por `POST /chat/getBase64FromMediaMessage/{instance}`. É necessário
que a instalação Evolution suporte esse endpoint para as mensagens recebidas.

## Comportamento

- Prime: MAC; UTM: MAC e Device Key de seis dígitos; Pixel: Device ID completo.
- A foto é enviada à API OpenAI para leitura; `store: false` é usado no pedido.
- O bot não salva a foto nem a resposta completa do modelo no estado.
- Os dados reconhecidos ficam pendentes por até dez minutos, ligados ao app e à
  etapa atuais, e precisam de confirmação explícita antes da ativação.
- Uma foto nova substitui a leitura anterior, mesmo quando não pode ser lida.
- Dados incompletos, ambíguos ou inválidos pedem nova foto ou digitação.
- Respostas negativas descartam a leitura e pedem novos dados.
- As chamadas à API de leitura são cobradas no projeto OpenAI configurado.

## Verificação antes do uso

Execute `node scripts/verify-partner-device-photo.mjs` para os testes com
serviços simulados, sem enviar fotos reais nem consumir a API.
Após publicar, faça um teste controlado no WhatsApp para cada app, com confirmação,
recusa e foto ilegível. A validação local não verifica credenciais ou a conexão
real entre Evolution, OpenAI e UniPlay.

Referências:
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/reference/resources/responses/methods/create
- https://docs.evoapicloud.com/api-reference/chat-controller/get-base64
