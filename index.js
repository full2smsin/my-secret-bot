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

const token = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

const my_chat_id = "7107621313";

const render_app_url =
    "https://YOUR-RENDER-URL.onrender.com";

const whatsapp_api_url =
    "https://whatsapp-sms-production.up.railway.app";

const whatsapp_api_token =
    "my_secure_token";

const session_timeout = 300000;

/* =========================================
FILES
========================================= */

const session_file =
    'bot_session.txt';

const whatsapp_mode_file =
    'whatsapp_mode.json';

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

ensureFile(
    whatsapp_mode_file,
    {}
);

/* =========================================
BOT
========================================= */

const bot = new NTB(token, {
    polling: true
});

/* =========================================
AUTO DELETE
========================================= */

function autoDeleteMessage(
    chatId,
    msgId
) {

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
CHECK SESSION
========================================= */

function checkSession() {

    try {

        if (
            fs.existsSync(session_file)
        ) {

            let session_data = JSON.parse(
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
        }

    } catch (e) {}

    return false;
}

/* =========================================
WHATSAPP SEND
========================================= */

async function sendToWhatsApp(
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
            render_app_url +
            '/download-vault-file?file_id=' +
            encodeURIComponent(fileId);

        const response =
            await fetch(

                whatsapp_api_url +
                '/send-file-url',

                {

                    method: 'POST',

                    headers: {

                        'Content-Type':
                            'application/json',

                        'x-api-token':
                            whatsapp_api_token
                    },

                    body: JSON.stringify({

                        number:
                            targetMobile,

                        fileUrl:
                            fileUrl,

                        fileName:
                            fileName +
                            '.' +
                            ext,

                        caption:
                            fileName
                    })
                }
            );

        const result =
            await response.json();

        console.log(result);

        if (
            result.status === 'success'
        ) {

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

bot.on(
    'message',

    async (msg) => {

        const chatId =
            msg.chat.id.toString();

        if (
            chatId !== my_chat_id
        ) {

            return;
        }

        const text =
            msg.text
                ? msg.text.trim()
                : "";

        if (!text) {

            return;
        }

        let w_mode =
            JSON.parse(

                fs.readFileSync(
                    whatsapp_mode_file
                )
            );

        /* =========================================
        WHATSAPP MODE
        ========================================= */

        if (w_mode[chatId]) {

            let active_job =
                w_mode[chatId];

            let mobile =
                text.replace(
                    /\D/g,
                    ''
                );

            if (
                mobile.length >= 10
            ) {

                let wait_msg =
                    await bot.sendMessage(

                        chatId,

                        `Sending File To WhatsApp ${mobile}`
                    );

                autoDeleteMessage(
                    chatId,
                    wait_msg.message_id
                );

                let sent =
                    await sendToWhatsApp(

                        mobile,

                        active_job.file_id,

                        active_job.type,

                        active_job.key
                    );

                if (sent) {

                    let ok =
                        await bot.sendMessage(

                            chatId,

                            '✅ File Sent To WhatsApp'
                        );

                    autoDeleteMessage(
                        chatId,
                        ok.message_id
                    );

                } else {

                    let fail =
                        await bot.sendMessage(

                            chatId,

                            '❌ WhatsApp Send Failed'
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

                        '❌ Invalid Number'
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
    }
);

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

                    'https://api.telegram.org/bot' +
                    token +
                    '/getFile?file_id=' +
                    fileId
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
                'https://api.telegram.org/file/bot' +
                token +
                '/' +
                filePath;

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

            console.log(e);

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
HEALTH
========================================= */

app.get('/health', (req, res) => {

    res.status(200).json({

        status: 'running'
    });
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
