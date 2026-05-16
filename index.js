const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// 🔑 कॉन्फ़िगरेशन सेटिंग्स
const token = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";
const my_chat_id = "5429869370"; 
const session_timeout = 300000; //5 मिनट

// 🟢 ग्रीन एपीआई (GREEN-API) क्रेडेंशियल्स
const green_api_url = "https://green-api.com"; 
const green_instance_id = "7107621313";
const green_api_token = "960eb319a2a34e869d28fead8a957cf3eab3b7ab11cb48a49e";

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.txt';
const search_lock_file = 'search_lock.json'; 
const whatsapp_mode_file = 'whatsapp_mode.json';

if (!fs.existsSync(db_file)) fs.writeFileSync(db_file, JSON.stringify({}));
if (!fs.existsSync(config_file)) fs.writeFileSync(config_file, JSON.stringify({ password: "2739" }));
if (!fs.existsSync(search_lock_file)) fs.writeFileSync(search_lock_file, JSON.stringify({}));
if (!fs.existsSync(whatsapp_mode_file)) fs.writeFileSync(whatsapp_mode_file, JSON.stringify({}));

const bot = new NTB(token, { polling: true });

// 🔒 डुप्लिकेट रोकने के लिए फाइल आईडी का हैश जनरेट करना
function generateFileHash(fileId) {
    return crypto.createHash('sha256').update(fileId).digest('hex');
}

// 🔒 AES-256 मिलिट्री-ग्रेड इंक्रिप्शन और डिक्रिप्शन फंक्शन्स
function encryptData(text, keyPassword) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(keyPassword, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedText, keyPassword) {
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return null;
        const salt = Buffer.from(parts[0], 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const encryptedStr = parts[2].toString().trim();
        
        const key = crypto.scryptSync(keyPassword, salt, 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        
        let decrypted = decipher.update(encryptedStr, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted.trim();
    } catch (e) {
        return null; 
    }
}

// ⏳ 1 मिनट (60 सेकंड) में चैट को दोनों तरफ से साफ करने का फंक्शन
function autoDeleteMessage(chatId, msgId) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(chatId.toString(), msgId);
        } catch (e) { }
    }, 60000); 
}

// 🛡️ टेलीग्राम का मेनू बटन अपडेट करने का डायनामिक फंक्शन
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

// 🟢 ग्रीन एपीआई के क्लाउड स्टोरेज पर फाइल अपलोड करके व्हाट्सएप पर भेजने का फिक्स्ड फंक्शन
async function sendToWhatsAppGreen(targetMobile, fileId, type, fileName) {
    try {
        const fetch = require('node-fetch');
        
        // 🎯 ULTIMATE JUGAAD FIX: सीधे असली टोकन डाल दिया है ताकि कोई वेरिएबल एरर न आए
        const getFileUrl = `https://telegram.org{encodeURIComponent(fileId)}`;
        const fileRes = await fetch(getFileUrl);
        const fileJson = await fileRes.json();
        
        if (!fileJson.ok) return "Telegram file path fetch failed: " + JSON.stringify(fileJson);
        
        const filePath = fileJson.result.file_path;
        
        // 🎯 यहाँ भी सीधे असली टोकन डाल दिया गया है ताकि डाउनलोड सक्सेसफुल हो
        const telegramDownloadUrl = `https://telegram.org{filePath}`;
        
        // 2. टेलीग्राम से फाइल का बाइनरी बफर प्राप्त करना
        const mediaRes = await fetch(telegramDownloadUrl);
        const fileBuffer = await mediaRes.buffer();
        
        // 3. ग्रीन एपीआई के क्लाउड स्टोरेज पर अपलोड करना
        const uploadUrl = `${green_api_url}/waInstance${green_instance_id}/uploadFile/${green_api_token}`;
        const ext = type === "photo" ? "jpg" : "pdf";
        const fullFileName = `${fileName}.${ext}`;
        
        const boundary = `----NodeFetchBoundary${crypto.randomBytes(16).toString('hex')}`;
        let header = `--${boundary}\r\n`;
        header += `Content-Disposition: form-data; name="file"; filename="${fullFileName}"\r\n`;
        header += `Content-Type: ${type === "photo" ? "image/jpeg" : "application/pdf"}\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;
        
        const multipartBody = Buffer.concat([
            Buffer.from(header, 'utf8'),
            fileBuffer,
            Buffer.from(footer, 'utf8')
        ]);

        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': multipartBody.length
            },
            body: multipartBody
        });
        
        const uploadData = await uploadResponse.json();
        const verifiedUrl = uploadData.url || uploadData.urlFile;
        
        if (!verifiedUrl) {
            return `Upload error: ${uploadData.message || JSON.stringify(uploadData)}`;
        }
        
        // 4. ग्रीन एपीआई लिंक के जरिए व्हाट्सएप पर सेंड करना
        const sendUrl = `${green_api_url}/waInstance${green_instance_id}/sendFileByUrl/${green_api_token}`;
        const payload = {
            chatId: `${targetMobile}@c.us`,
            urlFile: verifiedUrl,
            fileName: fullFileName,
            caption: `🎯 Vault Document: ${fileName}`
        };

        const response = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        const responseData = await response.json();
        if (response.ok && responseData.idMessage) {
            return "SUCCESS";
        } else {
            return `Send error: ${responseData.message || JSON.stringify(responseData)}`;
        }
    } catch (e) {
        return `Exception: ${e.message}`;
    }
}

// 1. टेक्स्ट मैसेज या कमांड्स हैंडलिंग
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

    // 🟢 चेक करें कि क्या यूजर व्हाट्सएप सेंडिंग मोड में नंबर टाइप कर रहा है
    let w_mode = JSON.parse(fs.readFileSync(whatsapp_mode_file));
    if (w_mode[chatId]) {
        let active_whatsapp_job = w_mode[chatId];
        let cleaned_number = text.replace(/[^0-9]/g, '');
        
        if (cleaned_number.length >= 10) {
            let status_msg = await bot.sendMessage(chatId, `⏳ Green API क्लाउड पर फ़ाइल सिंक की जा रही है, कृपया रुकें...`, { parse_mode: "Markdown" });
            
            let apiStatus = await sendToWhatsAppGreen(cleaned_number, active_whatsapp_job.file_id, active_whatsapp_job.type, active_whatsapp_job.key);
            
            if (apiStatus === "SUCCESS") {
                await bot.sendMessage(chatId, `✅ *Success!* File Green API ke jariye number *${cleaned_number}* par successfully transfer ho gayi hai.`);
            } else {
                await bot.sendMessage(chatId, `❌ *Green API Error!* WhatsApp par file nahi bheji ja saki.\n\n*Reason:* \n\`${apiStatus}\``, { parse_mode: "Markdown" });
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

    // 🔓 डिक्रिप्शन पिन चेक लॉजिक
    let s_lock = JSON.parse(fs.readFileSync(search_lock_file));
    if (s_lock[chatId]) {
        if (text === secret_password) {
            if (fs.existsSync(attempts_file)) { try{fs.unlinkSync(attempts_file);}catch(e){} }
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
                        
                        let w_mode_data = JSON.parse(fs.readFileSync(whatsapp_mode_file));
                        w_mode_data[chatId] = { file_id: decrypted_file_id, type: vault[key].type, key: key };
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
            let current_attempts = await handleWrongAttempt(msg);
            let remaining = 3 - current_attempts;
            if (remaining > 0) {
                let reply = await bot.sendMessage(chatId, `❌ *Error:* Galat PIN! Document decrypt nahi kiya ja saka. (Aapke paas ${remaining} attempt bache hain)`);
                autoDeleteMessage(chatId, msg.message_id);
                autoDeleteMessage(chatId, reply.message_id);
            }
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
            let old_name = parts[1].toLowerCase(); 
            let new_name = parts[2].toLowerCase(); 
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

    // ⚙️ पिन चेंज लॉजिक
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
                } else {
                    let reply = await bot.sendMessage(chatId, "❌ Error: Naya password kam se kam 4 characters ka hona chahiye!");
                    autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                }
            } else {
                let reply = await bot.sendMessage(chatId, "❌ Error: Purana password galat hai!");
                autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
            }
        }
        return;
    }

    // ⚙️ फाइल डिलीट करना
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

    if (text_lower === "clean all" || text_lower === "/cleanall") {
        fs.writeFileSync(db_file, JSON.stringify({}));
        let reply = await bot.sendMessage(chatId, "🗑️ *Fresh Start!* Saara purana data delete ho gaya hai.");
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        return;
    }

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

    if (text_lower === "help" || text_lower === "/help") {
        let help_text = "📜 *Bot Commands List:* \n\n"
                      + "🔑 `[password]` - Bot ko unlock karne ke liye\n"
                      + "🔍 `[file name]` - Kisi bhi file ko search karne ke liye\n"
                      + "📋 `/show`
