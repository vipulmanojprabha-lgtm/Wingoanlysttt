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
// 2. CONFIGURATION & MEDIA LINKS
// ==========================================
const BOT_TOKEN = '9035645654:AAFHoRNKHSuehNE4rH7FbyIx1ofx82vrLj4';
const TARGET_WINS = 10; // 10 Wins hote hi bot auto-stop hoga

// 🖼️ वर्किंग इमेज और विनिंग GIF लिंक्स
const START_IMAGE_URL = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80';
const CLOSE_IMAGE_URL = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1200&q=80';
const WIN_GIF_URL = 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif'; // Celebration Winning GIF

let CHANNEL_ID = null;
let isBotActive = false;
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
// 3. EXACT ROOT DIGIT ENGINE (FROM HTML FILE)
// ==========================================
const REQUIRED_RESULTS = 5;
const REVERSE_LEVELS = [2, 3]; // Level 2 aur 3 par reverse karega

function isReverseLevel(level) {
    return REVERSE_LEVELS.includes(Number(level));
}

function flipSignal(sig) {
    if (sig === 'BIG') return 'SMALL';
    if (sig === 'SMALL') return 'BIG';
    return sig;
}

function computePredictionDetails(numbers) {
    if (!Array.isArray(numbers) || numbers.length < REQUIRED_RESULTS) return null;
    const five = numbers.slice(0, REQUIRED_RESULTS).map(Number);
    if (five.some(n => !Number.isFinite(n))) return null;

    const sum = five.reduce((a, b) => a + b, 0);
    let current = sum;

    while (current > 9) {
        const digits = String(current).split('').map(Number);
        current = digits.reduce((a, b) => a + b, 0);
    }

    const rootDigit = current;
    const rawPrediction = rootDigit >= 5 ? 'BIG' : 'SMALL';
    return { numbers: five, sum, rootDigit, rawPrediction };
}

// ==========================================
// 4. POSTERS WITH PHOTO (START & CLOSE)
// ==========================================
async function sendStartPoster() {
    if (!CHANNEL_ID) return;
    const caption = `🔥 *VIPUL BHAI OFFICIAL TRADING SESSION START* 🔥\n\n` +
                    `🎮 *Game:* WinGo 30s (Spider Engine)\n` +
                    `🎯 *Target:* ${TARGET_WINS} CONFIRMED WINS\n` +
                    `💰 *Fund Management:* Maintain 5 to 7 Levels\n\n` +
                    `⚡ _Signals starting now! Follow strictly._`;
    try {
        await bot.sendPhoto(CHANNEL_ID, START_IMAGE_URL, { caption: caption, parse_mode: 'Markdown' });
    } catch (e) {
        await bot.sendMessage(CHANNEL_ID, caption, { parse_mode: 'Markdown' });
    }
}

async function sendClosePoster() {
    if (!CHANNEL_ID) return;
    const caption = `🎉 *SESSION FINISHED - TARGET ACHIEVED!* 🎉\n\n` +
                    `✅ *Total Wins:* ${sessionWins}/${TARGET_WINS} WINS\n` +
                    `💰 *All Members Book Heavy Profits!* 💰\n\n` +
                    `Agla session Vipul Bhai ke order par start hoga! 🚀`;
    try {
        await bot.sendPhoto(CHANNEL_ID, CLOSE_IMAGE_URL, { caption: caption, parse_mode: 'Markdown' });
    } catch (e) {
        await bot.sendMessage(CHANNEL_ID, caption, { parse_mode: 'Markdown' });
    }
}

// ==========================================
// 5. ON-DEMAND SESSION CONTROLS
// ==========================================
async function startSession(chatId) {
    isBotActive = true;
    sessionWins = 0;
    currentLevel = 1;
    pendingPrediction = null;
    lastProcessedIssue = null;
    await sendStartPoster();
}

async function stopSession(chatId) {
    isBotActive = false;
    pendingPrediction = null;
    if (CHANNEL_ID) {
        await bot.sendMessage(CHANNEL_ID, `⏹ *Session Stopped by Admin!*`, { parse_mode: 'Markdown' });
    }
}

// Channel Commands (/start ya /stop)
bot.on('channel_post', async (msg) => {
    CHANNEL_ID = msg.chat.id;
    const text = (msg.text || '').trim();

    if (text === '/start') {
        await startSession(msg.chat.id);
    } else if (text === '/stop') {
        await stopSession(msg.chat.id);
    }
});

// Private Bot DM Commands
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
            bot.sendMessage(msg.chat.id, `⏹ Bot Band kar diya gaya hai!`);
        }
    }
});

// ==========================================
// 6. API FETCH
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
// 7. PREDICTION ENGINE LOOP (WITH WIN GIF)
// ==========================================
async function runEngine() {
    if (busy || !isBotActive || !CHANNEL_ID) return;
    busy = true;

    try {
        if (sessionWins >= TARGET_WINS) {
            isBotActive = false;
            await sendClosePoster();
            busy = false;
            return;
        }

        const list = await fetchLatestData();
        if (!list || list.length < REQUIRED_RESULTS) {
            busy = false;
            return;
        }

        const latestResult = list[0];
        const latestIssue = latestResult.issueNumber;
        const latestNum = parseInt(latestResult.number);
        const actualResult = latestNum >= 5 ? 'BIG' : 'SMALL';

        // 1. Check Result for Pending Prediction
        if (pendingPrediction && pendingPrediction.issue === latestIssue) {
            if (pendingPrediction.predicted === actualResult) {
                sessionWins++;
                const winCaption = `🎯 *RESULT:* ${actualResult} (${latestNum})\n` +
                                   `✅ *WIN WIN WIN!* 🎉\n` +
                                   `🏆 *Session Wins:* [${sessionWins}/${TARGET_WINS}]`;
                
                // 🎬 WIN HONE PAR GIF POST HOGA
                try {
                    await bot.sendAnimation(CHANNEL_ID, WIN_GIF_URL, { caption: winCaption, parse_mode: 'Markdown' });
                } catch (gifErr) {
                    await bot.sendMessage(CHANNEL_ID, winCaption, { parse_mode: 'Markdown' });
                }

                currentLevel = 1; // Reset to level 1 on win
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
                busy = false;
                return;
            }
        }

        // 2. Generate Prediction for Next Period
        const nextIssue = (BigInt(latestIssue) + 1n).toString();
        if (lastProcessedIssue !== nextIssue && !pendingPrediction) {
            lastProcessedIssue = nextIssue;

            // HTML File Logic: Aakhri 5 numbers ka sum & root digit
            const historyFive = list.slice(0, REQUIRED_RESULTS).map(item => Number(item.number));
            const details = computePredictionDetails(historyFive);

            if (details) {
                let finalPrediction = details.rawPrediction;
                let isReversed = false;

                // Level 2 & 3 Reverse logic
                if (isReverseLevel(currentLevel)) {
                    finalPrediction = flipSignal(finalPrediction);
                    isReversed = true;
                }

                pendingPrediction = {
                    issue: nextIssue,
                    predicted: finalPrediction
                };

                const calcInfo = `[${details.numbers.join('+')}=${details.sum} ➜ Root: ${details.rootDigit}]`;
                const revTag = isReversed ? ` 🔄 *(L${currentLevel} REV)*` : '';

                const predMsg = `📊 *VIPUL BHAI 30S PREDICTION*\n` +
                                `━━━━━━━━━━━━━━━━━━━\n` +
                                `🎮 *Period:* \`${nextIssue.slice(-4)}\`\n` +
                                `🎯 *Prediction:* *${finalPrediction}*${revTag}\n` +
                                `📈 *Level:* ${currentLevel}\n` +
                                `🧮 *Calc:* \`${calcInfo}\`\n` +
                                `🏆 *Target:* [${sessionWins}/${TARGET_WINS}] Wins\n` +
                                `━━━━━━━━━━━━━━━━━━━\n` +
                                `⏳ _Wait for result..._`;

                await bot.sendMessage(CHANNEL_ID, predMsg, { parse_mode: 'Markdown' });
            }
        }

    } catch (err) {
        console.error('Engine error:', err.message);
    } finally {
        busy = false;
    }
}

setInterval(runEngine, 3500);
console.log('🤖 Root-Digit Logic Bot with GIFs & Photos Ready!');
