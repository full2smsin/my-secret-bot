const NTB = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// ENV CONFIG - Render/GitHub me secrets kabhi code me mat rakho
const token = process.env.BOT_TOKEN;
const my_chat_id = process.env.OWNER_CHAT_ID || '5429869370';
const session_timeout = parseInt(process.env.SESSION_TIMEOUT || '300000', 10);
const default_password = process.env.DEFAULT_PASSWORD || '2739';

const mongoUri = process.env.MONGO_URI;
const mongoDbName = process.env.MONGO_DB_NAME || 'telegram_secure_vault';

const meta_access_token = process.env.META_ACCESS_TOKEN || '';
const meta_phone_number_id = process.env.META_PHONE_NUMBER_ID || '';
const render_app_url = (process.env.RENDER_APP_URL || '').replace(/\/$/, '');

if (!token) {
  console.error('Missing BOT_TOKEN env variable');
  process.exit(1);
}
if (!mongoUri) {
  console.error('Missing MONGO_URI env variable');
  process.exit(1);
}

const bot = new NTB(token, { polling: true });
let db;
let stateCol;

const DEFAULT_STATE = {
  vault: {},
  config: { password: default_password },
  sessions: {},
  blocked: false,
  attempts: {},
  pending: {},
  searchLocks: {},
  whatsappModes: {},
  logs: []
};

async function initMongo() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  db = client.db(mongoDbName);
  stateCol = db.collection('bot_state');
  await stateCol.updateOne(
    { _id: 'state' },
    { $setOnInsert: DEFAULT_STATE },
    { upsert: true }
  );
  console.log('MongoDB connected');
}

async function getState() {
  const doc = await stateCol.findOne({ _id: 'state' });
  if (!doc) return { ...DEFAULT_STATE };
  return {
    vault: doc.vault || {},
    config: doc.config || { password: default_password },
    sessions: doc.sessions || {},
    blocked: !!doc.blocked,
    attempts: doc.attempts || {},
    pending: doc.pending || {},
    searchLocks: doc.searchLocks || {},
    whatsappModes: doc.whatsappModes || {},
    logs: doc.logs || []
  };
}

async function setState(patch) {
  await stateCol.updateOne({ _id: 'state' }, { $set: patch }, { upsert: true });
}

function generateFileHash(fileId) {
  return crypto.createHash('sha256').update(fileId).digest('hex');
}

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

function autoDeleteMessage(chatId, msgId) {
  setTimeout(async () => {
    try { await bot.deleteMessage(chatId.toString(), msgId); } catch (e) {}
  }, 60000);
}

async function updateBotMenu(status) {
  try {
    if (status === 'lock') {
      await bot.setMyCommands([]);
    } else {
      await bot.setMyCommands([
        { command: 'help', description: '📜 सभी कमांड्स की सूची देखें' },
        { command: 'show', description: '🖼️ सारी फाइलों का प्रकार देखें' },
        { command: 'lock', description: '🔒 बॉट को तुरंत लॉक करें' },
        { command: 'backup', description: '📦 MongoDB backup export करें' },
        { command: 'cleanall', description: '🗑️ सारा डेटा डिलीट करके फ्रेश स्टार्ट करें' }
      ]);
    }
  } catch (e) {}
}

async function checkSession(chatId) {
  const state = await getState();
  if (state.blocked) return false;
  const session = state.sessions[chatId];
  if (session && Date.now() - session.last_time < session_timeout) {
    state.sessions[chatId].last_time = Date.now();
    await setState({ sessions: state.sessions });
    return true;
  }
  if (session) {
    delete state.sessions[chatId];
    await setState({ sessions: state.sessions });
    await updateBotMenu('lock');
  }
  return false;
}

async function handleWrongAttempt(msg) {
  const state = await getState();
  const chatId = msg.chat.id.toString();
  const attempts = (state.attempts[chatId] || 0) + 1;
  state.attempts[chatId] = attempts;

  const from = msg.from || {};
  const intruder_name = `${from.first_name || ''} ${from.last_name || ''}`.trim();
  const intruder_username = from.username || 'No Username';
  const intruder_id = from.id ? from.id.toString() : 'Unknown ID';
  const log_entry = `⚠️ Intruder Alert! Name: ${intruder_name}, User: @${intruder_username}, ID: ${intruder_id}, Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`;
  state.logs.push(log_entry);
  if (state.logs.length > 200) state.logs = state.logs.slice(-200);

  if (attempts >= 3) {
    state.blocked = true;
    await updateBotMenu('lock');
  }
  await setState({ attempts: state.attempts, logs: state.logs, blocked: state.blocked });

  if (intruder_id !== my_chat_id) {
    try {
      await bot.sendMessage(my_chat_id, `🚨 *WARNING:* Kisine bot me galat password dala hai!\n\n${log_entry}`, { parse_mode: 'Markdown' });
    } catch (e) {}
  }

  if (attempts >= 3) {
    await bot.sendMessage(chatId, '🚨 *SYSTEM SECURITY BLOCK!* \n\n3 baar galat password dala gaya hai. Yeh bot ab freeze ho chuka hai!', { parse_mode: 'Markdown' });
  }
  return attempts;
}

async function sendToWhatsAppMeta(targetMobile, fileId, type, fileName) {
  try {
    if (!meta_access_token || !meta_phone_number_id || !render_app_url) return false;
    const metaUrl = `https://graph.facebook.com/v20.0/${meta_phone_number_id}/messages`;
    const ext = type === 'photo' ? 'jpg' : 'pdf';
    const publicDownloadUrl = `${render_app_url}/download-vault-file?file_id=${encodeURIComponent(fileId)}&ext=.${ext}`;
    const mediaType = type === 'photo' ? 'image' : 'document';

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: targetMobile,
      type: mediaType,
      [mediaType]: {
        link: publicDownloadUrl,
        caption: `🎯 Vault Document: ${fileName}`,
        filename: `${fileName}.${ext}`
      }
    };

    const response = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${meta_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch (e) {
    return false;
  }
}

bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id.toString();
    if (chatId !== my_chat_id) return;

    const text = msg.text ? msg.text.trim() : '';
    const text_lower = text.toLowerCase();
    if (!text) return;

    const state = await getState();
    const secret_password = state.config.password || default_password;
    const is_unlocked = await checkSession(chatId);

    if (text_lower === 'unblock bot') {
      state.blocked = false;
      state.attempts = {};
      await setState({ blocked: false, attempts: {} });
      await bot.sendMessage(chatId, '✅ *Bot Freeze Removed!* Ab aap password dalkar ise khol sakte hain.', { parse_mode: 'Markdown' });
      return;
    }

    if (state.blocked) {
      await bot.sendMessage(chatId, '🚨 *Bot is Frozen!* Security ke karan yeh bot block ho gaya hai.', { parse_mode: 'Markdown' });
      return;
    }

    if (state.whatsappModes[chatId]) {
      const job = state.whatsappModes[chatId];
      const cleaned_number = text.replace(/[^0-9]/g, '');
      if (cleaned_number.length >= 10) {
        const status_msg = await bot.sendMessage(chatId, `⏳ Meta API se WhatsApp number *${cleaned_number}* par file bheji ja rahi hai...`, { parse_mode: 'Markdown' });
        const isSent = await sendToWhatsAppMeta(cleaned_number, job.file_id, job.type, job.key);
        if (isSent) {
          await bot.sendMessage(chatId, `✅ *Success!* File Meta WhatsApp API ke jariye number *${cleaned_number}* par transfer ho gayi hai.`, { parse_mode: 'Markdown' });
        } else {
          await bot.sendMessage(chatId, '❌ *Meta API Error!* Token, Phone ID ya RENDER_APP_URL check karein.', { parse_mode: 'Markdown' });
        }
        autoDeleteMessage(chatId, status_msg.message_id);
      } else {
        const reply = await bot.sendMessage(chatId, '⚠️ Galat mobile number format! Country code ke sath number bhejein, jaise: 919876543210');
        autoDeleteMessage(chatId, reply.message_id);
      }
      delete state.whatsappModes[chatId];
      await setState({ whatsappModes: state.whatsappModes });
      autoDeleteMessage(chatId, msg.message_id);
      return;
    }

    if (state.searchLocks[chatId]) {
      if (text === secret_password) {
        state.attempts = {};
        const target_keys = state.searchLocks[chatId];
        for (const key of target_keys) {
          const item = state.vault[key];
          if (!item) continue;
          const decrypted_file_id = decryptData(item.file_id, secret_password);
          if (!decrypted_file_id) continue;
          let sent;
          if (item.type === 'photo') sent = await bot.sendPhoto(chatId, decrypted_file_id, { caption: `🎯 Decrypted: ${key}` });
          else sent = await bot.sendDocument(chatId, decrypted_file_id, { caption: `🎯 Decrypted: ${key}` });
          autoDeleteMessage(chatId, sent.message_id);
          state.whatsappModes[chatId] = { file_id: decrypted_file_id, type: item.type, key };
          const ask = await bot.sendMessage(chatId, '📲 *WhatsApp Transfer Mode Active!*\n\nBhai, ye file kis WhatsApp number par bhejein?\n\n👉 Country code ke sath mobile number bhejein, jaise: `919876543210`', { parse_mode: 'Markdown' });
          autoDeleteMessage(chatId, ask.message_id);
        }
        state.sessions[chatId] = { status: 'unlocked', last_time: Date.now() };
        delete state.searchLocks[chatId];
        await setState({ attempts: {}, sessions: state.sessions, searchLocks: state.searchLocks, whatsappModes: state.whatsappModes });
        await updateBotMenu('unlock');
        autoDeleteMessage(chatId, msg.message_id);
      } else {
        const current_attempts = await handleWrongAttempt(msg);
        const remaining = 3 - current_attempts;
        if (remaining > 0) {
          const reply = await bot.sendMessage(chatId, `❌ *Error:* Galat PIN! (${remaining} attempt bache hain)`, { parse_mode: 'Markdown' });
          autoDeleteMessage(chatId, msg.message_id);
          autoDeleteMessage(chatId, reply.message_id);
        }
      }
      return;
    }

    if (text === secret_password) {
      state.attempts = {};
      state.sessions[chatId] = { status: 'unlocked', last_time: Date.now() };
      await setState({ attempts: {}, sessions: state.sessions });
      await updateBotMenu('unlock');
      const reply = await bot.sendMessage(chatId, '🔓 *Bot Unlocked Successfully!*\n\nSaare commands active hain.\n🔍 बस file ka naam likhkar bhejein.', { parse_mode: 'Markdown' });
      autoDeleteMessage(chatId, msg.message_id);
      autoDeleteMessage(chatId, reply.message_id);
      return;
    }

    if (text_lower === 'lock' || text_lower === '/lock') {
      delete state.sessions[chatId];
      await setState({ sessions: state.sessions });
      await updateBotMenu('lock');
      const reply = await bot.sendMessage(chatId, '🔒 *Bot Successfully Locked!*', { parse_mode: 'Markdown' });
      autoDeleteMessage(chatId, msg.message_id);
      autoDeleteMessage(chatId, reply.message_id);
      return;
    }

    if (!is_unlocked) {
      const current_attempts = await handleWrongAttempt(msg);
      const remaining = 3 - current_attempts;
      if (remaining > 0) {
        const reply = await bot.sendMessage(chatId, `❌ *Galat Password!* Bot locked hai. (${remaining} attempt bache hain)`, { parse_mode: 'Markdown' });
        autoDeleteMessage(chatId, msg.message_id);
        autoDeleteMessage(chatId, reply.message_id);
      }
      return;
    }

    if (text_lower === 'help' || text_lower === '/help') {
      const help = '📜 *Bot Commands List:*\n\n' +
        '🔑 `[password]` - Bot unlock\n' +
        '🔍 `[file name]` - File search\n' +
        '📋 `/show` - Saved files list\n' +
        '✏️ `edit old new` - File rename\n' +
        '🗑️ `del filename` - File delete\n' +
        '🔐 `changepin old new` - PIN change\n' +
        '📦 `/backup` - MongoDB backup export\n' +
        '🔒 `/lock` - Bot lock\n' +
        '🧹 `/cleanall` - All vault delete';
      const reply = await bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
      autoDeleteMessage(chatId, msg.message_id);
      autoDeleteMessage(chatId, reply.message_id);
      return;
    }

    if (text_lower === '/backup' || text_lower === 'backup') {
      const backup = { vault: state.vault, config: state.config, exportedAt: new Date().toISOString() };
      const buf = Buffer.from(JSON.stringify(backup, null, 2), 'utf8');
      const sent = await bot.sendDocument(chatId, buf, {}, { filename: `vault-backup-${Date.now()}.json`, contentType: 'application/json' });
      autoDeleteMessage(chatId, msg.message_id);
      autoDeleteMessage(chatId, sent.message_id);
      return;
    }

    if (text_lower.startsWith('edit ')) {
      const parts = text.split(' ');
      if (parts.length === 3) {
        const old_name = parts[1].trim().toLowerCase();
        const new_name = parts[2].trim().toLowerCase();
        if (!state.vault[old_name]) {
          const reply = await bot.sendMessage(chatId, `❌ Error: '${old_name}' naam ki koi file nahi mili.`);
          autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
        }
        if (state.vault[new_name]) {
          const reply = await bot.sendMessage(chatId, `⚠️ Duplicate Name Error! '${new_name}' pehle se use ho raha hai.`);
          autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
        }
        state.vault[new_name] = state.vault[old_name];
        delete state.vault[old_name];
        await setState({ vault: state.vault });
        const reply = await bot.sendMessage(chatId, '✅ Success: Name badal diya gaya hai!');
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
      }
      return;
    }

    if (text_lower.startsWith('changepin ')) {
      const parts = text.split(' ');
      if (parts.length === 3) {
        const old_p = parts[1];
        const new_p = parts[2];
        if (old_p !== secret_password) {
          const reply = await bot.sendMessage(chatId, '❌ Error: Purana password galat hai!');
          autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
        }
        if (new_p.length < 4) {
          const reply = await bot.sendMessage(chatId, '❌ Error: Naya password kam se kam 4 characters ka hona chahiye!');
          autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
        }
        // Re-encrypt all existing file_ids with new PIN
        for (const key of Object.keys(state.vault)) {
          const decrypted = decryptData(state.vault[key].file_id, old_p);
          if (!decrypted) {
            const reply = await bot.sendMessage(chatId, `❌ PIN change failed: '${key}' decrypt nahi ho paayi.`);
            autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
          }
          state.vault[key].file_id = encryptData(decrypted, new_p);
        }
        state.config.password = new_p;
        await setState({ config: state.config, vault: state.vault });
        const reply = await bot.sendMessage(chatId, '✅ *Success:* Password badal diya gaya hai aur vault re-encrypt ho gaya hai!', { parse_mode: 'Markdown' });
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
      }
      return;
    }

    if (text_lower.startsWith('del ')) {
      const target = text_lower.substring(4).trim().toLowerCase();
      if (state.vault[target]) {
        delete state.vault[target];
        await setState({ vault: state.vault });
        const reply = await bot.sendMessage(chatId, `🗑️ File '${target}' delete ho gayi!`);
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
      }
      return;
    }

    if (text_lower === 'clean all' || text_lower === '/cleanall') {
      state.vault = {};
      state.pending = {};
      state.searchLocks = {};
      state.whatsappModes = {};
      await setState({ vault: {}, pending: {}, searchLocks: {}, whatsappModes: {} });
      const reply = await bot.sendMessage(chatId, '🗑️ *Fresh Start!* Saara vault data delete ho gaya hai.', { parse_mode: 'Markdown' });
      autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
      return;
    }

    if (text_lower === 'show all' || text_lower === 'show' || text_lower === '/show' || text_lower === '/all') {
      const keys = Object.keys(state.vault);
      if (keys.length === 0) {
        const reply = await bot.sendMessage(chatId, '📭 Abhi tak koi bhi file save nahi ki gayi hai!');
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
      }
      let list = '🖼️ *Sari Files (Encrypted + MongoDB):*\n\n';
      keys.forEach((key, i) => { list += `${i + 1}. 🔒 \`${key}\` (${state.vault[key].type})\n`; });
      const reply = await bot.sendMessage(chatId, list, { parse_mode: 'Markdown' });
      autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
      return;
    }

    if (state.pending[chatId]) {
      if (state.vault[text_lower]) {
        const reply = await bot.sendMessage(chatId, '⚠️ Duplicate Name Error! Doosra naam batao.');
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
      }
      const pending = state.pending[chatId];
      pending.file_id = encryptData(pending.file_id, secret_password);
      state.vault[text_lower] = pending;
      delete state.pending[chatId];
      await setState({ vault: state.vault, pending: state.pending });
      const reply = await bot.sendMessage(chatId, `🔒 Saved and Encrypted successfully as: ${text}`);
      autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
      return;
    }

    const matched_keys = Object.keys(state.vault).filter(k => k.includes(text_lower));
    if (matched_keys.length > 0) {
      state.searchLocks[chatId] = matched_keys;
      await setState({ searchLocks: state.searchLocks });
      const files_list = matched_keys.map(k => `• \`${k}\``).join('\n');
      const reply = await bot.sendMessage(chatId, `🔒 *DOCUMENT LOCKED!*\n\nAapke search se ye files mili hain:\n${files_list}\n\n👉 Ise open karne ke liye Secret PIN bhejein:`, { parse_mode: 'Markdown' });
      autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
      return;
    }

    const reply = await bot.sendMessage(chatId, `🔍 Maaf kijiyega, '${text}' se koi document nahi mila!`);
    autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
  } catch (e) {
    console.error('message error', e);
  }
});

bot.on('document', async (msg) => handleIncomingFile(msg, 'document', msg.document.file_id));
bot.on('photo', async (msg) => handleIncomingFile(msg, 'photo', msg.photo[msg.photo.length - 1].file_id));

async function handleIncomingFile(msg, type, file_id) {
  try {
    const chatId = msg.chat.id.toString();
    if (chatId !== my_chat_id) return;
    if (!(await checkSession(chatId))) {
      await bot.sendMessage(chatId, '🔑 *Bot is LOCKED!* File save karne ke liye pehle PIN bhejein.', { parse_mode: 'Markdown' });
      return;
    }

    const state = await getState();
    const secret_password = state.config.password || default_password;
    const current_file_hash = generateFileHash(file_id);
    for (const key of Object.keys(state.vault)) {
      if (state.vault[key].hash === current_file_hash) {
        const reply = await bot.sendMessage(chatId, `⚠️ *Duplicate File Error!* Yeh file pehle se \`${key}\` naam se saved hai!`, { parse_mode: 'Markdown' });
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
      }
    }

    const file_info = { file_id, type, hash: current_file_hash, savedAt: new Date().toISOString() };
    if (msg.caption && msg.caption.trim() !== '') {
      const k_db = msg.caption.trim().toLowerCase();
      if (state.vault[k_db]) {
        const reply = await bot.sendMessage(chatId, '⚠️ Duplicate Name Error!');
        autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id); return;
      }
      file_info.file_id = encryptData(file_id, secret_password);
      state.vault[k_db] = file_info;
      await setState({ vault: state.vault });
      const reply = await bot.sendMessage(chatId, '🔒 Saved and Encrypted: ' + msg.caption);
      autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
    } else {
      state.pending[chatId] = file_info;
      await setState({ pending: state.pending });
      const reply = await bot.sendMessage(chatId, '❓ Bhai, ye kiska document hai? Naam batao.');
      autoDeleteMessage(chatId, msg.message_id); autoDeleteMessage(chatId, reply.message_id);
    }
  } catch (e) {
    console.error('file error', e);
  }
}

app.get('/download-vault-file', async (req, res) => {
  const reqFileId = req.query.file_id;
  if (!reqFileId) return res.status(400).send('Missing file id');
  try {
    const getFileUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(reqFileId)}`;
    const fileRes = await fetch(getFileUrl);
    const fileJson = await fileRes.json();
    if (!fileJson.ok) return res.status(404).send('Telegram file error');
    const filePath = fileJson.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const mediaRes = await fetch(downloadUrl);
    res.setHeader('Content-Type', mediaRes.headers.get('content-type') || 'application/octet-stream');
    mediaRes.body.pipe(res);
  } catch (e) {
    res.status(500).send('Server Error');
  }
});

app.get('/', (req, res) => res.send('Bot Status: MongoDB Secure Vault Active'));

initMongo()
  .then(() => {
    app.listen(process.env.PORT || 10000, () => console.log('Server started'));
  })
  .catch((err) => {
    console.error('MongoDB init failed', err);
    process.exit(1);
  });
