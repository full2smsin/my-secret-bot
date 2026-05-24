const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const fetch = require('node-fetch');

const app = express();

app.use(express.json());

/* =========================================
CONFIG
========================================= */

const token =
    "8739567989:AAG9y7YlA-A6VIEvJcyHdXzRoblJodZAwMk";

const my_chat_id =
    "5429869370";

const render_app_url =
    "https://my-secret-bot-o21u.onrender.com";

const whatsapp_api_url =
    "https://whatsapp-sms-production.up.railway.app";

const whatsapp_api_token =
    "27031992";

/* =========================================
FILES
========================================= */

const whatsapp_mode_file =
    'whatsapp_mode.json';

/* =========================================
AUTO CREATE FILE
========================================= */

if (
    !fs.existsSync(
        whatsapp_mode_file
    )
) {

    fs.writeFileSync(

        whatsapp_mode_file,

        JSON.stringify({})
    );
}

/* =========================================
TELEGRAM BOT
========================================= */

const bot = new NTB(token, {

    polling: {

        interval: 1000,

        autoStart: true,

        params: {

            timeout: 10
        }
    }
});

/* =========================================
REMOVE WEBHOOK
========================================= */

bot.deleteWebHook()

    .then(() => {

        console.log(
            'Webhook Removed'
        );

    })

    .catch((e) => {

        console.log(e);
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

            type === 'photo'
                ? 'jpg'
                : 'pdf';

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

        console.log(
            'WHATSAPP ERROR:',
            e.message
        );

        return false;
    }
}

/* =========================================
MESSAGE EVENT
========================================= */

bot.on(

    'message',

    async (msg) => {

        try {

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
                    : '';

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

            if (
                w_mode[chatId]
            ) {

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

            /* =========================================
            START COMMAND
            ========================================= */

            if (
                text === '/start'
            ) {

                let m =

                    await bot.sendMessage(

                        chatId,

                        '✅ Bot Running Successfully'
                    );

                autoDeleteMessage(

                    chatId,

                    m.message_id
                );
            }

        } catch (e) {

            console.log(
                'BOT ERROR:',
                e.message
            );
        }
    }
);

/* =========================================
DOWNLOAD FILE
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

                    .send(
                        'Missing File ID'
                    );
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

                    .send(
                        'Telegram Error'
                    );
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

                .send(
                    'Server Error'
                );
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
START SERVER
========================================= */

const PORT =
    process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(

        `Server Running On ${PORT}`
    );
});
