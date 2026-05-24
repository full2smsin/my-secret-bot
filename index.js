const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '200mb' }));

/* ================= CONFIG ================= */

const token = "8739567989:AAG9y7YlA-A6VIEvJcyHdXzRoblJodZAwMk";
const my_chat_id = "5429869370";

const whatsapp_api_base =
    "https://whatsapp-sms-production.up.railway.app";

const API_TOKEN = "27031992";
const session_timeout = 300000;

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

/* ================= INIT FILES ================= */

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

/* ================= BOT ================= */

const bot = new NTB(token, { polling: true });

/* ================= HELPERS ================= */

function generateFileHash(fileId) {
    return crypto.createHash('sha256').update(fileId).digest('hex');
}

function encrypt(text, key) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const k = crypto.scryptSync(key, salt, 32);

    const cipher = crypto.createCipheriv('aes-256-cbc', k, iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');

    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + enc;
}

function decrypt(text, key) {
    try {
        const [s, i, d] = text.split(':');
        const salt = Buffer.from(s, 'hex');
        const iv = Buffer.from(i, 'hex');
        const k = crypto.scryptSync(key, salt, 32);

        const decipher = crypto.createDecipheriv('aes-256-cbc', k, iv);
        let dec = decipher.update(d, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    } catch {
        return null;
    }
}

function sessionValid() {
    try {
        if (!fs.existsSync(session_file)) return false;

        const s = JSON.parse(fs.readFileSync(session_file));

        if (Date.now() - s.last < session_timeout) {
            s.last = Date.now();
            fs.writeFileSync(session_file, JSON.stringify(s));
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

/* ================= WHATSAPP (RAILWAY API ONLY) ================= */

async function sendToWhatsAppGreen(
    targetMobile,
    fileId,
    type,
    fileName
) {
    try {

        const cleanNumber =
            String(targetMobile).replace(/\D/g, '');

        const response = await fetch(
            `${whatsapp_api_base}/send-file-base64`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-token': API_TOKEN
                },
                body: JSON.stringify({
                    number: cleanNumber,
                    file_id: fileId,
                    type: type,
                    fileName: fileName
                })
            }
        );

        const result = await response.json();

        console.log("WA RESPONSE:", result);

        return result.status === "success";

    } catch (e) {
        console.log("WA ERROR:", e.message);
        return false;
    }
}

/* ================= MESSAGE HANDLER ================= */

bot.on('message', async (msg) => {

    const chatId = String(msg.chat.id);
    const text = (msg.text || "").trim().toLowerCase();

    if (chatId !== my_chat_id) return;

    const config = JSON.parse(fs.readFileSync(config_file));
    const pass = config.password;

    /* BLOCKED */
    if (fs.existsSync(blocked_file)) {
        return bot.sendMessage(chatId, "🚨 Bot Frozen");
    }

    /* LOGIN */
    if (text === pass) {
        fs.writeFileSync(session_file, JSON.stringify({
            last: Date.now()
        }));

        return bot.sendMessage(chatId, "🔓 Unlocked");
    }

    if (!sessionValid()) {
        return bot.sendMessage(chatId, "🔒 Enter Password");
    }

    /* SHOW */
    if (text === "show") {
        const vault = JSON.parse(fs.readFileSync(db_file));

        if (!Object.keys(vault).length) {
            return bot.sendMessage(chatId, "No Files");
        }

        return bot.sendMessage(
            chatId,
            Object.keys(vault).join("\n")
        );
    }

    /* SEARCH */
    const vault = JSON.parse(fs.readFileSync(db_file));
    const found = Object.keys(vault).filter(k =>
        k.includes(text)
    );

    if (found.length) {
        fs.writeFileSync(search_lock_file, JSON.stringify({
            [chatId]: found
        }));

        return bot.sendMessage(chatId,
            "Found:\n" + found.join("\n") + "\nSend PIN"
        );
    }

    bot.sendMessage(chatId, "Not Found");
});

/* ================= FILE HANDLER ================= */

bot.on('document', async (msg) =>
    handleFile(msg, msg.document.file_id, 'document')
);

bot.on('photo', async (msg) =>
    handleFile(msg, msg.photo[msg.photo.length - 1].file_id, 'photo')
);

async function handleFile(msg, fileId, type) {

    const chatId = String(msg.chat.id);

    if (chatId !== my_chat_id) return;

    if (!sessionValid()) {
        return bot.sendMessage(chatId, "Unlock first");
    }

    const vault = JSON.parse(fs.readFileSync(db_file));
    const key = msg.caption?.toLowerCase();

    if (!key) {
        fs.writeFileSync(pending_file, JSON.stringify({ fileId, type }));
        return bot.sendMessage(chatId, "Send file name");
    }

    vault[key] = {
        fileId: encrypt(fileId, "2739"),
        type
    };

    fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));

    bot.sendMessage(chatId, "Saved");
}

/* ================= WHATSAPP MODE ================= */

bot.on('message', async (msg) => {

    const chatId = String(msg.chat.id);
    const text = msg.text;

    if (!text) return;

    const wMode = JSON.parse(fs.readFileSync(whatsapp_mode_file));

    if (wMode[chatId]) {

        const mobile = text.replace(/\D/g, '');
        const data = wMode[chatId];

        const ok = await sendToWhatsAppGreen(
            mobile,
            data.fileId,
            data.type,
            data.key || "file"
        );

        delete wMode[chatId];
        fs.writeFileSync(whatsapp_mode_file, JSON.stringify(wMode));

        return bot.sendMessage(chatId,
            ok ? "Sent to WhatsApp" : "Failed"
        );
    }
});

/* ================= SERVER ================= */

app.get("/", (req, res) => {
    res.send("Bot Running");
});

app.listen(process.env.PORT || 10000, () => {
    console.log("Server Started");
});
