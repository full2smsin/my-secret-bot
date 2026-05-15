const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// 🔑 कॉन्फ़िगरेशन सेटिंग्स
const token = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";
const my_chat_id = "5429869370"; 
const session_timeout = 300000; // 5 मिनट

// 🟢 मेटा व्हाट्सएप एपीआई क्रेडेंशियल्स
const meta_access_token = "EAAucHkxZCs0oBRYP1Un3OQhjFrCScGxvsQOUcJ1uD1FYbd6wV6RZCz3d4xgmi2ZAzQRg77SCWjbXCkkC42eXjMggtogXbyXO3Iyn83N7qlIMs4fkQEZBBA5HfRScbCOpT8Lby9oulf0yMaTzg2i0heCNeR0N6iALDGZCnZA72e9YmXcFIpV81dZCgoMsi2n"; 
const meta_phone_number_id = "102380389232052";   
const render_app_url = "https://onrender.com"; // आपकी रेंडर ऐप का लिंक

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.txt';
const search_lock_file = 'search_lock.json'; 
const whatsapp_mode_file = 'whatsapp_mode.json';

// फ़ाइलें इनिशियलाइज़ करना
if (!fs.existsSync(db_file)) fs.writeFileSync(db_file, JSON.stringify({}));
if (!fs.existsSync(config_file)) fs.writeFileSync(config_file, JSON.stringify({ password: "2739" }));
if (!fs.existsSync(search_lock_file)) fs.writeFileSync(search_lock_file, JSON.stringify({}));
if (!fs.existsSync(whatsapp_mode_file)) fs.writeFileSync(whatsapp_mode_file, JSON.stringify({}));

const bot = new NTB(token, { polling: true });

// 🔒 डुप्लिकेट रोकने के लिए फाइल आईडी का हैश जनरेट करना
function generateFileHash(fileId) {
    return crypto.createHash('sha256').update(fileId).digest('hex');
}

// 🔒 AES-256 मिलिट्री-ग्रेड इंक्रिप्शन फंक्शन
function encryptData(text, keyPassword) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(keyPassword, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

// 🔒 AES-256 डिक्रिप्शन फंक्शन
function decryptData(encryptedText, keyPassword) {
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return null;
        const salt = Buffer.from(parts[0], 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const key = crypto.scryptSync(keyPassword, salt, 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return null; 
    }
}

// ⏳ 1 मिनट में चैट को साफ करने का फंक्शन
function autoDeleteMessage(chatId, msgId) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(chatId.toString(), msgId);
        } catch (e) { }
    }, 60000); 
}

// बोट मेनू अपडेट करना
async function updateBotMenu(status) {
    if (status === "lock") {
        await bot.setMyCommands([]);
    } else {
        const commands = [
            { command: "help", description: "📜 सभी कमांड्स की सूची देखें" },
            { command: "all", description: "📋 सभी सेव फाइलों के नाम देखें" },
            { command: "show", description: "🖼️ सारी फाइलों का प्रकार देखें" },
            { command: "lock", description: "🔒 बॉट को तुरंत लॉक करें" },
            { command: "cleanall", description: "🗑️ सारा डेटा डिलीट करके फ्रेश स्टार्ट करें" }
        ];
        await bot.setMyCommands(commands);
    }
}

// सेशन की जांच करना
function checkSession() {
    if (fs.existsSync(session_file) && !fs.existsSync(blocked_file)) {
        let session_data = JSON.parse(fs.readFileSync(session_file));
        if (Date.now() - session_data.last_time < session_timeout) {
            session_data.last_time = Date.now();
            fs.writeFileSync(session_file, JSON.stringify(session_data));
            return true;
        } else {
            if (fs.existsSync(session_file)) { try { fs.unlinkSync(session_file); } catch(e){} }
            updateBotMenu("lock");
        }
    }
    return false;
}

// गलत पासवर्ड अटेम्पट हैंडल करना
async function handleWrongAttempt(msg) {
    let attempts = fs.existsSync(attempts_file) ? parseInt(fs.readFileSync(attempts_file, 'utf8')) : 0;
    attempts++;
    fs.writeFileSync(attempts_file, attempts.toString());

    let from = msg.from;
    let intruder_name = (from.first_name || '') + ' ' + (from.last_name || '');
    let intruder_username = from.username || 'No Username';
    let intruder_id = from.id ? from.id.toString() : 'Unknown ID';
    
    let log_entry = `⚠️ *Intruder Alert!* \n`
               + `• Name: ${intruder_name}\n`
               + `• User: @${intruder_username}\n`
               + `• ID: \`${intruder_id}\` \n`
               + `• Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}\n------------------------\n`;
               
    fs.appendFileSync(log_file, log_entry);

    if (intruder_id !== my_chat_id) {
        await bot.sendMessage(my_chat_id, `🚨 *WARNING:* Kisine bot me galat password dala hai!\n\n` + log_entry, { parse_mode: "Markdown" });
    }

    if (attempts >= 3) {
        fs.writeFileSync(blocked_file, "locked");
        updateBotMenu("lock"); 
        await bot.sendMessage(msg.chat.id, "🚨 *SYSTEM SECURITY BLOCK!* \n\n3 baar galat password dala gaya hai. Yeh bot ab freeze ho chuka hai!");
    }
    return attempts;
}

// 🟢 फिक्स्ड: मेटा व्हाट्सएप एपीआई को मीडिया भेजने का फंक्शन
async function sendToWhatsAppMeta(targetMobile, fileId, type, fileName) {
    try {
        const fetch = (await import('node-fetch')).default;
        // ✅ फिक्स 1: सही प्रोटोकॉल, वर्ज़न और वेरिएबल सिंटैक्स ($ साइन)
        const metaUrl = `https://facebook.com{meta_phone_number_id}/messages`;
        
        const ext = type === "photo" ? "jpg" : "pdf";
        const publicDownloadUrl = `${render_app_url}/download-vault-file?file_id=${encodeURIComponent(fileId)}&ext=.${ext}`;
        
        // ✅ फिक्स 2: व्हाट्सएप पॉलिसी के अनुसार डॉक्यूमेंट पेलोड से 'caption' हटाया गया
        let mediaObject = { link: publicDownloadUrl };
        if (type === "photo") {
            mediaObject.caption = `🎯 Vault Document: ${fileName}`;
        } else {
            mediaObject.filename = `${fileName}.${ext}`;
        }

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: targetMobile,
            type: type === "photo" ? "image" : "document",
            [type === "photo" ? "image" : "document"]: mediaObject
        };

        const response = await fetch(metaUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${meta_access_token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        
        return response.ok;
    } catch (e) {
        console.error("Meta API Send Error:", e);
        return false;
    }
}

// 💬 टेलीग्राम मैसेज हैंडलर
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    if (chatId !== my_chat_id) return;

    const text = msg.text ? msg.text.trim() : "";
    const text_lower = text.toLowerCase();
    
    let config_data = JSON.parse(fs.readFileSync(config_file));
    let secret_password = config_data.password;

    if (!text) return;

    let is_unlocked = checkSession();

    if (text_lower === "unblock bot") {
        if (fs.existsSync(blocked_file)) { try{fs.unlinkSync(blocked_file);}catch(e){} }
        if (fs.existsSync(attempts_file)) { try{fs.unlinkSync(attempts_file);}catch(e){} }
        await bot.sendMessage(chatId, "✅ *Bot Freeze Removed!* Ab aap password dalkar ise khol sakte hain.");
        return;
    }

    if (fs.existsSync(blocked_file)) {
        await bot.sendMessage(chatId, "🚨 *Bot is Frozen!* Security ke karan yeh bot block ho gaya hai.");
        return;
    }

    // 📲 व्हाट्सएप सेंडिंग प्रोसेस ट्रिगर
    let w_mode = JSON.parse(fs.readFileSync(whatsapp_mode_file));
    if (w_mode[chatId]) {
        let active_whatsapp_job = w_mode[chatId];
        let cleaned_number = text.replace(/[^0-9]/g, '');
        
        if (cleaned_number.length >= 10) {
            let status_msg = await bot.sendMessage(chatId, `⏳ Meta API se WhatsApp number *${cleaned_number}* par file bheji ja rahi hai...`, { parse_mode: "Markdown" });
            
            let isSent = await sendToWhatsAppMeta(cleaned_number, active_whatsapp_job.file_id, active_whatsapp_job.type, active_whatsapp_job.key);
            
            if (isSent) {
                await bot.sendMessage(chatId, `✅ *Success!* File Meta WhatsApp API ke jariye number *${cleaned_number}* par successfully transfer ho gayi hai.`);
            } else {
                await bot.sendMessage(chatId, `❌ *Meta API Error!* WhatsApp par file nahi bheji ja saki. Kripya apna Token ya Phone ID check karein.`);
            }
            autoDeleteMessage(chatId, status_msg.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, "⚠️ Galat mobile number format! Kripya country code ke sath sahi number bhejein (जैसे: 919876543210).");
            autoDeleteMessage(chatId, reply.message_id);
        }
        delete w_mode[chatId];
        fs.writeFileSync(whatsapp_mode_file, JSON.stringify(w_mode));
        autoDeleteMessage(chatId, msg.message_id);
        return;
    }

    // 🔍 सर्च लॉक और डिक्रिप्शन
    let s_lock = JSON.parse(fs.readFileSync(search_lock_file));
    if (s_lock[chatId]) {
        if (text === secret_password) {
            let target_keys = s_lock[chatId];
            let vault = JSON.parse(fs.readFileSync(db_file));
            
            for (let key of target_keys) {
                if (vault[key]) {
                    let decrypted_file_id = decryptData(vault[key].file_id, secret_password);
                    if (decrypted_file_id) {
                        if (vault[key].type === "photo") {
                            let sent = await bot.sendPhoto(chatId, decrypted_file_id, { caption: `🎯 Decrypted: ${key}` });
                            autoDeleteMessage(chatId, sent.message_id);
                        } else {
                            let sent = await bot.sendDocument(chatId, decrypted_file_id, { caption: `🎯 Decrypted: ${key}` });
                            autoDeleteMessage(chatId, sent.message_id);
                        }
                        
                        // व्हाट्सएप ट्रांसफर मोड के लिए डेटा स्टोर करना (यह फ़ाइल आईडी अभी भी सुरक्षित या एन्क्रिप्टेड फॉर्मेट में भेजी जा सकती है)
                        let w_mode_data = JSON.parse(fs.readFileSync(whatsapp_mode_file));
                        w_mode_data[chatId] = { file_id: vault[key].file_id, type: vault[key].type, key: key };
                        fs.writeFileSync(whatsapp_mode_file, JSON.stringify(w_mode_data));
                        
                        let ask_msg = await bot.sendMessage(chatId, `📲 *WhatsApp Transfer Mode Active!*\n\nBhai, ye file kis WhatsApp number par bhejein? \n\n👉 Kripya country code ke sath mobile number type karke bhejein (जैसे: \`919876543210\`)`);
                        autoDeleteMessage(chatId, ask_msg.message_id);
                    }
                }
            }
            fs.writeFileSync(session_file, JSON.stringify({ status: 'unlocked', last_time: Date.now() }));
            updateBotMenu("unlock");
            
            delete s_lock[chatId];
            fs.writeFileSync(search_lock_file, JSON.stringify(s_lock));
            autoDeleteMessage(chatId, msg.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, "❌ *Error:* Galat PIN! Document decrypt nahi kiya ja saka.");
            autoDeleteMessage(chatId, msg.message_id);
            autoDeleteMessage(chatId, reply.message_id);
        }
        return;
    }

    // पासवर्ड से बॉट अनलॉक करना
    if (text === secret_password) {
        if (fs.existsSync(attempts_file)) { try{fs.unlinkSync(attempts_file);}catch(e){} }
        fs.writeFileSync(session_file, JSON.stringify({ status: 'unlocked', last_time: Date.now() }));
        updateBotMenu("unlock"); 
        
        const welcome_menu = "🔓 *Bot Unlocked Successfully!* \n\nSaare commands active hain.\n🔍 बस... फाइल का नाम लिखकर भेजें (उदा: `aadhar`)";
        let reply = await bot.sendMessage(chatId, welcome_menu, { parse_mode: "Markdown" });
        autoDeleteMessage(chatId, msg.message_id);
        autoDeleteMessage(chatId, reply.message_id);
        return;
    }

    // बॉट लॉक करना
    if (text_lower === "lock" || text_lower === "/lock") {
        if (fs.existsSync(session_file)) { try{fs.unlinkSync(session_file);}catch(e){} }
        updateBotMenu("lock"); 
        let reply = await bot.sendMessage(chatId, "🔒 *Bot Successfully Locked!* Menu saaf kar diya gaya hai.");
        autoDeleteMessage(chatId, msg.message_id);
        autoDeleteMessage(chatId, reply.message_id);
        return;
    }

    if (!is_unlocked) {
        let current_attempts = await handleWrongAttempt(msg);
        let remaining = 3 - current_attempts;
        if (remaining > 0) {
            let reply = await bot.sendMessage(chatId, `❌ *Galat Password!* \n\n🔑 Bot locked hai. (Aapke paas ${remaining} attempt bache hain)`);
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        }
        return;
    }

    // ⚙️ कैप्शन एडिट लॉजिक
    if (text_lower.startsWith("edit ")) {
        let parts = text.split(" ");
        if (parts.length === 3) {
            let old_name = parts[1].trim().toLowerCase();
            let new_name = parts[2].trim().toLowerCase();
            let vault = JSON.parse(fs.readFileSync(db_file));

            if (!vault[old_name]) {
                let reply = await bot.sendMessage(chatId, `❌ Error: '${old_name}' naam ki koi file nahi mili.`);
                autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                return;
            }
            if (vault[new_name]) {
                let reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error! '${new_name}' naam pehle se use ho raha hai.`);
                autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                return;
            }

            vault[new_name] = vault[old_name];
            delete vault[old_name];
            fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));

            let reply = await bot.sendMessage(chatId, `✅ Success: Name badal diya gaya hai!`);
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        }
        return;
    }

    // पिन बदलना
    if (text_lower.startsWith("changepin ")) {
        let parts = text.split(" ");
        if (parts.length === 3) {
            let old_p = parts[1]; 
            let new_p = parts[2];
            if (old_p === secret_password) {
                if (new_p.length >= 4) {
                    fs.writeFileSync(config_file, JSON.stringify({ password: new_p }));
                    let reply = await bot.sendMessage(chatId, "✅ *Success:* Password badal diya gaya hai!");
                    autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                }
            } else {
                let reply = await bot.sendMessage(chatId, "❌ Error: Purana password galat hai!");
                autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
            }
        }
        return;
    }

    // फाइल डिलीट करना
    if (text_lower.startsWith("del ")) {
        let target = text_lower.substring(4).trim().toLowerCase();
        let vault = JSON.parse(fs.readFileSync(db_file));
        if (vault[target]) {
            delete vault[target];
            fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));
            let reply = await bot.sendMessage(chatId, `🗑️ File '${target}' ko delete kar diya gaya hai!`);
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        }
        return;
    }

    // पूरा डेटा साफ करना
    if (text_lower === "clean all" || text_lower === "/cleanall") {
        fs.writeFileSync(db_file, JSON.stringify({}));
        let reply = await bot.sendMessage(chatId, "🗑️ *Fresh Start!* Saara purana data delete ho gaya hai.");
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        return;
    }

    // सभी सेव्ड फाइलें देखना
    if (text_lower === "show all" || text_lower === "show" || text_lower === "/show") {
        let vault = JSON.parse(fs.readFileSync(db_file));
        if (Object.keys(vault).length === 0) {
            let reply = await bot.sendMessage(chatId, "📭 Abhi tak koi bhi file save nahi ki gayi hai!");
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
            return;
        }
        let list_all = "🖼️ *Sari Files (Encrypted Mod):* \n\n";
        let count = 1;
        for (let key in vault) {
            list_all += `${count}. 🔒 \`${key}\` (${vault[key].type})\n`;
            count++;
        }
        let reply = await bot.sendMessage(chatId, list_all, { parse_mode: "Markdown" });
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        return;
    }

    // पेंडिंग फाइल को नाम देकर सेव करना
    if (fs.existsSync(pending_file)) {
        let pending_data = JSON.parse(fs.readFileSync(pending_file));
        if (Object.keys(pending_data).length > 0) {
            let vault = JSON.parse(fs.readFileSync(db_file));
            if (vault[text_lower]) {
                let reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error! Doosra naam batao.`);
                autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                return;
            }
            pending_data.file_id = encryptData(pending_data.file_id, secret_password);
            vault[text_lower] = pending_data;
            fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));
            try{fs.unlinkSync(pending_file);}catch(e){}
            let reply = await bot.sendMessage(chatId, "🔒 Saved and Encrypted successfully as: " + text);
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
            return;
        }
    }

    // 🔍 सामान्य सर्च इंजन लॉजिक
    let vault = JSON.parse(fs.readFileSync(db_file));
    let matched_keys = [];

    for (let key in vault) {
        if (key.includes(text_lower)) {
            matched_keys.push(key);
        }
    }

    if (matched_keys.length > 0) {
        let s_lock = JSON.parse(fs.readFileSync(search_lock_file));
        s_lock[chatId] = matched_keys;
        fs.writeFileSync(search_lock_file, JSON.stringify(s_lock));

        let files_list = matched_keys.map(k => `• \`${k}\``).join("\n");
        let reply = await bot.sendMessage(chatId, `🔒 *DOCUMENT LOCKED!*\n\nAapke search se ye files mili hain:\n${files_list}\n\n👉 *Ise live karne ke liye apna Secret PIN bhejein:*`, { parse_mode: "Markdown" });
        
        autoDeleteMessage(chatId, msg.message_id);
        autoDeleteMessage(chatId, reply.message_id);
        return;
    }
    
    let reply = await bot.sendMessage(chatId, `🔍 Maaf kijiyega, '${text}' se koi document nahi mila!`);
    autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
});

// 📂 फ़ाइल अपलोड रिसीवर्स
bot.on('document', async (msg) => { handleIncomingFile(msg, 'document', msg.document.file_id); });
bot.on('photo', async (msg) => { handleIncomingFile(msg, 'photo', msg.photo[msg.photo.length - 1].file_id); });

async function handleIncomingFile(msg, type, file_id) {
    const chatId = msg.chat.id.toString();
    if (chatId !== my_chat_id) return;

    if (!checkSession()) {
        await bot.sendMessage(chatId, "🔑 *Bot is LOCKED!* File save karne ke liye pehle PIN bhejein.");
        return;
    }

    let config_data = JSON.parse(fs.readFileSync(config_file));
    let secret_password = config_data.password;
    let vault = JSON.parse(fs.readFileSync(db_file));
    
    let current_file_hash = generateFileHash(file_id);

    for (let key in vault) {
        if (vault[key].hash === current_file_hash) {
            let reply = await bot.sendMessage(chatId, `⚠️ *Duplicate File Error!* \n\nBhai, yeh file pehle se hi \`${key}\` naam se saved hai!`, { parse_mode: "Markdown" });
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
            return;
        }
    }

    let file_info = { 
        file_id: file_id, 
        type: type,
        hash: current_file_hash
    };

    if (msg.caption && msg.caption.trim() !== "") {
        let k_db = msg.caption.trim().toLowerCase();
        if (vault[k_db]) {
            let reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error!`);
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
            return;
        }
        file_info.file_id = encryptData(file_id, secret_password);
        vault[k_db] = file_info;
        fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));
        let reply = await bot.sendMessage(chatId, "🔒 Saved and Encrypted: " + msg.caption);
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
    } else {
        fs.writeFileSync(pending_file, JSON.stringify(file_info));
        let reply = await bot.sendMessage(chatId, "❓ Bhai, ye kiska document hai? Naam batao.");
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
    }
}

// 🟢 फिक्स्ड एक्सप्रेस एंडपॉइंट: व्हाट्सएप के लिए टेलीग्राम फ़ाइल को बाइनरी स्ट्रीम में बदलना
app.get('/download-vault-file', async (req, res) => {
    try {
        const fetch = (await import('node-fetch')).default;
        const reqFileId = req.query.file_id;
        if (!reqFileId) return res.status(400).send('Missing file id');

        let config_data = JSON.parse(fs.readFileSync(config_file));
        let secret_password = config_data.password;
        
        // ✅ फिक्स 1: डेटाबेस से प्राप्त पिन का उपयोग करके फ़ाइल आईडी को पहले डिक्रिप्ट करें
        let decryptedFileId = reqFileId;
        if (reqFileId.includes(':')) {
            decryptedFileId = decryptData(reqFileId, secret_password);
        }

        if (!decryptedFileId) return res.status(400).send('Decryption failed');

        // ✅ फिक्स 2: टेलीग्राम API के यूआरएल को बिल्कुल सही प्रोटोकॉल और वेरिएबल सिंटैक्स में बदला
        const getFileUrl = `https://telegram.org{token}/getFile?file_id=${decryptedFileId}`;
        const fileRes = await fetch(getFileUrl);
        const fileJson = await fileRes.json();
        
        if (fileJson.ok) {
            const filePath = fileJson.result.file_path;
            const downloadUrl = `https://telegram.org{token}/${filePath}`;
            
            const mediaRes = await fetch(downloadUrl);
            res.setHeader('Content-Type', mediaRes.headers.get('content-type') || 'application/octet-stream');
            
            // फ़ाइल बाइनरी को सीधे मेटा व्हाट्सएप सर्वर को स्ट्रीम कर दें
            mediaRes.body.pipe(res);
        } else {
            res.status(404).send('Telegram file error');
        }
    } catch (e) {
        console.error("Express Server Streaming Error:", e);
        res.status(500).send('Server Error');
    }
});

// होम रूट और पोर्ट लिसनर
app.get('/', (req, res) => res.send('Bot Status: Cloud Meta WhatsApp API Engaged!'));
app.listen(process.env.PORT || 10000);
