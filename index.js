const NTB = require('node-telegram-bot-api');
const fs = require('fs');
const express = require('express');

const app = express();
app.use(express.json());

// 🔑 कॉन्फ़िगरेशन सेटिंग्स
const token = "8779446953:AAG9jVGcT2-fdoHNWhcfW1tpef8WEjuCQZM";
const my_chat_id = 5429869370;
const session_timeout = 300000; // 5 मिनट (मिलीसेकंड में)

const db_file = 'my_secure_vault.json';
const config_file = 'security_config.json';
const log_file = 'security_alerts.log';
const session_file = 'bot_session.txt';
const blocked_file = 'bot_blocked.txt';
const attempts_file = 'login_attempts.txt';
const pending_file = 'pending_file.txt';
const delete_queue_file = 'delete_queue.json';

// शुरुआती जरूरी फाइलें ऑटो-क्रिएट करना
if (!fs.existsSync(db_file)) fs.writeFileSync(db_file, JSON.stringify({}));
if (!fs.existsSync(config_file)) fs.writeFileSync(config_file, JSON.stringify({ password: "2739" }));
if (!fs.existsSync(delete_queue_file)) fs.writeFileSync(delete_queue_file, JSON.stringify([]));

const bot = new NTB(token, { polling: true });

// ⏳ 1 मिनट में मैसेज ऑटो-डिलीट करने की कतार का फंक्शन
function addMessageToDeleteLog(chatId, msgId) {
    let queue = JSON.parse(fs.readFileSync(delete_queue_file));
    queue.push({ chat_id: chatId, message_id: msgId, delete_at: Date.now() + 60000 });
    fs.writeFileSync(delete_queue_file, JSON.stringify(queue, null, 2));
}

// ऑटो-डिलीट कतार को हर 2 सेकंड में प्रोसेस करने का लूप
setInterval(async () => {
    if (!fs.existsSync(delete_queue_file)) return;
    let queue = JSON.parse(fs.readFileSync(delete_queue_file));
    let current_time = Date.now();
    let remaining_queue = [];

    for (let item of queue) {
        if (current_time >= item.delete_at) {
            try {
                await bot.deleteMessage(item.chat_id, item.message_id);
            } catch (e) { /* अगर मैसेज पहले ही डिलीट हो चुका हो */ }
        } else {
            remaining_queue.push(item);
        }
    }
    fs.writeFileSync(delete_queue_file, JSON.stringify(remaining_queue, null, 2));
}, 2000);

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

// सेशन और टाइमआउट चेक करने का फंक्शन
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

// 🚨 घुसपैठिये की डिटेल रिकॉर्ड करने का फंक्शन
async function handleWrongAttempt(msg) {
    let attempts = fs.existsSync(attempts_file) ? parseInt(fs.readFileSync(attempts_file, 'utf8')) : 0;
    attempts++;
    fs.writeFileSync(attempts_file, attempts.toString());

    let from = msg.from;
    let intruder_name = (from.first_name || '') + ' ' + (from.last_name || '');
    let intruder_username = from.username || 'No Username';
    let intruder_id = from.id || 'Unknown ID';
    
    let log_entry = `⚠️ *Intruder Alert!* \n`
               + `• Name: ${intruder_name}\n`
               + `• User: @${intruder_username}\n`
               + `• ID: \`${intruder_id}\`\n`
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
    return $attempts;
}

// 1. टेक्स्ट मैसेज या कमांड्स हैंडलिंग
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
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

    // 🔓 पासवर्ड चेक और अनलॉक होना
    if (text === secret_password) {
        if (fs.existsSync(attempts_file)) { try{fs.unlinkSync(attempts_file);}catch(e){} }
        fs.writeFileSync(session_file, JSON.stringify({ status: 'unlocked', last_time: Date.now() }));
        updateBotMenu("unlock"); 
        
        const welcome_menu = "🔓 *Bot Unlocked Successfully!* \n\n"
                      + "Bhai, aapka swagat hai. Aapke saare secret commands active hain:\n\n"
                      + "🔍 *फाइल सर्च करने के लिए:*\n"
                      + "• बस फाइल का नाम लिखकर भेजें (उदा: `aadhar`)\n\n"
                      + "📋 *डेटा और लिस्ट कमांड्स:*\n"
                      + "• `all caption` / `all` / `list` - सभी सेव की हुई फाइलों की सूची देखें।\n"
                      + "• `show all` / `show` - सारी फाइलें उनके प्रकार (Photo/Doc) के साथ देखें।\n"
                      + "• `show alert` - सुरक्षा लॉग देखें।\n\n"
                      + "⚙️ *मैनेजमेंट कमांड्स:*\n"
                      + "• `edit [old_name] [new_name]` - किसी फाइल का कैप्शन/नाम बदलें।\n"
                      + "• `changepin [old] [new]` - चैट से सीक्रेट पिन बदलें।\n"
                      + "• `del [naam]` - किसी एक फाइल को डिलीट करने के लिए।\n"
                      + "• `clean all` या `/cleanall` - सारा पुराना डेटा एक साथ साफ़ करने के लिए।\n"
                      + "• `lock` या `/lock` - बॉट को तुरंत मैन्युअल लॉक करने के लिए।\n\n"
                      + "⏳ _Yeh chat aur iske baad aap jo bhi file mangayenge, woh safety ke liye 1 minute me automatic delete ho jayegi._";
                      
        let reply = await bot.sendMessage(chatId, welcome_menu, { parse_mode: "Markdown" });
        addMessageToDeleteLog(chatId, msg.message_id);
        addMessageToDeleteLog(chatId, reply.message_id);
        return;
    }

    if (text_lower === "lock" || text_lower === "/lock") {
        if (fs.existsSync(session_file)) { try{fs.unlinkSync(session_file);}catch(e){} }
        updateBotMenu("lock"); 
        let reply = await bot.sendMessage(chatId, "🔒 *Bot Successfully Locked!* Menu saaf kar diya gaya hai.");
        addMessageToDeleteLog(chatId, msg.message_id);
        addMessageToDeleteLog(chatId, reply.message_id);
        return;
    }

    if (!is_unlocked) {
        let current_attempts = await handleWrongAttempt(msg);
        let remaining = 3 - current_attempts;
        if (remaining > 0) {
            await bot.sendMessage(chatId, `🔑 *Bot is LOCKED!* \n\nKripya pehle apna 4-digit Secret Password bhejein. (Aapke paas ${remaining} attempt bache hain)`);
        }
        return;
    }

    // ⚙️ कैप्शन बदलने का फिक्स लॉजिक: edit [old_name] [new_name]
    if (text_lower.startsWith("edit ")) {
        let parts = text.split(" ");
        if (parts.length === 3) {
            let old_name = parts[1].trim().toLowerCase();
            let new_name = parts[2].trim().toLowerCase();
            let vault = JSON.parse(fs.readFileSync(db_file));

            if (!vault[old_name]) {
                let reply = await bot.sendMessage(chatId, `❌ Error: '${parts[1]}' naam ki koi file nahi mili.`);
                addMessageToDeleteLog(chatId, msg.message_id);
                addMessageToDeleteLog(chatId, reply.message_id);
                return;
            }
            if (vault[new_name]) {
                let reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error! '${parts[2]}' naam pehle se use ho raha hai.`);
                addMessageToDeleteLog(chatId, msg.message_id);
                addMessageToDeleteLog(chatId, reply.message_id);
                return;
            }

            // नाम बदलना
            vault[new_name] = vault[old_name];
            delete vault[old_name];
            fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));

            let reply = await bot.sendMessage(chatId, `✅ Success: '${parts[1]}' ka naam badalkar '${parts[2]}' kar diya gaya hai!`);
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, "⚠️ Format error! Kripya aise likhein: `edit [old_name] [new_name]`");
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
        }
        return;
    }

    // ⚙️ पिन चेंज कमांड: changepin [old] [new]
    if (text_lower.startsWith("changepin ")) {
        let parts = text.split(" ");
        if (parts.length === 3) {
            let old_p = parts[1];
            let new_p = parts[2];
            if (old_p === secret_password) {
                if (new_p.length >= 4) {
                    fs.writeFileSync(config_file, JSON.stringify({ password: new_p }));
                    let reply = await bot.sendMessage(chatId, "✅ *Success:* Password badal diya gaya hai!");
                    addMessageToDeleteLog(chatId, msg.message_id);
                    addMessageToDeleteLog(chatId, reply.message_id);
                } else {
                    let reply = await bot.sendMessage(chatId, "⚠️ Error: Password kam se kam 4 digit ka hona chahiye.");
                    addMessageToDeleteLog(chatId, msg.message_id);
                    addMessageToDeleteLog(chatId, reply.message_id);
                }
            } else {
                let reply = await bot.sendMessage(chatId, "❌ Error: Purana password galat hai!");
                addMessageToDeleteLog(chatId, msg.message_id);
                addMessageToDeleteLog(chatId, reply.message_id);
            }
        }
        return;
    }

    // ⚙️ किसी एक फाइल को डिलीट करना: del [naam]
    if (text_lower.startsWith("del ")) {
        let target = text_lower.substring(4).trim().toLowerCase();
        let vault = JSON.parse(fs.readFileSync(db_file));
        if (vault[target]) {
            delete vault[target];
            fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));
            let reply = await bot.sendMessage(chatId, `🗑️ File '${target}' ko delete kar diya gaya hai!`);
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, `❌ Error: '${target}' naam ki koi file nahi mili.`);
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
        }
        return;
    }

    // सुरक्षा लॉग दिखाना: show alert
    if (text_lower === "show alert") {
        if (fs.existsSync(log_file)) {
            let logs = fs.readFileSync(log_file, 'utf8');
            let short_logs = logs.slice(-3000); 
            let reply = await bot.sendMessage(chatId, "📝 *Security Tracker Logs (Latest):*\n\n" + short_logs, { parse_mode: "Markdown" });
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, "✅ No security alerts found!");
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
        }
        return;
    }

    // सारा डेटा डिलीट करना: clean all या /cleanall
    if (text_lower === "clean all" || text_lower === "/cleanall") {
        fs.writeFileSync(db_file, JSON.stringify({}));
        let reply = await bot.sendMessage(chatId, "🗑️ *Fresh Start!* Saara purana data delete ho gaya hai.");
        addMessageToDeleteLog(chatId, msg.message_id);
        addMessageToDeleteLog(chatId, reply.message_id);
        return;
    }

    // सारी फाइलें प्रकार के साथ देखना: show all
    if (text_lower === "show all" || text_lower === "show" || text_lower === "/show") {
        let vault = JSON.parse(fs.readFileSync(db_file));
        if (Object.keys(vault).length === 0) {
            let reply = await bot.sendMessage(chatId, "📭 Abhi tak koi bhi file save nahi ki gayi hai!");
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
            return;
        }
        let list_all = "🖼️ *Sari Files Caption Ke Saath:* \n\n";
        let count = 1;
        for (let key in vault) {
            list_all += `${count}. 🏷️ *Name:* \`${key}\` (${vault[key].type})\n`;
            count++;
        }
        let reply = await bot.sendMessage(chatId, list_all, { parse_mode: "Markdown" });
        addMessageToDeleteLog(chatId, msg.message_id);
        addMessageToDeleteLog(chatId, reply.message_id);
        return;
    }

    // बिना नाम की पेंडिंग फाइल को नाम देकर सेव करना
    if (fs.existsSync(pending_file)) {
        let pending_data = JSON.parse(fs.readFileSync(pending_file));
        if (Object.keys(pending_data).length > 0) {
            let vault = JSON.parse(fs.readFileSync(db_file));
            if (vault[text_lower]) {
                let reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error! '${text}' naam pehle se use ho raha hai. Doosra naam batao.`);
                addMessageToDeleteLog(chatId, msg.message_id);
                addMessageToDeleteLog(chatId, reply.message_id);
                return;
            }
            vault[text_lower] = pending_data;
            fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));
            try{fs.unlinkSync(pending_file);}catch(e){}
            let reply = await bot.sendMessage(chatId, "✅ Saved successfully as: " + text);
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
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
        addMessageToDeleteLog(chatId, msg.message_id);
        addMessageToDeleteLog(chatId, reply.message_id);
        return;
    }

    // सभी कैप्शन्स की सूची: all caption / list
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
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
        } else {
            let reply = await bot.sendMessage(chatId, "📭 Abhi tak koi bhi file save nahi ki gayi hai!");
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
        }
        return;
    }

    // 🔍 100% ओरिजिनल सुपरफास्ट मल्टीपल फाइल सर्च लॉजिक
    let vault = JSON.parse(fs.readFileSync(db_file));
    let found_any = false;

    for (let key in vault) {
        if (key.includes(text_lower)) {
            found_any = true;
            if (vault[key].type === "photo") {
                let sent = await bot.sendPhoto(chatId, vault[key].file_id, { caption: `🎯 Matched Photo: ${key}` });
                addMessageToDeleteLog(chatId, sent.message_id);
            } else {
                let sent = await bot.sendDocument(chatId, vault[key].file_id, { caption: `🎯 Matched Document: ${key}` });
                addMessageToDeleteLog(chatId, sent.message_id);
            }
        }
    }

    if (found_any) {
        addMessageToDeleteLog(chatId, msg.message_id);
        return;
    }
    
    let reply = await bot.sendMessage(chatId, `🔍 Maaf kijiyega, '${text}' se milta-julta koi document nahi mila!`);
    addMessageToDeleteLog(chatId, msg.message_id);
    addMessageToDeleteLog(chatId, reply.message_id);
});

// 2. फ़ाइल अपलोड हैंडलिंग
bot.on('document', async (msg) => { handleIncomingFile(msg, 'document', msg.document.file_id); });
bot.on('photo', async (msg) => { handleIncomingFile(msg, 'photo', msg.photo[msg.photo.length - 1].file_id); });

async function handleIncomingFile(msg, type, file_id) {
    const chatId = msg.chat.id;
    if (chatId !== my_chat_id) return;

    if (!checkSession()) {
        await bot.sendMessage(chatId, "🔑 *Bot is LOCKED!* \n\nFile save karne ke liye pehle Secret Password bhejein.");
        return;
    }

    let vault = JSON.parse(fs.readFileSync(db_file));
    
    // ⚠️ डुप्लिकेट फाइल चेक
    for (let key in vault) {
        if (vault[key].file_id === file_id) {
            let reply = await bot.sendMessage(chatId, `⚠️ *Duplicate File Error!* \n\nBhai, yeh file pehle se hi \`${key}\` naam se saved hai!`, { parse_mode: "Markdown" });
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
            return;
        }
    }

    let file_info = { file_id: file_id, type: type };

    if (msg.caption && msg.caption.trim() !== "") {
        let k_db = msg.caption.trim().toLowerCase();
        if (vault[k_db]) {
            let reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error! '${k_db}' naam se file save hai.`);
            addMessageToDeleteLog(chatId, msg.message_id);
            addMessageToDeleteLog(chatId, reply.message_id);
            return;
        }
        vault[k_db] = file_info;
        fs.writeFileSync(db_file, JSON.stringify(vault, null, 2));
        let reply = await bot.sendMessage(chatId, "✅ Saved: " + msg.caption);
        addMessageToDeleteLog(chatId, msg.message_id);
        addMessageToDeleteLog(chatId, reply.message_id);
    } else {
        fs.writeFileSync(pending_file, JSON.stringify(file_info));
        let reply = await bot.sendMessage(chatId, "❓ Bhai, ye kiska document hai? Naam batao.");
        addMessageToDeleteLog(chatId, msg.message_id);
        addMessageToDeleteLog(chatId, reply.message_id);
    }
}

app.get('/', (req, res) => res.send('Bot Status: Live and Super Active!'));
app.listen(process.env.PORT || 3000);
