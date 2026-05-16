// index.js

const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();

app.use(express.json());

// 🔑 TELEGRAM CONFIG
const token = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";
const my_chat_id = "5429869370";
const session_timeout = 300000;

// 🟢 GREEN API CONFIG
const green_api_url = "https://7107.api.greenapi.com";
const idInstance = "7107621313";
const apiTokenInstance =
    "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

// 📁 FILES
const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const session_file = 'bot_session.txt';
const whatsapp_mode_file = 'whatsapp_mode.json';
const search_lock_file = 'search_lock.json';
const pending_file = 'pending_file.txt';

// 📂 INIT FILES
if (!fs.existsSync(db_file))
    fs.writeFileSync(db_file, JSON.stringify({}));

if (!fs.existsSync(config_file))
    fs.writeFileSync(
        config_file,
        JSON.stringify({ password: "2739" })
    );

if (!fs.existsSync(whatsapp_mode_file))
    fs.writeFileSync(
        whatsapp_mode_file,
        JSON.stringify({})
    );

if (!fs.existsSync(search_lock_file))
    fs.writeFileSync(
        search_lock_file,
        JSON.stringify({})
    );

// 🤖 BOT
const bot = new NTB(token, {
    polling: {
        interval: 1000,
        autoStart: true
    }
});

// 🔒 ENCRYPT
function encryptData(text, password) {

    const salt = crypto.randomBytes(16);

    const key = crypto.scryptSync(
        password,
        salt,
        32
    );

    const iv = crypto.randomBytes(16);

    const cipher =
        crypto.createCipheriv(
            'aes-256-cbc',
            key,
            iv
        );

    let encrypted =
        cipher.update(text, 'utf8', 'hex');

    encrypted += cipher.final('hex');

    return (
        salt.toString('hex')
        + ':'
        + iv.toString('hex')
        + ':'
        + encrypted
    );
}

// 🔓 DECRYPT
function decryptData(encryptedText, password) {

    try {

        const parts =
            encryptedText.split(':');

        if (parts.length !== 3)
            return null;

        const salt =
            Buffer.from(parts[0], 'hex');

        const iv =
            Buffer.from(parts[1], 'hex');

        const encrypted = parts[2];

        const key =
            crypto.scryptSync(
                password,
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

        decrypted += decipher.final('utf8');

        return decrypted;

    } catch (e) {

        return null;
    }
}

// 🗑 AUTO DELETE
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

// 🔐 SESSION
function checkSession() {

    if (!fs.existsSync(session_file))
        return false;

    let session =
        JSON.parse(
            fs.readFileSync(session_file)
        );

    if (
        Date.now() - session.last_time
        < session_timeout
    ) {

        session.last_time = Date.now();

        fs.writeFileSync(
            session_file,
            JSON.stringify(session)
        );

        return true;
    }

    return false;
}

// 🟢 SEND FILE TO WHATSAPP
async function sendToWhatsAppGreen(
    targetMobile,
    fileId,
    type,
    fileName
) {

    try {

        // 📥 TELEGRAM FILE PATH
        const tgApi =
            `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;

        const fileRes =
            await fetch(tgApi);

        const fileJson =
            await fileRes.json();

        if (!fileJson.ok)
            return false;

        const filePath =
            fileJson.result.file_path;

        // 📎 TELEGRAM FILE URL
        const telegramFileUrl =
            `https://api.telegram.org/file/bot${token}/${filePath}`;

        // 📱 CHAT ID
        const chatId =
            `${targetMobile}@c.us`;

        // 🌐 GREEN API URL
        const apiEndpoint =
            `${green_api_url}/waInstance${idInstance}/sendFileByUrl/${apiTokenInstance}`;

        // 📦 PAYLOAD
        let payload = {

            chatId: chatId,

            urlFile: telegramFileUrl,

            fileName:
                type === "photo"
                ? `${fileName}.jpg`
                : `${fileName}.pdf`,

            caption:
                `📁 ${fileName}`
        };

        // 🚀 SEND
        const response =
            await fetch(apiEndpoint, {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(payload)
            });

        const result =
            await response.json();

        console.log(result);

        return response.ok;

    } catch (e) {

        console.log(e);

        return false;
    }
}

// 📨 MESSAGE HANDLER
bot.on('message', async (msg) => {

    const chatId =
        msg.chat.id.toString();

    if (chatId !== my_chat_id)
        return;

    const text =
        msg.text
        ? msg.text.trim()
        : "";

    const text_lower =
        text.toLowerCase();

    let config =
        JSON.parse(
            fs.readFileSync(config_file)
        );

    let secret_password =
        config.password;

    // 🔓 LOGIN
    if (text === secret_password) {

        fs.writeFileSync(
            session_file,
            JSON.stringify({
                unlocked: true,
                last_time: Date.now()
            })
        );

        let r =
            await bot.sendMessage(
                chatId,
                "🔓 Bot Unlocked"
            );

        autoDeleteMessage(
            chatId,
            r.message_id
        );

        return;
    }

    // 🔒 LOCK
    if (
        text_lower === "lock"
        || text_lower === "/lock"
    ) {

        if (
            fs.existsSync(session_file)
        ) {
            fs.unlinkSync(session_file);
        }

        let r =
            await bot.sendMessage(
                chatId,
                "🔒 Bot Locked"
            );

        autoDeleteMessage(
            chatId,
            r.message_id
        );

        return;
    }

    // 🚫 NOT LOGGED IN
    if (!checkSession()) {

        let r =
            await bot.sendMessage(
                chatId,
                "🔑 PIN bhejo"
            );

        autoDeleteMessage(
            chatId,
            r.message_id
        );

        return;
    }

    // 🟢 WHATSAPP MODE
    let wmode =
        JSON.parse(
            fs.readFileSync(
                whatsapp_mode_file
            )
        );

    if (wmode[chatId]) {

        let active =
            wmode[chatId];

        let number =
            text.replace(/[^0-9]/g, '');

        if (number.length >= 10) {

            let status =
                await bot.sendMessage(
                    chatId,
                    "⏳ Sending..."
                );

            let isSent =
                await sendToWhatsAppGreen(
                    number,
                    active.file_id,
                    active.type,
                    active.key
                );

            if (isSent) {

                await bot.sendMessage(
                    chatId,
                    "✅ WhatsApp Sent"
                );

            } else {

                await bot.sendMessage(
                    chatId,
                    "❌ WhatsApp Failed"
                );
            }

            autoDeleteMessage(
                chatId,
                status.message_id
            );

        } else {

            await bot.sendMessage(
                chatId,
                "⚠️ Invalid Number"
            );
        }

        delete wmode[chatId];

        fs.writeFileSync(
            whatsapp_mode_file,
            JSON.stringify(wmode)
        );

        return;
    }

    // 🔍 SEARCH LOCK
    let search_lock =
        JSON.parse(
            fs.readFileSync(
                search_lock_file
            )
        );

    if (search_lock[chatId]) {

        if (text === secret_password) {

            let vault =
                JSON.parse(
                    fs.readFileSync(db_file)
                );

            let target_keys =
                search_lock[chatId];

            for (let key of target_keys) {

                let data =
                    vault[key];

                let decrypted =
                    decryptData(
                        data.file_id,
                        secret_password
                    );

                if (data.type === "photo") {

                    await bot.sendPhoto(
                        chatId,
                        decrypted,
                        {
                            caption:
                                `📸 ${key}`
                        }
                    );

                } else {

                    await bot.sendDocument(
                        chatId,
                        decrypted,
                        {
                            caption:
                                `📄 ${key}`
                        }
                    );
                }

                let wm =
                    JSON.parse(
                        fs.readFileSync(
                            whatsapp_mode_file
                        )
                    );

                wm[chatId] = {

                    file_id: decrypted,

                    type: data.type,

                    key: key
                };

                fs.writeFileSync(
                    whatsapp_mode_file,
                    JSON.stringify(wm)
                );

                await bot.sendMessage(
                    chatId,
                    "📲 WhatsApp number bhejo"
                );
            }

            delete search_lock[chatId];

            fs.writeFileSync(
                search_lock_file,
                JSON.stringify(search_lock)
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

    // 💾 SAVE PENDING FILE
    if (fs.existsSync(pending_file)) {

        let pending =
            JSON.parse(
                fs.readFileSync(pending_file)
            );

        let vault =
            JSON.parse(
                fs.readFileSync(db_file)
            );

        let key =
            text_lower;

        if (vault[key]) {

            await bot.sendMessage(
                chatId,
                "⚠️ Duplicate Name"
            );

            return;
        }

        pending.file_id =
            encryptData(
                pending.file_id,
                secret_password
            );

        vault[key] = pending;

        fs.writeFileSync(
            db_file,
            JSON.stringify(vault, null, 2)
        );

        fs.unlinkSync(pending_file);

        await bot.sendMessage(
            chatId,
            `✅ Saved ${key}`
        );

        return;
    }

    // 🔍 SEARCH
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

        let s =
            JSON.parse(
                fs.readFileSync(
                    search_lock_file
                )
            );

        s[chatId] = matched;

        fs.writeFileSync(
            search_lock_file,
            JSON.stringify(s)
        );

        await bot.sendMessage(
            chatId,
            "🔒 PIN bhejo"
        );

        return;
    }

    await bot.sendMessage(
        chatId,
        "❌ File nahi mili"
    );
});

// 📂 DOCUMENT
bot.on('document', async (msg) => {

    handleIncomingFile(
        msg,
        'document',
        msg.document.file_id
    );
});

// 🖼 PHOTO
bot.on('photo', async (msg) => {

    handleIncomingFile(
        msg,
        'photo',
        msg.photo[
            msg.photo.length - 1
        ].file_id
    );
});

// 📥 FILE SAVE
async function handleIncomingFile(
    msg,
    type,
    file_id
) {

    const chatId =
        msg.chat.id.toString();

    if (chatId !== my_chat_id)
        return;

    if (!checkSession()) {

        await bot.sendMessage(
            chatId,
            "🔑 Bot Locked"
        );

        return;
    }

    let file_info = {

        file_id: file_id,

        type: type
    };

    if (
        msg.caption
        && msg.caption.trim() !== ""
    ) {

        let key =
            msg.caption
            .trim()
            .toLowerCase();

        let config =
            JSON.parse(
                fs.readFileSync(
                    config_file
                )
            );

        let secret_password =
            config.password;

        let vault =
            JSON.parse(
                fs.readFileSync(db_file)
            );

        file_info.file_id =
            encryptData(
                file_id,
                secret_password
            );

        vault[key] = file_info;

        fs.writeFileSync(
            db_file,
            JSON.stringify(vault, null, 2)
        );

        await bot.sendMessage(
            chatId,
            `✅ Saved ${key}`
        );

    } else {

        fs.writeFileSync(
            pending_file,
            JSON.stringify(file_info)
        );

        await bot.sendMessage(
            chatId,
            "❓ File ka naam bhejo"
        );
    }
});

// 🌐 WEB
app.get('/', (req, res) => {

    res.send(
        'Green API Telegram Vault Running'
    );
});

// 🚀 START SERVER
const PORT =
    process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(
        `Server Running On ${PORT}`
    );
});
