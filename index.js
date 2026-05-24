const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

const TOKEN = process.env.BOT_TOKEN || "8739567989:AAG9y7YlA-A6VIEvJcyHdXzRoblJodZAwMk";
const MY_CHAT_ID = "5429869370";

const WHATSAPP_API_URL = 'https://whatsapp-sms-production.up.railway.app';
const WHATSAPP_API_TOKEN = '27031992';

/* ================= SAFE BOT INIT (IMPORTANT FOR RENDER) ================= */

const bot = new TelegramBot(TOKEN, {
    polling: {
        interval: 2000,
        autoStart: true
    }
});

bot.on("polling_error", (err) => {
    console.log("POLLING ERROR:", err.code || err.message);
});

/* ================= FILE INIT (NON BLOCKING SAFE) ================= */

const db_file = 'vault.json';
const config_file = 'config.json';
const session_file = 'session.json';
const blocked_file = 'blocked.txt';

function safeRead(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file));
    } catch {
        return fallback;
    }
}

function safeWrite(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch {}
}

/* ================= INIT FILES ================= */

safeWrite(db_file, safeRead(db_file, {}));
safeWrite(config_file, safeRead(config_file, { password: "2739" }));

/* ================= SESSION ================= */

function checkSession() {
    try {
        const s = safeRead(session_file, null);
        if (!s) return false;

        return Date.now() - s.last_time < 300000;
    } catch {
        return false;
    }
}

/* ================= WHATSAPP SEND SAFE ================= */

async function sendToWhatsApp(number, fileId, name) {
    try {

        const tg = await axios.get(
            `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`
        );

        if (!tg.data.ok) return false;

        const url =
            `https://api.telegram.org/file/bot${TOKEN}/${tg.data.result.file_path}`;

        const file = await axios.get(url, { responseType: 'arraybuffer' });

        const base64 = Buffer.from(file.data).toString('base64');

        const res = await axios.post(
            WHATSAPP_API_URL + '/send-file-base64',
            {
                number: '91' + number.replace(/\D/g, ''),
                base64,
                mimeType: 'application/octet-stream',
                fileName: name,
                caption: name
            },
            {
                headers: {
                    'x-api-token': WHATSAPP_API_TOKEN,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        return res.data?.status === 'success';

    } catch (e) {
        console.log("WA ERROR:", e.message);
        return false;
    }
}

/* ================= BOT MESSAGE ================= */

bot.on('message', async (msg) => {

    try {

        const chatId = String(msg.chat.id);
        const text = (msg.text || "").trim();

        if (chatId !== MY_CHAT_ID) return;

        const config = safeRead(config_file, { password: "2739" });

        /* UNBLOCK */
        if (text.toLowerCase() === "unblock bot") {
            try { fs.unlinkSync(blocked_file); } catch {}
            return bot.sendMessage(chatId, "✅ Unblocked");
        }

        /* BLOCK CHECK */
        if (fs.existsSync(blocked_file)) {
            return bot.sendMessage(chatId, "🚨 Bot Frozen");
        }

        /* LOGIN */
        if (text === config.password) {
            safeWrite(session_file, { last_time: Date.now() });
            return bot.sendMessage(chatId, "🔓 Unlocked");
        }

        /* LOCK */
        if (text.toLowerCase() === "lock") {
            try { fs.unlinkSync(session_file); } catch {}
            return bot.sendMessage(chatId, "🔒 Locked");
        }

        if (!checkSession()) {
            return bot.sendMessage(chatId, "❌ Wrong Password");
        }

        return bot.sendMessage(chatId, "OK");

    } catch (e) {
        console.log("BOT ERROR:", e.message);
    }

});

/* ================= EXPRESS KEEP ALIVE (RENDER REQUIRED) ================= */

const express = require('express');
const app = express();

app.get("/", (req, res) => {
    res.send("BOT RUNNING");
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("SERVER RUNNING ON", PORT);
});
