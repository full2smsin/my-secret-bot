
const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ================= CONFIG =================

const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const my_chat_id = 'YOUR_TELEGRAM_CHAT_ID';
const session_timeout = 300000;

// Green API
const green_api_url = 'https://api.green-api.com';
const green_instance_id = 'YOUR_GREEN_INSTANCE_ID';
const green_api_token = 'YOUR_GREEN_API_TOKEN';

// Files
const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.txt';
const search_lock_file = 'search_lock.json';
const whatsapp_mode_file = 'whatsapp_mode.json';

const REQUIRED_FILES = [
    db_file,
    search_lock_file,
    whatsapp_mode_file
];

REQUIRED_FILES.forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({}));
    }
});

if (!fs.existsSync(config_file)) {
    fs.writeFileSync(
        config_file,
        JSON.stringify({ password: '2739' })
    );
}

const bot = new NTB(token, {
    polling: true
});

// ================= HELPERS =================

function readJSON(file, fallback = {}) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch {
        return fallback;
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateFileHash(fileId) {
    return crypto
        .createHash('sha256')
        .update(fileId)
        .digest('hex');
}

function encryptData(text, password) {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);

    const key = crypto.scryptSync(password, salt, 32);

    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        key,
        iv
    );

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return [
        salt.toString('hex'),
        iv.toString('hex'),
        tag.toString('hex'),
        encrypted
    ].join(':');
}

function decryptData(payload, password) {
    try {
        const parts = payload.split(':');

        if (parts.length !== 4) {
            return null;
        }

        const salt = Buffer.from(parts[0], 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const tag = Buffer.from(parts[2], 'hex');
        const encrypted = parts[3];

        const key = crypto.scryptSync(password, salt, 32);

        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            key,
            iv
        );

        decipher.setAuthTag(tag);

        let decrypted = decipher.update(
            encrypted,
            'hex',
            'utf8'
        );

        decrypted += decipher.final('utf8');

        return decrypted;
    } catch {
        return null;
    }
}

function autoDeleteMessage(chatId, messageId) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(chatId, messageId);
        } catch {}
    }, 60000);
}

async function updateBotMenu(status) {
    if (status === 'lock') {
        await bot.setMyCommands([]);
        return;
    }

    await bot.setMyCommands([
        {
            command: 'help',
            description: 'Commands list'
        },
        {
            command: 'show',
            description: 'Show all files'
        },
        {
            command: 'lock',
            description: 'Lock bot'
        },
        {
            command: 'cleanall',
            description: 'Delete all data'
        }
    ]);
}

function checkSession() {
    if (
        fs.existsSync(session_file) &&
        !fs.existsSync(blocked_file)
    ) {
        const session = readJSON(session_file, {});

        if (
            Date.now() - session.last_time < session_timeout
        ) {
            session.last_time = Date.now();
            writeJSON(session_file, session);
            return true;
        }

        try {
            fs.unlinkSync(session_file);
        } catch {}
    }

    return false;
}

async function handleWrongAttempt(msg) {
    let attempts = fs.existsSync(attempts_file)
        ? parseInt(fs.readFileSync(attempts_file, 'utf8'))
        : 0;

    attempts++;

    fs.writeFileSync(attempts_file, attempts.toString());

    const from = msg.from;

    const log = `Intruder: ${from.id} | ${new Date().toISOString()}\n`;

    fs.appendFileSync(log_file, log);

    if (attempts >= 3) {
        fs.writeFileSync(blocked_file, 'locked');

        await bot.sendMessage(
            msg.chat.id,
            '🚨 Bot blocked due to multiple wrong attempts'
        );
    }

    return attempts;
}

// ================= GREEN API =================

async function sendToWhatsAppGreen(
    targetMobile,
    fileId,
    type,
    fileName
) {
    try {
        const fetch = (await import('node-fetch')).default;

        const tgInfoUrl =
            `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;

        const tgInfoRes = await fetch(tgInfoUrl);
        const tgInfo = await tgInfoRes.json();

        if (!tgInfo.ok) {
            return {
                success: false,
                error: 'Telegram getFile failed'
            };
        }

        const filePath = tgInfo.result.file_path;

        const telegramDownloadUrl =
            `https://api.telegram.org/file/bot${token}/${filePath}`;

        const mediaRes = await fetch(telegramDownloadUrl);

        if (!mediaRes.ok) {
            return {
                success: false,
                error: 'Telegram download failed'
            };
        }

        const fileBuffer = Buffer.from(
            await mediaRes.arrayBuffer()
        );

        const ext = filePath.includes('.')
            ? filePath.split('.').pop()
            : (type === 'photo' ? 'jpg' : 'bin');

        const fullFileName = `${fileName}.${ext}`;

        const uploadUrl =
            `${green_api_url}/waInstance${green_instance_id}/uploadFile/${green_api_token}`;

        const boundary =
            `----NodeBoundary${crypto.randomBytes(16).toString('hex')}`;

        let header = `--${boundary}\r\n`;

        header +=
            `Content-Disposition: form-data; name="file"; filename="${fullFileName}"\r\n`;

        header +=
            `Content-Type: application/octet-stream\r\n\r\n`;

        const footer = `\r\n--${boundary}--\r\n`;

        const multipartBody = Buffer.concat([
            Buffer.from(header),
            fileBuffer,
            Buffer.from(footer)
        ]);

        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type':
                    `multipart/form-data; boundary=${boundary}`
            },
            body: multipartBody
        });

        const uploadData = await uploadRes.json();

        if (!uploadData.urlFile) {
            return {
                success: false,
                error: JSON.stringify(uploadData)
            };
        }

        const sendUrl =
            `${green_api_url}/waInstance${green_instance_id}/sendFileByUrl/${green_api_token}`;

        const payload = {
            chatId: `${targetMobile}@c.us`,
            urlFile: uploadData.urlFile,
            fileName: fullFileName,
            caption: `📁 ${fileName}`
        };

        const sendRes = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const sendData = await sendRes.json();

        if (sendRes.ok && sendData.idMessage) {
            return {
                success: true
            };
        }

        return {
            success: false,
            error: JSON.stringify(sendData)
        };

    } catch (e) {
        return {
            success: false,
            error: e.message
        };
    }
}

// ================= MESSAGE HANDLER =================

bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();

    if (chatId !== my_chat_id) {
        return;
    }

    const text = msg.text
        ? msg.text.trim()
        : '';

    const textLower = text.toLowerCase();

    const config = readJSON(config_file, {});

    const secret_password = config.password;

    const unlocked = checkSession();

    // Unlock
    if (text === secret_password) {
        if (fs.existsSync(attempts_file)) {
            fs.unlinkSync(attempts_file);
        }

        writeJSON(session_file, {
            status: 'unlocked',
            last_time: Date.now()
        });

        await updateBotMenu('unlock');

        const sent = await bot.sendMessage(
            chatId,
            '🔓 Bot unlocked successfully'
        );

        autoDeleteMessage(chatId, sent.message_id);
        return;
    }

    // Lock
    if (textLower === '/lock') {
        try {
            fs.unlinkSync(session_file);
        } catch {}

        await updateBotMenu('lock');

        await bot.sendMessage(chatId, '🔒 Bot locked');
        return;
    }

    if (!unlocked) {
        await handleWrongAttempt(msg);
        return;
    }

    // Show files
    if (textLower === '/show') {
        const vault = readJSON(db_file, {});

        const keys = Object.keys(vault);

        if (!keys.length) {
            return bot.sendMessage(chatId, 'No files');
        }

        let list = '📁 Vault Files\n\n';

        keys.forEach((k, i) => {
            list += `${i + 1}. ${k}\n`;
        });

        return bot.sendMessage(chatId, list);
    }

    // Search file
    const vault = readJSON(db_file, {});

    if (vault[textLower]) {
        const decrypted = decryptData(
            vault[textLower].file_id,
            secret_password
        );

        if (!decrypted) {
            return bot.sendMessage(chatId, 'Decrypt failed');
        }

        if (vault[textLower].type === 'photo') {
            await bot.sendPhoto(chatId, decrypted);
        } else {
            await bot.sendDocument(chatId, decrypted);
        }

        const wmode = readJSON(whatsapp_mode_file, {});

        wmode[chatId] = {
            file_id: decrypted,
            type: vault[textLower].type,
            key: textLower
        };

        writeJSON(whatsapp_mode_file, wmode);

        return bot.sendMessage(
            chatId,
            '📲 WhatsApp mode active. Send mobile number with country code.'
        );
    }

    // WhatsApp send mode
    const wmode = readJSON(whatsapp_mode_file, {});

    if (wmode[chatId]) {
        const cleaned = text.replace(/[^0-9]/g, '');

        const result = await sendToWhatsAppGreen(
            cleaned,
            wmode[chatId].file_id,
            wmode[chatId].type,
            wmode[chatId].key
        );

        delete wmode[chatId];

        writeJSON(whatsapp_mode_file, wmode);

        if (result.success) {
            return bot.sendMessage(chatId, '✅ Sent to WhatsApp');
        }

        return bot.sendMessage(
            chatId,
            `❌ ${result.error}`
        );
    }

    // Pending file naming
    if (fs.existsSync(pending_file)) {
        const pending = readJSON(pending_file, {});

        if (pending.file_id) {
            const vault = readJSON(db_file, {});

            pending.file_id = encryptData(
                pending.file_id,
                secret_password
            );

            vault[textLower] = pending;

            writeJSON(db_file, vault);

            fs.unlinkSync(pending_file);

            return bot.sendMessage(
                chatId,
                `✅ Saved as ${textLower}`
            );
        }
    }

    bot.sendMessage(chatId, '❌ File not found');
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

async function handleIncomingFile(
    msg,
    type,
    file_id
) {
    const chatId = msg.chat.id.toString();

    if (chatId !== my_chat_id) {
        return;
    }

    if (!checkSession()) {
        return bot.sendMessage(
            chatId,
            '🔒 Unlock bot first'
        );
    }

    const config = readJSON(config_file, {});

    const secret_password = config.password;

    const vault = readJSON(db_file, {});

    const hash = generateFileHash(file_id);

    for (const key in vault) {
        if (vault[key].hash === hash) {
            return bot.sendMessage(
                chatId,
                '⚠️ Duplicate file already exists'
            );
        }
    }

    const fileInfo = {
        file_id,
        type,
        hash
    };

    if (msg.caption) {
        const key = msg.caption.trim().toLowerCase();

        fileInfo.file_id = encryptData(
            file_id,
            secret_password
        );

        vault[key] = fileInfo;

        writeJSON(db_file, vault);

        return bot.sendMessage(
            chatId,
            `✅ Saved as ${key}`
        );
    }

    writeJSON(pending_file, fileInfo);

    return bot.sendMessage(
        chatId,
        'Send file name now'
    );
}

// ================= EXPRESS =================

app.get('/', (req, res) => {
    res.send('Bot running');
});

app.listen(process.env.PORT || 10000, () => {
    console.log('Server running');
});
```
