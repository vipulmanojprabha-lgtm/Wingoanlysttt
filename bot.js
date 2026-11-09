const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// ==========================================
// 1. DUMMY SERVER (RENDER KO ALIVE RAKHNE KE LIYE)
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Vipul Prediction Bot is Running\n');
}).listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// ==========================================
// 2. CONFIGURATION & TIME SETTINGS
// ==========================================
const BOT_TOKEN = '9035645654:AAFHONNKHtSuehNE4rH7FbyIxtofx82vrLj4'; // Naya Token
let CHANNEL_ID = null; // Auto-detect hoga ya pehli post se set hoga
const GAME_MODE = '30sec';

// ⏰ AUTOMATIC DAILY SESSIONS (IST Time)
const SESSIONS = [
    { start: '10:15', end: '11:15' }, // Pehla session: Subah 10:15 AM
    { start: '13:15', end: '14:15' }  // Doosra session: Dopahar 1:15 PM
];

// 🎯 TARGET WINS PER SESSION (10 Win hote hi bot band ho jayega)
const TARGET_WINS = 10;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// WinGo 30s API Endpoints
const API_ENDPOINTS = [
    'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery03.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery04.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery05.com/WinGo/WinGo_30S/GetHistoryIssuePage.json'
];

// ==========================================
// 3. TIME CHECKER (IST TIMEZONE)
// ==========================================
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

// ==========================================
// 4. BOT STATE & VARIABLES
// ==========================================
let isBotActive = false;
let manualForceOn = false;
let sessionWins = 0;
let currentLevel = 1;
let pendingPrediction = null;
let lastProcessedIssue = null;
let sessionAnnounced = false;
let busy = false;

// ==========================================
// 5. CHANNEL DETECTION & COMMANDS
// ==========================================
bot.on('channel_post', async (msg) => {
    if (!CHANNEL_ID) {
        CHANNEL_ID = msg.chat.id;
        console.log(`Channel Detected Successfully: ${CHANNEL_ID}`);
        bot.sendMessage(CHANNEL_ID, `🚀 *VIPUL BHAI BOT CONNECTED!*\nAuto Prediction System Ready.`, { parse_mode: 'Markdown' });
    }

    const text = (msg.text || '').trim();
    if (text === '/start') {
        manualForceOn = true;
        isBotActive = true;
        sessionWins = 0;
        currentLevel = 1;
        bot.sendMessage(CHANNEL_ID, `▶️ *Session Started Manually!*\nTarget: ${TARGET_WINS} WINS🎯`, { parse_mode: 'Markdown' });
    } else if (text === '/stop') {
        manualForceOn = false;
        isBotActive = false;
        bot.sendMessage(CHANNEL_ID, `⏹ *Session Stopped Manually!*`, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/start/, (msg) => {
    if (msg.chat.type === 'private') {
        manualForceOn = true;
        isBotActive = true;
        sessionWins = 0;
        currentLevel = 1;
        bot.sendMessage(msg.chat.id, `▶️ *Bot Started Manually! Target: ${TARGET_WINS} Wins.*`, { parse_mode: 'Markdown' });
        if (CHANNEL_ID) {
            bot.sendMessage(CHANNEL_ID, `▶️ *Trading Session Started!*\nTarget: ${TARGET_WINS} Confirmed Wins🎯`, { parse_mode: 'Markdown' });
        }
    }
});

bot.onText(/\/stop/, (msg) => {
    if (msg.chat.type === 'private') {
        manualForceOn = false;
        isBotActive = false;
        bot.sendMessage(msg.chat.id, `⏹ *Bot Stopped!*`, { parse_mode: 'Markdown' });
        if (CHANNEL_ID) {
            bot.sendMessage(CHANNEL_ID, `⏹ *Trading Session Closed!*`, { parse_mode: 'Markdown' });
        }
    }
});

// ==========================================
// 6. POSTER FUNCTIONS (START & CLOSE)
// ==========================================
async function sendStartPoster() {
    if (!CHANNEL_ID) return;
    const msg = `🔥 *VIPUL BHAI OFFICIAL TRADING SESSION START* 🔥\n\n` +
                `🎮 *Game:* WinGo 30s\n` +
                `🎯 *Target Wins:* ${TARGET_WINS} WINS\n` +
                `💰 *Fund Management:* Maintain 5 to 7 Levels\n\n` +
                `⚠️ _Follow strictly for guaranteed profit!_`;
    try {
        await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Error sending start poster:', e.message);
    }
}

async function sendClosePoster() {
    if (!CHANNEL_ID) return;
    const msg = `🎉 *SESSION FINISHED - TARGET ACHIEVED!* 🎉\n\n` +
                `✅ *Total Wins:* ${sessionWins}/${TARGET_WINS} WINS\n` +
                `💰 *All Members Book Heavy Profits!* 💰\n\n` +
                `Next session scheduled time par start hoga. Enjoy your profit! 🚀`;
    try {
        await bot.sendMessage(CHANNEL_ID, msg, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Error sending close poster:', e.message);
    }
}

// ==========================================
// 7. API FETCH & DATA PROCESSING
// ==========================================
async function fetchLatestData() {
    for (const url of API_ENDPOINTS) {
        try {
            const res = await axios.get(`${url}?pageNo=1&pageSize=10`, { timeout: 3500 });
            if (res.data && res.data.data && res.data.data.list && res.data.data.list.length > 0) {
                return res.data.data.list;
            }
        } catch (e) {
            // endpoint fallback
        }
    }
    return null;
}

// ==========================================
// 8. CORE PREDICTION LOOP (RUNS EVERY 4 SECONDS)
// ==========================================
async function engineLoop() {
    if (busy) return;
    busy = true;

    try {
        const inSchedule = isScheduledTime();

        // Target pura ho gaya to session close karein
        if (sessionWins >= TARGET_WINS && isBotActive) {
            isBotActive = false;
            manualForceOn = false;
            await sendClosePoster();
            busy = false;
            return;
        }

        // Time check: Agar schedule time hai ya manually on kiya hai
        if (inSchedule || manualForceOn) {
            if (!isBotActive && sessionWins < TARGET_WINS) {
                isBotActive = true;
                if (!sessionAnnounced) {
                    await sendStartPoster();
                    sessionAnnounced = true;
                }
            }
        } else {
            // Schedule time khatam hone par reset
            if (isBotActive && !manualForceOn) {
                isBotActive = false;
                sessionAnnounced = false;
                sessionWins = 0;
            }
        }

        if (!isBotActive || !CHANNEL_ID) {
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

        // Result check for pending prediction
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

            // Agar 10 win poore ho gaye
            if (sessionWins >= TARGET_WINS) {
                isBotActive = false;
                manualForceOn = false;
                await sendClosePoster();
                busy = false;
                return;
            }
        }

        // Agle round ka prediction send karna
        const nextIssue = (BigInt(latestIssue) + 1n).toString();
        if (lastProcessedIssue !== nextIssue && !pendingPrediction) {
            lastProcessedIssue = nextIssue;

            // Pattern Logic: Trend follow
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

// 4 second ke interval par engine check karega
setInterval(engineLoop, 4000);
console.log('🤖 Prediction Bot Running with Auto-Stop at 10 Wins...');
