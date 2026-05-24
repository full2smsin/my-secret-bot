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

const render_app_url = "[https://my-secret-bot-o21u.onrender.com](https://my-secret-bot-o21u.onrender.com)";

const whatsapp_api_url =
"[https://whatsapp-sms-production.up.railway.app](https://whatsapp-sms-production.up.railway.app)";

const whatsapp_api_token =
"my_secure_token";

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

```
if (!fs.existsSync(file)) {

    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2)
    );
}
```

}

ensureFile(db_file, {});

ensureFile(config_file, {
password: "2739"
});

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

```
return crypto
    .createHash('sha256')
    .update(fileId)
    .digest('hex');
```

}

function encryptData(text, keyPassword) {

```
const salt = crypto.randomBytes(16);

const key = crypto.scryptSync(
    keyPassword,
    salt,
    32
);

const iv = crypto.randomBytes(16);

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

return (
    salt.toString('hex') +
    ':' +
    iv.toString('hex') +
    ':' +
    encrypted
);
```

}

function decryptData(encryptedText, keyPassword) {

```
try {

    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
        return null;
    }

    const salt = Buffer.from(parts[0], 'hex');

    const iv = Buffer.from(parts[1], 'hex');

    const encrypted = parts[2];

    const key = crypto.scryptSync(
        keyPassword,
        salt,
        32
    );

    const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        key,
        iv
    );

    let decrypted = decipher.update(
        encrypted,
        'hex',
        'utf8'
    );

    decrypted += decipher.final('utf8');

    return decrypted;

} catch (e) {

    return null;
}
```

}

/* =========================================
AUTO DELETE
========================================= */

function autoDeleteMessage(chatId, msgId) {

```
setTimeout(async () => {

    try {

        await bot.deleteMessage(
            chatId.toString(),
            msgId
        );

    } catch (e) {}

}, 60000);
```

}

/* =========================================
WHATSAPP API SEND
========================================= */

async function sendToWhatsApp(
targetMobile,
fileId,
type,
fileName
) {

```
try {

    const ext =
        type === "photo"
            ? "jpg"
            : "pdf";

    const fileUrl =
        `${render_app_url}/download-vault-file?file_id=${encodeURIComponent(fileId)}`;

    const response = await fetch(

        `${whatsapp_api_url}/send-file-url`,

        {

            method: 'POST',

            headers: {

                'Content-Type': 'application/json',

                'x-api-token': whatsapp_api_token
            },

            body: JSON.stringify({

                number:
                    targetMobile,

                fileUrl:
                    fileUrl,

                fileName:
                    `${fileName}.${ext}`,

                caption:
                    `${fileName}`
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
```

}

/* =========================================
SESSION
========================================= */

function checkSession() {

```
try {

    if (
        fs.existsSync(session_file) &&
        !fs.existsSync(blocked_file)
    ) {

        let session_data = JSON.parse(
            fs.readFileSync(session_file)
        );

        if (
            Date.now() - session_data.last_time < session_timeout
        ) {

            session_data.last_time = Date.now();

            fs.writeFileSync(
                session_file,
                JSON.stringify(session_data)
            );

            return true;
        }
    }

} catch (e) {}

return false;
```

}

/* =========================================
MESSAGE
========================================= */

bot.on('message', async (msg) => {

```
const chatId = msg.chat.id.toString();

if (chatId !== my_chat_id) {
    return;
}

const text = msg.text
    ? msg.text.trim()
    : "";

const text_lower = text.toLowerCase();

if (!text) {
    return;
}

let config_data = JSON.parse(
    fs.readFileSync(config_file)
);

let secret_password =
    config_data.password;

let is_unlocked =
    checkSession();

/* =========================================
WHATSAPP MODE
========================================= */

let w_mode = JSON.parse(
    fs.readFileSync(whatsapp_mode_file)
);

if (w_mode[chatId]) {

    let active_job =
        w_mode[chatId];

    let mobile = text.replace(/\D/g, '');

    if (mobile.length >= 10) {

        let wait_msg = await bot.sendMessage(
            chatId,
            `Sending File To WhatsApp ${mobile}`
        );

        autoDeleteMessage(
            chatId,
            wait_msg.message_id
        );

        let sent = await sendToWhatsApp(
            mobile,
            active_job.file_id,
            active_job.type,
            active_job.key
        );

        if (sent) {

            let ok = await bot.sendMessage(
                chatId,
                '✅ File Sent To WhatsApp'
            );

            autoDeleteMessage(
                chatId,
                ok.message_id
            );

        } else {

            let fail = await bot.sendMessage(
                chatId,
                '❌ WhatsApp Send Failed'
            );

            autoDeleteMessage(
                chatId,
                fail.message_id
            );
        }

    } else {

        let invalid = await bot.sendMessage(
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
```

});

/* =========================================
DOWNLOAD API
========================================= */

app.get(
'/download-vault-file',

```
async (req, res) => {

    try {

        const fileId = req.query.file_id;

        if (!fileId) {

            return res
                .status(400)
                .send('Missing File ID');
        }

        const tgRes = await fetch(
            `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
        );

        const tgJson = await tgRes.json();

        if (!tgJson.ok) {

            return res
                .status(404)
                .send('Telegram Error');
        }

        const filePath =
            tgJson.result.file_path;

        const fileUrl =
            `https://api.telegram.org/file/bot${token}/${filePath}`;

        const media = await fetch(fileUrl);

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
```

);

/* =========================================
ROOT
========================================= */

app.get('/', (req, res) => {

```
res.send(
    'Bot Running Successfully'
);
```

});

/* =========================================
START
========================================= */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {

```
console.log(
    `Server Running On ${PORT}`
);
```

});
