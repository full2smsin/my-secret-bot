const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

//Replace with your actual bot token
const token = '7541620242:AAE65mYvP9jGAs4u8EksB_mS4Xp-L5O2oVs';

// Initialize bot with polling
const bot = new TelegramBot(token, { polling: true });

// Encryption configuration
const algorithm = 'aes-256-cbc';
const secretKey = crypto.createHash('sha256').update('your-secret-salt-key').digest(); // 32 bytes
const ivLength = 16; // AES block size

// --- Green API कॉन्फ़िगरेशन ---
const GREEN_API_URL = "https://green-api.com"; 
const GREEN_API_ID_INSTANCE = "7107621313"; 
const GREEN_API_API_TOKEN = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e"; 

// In-memory storage for user states and keys (लॉजिक स्टोर करने के लिए)
const userSessions = {};

const app = express();
app.use(express.json());

// Helper function to encrypt text
function encrypt(text) {
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Helper function to decrypt text
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

// Function to delete message after 60 seconds
function autoDeleteMessage(chatId, messageId, delay = 60000) {
    setTimeout(() => {
        bot.deleteMessage(chatId, messageId).catch((err) => {
            console.log(`Failed to delete message ${messageId}:`, err.message);
        });
    }, delay);
}

// Command: /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🔐 *Welcome to Secure Vault Bot!*\n\nSend any file (Document, Photo, Video) to encrypt and secure it.\n\n⚠️ Privacy Alert: All instructions will auto-delete in 1 minute.", { parse_mode: 'Markdown' })
    .then((sentMsg) => {
        autoDeleteMessage(chatId, sentMsg.message_id);
    });
});

// Handling Document Uploads (व्हाट्सएप नंबर पूछने का नया लॉजिक)
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name;
    const caption = msg.caption || "Document";

    try {
        // Encrypt the Telegram file_id
        const encryptedFileId = encrypt(fileId);

        const responseText = `🔒 *File Encrypted Successfully!*\n\n` +
                             `📁 *Name:* \`${fileName}\`\n` +
                             `🔑 *Token:* \`${encryptedFileId}\`\n\n` +
                             `Keep this token safe. Paste it here anytime to retrieve your file.`;

        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
        
        // यूजर का स्टेट और फाइल डेटा सेव करें ताकि नंबर आने पर इस्तेमाल हो सके
        const fileLink = await bot.getFileLink(fileId);
        userSessions[chatId] = {
            state: 'AWAITING_WHATSAPP_NUMBER',
            fileUrl: fileLink,
            fileName: fileName,
            caption: caption
        };

        // यूजर से व्हाट्सएप नंबर मांगें
        bot.sendMessage(chatId, "📱 *क्या आप इस फ़ाइल को किसी WhatsApp नंबर पर भेजना चाहते हैं?*\n\nयदि हाँ, तो कृपया कंट्री कोड के साथ व्हाट्सएप नंबर टाइप करके भेजें (जैसे: `919876543210`)। यदि नहीं भेजना चाहते, तो इस मैसेज को इग्नोर करें।", { parse_mode: 'Markdown' });

        // Original यूजर मैसेज डिलीट करना
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    } catch (error) {
        bot.sendMessage(chatId, "❌ Failed to encrypt file.").then((sentMsg) => {
            autoDeleteMessage(chatId, sentMsg.message_id);
        });
    }
});

// Handle Messages (Token डिक्रिप्शन और डायनेमिक व्हाट्सएप नंबर इनपुट दोनों के लिए)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/')) return;

    // लॉजिक: अगर यूजर का स्टेट व्हाट्सएप नंबर का इन्तजार कर रहा है
    if (userSessions[chatId] && userSessions[chatId].state === 'AWAITING_WHATSAPP_NUMBER') {
        const session = userSessions[chatId];
        const inputNumber = text.replace(/[^0-9]/g, ''); // सिर्फ नंबर्स रखें (+ या स्पेस हटाएं)

        if (inputNumber.length >= 10) {
            bot.sendMessage(chatId, `⏳ फ़ाइल को व्हाट्सएप नंबर ${inputNumber} पर ट्रांसफर किया जा रहा है...`);
            
            const serverUrl = `http://localhost:${PORT}/download-vault-file`;
            
            // आंतरिक एक्सप्रेस एंडपॉइंट को GET रिक्वेस्ट भेजना
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
                console.log("Forward error:", e.message);
                bot.sendMessage(chatId, "❌ व्हाट्सएप पर फ़ाइल भेजने में विफलता हुई।");
            });

            // काम होने के बाद यूजर का स्टेट साफ़ (Clear) करें
            delete userSessions[chatId];
        } else {
            bot.sendMessage(chatId, "⚠️ कृपया एक वैध व्हाट्सएप नंबर दर्ज करें (कंट्री कोड के साथ, जैसे: 919876543210)।");
        }
        
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
        return;
    }

    // पुराना लॉजिक: टोकन डिक्रिप्ट करने के लिए
    if (text.includes(':')) {
        const decryptedFileId = decrypt(text);

        if (decryptedFileId) {
            const statusMsg = await bot.sendMessage(chatId, "🔓 Token Verified! Fetching file from Vault...");
            
            bot.sendDocument(chatId, decryptedFileId)
                .then(() => {
                    bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
                })
                .catch((err) => {
                    bot.editMessageText("❌ File not found on Telegram servers or expired.", { chat_id: chatId, message_id: statusMsg.message_id });
                    autoDeleteMessage(chatId, statusMsg.message_id);
                });
        } else {
            bot.sendMessage(chatId, "🚫 Invalid Token. Access Denied.").then((sentMsg) => {
                autoDeleteMessage(chatId, sentMsg.message_id);
            });
        }
        
        bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    }
});

// एक्सप्रेस एंडपॉइंट जो GET क्वेरी से पूरी तरह डायनेमिक डेटा रिसीव करता है
app.get('/download-vault-file', async (req, res) => {
    const { number, caption, fileUrl, fileName } = req.query;
    
    if (!number || !fileUrl) {
        return res.status(400).send("Missing required parameters");
    }

    try {
        const chatWhatsAppId = `${number.trim()}@c.us`;

        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream'
        });
        
        const form = new FormData();
        form.append('chatId', chatWhatsAppId);
        form.append('caption', caption || 'Document');
        form.append('fileName', fileName || 'file.txt');
        form.append('file', response.data, { filename: fileName || 'file.txt' });

        const greenApiEndpoint = `${GREEN_API_URL}/waInstance${GREEN_API_ID_INSTANCE}/sendFileByUpload/${GREEN_API_API_TOKEN}`;
        
        const greenResponse = await axios.post(greenApiEndpoint, form, {
            headers: {
                ...form.getHeaders()
            }
        });
        
        res.json(greenResponse.data);
    } catch (error) {
        console.error("Green API Forward Error:", error.message);
        res.status(500).send("Error uploading file to Green API");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Vault Server running on port ${PORT}`);
});
