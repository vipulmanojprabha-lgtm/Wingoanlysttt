const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// ==========================================
// 1. DUMMY SERVER (RENDER ALIVE)
// ==========================================
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Vipul Spider Engine Bot Running\n');
}).listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// ==========================================
// 2. CONFIGURATION & MEDIA
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
let pendingPrediction = null;
let lastSettledIssue = null;
let isChecking = false;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const API_ENDPOINTS = [
    'https://draw.ar-lottery02.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery03.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery04.com/WinGo/WinGo_30S/GetHistoryIssuePage.json',
    'https://draw.ar-lottery05.com/WinGo/WinGo_30S/GetHistoryIssuePage.json'
];

// ================================================================
// 3. EXACT ROOT DIGIT ENGINE (COPIED DIRECTLY FROM HTML SOURCE)
// ================================================================
const REQUIRED_RESULTS = 5;
const REVERSE_LEVELS = [2, 3];

function isReverseLevel(level) {
    return REVERSE_LEVELS.includes(Number(level));
}

function flipSignal(sig) {
    if (sig === 'BIG' || sig === 'B') return 'SMALL';
    if (sig === 'SMALL' || sig === 'S') return 'BIG';
    return sig;
}

function computePredictionDetails(numbers) {
    if (!Array.isArray(numbers) || numbers.length < REQUIRED_RESULTS) return null;
    const five = numbers.slice(0, REQUIRED_RESULTS).map(Number);
    if (five.some(n => !Number.isFinite(n))) return null;

    const sum = five.reduce((a, b) => a + b, 0);
    const steps = [];
    let current = sum;

    while (current > 9) {
        const digits = String(current).split('').map(Number);
        const next = digits.reduce((a, b) => a + b, 0);
        steps.push({ digits, result: next, expression: digits.join(' + ') + ' = ' + next });
        current = next;
    }

    const rootDigit = current;
    const prediction = rootDigit >= 5 ? 'BIG' : 'SMALL';

    return { numbers: five, sum, steps, rootDigit, prediction };
}

// ==========================================
// 4. SAFE MEDIA SENDER (NO BOT CRASH)
// ==========================================
async function sendPhotoSafe(chatId, url, caption) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 3500 });
        await bot.sendPhoto(chatId, Buffer.from(res.data), { caption, parse_mode: 'Markdown' });
    } catch (e) {
        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
    }
}

async function sendGifSafe(chatId, url, caption) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 3500 });
        await bot.sendAnimation(chatId, Buffer.from(res.data), { caption, parse_mode: 'Markdown' });
    } catch (e) {
        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
    }
}

async function sendStartPoster() {
    if (!CHANNEL_ID) return;
    const caption = `🔥 *VIPUL BHAI OFFICIAL TRADING SESSION START* 🔥\n\n` +
                    `🎮 *Game:* WinGo 30s (Spider Panel Engine)\n` +
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
// 5. TELEGRAM COMMANDS
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
// 6. LIVE API DATA EXTRACTION
// ==========================================
async function fetchLatestData() {
    for (const url of API_ENDPOINTS) {
        try {
            const res = await axios.get(`${url}?pageNo=1&pageSize=10&_t=${Date.now()}`, { timeout: 2200 });
            if (res.data && res.data.data && res.data.data.list && res.data.data.list.length > 0) {
                return res.data.data.list;
            }
        } catch (e) {}
    }
    return null;
}

// ==========================================
// 7. PREDICTION ENGINE LOOP
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
        if (!list || list.length < REQUIRED_RESULTS) {
            isChecking = false;
            return;
        }

        const latestItem = list[0];
        const latestIssue = String(latestItem.issueNumber);
        const latestNum = parseInt(latestItem.number);
        const actualResult = latestNum >= 5 ? 'BIG' : 'SMALL';

        // --------------------------------------------------
        // STEP 1: SETTLE PENDING PREDICTION (WIN / LOSS)
        // --------------------------------------------------
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
                    currentLevel = 1; // Win par level 1 reset
                } else {
                    currentLevel++; // Loss par next level
                    const lossMsg = `🎯 *RESULT:* ${actualResult} (${latestNum})\n` +
                                    `❌ *LOSS* ➡️ Go to *Level ${currentLevel}* (X3/X2)`;
                    await bot.sendMessage(CHANNEL_ID, lossMsg, { parse_mode: 'Markdown' });
                }

                pendingPrediction = null; // Unblock state immediately

                if (sessionWins >= TARGET_WINS) {
                    isBotActive = false;
                    await sendClosePoster();
                    isChecking = false;
                    return;
                }
            } else if (Date.now() - pendingPrediction.createdAt > 34000) {
                // Agar API result aane me delay ho to freeze na ho
                pendingPrediction = null;
            }
        }

        // --------------------------------------------------
        // STEP 2: GENERATE NEXT PREDICTION WITH EXACT HTML LOGIC
        // --------------------------------------------------
        if (!pendingPrediction) {
            const nextIssue = (BigInt(latestIssue) + 1n).toString();
            const historyFive = list.slice(0, REQUIRED_RESULTS).map(item => Number(item.number));
            const details = computePredictionDetails(historyFive);

            if (details) {
                let rawSig = details.prediction; // BIG or SMALL
                let finalSig = rawSig;
                let revActive = false;

                // Level 2 aur Level 3 par base prediction flip hota hai
                if (isReverseLevel(currentLevel)) {
                    finalSig = flipSignal(rawSig);
                    revActive = true;
                }

                pendingPrediction = {
                    issue: nextIssue,
                    predicted: finalSig,
                    createdAt: Date.now()
                };

                const calcInfo = `[${details.numbers.join('+')}=${details.sum} ➜ Root: ${details.rootDigit}]`;
                const revTag = revActive ? ` 🔄 *(L${currentLevel} REV)*` : '';

                const predMsg = `📊 *VIPUL BHAI 30S PREDICTION*\n` +
                                `━━━━━━━━━━━━━━━━━━━\n` +
                                `🎮 *Period:* \`${nextIssue.slice(-4)}\`\n` +
                                `🎯 *Prediction:* *${finalSig}*${revTag}\n` +
                                `📈 *Level:* ${currentLevel}\n` +
                                `🧮 *Calc:* \`${calcInfo}\`\n` +
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

// 2 सेकंड का नियमित चेक (WinGo 30s के अनुसार)
setInterval(runSpiderEngine, 2000);
console.log('🤖 Vipul Spider Engine Bot Live & Synchronized!');
