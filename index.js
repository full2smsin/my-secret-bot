// Telegram Secure Vault Bot + Green API (Full Fixed Version)

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ================= CONFIG =================

const BOT_TOKEN = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";
const OWNER_ID = "5429869370";

const GREEN_INSTANCE_ID = "7107621313";
const GREEN_API_TOKEN = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

const PORT = process.env.PORT || 10000;

const SESSION_TIMEOUT = 300000;

// ================= FILES =================

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const session_file = 'bot_session.json';
const blocked_file = 'blocked.json';
const attempts_file = 'attempts.json';
const pending_file = 'pending.json';
const search_lock_file = 'search_lock.json';
const whatsapp_mode_file = 'whatsapp_mode.json';

// ================= CREATE FILES =================

function ensureFile(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    }
}

ensureFile(db_file, {});
ensureFile(config_file, { password: "2739" });
ensureFile(session_file, {});
ensureFile(blocked_file, {});
ensureFile(attempts_file, {});
ensureFile(pending_file, {});
ensureFile(search_lock_file, {});
ensureFile(whatsapp_mode_file, {});

// ================= BOT =================

const bot = new TelegramBot(BOT_TOKEN, {
    polling: true
});

// ================= HELPERS =================

function readJson(file) {
    return JSON.parse(fs.readFileSync(file));
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

function encryptData(text, password) {
    const iv = crypto.randomBytes(16);

    const key = crypto
        .createHash('sha256')
        .update(password)
        .digest();

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
}

function decryptData(text, password) {
    try {
        const parts = text.split(':');

        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];

        const key = crypto
            .createHash('sha256')
            .update(password)
            .digest();

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (e) {
        return null;
    }
}

function autoDelete(chatId, msgId) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(chatId, msgId);
        } catch (e) {}
    }, 60000);
}

function isUnlocked() {
    const session = readJson(session_file);

    if (!session.last_time) return false;

    return Date.now() - session.last_time < SESSION_TIMEOUT;
}

async function sendToWhatsApp(number, fileUrl, fileName) {
    try {
        const url = `https://7105.api.greenapi.com/waInstance${GREEN_INSTANCE_ID}/sendFileByUrl/${GREEN_API_TOKEN}`;

        const payload = {
            chatId: `${number}@c.us`,
            urlFile: fileUrl,
            fileName: fileName,
            caption: "Vault File"
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        return data.idMessage ? true : false;

    } catch (e) {
        return false;
    }
}

// ================= START =================

bot.on('message', async (msg) => {

    const chatId = msg.chat.id.toString();

    if (chatId !== OWNER_ID) return;

    const text = msg.text ? msg.text.trim() : "";

    const config = readJson(config_file);
    const PASSWORD = config.password;

    // ================= LOGIN =================

    if (text === PASSWORD) {

        writeJson(session_file, {
            last_time: Date.now()
        });

        const m = await bot.sendMessage(
            chatId,
            "🔓 Bot Unlocked Successfully"
        );

        autoDelete(chatId, m.message_id);

        return;
    }

    // ================= LOCK =================

    if (text.toLowerCase() === "/lock") {

        writeJson(session_file, {});

        const m = await bot.sendMessage(
            chatId,
            "🔒 Bot Locked"
        );

        autoDelete(chatId, m.message_id);

        return;
    }

    // ================= CHECK LOGIN =================

    if (!isUnlocked()) {

        const m = await bot.sendMessage(
            chatId,
            "🔑 Please Enter Password"
        );

        autoDelete(chatId, m.message_id);

        return;
    }

    // ================= SHOW =================

    if (text.toLowerCase() === "/show") {

        const vault = readJson(db_file);

        let message = "📂 Saved Files\n\n";

        let i = 1;

        for (let key in vault) {
            message += `${i}. ${key}\n`;
            i++;
        }

        const m = await bot.sendMessage(chatId, message);

        autoDelete(chatId, m.message_id);

        return;
    }

    // ================= DELETE =================

    if (text.toLowerCase().startsWith("del ")) {

        const name = text.substring(4).trim().toLowerCase();

        const vault = readJson(db_file);

        if (!vault[name]) {

            const m = await bot.sendMessage(
                chatId,
                "❌ File Not Found"
            );

            autoDelete(chatId, m.message_id);

            return;
        }

        delete vault[name];

        writeJson(db_file, vault);

        const m = await bot.sendMessage(
            chatId,
            "🗑 File Deleted"
        );

        autoDelete(chatId, m.message_id);

        return;
    }

    // ================= SEARCH =================

    const vault = readJson(db_file);

    if (vault[text.toLowerCase()]) {

        const file = vault[text.toLowerCase()];

        const decrypted = decryptData(
            file.file_id,
            PASSWORD
        );

        if (!decrypted) {

            const m = await bot.sendMessage(
                chatId,
                "❌ Decryption Failed"
            );

            autoDelete(chatId, m.message_id);

            return;
        }

        if (file.type === "photo") {

            const sent = await bot.sendPhoto(
                chatId,
                decrypted,
                {
                    caption: text
                }
            );

            autoDelete(chatId, sent.message_id);

        } else {

            const sent = await bot.sendDocument(
                chatId,
                decrypted,
                {
                    caption: text
                }
            );

            autoDelete(chatId, sent.message_id);
        }

        return;
    }

});

// ================= FILE SAVE =================

bot.on('document', async (msg) => {

    saveFile(msg, 'document', msg.document.file_id);

});

bot.on('photo', async (msg) => {

    const fileId = msg.photo[msg.photo.length - 1].file_id;

    saveFile(msg, 'photo', fileId);

});

async function saveFile(msg, type, fileId) {

    const chatId = msg.chat.id.toString();

    if (chatId !== OWNER_ID) return;

    if (!isUnlocked()) {

        await bot.sendMessage(
            chatId,
            "🔑 Unlock Bot First"
        );

        return;
    }

    const config = readJson(config_file);

    const PASSWORD = config.password;

    const vault = readJson(db_file);

    const caption = msg.caption
        ? msg.caption.trim().toLowerCase()
        : null;

    if (!caption) {

        await bot.sendMessage(
            chatId,
            "❌ Caption Required"
        );

        return;
    }

    if (vault[caption]) {

        await bot.sendMessage(
            chatId,
            "⚠ Duplicate Name"
        );

        return;
    }

    const hash = generateHash(fileId);

    for (let key in vault) {

        if (vault[key].hash === hash) {

            await bot.sendMessage(
                chatId,
                "⚠ Duplicate File"
            );

            return;
        }
    }

    vault[caption] = {
        file_id: encryptData(fileId, PASSWORD),
        type: type,
        hash: hash
    };

    writeJson(db_file, vault);

    await bot.sendMessage(
        chatId,
        "✅ File Saved Securely"
    );
}

// ================= ROOT =================

app.get('/', (req, res) => {

    res.send('Bot Running');

});

// ================= START SERVER =================

app.listen(PORT, () => {

    console.log(`Server running on ${PORT}`);

});
