const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());

// ================= CONFIG =================

const token = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";
const my_chat_id = "5429869370";

// ================= GREEN API =================

const green_api_id_instance = "7107621313";
const green_api_token = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

// ================= SETTINGS =================

const session_timeout = 300000;

const render_app_url = "https://your-render-url.onrender.com";

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.txt';
const search_lock_file = 'search_lock.json';
const whatsapp_mode_file = 'whatsapp_mode.json';

if (!fs.existsSync(db_file)) fs.writeFileSync(db_file, JSON.stringify({}));
if (!fs.existsSync(config_file)) fs.writeFileSync(config_file, JSON.stringify({ password: "2739" }));
if (!fs.existsSync(search_lock_file)) fs.writeFileSync(search_lock_file, JSON.stringify({}));
if (!fs.existsSync(whatsapp_mode_file)) fs.writeFileSync(whatsapp_mode_file, JSON.stringify({}));

const bot = new NTB(token, { polling: true });

// ================= HASH =================

function generateFileHash(fileId) {
    return crypto.createHash('sha256').update(fileId).digest('hex');
}

// ================= ENCRYPTION =================

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

// ================= AUTO DELETE =================

function autoDeleteMessage(chatId, msgId) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(chatId.toString(), msgId);
        } catch (e) {}
    }, 60000);
}

// ================= MENU =================

async function updateBotMenu(status) {

    if (status === "lock") {

        await bot.setMyCommands([]);

    } else {

        const commands = [
            { command: "help", description: "Commands List" },
            { command: "all", description: "Show all files" },
            { command: "show", description: "Show vault" },
            { command: "lock", description: "Lock bot" },
            { command: "cleanall", description: "Delete all data" }
        ];

        await bot.setMyCommands(commands);
    }
}

// ================= SESSION =================

function checkSession() {

    if (fs.existsSync(session_file) && !fs.existsSync(blocked_file)) {

        let session_data = JSON.parse(fs.readFileSync(session_file));

        if (Date.now() - session_data.last_time < session_timeout) {

            session_data.last_time = Date.now();

            fs.writeFileSync(session_file, JSON.stringify(session_data));

            return true;

        } else {

            if (fs.existsSync(session_file)) {
                try {
                    fs.unlinkSync(session_file);
                } catch (e) {}
            }

            updateBotMenu("lock");
        }
    }

    return false;
}

// ================= WRONG PASSWORD =================

async function handleWrongAttempt(msg) {

    let attempts = fs.existsSync(attempts_file)
        ? parseInt(fs.readFileSync(attempts_file, 'utf8'))
        : 0;

    attempts++;

    fs.writeFileSync(attempts_file, attempts.toString());

    let from = msg.from;

    let intruder_name = (from.first_name || '') + ' ' + (from.last_name || '');

    let intruder_username = from.username || 'No Username';

    let intruder_id = from.id ? from.id.toString() : 'Unknown ID';

    let log_entry =
        `⚠️ Intruder Alert!\n` +
        `Name: ${intruder_name}\n` +
        `Username: @${intruder_username}\n` +
        `ID: ${intruder_id}\n` +
        `Time: ${new Date().toLocaleString()}\n\n`;

    fs.appendFileSync(log_file, log_entry);

    if (intruder_id !== my_chat_id) {

        await bot.sendMessage(
            my_chat_id,
            `🚨 Wrong password attempt!\n\n${log_entry}`
        );
    }

    if (attempts >= 3) {

        fs.writeFileSync(blocked_file, "locked");

        updateBotMenu("lock");

        await bot.sendMessage(
            msg.chat.id,
            "🚨 Bot frozen after 3 wrong attempts."
        );
    }

    return attempts;
}

// ================= GREEN API SEND =================

async function sendToWhatsAppGreen(targetMobile, fileId, type, fileName) {

    try {

        const ext = type === "photo" ? "jpg" : "pdf";

        const publicDownloadUrl =
            `${render_app_url}/download-vault-file?file_id=${encodeURIComponent(fileId)}&ext=.${ext}`;

        const url =
            `https://7105.api.greenapi.com/waInstance${green_api_id_instance}/sendFileByUrl/${green_api_token}`;

        const payload = {
            chatId: `${targetMobile}@c.us`,
            urlFile: publicDownloadUrl,
            fileName: `${fileName}.${ext}`,
            caption: `Vault File : ${fileName}`
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        console.log("GREEN API RESPONSE", data);

        return response.ok;

    } catch (e) {

        console.log("GREEN API ERROR", e);

        return false;
    }
}

// ================= MESSAGE HANDLER =================

bot.on('message', async (msg) => {

    const chatId = msg.chat.id.toString();

    if (chatId !== my_chat_id) return;

    const text = msg.text ? msg.text.trim() : "";
    const text_lower = text.toLowerCase();

    let config_data = JSON.parse(fs.readFileSync(config_file));

    let secret_password = config_data.password;

    if (!text) return;

    let is_unlocked = checkSession();

    // ================= UNBLOCK =================

    if (text_lower === "unblock bot") {

        if (fs.existsSync(blocked_file)) {
            try {
                fs.unlinkSync(blocked_file);
            } catch (e) {}
        }

        if (fs.existsSync(attempts_file)) {
            try {
                fs.unlinkSync(attempts_file);
            } catch (e) {}
        }

        await bot.sendMessage(chatId, "✅ Bot unblocked");

        return;
    }

    // ================= BLOCK CHECK =================

    if (fs.existsSync(blocked_file)) {

        await bot.sendMessage(chatId, "🚨 Bot is frozen");

        return;
    }

    // ================= WHATSAPP MODE =================

    let w_mode = JSON.parse(fs.readFileSync(whatsapp_mode_file));

    if (w_mode[chatId]) {

        let active_whatsapp_job = w_mode[chatId];

        let cleaned_number = text.replace(/[^0-9]/g, '');

        if (cleaned_number.length >= 10) {

            let status_msg = await bot.sendMessage(
                chatId,
                `⏳ Sending file to WhatsApp ${cleaned_number}`
            );

            let isSent = await sendToWhatsAppGreen(
                cleaned_number,
                active_whatsapp_job.file_id,
                active_whatsapp_job.type,
                active_whatsapp_job.key
            );

            if (isSent) {

                await bot.sendMessage(
                    chatId,
                    `✅ File sent on WhatsApp`
                );

            } else {

                await bot.sendMessage(
                    chatId,
                    `❌ Green API failed`
                );
            }

            autoDeleteMessage(chatId, status_msg.message_id);

        } else {

            let reply = await bot.sendMessage(
                chatId,
                "⚠️ Invalid mobile number"
            );

            autoDeleteMessage(chatId, reply.message_id);
        }

        delete w_mode[chatId];

        fs.writeFileSync(
            whatsapp_mode_file,
            JSON.stringify(w_mode)
        );

        return;
    }

    // ================= SEARCH LOCK =================

    let s_lock = JSON.parse(fs.readFileSync(search_lock_file));

    if (s_lock[chatId]) {

        if (text === secret_password) {

            let target_keys = s_lock[chatId];

            let vault = JSON.parse(fs.readFileSync(db_file));

            for (let key of target_keys) {

                if (vault[key]) {

                    let decrypted_file_id = decryptData(
                        vault[key].file_id,
                        secret_password
                    );

                    if (decrypted_file_id) {

                        if (vault[key].type === "photo") {

                            let sent = await bot.sendPhoto(
                                chatId,
                                decrypted_file_id,
                                {
                                    caption: `Decrypted : ${key}`
                                }
                            );

                            autoDeleteMessage(chatId, sent.message_id);

                        } else {

                            let sent = await bot.sendDocument(
                                chatId,
                                decrypted_file_id,
                                {
                                    caption: `Decrypted : ${key}`
                                }
                            );

                            autoDeleteMessage(chatId, sent.message_id);
                        }

                        let w_mode_data =
                            JSON.parse(
                                fs.readFileSync(whatsapp_mode_file)
                            );

                        w_mode_data[chatId] = {
                            file_id: decrypted_file_id,
                            type: vault[key].type,
                            key: key
                        };

                        fs.writeFileSync(
                            whatsapp_mode_file,
                            JSON.stringify(w_mode_data)
                        );

                        let ask_msg = await bot.sendMessage(
                            chatId,
                            "📲 Send WhatsApp number with country code"
                        );

                        autoDeleteMessage(chatId, ask_msg.message_id);
                    }
                }
            }

            fs.writeFileSync(
                session_file,
                JSON.stringify({
                    status: 'unlocked',
                    last_time: Date.now()
                })
            );

            updateBotMenu("unlock");

            delete s_lock[chatId];

            fs.writeFileSync(
                search_lock_file,
                JSON.stringify(s_lock)
            );

        } else {

            let reply = await bot.sendMessage(
                chatId,
                "❌ Wrong PIN"
            );

            autoDeleteMessage(chatId, reply.message_id);
        }

        return;
    }

    // ================= LOGIN =================

    if (text === secret_password) {

        if (fs.existsSync(attempts_file)) {
            try {
                fs.unlinkSync(attempts_file);
            } catch (e) {}
        }

        fs.writeFileSync(
            session_file,
            JSON.stringify({
                status: 'unlocked',
                last_time: Date.now()
            })
        );

        updateBotMenu("unlock");

        let reply = await bot.sendMessage(
            chatId,
            "🔓 Bot unlocked"
        );

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    // ================= LOCK =================

    if (text_lower === "lock" || text_lower === "/lock") {

        if (fs.existsSync(session_file)) {
            try {
                fs.unlinkSync(session_file);
            } catch (e) {}
        }

        updateBotMenu("lock");

        let reply = await bot.sendMessage(
            chatId,
            "🔒 Bot locked"
        );

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    // ================= LOCK CHECK =================

    if (!is_unlocked) {

        let current_attempts = await handleWrongAttempt(msg);

        let remaining = 3 - current_attempts;

        if (remaining > 0) {

            let reply = await bot.sendMessage(
                chatId,
                `❌ Wrong password. ${remaining} attempts left`
            );

            autoDeleteMessage(chatId, reply.message_id);
        }

        return;
    }

    // ================= SHOW =================

    if (
        text_lower === "show all" ||
        text_lower === "show" ||
        text_lower === "/show"
    ) {

        let vault = JSON.parse(fs.readFileSync(db_file));

        if (Object.keys(vault).length === 0) {

            let reply = await bot.sendMessage(
                chatId,
                "📭 No files found"
            );

            autoDeleteMessage(chatId, reply.message_id);

            return;
        }

        let list_all = "📂 Vault Files\n\n";

        let count = 1;

        for (let key in vault) {

            list_all += `${count}. ${key} (${vault[key].type})\n`;

            count++;
        }

        let reply = await bot.sendMessage(chatId, list_all);

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    // ================= SEARCH =================

    let vault = JSON.parse(fs.readFileSync(db_file));

    let matched_keys = [];

    for (let key in vault) {

        if (key.includes(text_lower)) {

            matched_keys.push(key);
        }
    }

    if (matched_keys.length > 0) {

        let s_lock = JSON.parse(fs.readFileSync(search_lock_file));

        s_lock[chatId] = matched_keys;

        fs.writeFileSync(
            search_lock_file,
            JSON.stringify(s_lock)
        );

        let files_list =
            matched_keys.map(k => `• ${k}`).join("\n");

        let reply = await bot.sendMessage(
            chatId,
            `🔒 Documents Found\n\n${files_list}\n\nSend PIN`
        );

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    let reply = await bot.sendMessage(
        chatId,
        `❌ No document found`
    );

    autoDeleteMessage(chatId, reply.message_id);
});

// ================= FILE UPLOAD =================

bot.on('document', async (msg) => {
    handleIncomingFile(msg, 'document', msg.document.file_id);
});

bot.on('photo', async (msg) => {
    handleIncomingFile(
        msg,
        'photo',
        msg.photo[msg.photo.length - 1].file_id
    );
});

async function handleIncomingFile(msg, type, file_id) {

    const chatId = msg.chat.id.toString();

    if (chatId !== my_chat_id) return;

    if (!checkSession()) {

        await bot.sendMessage(
            chatId,
            "🔑 Bot locked"
        );

        return;
    }

    let config_data = JSON.parse(fs.readFileSync(config_file));

    let secret_password = config_data.password;

    let vault = JSON.parse(fs.readFileSync(db_file));

    let current_file_hash = generateFileHash(file_id);

    for (let key in vault) {

        if (vault[key].hash === current_file_hash) {

            let reply = await bot.sendMessage(
                chatId,
                `⚠️ Duplicate file`
            );

            autoDeleteMessage(chatId, reply.message_id);

            return;
        }
    }

    let file_info = {
        file_id: file_id,
        type: type,
        hash: current_file_hash
    };

    if (msg.caption && msg.caption.trim() !== "") {

        let k_db = msg.caption.trim().toLowerCase();

        if (vault[k_db]) {

            let reply = await bot.sendMessage(
                chatId,
                `⚠️ Duplicate name`
            );

            autoDeleteMessage(chatId, reply.message_id);

            return;
        }

        file_info.file_id =
            encryptData(file_id, secret_password);

        vault[k_db] = file_info;

        fs.writeFileSync(
            db_file,
            JSON.stringify(vault, null, 2)
        );

        let reply = await bot.sendMessage(
            chatId,
            `🔒 Saved : ${msg.caption}`
        );

        autoDeleteMessage(chatId, reply.message_id);

    } else {

        fs.writeFileSync(
            pending_file,
            JSON.stringify(file_info)
        );

        let reply = await bot.sendMessage(
            chatId,
            "Send document name"
        );

        autoDeleteMessage(chatId, reply.message_id);
    }
}

// ================= DOWNLOAD API =================

app.get('/download-vault-file', async (req, res) => {

    const reqFileId = req.query.file_id;

    if (!reqFileId) {
        return res.status(400).send('Missing file id');
    }

    try {

        const getFileUrl =
            `https://api.telegram.org/bot${token}/getFile?file_id=${reqFileId}`;

        const fileRes = await fetch(getFileUrl);

        const fileJson = await fileRes.json();

        if (fileJson.ok) {

            const filePath = fileJson.result.file_path;

            const downloadUrl =
                `https://api.telegram.org/file/bot${token}/${filePath}`;

            const mediaRes = await fetch(downloadUrl);

            res.setHeader(
                'Content-Type',
                mediaRes.headers.get('content-type') ||
                'application/octet-stream'
            );

            mediaRes.body.pipe(res);

        } else {

            res.status(404).send('Telegram file error');
        }

    } catch (e) {

        console.log(e);

        res.status(500).send('Server Error');
    }
});

// ================= HOME =================

app.get('/', (req, res) => {
    res.send('Bot Running With Green API');
});

// ================= START =================

app.listen(process.env.PORT || 10000, () => {
    console.log("Server Started");
});
