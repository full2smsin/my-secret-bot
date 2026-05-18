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
   AUTO CREATE FILES
========================================= */

function ensureFile(file, data) {

    if (!fs.existsSync(file)) {

        fs.writeFileSync(
            file,
            JSON.stringify(data, null, 2)
        );
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

    return crypto
        .createHash('sha256')
        .update(fileId)
        .digest('hex');
}

function encryptData(text, keyPassword) {

    const salt =
        crypto.randomBytes(16);

    const key =
        crypto.scryptSync(
            keyPassword,
            salt,
            32
        );

    const iv =
        crypto.randomBytes(16);

    const cipher =
        crypto.createCipheriv(
            'aes-256-cbc',
            key,
            iv
        );

    let encrypted =
        cipher.update(
            text,
            'utf8',
            'hex'
        );

    encrypted +=
        cipher.final('hex');

    return (
        salt.toString('hex') +
        ':' +
        iv.toString('hex') +
        ':' +
        encrypted
    );
}

function decryptData(encryptedText, keyPassword) {

    try {

        const parts =
            encryptedText.split(':');

        if (parts.length !== 3) {
            return null;
        }

        const salt =
            Buffer.from(parts[0], 'hex');

        const iv =
            Buffer.from(parts[1], 'hex');

        const encrypted =
            parts[2];

        const key =
            crypto.scryptSync(
                keyPassword,
                salt,
                32
            );

        const decipher =
            crypto.createDecipheriv(
                'aes-256-cbc',
                key,
                iv
            );

        let decrypted =
            decipher.update(
                encrypted,
                'hex',
                'utf8'
            );

        decrypted +=
            decipher.final('utf8');

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

            await bot.deleteMessage(
                chatId.toString(),
                msgId
            );

        } catch (e) {}

    }, 60000);
}

/* =========================================
   MENU
========================================= */

async function updateBotMenu(status) {

    try {

        if (status === "lock") {

            await bot.setMyCommands([]);

        } else {

            await bot.setMyCommands([
                {
                    command: "show",
                    description: "Show Files"
                },
                {
                    command: "lock",
                    description: "Lock Bot"
                },
                {
                    command: "cleanall",
                    description: "Delete All Files"
                }
            ]);
        }

    } catch (e) {}
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
                JSON.parse(
                    fs.readFileSync(session_file)
                );

            if (
                Date.now() -
                session_data.last_time <
                session_timeout
            ) {

                session_data.last_time =
                    Date.now();

                fs.writeFileSync(
                    session_file,
                    JSON.stringify(session_data)
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

/* =========================================
   WRONG ATTEMPT
========================================= */

async function handleWrongAttempt(msg) {

    let attempts = 0;

    if (fs.existsSync(attempts_file)) {

        attempts =
            parseInt(
                fs.readFileSync(
                    attempts_file,
                    'utf8'
                )
            );
    }

    attempts++;

    fs.writeFileSync(
        attempts_file,
        attempts.toString()
    );

    let from = msg.from;

    let intruder_name =
        (from.first_name || '') +
        ' ' +
        (from.last_name || '');

    let intruder_username =
        from.username ||
        'No Username';

    let intruder_id =
        from.id.toString();

    let log_entry =
        `⚠️ Intruder Alert\n` +
        `Name: ${intruder_name}\n` +
        `User: @${intruder_username}\n` +
        `ID: ${intruder_id}\n\n`;

    fs.appendFileSync(
        log_file,
        log_entry
    );

    if (intruder_id !== my_chat_id) {

        try {

            await bot.sendMessage(
                my_chat_id,
                log_entry
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
            `${render_app_url}/download-vault-file?file_id=${encodeURIComponent(fileId)}`;

        const url =
            `https://api.green-api.com/waInstance${green_api_instance}/sendFileByUrl/${green_api_token}`;

        const payload = {

            chatId:
                `${targetMobile}@c.us`,

            urlFile:
                fileUrl,

            fileName:
                `${fileName}.${ext}`,

            caption:
                `📁 ${fileName}`
        };

        const response =
            await fetch(url, {

                method: "POST",

                headers: {
                    'Content-Type':
                        'application/json'
                },

                body:
                    JSON.stringify(payload)
            });

        const result =
            await response.json();

        console.log(result);

        if (result.idMessage) {
            return true;
        }

        return false;

    } catch (e) {

        console.log(e);

        return false;
    }
}

/* =========================================
   MESSAGE
========================================= */

bot.on('message', async (msg) => {

    const chatId =
        msg.chat.id.toString();

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

    let config_data =
        JSON.parse(
            fs.readFileSync(config_file)
        );

    let secret_password =
        config_data.password;

    let is_unlocked =
        checkSession();

    /* =========================================
       UNBLOCK
    ========================================= */

    if (text_lower === "unblock bot") {

        try {
            fs.unlinkSync(blocked_file);
        } catch (e) {}

        try {
            fs.unlinkSync(attempts_file);
        } catch (e) {}

        let reply =
            await bot.sendMessage(
                chatId,
                "✅ Bot Unblocked"
            );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

        return;
    }

    /* =========================================
       BLOCKED
    ========================================= */

    if (fs.existsSync(blocked_file)) {

        let reply =
            await bot.sendMessage(
                chatId,
                "🚨 Bot Frozen"
            );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

        return;
    }

    /* =========================================
       WHATSAPP MODE
    ========================================= */

    let w_mode =
        JSON.parse(
            fs.readFileSync(
                whatsapp_mode_file
            )
        );

    if (w_mode[chatId]) {

        let active_job =
            w_mode[chatId];

        let mobile =
            text.replace(/\D/g, '');

        if (mobile.length >= 10) {

            let wait_msg =
                await bot.sendMessage(
                    chatId,
                    `📲 Sending File To WhatsApp ${mobile}`
                );

            autoDeleteMessage(
                chatId,
                wait_msg.message_id
            );

            let sent =
                await sendToWhatsAppGreen(
                    mobile,
                    active_job.file_id,
                    active_job.type,
                    active_job.key
                );

            if (sent) {

                let ok =
                    await bot.sendMessage(
                        chatId,
                        "✅ File Sent To WhatsApp"
                    );

                autoDeleteMessage(
                    chatId,
                    ok.message_id
                );

            } else {

                let fail =
                    await bot.sendMessage(
                        chatId,
                        "❌ WhatsApp Send Failed"
                    );

                autoDeleteMessage(
                    chatId,
                    fail.message_id
                );
            }

        } else {

            let invalid =
                await bot.sendMessage(
                    chatId,
                    "❌ Invalid Number"
                );

            autoDeleteMessage(
                chatId,
                invalid.message_id
            );
        }

        delete w_mode[chatId];

        fs.writeFileSync(
            whatsapp_mode_file,
            JSON.stringify(w_mode)
        );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        return;
    }

    /* =========================================
       SEARCH LOCK
    ========================================= */

    let s_lock =
        JSON.parse(
            fs.readFileSync(
                search_lock_file
            )
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

                    let decrypted_file_id =
                        decryptData(
                            vault[key].file_id,
                            secret_password
                        );

                    if (decrypted_file_id) {

                        if (
                            vault[key].type === "photo"
                        ) {

                            let sent =
                                await bot.sendPhoto(
                                    chatId,
                                    decrypted_file_id,
                                    {
                                        caption:
                                            `📷 ${key}`
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
                                            `📄 ${key}`
                                    }
                                );

                            autoDeleteMessage(
                                chatId,
                                sent.message_id
                            );
                        }

                        w_mode[chatId] = {

                            file_id:
                                decrypted_file_id,

                            type:
                                vault[key].type,

                            key:
                                key
                        };

                        fs.writeFileSync(
                            whatsapp_mode_file,
                            JSON.stringify(w_mode)
                        );

                        let ask =
                            await bot.sendMessage(
                                chatId,
                                "📲 WhatsApp Number Send Karo"
                            );

                        autoDeleteMessage(
                            chatId,
                            ask.message_id
                        );
                    }
                }
            }

            delete s_lock[chatId];

            fs.writeFileSync(
                search_lock_file,
                JSON.stringify(s_lock)
            );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            return;

        } else {

            let wrong =
                await bot.sendMessage(
                    chatId,
                    "❌ Wrong PIN"
                );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            autoDeleteMessage(
                chatId,
                wrong.message_id
            );

            return;
        }
    }

    /* =========================================
       LOGIN
    ========================================= */

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

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

        return;
    }

    /* =========================================
       LOCK
    ========================================= */

    if (
        text_lower === "lock" ||
        text_lower === "/lock"
    ) {

        try {
            fs.unlinkSync(session_file);
        } catch (e) {}

        updateBotMenu("lock");

        let reply =
            await bot.sendMessage(
                chatId,
                "🔒 Bot Locked"
            );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

        return;
    }

    /* =========================================
       WRONG PASSWORD
    ========================================= */

    if (!is_unlocked) {

        let current_attempts =
            await handleWrongAttempt(msg);

        let remaining =
            3 - current_attempts;

        if (remaining > 0) {

            let reply =
                await bot.sendMessage(
                    chatId,
                    `❌ Wrong Password\n${remaining} Attempts Left`
                );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            autoDeleteMessage(
                chatId,
                reply.message_id
            );
        }

        return;
    }

    /* =========================================
       SHOW
    ========================================= */

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

            let reply =
                await bot.sendMessage(
                    chatId,
                    "📭 No Files Saved"
                );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            autoDeleteMessage(
                chatId,
                reply.message_id
            );

            return;
        }

        let list =
            "📂 Saved Files\n\n";

        let count = 1;

        for (let key in vault) {

            list +=
                `${count}. ${key} (${vault[key].type})\n`;

            count++;
        }

        let reply =
            await bot.sendMessage(
                chatId,
                list
            );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

        return;
    }

    /* =========================================
       DELETE
    ========================================= */

    if (
        text_lower.startsWith("del ")
    ) {

        let target =
            text_lower
                .substring(4)
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

            let reply =
                await bot.sendMessage(
                    chatId,
                    `🗑 Deleted ${target}`
                );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            autoDeleteMessage(
                chatId,
                reply.message_id
            );
        }

        return;
    }

    /* =========================================
       CLEAN ALL
    ========================================= */

    if (
        text_lower === "clean all" ||
        text_lower === "/cleanall"
    ) {

        fs.writeFileSync(
            db_file,
            JSON.stringify({})
        );

        let reply =
            await bot.sendMessage(
                chatId,
                "🧹 All Data Deleted"
            );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

        return;
    }

    /* =========================================
       CHANGE PIN
    ========================================= */

    if (
        text_lower.startsWith(
            "changepin "
        )
    ) {

        let parts =
            text.split(" ");

        if (parts.length === 3) {

            let old_pin =
                parts[1];

            let new_pin =
                parts[2];

            if (
                old_pin ===
                secret_password
            ) {

                fs.writeFileSync(
                    config_file,
                    JSON.stringify({
                        password: new_pin
                    })
                );

                let reply =
                    await bot.sendMessage(
                        chatId,
                        "✅ PIN Changed"
                    );

                autoDeleteMessage(
                    chatId,
                    msg.message_id
                );

                autoDeleteMessage(
                    chatId,
                    reply.message_id
                );

            } else {

                let reply =
                    await bot.sendMessage(
                        chatId,
                        "❌ Wrong Old PIN"
                    );

                autoDeleteMessage(
                    chatId,
                    msg.message_id
                );

                autoDeleteMessage(
                    chatId,
                    reply.message_id
                );
            }
        }

        return;
    }

    /* =========================================
       EDIT
    ========================================= */

    if (
        text_lower.startsWith(
            "edit "
        )
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

                let reply =
                    await bot.sendMessage(
                        chatId,
                        "❌ Old File Missing"
                    );

                autoDeleteMessage(
                    chatId,
                    msg.message_id
                );

                autoDeleteMessage(
                    chatId,
                    reply.message_id
                );

                return;
            }

            if (vault[new_name]) {

                let reply =
                    await bot.sendMessage(
                        chatId,
                        "❌ Duplicate Name"
                    );

                autoDeleteMessage(
                    chatId,
                    msg.message_id
                );

                autoDeleteMessage(
                    chatId,
                    reply.message_id
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

            let reply =
                await bot.sendMessage(
                    chatId,
                    "✅ Renamed"
                );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            autoDeleteMessage(
                chatId,
                reply.message_id
            );
        }

        return;
    }

    /* =========================================
       PENDING FILE SAVE
    ========================================= */

    if (fs.existsSync(pending_file)) {

        let pending_data =
            JSON.parse(
                fs.readFileSync(
                    pending_file
                )
            );

        if (
            pending_data &&
            pending_data.file_id
        ) {

            let vault =
                JSON.parse(
                    fs.readFileSync(db_file)
                );

            if (vault[text_lower]) {

                let reply =
                    await bot.sendMessage(
                        chatId,
                        "⚠️ Duplicate Name"
                    );

                autoDeleteMessage(
                    chatId,
                    msg.message_id
                );

                autoDeleteMessage(
                    chatId,
                    reply.message_id
                );

                return;
            }

            pending_data.file_id =
                encryptData(
                    pending_data.file_id,
                    secret_password
                );

            vault[text_lower] =
                pending_data;

            fs.writeFileSync(
                db_file,
                JSON.stringify(vault, null, 2)
            );

            fs.writeFileSync(
                pending_file,
                JSON.stringify({})
            );

            let reply =
                await bot.sendMessage(
                    chatId,
                    `✅ Saved As ${text_lower}`
                );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            autoDeleteMessage(
                chatId,
                reply.message_id
            );

            return;
        }
    }

    /* =========================================
       SEARCH
    ========================================= */

    let vault =
        JSON.parse(
            fs.readFileSync(db_file)
        );

    let matched_keys = [];

    for (let key in vault) {

        if (
            key.includes(text_lower)
        ) {

            matched_keys.push(key);
        }
    }

    if (matched_keys.length > 0) {

        let s_lock =
            JSON.parse(
                fs.readFileSync(
                    search_lock_file
                )
            );

        s_lock[chatId] =
            matched_keys;

        fs.writeFileSync(
            search_lock_file,
            JSON.stringify(s_lock)
        );

        let files_list =
            matched_keys
                .map(
                    k => `• ${k}`
                )
                .join("\n");

        let reply =
            await bot.sendMessage(
                chatId,
                `🔒 Files Found\n\n${files_list}\n\nPIN Send Karo`
            );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

        return;
    }

    let reply =
        await bot.sendMessage(
            chatId,
            "❌ File Not Found"
        );

    autoDeleteMessage(
        chatId,
        msg.message_id
    );

    autoDeleteMessage(
        chatId,
        reply.message_id
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
            msg.photo[
                msg.photo.length - 1
            ].file_id
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

        let reply =
            await bot.sendMessage(
                chatId,
                "🔒 Unlock Bot First"
            );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

        return;
    }

    let config_data =
        JSON.parse(
            fs.readFileSync(config_file)
        );

    let secret_password =
        config_data.password;

    let vault =
        JSON.parse(
            fs.readFileSync(db_file)
        );

    let current_hash =
        generateFileHash(file_id);

    for (let key in vault) {

        if (
            vault[key].hash ===
            current_hash
        ) {

            let reply =
                await bot.sendMessage(
                    chatId,
                    `⚠️ Duplicate File Already Saved As ${key}`
                );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            autoDeleteMessage(
                chatId,
                reply.message_id
            );

            return;
        }
    }

    let file_info = {

        file_id: file_id,

        type: type,

        hash: current_hash
    };

    /* =========================================
       WITH CAPTION
    ========================================= */

    if (
        msg.caption &&
        msg.caption.trim() !== ""
    ) {

        let save_key =
            msg.caption
                .trim()
                .toLowerCase();

        if (vault[save_key]) {

            let reply =
                await bot.sendMessage(
                    chatId,
                    "⚠️ Duplicate Name"
                );

            autoDeleteMessage(
                chatId,
                msg.message_id
            );

            autoDeleteMessage(
                chatId,
                reply.message_id
            );

            return;
        }

        file_info.file_id =
            encryptData(
                file_id,
                secret_password
            );

        vault[save_key] =
            file_info;

        fs.writeFileSync(
            db_file,
            JSON.stringify(vault, null, 2)
        );

        let reply =
            await bot.sendMessage(
                chatId,
                `✅ Saved As ${save_key}`
            );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
        );

    } else {

        /* =========================================
           WITHOUT CAPTION
        ========================================= */

        fs.writeFileSync(
            pending_file,
            JSON.stringify(
                file_info,
                null,
                2
            )
        );

        let reply =
            await bot.sendMessage(
                chatId,
                "❓ File Name Batao"
            );

        autoDeleteMessage(
            chatId,
            msg.message_id
        );

        autoDeleteMessage(
            chatId,
            reply.message_id
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
                media.headers.get(
                    'content-type'
                )
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
