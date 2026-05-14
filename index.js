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

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.txt';
const search_lock_file = 'search_lock.json'; 

if (!fs.existsSync(db_file)) fs.writeFileSync(db_file, JSON.stringify({}));
if (!fs.existsSync(config_file)) fs.writeFileSync(config_file, JSON.stringify({ password: "2739" }));
if (!fs.existsSync(search_lock_file)) fs.writeFileSync(search_lock_file, JSON.stringify({}));

const bot = new NTB(token, { polling: true });

// 🔒 AES-256 मिलिट्री-ग्रेड इंक्रिप्शन और डिक्रिप्शन फंक्शन्स (पूरी तरह फिक्स्ड)
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

// ⏳ फिक्स: 1 मिनट (60 सेकंड) में चैट को दोनों तरफ से पूरी तरह साफ (Empty) करने का अचूक फंक्शन
function autoDeleteMessage(chatId, msgId) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(chatId.toString(), msgId);
        } catch (e) { /* मैसेज पहले से डिलीटेड हो तो क्रैश न हो */ }
    }, 60000); // सटीक 60 सेकंड
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

// बोट सेशन और ऑटो-लॉक टाइमआउट चेकर
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

// 🚨 घुसपैठिया ट्रैकर और सुरक्षा ब्लॉक फंक्शन
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

    // 🔓 अनब्लॉक बोट कमांड
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

    // 🔓 फिक्स: डिक्रिप्शन पिन चेक वैलिडेशन (डिक्रिप्शन कोड एरर पूरी तरह ठीक किया गया)
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
                            let sent = await bot.sendPhoto(chatId, decrypted_file_id, { caption: `🎯 Decrypted Photo: ${key}` });
                            autoDeleteMessage(chatId, sent.message_id);
                        } else {
                            let sent = await bot.sendDocument(chatId, decrypted_file_id, { caption: `🎯 Decrypted Document: ${key}` });
                            autoDeleteMessage(chatId, sent.message_id);
                        }
                    }
                }
            }
            // पिन वेरिफिकेशन सफल होने पर सेशन को ताज़ा करना
            fs.writeFileSync(session_file, JSON.stringify({ status: 'unlocked', last_time: Date.now() }));
            updateBotMenu("unlock");
            
            delete s_lock[chatId];
            fs.writeFileSync(search_lock_file, JSON.stringify(s_lock));
            autoDeleteMessage(chatId, msg.message_id); // यूजर का मैसेज 1 मिनट में साफ
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
        
        const welcome_menu = "🔓 *Bot Unlocked Successfully!* \n\n"
                      + "Bhai, aapka swagat hai. Saare commands active hain:\n\n"
                      + "🔍 *फाइल सर्च करने के लिए:*\n"
                      + "• बस फाइल का नाम लिखकर भेजें (उदा: `aadhar`)\n\n"
                      + "📋 *डेटा और लिस्ट कमांड्स:*\n"
                      + "• `all caption` / `all` / `list` - फाइलों की सूची देखें।\n"
                      + "• `show all` / `show` - प्रकार (Photo/Doc) देखें।\n\n"
                      + "⚙️ *मैनेजमेंट कमांड्स:*\n"
                      + "• `edit [old_name] [new_name]` - फाइल का नाम बदलें।\n"
                      + "• `changepin [old] [new]` - सीक्रेट पिन बदलें।\n"
                      + "• `del [naam]` - फाइल डिलीट करें।\n"
                      + "• `clean all` - सारा डेटा साफ करें।\n"
                      + "• `lock` - बॉट लॉक करें।\n\n"
                      + "⏳ _Sari chat aur documents 1 minute me automatic delete ho jayenge._";
                      
        let reply = await bot.sendMessage(chatId, welcome_menu, { parse_mode: "Markdown" });
        autoDeleteMessage(chatId, msg.message_id); // यूजर का मैसेज साफ
        autoDeleteMessage(chatId, reply.message_id); // बोट का मेनू साफ
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

    // 🛡️ फिक्स: बोट लॉक होने पर सर्चिंग पूरी तरह ब्लॉक रहेगी
    if (!is_unlocked) {
        let current_attempts = await handleWrongAttempt(msg);
        let remaining = 3 - current_attempts;
        if (remaining > 0) {
            let reply = await bot.sendMessage(chatId, `❌ *Galat Password!* \n\n🔑 Bot abhi locked hai. Kripya pehle sahi Secret Password bhejein. (Aapke paas ${remaining} attempt bache hain)`);
            autoDeleteMessage(chatId, msg.message_id);
            autoDeleteMessage(chatId, reply.message_id);
        }
        return;
    }

    // ⚙️ कैप्शन एडिट वैलिडेशन फिक्स (edit [old_name] [new_name])
    if (text_lower.startsWith("edit ")) {
        let parts = text.split(" ");
        if (parts.length === 3) {
            let old_name = parts[1].trim().toLowerCase();
            let new_name = parts[2].trim().toLowerCase();
            let vault = JSON.parse(fs.readFileSync(db_file));

            if (!vault[old_name]) {
                let reply = await bot.sendMessage(chatId, `❌ Error: '${parts[1]}' naam ki koi file nahi mili.`);
                autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                return;
            }
            if (vault[new_name]) {
                let reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error! '${parts[2]}' naam pehle se use ho raha hai.`);
                autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                return;
            }

            vault[new_name] = vault[old_name];
            delete vault[old_name];
            fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));

            let reply = await bot.sendMessage(chatId, `✅ Success: '${parts[1]}' ka naam badalkar '${parts[2]}' kar diya gaya hai!`);
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, "⚠️ Format error! Kripya aise likhein: `edit [old_name] [new_name]`");
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        }
        return;
    }

    // ⚙️ पिन चेंज वैलिडेशन फिक्स (changepin [old] [new])
    if (text_lower.startsWith("changepin ")) {
        let parts = text.split(" ");
        if (parts.length === 3) {
            let old_p = parts[1]; 
            let new_p = parts[2];
            if (old_p === secret_password) {
                if (new_p.length >= 4) {
                    fs.writeFileSync(config_file, JSON.stringify({ password: new_p }));
                    let reply = await bot.sendMessage(chatId, "✅ *Success:* Password badal diya gaya hai! Agli baar naye pin se kholein.");
                    autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                } else {
                    let reply = await bot.sendMessage(chatId, "⚠️ Error: Naya password kam se kam 4 digit ka hona chahiye.");
                    autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
                }
            } else {
                let reply = await bot.sendMessage(chatId, "❌ Error: Purana password galat hai! Pin nahi badla.");
                autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
            }
        } else {
            let reply = await bot.sendMessage(chatId, "⚠️ Format error! Kripya aise likhein: `changepin [old_pin] [new_pin]`");
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        }
        return;
    }

    // ⚙️ फाइल डिलीट करना फिक्स (del [naam])
    if (text_lower.startsWith("del ")) {
        let target = text_lower.substring(4).trim().toLowerCase();
        let vault = JSON.parse(fs.readFileSync(db_file));
        if (vault[target]) {
            delete vault[target];
            fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));
            let reply = await bot.sendMessage(chatId, `🗑️ File '${target}' ko delete kar diya gaya hai!`);
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, `❌ Error: '${target}' naam ki koi file nahi mili.`);
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

    // बिना नाम की पेंडिंग फाइल सेव करना (ऑटो-इंक्रिप्शन फिक्स)
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

    // मेनू निर्देश देखना
    if (text_lower === "/start" || text_lower === "/help" || text_lower === "menu") {
        const menu = "📱 *Family Documents Bot Menu* 📱\n\n"
              + "📂 *फाइल कैसे सेव करें:*\n"
              + "• सीधे फोटो/डॉक्यूमेंट भेजें और नाम बताएं।\n\n"
              + "🔍 *फाइल कैसे खोजें:*\n"
              + "• बस फाइल का नाम लिखकर भेजें (जैसे: Aadhar)\n\n"
              + "📋 *खास कमांड्स:*\n"
              + "• `all caption` - सभी फाइलों की लिस्ट देखें।\n"
              + "• `show all` - सारी फाइलें प्रकार के साथ देखें।\n"
              + "• `lock` - बॉट को तुरंत लॉक करने के लिए।";
        let reply = await bot.sendMessage(chatId, menu, { parse_mode: "Markdown" });
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        return;
    }

    if (text_lower === "all caption" || text_lower === "all" || text_lower === "/all" || text_lower === "list") {
        let vault = JSON.parse(fs.readFileSync(db_file));
        if (Object.keys(vault).length > 0) {
            let list = "🗂️ *Aapke Saved Captions:* \n\n";
            let count = 1;
            for (let key in vault) {
                list += `${count}. \`${key}\`\n`;
                count++;
            }
            let reply = await bot.sendMessage(chatId, list, { parse_mode: "Markdown" });
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, "📭 Abhi tak koi bhi file save nahi ki gayi hai!");
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
        }
        return;
    }

    // 🔍 सर्च लॉजिक (सुपरफास्ट डिक्रिप्शन एलर्ट फिक्स)
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
        let reply = await bot.sendMessage(chatId, `🔒 *DOCUMENT LOCKED!*\n\nAapke search se ye files mili hain:\n${files_list}\n\n👉 *Ise live (Decrypt) karne ke liye apna 4-digit PIN bhejein:*`, { parse_mode: "Markdown" });
        
        autoDeleteMessage(chatId, msg.message_id); // यूजर की सर्च क्वेरी साफ
        autoDeleteMessage(chatId, reply.message_id); // बोट का लॉक अलर्ट साफ
        return;
    }
    
    let reply = await bot.sendMessage(chatId, `🔍 Maaf kijiyega, '${text}' se koi document nahi mila!`);
    autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
});

// 2. फ़ाइल अपलोड हैंडलिंग (ऑटो-इंक्रिप्शन मोड)
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
    
    let file_info = { file_id: file_id, type: type };

    if (msg.caption && msg.caption.trim() !== "") {
        let k_db = msg.caption.trim().toLowerCase();
        if (vault[k_db]) {
            let reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error!`);
            autoDeleteMessage(chatId, msg.message_id); addMessageToDeleteLog(chatId, reply.message_id);
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

app.get('/', (req, res) => res.send('Bot Status: 100% Validated and Secure!'));
app.listen(process.env.PORT || 3000);
