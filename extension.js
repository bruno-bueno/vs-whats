const vscode = require('vscode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

let client = null;

// Provedor da nossa Visualização (Sidebar Webview)
class WhatsAppViewProvider {
    constructor(extensionUri, context) {
        this._extensionUri = extensionUri;
        this._context = context;
        this._view = null;
        this._messages = [];
        this._qrImageBase64 = null;
        this._status = 'Desconectado'; // 'Desconectado', 'Aguardando QR', 'Conectado'
    }

    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;

        // Permite rodar Javascript dentro do Webview (necessário para os botões)
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Renderiza o HTML inicial
        this._updateHtml();

        // Recebe mensagens (cliques em botões) de dentro do HTML
        webviewView.webview.onDidReceiveMessage(data => {
            if (data.type === 'start') {
                vscode.commands.executeCommand('whatsappbot.start');
            } else if (data.type === 'stop') {
                vscode.commands.executeCommand('whatsappbot.stop');
            }
        });
    }

    // Método para adicionar as mensagens recebidas na tela
    addMessage(msg) {
        this._messages.push(msg);
        // Mantém apenas as últimas 50 mensagens para não sobrecarregar
        if (this._messages.length > 50) this._messages.shift();
        this._updateHtml();
    }

    // Método para mudar o estado (QR Code, Conectado, etc)
    setStatus(status, qr = null) {
        this._status = status;
        this._qrImageBase64 = qr;
        
        // Se desconectar e reiniciar, limpa as mensagens
        if (status === 'Aguardando QR') {
            this._messages = []; 
        }

        this._updateHtml();
    }

    _updateHtml() {
        if (!this._view) return;
        
        let content = '';
        
        // --- TELA DEM DESCONECTADO ---
        if (this._status === 'Desconectado') {
            content = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:90vh; text-align:center;">
                    <h3 style="margin-bottom: 20px; color: var(--vscode-foreground);">WhatsApp Bot</h3>
                    <p style="opacity: 0.7; font-size: 13px;">O bot está parado no momento.</p>
                    <button id="startBtn" style="margin-top:20px; padding:8px 16px; background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:none; border-radius:4px; cursor:pointer;">Iniciar Bot</button>
                </div>
            `;
        } 
        // --- TELA DE LER QR CODE ---
        else if (this._status === 'Aguardando QR') {
            content = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:90vh; text-align:center;">
                    <h4 style="margin-bottom: 10px;">Escaneie para conectar</h4>
                    ${this._qrImageBase64 
                        ? `<div style="background:white; padding:10px; border-radius:8px;"><img src="${this._qrImageBase64}" style="width:100%; max-width:220px;" /></div>` 
                        : `<p style="opacity:0.7">Gerando QR...</p>`}
                    <button id="stopBtn" style="margin-top:20px; padding:8px 16px; background:var(--vscode-errorForeground); color:white; border:none; border-radius:4px; cursor:pointer;">Cancelar</button>
                </div>
            `;
        } 
        // --- TELA DO CHAT (MENSAGENS) ---
        else if (this._status === 'Conectado') {
            const msgsHtml = this._messages.map(m => `
                <div style="margin-bottom: 12px; padding: 10px; background: var(--vscode-editor-inactiveSelectionBackground); border-left: 3px solid #25D366; border-radius: 4px;">
                    <div style="font-weight: bold; font-size: 0.9em; margin-bottom: 4px; display:flex; justify-content:space-between;">
                        <span>${m.nome}</span>
                        <span style="font-size: 0.8em; opacity: 0.6; font-weight:normal">${m.hora}</span>
                    </div>
                    <div style="word-wrap: break-word; font-size: 13px; line-height:1.4;">${m.texto}</div>
                </div>
            `).join('');

            content = `
                <div style="display:flex; flex-direction:column; height: 100vh;">
                    <div style="padding: 10px; text-align:right; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); display:flex; justify-content: space-between; align-items:center;">
                        <span style="color: #25D366; font-weight:bold; font-size:12px;">✅ ON</span>
                        <button id="stopBtn" style="padding:4px 8px; background:transparent; border:1px solid var(--vscode-errorForeground); color:var(--vscode-errorForeground); border-radius:4px; cursor:pointer; font-size:11px;">Desconectar</button>
                    </div>
                    <div style="flex:1; overflow-y:auto; padding: 10px; padding-bottom: 30px;" id="msgContainer">
                        ${msgsHtml || '<div style="text-align:center; opacity:0.6; margin-top:30px; font-size:13px;">Aguardando mensagens...</div>'}
                    </div>
                </div>
                <script>
                    // Scroll automático para a última mensagem
                    const container = document.getElementById('msgContainer');
                    if (container) container.scrollTop = container.scrollHeight;
                </script>
            `;
        }

        this._view.webview.html = `
            <!DOCTYPE html>
            <html lang="pt-br">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>WhatsApp Preview</title>
                <style>
                    body { font-family: var(--vscode-font-family); margin: 0; padding: 0; background-color: var(--vscode-sideBar-background); color: var(--vscode-sideBar-foreground); }
                    * { box-sizing: border-box; }
                </style>
            </head>
            <body>
                ${content}
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    const startBtn = document.getElementById('startBtn');
                    if(startBtn) startBtn.addEventListener('click', () => vscode.postMessage({ type: 'start' }));

                    const stopBtn = document.getElementById('stopBtn');
                    if(stopBtn) stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
                </script>
            </body>
            </html>
        `;
    }
}

// Variáveis globais
let outputChannel = null;
let provider = null;

function activate(context) {
    // 1. Instancia nossa classe que cria a visualização Customizada e registra no VS Code
    provider = new WhatsAppViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('whatsapp.chatView', provider)
    );

    // 2. Registramos o comando de Iniciar
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
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            }
        });

        // Evento do QR Code
        client.on('qr', async (qr) => {
            try {
                // Ao invés do terminal, mandamos para o provider mostrar na tela
                const qrImageBase64 = await qrcode.toDataURL(qr, { margin: 2, scale: 6 });
                provider.setStatus('Aguardando QR', qrImageBase64);
            } catch (err) {
                console.error('Erro no QRCode', err);
            }
        });

        // Evento de Conexão com Sucesso
        client.on('ready', () => {
            provider.setStatus('Conectado');
            vscode.window.showInformationMessage('WhatsApp Bot conectado e lendo mensagens!');
        });

        // Evento de Recebimento de Mensagem
        client.on('message_create', async (message) => {
            try {
                const contact = await message.getContact();
                const now = new Date();
                const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

                const msgData = {
                    numero: contact.number,
                    nome: contact.pushname || contact.name || 'Desconhecido',
                    texto: message.body || '[Mídia ou sem texto]',
                    hora: timeStr
                };
                
                // Manda a mensagem direto para a tela do VS Code
                provider.addMessage(msgData);
            } catch (error) {
                console.error('Erro msg:', error);
            }
        });

        // Evento de Desconexão
        client.on('disconnected', (reason) => {
            vscode.window.showErrorMessage('WhatsApp: Desconectado. Motivo: ' + reason);
            provider.setStatus('Desconectado');
            client = null;
        });

        // Inicializa de verdade o puppeteer do bot
        client.initialize();
    });

    // 3. Registramos o comando de Parar
    let stopBotComando = vscode.commands.registerCommand('whatsappbot.stop', async () => {
        if (client) {
            await client.destroy();
            client = null;
            provider.setStatus('Desconectado');
        }
    });

    context.subscriptions.push(startBotComando, stopBotComando);
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
