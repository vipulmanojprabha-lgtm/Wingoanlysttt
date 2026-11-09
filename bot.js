const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// ==========================================
// 1. DUMMY SERVER (RENDER ALIVE RAKHNE KE LIYE)
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Vipul Prediction Bot is Running\n');
}).listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// ==========================================
// 2. BOT CONFIGURATION
// ==========================================
const BOT_TOKEN = '9035645654:AAFHONNKHtSuehNE4rH7FbyIxtofx82vrLj4';
const TARGET_WINS = 10; // 10 Win hote hi bot band ho jayega

let CHANNEL_ID = null; // Channel auto-detect hoga
let isBotActive = false; // By default band rahega jab tak aap start na karein
let sessionWins = 0;
let currentLevel = 1;
let pendingPrediction = null;
let lastProcessedIssue = null;
let busy = false;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// WinGo 30s Endpoints
const API_ENDPOINTS = [
    'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery03.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery04.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery05.com/WinGo/WinGo_30S/GetHistoryIssuePage.json'
];

// ==========================================
// 3. START & STOP POSTERS
// ==========================================
async function sendStartPoster() {
    if (!CHANNEL_ID) return;
    const msg = `🔥 *VIPUL BHAI LIVE PREDICTION SESSION START* 🔥\n\n` +
                `🎮 *Game:* WinGo 30s\n` +
                `🎯 *Target:* ${TARGET_WINS} CONFIRMED WINS\n` +
                `💰 *Fund Management:* Maintain 5 to 7 Levels\n\n` +
                `⚡ _Signals starting now! Follow strictly._`;
    try {
        await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Error sending start poster:', e.message);
    }
}

async function sendClosePoster() {
    if (!CHANNEL_ID) return;
    const msg = `🎉 *SESSION FINISHED - 10 WINS COMPLETED!* 🎉\n\n` +
                `✅ *Total Wins:* ${sessionWins}/${TARGET_WINS} WINS\n` +
                `💰 *Book Heavy Profits! Session Closed.* 💰\n\n` +
                `Agla session Vipul Bhai ke order par start hoga! 🚀`;
    try {
        await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Error sending close poster:', e.message);
    }
}

// ==========================================
// 4. ON-DEMAND CONTROL (CHANNEL YA PRIVATE CHAT)
// ==========================================
function startSession(chatId) {
    isBotActive = true;
    sessionWins = 0;
    currentLevel = 1;
    pendingPrediction = null;
    lastProcessedIssue = null;
    sendStartPoster();
    bot.sendMessage(chatId, `✅ *Prediction Session Started! Target: ${TARGET_WINS} Wins.*`, { parse_mode: 'Markdown' });
}

function stopSession(chatId) {
    isBotActive = false;
    pendingPrediction = null;
    bot.sendMessage(chatId, `⏹ *Prediction Session Stopped Manually!*`, { parse_mode: 'Markdown' });
    if (CHANNEL_ID && chatId !== CHANNEL_ID) {
        bot.sendMessage(CHANNEL_ID, `⏹ *Session Stopped by Admin!*`, { parse_mode: 'Markdown' });
    }
}

// Channel se command capture
bot.on('channel_post', (msg) => {
    CHANNEL_ID = msg.chat.id;
    const text = (msg.text || '').trim();

    if (text === '/start') {
        startSession(msg.chat.id);
    } else if (text === '/stop') {
        stopSession(msg.chat.id);
    }
});

// Private message se command capture
bot.on('message', (msg) => {
    if (msg.chat.type === 'private') {
        const text = (msg.text || '').trim();
        if (text === '/start') {
            if (!CHANNEL_ID) {
                bot.sendMessage(msg.chat.id, `⚠️ Pehle apne Telegram Channel me koi bhi ek text bhejo taaki bot channel ko detect kar sake!`);
                return;
            }
            startSession(msg.chat.id);
        } else if (text === '/stop') {
            stopSession(msg.chat.id);
        }
    }
});

// ==========================================
// 5. DATA FETCHER
// ==========================================
async function fetchLatestData() {
    for (const url of API_ENDPOINTS) {
        try {
            const res = await axios.get(`${url}?pageNo=1&pageSize=10`, { timeout: 3500 });
            if (res.data && res.data.data && res.data.data.list && res.data.data.list.length > 0) {
                return res.data.data.list;
            }
        } catch (e) {}
    }
    return null;
}

// ==========================================
// 6. PREDICTION ENGINE (MANUAL TRIGGER BASED)
// ==========================================
async function runEngine() {
    if (busy || !isBotActive || !CHANNEL_ID) return;
    busy = true;

    try {
        // Target pura hote hi auto close
        if (sessionWins >= TARGET_WINS) {
            isBotActive = false;
            await sendClosePoster();
            busy = false;
            return;
        }

        const list = await fetchLatestData();
        if (!list || list.length === 0) {
            busy = false;
            return;
        }

        const latestResult = list[0];
        const latestIssue = latestResult.issueNumber;
        const latestNum = parseInt(latestResult.number);
        const actualResult = latestNum >= 5 ? 'BIG' : 'SMALL';

        // Result validation
        if (pendingPrediction && pendingPrediction.issue === latestIssue) {
            if (pendingPrediction.predicted === actualResult) {
                sessionWins++;
                const winMsg = `🎯 *RESULT:* ${actualResult} (${latestNum})\n` +
                               `✅ *WIN WIN WIN!* 🎉\n` +
                               `🏆 *Session Wins:* [${sessionWins}/${TARGET_WINS}]`;
                await bot.sendMessage(CHANNEL_ID, winMsg, { parse_mode: 'Markdown' });
                currentLevel = 1;
            } else {
                currentLevel++;
                const lossMsg = `🎯 *RESULT:* ${actualResult} (${latestNum})\n` +
                                `❌ *LOSS* ➡️ Go to *Level ${currentLevel}* (X3/X2)`;
                await bot.sendMessage(CHANNEL_ID, lossMsg, { parse_mode: 'Markdown' });
            }
            pendingPrediction = null;

            // Result ke turant baad 10 win verify
            if (sessionWins >= TARGET_WINS) {
                isBotActive = false;
                await sendClosePoster();
                busy = false;
                return;
            }
        }

        // Next prediction issue
        const nextIssue = (BigInt(latestIssue) + 1n).toString();
        if (lastProcessedIssue !== nextIssue && !pendingPrediction) {
            lastProcessedIssue = nextIssue;

            // Trend pattern follow
            const predictedValue = actualResult;
            pendingPrediction = {
                issue: nextIssue,
                predicted: predictedValue
            };

            const predMsg = `📊 *VIPUL BHAI 30S PREDICTION*\n` +
                            `━━━━━━━━━━━━━━━━━━━\n` +
                            `🎮 *Period:* \`${nextIssue.slice(-4)}\`\n` +
                            `🎯 *Prediction:* *${predictedValue}*\n` +
                            `📈 *Level:* ${currentLevel}\n` +
                            `🏆 *Target:* [${sessionWins}/${TARGET_WINS}] Wins\n` +
                            `━━━━━━━━━━━━━━━━━━━\n` +
                            `⏳ _Wait for result..._`;

            await bot.sendMessage(CHANNEL_ID, predMsg, { parse_mode: 'Markdown' });
        }

    } catch (err) {
        console.error('Engine error:', err.message);
    } finally {
        busy = false;
    }
}

// Har 3.5 second me status check
setInterval(runEngine, 3500);
console.log('🤖 Manual Control Bot Ready: Start on /start, Auto-Stop at 10 Wins!');
