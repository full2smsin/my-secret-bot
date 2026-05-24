const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const fetch = require('node-fetch');

/* ================= CONFIG ================= */

const token = process.env.BOT_TOKEN || "8739567989:AAG9y7YlA-A6VIEvJcyHdXzRoblJodZAwMk";
const my_chat_id = "5429869370";

const whatsapp_api_url = 'https://whatsapp-sms-production.up.railway.app';
const whatsapp_api_token = '27031992';

/* ================= BOT (FIXED POLLING) ================= */

const bot = new TelegramBot(token, {
    polling: {
        interval: 2000,
        autoStart: true
    }
});

bot.on("polling_error", (err) => {
    console.log("POLLING ERROR:", err.code || err.message);
});

/* ================= FILES ================= */

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.json';
const search_lock_file = 'search_lock.json';
const whatsapp_mode_file = 'whatsapp_mode.json';

/* ================= SAFE FILE READ ================= */

function read(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file));
    } catch {
        return fallback;
    }
}

function write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ================= INIT ================= */

write(db_file, read(db_file, {}));
write(config_file, read(config_file, { password: "2739" }));

/* ================= SESSION ================= */

function checkSession() {
    try {
        const s = read(session_file, null);
        if (!s) return false;

        return Date.now() - s.last_time < 300000;
    } catch {
        return false;
    }
}

/* ================= WHATSAPP SEND (FIX ONLY) ================= */

async function sendToWhatsAppGreen(number, fileId, type, name) {
    try {

        const tg = await axios.get(
            `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
        );

        const fileUrl =
            `https://api.telegram.org/file/bot${token}/${tg.data.result.file_path}`;

        const file = await axios.get(fileUrl, {
            responseType: 'arraybuffer'
        });

        const base64 = Buffer.from(file.data).toString('base64');

        const res = await axios.post(
            whatsapp_api_url + '/send-file-base64',
            {
                number: '91' + String(number).replace(/\D/g, ''),
                base64,
                mimeType: file.headers['content-type'] || 'application/octet-stream',
                fileName: name,
                caption: name
            },
            {
                headers: {
                    'x-api-token': whatsapp_api_token,
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

/* ================= BOT ================= */

bot.on('message', async (msg) => {

    const chatId = String(msg.chat.id);
    const text = (msg.text || "").trim();
    const lower = text.toLowerCase();

    if (chatId !== my_chat_id) return;

    const config = read(config_file, { password: "2739" });

    /* ================= UNBLOCK ================= */

    if (lower === "unblock bot") {
        try { fs.unlinkSync(blocked_file); } catch {}
        try { fs.unlinkSync(attempts_file); } catch {}

        write(session_file, { last_time: Date.now() });

        return bot.sendMessage(chatId, "✅ Unblocked");
    }

    /* ================= BLOCK CHECK ================= */

    if (fs.existsSync(blocked_file)) {
        return bot.sendMessage(chatId, "🚨 Bot Frozen");
    }

    /* ================= LOGIN ================= */

    if (text === config.password) {
        write(session_file, { last_time: Date.now() });
        return bot.sendMessage(chatId, "🔓 Unlocked");
    }

    /* ================= LOCK ================= */

    if (lower === "lock") {
        try { fs.unlinkSync(session_file); } catch {}
        return bot.sendMessage(chatId, "🔒 Locked");
    }

    /* ================= SESSION CHECK ================= */

    if (!checkSession()) {
        return bot.sendMessage(chatId, "❌ Wrong Password");
    }

    /* ================= SHOW ================= */

    if (lower === "show") {
        const vault = read(db_file, {});
        return bot.sendMessage(chatId,
            Object.keys(vault).join("\n") || "No Files"
        );
    }

    /* ================= SEARCH ================= */

    const vault = read(db_file, {});
    let matches = [];

    for (let k in vault) {
        if (k.includes(lower)) matches.push(k);
    }

    if (matches.length) {
        const lock = read(search_lock_file, {});
        lock[chatId] = matches;
        write(search_lock_file, lock);

        return bot.sendMessage(chatId, "🔒 Found:\n" + matches.join("\n"));
    }

    return bot.sendMessage(chatId, "❌ Not Found");
});

/* ================= START ================= */

console.log("BOT RUNNING");
