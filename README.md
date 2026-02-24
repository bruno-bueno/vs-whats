# WhatsApp Bot para VS Code

Uma extensão que permite visualizar as mensagens do seu WhatsApp diretamente em uma aba lateral (Sidebar) no Visual Studio Code, sem a necessidade de manter janelas de terminal ou navegadores abertos.

## Funcionalidades

- Conexão através de código QR exibido nativamente na extensão.
- Exibição de mensagens em tempo real (nome do remetente, número, horário e conteúdo da mensagem).
- Sem necessidade de recanear o QR Code a cada uso (os dados da sessão são armazenados em disco na pasta de extensão global).
- Integração perfeita e design combinando com o VS Code.

## Como Instalar

1. Acesse a página do repositório no GitHub e clique em **Releases** na barra lateral direita.
2. Baixe a versão mais recente do arquivo terminado em `.vsix` (exemplo: `whatsapp-bot-vscode.vsix`).
3. Abra o seu Visual Studio Code.
4. Abra a aba lateral de **Extensões** (atalho `Ctrl+Shift+X` ou `Cmd+Shift+X`).
5. Clique no menu de "Três Pontinhos" (`...`) que fica no canto superior direito desse painel de extensões.
6. Clique na opção **"Install from VSIX..."** (Instalar a partir do VSIX).
7. Selecione o arquivo `.vsix` que você acabou de baixar. E pronto! A extensão estará disponível no seu editor.

## Como Usar

1. Após a instalação, localize o ícone "WhatsApp" na barra inferior de abas laterais (junto do Explorer).
2. Clique na aba da Extensão e pressione o botão **"Iniciar Bot"**.
3. Escaneie o código QR que for mostrado com a câmera do seu celular através da função "Aparelhos Conectados" no WhatsApp.
4. As mensagens novas que você receber chegarão a partir de agora na própria barra lateral!

## Comandos

Através da paleta de comandos (`Ctrl + Shift + P` ou `Cmd + Shift + P`):

- `WhatsApp: Iniciar Bot`
- `WhatsApp: Parar Bot`

**Aviso Legal:** Esta é uma ferramenta não-oficial de terceiros, criada para facilitar e testar fluxos de trabalho que se integram ao WhatsApp. O uso intensivo ou ações de Spam podem violar os termos de Serviço do WhatsApp, acarretando no banimento da sua conta.
