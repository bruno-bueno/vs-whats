const vscode = require('vscode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

let client = null;

class WhatsAppViewProvider {
    constructor(extensionUri, context) {
        this._extensionUri = extensionUri;
        this._context = context;
        this._view = null;
        
        // Estado da aplicação
        this._status = 'Desconectado'; // 'Desconectado', 'Aguardando QR', 'Conectado'
        this._qrImageBase64 = null;
        
        // Armazena as conversas: { "5511999999999@c.us": { name: "João", number: "11999999999", messages: [] } }
        this._chats = {};
        this._currentChatId = null; // ID da conversa selecionada no momento
    }

    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        this._updateHtml();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'start') {
                vscode.commands.executeCommand('whatsappbot.start');
            } else if (data.type === 'stop') {
                vscode.commands.executeCommand('whatsappbot.stop');
            } else if (data.type === 'logout') {
                vscode.commands.executeCommand('whatsappbot.logout');
            } else if (data.type === 'openChat') {
                this._currentChatId = data.chatId;
                if (this._chats[data.chatId]) {
                    this._chats[data.chatId].unreadCount = 0;
                }
                this._updateHtml();
            } else if (data.type === 'backToList') {
                this._currentChatId = null;
                this._updateHtml();
            } else if (data.type === 'sendMessage') {
                if (client && this._currentChatId && data.text.trim()) {
                    try {
                        // Envia a mensagem pela API real do WhatsApp
                        await client.sendMessage(this._currentChatId, data.text);
                        // A interface será atualizada automaticamente pelo evento "message_create"
                    } catch (err) {
                        vscode.window.showErrorMessage('Erro ao enviar mensagem: ' + err.message);
                    }
                }
            } else if (data.type === 'sendFile') {
                if (client && this._currentChatId) {
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        openLabel: 'Enviar Arquivo',
                        filters: {
                            'Mídia e Arquivos': ['png', 'jpg', 'jpeg', 'mp4', 'pdf', 'mp3', 'webp', 'gif']
                        }
                    });

                    if (fileUri && fileUri[0]) {
                        try {
                            const filePath = fileUri[0].fsPath;
                            const media = MessageMedia.fromFilePath(filePath);
                            await client.sendMessage(this._currentChatId, media);
                            vscode.window.showInformationMessage('Arquivo enviado com sucesso!');
                            // O evento message_create também preencherá a tela automaticamente
                        } catch (err) {
                            vscode.window.showErrorMessage('Erro ao enviar arquivo: ' + err.message);
                        }
                    }
                }
            }
        });
    }

    // Recebe e estrutura as mensagens organizadas por conversa
    addMessage(chatId, msgObj, contactInfo = null) {
        if (!this._chats[chatId]) {
            this._chats[chatId] = {
                id: chatId,
                name: contactInfo ? contactInfo.name : 'Desconhecido',
                number: contactInfo ? contactInfo.number : 'Sem número',
                messages: [],
                unreadCount: 0,
                lastUpdateTime: 0
            };
        }
        
        this._chats[chatId].messages.push(msgObj);
        this._chats[chatId].lastUpdateTime = Date.now();
        
        // Se for mensagem recebida e não estamos com a aba dela aberta, soma no aviso de não-lida
        if (!msgObj.fromMe && this._currentChatId !== chatId) {
            this._chats[chatId].unreadCount = (this._chats[chatId].unreadCount || 0) + 1;
        }
        
        // Limita a 100 mensagens no histórico por conversa para não travar
        if (this._chats[chatId].messages.length > 100) {
            this._chats[chatId].messages.shift();
        }

        if (!this._view) return;

        // Se estou na tela da LISTA, recarrego a tela inteira para atualizar os avisos
        if (!this._currentChatId) {
            this._updateHtml();
        } 
        // Se eu estou DENTRO deste chat específico, não recarrego o HTML para não apagar o formulário em que a pessoa digita. Apenas injeto o balão.
        else if (this._currentChatId === chatId) {
            this._view.webview.postMessage({ type: 'appendMessage', message: msgObj });
        }
    }

    setStatus(status, qr = null) {
        this._status = status;
        this._qrImageBase64 = qr;
        if (status === 'Aguardando QR') {
            this._chats = {}; 
            this._currentChatId = null;
        }
        this._updateHtml();
    }

    _updateHtml() {
        if (!this._view) return;
        
        let content = '';

        if (this._status === 'Desconectado') {
            content = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:90vh; text-align:center;">
                    <h3 style="margin-bottom: 20px; color: var(--vscode-foreground);">WhatsApp Bot</h3>
                    <button id="startBtn" class="btn primary-btn">Iniciar Bot</button>
                </div>
            `;
        } else if (this._status === 'Aguardando QR') {
            content = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:90vh; text-align:center;">
                    <h4 style="margin-bottom: 10px;">Escaneie para conectar</h4>
                    ${this._qrImageBase64 
                        ? `<div style="background:white; padding:10px; border-radius:8px;"><img src="${this._qrImageBase64}" style="width:100%; max-width:220px;" /></div>` 
                        : `
                        <div style="display:flex; flex-direction:column; align-items:center;">
                            <style>
                                .loader { border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid #25D366; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; margin-bottom: 15px;}
                                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                            </style>
                            <div class="loader"></div>
                            <p style="opacity:0.7; font-size: 13px; max-width: 80%;">Iniciando o navegador interno do WhatsApp... <br>Isso pode levar de 5 a 15 segundos dependendo do computador.</p>
                        </div>
                        `}
                    <button id="logoutBtn" class="btn danger-btn" style="margin-top:20px;">Cancelar e Limpar Sessão</button>
                </div>
            `;
        } else if (this._status === 'Conectado') {
            
            // ---------------- TELA DE LISTA DE CONVERSAS ----------------
            if (!this._currentChatId) {
                const chatsArray = Object.values(this._chats);
                
                let chatsListHtml = chatsArray.length === 0 
                    ? '<div style="text-align:center; margin-top:30px; opacity:0.6; font-size:13px;">Nenhuma conversa ainda... Aguardando mensagens.</div>'
                    : chatsArray.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime).map(c => {
                        const lastMsg = c.messages.length > 0 ? c.messages[c.messages.length - 1] : { texto: '', hora: '' };
                        const preview = lastMsg.texto.length > 30 ? lastMsg.texto.substring(0, 30) + '...' : lastMsg.texto;
                        
                        const unreadBadge = c.unreadCount > 0 
                            ? `<span style="background: #25D366; color: #111B21; border-radius: 50%; padding: 2px 6px; font-size: 10px; font-weight: bold; margin-left: auto;">${c.unreadCount}</span>` 
                            : '';

                        return `
                        <div class="chat-item" onclick="openChat('${c.id}')">
                            <div class="chat-item-header">
                                <strong>${c.name}</strong>
                                <span class="chat-time" style="color: ${c.unreadCount > 0 ? '#25D366' : 'inherit'}; font-weight: ${c.unreadCount > 0 ? 'bold' : 'normal'}">${lastMsg.hora}</span>
                            </div>
                            <div class="chat-preview" style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-weight: ${c.unreadCount > 0 ? 'bold' : 'normal'}; color: ${c.unreadCount > 0 ? 'var(--vscode-foreground)' : 'inherit'};">${lastMsg.fromMe ? '✓ ' : ''}${preview}</span>
                                ${unreadBadge}
                            </div>
                        </div>
                        `;
                    }).join('');

                content = `
                    <div style="display:flex; flex-direction:column; height: 100vh;">
                        <div class="header">
                            <span style="color: #25D366; font-weight:bold;">✅ Conectado</span>
                            <button id="stopBtn" class="btn default-btn btn-small">Sair</button>
                        </div>
                        <div style="flex:1; overflow-y:auto; padding: 10px;">
                            ${chatsListHtml}
                        </div>
                    </div>
                `;
            } 
            // ---------------- TELA DE CHAT (DENTRO DA CONVERSA) ----------------
            else {
                const currentChat = this._chats[this._currentChatId];
                
                const msgsHtml = currentChat.messages.map(m => {
                    // Estrutura do balãozinho da mensagem (Verde = Enviado por mim / Escuro = Recebido)
                    const alignment = m.fromMe ? 'align-self: flex-end;' : 'align-self: flex-start;';
                    const bgColor = m.fromMe ? '#005C4B' : 'var(--vscode-editor-inactiveSelectionBackground)';
                    const textColor = m.fromMe ? '#E9EDEF' : 'var(--vscode-foreground)';
                    const borderRadius = m.fromMe ? '8px 8px 0px 8px' : '8px 8px 8px 0px';

                    const imgHtml = m.imagemBase64 ? `<img src="${m.imagemBase64}" style="max-width: 100%; max-height: 250px; border-radius: 6px; margin-bottom: 6px; display: block;" />` : '';
                    const senderHtml = m.senderName ? `<div style="font-size: 11px; font-weight: bold; color: #25D366; margin-bottom: 4px;">~ ${m.senderName}</div>` : '';

                    return `
                        <div style="display:flex; flex-direction:column; ${alignment} max-width: 85%; margin-bottom: 8px;">
                            <div style="background: ${bgColor}; color: ${textColor}; padding: 8px 12px; border-radius: ${borderRadius}; font-size: 13px; line-height: 1.4; word-wrap: break-word;">
                                ${senderHtml}
                                ${imgHtml}
                                ${m.texto}
                                <div style="font-size: 10px; opacity: 0.6; text-align: right; margin-top: 4px;">
                                    ${m.hora}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                content = `
                    <div style="display:flex; flex-direction:column; height: 100vh;">
                        <!-- Header do Chat -->
                        <div class="header" style="justify-content:flex-start; gap:10px;">
                            <button onclick="backToList()" class="btn default-btn btn-small">←</button>
                            <strong style="flex:1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${currentChat.name}</strong>
                        </div>
                        
                        <!-- Corpo das Mensagens -->
                        <div style="flex:1; overflow-y:auto; padding: 10px; display:flex; flex-direction:column;" id="msgContainer">
                            ${msgsHtml || '<div style="text-align:center; opacity:0.6; font-size:13px;">Envie uma mensagem para começar</div>'}
                        </div>
                        
                        <!-- Barra inferior de Enviar Mensagem -->
                        <div style="padding: 10px; border-top: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); display:flex; gap:8px;">
                            <button id="attachBtn" class="btn default-btn" style="padding: 8px;" title="Anexar Arquivo">📎</button>
                            <input type="text" id="chatInput" placeholder="Digite uma mensagem..." style="flex:1; padding:8px; border-radius:4px; border:1px solid var(--vscode-input-border); background:var(--vscode-input-background); color:var(--vscode-input-foreground);" />
                            <button id="sendBtn" class="btn primary-btn">\u27A4</button>
                        </div>
                    </div>
                `;
            }
        }

        this._view.webview.html = `
            <!DOCTYPE html>
            <html lang="pt-br">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: var(--vscode-font-family); margin: 0; padding: 0; background-color: var(--vscode-sideBar-background); color: var(--vscode-sideBar-foreground); }
                    * { box-sizing: border-box; }
                    
                    /* Classes de Botões */
                    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
                    .btn-small { padding: 4px 8px; font-size: 11px; }
                    .primary-btn { background: #25D366; color: #111B21; font-weight: bold; }
                    .primary-btn:hover { background: #20BD5A; }
                    .danger-btn { background: var(--vscode-errorForeground); color: white; }
                    .default-btn { background: transparent; border: 1px solid var(--vscode-button-secondaryBackground); color: var(--vscode-foreground); }
                    .default-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
                    
                    /* Outros componentes */
                    .header { padding: 10px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); display: flex; justify-content: space-between; align-items: center; }
                    
                    /* Lista de Contatos */
                    .chat-item { padding: 12px 10px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; transition: background 0.2s; }
                    .chat-item:hover { background: var(--vscode-list-hoverBackground); }
                    .chat-item-header { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }
                    .chat-time { font-size: 11px; opacity: 0.6; }
                    .chat-preview { font-size: 12px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                </style>
            </head>
            <body>
                ${content}
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Funções Iniciar / Parar
                    const startBtn = document.getElementById('startBtn');
                    if(startBtn) startBtn.addEventListener('click', () => vscode.postMessage({ type: 'start' }));

                    const stopBtn = document.getElementById('stopBtn');
                    if(stopBtn) stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
                    
                    const logoutBtn = document.getElementById('logoutBtn');
                    if(logoutBtn) logoutBtn.addEventListener('click', () => vscode.postMessage({ type: 'logout' }));
                    
                    // Funções Navegação
                    function openChat(id) {
                        vscode.postMessage({ type: 'openChat', chatId: id });
                    }
                    function backToList() {
                        vscode.postMessage({ type: 'backToList' });
                    }

                    // Funções Envio
                    const chatInput = document.getElementById('chatInput');
                    const sendBtn = document.getElementById('sendBtn');
                    const attachBtn = document.getElementById('attachBtn');
                    
                    function sendMessage() {
                        const text = chatInput.value;
                        if(text.trim()) {
                            vscode.postMessage({ type: 'sendMessage', text: text });
                            chatInput.value = '';
                        }
                    }

                    if(sendBtn && chatInput) {
                        sendBtn.addEventListener('click', sendMessage);
                        chatInput.addEventListener('keypress', (e) => {
                            if(e.key === 'Enter') sendMessage();
                        });
                        // Auto-focus no input quando abre a conversa
                        chatInput.focus();
                    }

                    if (attachBtn) {
                        attachBtn.addEventListener('click', () => {
                            vscode.postMessage({ type: 'sendFile' });
                        });
                    }

                    // Scroll automático para a última mensagem
                    const container = document.getElementById('msgContainer');
                    if (container) container.scrollTop = container.scrollHeight;

                    // Novo Event Listener Otimizado Dinâmico
                    window.addEventListener('message', event => {
                        const data = event.data;
                        if (data.type === 'appendMessage') {
                            const m = data.message;
                            const alignment = m.fromMe ? 'align-self: flex-end;' : 'align-self: flex-start;';
                            const bgColor = m.fromMe ? '#005C4B' : 'var(--vscode-editor-inactiveSelectionBackground)';
                            const textColor = m.fromMe ? '#E9EDEF' : 'var(--vscode-foreground)';
                            const borderRadius = m.fromMe ? '8px 8px 0px 8px' : '8px 8px 8px 0px';
                            
                            const imgHtml = m.imagemBase64 ? \`<img src="\${m.imagemBase64}" style="max-width: 100%; max-height: 250px; border-radius: 6px; margin-bottom: 6px; display: block;" />\` : '';
                            const senderHtml = m.senderName ? \`<div style="font-size: 11px; font-weight: bold; color: #25D366; margin-bottom: 4px;">~ \${m.senderName}</div>\` : '';
                            
                            const msgDiv = document.createElement('div');
                            msgDiv.style.cssText = \`display:flex; flex-direction:column; \${alignment} max-width: 85%; margin-bottom: 8px;\`;
                            msgDiv.innerHTML = \`
                                <div style="background: \${bgColor}; color: \${textColor}; padding: 8px 12px; border-radius: \${borderRadius}; font-size: 13px; line-height: 1.4; word-wrap: break-word;">
                                    \${senderHtml}
                                    \${imgHtml}
                                    \${m.texto}
                                    <div style="font-size: 10px; opacity: 0.6; text-align: right; margin-top: 4px;">
                                        \${m.hora}
                                    </div>
                                </div>
                            \`;
                            if (container) {
                                // Apaga o vazio caso esteja na primeira mensagem
                                if (container.children.length === 1 && container.innerText.includes('Envie uma mensagem')) {
                                    container.innerHTML = '';
                                }
                                container.appendChild(msgDiv);
                                container.scrollTop = container.scrollHeight;
                            }
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}

let provider = null;

function activate(context) {
    provider = new WhatsAppViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('whatsapp.chatView', provider)
    );

    let startBotComando = vscode.commands.registerCommand('whatsappbot.start', async () => {
        if (client) {
            vscode.window.showInformationMessage('O bot do WhatsApp já está conectando/conectado.');
            return;
        }

        provider.setStatus('Aguardando QR');

        const authPath = path.join(context.globalStorageUri.fsPath, '.wwebjs_auth');
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }

        client = new Client({
            authStrategy: new LocalAuth({ dataPath: context.globalStorageUri.fsPath }),
            puppeteer: {
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                timeout: 60000 
            }
        });

        let botStartTime = Math.floor(Date.now() / 1000); // Grava a hora exata que tentou iniciar

        client.on('qr', async (qr) => {
            try {
                const qrImageBase64 = await qrcode.toDataURL(qr, { margin: 2, scale: 6 });
                provider.setStatus('Aguardando QR', qrImageBase64);
            } catch (err) {
                console.error('Erro no QRCode', err);
            }
        });

        client.on('ready', () => {
            // Atualiza o tempo de início para a hora exata que conectou, prevenindo atrasos de loading
            botStartTime = Math.floor(Date.now() / 1000); 
            
            provider.setStatus('Conectado');
            vscode.window.showInformationMessage('WhatsApp Bot conectado e lendo mensagens!');
        });

        // Evento que capita QUALQUER mensagem criada (tanto recebida, quanto enviada de outro aparelho)
        client.on('message_create', async (message) => {
            try {
                // ** AQUI ESTÁ A MÁGICA: Só aceita mensagens que chegaram DEPOIS do bot estar rodando! **
                if (message.timestamp < botStartTime) return;

                // Ignore mensagens que não são de chat normal (tipo status, etc.)
                if (message.isStatus) return;

                // Obtem o Chat dessa mensagem
                const chat = await message.getChat();
                
                // Obtém o contato real de quem disparou a mensagem
                const contact = await message.getContact();
                
                // Formatar hora
                const now = new Date(message.timestamp * 1000); // timestamp do whatsApp vem em segundos
                const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

                const contactInfo = {
                    name: chat.name || 'Desconhecido',
                    number: chat.id.user || 'Sem número'
                };

                let senderName = null;
                if (chat.isGroup && !message.fromMe) {
                    senderName = contact.pushname || contact.name || contact.number || 'Desconhecido';
                }

                let imagemBase64 = null;
                // Baixa e processa a mídia localmente se for uma imagem para renderizar na tela
                if (message.hasMedia) {
                    try {
                        const media = await message.downloadMedia();
                        if (media && media.mimetype && media.mimetype.startsWith('image/')) {
                            imagemBase64 = `data:${media.mimetype};base64,${media.data}`;
                        }
                    } catch (e) {
                        console.error('Falha ao baixar mídia', e);
                    }
                }

                const msgObj = {
                    texto: message.body || (message.hasMedia && !imagemBase64 ? '[Mídia Vídeo/Áudio]' : ''),
                    imagemBase64: imagemBase64,
                    hora: timeStr,
                    fromMe: message.fromMe,
                    senderName: senderName
                };
                
                provider.addMessage(chat.id._serialized, msgObj, contactInfo);
            } catch (error) {
                console.error('Erro msg:', error);
            }
        });

        client.on('disconnected', (reason) => {
            vscode.window.showErrorMessage('WhatsApp: Desconectado. Motivo: ' + reason);
            provider.setStatus('Desconectado');
            client = null;
        });

        client.initialize();
    });

    let stopBotComando = vscode.commands.registerCommand('whatsappbot.stop', async () => {
        if (client) {
            await client.destroy();
            client = null;
            provider.setStatus('Desconectado');
        }
    });

    let logoutBotComando = vscode.commands.registerCommand('whatsappbot.logout', async () => {
        if (client) {
            try { await client.destroy(); } catch (e) {}
            client = null;
        }
        
        // Remove as pastas de cache agressivamente para forçar que a sessão velha seja resetada e mostre um novo QR Code!
        const authPath = path.join(context.globalStorageUri.fsPath, '.wwebjs_auth');
        const cachePath = path.join(context.globalStorageUri.fsPath, '.wwebjs_cache');
        try {
            if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
            if (fs.existsSync(cachePath)) fs.rmSync(cachePath, { recursive: true, force: true });
            vscode.window.showInformationMessage('Sessão limpa perfeitamente! Inicie novamente para gerar o novo QR.');
        } catch(e) {
            console.error('Erro ao limpar cache', e);
        }
        
        provider.setStatus('Desconectado');
    });

    context.subscriptions.push(startBotComando, stopBotComando, logoutBotComando);
}

function deactivate() {
    if (client) {
        client.destroy();
    }
}

module.exports = {
    activate,
    deactivate
}
