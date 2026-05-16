process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const fetch = require('node-fetch');

const app = express();

const token = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";

const green_api_url = "https://7107.api.greenapi.com";
const idInstance = "7107621313";
const apiTokenInstance =
"960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

const bot = new TelegramBot(token, {
    polling: true
});

// START MESSAGE
bot.onText(/\/start/, async (msg) => {

    await bot.sendMessage(
        msg.chat.id,
        "✅ Bot Running Successfully"
    );
});

// SEND TO WHATSAPP
bot.on('document', async (msg) => {

    try {

        const chatId = msg.chat.id;

        const fileId = msg.document.file_id;

        // GET FILE
        const tgFile =
            await fetch(
                `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
            );

        const tgJson =
            await tgFile.json();

        if (!tgJson.ok) {

            await bot.sendMessage(
                chatId,
                "❌ Telegram File Error"
            );

            return;
        }

        const filePath =
            tgJson.result.file_path;

        const fileUrl =
            `https://api.telegram.org/file/bot${token}/${filePath}`;

        // YOUR NUMBER
        const targetNumber =
            "919428972786@c.us";

        // SEND WHATSAPP
        const response =
            await fetch(
                `${green_api_url}/waInstance${idInstance}/sendFileByUrl/${apiTokenInstance}`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        chatId: targetNumber,

                        urlFile: fileUrl,

                        fileName:
                            msg.document.file_name,

                        caption:
                            "📄 Telegram File"
                    })
                }
            );

        const result =
            await response.json();

        console.log(result);

        if (response.ok) {

            await bot.sendMessage(
                chatId,
                "✅ WhatsApp Sent Successfully"
            );

        } else {

            await bot.sendMessage(
                chatId,
                "❌ WhatsApp Send Failed"
            );
        }

    } catch (e) {

        console.log(e);

        await bot.sendMessage(
            msg.chat.id,
            "❌ Server Error"
        );
    }
});

app.get('/', (req, res) => {

    res.send('Bot Running');
});

const PORT =
    process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(
        `Server Started ${PORT}`
    );
});
