const NTB = require('node-telegram-bot-api');
const express = require('express');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();

app.use(express.json());

/* =========================================
CONFIG
========================================= */

const token =
    '8739567989:AAG9y7YlA-A6VIEvJcyHdXzRoblJodZAwMk';

const my_chat_id =
    '5429869370';

const render_app_url =
    'https://my-secret-bot-o21u.onrender.com';

const whatsapp_api_url =
    'https://whatsapp-sms-production.up.railway.app';

const whatsapp_api_token =
    '27031992';

/* =========================================
FILES
========================================= */

const whatsapp_mode_file =
    'whatsapp_mode.json';

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

const bot =
    new NTB(token);

/* =========================================
WEBHOOK
========================================= */

const WEBHOOK_URL =
    render_app_url;

bot.setWebHook(

    WEBHOOK_URL +

    '/bot' +

    token
);

app.post(

    '/bot' + token,

    (req, res) => {

        bot.processUpdate(
            req.body
        );

        res.sendStatus(200);
    }
);

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

        console.log(e);

        return false;
    }
}

/* =========================================
MESSAGES
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

            /* =========================================
            START
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

                return;
            }

            /* =========================================
            SEND TEST FILE
            ========================================= */

            if (
                text === '/test'
            ) {

                let w_mode =

                    JSON.parse(

                        fs.readFileSync(
                            whatsapp_mode_file
                        )
                    );

                w_mode[chatId] = {

                    file_id:
                        'YOUR_FILE_ID',

                    type:
                        'document',

                    key:
                        'test-file'
                };

                fs.writeFileSync(

                    whatsapp_mode_file,

                    JSON.stringify(w_mode)
                );

                let ask =

                    await bot.sendMessage(

                        chatId,

                        'Send WhatsApp Number'
                    );

                autoDeleteMessage(

                    chatId,

                    ask.message_id
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

                    let wait =

                        await bot.sendMessage(

                            chatId,

                            'Sending To WhatsApp...'
                        );

                    autoDeleteMessage(

                        chatId,

                        wait.message_id
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

                                '✅ Sent Successfully'
                            );

                        autoDeleteMessage(

                            chatId,

                            ok.message_id
                        );

                    } else {

                        let fail =

                            await bot.sendMessage(

                                chatId,

                                '❌ Failed'
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
            }

        } catch (e) {

            console.log(e);
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
        'Bot Running'
    );
});

/* =========================================
START
========================================= */

const PORT =
    process.env.PORT || 10000;

app.listen(PORT, async () => {

    console.log(
        `Server Running On ${PORT}`
    );

    try {

        await bot.deleteWebHook({

            drop_pending_updates: true
        });

        await bot.setWebHook(

            WEBHOOK_URL +

            '/bot' +

            token
        );

        console.log(
            'Webhook Set Successfully'
        );

    } catch (e) {

        console.log(e);
    }
});
