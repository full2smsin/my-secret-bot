const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');
const axios = require('axios');

const TOKEN = "8739567989:AAG9y7YlA-A6VIEvJcyHdXzRoblJodZAwMk";
const MY_CHAT_ID = "5429869370";

const WHATSAPP_API_URL = "https://whatsapp-sms-production.up.railway.app";
const WHATSAPP_API_TOKEN = "27031992";

const bot = new TelegramBot(TOKEN, { polling: true });

/* ================= FILES ================= */

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.json';
const search_lock_file = 'search_lock.json';
const whatsapp_mode_file = 'whatsapp_mode.json';

/* ================= INIT ================= */

function ensure(file, data) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    }
}

ensure(db_file, {});
ensure(config_file, { password: "2739" });
ensure(search_lock_file, {});
ensure(whatsapp_mode_file, {});
ensure(pending_file, {});

/* ================= HELPERS ================= */

function hash(id) {
    return crypto.createHash('sha256').update(id).digest('hex');
}

function encrypt(text, pass) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(pass, salt, 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');

    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + enc;
}

function decrypt(text, pass) {
    try {
        const [salt, iv, data] = text.split(':');

        const key = crypto.scryptSync(pass, Buffer.from(salt, 'hex'), 32);

        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            key,
            Buffer.from(iv, 'hex')
        );

        let dec = decipher.update(data, 'hex', 'utf8');
        dec += decipher.final('utf8');

        return dec;
    } catch {
        return null;
    }
}

/* ================= SESSION ================= */

function checkSession() {
    try {
        if (fs.existsSync(session_file) && !fs.existsSync(blocked_file)) {
            const s = JSON.parse(fs.readFileSync(session_file));

            if (Date.now() - s.last_time < 300000) {
                s.last_time = Date.now();
                fs.writeFileSync(session_file, JSON.stringify(s));
                return true;
            }
        }
    } catch {}
    return false;
}

/* ================= WHATSAPP SEND (FIXED ONLY) ================= */

async function sendToWhatsAppGreen(number, fileId, type, name) {
    try {
        const tg = await fetch(
            `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`
        );

        const j = await tg.json();
        if (!j.ok) return false;

        const fileUrl =
            `https://api.telegram.org/file/bot${TOKEN}/${j.result.file_path}`;

        const file = await axios.get(fileUrl, {
            responseType: 'arraybuffer'
        });

        const base64 = Buffer.from(file.data).toString('base64');

        const res = await fetch(
            WHATSAPP_API_URL + '/send-file-base64',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-token': WHATSAPP_API_TOKEN
                },
                body: JSON.stringify({
                    number: '91' + String(number).replace(/\D/g, ''),
                    base64,
                    mimeType: file.headers['content-type'] || 'application/octet-stream',
                    fileName: name,
                    caption: name
                })
            }
        );

        const r = await res.json();
        return r.status === 'success';

    } catch (e) {
        console.log("WA ERROR:", e.message);
        return false;
    }
}

/* ================= MESSAGE ================= */

bot.on('message', async (msg) => {

    const chatId = msg.chat.id.toString();
    const text = (msg.text || "").trim();
    const lower = text.toLowerCase();

    if (chatId !== MY_CHAT_ID) return;

    /* ================= UNBLOCK ================= */

    if (lower === "unblock bot") {
        try { fs.unlinkSync(blocked_file); } catch {}
        try { fs.unlinkSync(attempts_file); } catch {}
        await bot.sendMessage(chatId, "✅ Bot Unblocked");
        return;
    }

    /* ================= BLOCK CHECK ================= */

    if (fs.existsSync(blocked_file)) {
        await bot.sendMessage(chatId, "🚨 Bot Frozen");
        return;
    }

    const config = JSON.parse(fs.readFileSync(config_file));
    const pass = config.password;

    /* ================= LOGIN ================= */

    if (text === pass) {
        fs.writeFileSync(session_file, JSON.stringify({ last_time: Date.now() }));
        await bot.sendMessage(chatId, "🔓 Unlocked");
        return;
    }

    /* ================= LOCK ================= */

    if (lower === "lock") {
        try { fs.unlinkSync(session_file); } catch {}
        await bot.sendMessage(chatId, "🔒 Locked");
        return;
    }

    if (!checkSession()) {
        await bot.sendMessage(chatId, "❌ Wrong Password");
        return;
    }

    /* ================= SHOW ================= */

    if (lower === "show") {
        const vault = JSON.parse(fs.readFileSync(db_file));
        return bot.sendMessage(chatId,
            Object.keys(vault).join("\n") || "No Files"
        );
    }

    /* ================= DEL ================= */

    if (lower.startsWith("del ")) {
        const key = lower.replace("del ", "").trim();
        const vault = JSON.parse(fs.readFileSync(db_file));

        delete vault[key];
        fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));

        return bot.sendMessage(chatId, "🗑 Deleted");
    }

    /* ================= CLEAN ALL ================= */

    if (lower === "cleanall") {
        fs.writeFileSync(db_file, JSON.stringify({}));
        return bot.sendMessage(chatId, "🧹 Cleaned");
    }

    /* ================= SEARCH ================= */

    const vault = JSON.parse(fs.readFileSync(db_file));
    let matches = [];

    for (let k in vault) {
        if (k.includes(lower)) matches.push(k);
    }

    if (matches.length) {
        const lock = JSON.parse(fs.readFileSync(search_lock_file));
        lock[chatId] = matches;
        fs.writeFileSync(search_lock_file, JSON.stringify(lock));

        return bot.sendMessage(chatId, "🔒 Found:\n" + matches.join("\n"));
    }

    return bot.sendMessage(chatId, "❌ Not Found");
});

/* ================= FILE HANDLER ================= */

bot.on('document', async (msg) => handleFile(msg, 'document'));
bot.on('photo', async (msg) => handleFile(msg, 'photo'));

async function handleFile(msg, type) {

    const chatId = msg.chat.id.toString();
    if (chatId !== MY_CHAT_ID) return;
    if (!checkSession()) return;

    const config = JSON.parse(fs.readFileSync(config_file));
    const pass = config.password;

    let file_id =
        type === 'photo'
            ? msg.photo[msg.photo.length - 1].file_id
            : msg.document.file_id;

    let key = (msg.caption || "").trim().toLowerCase();

    const vault = JSON.parse(fs.readFileSync(db_file));

    const data = {
        file_id: encrypt(file_id, pass),
        type
    };

    if (key) {
        vault[key] = data;
        fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));
        await bot.sendMessage(chatId, "✅ Saved " + key);
    }
}

/* ================= START ================= */

console.log("BOT RUNNING");
