# Leitura gratuita de fotos no atendimento

O atendimento usa **Tesseract no PC do proxy**, sem chamadas à OpenAI e sem
fallback para serviços pagos. A chave OpenAI anteriormente salva é preservada,
mas não é usada. O Admin → API mostra o OCR gratuito como modo principal.

## Preparar o PC

1. Instale as dependências com `pnpm install`.
2. Rode `node scripts/prepare-local-ocr.mjs`.
3. Um administrador com Supabase CLI autenticado deve registrar o token:
   `supabase db query --linked --file .local/register-local-ocr.sql`.
4. Inicie/reinicie `npm run ges-proxy` na porta 8787.
5. Mantenha o túnel existente apontando para essa porta e salve seu endereço
   HTTPS em Admin → Automações → Proxy API.
6. Publique `evolution-webhook` e `admin-photo-config`.

O OCR utiliza `/ocr/device` no mesmo proxy. Não é necessário abrir outra porta.
O PC, o proxy e o túnel precisam permanecer ligados. Em outro PC, prepare um
novo token e registre-o no servidor. A preparação preserva o token existente.

## Proteção dos dados

- `.local/` está no `.gitignore`; não publique nem compartilhe esses arquivos.
- O token fica em `.local/ocr-token` no PC e em `platform_private_secrets` no
  servidor. A tabela só pode ser acessada pela função com service_role.
- As rotas OCR exigem o token. O corpo tem limite, só aceita imagens embutidas
  e não baixa URLs arbitrárias. Há uma leitura por vez e timeout do worker.
- As imagens e o texto extraído ficam somente em memória durante a leitura.
- O modelo de idioma e o motor OCR são instalados com as dependências; não há
  download ou envio de imagens a serviços de IA durante cada leitura.
- O servidor rejeita exemplos, MACs conflitantes, Device Key incompleto e
  Device ID do Pixel cortado. Não troca caracteres ambíguos como O por zero.

## Comportamento

O webhook aceita fotos na coleta de dados, na confirmação de instalação e nas
telas extras do plano. Usa a Evolution já configurada para baixar a foto e a
envia ao PC pelo túnel HTTPS. O cliente confere e confirma antes da ativação.

- Prime: somente MAC.
- UTM: MAC e Device Key de seis dígitos, preservando zeros iniciais.
- Pixel: Device ID completo, juntando as linhas, ou MAC quando não há Device ID.
- Leitura pendente expira em dez minutos. Foto nova substitui a anterior.
- Se o PC estiver indisponível ou não conseguir ler, o cliente pode digitar.
- O diagnóstico salva só código, status, app e data; nunca foto, código do
  aparelho ou credencial. O diagnóstico não usa a OpenAI.

`DEVICE_GUIDE_ASSET_BASE_URL` continua configurando as imagens de orientação.

## Testes

`node scripts/verify-local-device-ocr.mjs` executa o OCR real com imagens
fictícias dos três apps e verifica autenticação do endpoint local.
`node scripts/verify-partner-device-photo.mjs` verifica o fluxo do webhook,
incluindo a ausência de fallback pago. Depois, valide fotos reais pelo WhatsApp:
reflexo, ângulo e letras pequenas podem exigir nova foto ou digitação.

Referências:
- https://github.com/naptha/tesseract.js
- https://docs.evoapicloud.com/api-reference/chat-controller/get-base64
