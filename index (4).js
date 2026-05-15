const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data'); 

// क्रैश से बचाने के लिए ग्लोबल एरर हैंडलर्स (Render Status 1 फिक्स करने के लिए)
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err.message));
process.on('unhandledRejection', (reason, p) => console.error('Unhandled Rejection:', reason));

const token = '7541620242:AAE65mYvP9jGAs4u8EksB_mS4Xp-L5O2oVs';

// Initialize bot with polling and error catching
const bot = new TelegramBot(token, { polling: true });
bot.on('polling_error', (error) => console.log('Telegram Polling Error:', error.message));

const algorithm = 'aes-256-cbc';
const secretKey = crypto.createHash('sha256').update('your-secret-salt-key').digest(); 
const ivLength = 16; 

const GREEN_API_URL = "https://green-api.com"; 
const GREEN_API_ID_INSTANCE = "7107621313"; 
const GREEN_API_API_TOKEN = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e"; 
const RENDER_APP_URL = "https://onrender.com";

const userSessions = {};
const app = express();
app.use(express.json());

function encrypt(text) {
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        return null;
    }
}

function autoDeleteMessage(chatId, messageId, delay = 60000) {
    setTimeout(() => {
        bot.deleteMessage(chatId, messageId).catch((err) => {});
    }, delay);
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🔐 *Welcome to Secure Vault Bot!*\n\nSend any file (Document, Photo, Video) to encrypt and secure it.\n\n⚠️ Privacy Alert: All instructions will auto-delete in 1 minute.", { parse_mode: 'Markdown' })
    .then((sentMsg) => autoDeleteMessage(chatId, sentMsg.message_id));
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;
    const caption = msg.caption || "Document";

    try {
        const encryptedFileId = encrypt(fileId);
        const responseText = `🔒 *File Encrypted Successfully!*\n\n📁 *Name:* \`${fileName}\`\n🔑 *Token:* \`${encryptedFileId}\`\n\nKeep this token safe.`;

        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
        
        const fileLink = await bot.getFileLink(fileId);
        userSessions[chatId] = {
            state: 'AWAITING_WHATSAPP_NUMBER',
            fileUrl: fileLink,
            fileName: fileName,
            caption: caption
        };

        bot.sendMessage(chatId, "📱 *क्या आप इस फ़ाइल को किसी WhatsApp नंबर पर भेजना चाहते हैं?*\n\nयदि हाँ, तो कृपया कंट्री कोड के साथ व्हाट्सएप नंबर टाइप करके भेजें (जैसे: `919876543210`)।");
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    } catch (error) {
        bot.sendMessage(chatId, "❌ Failed to process file.");
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    if (userSessions[chatId] && userSessions[chatId].state === 'AWAITING_WHATSAPP_NUMBER') {
        const session = userSessions[chatId];
        const inputNumber = text.replace(/[^0-9]/g, ''); 

        if (inputNumber.length >= 10) {
            bot.sendMessage(chatId, `⏳ फ़ाइल को व्हाट्सएप नंबर ${inputNumber} पर ट्रांसफर किया जा रहा है...`);
            
            // रेंडर के आंतरिक नेटवर्क में क्रैश से बचने के लिए लोकलहोस्ट लूपबैक का उपयोग
            const serverUrl = `http://127.0.0.1:${PORT}/download-vault-file`;
            
            await axios.get(serverUrl, {
                params: {
                    number: inputNumber,
                    caption: session.caption,
                    fileUrl: session.fileUrl,
                    fileName: session.fileName
                }
            }).then(() => {
                bot.sendMessage(chatId, "✅ फ़ाइल सफलतापूर्वक व्हाट्सएप पर भेज दी गई है!");
            }).catch((e) => {
                bot.sendMessage(chatId, "❌ व्हाट्सएप पर फ़ाइल भेजने में विफलता हुई।");
            });

            delete userSessions[chatId];
        } else {
            bot.sendMessage(chatId, "⚠️ कृपया एक वैध व्हाट्सएप नंबर दर्ज करें (जैसे: 919876543210)।");
        }
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        return;
    }

    if (text.includes(':')) {
        const decryptedFileId = decrypt(text);
        if (decryptedFileId) {
            const statusMsg = await bot.sendMessage(chatId, "🔓 Token Verified! Fetching file...");
            bot.sendDocument(chatId, decryptedFileId)
                .then(() => bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {}))
                .catch(() => bot.sendMessage(chatId, "❌ File expired."));
        }
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    }
});

app.get('/download-vault-file', async (req, res) => {
    const { number, caption, fileUrl, fileName } = req.query;
    if (!number || !fileUrl) return res.status(400).send("Missing parameters");

    try {
        const chatWhatsAppId = `${number.trim()}@c.us`;
        const response = await axios({ method: 'get', url: fileUrl, responseType: 'stream' });
        
        const form = new FormData();
        form.append('chatId', chatWhatsAppId);
        form.append('caption', caption || 'Document');
        form.append('fileName', fileName || 'file.txt');
        form.append('file', response.data, { filename: fileName || 'file.txt' });

        const greenApiEndpoint = `${GREEN_API_URL}/waInstance${GREEN_API_ID_INSTANCE}/sendFileByUpload/${GREEN_API_API_TOKEN}`;
        const greenResponse = await axios.post(greenApiEndpoint, form, { headers: { ...form.getHeaders() } });
        
        res.json(greenResponse.data);
    } catch (error) {
        res.status(500).send("Error uploading to Green API");
    }
});

app.get('/', (req, res) => res.send('Server is live and running perfectly!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Vault Server running on port ${PORT}`));
