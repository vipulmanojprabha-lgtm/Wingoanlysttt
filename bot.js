const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==============================================================
// 1. DUMMY SERVER (24/7 ALIVE RAKHNE KE LIYE)
// ==============================================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot running alive 24/7!\n');
}).listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// ==============================================================
// 2. CONFIGURATION & TIME SETTINGS
// ==============================================================
const BOT_TOKEN = '9035645654:AAFHoRNKHSuehNE4rH7FbyIx1ofx82vrLj4';
const ADMIN_ID = 6363654573; // Aapka Telegram User ID
let CHANNEL_ID = null; 
const GAME_MODE = '30sec'; // WinGo 30s API

// ⏰ AUTOMATIC DAILY SESSIONS (Indian Standard Time UTC+5:30)
const SESSIONS = [
  { start: '10:15', end: '11:15' }, // Subah 10:15 AM
  { start: '13:15', end: '14:15' }  // Dopahar 1:15 PM
];

// 🎯 TARGET WINS PER SESSION
const TARGET_WINS = 10;     

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// WinGo API endpoints
const API_ENDPOINTS = {
  '30sec': [
    'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery03.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery04.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery05.com/WinGo/WinGo_30S/GetHistoryIssuePage.json'
  ]
};

// ==============================================================
// 3. TIME CHECKER (IST)
// ==============================================================
function isScheduledTime() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
  const currentMinutes = istDate.getHours() * 60 + istDate.getMinutes();

  for (const session of SESSIONS) {
    const [startH, startM] = session.start.split(':').map(Number);
    const [endH, endM] = session.end.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (currentMinutes >= startMin && currentMinutes <= endMin) {
      return true;
    }
  }
  return false;
}

// ==============================================================
// 4. BOT STATE & CONTROLS
// ==============================================================
let isBotActive = true; 
let manualForceOn = false; 
let sessionWins = 0;   
let currentLevel = 1;
let pendingPrediction = null; 
let lastProcessedIssue = null;
let busy = false;
let sessionAnnounced = false; // Start poster bar-bar na jaye

// Channel Auto Detection
bot.on('channel_post', (msg) => {
  if (!CHANNEL_ID) {
    CHANNEL_ID = msg.chat.id;
    console.log(`✅ Channel detected: ${CHANNEL_ID}`);
    bot.sendMessage(CHANNEL_ID, '🚀 <b>VIPUL BHAI BOT CONNECTED!</b>\nLive Predictions Active.', { parse_mode: 'HTML' });
  }
});

function isAdmin(msg) {
  if (!ADMIN_ID || msg.from.id === ADMIN_ID) return true;
  return false;
}

// Session Start Poster Sender (Supports .webp, .gif, .jpg)
async function sendSessionStartPoster() {
  if (!CHANNEL_ID) return;
  const startFiles = ['start.webp', 'start.gif', 'start.jpg', 'start.png'];
  const captionText = `🟢 <b>COMPOUNDING SESSION START!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 Target: <b>10 WINS</b>\n` +
    `🎮 Game: <b>WinGo 30s</b>\n` +
    `📌 <i>Maintain 5 to 10 level risk management balance.</i>\n` +
    `━━━━━━━━━━━━━━━━━━━━`;

  for (const f of startFiles) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) {
      try {
        if (f.endsWith('.gif')) {
          await bot.sendAnimation(CHANNEL_ID, p, { caption: captionText, parse_mode: 'HTML' });
        } else {
          await bot.sendPhoto(CHANNEL_ID, p, { caption: captionText, parse_mode: 'HTML' });
        }
        return;
      } catch (err) {
        console.error('Start Poster Send Error:', err.message);
      }
    }
  }

  try {
    await bot.sendMessage(CHANNEL_ID, captionText, { parse_mode: 'HTML' });
  } catch (err) {}
}

// Admin Commands
bot.onText(/\/start/, async (msg) => {
  if (!isAdmin(msg)) return;
  isBotActive = true;
  manualForceOn = true; 
  sessionWins = 0;
  currentLevel = 1;
  pendingPrediction = null;
  sessionAnnounced = true; 
  await sendSessionStartPoster(); // Pehle start poster bhejega
  bot.sendMessage(msg.chat.id, '▶️ <b>Bot Started Manually!</b>\nSession Start Poster channel me send ho gaya. (Target: 10 Wins)', { parse_mode: 'HTML' });
  console.log(`Admin ${msg.from.id} manually started the session.`);
});

bot.onText(/\/stop/, (msg) => {
  if (!isAdmin(msg)) return;
  isBotActive = false;
  manualForceOn = false;
  sessionAnnounced = false;
  bot.sendMessage(msg.chat.id, '⏸️ <b>Bot Stopped!</b>\nSignals paused.', { parse_mode: 'HTML' });
  console.log(`Admin ${msg.from.id} paused the bot.`);
});

bot.onText(/\/auto/, (msg) => {
  if (!isAdmin(msg)) return;
  manualForceOn = false;
  isBotActive = true;
  sessionWins = 0;
  sessionAnnounced = false;
  bot.sendMessage(msg.chat.id, '⏰ <b>Auto-Schedule Mode Active!</b>\nBot ab sirf 10:15 AM aur 1:15 PM par chalega.', { parse_mode: 'HTML' });
});

bot.onText(/\/resetwin/, (msg) => {
  if (!isAdmin(msg)) return;
  sessionWins = 0;
  bot.sendMessage(msg.chat.id, '🔄 <b>Wins Count Reset to 0!</b>', { parse_mode: 'HTML' });
});

// ==============================================================
// 5. ROOT DIGIT PREDICTION LOGIC
// ==============================================================
function reduceToRootDigit(total) {
  let value = Math.abs(Math.trunc(total));
  while (value > 9) {
    let sum = 0;
    const str = String(value);
    for (let i = 0; i < str.length; i++) sum += Number(str[i]);
    value = sum;
  }
  return value;
}

function computePredictionDetails(numbers) {
  if (!Array.isArray(numbers) || numbers.length < 5) return null;
  const five = numbers.slice(0, 5).map(Number);
  const sum = five.reduce((a, b) => a + b, 0);
  const rootDigit = reduceToRootDigit(sum);
  return rootDigit >= 5 ? 'BIG' : 'SMALL';
}

function lg_nextIssueId(issue) {
  const match = String(issue || '').match(/^(.*?)(\d+)$/);
  if (!match) return null;
  try {
    const next = (BigInt(match[2]) + 1n).toString().padStart(match[2].length, '0');
    return match[1] + next;
  } catch (e) { return null; }
}

function flipSignal(sig) { return sig === 'BIG' ? 'SMALL' : 'BIG'; }

function extractRows(payload) {
  const found = [], seen = new Set();
  function walk(n) {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const issue = n.issueNumber ?? n.issue_number ?? n.issue ?? n.periodNumber;
    const raw = n.number ?? n.resultNumber ?? n.result_number ?? n.openNumber;
    if (issue !== undefined && raw !== undefined) {
      const m = String(raw).match(/(?:^|\D)([0-9])(?:\D|$)/);
      if (m) {
        const number = +m[1];
        found.push({ issue: String(issue), number, value: number >= 5 ? 'BIG' : 'SMALL' });
      }
    }
    Object.values(n).forEach(walk);
  }
  walk(payload);
  return [...new Map(found.map(x => [x.issue, x])).values()].sort((a, b) => a.issue.localeCompare(b.issue, undefined, { numeric: true }));
}

async function fetchLatestData() {
  for (const url of API_ENDPOINTS[GAME_MODE]) {
    try {
      const res = await axios.get(`${url}?ts=${Date.now()}`, { timeout: 3500 });
      if (res.data) {
        const rows = extractRows(res.data);
        if (rows && rows.length >= 5) return rows;
      }
    } catch (e) {}
  }
  return null;
}

// WIN hone par Animation GIF / WEBP
async function sendResultUpdate(captionText, isWin) {
  if (!CHANNEL_ID) return;
  if (isWin) {
    const winFiles = ['win.webp', 'win.gif', 'win.mp4'];
    for (const f of winFiles) {
      const p = path.join(__dirname, f);
      if (fs.existsSync(p)) {
        try {
          await bot.sendAnimation(CHANNEL_ID, p, { caption: captionText, parse_mode: 'HTML' });
          return;
        } catch (err) {}
      }
    }
  }
  try {
    await bot.sendMessage(CHANNEL_ID, captionText, { parse_mode: 'HTML' });
  } catch (err) {}
}

// 10 WINS POSTER SENDER (close.jpg / close.webp)
async function sendSessionClose(captionText) {
  if (!CHANNEL_ID) return;
  const closeFiles = ['close.jpg', 'close.webp', 'close.png'];
  for (const f of closeFiles) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) {
      try {
        await bot.sendPhoto(CHANNEL_ID, p, { caption: captionText, parse_mode: 'HTML' });
        return;
      } catch (err) {}
    }
  }
  try {
    await bot.sendMessage(CHANNEL_ID, captionText, { parse_mode: 'HTML' });
  } catch (err) {}
}

async function sendTelegramMessage(text) {
  if (!CHANNEL_ID) return;
  try {
    await bot.sendMessage(CHANNEL_ID, text, { parse_mode: 'HTML' });
  } catch (err) {}
}

// ==============================================================
// 6. MAIN ENGINE LOOP
// ==============================================================
async function checkAndPredict() {
  if (!isBotActive) return;
  if (sessionWins >= TARGET_WINS) return;

  const canRun = manualForceOn || isScheduledTime();
  if (!canRun) {
    sessionAnnounced = false; // Schedule time khatam hone par reset
    return;
  }

  // Agar auto session start hua hai aur Start Poster nahi gaya to bhejo
  if (!sessionAnnounced) {
    sessionAnnounced = true;
    await sendSessionStartPoster();
  }

  if (busy) return;
  busy = true;

  try {
    const rows = await fetchLatestData();
    if (!rows || rows.length < 5) { busy = false; return; }

    const latestResult = rows[rows.length - 1];

    if (lastProcessedIssue && latestResult.issue > lastProcessedIssue) {
      if (pendingPrediction && String(latestResult.issue) === String(pendingPrediction.issue)) {
        const isWin = latestResult.value === pendingPrediction.pred;

        if (isWin) {
          sessionWins++;
          currentLevel = 1;
        } else {
          currentLevel = Math.min(10, currentLevel + 1);
        }

        let resultMsg = `🎯 <b>RESULT UPDATE</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 Period: <code>${latestResult.issue}</code>\n` +
          `🎲 Result: <b>${latestResult.value} (${latestResult.number})</b>\n` +
          `📌 Status: ${isWin ? '✅ <b>WIN</b>' : '❌ <b>LOSS (NEXT LEVEL)</b>'}\n` +
          `📈 Level: <b>Level ${pendingPrediction.level}</b>\n` +
          `🏆 Wins: <b>${sessionWins}/${TARGET_WINS}</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━`;

        await sendResultUpdate(resultMsg, isWin);

        // 10 Win target complete check: Post "SESSION CLOSE" Poster
        if (sessionWins >= TARGET_WINS) {
          let targetMsg = `🏁 <b>SESSION CLOSED!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `✅ <b>10 WINS COMPOUNDING TARGET ACHIEVED!</b>\n` +
            `💰 Book your profits now.\n` +
            `🛑 Bot auto-stopped for this session.\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 <i>Wait for the next session announcement.</i>`;
          await sendSessionClose(targetMsg);
          manualForceOn = false;
          sessionAnnounced = false;
          console.log(`Target ${TARGET_WINS} wins reached. Session Close Poster Sent.`);
        }

        pendingPrediction = null;
      }
      lastProcessedIssue = latestResult.issue;
    }

    if (!lastProcessedIssue) lastProcessedIssue = latestResult.issue;

    // New Signal
    if (!pendingPrediction && sessionWins < TARGET_WINS && canRun) {
      const nextIssue = lg_nextIssueId(latestResult.issue);
      const reversedRows = rows.slice().reverse();
      const last5Numbers = reversedRows.slice(0, 5).map(r => r.number);
      let pred = computePredictionDetails(last5Numbers);

      if (pred && nextIssue) {
        const isRev = [2, 3].includes(currentLevel);
        if (isRev) pred = flipSignal(pred);

        pendingPrediction = { issue: nextIssue, pred, level: currentLevel };

        let signalMsg = `🚀 <b>WIN-GO SIGNAL (30 SEC)</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📅 Period: <code>${nextIssue}</code>\n` +
          `🎯 Prediction: <b>${pred}</b>\n` +
          `📊 Level: <b>Level ${currentLevel}</b>\n` +
          `🏆 Wins: <b>${sessionWins}/${TARGET_WINS}</b>\n` +
          `${isRev ? '⚡ <i>(Reverse Engine Active)</i>\n' : ''}` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 <i>Maintain 10-level risk management balance.</i>`;

        await sendTelegramMessage(signalMsg);
        console.log(`[Signal Sent] Period: ${nextIssue} | Pred: ${pred} | Level: ${currentLevel}`);
      }
    }
  } catch (e) {
    console.error('Loop Error:', e.message);
  } finally {
    busy = false;
  }
}

setInterval(checkAndPredict, 4000);
console.log('🤖 Prediction Bot Running with Start & Close Posters...');
    
