const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

/* ================= CONFIG ================= */

const TOKEN = process.env.BOT_TOKEN || "8739567989:AAG9y7YlA-A6VIEvJcyHdXzRoblJodZAwMk";
const MY_CHAT_ID = "5429869370";

const WHATSAPP_API_URL = "https://whatsapp-sms-production.up.railway.app";
const WHATSAPP_API_TOKEN = "27031992";

/* ================= BOT (STABLE POLLING) ================= */

const bot = new TelegramBot(TOKEN, {
    polling: {
        interval: 2500,
        autoStart: true
    }
});

bot.on("polling_error", (err) => {
    console.log("POLL ERROR:", err.code || err.message);
});

/* ================= FILE HELPERS ================= */

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

/* ================= FILES ================= */

const DB = "vault.json";
const CONFIG = "config.json";
const SESSION = "session.json";
const BLOCKED = "blocked.txt";
const SEARCH_LOCK = "search_lock.json";
const WHATSAPP_MODE = "whatsapp_mode.json";

/* ================= INIT ================= */

write(DB, read(DB, {}));
write(CONFIG, read(CONFIG, { password: "2739" }));

/* ================= SESSION ================= */

function isSessionValid() {
    const s = read(SESSION, null);
    if (!s) return false;
    return Date.now() - s.last_time < 300000;
}

/* ================= WHATSAPP SEND ================= */

async function sendWhatsApp(number, fileId, name) {
    try {
        const tg = await axios.get(
            `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`
        );

        const fileUrl =
            `https://api.telegram.org/file/bot${TOKEN}/${tg.data.result.file_path}`;

        const file = await axios.get(fileUrl, {
            responseType: "arraybuffer",
            timeout: 20000
        });

        const base64 = Buffer.from(file.data).toString("base64");

        const res = await axios.post(
            WHATSAPP_API_URL + "/send-file-base64",
            {
                number: "91" + number.replace(/\D/g, ""),
                base64,
                mimeType: "application/octet-stream",
                fileName: name,
                caption: name
            },
            {
                headers: {
                    "x-api-token": WHATSAPP_API_TOKEN
                },
                timeout: 20000
            }
        );

        return res.data?.status === "success";

    } catch (e) {
        console.log("WA ERROR:", e.message);
        return false;
    }
}

/* ================= BOT ================= */

bot.on("message", async (msg) => {

    try {

        const chatId = String(msg.chat.id);
        const text = (msg.text || "").trim();
        const lower = text.toLowerCase();

        if (chatId !== MY_CHAT_ID) return;

        const config = read(CONFIG, { password: "2739" });

        /* ================= UNBLOCK ================= */
        if (lower === "unblock bot") {
            try { fs.unlinkSync(BLOCKED); } catch {}
            return bot.sendMessage(chatId, "✅ Unblocked");
        }

        /* ================= BLOCK CHECK ================= */
        if (fs.existsSync(BLOCKED)) {
            return bot.sendMessage(chatId, "🚨 Bot Frozen");
        }

        /* ================= LOGIN ================= */
        if (text === config.password) {
            write(SESSION, { last_time: Date.now() });
            return bot.sendMessage(chatId, "🔓 Unlocked");
        }

        /* ================= LOCK ================= */
        if (lower === "lock") {
            try { fs.unlinkSync(SESSION); } catch {}
            return bot.sendMessage(chatId, "🔒 Locked");
        }

        /* ================= SESSION CHECK ================= */
        if (!isSessionValid()) {
            return bot.sendMessage(chatId, "❌ Wrong Password");
        }

        /* ================= SHOW ================= */
        if (lower === "show") {
            const vault = read(DB, {});
            return bot.sendMessage(chatId,
                Object.keys(vault).join("\n") || "No Files"
            );
        }

        /* ================= DELETE ================= */
        if (lower.startsWith("del ")) {
            const key = lower.replace("del ", "");
            const vault = read(DB, {});
            delete vault[key];
            write(DB, vault);
            return bot.sendMessage(chatId, "🗑 Deleted");
        }

        /* ================= CLEAN ALL ================= */
        if (lower === "cleanall") {
            write(DB, {});
            return bot.sendMessage(chatId, "🧹 All Deleted");
        }

        /* ================= SEARCH ================= */

        const vault = read(DB, {});
        let matches = [];

        for (let k in vault) {
            if (k.includes(lower)) matches.push(k);
        }

        if (matches.length) {

            const lock = read(SEARCH_LOCK, {});
            lock[chatId] = matches;
            write(SEARCH_LOCK, lock);

            return bot.sendMessage(chatId,
                "🔒 Found:\n" + matches.join("\n")
            );
        }

        return bot.sendMessage(chatId, "❌ Not Found");

    } catch (e) {
        console.log("BOT ERROR:", e.message);
    }
});

/* ================= START ================= */

console.log("🚀 PRO BOT RUNNING");
