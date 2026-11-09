const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// ==========================================
// 1. DUMMY SERVER (RENDER ALIVE)
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Vipul Prediction Bot is Running\n');
}).listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// ==========================================
// 2. CONFIGURATION & DIRECT MEDIA
// ==========================================
const BOT_TOKEN = '9035645654:AAFHoRNKHSuehNE4rH7FbyIx1ofx82vrLj4';
const TARGET_WINS = 10;

const START_IMAGE = 'https://i.ibb.co/Xx2DpkWx/image.jpg';
const CLOSE_IMAGE = 'https://i.ibb.co/ksT1Ky5h/image.jpg';
const WIN_GIF = 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif';

let CHANNEL_ID = null;
let isBotActive = false;
let sessionWins = 0;
let currentLevel = 1;

let currentPrediction = null; 
let lastSettledIssue = null;  
let isChecking = false;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const API_ENDPOINTS = [
    'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery03.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery04.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery05.com/WinGo/WinGo_30S/GetHistoryIssuePage.json'
];

// ==========================================
// 3. EXACT ROOT DIGIT ENGINE (FROM HTML)
// ==========================================
const REQUIRED_RESULTS = 5;
const REVERSE_LEVELS = [2, 3];

function isReverseLevel(level) {
    return REVERSE_LEVELS.includes(Number(level));
}

function flipSignal(sig) {
    return sig === 'BIG' ? 'SMALL' : 'BIG';
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
// 4. SAFE SENDER (NEVER FREEZE)
// ==========================================
async function sendPhotoSafe(chatId, url, caption) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 3000 });
        await bot.sendPhoto(chatId, Buffer.from(res.data), { caption, parse_mode: 'Markdown' });
    } catch (e) {
        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
    }
}

async function sendGifSafe(chatId, url, caption) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 3000 });
        await bot.sendAnimation(chatId, Buffer.from(res.data), { caption, parse_mode: 'Markdown' });
    } catch (e) {
        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
    }
}

async function sendStartPoster() {
    if (!CHANNEL_ID) return;
    const caption = `🔥 *VIPUL BHAI OFFICIAL TRADING SESSION START* 🔥\n\n` +
                    `🎮 *Game:* WinGo 30s (Spider Engine)\n` +
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
// 5. COMMANDS
// ==========================================
async function startSession(chatId) {
    isBotActive = true;
    sessionWins = 0;
    currentLevel = 1;
    currentPrediction = null;
    lastSettledIssue = null;
    await sendStartPoster();
}

async function stopSession(chatId) {
    isBotActive = false;
    currentPrediction = null;
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
// 6. DATA API FETCH
// ==========================================
async function fetchLatestData() {
    for (const url of API_ENDPOINTS) {
        try {
            const res = await axios.get(`${url}?pageNo=1&pageSize=10&_t=${Date.now()}`, { timeout: 2000 });
            if (res.data && res.data.data && res.data.data.list && res.data.data.list.length > 0) {
                return res.data.data.list;
            }
        } catch (e) {}
    }
    return null;
}

// ==========================================
// 7. PREDICTION ENGINE (NON-STOP CONTINUOUS)
// ==========================================
async function processRound() {
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
        if (!list || list.length < REQUIRED_RESULTS) {
            isChecking = false;
            return;
        }

        const latestItem = list[0];
        const latestIssue = String(latestItem.issueNumber);
        const latestNum = parseInt(latestItem.number);
        const actualResult = latestNum >= 5 ? 'BIG' : 'SMALL';

        // 1. RESULT CHECK (जब तक नया रिजल्ट API पर नहीं दिखेगा, इंतज़ार करेगा)
        if (currentPrediction) {
            const predIssue = BigInt(currentPrediction.issue);
            const liveIssue = BigInt(latestIssue);

            if (liveIssue >= predIssue && lastSettledIssue !== latestIssue) {
                lastSettledIssue = latestIssue;

                if (currentPrediction.predicted === actualResult) {
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

                currentPrediction = null; // फ्री हो गया अगले प्रेडिक्शन के लिए

                if (sessionWins >= TARGET_WINS) {
                    isBotActive = false;
                    await sendClosePoster();
                    isChecking = false;
                    return;
                }
            } else if (Date.now() - currentPrediction.createdTime > 34000) {
                // Hard reset if API delays
                currentPrediction = null;
            }
        }

        // 2. NEXT PREDICTION GENERATION (तुरंत अगला प्रेडिक्शन बनाएगा)
        if (!currentPrediction) {
            const nextIssue = (BigInt(latestIssue) + 1n).toString();
            const historyFive = list.slice(0, REQUIRED_RESULTS).map(item => Number(item.number));
            const details = computePredictionDetails(historyFive);

            if (details) {
                let finalPrediction = details.rawPrediction;
                let isReversed = false;

                if (isReverseLevel(currentLevel)) {
                    finalPrediction = flipSignal(finalPrediction);
                    isReversed = true;
                }

                currentPrediction = {
                    issue: nextIssue,
                    predicted: finalPrediction,
                    createdTime: Date.now()
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
        console.error('Bot Loop Error:', err.message);
    } finally {
        isChecking = false;
    }
}

// 2 सेकंड का नियमित चेक
setInterval(processRound, 2000);
console.log('🤖 Vipul Prediction Bot: Production-Ready Engine Active!');
            
