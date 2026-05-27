const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Vault Server Running');
});

// =====================================================
// CONFIG
// =====================================================

const token = "8939505499:AAHpyeK7UP14HtvELH2L_wGArnZEkQDre5A";
const my_chat_id = "5429869370";

const green_api_instance = "7107621313";
const green_api_token = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

const render_app_url = "https://my-secret-bot-o21u.onrender.com";

const GITHUB_TOKEN = "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";
const GIST_ID = "a7e6615d2b0ea4e6fc026dc7f31e0f3e";

const DOWNLOAD_SECRET = "2739secure";

// =====================================================
// FILES
// =====================================================

const FILES_TO_SYNC = [
    'my_secure_vault.json',
    'security_config.json',
    'search_lock.json',
    'whatsapp_mode.json',
    'login_attempts.json',
    'bot_blocked.txt'
];

// =====================================================
// HELPERS
// =====================================================

function safeReadJSON(file, fallback) {
    try {
        return JSON.parse(
            fs.readFileSync(
                path.join(__dirname, file),
                'utf8'
            )
        );
    } catch {
        return fallback;
    }
}

function initializeLocalFiles() {

    const defaults = {
        'my_secure_vault.json': [],
        'security_config.json': {
            pin: "2739"
        },
        'search_lock.json': {},
        'whatsapp_mode.json': {},
        'login_attempts.json': {},
    };

    Object.keys(defaults).forEach(file => {

        const filePath = path.join(__dirname, file);

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(
                filePath,
                JSON.stringify(defaults[file], null, 2)
            );
        }
    });

    const blockedPath = path.join(__dirname, 'bot_blocked.txt');

    if (!fs.existsSync(blockedPath)) {
        fs.writeFileSync(blockedPath, 'false');
    }
}

function updateFileAndSync(fileName, content) {

    fs.writeFileSync(
        path.join(__dirname, fileName),
        content
    );

    saveBackupToGist();
}

function autoDeleteMessage(chatId, messageId) {

    setTimeout(() => {

        bot.deleteMessage(chatId, messageId)
            .catch(() => {});

    }, 60000);
}

// =====================================================
// ENCRYPTION
// =====================================================

function encryptData(text, secretKey) {

    const iv = crypto.randomBytes(16);

    const key = crypto.scryptSync(
        secretKey,
        'salt',
        32
    );

    const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        key,
        iv
    );

    let encrypted = cipher.update(
        text,
        'utf8',
        'hex'
    );

    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
}

function decryptData(text, secretKey) {

    try {

        const textParts = text.split(':');

        const iv = Buffer.from(
            textParts.shift(),
            'hex'
        );

        const encryptedText = Buffer.from(
            textParts.join(':'),
            'hex'
        );

        const key = crypto.scryptSync(
            secretKey,
            'salt',
            32
        );

        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            key,
            iv
        );

        let decrypted = decipher.update(
            encryptedText,
            'hex',
            'utf8'
        );

        decrypted += decipher.final('utf8');

        return decrypted;

    } catch {
        return null;
    }
}

// =====================================================
// GITHUB GIST BACKUP
// =====================================================

async function downloadBackupFromGist() {

    try {

        console.log('🔄 Downloading backup from GitHub Gist...');

        const response = await axios.get(
            "https://api.github.com/gists/" + GIST_ID,
            {
                headers: {
                    Authorization: "token " + GITHUB_TOKEN
                }
            }
        );

        const gistFiles = response.data.files;

        if (
            gistFiles['vault_backup.json'] &&
            gistFiles['vault_backup.json'].content
        ) {

            const bigData = JSON.parse(
                gistFiles['vault_backup.json'].content
            );

            FILES_TO_SYNC.forEach(fileName => {

                if (bigData[fileName] !== undefined) {

                    fs.writeFileSync(
                        path.join(__dirname, fileName),
                        bigData[fileName],
                        'utf8'
                    );

                    console.log("✅ Restored:", fileName);
                }
            });

        } else {

            initializeLocalFiles();
        }

    } catch (error) {

        console.error(
            "❌ Gist Download Error:",
            error.response?.data || error.message
        );

        initializeLocalFiles();
    }
}

async function saveBackupToGist() {

    try {

        const bigData = {};

        FILES_TO_SYNC.forEach(fileName => {

            const filePath = path.join(__dirname, fileName);

            if (fs.existsSync(filePath)) {

                bigData[fileName] =
                    fs.readFileSync(filePath, 'utf8');
            }
        });

        await axios.patch(
            "https://api.github.com/gists/" + GIST_ID,
            {
                files: {
                    'vault_backup.json': {
                        content: JSON.stringify(
                            bigData,
                            null,
                            2
                        )
                    }
                }
            },
            {
                headers: {
                    Authorization: "token " + GITHUB_TOKEN
                }
            }
        );

        console.log('☁️ Backup synced');

    } catch (error) {

        console.error(
            "❌ Backup Upload Error:",
            error.response?.data || error.message
        );
    }
}

// =====================================================
// TELEGRAM BOT
// =====================================================

const bot = new TelegramBot(token, {
    polling: true
});

// =====================================================
// RENDER SELF PING
// =====================================================

setInterval(() => {

    axios.get(render_app_url)
        .then(() => {
            console.log('Self Ping Success');
        })
        .catch(err => {
            console.log(
                'Self Ping Error:',
                err.message
            );
        });

}, 240000);

// =====================================================
// WHATSAPP SEND
// =====================================================

async function sendWhatsAppMessage(
    number,
    fileId,
    fileName,
    fileType,
    chatId
) {

    try {

        const cleanNumber =
            number.replace(/\D/g, '');

        const whatsappChatId =
            cleanNumber + "@c.us";

        const downloadUrl =
            render_app_url +
            "/download-vault-file?file_id=" +
            encodeURIComponent(fileId) +
            "&name=" +
            encodeURIComponent(fileName) +
            "&secret=" +
            DOWNLOAD_SECRET;

        const payload = {
            chatId: whatsappChatId,
            urlFile: downloadUrl,
            fileName: fileName
        };

        const response = await axios.post(
            "https://7105.api.greenapi.com/waInstance" +
            green_api_instance +
            "/sendFileByUrl/" +
            green_api_token,
            payload
        );

        bot.sendMessage(
            chatId,
            "📲 WhatsApp Delivery Success!\nID: " +
            (response.data.idMessage || 'OK')
        ).then(m => autoDeleteMessage(
            chatId,
            m.message_id
        ));

    } catch (error) {

        console.error(
            "WhatsApp Error:",
            error.response?.data || error.message
        );

        bot.sendMessage(
            chatId,
            "❌ WhatsApp Routing Failed."
        ).then(m => autoDeleteMessage(
            chatId,
            m.message_id
        ));
    }
}

// =====================================================
// DOWNLOAD ENDPOINT
// =====================================================

app.get('/download-vault-file', async (req, res) => {

    try {

        if (req.query.secret !== DOWNLOAD_SECRET) {
            return res
                .status(403)
                .send('Unauthorized');
        }

        const fileId = req.query.file_id;

        const fileName =
            req.query.name || 'file';

        if (!fileId) {
            return res
                .status(400)
                .send('Missing file_id');
        }

        const fileInfoUrl =
            "https://api.telegram.org/bot" +
            token +
            "/getFile?file_id=" +
            fileId;

        const fileInfoRes =
            await axios.get(fileInfoUrl);

        const filePath =
            fileInfoRes.data.result.file_path;

        const downloadUrl =
            "https://api.telegram.org/file/bot" +
            token +
            "/" +
            filePath;

        const streamResponse = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream'
        });

        res.setHeader(
            'Content-Disposition',
            'attachment; filename="' +
            encodeURIComponent(fileName) +
            '"'
        );

        streamResponse.data.pipe(res);

    } catch (error) {

        console.error(
            "Download Error:",
            error.response?.data || error.message
        );

        res.status(500).send(
            'Internal Server Error'
        );
    }
});

// =====================================================
// BOT MESSAGE HANDLER
// =====================================================

bot.on('message', async (msg) => {

    try {

        const chatId = msg.chat.id.toString();

        const text = msg.text || '';

        let botBlocked =
            fs.readFileSync(
                path.join(__dirname, 'bot_blocked.txt'),
                'utf8'
            ) === 'true';

        let loginAttempts =
            safeReadJSON(
                'login_attempts.json',
                {}
            );

        let securityConfig =
            safeReadJSON(
                'security_config.json',
                { pin: '2739' }
            );

        let mySecureVault =
            safeReadJSON(
                'my_secure_vault.json',
                []
            );

        let searchLock =
            safeReadJSON(
                'search_lock.json',
                {}
            );

        let whatsappMode =
            safeReadJSON(
                'whatsapp_mode.json',
                {}
            );

        if (!loginAttempts[chatId]) {
            loginAttempts[chatId] = 0;
        }

        // ====================================
        // UNBLOCK
        // ====================================

        if (
            chatId === my_chat_id &&
            text === 'unblock bot'
        ) {

            updateFileAndSync(
                'bot_blocked.txt',
                'false'
            );

            updateFileAndSync(
                'login_attempts.json',
                JSON.stringify({}, null, 2)
            );

            bot.sendMessage(
                chatId,
                "🔓 Bot unblocked"
            );

            return;
        }

        // ====================================
        // BLOCKED
        // ====================================

        if (botBlocked) {

            bot.sendMessage(
                chatId,
                "🚨 Bot Freezed"
            );

            return;
        }

        // ====================================
        // START
        // ====================================

        if (text === '/start') {

            bot.sendMessage(
                chatId,
                "🔒 Secure Vault Ready"
            );

            return;
        }

        // ====================================
        // SEARCH
        // ====================================

        if (text === '/search') {

            searchLock[chatId] = {
                step: 'waiting_for_filename'
            };

            updateFileAndSync(
                'search_lock.json',
                JSON.stringify(searchLock, null, 2)
            );

            bot.sendMessage(
                chatId,
                "🔍 Send file name"
            );

            return;
        }

        // ====================================
        // WAIT FILE NAME
        // ====================================

        if (
            searchLock[chatId] &&
            searchLock[chatId].step ===
            'waiting_for_filename'
        ) {

            const found =
                mySecureVault.find(
                    item =>
                        item.name.toLowerCase() ===
                        text.toLowerCase()
                );

            if (!found) {

                delete searchLock[chatId];

                updateFileAndSync(
                    'search_lock.json',
                    JSON.stringify(searchLock, null, 2)
                );

                bot.sendMessage(
                    chatId,
                    "❌ File not found"
                );

                return;
            }

            searchLock[chatId] = {
                step: 'waiting_for_pin',
                fileData: found
            };

            updateFileAndSync(
                'search_lock.json',
                JSON.stringify(searchLock, null, 2)
            );

            bot.sendMessage(
                chatId,
                "🔑 Enter PIN"
            );

            return;
        }

        // ====================================
        // WAIT PIN
        // ====================================

        if (
            searchLock[chatId] &&
            searchLock[chatId].step ===
            'waiting_for_pin'
        ) {

            if (text !== securityConfig.pin) {

                loginAttempts[chatId] += 1;

                updateFileAndSync(
                    'login_attempts.json',
                    JSON.stringify(
                        loginAttempts,
                        null,
                        2
                    )
                );

                if (loginAttempts[chatId] >= 3) {

                    updateFileAndSync(
                        'bot_blocked.txt',
                        'true'
                    );

                    bot.sendMessage(
                        chatId,
                        "🚨 Bot Freezed"
                    );

                    return;
                }

                bot.sendMessage(
                    chatId,
                    "❌ Wrong PIN\nAttempts Left: " +
                    (3 - loginAttempts[chatId])
                );

                return;
            }

            loginAttempts[chatId] = 0;

            updateFileAndSync(
                'login_attempts.json',
                JSON.stringify(
                    loginAttempts,
                    null,
                    2
                )
            );

            const fileData =
                searchLock[chatId].fileData;

            const decryptedFileId =
                decryptData(
                    fileData.encrypted_id,
                    securityConfig.pin
                );

            if (!decryptedFileId) {

                bot.sendMessage(
                    chatId,
                    "❌ Failed to decrypt"
                );

                return;
            }

            delete searchLock[chatId];

            updateFileAndSync(
                'search_lock.json',
                JSON.stringify(searchLock, null, 2)
            );

            // SEND FILE

            if (fileData.type === 'photo') {
                await bot.sendPhoto(
                    chatId,
                    decryptedFileId
                );
            }

            else if (fileData.type === 'video') {
                await bot.sendVideo(
                    chatId,
                    decryptedFileId
                );
            }

            else if (fileData.type === 'document') {
                await bot.sendDocument(
                    chatId,
                    decryptedFileId
                );
            }

            else if (fileData.type === 'audio') {
                await bot.sendAudio(
                    chatId,
                    decryptedFileId
                );
            }

            else if (fileData.type === 'voice') {
                await bot.sendVoice(
                    chatId,
                    decryptedFileId
                );
            }

            whatsappMode[chatId] = {
                fileId: decryptedFileId,
                fileName: fileData.name,
                fileType: fileData.type
            };

            updateFileAndSync(
                'whatsapp_mode.json',
                JSON.stringify(
                    whatsappMode,
                    null,
                    2
                )
            );

            bot.sendMessage(
                chatId,
                "📲 Send WhatsApp Number or type no"
            );

            return;
        }

        // ====================================
        // WHATSAPP MODE
        // ====================================

        if (whatsappMode[chatId]) {

            const currentMode =
                whatsappMode[chatId];

            delete whatsappMode[chatId];

            updateFileAndSync(
                'whatsapp_mode.json',
                JSON.stringify(
                    whatsappMode,
                    null,
                    2
                )
            );

            if (
                text.toLowerCase() === 'no'
            ) {

                bot.sendMessage(
                    chatId,
                    "👌 Cancelled"
                );

                return;
            }

            bot.sendMessage(
                chatId,
                "⏳ Sending to WhatsApp..."
            );

            sendWhatsAppMessage(
                text,
                currentMode.fileId,
                currentMode.fileName,
                currentMode.fileType,
                chatId
            );

            return;
        }

        // ====================================
        // FILE SAVE
        // ====================================

        let incomingFile = null;
        let fileType = '';
        let defaultName =
            "file_" + Date.now();

        if (msg.photo) {

            incomingFile =
                msg.photo[msg.photo.length - 1];

            fileType = 'photo';

            defaultName += '.jpg';
        }

        else if (msg.document) {

            incomingFile = msg.document;

            fileType = 'document';

            defaultName =
                msg.document.file_name ||
                defaultName;
        }

        else if (msg.video) {

            incomingFile = msg.video;

            fileType = 'video';

            defaultName += '.mp4';
        }

        else if (msg.audio) {

            incomingFile = msg.audio;

            fileType = 'audio';

            defaultName += '.mp3';
        }

        else if (msg.voice) {

            incomingFile = msg.voice;

            fileType = 'voice';

            defaultName += '.ogg';
        }

        if (incomingFile) {

            const encryptedFileId =
                encryptData(
                    incomingFile.file_id,
                    securityConfig.pin
                );

            const alreadyExists =
                mySecureVault.find(
                    x =>
                        x.name === defaultName &&
                        x.encrypted_id === encryptedFileId
                );

            if (!alreadyExists) {

                mySecureVault.push({
                    name: defaultName,
                    type: fileType,
                    encrypted_id: encryptedFileId,
                    timestamp:
                        new Date().toISOString()
                });

                updateFileAndSync(
                    'my_secure_vault.json',
                    JSON.stringify(
                        mySecureVault,
                        null,
                        2
                    )
                );
            }

            bot.sendMessage(
                chatId,
                "🔒 File Encrypted & Saved\n" +
                defaultName
            );
        }

    } catch (error) {

        console.error(
            "BOT ERROR:",
            error.response?.data || error.message
        );
    }
});

// =====================================================
// START SERVER
// =====================================================

downloadBackupFromGist().then(() => {

    app.listen(PORT, () => {

        console.log(
            "🚀 Server Running On Port:",
            PORT
        );
    });
});
