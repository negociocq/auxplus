# Imagens de orientação do atendimento

## Zuxo Player

Guias produzidos com a ferramenta integrada imagegen e revisados visualmente:

- `zuxo-tv-v2-guide.png`: LG, Android TV e Roku, com a tela fornecida pelo usuário: TV ao Vivo à esquerda, Filmes/Séries à direita e ID do aparelho no rodapé. Substitui o primeiro guia de TV.
- `zuxo-android-guide.png`: celulares/tablets Android, MAC na tela inicial.
- `zuxo-ios-guide.png`: iPhone/iPad, engrenagem e print das configurações com MAC.
- `zuxo-samsung-guide.png`: Samsung, Listas e formulário manual com jung777, usuário e senha do atendimento.

Prompts: infográfico em português para WhatsApp, fundo escuro e detalhes verdes,
tipografia legível, representação da tela correspondente ao dispositivo,
marca EXEMPLO/DADOS FICTÍCIOS, MAC AA:BB:CC:DD:EE:FF; nunca dados reais.
Samsung destaca código jung777 e os campos SEU USUÁRIO/SUA SENHA.
Demais aparelhos orientam aguardar alguns segundos com o app aberto após ativar.
Os arquivos são publicados no bucket público whatsapp-guides pelo script
`scripts/publish-zuxo-guides.mjs`; o bot seleciona por sistema/aparelho.

Arquivos de exemplo para o cliente localizar os identificadores do próprio app.
Criados com a ferramenta integrada imagegen, a partir das telas fornecidas como
referência, e revisados visualmente antes de serem incluídos no projeto.

- `prime-device-guide.png`: aponta para Endereço MAC no canto inferior direito.
- `utm-device-guide.png`: destaca MAC e Device Key e explica Settings → User Account.
- `pixel-device-guide.png`: destaca o Device ID inteiro e suas duas linhas.

Todos os códigos são fictícios. O QR Code do Pixel foi removido. As fotos
originais não são publicadas nem usadas como anexos do atendimento.

## Prompts de produção

Especificação comum: guia educativo legível em português, horizontal, com setas
e contornos amarelos, somente o aplicativo indicado, sem dados pessoais.

Prime: recortar e retificar a tela azul do Prime IPTV; preservar os menus;
substituir a chave por CHAVE OCULTA e o MAC por AA:BB:CC:DD:EE:FF; apontar para
o MAC; título PRIME IPTV — ONDE ESTÁ O MAC?; rodapé pedindo foto desse canto ou
MAC da própria TV; selo EXEMPLO — DADOS FICTÍCIOS.

UTM (versão final): recriar uma tela cinza com diálogo central UTM Play,
Your TV MAC Address: AA:BB:CC:DD:EE:FF e Your Device Key: 123456; destacar as
duas linhas; título UTM PLAY — MAC E DEVICE KEY; rodapé pedindo foto dos dois
dados da própria TV e explicando Settings (Configurações) → User Account
(Conta do usuário); selo EXEMPLO — DADOS FICTÍCIOS; nenhum QR Code, perfil,
data ou elemento de outros players.

Pixel: retificar a tela de escolha de perfis do Pixel Player; substituir o
QR Code inteiro por QR CODE OCULTO; substituir Device ID por um identificador
EXEMPLO em duas linhas; retirar data e nome pessoal de perfil; destacar as
duas linhas; título PIXEL PLAYER — DEVICE ID COMPLETO; rodapé pedindo foto
das duas linhas ou código completo sem espaço; selo EXEMPLO — DADOS FICTÍCIOS.
