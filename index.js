const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

/* =========================================
   CONFIG
========================================= */

const token = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";
const my_chat_id = "5429869370";

const green_api_instance = "7107621313";
const green_api_token = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

const render_app_url = "https://my-secret-bot-o21u.onrender.com";

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
   CREATE FILES
========================================= */

function ensureFile(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
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

const bot = new NTB(token, {
    polling: true
});

/* =========================================
   HELPERS
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

    return `${salt.toString('hex')}:${iv.toString('hex')}:${encrypted}`;
}

function decryptData(encryptedText, keyPassword) {
    try {

        const parts = encryptedText.split(':');

        if (parts.length !== 3) {
            return null;
        }

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

    try {

        if (status === "lock") {

            await bot.setMyCommands([]);

        } else {

            await bot.setMyCommands([
                {
                    command: "show",
                    description: "Show files"
                },
                {
                    command: "lock",
                    description: "Lock bot"
                },
                {
                    command: "cleanall",
                    description: "Delete all files"
                }
            ]);
        }

    } catch (e) {}
}

function checkSession() {

    try {

        if (
            fs.existsSync(session_file) &&
            !fs.existsSync(blocked_file)
        ) {

            let data = JSON.parse(
                fs.readFileSync(session_file)
            );

            if (
                Date.now() - data.last_time <
                session_timeout
            ) {

                data.last_time = Date.now();

                fs.writeFileSync(
                    session_file,
                    JSON.stringify(data)
                );

                return true;
            }

            try {
                fs.unlinkSync(session_file);
            } catch (e) {}

            updateBotMenu("lock");
        }

    } catch (e) {}

    return false;
}

async function handleWrongAttempt(msg) {

    let attempts = 0;

    if (fs.existsSync(attempts_file)) {

        attempts = parseInt(
            fs.readFileSync(attempts_file, 'utf8')
        );
    }

    attempts++;

    fs.writeFileSync(
        attempts_file,
        attempts.toString()
    );

    let from = msg.from;

    let name =
        (from.first_name || '') +
        ' ' +
        (from.last_name || '');

    let username = from.username || 'No Username';

    let uid = from.id.toString();

    let log =
        `⚠️ Intruder Alert\n` +
        `Name: ${name}\n` +
        `Username: @${username}\n` +
        `ID: ${uid}\n\n`;

    fs.appendFileSync(log_file, log);

    if (uid !== my_chat_id) {

        try {

            await bot.sendMessage(
                my_chat_id,
                log
            );

        } catch (e) {}
    }

    if (attempts >= 3) {

        fs.writeFileSync(
            blocked_file,
            "locked"
        );

        updateBotMenu("lock");

        await bot.sendMessage(
            msg.chat.id,
            "🚨 BOT FREEZED"
        );
    }

    return attempts;
}

/* =========================================
   GREEN API SEND
========================================= */

async function sendToWhatsAppGreen(
    targetMobile,
    fileId,
    type,
    fileName
) {

    try {

        const ext =
            type === "photo"
                ? "jpg"
                : "pdf";

        const fileUrl =
            `${render_app_url}/download-vault-file?file_id=${encodeURIComponent(fileId)}&ext=.${ext}`;

        const url =
            `https://7105.api.greenapi.com/waInstance${green_api_instance}/sendFileByUrl/${green_api_token}`;

        const payload = {
            chatId: `${targetMobile}@c.us`,
            urlFile: fileUrl,
            fileName: `${fileName}.${ext}`,
            caption: `📁 ${fileName}`
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.idMessage) {
            return true;
        }

        return false;

    } catch (e) {

        return false;
    }
}

/* =========================================
   MESSAGE
========================================= */

bot.on('message', async (msg) => {

    const chatId = msg.chat.id.toString();

    if (chatId !== my_chat_id) {
        return;
    }

    const text =
        msg.text
            ? msg.text.trim()
            : "";

    const text_lower =
        text.toLowerCase();

    if (!text) {
        return;
    }

    const config = JSON.parse(
        fs.readFileSync(config_file)
    );

    const secret_password =
        config.password;

    let unlocked =
        checkSession();

    /* =========================
       UNBLOCK
    ========================= */

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

    /* =========================
       BLOCKED
    ========================= */

    if (fs.existsSync(blocked_file)) {

        await bot.sendMessage(
            chatId,
            "🚨 Bot Frozen"
        );

        return;
    }

    /* =========================
       WHATSAPP MODE
    ========================= */

    let w_mode = JSON.parse(
        fs.readFileSync(
            whatsapp_mode_file
        )
    );

    if (w_mode[chatId]) {

        let job =
            w_mode[chatId];

        let mobile =
            text.replace(/\D/g, '');

        if (mobile.length >= 10) {

            let sent =
                await sendToWhatsAppGreen(
                    mobile,
                    job.file_id,
                    job.type,
                    job.key
                );

            if (sent) {

                await bot.sendMessage(
                    chatId,
                    `✅ File Sent To WhatsApp`
                );

            } else {

                await bot.sendMessage(
                    chatId,
                    `❌ WhatsApp Send Failed`
                );
            }

        } else {

            await bot.sendMessage(
                chatId,
                `❌ Invalid Number`
            );
        }

        delete w_mode[chatId];

        fs.writeFileSync(
            whatsapp_mode_file,
            JSON.stringify(w_mode)
        );

        return;
    }

    /* =========================
       SEARCH LOCK
    ========================= */

    let s_lock = JSON.parse(
        fs.readFileSync(search_lock_file)
    );

    if (s_lock[chatId]) {

        if (text === secret_password) {

            let target_keys =
                s_lock[chatId];

            let vault =
                JSON.parse(
                    fs.readFileSync(db_file)
                );

            for (let key of target_keys) {

                if (vault[key]) {

                    let decrypted =
                        decryptData(
                            vault[key].file_id,
                            secret_password
                        );

                    if (decrypted) {

                        if (
                            vault[key].type === "photo"
                        ) {

                            await bot.sendPhoto(
                                chatId,
                                decrypted,
                                {
                                    caption: key
                                }
                            );

                        } else {

                            await bot.sendDocument(
                                chatId,
                                decrypted,
                                {
                                    caption: key
                                }
                            );
                        }

                        w_mode[chatId] = {
                            file_id: decrypted,
                            type: vault[key].type,
                            key: key
                        };

                        fs.writeFileSync(
                            whatsapp_mode_file,
                            JSON.stringify(w_mode)
                        );

                        await bot.sendMessage(
                            chatId,
                            "📲 WhatsApp Number Send Karo"
                        );
                    }
                }
            }

            delete s_lock[chatId];

            fs.writeFileSync(
                search_lock_file,
                JSON.stringify(s_lock)
            );

            return;

        } else {

            await bot.sendMessage(
                chatId,
                "❌ Wrong PIN"
            );

            return;
        }
    }

    /* =========================
       LOGIN
    ========================= */

    if (text === secret_password) {

        try {
            fs.unlinkSync(attempts_file);
        } catch (e) {}

        fs.writeFileSync(
            session_file,
            JSON.stringify({
                status: "unlocked",
                last_time: Date.now()
            })
        );

        updateBotMenu("unlock");

        await bot.sendMessage(
            chatId,
            "🔓 Bot Unlocked"
        );

        return;
    }

    /* =========================
       LOCK
    ========================= */

    if (
        text_lower === "lock" ||
        text_lower === "/lock"
    ) {

        try {
            fs.unlinkSync(session_file);
        } catch (e) {}

        updateBotMenu("lock");

        await bot.sendMessage(
            chatId,
            "🔒 Bot Locked"
        );

        return;
    }

    /* =========================
       WRONG PASS
    ========================= */

    if (!unlocked) {

        let current =
            await handleWrongAttempt(msg);

        let remaining =
            3 - current;

        if (remaining > 0) {

            await bot.sendMessage(
                chatId,
                `❌ Wrong Password\nAttempts Left: ${remaining}`
            );
        }

        return;
    }

    /* =========================
       SHOW
    ========================= */

    if (
        text_lower === "show" ||
        text_lower === "/show"
    ) {

        let vault =
            JSON.parse(
                fs.readFileSync(db_file)
            );

        if (
            Object.keys(vault).length === 0
        ) {

            await bot.sendMessage(
                chatId,
                "📭 No Files"
            );

            return;
        }

        let data =
            "📂 Files\n\n";

        let count = 1;

        for (let key in vault) {

            data +=
                `${count}. ${key}\n`;

            count++;
        }

        await bot.sendMessage(
            chatId,
            data
        );

        return;
    }

    /* =========================
       DELETE
    ========================= */

    if (
        text_lower.startsWith("del ")
    ) {

        let target =
            text_lower
                .replace("del ", '')
                .trim();

        let vault =
            JSON.parse(
                fs.readFileSync(db_file)
            );

        if (vault[target]) {

            delete vault[target];

            fs.writeFileSync(
                db_file,
                JSON.stringify(vault, null, 2)
            );

            await bot.sendMessage(
                chatId,
                "🗑 Deleted"
            );
        }

        return;
    }

    /* =========================
       CLEAN
    ========================= */

    if (
        text_lower === "clean all" ||
        text_lower === "/cleanall"
    ) {

        fs.writeFileSync(
            db_file,
            JSON.stringify({})
        );

        await bot.sendMessage(
            chatId,
            "🧹 All Cleaned"
        );

        return;
    }

    /* =========================
       CHANGE PIN
    ========================= */

    if (
        text_lower.startsWith("changepin ")
    ) {

        let parts =
            text.split(" ");

        if (parts.length === 3) {

            let old_pin =
                parts[1];

            let new_pin =
                parts[2];

            if (
                old_pin === secret_password
            ) {

                fs.writeFileSync(
                    config_file,
                    JSON.stringify({
                        password: new_pin
                    })
                );

                await bot.sendMessage(
                    chatId,
                    "✅ PIN Changed"
                );

            } else {

                await bot.sendMessage(
                    chatId,
                    "❌ Wrong Old PIN"
                );
            }
        }

        return;
    }

    /* =========================
       EDIT
    ========================= */

    if (
        text_lower.startsWith("edit ")
    ) {

        let parts =
            text.split(" ");

        if (parts.length === 3) {

            let old_name =
                parts[1]
                    .trim()
                    .toLowerCase();

            let new_name =
                parts[2]
                    .trim()
                    .toLowerCase();

            let vault =
                JSON.parse(
                    fs.readFileSync(db_file)
                );

            if (!vault[old_name]) {

                await bot.sendMessage(
                    chatId,
                    "❌ Old File Missing"
                );

                return;
            }

            if (vault[new_name]) {

                await bot.sendMessage(
                    chatId,
                    "❌ Duplicate Name"
                );

                return;
            }

            vault[new_name] =
                vault[old_name];

            delete vault[old_name];

            fs.writeFileSync(
                db_file,
                JSON.stringify(vault, null, 2)
            );

            await bot.sendMessage(
                chatId,
                "✅ Renamed"
            );
        }

        return;
    }

    /* =========================================
       PENDING FILE SAVE FIX
    ========================================= */

    if (fs.existsSync(pending_file)) {

        let pendingData =
            JSON.parse(
                fs.readFileSync(pending_file)
            );

        if (
            pendingData &&
            pendingData.file_id
        ) {

            let vault =
                JSON.parse(
                    fs.readFileSync(db_file)
                );

            let saveName =
                text_lower;

            if (vault[saveName]) {

                await bot.sendMessage(
                    chatId,
                    "⚠️ Duplicate Name"
                );

                return;
            }

            pendingData.file_id =
                encryptData(
                    pendingData.file_id,
                    secret_password
                );

            vault[saveName] =
                pendingData;

            fs.writeFileSync(
                db_file,
                JSON.stringify(vault, null, 2)
            );

            fs.writeFileSync(
                pending_file,
                JSON.stringify({})
            );

            await bot.sendMessage(
                chatId,
                `✅ Saved As ${saveName}`
            );

            return;
        }
    }

    /* =========================
       SEARCH
    ========================= */

    let vault =
        JSON.parse(
            fs.readFileSync(db_file)
        );

    let matched = [];

    for (let key in vault) {

        if (
            key.includes(text_lower)
        ) {

            matched.push(key);
        }
    }

    if (matched.length > 0) {

        let lock =
            JSON.parse(
                fs.readFileSync(search_lock_file)
            );

        lock[chatId] = matched;

        fs.writeFileSync(
            search_lock_file,
            JSON.stringify(lock)
        );

        let files =
            matched
                .map(x => `• ${x}`)
                .join("\n");

        await bot.sendMessage(
            chatId,
            `🔒 Files Found\n\n${files}\n\nPIN Send Karo`
        );

        return;
    }

    await bot.sendMessage(
        chatId,
        "❌ File Not Found"
    );
});

/* =========================================
   FILE HANDLER
========================================= */

bot.on(
    'document',
    async (msg) => {

        await handleIncomingFile(
            msg,
            'document',
            msg.document.file_id
        );
    }
);

bot.on(
    'photo',
    async (msg) => {

        await handleIncomingFile(
            msg,
            'photo',
            msg.photo[msg.photo.length - 1].file_id
        );
    }
);

async function handleIncomingFile(
    msg,
    type,
    file_id
) {

    const chatId =
        msg.chat.id.toString();

    if (chatId !== my_chat_id) {
        return;
    }

    if (!checkSession()) {

        await bot.sendMessage(
            chatId,
            "🔒 Unlock First"
        );

        return;
    }

    const config =
        JSON.parse(
            fs.readFileSync(config_file)
        );

    const secret_password =
        config.password;

    let vault =
        JSON.parse(
            fs.readFileSync(db_file)
        );

    let currentHash =
        generateFileHash(file_id);

    for (let key in vault) {

        if (
            vault[key].hash === currentHash
        ) {

            await bot.sendMessage(
                chatId,
                `⚠️ Duplicate File\nAlready Saved As ${key}`
            );

            return;
        }
    }

    let fileInfo = {
        file_id: file_id,
        type: type,
        hash: currentHash
    };

    /* =========================
       WITH CAPTION
    ========================= */

    if (
        msg.caption &&
        msg.caption.trim() !== ""
    ) {

        let saveKey =
            msg.caption
                .trim()
                .toLowerCase();

        if (vault[saveKey]) {

            await bot.sendMessage(
                chatId,
                "⚠️ Duplicate Name"
            );

            return;
        }

        fileInfo.file_id =
            encryptData(
                file_id,
                secret_password
            );

        vault[saveKey] =
            fileInfo;

        fs.writeFileSync(
            db_file,
            JSON.stringify(vault, null, 2)
        );

        await bot.sendMessage(
            chatId,
            `✅ Saved As ${saveKey}`
        );

    } else {

        /* =========================
           WITHOUT CAPTION FIXED
        ========================= */

        fs.writeFileSync(
            pending_file,
            JSON.stringify(fileInfo, null, 2)
        );

        await bot.sendMessage(
            chatId,
            "❓ File Name Batao"
        );
    }
}

/* =========================================
   DOWNLOAD API
========================================= */

app.get(
    '/download-vault-file',
    async (req, res) => {

        try {

            const fileId =
                req.query.file_id;

            if (!fileId) {

                return res
                    .status(400)
                    .send('Missing File ID');
            }

            const tgRes =
                await fetch(
                    `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
                );

            const tgJson =
                await tgRes.json();

            if (!tgJson.ok) {

                return res
                    .status(404)
                    .send('Telegram Error');
            }

            const filePath =
                tgJson.result.file_path;

            const fileUrl =
                `https://api.telegram.org/file/bot${token}/${filePath}`;

            const media =
                await fetch(fileUrl);

            res.setHeader(
                'Content-Type',
                media.headers.get('content-type')
            );

            media.body.pipe(res);

        } catch (e) {

            res
                .status(500)
                .send('Server Error');
        }
    }
);

/* =========================================
   ROOT
========================================= */

app.get('/', (req, res) => {

    res.send(
        'Bot Running Successfully'
    );
});

/* =========================================
   START
========================================= */

const PORT =
    process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(
        `Server Running On ${PORT}`
    );
});
