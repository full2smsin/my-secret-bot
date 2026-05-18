const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ================= CONFIG =================

const token = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";
const my_chat_id = "5429869370";

const GREEN_API_INSTANCE = "7107621313";
const GREEN_API_TOKEN = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

const render_app_url = "https://my-secret-bot-o21u.onrender.com";

const session_timeout = 300000;

// ================= FILES =================

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.txt';
const search_lock_file = 'search_lock.json';
const whatsapp_mode_file = 'whatsapp_mode.json';

// ================= INIT =================

if (!fs.existsSync(db_file)) fs.writeFileSync(db_file, JSON.stringify({}));
if (!fs.existsSync(config_file)) fs.writeFileSync(config_file, JSON.stringify({ password: "2739" }));
if (!fs.existsSync(search_lock_file)) fs.writeFileSync(search_lock_file, JSON.stringify({}));
if (!fs.existsSync(whatsapp_mode_file)) fs.writeFileSync(whatsapp_mode_file, JSON.stringify({}));

const bot = new NTB(token, { polling: true });

// ================= HELPERS =================

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

function autoDeleteMessage(chatId, msgId) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(chatId.toString(), msgId);
        } catch (e) {}
    }, 60000);
}

async function updateBotMenu(status) {

    if (status === "lock") {
        await bot.setMyCommands([]);
    } else {

        const commands = [
            { command: "help", description: "All commands" },
            { command: "show", description: "Show saved files" },
            { command: "lock", description: "Lock bot" },
            { command: "cleanall", description: "Delete all data" }
        ];

        await bot.setMyCommands(commands);
    }
}

function checkSession() {

    if (fs.existsSync(session_file) && !fs.existsSync(blocked_file)) {

        let session_data = JSON.parse(fs.readFileSync(session_file));

        if (Date.now() - session_data.last_time < session_timeout) {

            session_data.last_time = Date.now();

            fs.writeFileSync(session_file, JSON.stringify(session_data));

            return true;

        } else {

            try {
                fs.unlinkSync(session_file);
            } catch (e) {}

            updateBotMenu("lock");
        }
    }

    return false;
}

async function handleWrongAttempt(msg) {

    let attempts = fs.existsSync(attempts_file)
        ? parseInt(fs.readFileSync(attempts_file, 'utf8'))
        : 0;

    attempts++;

    fs.writeFileSync(attempts_file, attempts.toString());

    let from = msg.from;

    let intruder_name =
        (from.first_name || '') + ' ' + (from.last_name || '');

    let intruder_username = from.username || 'No Username';

    let intruder_id = from.id
        ? from.id.toString()
        : 'Unknown';

    let log_entry =
        `⚠️ Intruder Alert\n` +
        `Name: ${intruder_name}\n` +
        `User: @${intruder_username}\n` +
        `ID: ${intruder_id}\n` +
        `Time: ${new Date().toLocaleString()}\n\n`;

    fs.appendFileSync(log_file, log_entry);

    if (intruder_id !== my_chat_id) {

        await bot.sendMessage(
            my_chat_id,
            `🚨 Wrong Password Alert\n\n${log_entry}`
        );
    }

    if (attempts >= 3) {

        fs.writeFileSync(blocked_file, "locked");

        updateBotMenu("lock");

        await bot.sendMessage(
            msg.chat.id,
            "🚨 SYSTEM FREEZE\n3 wrong password attempts."
        );
    }

    return attempts;
}

// ================= GREEN API =================

async function sendToWhatsAppGreen(targetMobile, fileId, type, fileName) {

    try {

        const fetch = (await import('node-fetch')).default;

        const ext = type === "photo" ? "jpg" : "pdf";

        const publicDownloadUrl =
            `${render_app_url}/download-vault-file?file_id=${encodeURIComponent(fileId)}&ext=.${ext}`;

        const endpoint =
            `https://api.green-api.com/waInstance${GREEN_API_INSTANCE}/sendFileByUrl/${GREEN_API_TOKEN}`;

        const payload = {
            chatId: `${targetMobile}@c.us`,
            urlFile: publicDownloadUrl,
            fileName: `${fileName}.${ext}`,
            caption: `Vault File: ${fileName}`
        };

        console.log(payload);

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        console.log(data);

        return response.ok;

    } catch (e) {

        console.log("GREEN API ERROR", e);

        return false;
    }
}

// ================= MESSAGE =================

bot.on('message', async (msg) => {

    const chatId = msg.chat.id.toString();

    if (chatId !== my_chat_id) return;

    const text = msg.text ? msg.text.trim() : "";

    if (!text) return;

    const text_lower = text.toLowerCase();

    let config_data =
        JSON.parse(fs.readFileSync(config_file));

    let secret_password = config_data.password;

    let is_unlocked = checkSession();

    // ================= UNBLOCK =================

    if (text_lower === "unblock bot") {

        try {
            fs.unlinkSync(blocked_file);
        } catch (e) {}

        try {
            fs.unlinkSync(attempts_file);
        } catch (e) {}

        await bot.sendMessage(
            chatId,
            "✅ Bot Unblocked"
        );

        return;
    }

    // ================= BLOCKED =================

    if (fs.existsSync(blocked_file)) {

        await bot.sendMessage(
            chatId,
            "🚨 Bot Frozen"
        );

        return;
    }

    // ================= WHATSAPP MODE =================

    let w_mode =
        JSON.parse(fs.readFileSync(whatsapp_mode_file));

    if (w_mode[chatId]) {

        let active_whatsapp_job = w_mode[chatId];

        let cleaned_number =
            text.replace(/[^0-9]/g, '');

        if (cleaned_number.length >= 10) {

            let status_msg =
                await bot.sendMessage(
                    chatId,
                    `📲 Sending to ${cleaned_number}`
                );

            let isSent =
                await sendToWhatsAppGreen(
                    cleaned_number,
                    active_whatsapp_job.file_id,
                    active_whatsapp_job.type,
                    active_whatsapp_job.key
                );

            if (isSent) {

                await bot.sendMessage(
                    chatId,
                    `✅ WhatsApp File Sent`
                );

            } else {

                await bot.sendMessage(
                    chatId,
                    `❌ WhatsApp Send Failed`
                );
            }

            autoDeleteMessage(chatId, status_msg.message_id);

        } else {

            let reply =
                await bot.sendMessage(
                    chatId,
                    "⚠️ Invalid Number"
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

    let s_lock =
        JSON.parse(fs.readFileSync(search_lock_file));

    if (s_lock[chatId]) {

        if (text === secret_password) {

            let target_keys = s_lock[chatId];

            let vault =
                JSON.parse(fs.readFileSync(db_file));

            for (let key of target_keys) {

                if (vault[key]) {

                    let decrypted_file_id =
                        decryptData(
                            vault[key].file_id,
                            secret_password
                        );

                    if (decrypted_file_id) {

                        if (vault[key].type === "photo") {

                            let sent =
                                await bot.sendPhoto(
                                    chatId,
                                    decrypted_file_id,
                                    {
                                        caption:
                                            `Decrypted: ${key}`
                                    }
                                );

                            autoDeleteMessage(
                                chatId,
                                sent.message_id
                            );

                        } else {

                            let sent =
                                await bot.sendDocument(
                                    chatId,
                                    decrypted_file_id,
                                    {
                                        caption:
                                            `Decrypted: ${key}`
                                    }
                                );

                            autoDeleteMessage(
                                chatId,
                                sent.message_id
                            );
                        }

                        let w_mode_data =
                            JSON.parse(
                                fs.readFileSync(
                                    whatsapp_mode_file
                                )
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

                        let ask_msg =
                            await bot.sendMessage(
                                chatId,
                                "📲 Send WhatsApp Number"
                            );

                        autoDeleteMessage(
                            chatId,
                            ask_msg.message_id
                        );
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

            let reply =
                await bot.sendMessage(
                    chatId,
                    "❌ Wrong PIN"
                );

            autoDeleteMessage(chatId, reply.message_id);
        }

        return;
    }

    // ================= LOGIN =================

    if (text === secret_password) {

        try {
            fs.unlinkSync(attempts_file);
        } catch (e) {}

        fs.writeFileSync(
            session_file,
            JSON.stringify({
                status: 'unlocked',
                last_time: Date.now()
            })
        );

        updateBotMenu("unlock");

        let reply =
            await bot.sendMessage(
                chatId,
                "🔓 Bot Unlocked"
            );

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    // ================= LOCK =================

    if (text_lower === "lock" || text_lower === "/lock") {

        try {
            fs.unlinkSync(session_file);
        } catch (e) {}

        updateBotMenu("lock");

        let reply =
            await bot.sendMessage(
                chatId,
                "🔒 Bot Locked"
            );

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    // ================= WRONG PASSWORD =================

    if (!is_unlocked) {

        let current_attempts =
            await handleWrongAttempt(msg);

        let remaining = 3 - current_attempts;

        if (remaining > 0) {

            let reply =
                await bot.sendMessage(
                    chatId,
                    `❌ Wrong Password\n${remaining} attempts left`
                );

            autoDeleteMessage(chatId, reply.message_id);
        }

        return;
    }

    // ================= CLEAN ALL =================

    if (
        text_lower === "clean all" ||
        text_lower === "/cleanall"
    ) {

        fs.writeFileSync(db_file, JSON.stringify({}));

        let reply =
            await bot.sendMessage(
                chatId,
                "🗑️ All Data Deleted"
            );

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    // ================= SHOW =================

    if (
        text_lower === "show" ||
        text_lower === "show all" ||
        text_lower === "/show"
    ) {

        let vault =
            JSON.parse(fs.readFileSync(db_file));

        if (Object.keys(vault).length === 0) {

            let reply =
                await bot.sendMessage(
                    chatId,
                    "📭 No Files"
                );

            autoDeleteMessage(chatId, reply.message_id);

            return;
        }

        let list_all = "🖼️ Saved Files\n\n";

        let count = 1;

        for (let key in vault) {

            list_all +=
                `${count}. ${key} (${vault[key].type})\n`;

            count++;
        }

        let reply =
            await bot.sendMessage(
                chatId,
                list_all
            );

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    // ================= SEARCH =================

    let vault =
        JSON.parse(fs.readFileSync(db_file));

    let matched_keys = [];

    for (let key in vault) {

        if (key.includes(text_lower)) {
            matched_keys.push(key);
        }
    }

    if (matched_keys.length > 0) {

        let s_lock =
            JSON.parse(fs.readFileSync(search_lock_file));

        s_lock[chatId] = matched_keys;

        fs.writeFileSync(
            search_lock_file,
            JSON.stringify(s_lock)
        );

        let files_list =
            matched_keys
                .map(k => `• ${k}`)
                .join("\n");

        let reply =
            await bot.sendMessage(
                chatId,
                `🔒 FILE LOCKED\n\n${files_list}\n\nSend PIN`
            );

        autoDeleteMessage(chatId, reply.message_id);

        return;
    }

    let reply =
        await bot.sendMessage(
            chatId,
            `❌ File Not Found`
        );

    autoDeleteMessage(chatId, reply.message_id);
});

// ================= FILE HANDLER =================

bot.on('document', async (msg) => {
    handleIncomingFile(
        msg,
        'document',
        msg.document.file_id
    );
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
            "🔒 Bot Locked"
        );

        return;
    }

    let config_data =
        JSON.parse(fs.readFileSync(config_file));

    let secret_password =
        config_data.password;

    let vault =
        JSON.parse(fs.readFileSync(db_file));

    let current_file_hash =
        generateFileHash(file_id);

    for (let key in vault) {

        if (vault[key].hash === current_file_hash) {

            let reply =
                await bot.sendMessage(
                    chatId,
                    `⚠️ Duplicate File`
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

        let k_db =
            msg.caption.trim().toLowerCase();

        if (vault[k_db]) {

            let reply =
                await bot.sendMessage(
                    chatId,
                    `⚠️ Duplicate Name`
                );

            autoDeleteMessage(chatId, reply.message_id);

            return;
        }

        file_info.file_id =
            encryptData(
                file_id,
                secret_password
            );

        vault[k_db] = file_info;

        fs.writeFileSync(
            db_file,
            JSON.stringify(vault, null, 2)
        );

        let reply =
            await bot.sendMessage(
                chatId,
                `🔒 Saved: ${msg.caption}`
            );

        autoDeleteMessage(chatId, reply.message_id);

    } else {

        fs.writeFileSync(
            pending_file,
            JSON.stringify(file_info)
        );

        let reply =
            await bot.sendMessage(
                chatId,
                "❓ Send File Name"
            );

        autoDeleteMessage(chatId, reply.message_id);
    }
}

// ================= DOWNLOAD =================

app.get('/download-vault-file', async (req, res) => {

    const fetch = (await import('node-fetch')).default;

    const reqFileId = req.query.file_id;

    if (!reqFileId) {
        return res.status(400).send('Missing file id');
    }

    try {

        const getFileUrl =
            `https://api.telegram.org/bot${token}/getFile?file_id=${reqFileId}`;

        const fileRes =
            await fetch(getFileUrl);

        const fileJson =
            await fileRes.json();

        if (!fileJson.ok) {
            return res.status(404).send('Telegram API Error');
        }

        const filePath =
            fileJson.result.file_path;

        const downloadUrl =
            `https://api.telegram.org/file/bot${token}/${filePath}`;

        const mediaRes =
            await fetch(downloadUrl);

        res.setHeader(
            'Content-Type',
            mediaRes.headers.get('content-type')
            || 'application/octet-stream'
        );

        mediaRes.body.pipe(res);

    } catch (e) {

        console.log(e);

        res.status(500).send('Server Error');
    }
});

// ================= ROOT =================

app.get('/', (req, res) => {
    res.send('Green API Vault Bot Running');
});

// ================= START =================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Server Running On ${PORT}`);
});
