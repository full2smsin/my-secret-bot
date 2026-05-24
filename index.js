const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const axios = require('axios');

const app = express();
app.use(express.json());

/* =========================================
   CONFIG
========================================= */

const token = "8739567989:AAG9y7YlA-A6VIEvJcyHdXzRoblJodZAwMk";
const my_chat_id = "5429869370";

const whatsapp_api_url =
    'https://whatsapp-sms-production.up.railway.app';

const whatsapp_api_token = '27031992';

const session_timeout = 300000;

/* =========================================
   FILES
========================================= */

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.json';
const search_lock_file = 'search_lock.json';
const whatsapp_mode_file = 'whatsapp_mode.json';

/* =========================================
   AUTO FILE CREATE
========================================= */

function ensureFile(file, data) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }
}

ensureFile(db_file, {});
ensureFile(config_file, { password: "2739" });
ensureFile(search_lock_file, {});
ensureFile(whatsapp_mode_file, {});
ensureFile(pending_file, {});

/* =========================================
   BOT
========================================= */

const bot = new NTB(token, { polling: true });

/* =========================================
   HELPERS (UNCHANGED)
========================================= */

function generateFileHash(fileId) {
    return crypto.createHash('sha256').update(fileId).digest('hex');
}

function encryptData(text, keyPassword) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(keyPassword, salt, 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedText, keyPassword) {
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return null;

        const salt = Buffer.from(parts[0], 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        const key = crypto.scryptSync(keyPassword, salt, 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (e) {
        return null;
    }
}

/* =========================================
   AUTO DELETE
========================================= */

function autoDeleteMessage(chatId, msgId) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(chatId.toString(), msgId);
        } catch (e) {}
    }, 60000);
}

/* =========================================
   SESSION
========================================= */

function checkSession() {
    try {
        if (
            fs.existsSync(session_file) &&
            !fs.existsSync(blocked_file)
        ) {
            let session_data =
                JSON.parse(fs.readFileSync(session_file));

            if (Date.now() - session_data.last_time < session_timeout) {
                session_data.last_time = Date.now();

                fs.writeFileSync(session_file, JSON.stringify(session_data));

                return true;
            }

            fs.unlinkSync(session_file);
        }
    } catch (e) {}

    return false;
}

/* =========================================
   FIXED WHATSAPP FUNCTION
========================================= */

async function sendToWhatsAppGreen(
    targetMobile,
    fileId,
    type,
    fileName
) {
    try {
        const ext = type === "photo" ? "jpg" : "pdf";

        const tgRes = await fetch(
            `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
        );

        const tgJson = await tgRes.json();

        if (!tgJson.ok) return false;

        const filePath = tgJson.result.file_path;

        const fileUrl =
            `https://api.telegram.org/file/bot${token}/${filePath}`;

        const fileResponse = await axios.get(fileUrl, {
            responseType: 'arraybuffer'
        });

        const mimeType =
            fileResponse.headers['content-type'] || 'application/octet-stream';

        const base64 =
            Buffer.from(fileResponse.data).toString('base64');

        const response = await fetch(
            whatsapp_api_url + '/send-file-base64',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-token': whatsapp_api_token
                },
                body: JSON.stringify({
                    number: '91' + String(targetMobile).replace(/\D/g, ''),
                    base64: base64,
                    mimeType: mimeType,
                    fileName: `${fileName}.${ext}`,
                    caption: `📁 ${fileName}`
                })
            }
        );

        const result = await response.json();

        console.log("WHATSAPP RESULT:", result);

        return result.status === 'success';

    } catch (e) {
        console.log("WHATSAPP ERROR:", e.message);
        return false;
    }
}

/* =========================================
   MESSAGE HANDLER
========================================= */

bot.on('message', async (msg) => {

    const chatId = msg.chat.id.toString();

    if (chatId !== my_chat_id) return;

    const text = msg.text ? msg.text.trim() : "";
    if (!text) return;

    const text_lower = text.toLowerCase();

    let config_data = JSON.parse(fs.readFileSync(config_file));
    let secret_password = config_data.password;

    let is_unlocked = checkSession();

    /* =========================================
       WHATSAPP MODE FIX
    ========================================= */

    let w_mode = JSON.parse(fs.readFileSync(whatsapp_mode_file));

    if (w_mode[chatId]) {

        let active_job = w_mode[chatId];

        let mobile = text.replace(/\D/g, '');   // ✅ FIXED

        if (!mobile || mobile.length < 10) {
            await bot.sendMessage(chatId, "❌ Invalid Number");
            return;
        }

        let sent = await sendToWhatsAppGreen(
            mobile,
            active_job.file_id,
            active_job.type,
            active_job.key
        );

        await bot.sendMessage(
            chatId,
            sent ? "✅ File Sent To WhatsApp" : "❌ WhatsApp Send Failed"
        );

        delete w_mode[chatId];
        fs.writeFileSync(whatsapp_mode_file, JSON.stringify(w_mode));

        return;
    }

    /* =========================================
       LOGIN CHECK
    ========================================= */

    if (!is_unlocked) {

        await bot.sendMessage(chatId, "🔒 Bot Locked");
        return;
    }

    /* =========================================
       SHOW FILES (SAMPLE SAME FLOW)
    ========================================= */

    if (text_lower === "show") {

        let vault = JSON.parse(fs.readFileSync(db_file));

        let keys = Object.keys(vault);

        if (!keys.length) {
            await bot.sendMessage(chatId, "📭 No Files");
            return;
        }

        let list = keys.map((k, i) => `${i + 1}. ${k}`).join("\n");

        await bot.sendMessage(chatId, "📂 Files\n\n" + list);

        return;
    }

    /* =========================================
       DEFAULT
    ========================================= */

    await bot.sendMessage(chatId, "❌ Command Not Found");
});

/* =========================================
   START SERVER
========================================= */

app.listen(10000, () => {
    console.log("BOT RUNNING");
});
