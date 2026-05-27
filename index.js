// ======================================================
// IMPORTS
// ======================================================

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// ======================================================
// CONFIG
// ======================================================

const token = "8939505499:AAEI6pHv4b0Yoa4ChDZg_gWioDjQWnUcGRo";

const my_chat_id = "5429869370";

const green_api_instance = "7107621313";

const green_api_token =
"960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

const render_app_url =
"https://my-secret-bot-o21u.onrender.com";

const github_part_1 = "ghp_UHPGu";
const github_part_2 = "PE1HJKg5Hu0";
const github_part_3 = "oy3S1ThLm1";
const github_part_4 = "IRaW2yBfuL";

const GITHUB_TOKEN =
github_part_1 +
github_part_2 +
github_part_3 +
github_part_4;

const GIST_ID =
"a7e6615d2b0ea4e6fc026dc7f31e0f3e";

const DOWNLOAD_SECRET =
"2739secure";

// ======================================================
// EXPRESS
// ======================================================

app.get('/', (req, res) => {
    res.send('Vault Bot Running');
});

// ======================================================
// FILES
// ======================================================

const FILES_TO_SYNC = [
    'my_secure_vault.json',
    'security_config.json',
    'search_lock.json',
    'whatsapp_mode.json',
    'login_attempts.json',
    'bot_blocked.txt'
];

// ======================================================
// SAFE JSON
// ======================================================

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

// ======================================================
// INIT FILES
// ======================================================

function initializeLocalFiles() {

    const defaults = {

        'my_secure_vault.json': [],
        'security_config.json': {
            pin: "2739"
        },
        'search_lock.json': {},
        'whatsapp_mode.json': {},
        'login_attempts.json': {}
    };

    Object.keys(defaults).forEach(file => {

        const filePath =
        path.join(__dirname, file);

        if (!fs.existsSync(filePath)) {

            fs.writeFileSync(
                filePath,
                JSON.stringify(
                    defaults[file],
                    null,
                    2
                )
            );
        }
    });

    const blockedPath =
    path.join(
        __dirname,
        'bot_blocked.txt'
    );

    if (!fs.existsSync(blockedPath)) {

        fs.writeFileSync(
            blockedPath,
            'false'
        );
    }
}

// ======================================================
// UPDATE FILE
// ======================================================

function updateFileAndSync(
    fileName,
    content
) {

    fs.writeFileSync(
        path.join(
            __dirname,
            fileName
        ),
        content
    );

    saveBackupToGist();
}

// ======================================================
// ENCRYPTION
// ======================================================

function encryptData(
    text,
    secretKey
) {

    const iv =
    crypto.randomBytes(16);

    const key =
    crypto.scryptSync(
        secretKey,
        'salt',
        32
    );

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
        iv.toString('hex') +
        ':' +
        encrypted
    );
}

function decryptData(
    text,
    secretKey
) {

    try {

        const textParts =
        text.split(':');

        const iv =
        Buffer.from(
            textParts.shift(),
            'hex'
        );

        const encryptedText =
        Buffer.from(
            textParts.join(':'),
            'hex'
        );

        const key =
        crypto.scryptSync(
            secretKey,
            'salt',
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
            encryptedText,
            'hex',
            'utf8'
        );

        decrypted +=
        decipher.final('utf8');

        return decrypted;

    } catch {

        return null;
    }
}

// ======================================================
// DOWNLOAD GIST
// ======================================================

async function downloadBackupFromGist() {

    try {

        console.log(
            '🔄 Downloading backup from GitHub Gist...'
        );

        const response =
        await axios.get(
            "https://api.github.com/gists/" +
            GIST_ID,
            {
                headers: {
                    Authorization:
                    "token " +
                    GITHUB_TOKEN
                }
            }
        );

        const gistFiles =
        response.data.files;

        if (
            gistFiles['vault_backup.json']
        ) {

            const bigData =
            JSON.parse(
                gistFiles[
                    'vault_backup.json'
                ].content
            );

            FILES_TO_SYNC.forEach(
                fileName => {

                    if (
                        bigData[fileName] !==
                        undefined
                    ) {

                        fs.writeFileSync(
                            path.join(
                                __dirname,
                                fileName
                            ),
                            bigData[fileName],
                            'utf8'
                        );

                        console.log(
                            "✅ Restored:",
                            fileName
                        );
                    }
                }
            );
        }

    } catch (error) {

        console.error(
            '❌ Gist Download Error:',
            error.message
        );
    }
}

// ======================================================
// SAVE GIST
// ======================================================

async function saveBackupToGist() {

    try {

        const bigData = {};

        FILES_TO_SYNC.forEach(
            fileName => {

                const filePath =
                path.join(
                    __dirname,
                    fileName
                );

                if (
                    fs.existsSync(filePath)
                ) {

                    bigData[fileName] =
                    fs.readFileSync(
                        filePath,
                        'utf8'
                    );
                }
            }
        );

        await axios.patch(
            "https://api.github.com/gists/" +
            GIST_ID,
            {
                files: {
                    'vault_backup.json': {
                        content:
                        JSON.stringify(
                            bigData,
                            null,
                            2
                        )
                    }
                }
            },
            {
                headers: {
                    Authorization:
                    "token " +
                    GITHUB_TOKEN
                }
            }
        );

        console.log(
            '☁️ Backup synced'
        );

    } catch (error) {

        console.error(
            '❌ Backup Upload Error:',
            error.message
        );
    }
}

// ======================================================
// INIT
// ======================================================

initializeLocalFiles();

// ======================================================
// TELEGRAM CLEANUP
// ======================================================

async function clearTelegramPolling() {

    try {

        await axios.get(
            `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`
        );

        console.log(
            "✅ Old polling/webhook cleared"
        );

    } catch (e) {

        console.log(
            "Polling cleanup failed"
        );
    }
}

// ======================================================
// BOT
// ======================================================
console.log(token);
const bot =
new TelegramBot(
    token,
    {
        polling: false
    }
);

// ======================================================
// SELF PING
// ======================================================

setInterval(() => {

    axios.get(render_app_url)
    .then(() => {

        console.log(
            'Self Ping Success'
        );

    })
    .catch(err => {

        console.log(
            'Self Ping Error:',
            err.message
        );
    });

}, 240000);

// ======================================================
// AUTO DELETE
// ======================================================

function autoDeleteMessage(
    chatId,
    messageId
) {

    setTimeout(() => {

        bot.deleteMessage(
            chatId,
            messageId
        ).catch(() => {});

    }, 60000);
}

// ======================================================
// START
// ======================================================

async function startBot() {

    await clearTelegramPolling();

    await new Promise(resolve =>
        setTimeout(resolve, 5000)
    );

    await downloadBackupFromGist();

    await bot.startPolling();

    app.listen(
        PORT,
        () => {

            console.log(
                "🚀 Server Running On Port:",
                PORT
            );
        }
    );
}

startBot();
