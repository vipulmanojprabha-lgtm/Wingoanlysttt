const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// ==========================================
// 1. DUMMY SERVER (HOSTING KEEP-ALIVE)
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Vipul Triple Engine Bot Running\n');
}).listen(PORT, () => {
    console.log(`Port active on ${PORT}`);
});

// ==========================================
// 2. CONFIGURATION & NEW BOT TOKEN
// ==========================================
const BOT_TOKEN = '9158220475:AAFzOh-PkK4l67sgblvloXYqqYCrMuy-Pn4';
const TARGET_WINS = 10;

const START_IMAGE = 'https://i.ibb.co/Xx2DpkWx/image.jpg';
const CLOSE_IMAGE = 'https://i.ibb.co/ksT1Ky5h/image.jpg';
const WIN_GIF = 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif';

let CHANNEL_ID = null;
let isBotActive = false;
let sessionWins = 0;
let currentLevel = 1;
let pendingPrediction = null;
let lastSettledIssue = null;
let isChecking = false;

// Auto-clear webhook to enable continuous polling
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

async function initTelegramConnection() {
    try {
        await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
        console.log('✅ Webhook cleared. Starting Polling on Render...');
        bot.startPolling();
    } catch (e) {
        console.error('Webhook cleanup notice:', e.message);
        bot.startPolling();
    }
}
initTelegramConnection();

const API_ENDPOINTS = [
    'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery03.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery04.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery05.com/WinGo/WinGo_30S/GetHistoryIssuePage.json'
];

// ================================================================
// 3. EXACT TRIPLE-ENGINE LOGIC (COPIED FROM demoooo.html)
// ================================================================

// 3.1 NUMBER CHART (00–99) for VIPUL AI
const NUMBER_CHART = {
  "00":"B","01":"B","02":"B","03":"S","04":"B","05":"S","06":"S","07":"B","08":"S","09":"B",
  "10":"B","11":"S","12":"S","13":"S","14":"S","15":"S","16":"S","17":"S","18":"B","19":"B",
  "20":"S","21":"S","22":"S","23":"B","24":"S","25":"B","26":"S","27":"S","28":"B","29":"B",
  "30":"S","31":"S","32":"B","33":"S","34":"S","35":"S","36":"B","37":"B","38":"B","39":"B",
  "40":"S","41":"B","42":"S","43":"S","44":"S","45":"B","46":"B","47":"S","48":"B","49":"B",
  "50":"S","51":"B","52":"B","53":"S","54":"B","55":"S","56":"S","57":"S","58":"S","59":"B",
  "60":"S","61":"B","62":"B","63":"S","64":"B","65":"B","66":"S","67":"B","68":"S","69":"S",
  "70":"B","71":"B","72":"S","73":"S","74":"B","75":"B","76":"S","77":"B","78":"B","79":"B",
  "80":"B","81":"B","82":"S","83":"S","84":"B","85":"B","86":"B","87":"B","88":"B","89":"S",
  "90":"S","91":"S","92":"B","93":"S","94":"S","95":"S","96":"S","97":"S","98":"B","99":"S"
};

// ENGINE 1 — NUMBER TRICK (ROOT DIGIT OF 5)
function computeRootDetails(numbers) {
  if (!Array.isArray(numbers) || numbers.length < 5) return null;
  const five = numbers.slice(0, 5).map(Number);
  const sum = five.reduce((a, b) => a + b, 0);
  let cur = sum;
  while (cur > 9) {
    const digits = String(cur).split('').map(Number);
    cur = digits.reduce((a, b) => a + b, 0);
  }
  return cur >= 5 ? 'B' : 'S';
}

// ENGINE 2 — ABS ADD (10 RESULTS: |N1-N2| + |N9-N10|)
function computeAbsDetails(numbers) {
  if (!Array.isArray(numbers) || numbers.length < 10) return null;
  const ten = numbers.slice(0, 10).map(Number);
  const calc1 = ten[0] - ten[1];
  const calc2 = ten[8] - ten[9];
  const total = Math.abs(calc1) + Math.abs(calc2);
  let cur = total;
  while (cur >= 10) {
    const digits = String(cur).split('').map(Number);
    cur = digits.reduce((a, b) => a + b, 0);
  }
  return cur >= 5 ? 'B' : 'S';
}

// ENGINE 3 — VIPUL AI (CHART 00-99 + LEVEL 4 REVERSE)
function computeVipulDetails(numbers, level) {
  if (!Array.isArray(numbers) || numbers.length < 2) return null;
  const combined = String(numbers[0]) + String(numbers[1]);
  const baseSig = NUMBER_CHART[combined] || (Number(numbers[0]) >= 5 ? 'B' : 'S');
  const reverseOn = Number(level) >= 4;
  if (reverseOn) {
    return baseSig === 'B' ? 'S' : 'B';
  }
  return baseSig;
}

// ==========================================
// 4. SAFE MEDIA SENDER
// ==========================================
async function sendPhotoSafe(chatId, url, caption) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 4000 });
        await bot.sendPhoto(chatId, Buffer.from(res.data), { caption, parse_mode: 'Markdown' });
    } catch (e) {
        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
    }
}

async function sendGifSafe(chatId, url, caption) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 4000 });
        await bot.sendAnimation(chatId, Buffer.from(res.data), { caption, parse_mode: 'Markdown' });
    } catch (e) {
        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
    }
}

async function sendStartPoster() {
    if (!CHANNEL_ID) return;
    const caption = `🔥 *VIPUL BHAI OFFICIAL TRADING SESSION START* 🔥\n\n` +
                    `🎮 *Game:* WinGo 30s (Triple Engine Voting)\n` +
                    `🎯 *Target:* ${TARGET_WINS} CONFIRMED WINS\n` +
                    `💰 *Fund Management:* Maintain 5 to 7 Levels\n\n` +
                    `⚡ _Signals starting now! Follow strictly._`;
    await sendPhotoSafe(CHANNEL_ID, START_IMAGE, caption);
}

async function sendClosePoster() {
    if (!CHANNEL_ID) return;
    const caption = `🎉 *SESSION FINISHED - TARGET ACHIEVED!* 🎉\n\n` +
                    `✅ *Total Wins:* ${sessionWins}/${TARGET_WINS} WINS\n` +
                    `💰 *All Members Book Heavy Profits!* 💰\n\n` +
                    `Agla session Vipul Bhai ke order par start hoga! 🚀`;
    await sendPhotoSafe(CHANNEL_ID, CLOSE_IMAGE, caption);
}

// ==========================================
// 5. MANUAL CONTROLS
// ==========================================
async function startSession(chatId) {
    isBotActive = true;
    sessionWins = 0;
    currentLevel = 1;
    pendingPrediction = null;
    lastSettledIssue = null;
    await sendStartPoster();
}

async function stopSession(chatId) {
    isBotActive = false;
    pendingPrediction = null;
    if (CHANNEL_ID) {
        await bot.sendMessage(CHANNEL_ID, `⏹ *Session Stopped by Admin!*`, { parse_mode: 'Markdown' });
    }
}

bot.on('channel_post', async (msg) => {
    CHANNEL_ID = msg.chat.id;
    const text = (msg.text || '').trim();
    if (text === '/start') await startSession(msg.chat.id);
    else if (text === '/stop') await stopSession(msg.chat.id);
});

bot.on('message', async (msg) => {
    if (msg.chat.type === 'private') {
        const text = (msg.text || '').trim();
        if (text === '/start') {
            if (!CHANNEL_ID) {
                bot.sendMessage(msg.chat.id, `⚠️ Pehle apne Channel me koi bhi message bhejo taaki bot channel link kar sake!`);
                return;
            }
            await startSession(msg.chat.id);
            bot.sendMessage(msg.chat.id, `▶️ Bot Live ho gaya hai channel me!`);
        } else if (text === '/stop') {
            await stopSession(msg.chat.id);
            bot.sendMessage(msg.chat.id, `⏹ Bot Band ho gaya!`);
        }
    }
});

// ==========================================
// 6. LIVE API DATA FETCH
// ==========================================
async function fetchLatestData() {
    for (const url of API_ENDPOINTS) {
        try {
            const res = await axios.get(`${url}?pageNo=1&pageSize=15&_t=${Date.now()}`, { timeout: 2200 });
            if (res.data && res.data.data && res.data.data.list && res.data.data.list.length > 0) {
                return res.data.data.list;
            }
        } catch (e) {}
    }
    return null;
}

// ==========================================
// 7. PREDICTION ENGINE (TRIPLE ENGINE MAJORITY)
// ==========================================
async function runSpiderEngine() {
    if (isChecking || !isBotActive || !CHANNEL_ID) return;
    isChecking = true;

    try {
        if (sessionWins >= TARGET_WINS) {
            isBotActive = false;
            await sendClosePoster();
            isChecking = false;
            return;
        }

        const list = await fetchLatestData();
        if (!list || list.length < 10) {
            isChecking = false;
            return;
        }

        const latestItem = list[0];
        const latestIssue = String(latestItem.issueNumber);
        const latestNum = parseInt(latestItem.number);
        const actualResult = latestNum >= 5 ? 'BIG' : 'SMALL';

        // 1. Result Matching & Settlement
        if (pendingPrediction) {
            const predIssue = BigInt(pendingPrediction.issue);
            const liveIssue = BigInt(latestIssue);

            if (liveIssue >= predIssue && lastSettledIssue !== latestIssue) {
                lastSettledIssue = latestIssue;

                if (pendingPrediction.predicted === actualResult) {
                    sessionWins++;
                    const winCaption = `🎯 *RESULT:* ${actualResult} (${latestNum})\n` +
                                       `✅ *WIN WIN WIN!* 🎉\n` +
                                       `🏆 *Session Wins:* [${sessionWins}/${TARGET_WINS}]`;
                    await sendGifSafe(CHANNEL_ID, WIN_GIF, winCaption);
                    currentLevel = 1;
                } else {
                    currentLevel++;
                    const lossMsg = `🎯 *RESULT:* ${actualResult} (${latestNum})\n` +
                                    `❌ *LOSS* ➡️ Go to *Level ${currentLevel}* (X3/X2)`;
                    await bot.sendMessage(CHANNEL_ID, lossMsg, { parse_mode: 'Markdown' });
                }

                pendingPrediction = null;

                if (sessionWins >= TARGET_WINS) {
                    isBotActive = false;
                    await sendClosePoster();
                    isChecking = false;
                    return;
                }
            } else if (Date.now() - pendingPrediction.createdAt > 34000) {
                pendingPrediction = null;
            }
        }

        // 2. Next Round Prediction Generation (Triple Engine Majority)
        if (!pendingPrediction) {
            const nextIssue = (BigInt(latestIssue) + 1n).toString();
            const numbers = list.map(item => Number(item.number));

            const rootSig = computeRootDetails(numbers);
            const absSig = computeAbsDetails(numbers);
            const vipulSig = computeVipulDetails(numbers, currentLevel);

            const votes = [];
            if (rootSig) votes.push(rootSig);
            if (absSig) votes.push(absSig);
            if (vipulSig) votes.push(vipulSig);

            const bigCount = votes.filter(v => v === 'B').length;
            const smallCount = votes.filter(v => v === 'S').length;

            let finalSig = null;
            if (bigCount > smallCount) finalSig = 'BIG';
            else if (smallCount > bigCount) finalSig = 'SMALL';
            else finalSig = rootSig === 'B' ? 'BIG' : 'SMALL'; // Tie break

            if (finalSig) {
                pendingPrediction = {
                    issue: nextIssue,
                    predicted: finalSig,
                    createdAt: Date.now()
                };

                const votesLabel = `${bigCount}B / ${smallCount}S`;
                const predMsg = `🏆 *VIPUL BHAI FINAL PREDICTION*\n` +
                                `━━━━━━━━━━━━━━━━━━━\n` +
                                `🎮 *Period:* \`${nextIssue.slice(-4)}\`\n` +
                                `🎯 *Prediction:* *${finalSig}*\n` +
                                `🗳 *Votes:* \`${votesLabel}\`\n` +
                                `📈 *Level:* ${currentLevel}\n` +
                                `🏆 *Target:* [${sessionWins}/${TARGET_WINS}] Wins\n` +
                                `━━━━━━━━━━━━━━━━━━━\n` +
                                `⏳ _Wait for result..._`;

                await bot.sendMessage(CHANNEL_ID, predMsg, { parse_mode: 'Markdown' });
            }
        }

    } catch (err) {
        console.error('Engine Loop Error:', err.message);
    } finally {
        isChecking = false;
    }
}

setInterval(runSpiderEngine, 2500);
console.log('🤖 Vipul Triple-Engine Bot Running on Render!');
