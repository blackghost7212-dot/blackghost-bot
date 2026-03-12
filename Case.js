
const fs = require('fs');
const fg = require('api-dylux');
const axios = require('axios');
const yts = require("yt-search");
const { igdl } = require("btch-downloader");
const util = require('util');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const path = require('path');
const chalk = require('chalk');
const { writeFile } = require('./library/utils');

// =============== COLORS ===============
const colors = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    white: "\x1b[37m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    magenta: "\x1b[35m",
    bgGreen: "\x1b[42m",
};

// =============== HELPERS ===============
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

function stylishReply(text) {
    return `\`\`\`\n${text}\n\`\`\``;
}

function checkFFmpeg() {
    return new Promise((resolve) => {
        exec("ffmpeg -version", (err) => resolve(!err));
    });
}

// ======= Dummy jidDecode for safety =======
function jidDecode(jid) {
    const [user, server] = jid.split(':');
    return { user, server };
}

// =============== MAIN FUNCTION ===============
module.exports = async function handleCommand(nato, m, command, isGroup, isAdmin, groupAdmins,isBotAdmins,groupMeta,config) {

    // ======= Safe JID decoding =======
    nato.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server ? `${decode.user}@${decode.server}` : jid;
        } else return jid;
    };
    const from = nato.decodeJid(m.key.remoteJid);
    const sender = m.key.participant || m.key.remoteJid;
    const participant = nato.decodeJid(m.key.participant || from);
    const pushname = m.pushName || "Unknown User";
    const chatType = from.endsWith('@g.us') ? 'Group' : 'Private';
    const chatName = chatType === 'Group' ? (groupMeta?.subject || 'Unknown Group') : pushname;
// Safe owner check
const botNumber = nato.user.id.split(":")[0] + "@s.whatsapp.net";
const senderJid = m.key.participant || m.key.remoteJid;
const isOwner = senderJid === botNumber;
    const reply = (text) => nato.sendMessage(from, { text: stylishReply(text) }, { quoted: m });

    const ctx = m.message.extendedTextMessage?.contextInfo || {};
    const quoted = ctx.quotedMessage;
    const quotedSender = nato.decodeJid(ctx.participant || from);
    const mentioned = ctx.mentionedJid?.map(nato.decodeJid) || [];

    const body = m.message.conversation || m.message.extendedTextMessage?.text || '';
    const args = body.trim().split(/ +/).slice(1);
    const text = args.join(" ");

    const time = new Date().toLocaleTimeString();
    

console.log(
  chalk.bgHex('#8B4513').white.bold(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 INCOMING MESSAGE (${time})
👤 From: ${pushname} (${participant})
💬 Chat Type: ${chatType} - ${chatName}
🏷️ Command: ${command || "—"}
💭 Message: ${body || "—"}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
);


// --- 🚨 ANTILINK 2.0 AUTO CHECK ---
if (isGroup && global.antilink && global.antilink[from]?.enabled) {
    const linkPattern = /(https?:\/\/[^\s]+)/gi;
    const bodyText = body || '';

    if (linkPattern.test(bodyText)) {
        const settings = global.antilink[from];
        const groupMeta = await nato.groupMetadata(from);
        const groupAdmins = groupMeta.participants.filter(p => p.admin).map(p => p.id);
        const botNumber = nato.user.id.split(":")[0] + "@s.whatsapp.net";
        const isBotAdmin = groupAdmins.includes(botNumber);
        const isSenderAdmin = groupAdmins.includes(sender);

        if (!isSenderAdmin && isBotAdmin) {
            try {
                await nato.sendMessage(from, { delete: m.key });
                await nato.sendMessage(from, {
                    text: `🚫 *Link detected and removed!*\nUser: @${sender.split('@')[0]}\nAction: ${settings.mode.toUpperCase()}`,
                    mentions: [sender],
                });

                if (settings.mode === "kick") {
                    await nato.groupParticipantsUpdate(from, [sender], "remove");
                }
            } catch (err) {
                console.error("Antilink Enforcement Error:", err);
            }
        }
    }
}

// --- 🚫 ANTI-TAG AUTO CHECK ---
if (isGroup && global.antitag && global.antitag[from]?.enabled) {
    const settings = global.antitag[from];
    const groupMeta = await nato.groupMetadata(from);
    const groupAdmins = groupMeta.participants.filter(p => p.admin).map(p => p.id);
    const botNumber = nato.user.id.split(":")[0] + "@s.whatsapp.net";
    const isBotAdmin = groupAdmins.includes(botNumber);
    const isSenderAdmin = groupAdmins.includes(m.sender);

    // Detect if message contains a mention
    const mentionedUsers = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

    if (mentionedUsers.length > 0) {
        if (!isSenderAdmin && isBotAdmin) {
            try {
                // 🧹 Delete message
                await nato.sendMessage(from, { delete: m.key });

                // ⚠️ Notify group
                await nato.sendMessage(from, {
                    text: `🚫 *Yooh Tagging others is not allowed!*\nUser:Action: ${settings.mode.toUpperCase()}`,
                    mentions: [m.sender],
                });

                // 🚷 If mode is "kick"
                if (settings.mode === "kick") {
                    await nato.groupParticipantsUpdate(from, [m.sender], "remove");
                }
            } catch (err) {
                console.error("Anti-Tag Enforcement Error:", err);
            }
        }
    }
}

// 🚫 AntiBadWord with Strike System
if (isGroup && global.antibadword?.[from]?.enabled) {
  const badwords = global.antibadword[from].words || [];
  const textMsg = (m.body || "").toLowerCase();
  const found = badwords.find(w => textMsg.includes(w));

  if (found) {
    const botNumber = nato.user.id.split(":")[0] + "@s.whatsapp.net";
    const groupMetadata = await nato.groupMetadata(from);
    const groupAdmins = groupMetadata.participants.filter(p => p.admin).map(p => p.id);
    const isBotAdmin = groupAdmins.includes(botNumber);
    const isSenderAdmin = groupAdmins.includes(m.sender);

    if (!isSenderAdmin) {
      if (isBotAdmin) {
        await nato.sendMessage(from, { delete: m.key });
      }

      global.antibadword[from].warnings[m.sender] =
        (global.antibadword[from].warnings[m.sender] || 0) + 1;

      const warns = global.antibadword[from].warnings[m.sender];
      const remaining = 3 - warns;

      if (warns < 3) {
        await nato.sendMessage(from, {
          text: `⚠️ @${m.sender.split('@')[0]}, bad word detected!\nWord: *${found}*\nWarning: *${warns}/3*\n${remaining} more and you'll be kicked!`,
          mentions: [m.sender],
        });
      } else {
        if (isBotAdmin) {
          await nato.sendMessage(from, {
            text: `🚫 @${m.sender.split('@')[0]} has been kicked for repeated bad words.`,
            mentions: [m.sender],
          });
          await nato.groupParticipantsUpdate(from, [m.sender], "remove");
          delete global.antibadword[from].warnings[m.sender];
        } else {
          await nato.sendMessage(from, {
            text: `🚨 @${m.sender.split('@')[0]} reached 3 warnings, but I need admin rights to kick!`,
            mentions: [m.sender],
          });
        }
      }
    }
  }
}

if (!nato.isPublic && !isOwner) {
    return; // ignore all messages from non-owner when in private mode
}
    try {
        switch (command) {
            // ================= PING =================
case 'ping':
case 'alive': {
    const start = Date.now();

    // Message avant le calcul de latency, stylisé
    await reply(`
✵═───── ☬ INVOCATION DU BOT / SUMMONING BOT ☬ ─────═✵
🦇💀 Les ombres s'éveillent... / The shadows are awakening...
⏳ Préparation du ping / Preparing the ping...
✦༺🦇༻✦༺💀༻✦༺⚡༻✦༺☠༻✦
`);

    const end = Date.now();
    const latency = end - start;

    // Message final, stylisé
    await reply(`
✵═───── ☬ STATUS DU BOT / 𝐒𝐓𝐀𝐓𝐔𝐒 𝐃𝐔 𝐁𝐎𝐓 ☬ ─────═✵

⏱️ Latence / Latency : ${latency}ms
⏳ Temps actif / Uptime : ${formatUptime(process.uptime())}
👑 Créateur / Creator : 𝐌𝐑 𝐃𝐑𝐀𝐂𝐔𝐋𝐀

☠️ Français : Tape *Menu* pour découvrir toutes les commandes maléfiques
💀 English : Enter *Menu* to reveal all dark commands

✦༺🦇༻✦༺💀༻✦༺⚡༻✦༺☠༻✦
⛧༄═══ 𝐃𝐑𝐀𝐂𝐔𝐋𝐀 𝐁𝐎𝐓 ═══༄⛧
`);
}
                break;
            

            // ================= MENU =================
            case 'menu':
case 'help': {
    await nato.sendMessage(m.chat, { react: { text: `🦇`, key: m.key } });

    const menuText = `
╔═══════ ❖ 🌑 ❖ ═══════╗
        𝐁𝐋𝐀𝐂𝐊 𝐆𝐇𝐎𝐒𝐓 𝐁𝐎𝐓
╚═══════ ❖ 🌑 ❖ ═══════╝

╭─❖ 𝐁𝐎𝐓 𝐈𝐍𝐅𝐎 ❖─╮
│ 👑 Owner : Black Ghost
│ ⚙️ Version : 1.0.0
│ 🤖 Type : WhatsApp MD Bot
│ ⚡ Prefix : .
╰───────────────╯

╔════〔 ⚙️ 𝐒𝐘𝐒𝐓𝐄𝐌 〕════╗
┃ ⛧ .ping
┃ ⛧ .public
┃ ⛧ .private
┃ ⛧ .alive
┃ ⛧ .owner
╚═════════════════╝

╔════〔 📊 𝐀𝐍𝐀𝐋𝐘𝐒𝐈𝐒 〕════╗
┃ ✦ .weather
┃ ✦ .checktime
┃ ✦ .gitclone
┃ ✦ .save
╚══════════════════╝

╔════〔 📥 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐑 〕════╗
┃ ⬇️ .tiktok
┃ ⬇️ .play
┃ ⬇️ .video
┃ ⬇️ .fb
┃ ⬇️ .igdl
┃ ⬇️ .playdoc
╚════════════════════╝

╔════〔 🛡 𝐆𝐑𝐎𝐔𝐏 〕════╗
┃ 👮 .add
┃ 👮 .kick
┃ 👮 .promote
┃ 👮 .demote
┃ 👮 .tagall
┃ 👮 .hidetag
┃ 👮 .antilink
┃ 👮 .antitag
┃ 👮 .antibadword
┃ 🔇 .mute
┃ 🔊 .unmute
┃ 📝 .setdesc
┃ 🚪 .leave
╚══════════════════╝

╔════〔 🔄 𝐂𝐎𝐍𝐕𝐄𝐑𝐓𝐄𝐑 〕════╗
┃ 🎵 .toaudio
┃ 🖼 .toimage
╚════════════════════╝

╔════〔 🌸 𝐖𝐀𝐈𝐅𝐔 〕════╗
┃ 💗 .waifu
╚══════════════════╝

╔════〔 💻 𝐃𝐄𝐕 〕════╗
┃ 🧠 .repo
┃ 🧠 .script
┃ 🧠 .github
╚══════════════════╝

╔══════ ❖ 🦇 ❖ ══════╗
      𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘
        𝐁𝐋𝐀𝐂𝐊 𝐆𝐇𝐎𝐒𝐓
╚══════ ❖ 🌑 ❖ ══════╝
`;
const buttons = [

{

buttonId: ".ping",

buttonText: { displayText: "⚡ Ping" },

type: 1

},

{

buttonId: ".owner",

buttonText: { displayText: "👑 Owner" },

type: 1

},

{

buttonId: ".repo",

buttonText: { displayText: "💻 Repo" },

type: 1

}

]

const buttonMessage = {

image: { url: "https://files.catbox.moe/bm4nt5.jpg" },

caption: menuText,

footer: "blackghost",

buttons: buttons,

headerType: 4,

contextInfo: {

forwardingScore: 99999,

isForwarded: true,

forwardedNewsletterMessageInfo: {

newsletterJid: "1@newsletter",

serverMessageId: 1,

newsletterName: "UPDATE"

}

}

}

await nato.sendMessage(m.chat, buttonMessage, { quoted: m })

await nato.sendMessage(m.chat, {

audio: { url: "https://files.catbox.moe/14w29j.mpeg" },

mimetype: "audio/mpeg"

}, { quoted: m })

}

break;



            // ================= WEATHER =================
            case 'weather': {
                try {
                    if (!text) return reply("🌍 Please provide a city or town name!");
                    const response = await fetch(`http://api.openweathermap.org/data/2.5/weather?q=${text}&units=metric&appid=1ad47ec6172f19dfaf89eb3307f74785`);
                    const data = await response.json();
                    if (data.cod !== 200) return reply("❌ Unable to find that location. Please check the spelling.");

                    const weatherText = `
┏━━━━━━━━━━━━━━━━━━━━━━┓
┃   🌦 WEATHER REPORT  ┃
┣━━━━━━━━━━━━━━━━━━━━━━┫
┃ 📍 City : ${data.name}
┃ 🌡 Temp : ${data.main.temp}°C
┃ 🤒 Feels : ${data.main.feels_like}°C
┃ 🌧 Rain : ${data.rain?.['1h'] || 0} mm
┃ ☁ Clouds : ${data.clouds.all}%
┃ 💧 Humidity : ${data.main.humidity}%
┃ 🌪 Wind : ${data.wind.speed} m/s
┃ 📝 Weather : ${data.weather[0].description}
┃ 🌅 Sunrise : ${new Date(data.sys.sunrise*1000).toLocaleTimeString()}
┃ 🌄 Sunset : ${new Date(data.sys.sunset*1000).toLocaleTimeString()}
┗━━━━━━━━━━━━━━━━━━━━━━┛
🤖 BlackGhost Bot
`;
                    await reply(weatherText);
                } catch (e) {
                    console.error("Weather command error:", e);
                    reply("❌ Unable to retrieve weather information.");
                }
                break;
            }

            // ================= CHECKTIME =================case 'checktime':
case 'time': {
    try {
        if (!text) return reply("🌍 Please provide a city or country name to check the local time.");

        await reply(`⏳ Checking local time for *${text}*...`);

        const tzRes = await fetch(`https://worldtimeapi.org/api/timezone`);
        const timezones = await tzRes.json();

        const match = timezones.find(tz => tz.toLowerCase().includes(text.toLowerCase()));
        if (!match) return reply(`❌ Could not find timezone for *${text}*.`);

        const res = await fetch(`https://worldtimeapi.org/api/timezone/${match}`);
        const data = await res.json();

        const datetime = new Date(data.datetime);
        const hours = datetime.getHours();

        const greeting = hours < 12 ? "🌅 Good Morning"
          : hours < 18 ? "🌞 Good Afternoon"
          : "🌙 Good Evening";

        const timeText = `
┏━━━━━━━━━━━━━━━━━━━━━━┓
┃      🕒 LOCAL TIME   ┃
┣━━━━━━━━━━━━━━━━━━━━━━┫
┃ 📍 Location : ${text}
┃ 👋 ${greeting}
┃ 🌍 Timezone : ${data.timezone}
┃ ⏰ Time : ${datetime.toLocaleTimeString()}
┃ 📅 Date : ${datetime.toDateString()}
┃ ⚡ Uptime : ${formatUptime(process.uptime())}
┗━━━━━━━━━━━━━━━━━━━━━━┛
🤖 BlackGhost Bot
`;

        await reply(timeText);

    } catch (e) {
        console.error("checktime error:", e);
        reply("❌ Unable to fetch time for that city.");
    }
}
break;
            // ================= GITCLONE =================
            case 'gitclone': {
                try {
                    if (!args[0]) return reply("❌ Provide a GitHub repo link.");
                    if (!args[0].includes('github.com')) return reply("❌ Not a valid GitHub link!");
                    const regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;
                    let [, user, repo] = args[0].match(regex) || [];
                    repo = repo.replace(/.git$/, '');
                    const zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;
                    const head = await fetch(zipUrl, { method: 'HEAD' });
                    const contentDisp = head.headers.get('content-disposition');
                    const filenameMatch = contentDisp?.match(/attachment; filename=(.*)/);
                    const filename = filenameMatch ? filenameMatch[1] : `${repo}.zip`;
                    await trashcore.sendMessage(from, { document: { url: zipUrl }, fileName: filename, mimetype: 'application/zip' }, { quoted: m });
                    await reply(`✅ Successfully fetched repository: *${user}/${repo}*`);
                } catch (err) {
                    console.error("gitclone error:", err);
                    await reply("❌ Failed to clone repository.");
                }
                break;
            }


            // ================= SAVE STATUS =================
            case 'save': {
                try {
                    if (!quoted) return reply("❌ Reply to a status message!");
                    const mediaBuffer = await trashcore.downloadMediaMessage(quoted);
                    if (!mediaBuffer) return reply("🚫 Could not download media. It may have expired.");
                    let payload;
                    if (quoted.imageMessage) payload = { image: mediaBuffer, caption: quoted.imageMessage.caption || "📸 Saved status image", mimetype: "image/jpeg" };
                    else if (quoted.videoMessage) payload = { video: mediaBuffer, caption: quoted.videoMessage.caption || "🎥 Saved status video", mimetype: "video/mp4" };
                    else return reply("❌ Only image/video statuses are supported!");
                    await nato.sendMessage(m.sender, payload, { quoted: m });
                    await reply("✅ Status saved!");
                } catch (err) {
                    console.error("Save error:", err);
                    reply("❌ Failed to save status.");
                }
                break;
            }

            // ================= IG/FB DL =================
            case 'fb':
case 'facebook':
case 'fbdl':
case 'ig':
case 'instagram':
case 'igdl': {
    if (!args[0]) return reply(stylishReply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐈𝐍𝐏𝐔𝐓 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🔗 Please provide a Facebook or Instagram link!  
┃ 📝 Example: ${command} <link>  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ black ghost LINK CHECK ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`));

    try {
        const axios = require('axios');
        const cheerio = require('cheerio');

        await nato.sendMessage(from, { text: stylishReply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🦇 𝐌𝐄𝐃𝐈𝐀  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ⏳ Fetching media... Please wait!
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`)}, { quoted: m });

        async function fetchMedia(url) {
            try {
                const form = new URLSearchParams();
                form.append("q", url);
                form.append("vt", "home");

                const { data } = await axios.post('https://yt5s.io/api/ajaxSearch', form, {
                    headers: {
                        "Accept": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                });

                if (data.status !== "ok") throw new Error("Provide a valid link.");
                const $ = cheerio.load(data.data);

                if (/^(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch)\/.+/i.test(url)) {
                    const thumb = $('img').attr("src");
                    let links = [];
                    $('table tbody tr').each((_, el) => {
                        const quality = $(el).find('.video-quality').text().trim();
                        const link = $(el).find('a.download-link-fb').attr("href");
                        if (quality && link) links.push({ quality, link });
                    });
                    if (links.length > 0) return { platform: "Facebook", type: "video", thumb, media: links[0].link };
                    if (thumb) return { platform: "Facebook", type: "image", media: thumb };
                    throw new Error("Media is invalid.");
                } else if (/^(https?:\/\/)?(www\.)?(instagram\.com\/(p|reel)\/).+/i.test(url)) {
                    const video = $('a[title="Download Video"]').attr("href");
                    const image = $('img').attr("src");
                    if (video) return { platform: "Instagram", type: "video", media: video };
                    if (image) return { platform: "Instagram", type: "image", media: image };
                    throw new Error("Media invalid.");
                } else {
                    throw new Error("Provide a valid URL or link.");
                }
            } catch (err) {
                return { error: err.message };
            }
        }

        const res = await fetchMedia(args[0]);

        if (res.error) {
            await nato.sendMessage(from, { react: { text: "❌", key: m.key } });
            return reply(stylishReply(`
⛧═━━━━━━━━━━━━═⛧
┃  💀 𝐄𝐑𝐑𝐎𝐑  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ⚠️ ${res.error}
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧═━━━━━━━━━━━━═⛧
`));
        }

        await nato.sendMessage(from, { text: stylishReply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🦇 𝐌𝐄𝐃𝐈𝐀  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ⏳ Media found! Downloading now...
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`)}, { quoted: m });

        if (res.type === "video") {
            await nato.sendMessage(from, { video: { url: res.media }, caption: stylishReply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  ✅ 𝐕𝐈𝐃𝐄𝐎  ┃
┃━━━━━━━━━━━━━━━━┃
┃ Downloaded video from ${res.platform}!
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`)}, { quoted: m });
        } else if (res.type === "image") {
            await nato.sendMessage(from, { image: { url: res.media }, caption: stylishReply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  ✅ 𝐏𝐇𝐎𝐓𝐎  ┃
┃━━━━━━━━━━━━━━━━┃
┃ Downloaded photo from ${res.platform}!
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`)}, { quoted: m });
        }

        await nato.sendMessage(from, { text: stylishReply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🩸 𝐃𝐎𝐍𝐄  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ✅ All media sent!
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghsot TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`)}, { quoted: m });

    } catch (error) {
        console.error(error);
        await nato.sendMessage(from, { react: { text: "❌", key: m.key } });
        return reply(stylishReply(`
⛧═━━━━━━━━━━━━═⛧
┃  💀 𝐄𝐑𝐑𝐎𝐑  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ Failed to get media.
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧═━━━━━━━━━━━━═⛧
`));
    }
    break;
}
                
            // ================= TIKTOK =================
            case 'tiktok': {
    try {
        if (!args[0]) return reply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🦇 𝐓𝐈𝐊𝐓𝐎𝐊  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ⚠️ Provide a TikTok link.
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghsot TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`);

        await reply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🦇 𝐅𝐄𝐓𝐂𝐇𝐈𝐍𝐆  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ⏳ Summoning TikTok data...
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`);

        const data = await fg.tiktok(args[0]);
        const json = data.result;

        let caption = `
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🩸 𝐓𝐈𝐊𝐓𝐎𝐊 𝐃𝐀𝐓𝐀  ┃
┃━━━━━━━━━━━━━━━━┃
◈ Id: ${json.id}
◈ User: ${json.author.nickname}
◈ Title: ${json.title}
◈ Likes: ${json.digg_count}
◈ Comments: ${json.comment_count}
◈ Shares: ${json.share_count}
◈ Plays: ${json.play_count}
◈ Created: ${json.create_time}
◈ Size: ${json.size}
◈ Duration: ${json.duration}s
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`;

        if (json.images && json.images.length > 0) {
            for (const imgUrl of json.images) {
                await nato.sendMessage(from, {
                    image: { url: imgUrl },
                    caption
                }, { quoted: m });
            }
        } else {
            await nato.sendMessage(from, {
                video: { url: json.play },
                mimetype: 'video/mp4',
                caption
            }, { quoted: m });

            if (json.music) {
                await nato.sendMessage(from, {
                    audio: { url: json.music },
                    mimetype: 'audio/mpeg'
                }, { quoted: m });
            }
        }

    } catch (err) {
        console.error("TikTok command error:", err);
        return reply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  💀 𝐄𝐑𝐑𝐎𝐑  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ Failed to fetch TikTok data.
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`);
    }
    break;
}

case 'video': {
    try {
        if (!text) return reply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🎥 𝐕𝐈𝐃𝐄𝐎  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ What video do you want?
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`);

        await reply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🦇 𝐒𝐄𝐀𝐑𝐂𝐇𝐈𝐍𝐆  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ⏳ Hunting YouTube video...
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`);

        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';

        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) 
                return reply("❌ No videos found!");
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumbnail = videos[0].thumbnail;
        }

        const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
        const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);

        if (thumb) {
            await nato.sendMessage(from, {
                image: { url: thumb },
                caption: `
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🎬 𝐓𝐈𝐓𝐋𝐄  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ${videoTitle || text}
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`
            }, { quoted: m });
        }

        const izumi = { baseURL: "https://izumiiiiiiii.dpdns.org" };
        const res = await axios.get(`${izumi.baseURL}/downloader/youtube?url=${encodeURIComponent(videoUrl)}&format=720`);

        if (!res?.data?.result?.download) 
            return reply("❌ Failed to fetch video.");

        await nato.sendMessage(from, {
            video: { url: res.data.result.download },
            mimetype: 'video/mp4',
            caption: `
⛧━❖━━━━━━━━━━━━❖━⛧
┃  🩸 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃  ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎥 ${res.data.result.title || videoTitle}
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`
        }, { quoted: m });

    } catch (error) {
        console.error('[VIDEO] Command Error:', error);
        reply(`
⛧━❖━━━━━━━━━━━━❖━⛧
┃  💀 𝐄𝐑𝐑𝐎𝐑  ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ Download failed.
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🩸༻ ghost TECH ༺🩸༻ ✦
⛧━❖━━━━━━━━━━━━❖━⛧
`);
    }
    break;
}
            // ================= PLAY =================
            case 'play': {
    try {
        const tempDir = path.join(__dirname, "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        if (!args.length) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐏𝐋𝐀𝐘 𝐌𝐔𝐒𝐈𝐂 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎵 Provide a song name!  
┃ 📝 Example: ${command} Not Like Us  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        const query = args.join(" ");
        if (query.length > 100) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐈𝐍𝐏𝐔𝐓 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 📝 Song name too long! Max 100 chars.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        await reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐒𝐄𝐀𝐑𝐂𝐇𝐈𝐍𝐆 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎧 Searching for the track... ⏳  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        const searchResult = await (await yts(`${query} official`)).videos[0];
        if (!searchResult) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐍𝐎 𝐑𝐄𝐒𝐔𝐋𝐓 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 😕 Couldn't find that song. Try another one!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        const video = searchResult;
        const apiUrl = `https://api.privatezia.biz.id/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`;
        const response = await axios.get(apiUrl);
        const apiData = response.data;

        if (!apiData.status || !apiData.result || !apiData.result.downloadUrl)
            throw new Error("API failed to fetch track!");

        const timestamp = Date.now();
        const fileName = `audio_${timestamp}.mp3`;
        const filePath = path.join(tempDir, fileName);

        // Download MP3
        const audioResponse = await axios({ method: "get", url: apiData.result.downloadUrl, responseType: "stream", timeout: 600000 });
        const writer = fs.createWriteStream(filePath);
        audioResponse.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on("finish", resolve); writer.on("error", reject); });

        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0)
            throw new Error("Download failed or empty file!");

        await nato.sendMessage(
            from,
            { text: `
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎶 ${apiData.result.title || video.title} 🎧  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
` },
            { quoted: m }
        );

        await nato.sendMessage(
            from,
            { audio: { url: filePath }, mimetype: "audio/mpeg", fileName: `${(apiData.result.title || video.title).substring(0, 100)}.mp3` },
            { quoted: m }
        );

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    } catch (error) {
        console.error("Play command error:", error);
        return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 💥 ${error.message}  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
    }
    break;
}
// ================= TO AUDIO  =================
case 'toaudio': {
    try {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const ffmpeg = require('fluent-ffmpeg');
        const fs = require('fs');
        const { writeFileSync, unlinkSync } = fs;
        const { tmpdir } = require('os');
        const path = require('path');

        // ✅ Pick source message
        const quoted = m.quoted ? m.quoted : m;
        const msg = quoted.msg || quoted.message?.videoMessage || quoted.message?.audioMessage;

        if (!msg) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐓𝐎 𝐀𝐔𝐃𝐈𝐎 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎧 Reply to a *video* or *audio* to convert it to audio!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        // ✅ Get MIME type
        const mime = msg.mimetype || quoted.mimetype || '';
        if (!/video|audio/.test(mime)) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐓𝐎 𝐀𝐔𝐃𝐈𝐎 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ⚠️ Only works on *video* or *audio* messages!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        await reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐂𝐎𝐍𝐕𝐄𝐑𝐓𝐈𝐍𝐆 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎶 Converting media to audio... ⏳  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        // ✅ Download media
        const messageType = mime.split("/")[0];
        const stream = await downloadContentFromMessage(msg, messageType);

        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        // ✅ Temporary paths
        const inputPath = path.join(tmpdir(), `input_${Date.now()}.mp4`);
        const outputPath = path.join(tmpdir(), `output_${Date.now()}.mp3`);
        writeFileSync(inputPath, buffer);

        // ✅ Convert using ffmpeg
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('mp3')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });

        // ✅ Send converted audio
        const audioBuffer = fs.readFileSync(outputPath);
        await nato.sendMessage(from, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });

        // ✅ Cleanup
        unlinkSync(inputPath);
        unlinkSync(outputPath);

        return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐂𝐎𝐍𝐕𝐄𝐑𝐓𝐄𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ✅ Media successfully converted to audio!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━═⛧
`);

    } catch (err) {
        console.error("❌ toaudio error:", err);
        return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 💥 Failed to convert media to audio.  
┃ ⚠️ Ensure it's a valid video/audio file.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
    }
    break;
}
// ================= TO VOICE NOTE  =================

// ================= TO IMAGE =================
case 'toimage': {
    try {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const fs = require('fs');
        const path = require('path');
        const { tmpdir } = require('os');
        const sharp = require('sharp');

        // ✅ Determine source message
        const quoted = m.quoted ? m.quoted : m;
        const msg = quoted.msg || quoted.message?.stickerMessage;
        if (!msg || !msg.mimetype?.includes('webp')) {
            return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐓𝐎 𝐈𝐌𝐀𝐆𝐄 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ⚠️ Reply to a *sticker* to convert it to an image!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
        }

        await reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐂𝐎𝐍𝐕𝐄𝐑𝐓𝐈𝐍𝐆 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🖼️ Converting sticker to image... ⏳  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        // ✅ Download sticker
        const stream = await downloadContentFromMessage(msg, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        // ✅ Convert WebP to PNG using sharp
        const outputPath = path.join(tmpdir(), `sticker_${Date.now()}.png`);
        await sharp(buffer).png().toFile(outputPath);

        // ✅ Send converted image
        const imageBuffer = fs.readFileSync(outputPath);
        await nato.sendMessage(from, { image: imageBuffer }, { quoted: m });

        // ✅ Cleanup
        fs.unlinkSync(outputPath);

        return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐂𝐎𝐍𝐕𝐄𝐑𝐓𝐄𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ✅ Sticker successfully converted to image!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

    } catch (err) {
        console.error("❌ toimage error:", err);
        return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 💥 Failed to convert sticker to image.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
    }
    break;
}
// ================= PRIVATE / SELF COMMAND =================

// ================= PRIVATE / SELF COMMAND =================
case 'private':
case 'self': {
    if (!isOwner) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐎𝐖𝐍𝐄𝐑 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ This command is for owner-only.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
    
    nato.isPublic = false;
    return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐏𝐑𝐈𝐕𝐀𝐓𝐄 𝐌𝐎𝐃𝐄 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ✅ Bot switched to *private mode*.  
┃ 👤 Only the owner can use commands now.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
}

// ================= PUBLIC COMMAND =================
case 'public': {
    if (!isOwner) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐎𝐖𝐍𝐄𝐑 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ This command is for owner-only.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

    nato.isPublic = true;
    return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐏𝐔𝐁𝐋𝐈𝐂 𝐌𝐎𝐃𝐄 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🌍 Bot switched to *public mode*.  
┃ ✅ Everyone can use commands now.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
}
// Play-Doc  command
case 'playdoc': {
    try {
        const tempDir = path.join(__dirname, "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        if (!args.length) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐏𝐋𝐀𝐘 𝐃𝐎𝐂 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎵 Please provide a song name!  
┃ 📝 Example: ${command} Not Like Us  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        const query = args.join(" ");
        if (query.length > 100) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐈𝐍𝐏𝐔𝐓 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 📝 Song name too long!  
┃ ⚠️ Max 100 characters allowed.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        await reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐒𝐄𝐀𝐑𝐂𝐇𝐈𝐍𝐆 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎧 Searching for the track... ⏳  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        const searchResult = await (await yts(`${query} official`)).videos[0];
        if (!searchResult) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐍𝐎 𝐑𝐄𝐒𝐔𝐋𝐓 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 😕 Couldn't find that song.  
┃ 🔎 Try another title.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

        const video = searchResult;
        const apiUrl = `https://api.privatezia.biz.id/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`;
        const response = await axios.get(apiUrl);
        const apiData = response.data;

        if (!apiData.status || !apiData.result || !apiData.result.downloadUrl)
            throw new Error("API failed to fetch track!");

        const timestamp = Date.now();
        const fileName = `audio_${timestamp}.mp3`;
        const filePath = path.join(tempDir, fileName);

        const audioResponse = await axios({
            method: "get",
            url: apiData.result.downloadUrl,
            responseType: "stream",
            timeout: 600000
        });

        const writer = fs.createWriteStream(filePath);
        audioResponse.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0)
            throw new Error("Download failed or empty file!");

        await nato.sendMessage(
            from,
            {
                text: `
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐓𝐑𝐀𝐂𝐊 𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃𝐄𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🎶 *${apiData.result.title || video.title}*  
┃ 📥 Sending as document...  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`
            },
            { quoted: m }
        );

        await nato.sendMessage(
            from,
            {
                document: { url: filePath },
                mimetype: "audio/mpeg",
                fileName: `${(apiData.result.title || video.title).substring(0, 100)}.mp3`
            },
            { quoted: m }
        );

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    } catch (error) {
        console.error("Play command error:", error);
        return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 💥 ${error.message}  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost MUSIC ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
    }
    break;
}

case 'antilink': {
    try {
        if (!isGroup) return reply("❌ This command only works in groups!");
        if (!isOwner) return reply("⚠️ Only admins or the owner can use this command!");
    if (!isBotAdmins) return reply("🚫 I need admin privileges to remove members!");

        global.antilink = global.antilink || {};
        const chatId = from;

        if (!global.antilink[chatId]) {
            global.antilink[chatId] = { enabled: false, mode: "delete" }; 
        }

        const option = args[0]?.toLowerCase();

        if (option === "on") {
            global.antilink[chatId].enabled = true;
            return reply(`✅ *Antilink enabled!*\nMode: ${global.antilink[chatId].mode.toUpperCase()}`);
        }

        if (option === "off") {
            global.antilink[chatId].enabled = false;
            return reply("❎ Antilink disabled!");
        }

        if (option === "mode") {
            const modeType = args[1]?.toLowerCase();
            if (!modeType || !["delete", "kick"].includes(modeType))
                return reply("⚙️ Usage: `.antilink mode delete` or `.antilink mode kick`");

            global.antilink[chatId].mode = modeType;
            return reply(`🔧 Antilink mode set to *${modeType.toUpperCase()}*!`);
        }

        // If no argument is given
        return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐀𝐍𝐓𝐈 𝐋𝐈𝐍𝐊 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 📢 *Antilink Settings*  
┃ • Status: ${global.antilink[chatId].enabled ? "✅ ON" : "❎ OFF"}  
┃ • Mode: ${global.antilink[chatId].mode.toUpperCase()}  
┃━━━━━━━━━━━━━━━━┃
┃ 🧩 Usage:  
┃ - .antilink on  
┃ - .antilink off  
┃ - .antilink mode delete  
┃ - .antilink mode kick  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
    } catch (err) {
        console.error("Antilink command error:", err);
        reply("💥 Error while updating antilink settings.");
    }
    break;
}

// ================= ANTI TAG=================
case 'antitag': {
    try {
        if (!isGroup) return reply("❌ This command only works in groups!");
        if (!isOwner) return reply("⚠️ Only admins or the owner can use this command!");
        if (!isBotAdmins) return reply("🚫 I need admin privileges to manage group settings!");

        global.antitag = global.antitag || {};
        const chatId = from;

        // Initialize if not existing
        if (!global.antitag[chatId]) {
            global.antitag[chatId] = { enabled: false, mode: "delete" };
        }

        const option = args[0]?.toLowerCase();

        if (option === "on") {
            global.antitag[chatId].enabled = true;
            return reply(`✅ *AntiTag enabled!*\nMode: ${global.antitag[chatId].mode.toUpperCase()}`);
        }

        if (option === "off") {
            global.antitag[chatId].enabled = false;
            return reply("❎ AntiTag disabled!");
        }

        if (option === "mode") {
            const modeType = args[1]?.toLowerCase();
            if (!modeType || !["delete", "kick"].includes(modeType))
                return reply("⚙️ Usage: `.antitag mode delete` or `.antitag mode kick`");

            global.antitag[chatId].mode = modeType;
            return reply(`🔧 AntiTag mode set to *${modeType.toUpperCase()}*!`);
        }

        // If no argument is given
        return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐀𝐍𝐓𝐈 𝐓𝐀𝐆 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 📢 *AntiTag Settings*  
┃ • Status: ${global.antitag[chatId].enabled ? "✅ ON" : "❎ OFF"}  
┃ • Mode: ${global.antitag[chatId].mode.toUpperCase()}  
┃━━━━━━━━━━━━━━━━┃
┃ 🧩 Usage:  
┃ - .antitag on  
┃ - .antitag off  
┃ - .antitag mode delete  
┃ - .antitag mode kick  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
    } catch (err) {
        console.error("AntiTag command error:", err);
        reply("💥 Error while updating AntiTag settings.");
    }
    break;
}

case 'antidemote': {
    try {
        if (!isGroup) return reply("❌ This command only works in groups!");
        if (!isOwner) return reply("⚠️ Only admins or the owner can use this command!");
        if (!isBotAdmins) return reply("🚫 I need admin privileges to manage group settings!");

        global.antidemote = global.antidemote || {};
        const chatId = from;

        if (!global.antidemote[chatId]) {
            global.antidemote[chatId] = { enabled: false, mode: "revert" };
        }

        const option = args[0]?.toLowerCase();

        if (option === "on") {
            global.antidemote[chatId].enabled = true;
            return reply(`✅ *AntiDemote enabled!*\nMode: ${global.antidemote[chatId].mode.toUpperCase()}`);
        }

        if (option === "off") {
            global.antidemote[chatId].enabled = false;
            return reply("❎ AntiDemote disabled!");
        }

        if (option === "mode") {
            const modeType = args[1]?.toLowerCase();
            if (!modeType || !["revert", "kick"].includes(modeType))
                return reply("⚙️ Usage: `.antidemote mode revert` or `.antidemote mode kick`");

            global.antidemote[chatId].mode = modeType;
            return reply(`🔧 AntiDemote mode set to *${modeType.toUpperCase()}*!`);
        }

        // Display settings if no args
        
return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐀𝐍𝐓𝐈 𝐃𝐄𝐌𝐎𝐓𝐄 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 📢 *AntiDemote Settings*  
┃ • Status: ${global.antidemote[chatId].enabled ? "✅ ON" : "❎ OFF"}  
┃ • Mode: ${global.antidemote[chatId].mode.toUpperCase()}  
┃━━━━━━━━━━━━━━━━┃
┃ 🧩 Usage:  
┃ - .antidemote on  
┃ - .antidemote off  
┃ - .antidemote mode revert  
┃ - .antidemote mode kick  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
    } catch (err) {
        console.error("AntiDemote command error:", err);
        reply("💥 Error while updating AntiDemote settings.");
    }
    break;
}

case 'antipromote': {
    try {
        if (!isGroup) return reply("❌ This command only works in groups!");
        if (!isOwner) return reply("⚠️ Only admins or the owner can use this command!");
        if (!isBotAdmins) return reply("🚫 I need admin privileges to manage group settings!");

        global.antipromote = global.antipromote || {};
        const chatId = from;

        if (!global.antipromote[chatId]) {
            global.antipromote[chatId] = { enabled: false, mode: "revert" }; 
        }

        const option = args[0]?.toLowerCase();

        if (option === "on") {
            global.antipromote[chatId].enabled = true;
            return reply(`✅ *AntiPromote enabled!*\nMode: ${global.antipromote[chatId].mode.toUpperCase()}`);
        }

        if (option === "off") {
            global.antipromote[chatId].enabled = false;
            return reply("❎ AntiPromote disabled!");
        }

        if (option === "mode") {
            const modeType = args[1]?.toLowerCase();
            if (!modeType || !["revert", "kick"].includes(modeType))
                return reply("⚙️ Usage: `.antipromote mode revert` or `.antipromote mode kick`");

            global.antipromote[chatId].mode = modeType;
            return reply(`🔧 AntiPromote mode set to *${modeType.toUpperCase()}*!`);
        }

        // Display settings if no args
        
            
    return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐀𝐍𝐓𝐈 𝐏𝐑𝐎𝐌𝐎𝐓𝐄 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 📢 *AntiPromote Settings*  
┃ • Status: ${global.antipromote[chatId].enabled ? "✅ ON" : "❎ OFF"}  
┃ • Mode: ${global.antipromote[chatId].mode.toUpperCase()}  
┃━━━━━━━━━━━━━━━━┃
┃ 🧩 Usage:  
┃ - .antipromote on  
┃ - .antipromote off  
┃ - .antipromote mode revert  
┃ - .antipromote mode kick  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
    `);
} catch (err) {
    console.error("AntiPromote command error:", err);
    return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 💥 Error while updating AntiPromote settings.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
    `);
}
    break;
}

case 'antibadword': {
  try {
    if (!isGroup) return reply("❌ This command only works in groups!");
    if (!isOwner) return reply("⚠️ Only admins or the owner can use this command!");

    global.antibadword = global.antibadword || {};
    const chatId = from;

    if (!global.antibadword[chatId]) {
      global.antibadword[chatId] = {
        enabled: false,
        words: [],
        warnings: {} // { userJid: count }
      };
    }

    const option = args[0]?.toLowerCase();

    // Enable AntiBadWord
    if (option === "on") {
      global.antibadword[chatId].enabled = true;
      return reply("✅ *AntiBadWord enabled!* Bad words will now be deleted and warned.");
    }

    // Disable AntiBadWord
    if (option === "off") {
      global.antibadword[chatId].enabled = false;
      return reply("❎ AntiBadWord disabled!");
    }

    // Add bad word
    if (option === "add") {
      const word = args.slice(1).join(" ").toLowerCase();
      if (!word) return reply("⚙️ Usage: `.antibadword add <word>`");
      if (global.antibadword[chatId].words.includes(word))
        return reply("⚠️ That word is already in the list.");

      global.antibadword[chatId].words.push(word);
      return reply(`✅ Added bad word: *${word}*`);
    }

    // Remove bad word
    if (option === "remove") {
      const word = args.slice(1).join(" ").toLowerCase();
      if (!word) return reply("⚙️ Usage: `.antibadword remove <word>`");
      const index = global.antibadword[chatId].words.indexOf(word);
      if (index === -1) return reply("❌ That word is not in the list.");
      global.antibadword[chatId].words.splice(index, 1);
      return reply(`🗑️ Removed bad word: *${word}*`);
    }

    // List bad words
    if (option === "list") {
      const words = global.antibadword[chatId].words;
      return reply(
        `📜 *AntiBadWord List*\n` +
        `Status: ${global.antibadword[chatId].enabled ? "✅ ON" : "❎ OFF"}\n\n` +
        (words.length ? words.map((w, i) => `${i + 1}. ${w}`).join('\n') : "_No words added yet_")
      );
    }

    // Reset warnings
    if (option === "reset") {
      global.antibadword[chatId].warnings = {};
      return reply("🧹 All user warnings have been reset!");
    }

    // Default info
    return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐀𝐍𝐓𝐈 𝐁𝐀𝐃 𝐖𝐎𝐑𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🧩 *AntiBadWord Settings*  
┃ • Status: ${global.antibadword[chatId].enabled ? "✅ ON" : "❎ OFF"}  
┃ • Words: ${global.antibadword[chatId].words.length}  
┃━━━━━━━━━━━━━━━━┃
┃ 🧰 Usage:  
┃ - .antibadword on/off  
┃ - .antibadword add <word>  
┃ - .antibadword remove <word>  
┃ - .antibadword list  
┃ - .antibadword reset  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
    `);
} catch (err) {
    console.error("AntiBadWord command error:", err);
    return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐄𝐑𝐑𝐎𝐑 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 💥 Error while updating AntiBadWord settings.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
    `);
}
break;
}
case 'add': {
    if (!isGroup) return reply("this command is only for groups");
    if (!isAdmin && !isBotAdmins && !isOwner) return reply("action restricted for admin and owner only");

    if (!text && !m.quoted) {
        return reply(`Example:\n\n${command} 50956xxxxxxx`);
    }

    const numbersOnly = text
        ? text.replace(/\D/g, '') + '@s.whatsapp.net'
        : m.quoted?.sender;

    try {
        const res = await nato.groupParticipantsUpdate(from, [numbersOnly], 'add');

        for (let i of res) {
            const invv = await nato.groupInviteCode(from);

            if (i.status == 408) return reply(`❌ User is already in the group.`);
            if (i.status == 401) return reply(`🚫 Bot is blocked by the user.`);
            if (i.status == 409) return reply(`⚠️ User recently left the group.`);
            if (i.status == 500) return reply(`❌ Invalid request. Try again later.`);

            if (i.status == 403) {

                await nato.sendMessage(from, {
                    text: `@${numbersOnly.split('@')[0]} cannot be added because their account is private.\nAn invite link will be sent to their private chat.`,
                    mentions: [numbersOnly],
                }, { quoted: m });

                const inviteText = `
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐆𝐑𝐎𝐔𝐏 𝐈𝐍𝐕𝐈𝐓𝐄 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ 🌐 Invite Link:  
┃ https://chat.whatsapp.com/${invv}  
┃━━━━━━━━━━━━━━━━┃
┃ 👑 Admin: wa.me/${m.sender.split('@')[0]}  
┃ 📩 You have been invited to join this group!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`;

                await nato.sendMessage(numbersOnly, {
                    text: inviteText,
                    detectLink: true
                }, { quoted: m }).catch(() => reply('❌ Failed to send invitation! 😔'));

            } else {
                reply(mess.success);
            }
        }

    } catch (e) {
        console.error(e);
        reply('❌ Error while adding user');
    }
}
break;
// --- HIDETAG COMMAND ---
case 'hidetag': {
    if (!isGroup) return reply('❌ This command can only be used in groups!');
    if (!args || args.length === 0) return reply('❌ Please provide a message to hidetag!');

    try {
        const groupMeta = await nato.groupMetadata(from);
        const participants = groupMeta.participants.map(p => p.id);

        const text = args.join(' ');
        await nato.sendMessage(from, { text, mentions: participants });
    } catch (err) {
        console.error('[HIDETAG ERROR]', err);
        reply('❌ Failed to hidetag, please try again.');
    }
    break;
}

case 'tagall':
case 'everyone':
    if (!isGroup) {
        return await nato.sendMessage(from, { text: '❌ This command can only be used in groups!' });
    }

    const groupMeta = await nato.groupMetadata(from);
    const participants = groupMeta.participants.map(p => p.id);

    let messageText = `👥 Tagging everyone in the group by Mr Dracula !\n\n`;
    participants.forEach((p, i) => {
        messageText += `• @${p.split('@')[0]}\n`;
    });

    await nato.sendMessage(from, {
        text: messageText,
        mentions: participants
    });
break;


case 'kick':
case 'remove': {
    if (!isGroup) return reply("❌ This command can only be used in groups!");
    if (!isAdmin && !isOwner) return reply("⚠️ Only admins or the owner can use this command!");
    if (!isBotAdmins) return reply("🚫 I need admin privileges to remove members!");

    // 🧩 Identify target user
    let target;
    if (m.mentionedJid?.[0]) {
        target = m.mentionedJid[0];
    } else if (m.quoted?.sender) {
        target = m.quoted.sender;
    } else if (args[0]) {
        const number = args[0].replace(/[^0-9]/g, '');
        if (!number) return reply(`⚠️ Example:\n${command} 50956461555`);
        target = `${number}@s.whatsapp.net`;
    } else {
        return reply(`⚠️ Example:\n${command} 50956461555`);
    }

    // 🛡️ Protect owner & bot
    const botNumber = nato.user?.id || '';
    const ownerNumber = (config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    const ownerJid = ownerNumber ? `${ownerNumber}@s.whatsapp.net` : '';

    if (target === botNumber) return reply("😅 I can’t remove myself!");
    if (target === ownerJid) return reply("🚫 You can’t remove my owner!");

    try {
        // Add a timeout wrapper
        const result = await Promise.race([
            nato.groupParticipantsUpdate(from, [target], 'remove'),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)) // 10s timeout
        ]);

        if (result && !result[0]?.status) {
            await reply(`✅ Successfully removed @${target.split('@')[0]}`, { mentions: [target] });
        } else {
            reply("⚠️ Couldn’t remove this user. Maybe they’re the group creator.");
        }

    } catch (err) {
        if (err.message === 'timeout') {
            reply("⏱️ WhatsApp took too long to respond. Try again in a few seconds.");
        } else {
            console.error("Kick Error:", err);
            reply("❌ Failed to remove member. Possibly due to permission issues or socket lag.");
        }
    }

    break;
}

case 'promote': {
    try {
        if (!m.isGroup) return m.reply("❌ This command only works in groups!");

        const groupMetadata = await nato.groupMetadata(m.chat);
        const participants = groupMetadata.participants;

        // Extract all admins (numbers only for reliability)
        const groupAdmins = participants
            .filter(p => p.admin !== null)
            .map(p => p.id.replace(/[^0-9]/g, ''));

        const senderNumber = m.sender.replace(/[^0-9]/g, '');
        const botNumber = nato.user.id.replace(/[^0-9]/g, '');

        const isSenderAdmin = groupAdmins.includes(senderNumber);
            if (!isAdmin && !isOwner) return reply("⚠️ Only admins or the owner can use this command!");
    if (!isBotAdmins) return reply("🚫 I need admin privileges to remove members!");

        // Get target user (from mention or quoted)
        let target;
        if (m.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
            target = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (m.quoted && m.quoted.key.participant) {
            target = m.quoted.key.participant;
        } else {
            return reply("👤 Mention or reply to the user you want to promote.");
        }

        const targetNumber = target.replace(/[^0-9]/g, '');
        if (groupAdmins.includes(targetNumber))
            return reply("👑 That user is already an admin!");

        await nato.groupParticipantsUpdate(m.chat, [target], "promote");

        const userName = participants.find(p => p.id === target)?.notify || target.split('@')[0];
        await nato.sendMessage(m.chat, {
            text: `🎉 *${userName}* has been promoted to admin! 👑`
        }, { quoted: m });

    } catch (error) {
        console.error("Promote command error:", error);
        return reply(`💥 Error: ${error.message}`);
    }
    break;
}



case 'demote': {
    try {
        if (!m.isGroup) return reply("❌ This command only works in groups!");

        const groupMetadata = await nato.groupMetadata(m.chat);
        const participants = groupMetadata.participants;

        // Extract admin JIDs (keep full IDs)
        const groupAdmins = participants
            .filter(p => p.admin)
            .map(p => p.id);

        const senderJid = m.sender;
        const botJid = nato.user.id;

        const isSenderAdmin = groupAdmins.includes(senderJid);
        const isBotAdmin = groupAdmins.includes(botJid);

        if (!isAdmin && !isOwner) return reply("⚠️ Only admins or the owner can use this command!");
    if (!isBotAdmins) return reply("🚫 I need admin privileges to remove members!");

        // Get target (mention or reply)
        let target;
        if (m.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
            target = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
        } else if (m.quoted && m.quoted.sender) {
            target = m.quoted.sender;
        } else {
            return reply("👤 Mention or reply to the user you want to demote.");
        }

        if (!groupAdmins.includes(target))
            return reply("👤 That user is not an admin.");

        await nato.groupParticipantsUpdate(m.chat, [target], "demote");

        const userName = participants.find(p => p.id === target)?.notify || target.split('@')[0];
        await nato.sendMessage(m.chat, {
            text: `😔 *${userName}* has been demoted from admin.`
        }, { quoted: m });

    } catch (error) {
        console.error("Demote command error:", error);
        return reply(`💥 Error: ${error.message}`);
    }
    break;
}

case 'desc': case 'setdesc': { 
                 if (!m.isGroup) return reply (mess.group)
                 if (!isAdmin) return reply ("bot must be admin in this group")
                 if (!text) throw 'Provide the text for the group description' 
                 await nato.groupUpdateDescription(m.chat, text); 
 m.reply('Group description successfully updated! 🥶'); 
             } 
 break; 
 
 

case 'nwaifu': {

    const apiUrl = `https://reaperxxxx-anime.hf.space/api/waifu?category=waifu&sfw=true`;
    const response = await axios.get(apiUrl);
    const data = await response.data;
    const imageUrl = data.image_url
    
    await nato.sendMessage(m.chat, {
        image: { url: imageUrl },
        caption: "Your waifu Dracula"
      }, { quoted: m }); // Add quoted option for context
      }
      break
    case 'ramdomwaifu': {
    
    const imageUrl = `https://apis.davidcyriltech.my.id/random/waifu`;
    await nato.sendMessage(m.chat, {
        image: { url: imageUrl },
        caption: "Your Random Waifu by Mr Dracula"
      }, { quoted: m }); // Add quoted option for context
      }
      break;
      case 'waifu' :

waifudd = await axios.get(`https://waifu.pics/api/nsfw/waifu`) 
nato.sendMessage(from, {image: {url:waifudd.data.url},caption:`Your waifu`}, { quoted:m }).catch(err => {
 return('Error!')
})
break;      




case 'mute': {
    if (!m.isGroup) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐆𝐑𝐎𝐔𝐏 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ This command can only be used in a group!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

    if (!isAdmin) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐀𝐃𝐌𝐈𝐍 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ Only group admins can use this command!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

    if (!isBotAdmins) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐁𝐎𝐓 𝐏𝐄𝐑𝐌𝐈𝐒𝐒𝐈𝐎𝐍 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ I need to be admin to do this!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

    await nato.groupSettingUpdate(m.chat, 'announcement');

    return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐆𝐑𝐎𝐔𝐏 𝐌𝐔𝐓𝐄𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ✅ The group has been muted! Only admins can send messages now.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
}
break;


case 'unmute': {
    if (!m.isGroup) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐆𝐑𝐎𝐔𝐏 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ This command can only be used in a group!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

    if (!isAdmin) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐀𝐃𝐌𝐈𝐍 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ Only group admins can use this command!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

    if (!isBotAdmins) return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐁𝐎𝐓 𝐏𝐄𝐑𝐌𝐈𝐒𝐒𝐈𝐎𝐍 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ❌ I need to be admin to do this!  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);

    await nato.groupSettingUpdate(m.chat, 'not_announcement');

    return reply(`
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐆𝐑𝐎𝐔𝐏 𝐔𝐍𝐌𝐔𝐓𝐄𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ✅ The group has been unmuted! Everyone can send messages.  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost BOT ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`);
}
break;

case 'left': {
  if (!isOwner) return reply("For Owner only");
  await nato.groupLeave(m.chat);
  reply("Thank you everyone for the time. I fucking everyone");
}
break;


case 'creategc':
case 'creategroup': {
  if (!isOwner) return reply("For Owner only.");

  const groupName = args.join(" ");
  if (!groupName) return reply(`Use *${prefix + command} groupname*`);

  try {
    const cret = await nato.groupCreate(groupName, []);
    const code = await nato.groupInviteCode(cret.id);
    const link = `https://chat.whatsapp.com/${code}`;

    const teks = `
⛧═━━━━━━━━━━━━═⛧
┃ ✵ 𝐆𝐑𝐎𝐔𝐏 𝐂𝐑𝐄𝐀𝐓𝐄𝐃 ✵ ┃
┃━━━━━━━━━━━━━━━━┃
┃ ▸ *Name:* ${cret.subject}  
┃ ▸ *Group ID:* ${cret.id}  
┃ ▸ *Owner:* @${cret.owner.split("@")[0]}  
┃ ▸ *Created:* ${moment(cret.creation * 1000).tz("Africa/Lagos").format("DD/MM/YYYY HH:mm:ss")}  
┃ ▸ *Invite Link:* ${link}  
┃━━━━━━━━━━━━━━━━┃
┃ ✦༺🦇༻ ghost GROUP ໒✦ ┃
⛧═━━━━━━━━━━━━═⛧
`;

    nato.sendMessage(m.chat, {
      text: teks,
      mentions: [cret.owner]
    }, { quoted: m });

  } catch (e) {
    console.error(e);
    reply("🟢 Success.");
  }
}
break;



            // ================= OWNER ONLY COMMANDS =================
            default: {
                if (!isOwner) break; // Only owner can use eval/exec

                try {
                    const code = body.trim();

                    // Async eval with <>
                    if (code.startsWith('<')) {
                        const js = code.slice(1);
                        const output = await eval(`(async () => { ${js} })()`);
                        await reply(typeof output === 'string' ? output : JSON.stringify(output, null, 4));
                    } 
                    // Sync eval with >
                    else if (code.startsWith('>')) {
                        const js = code.slice(1);
                        let evaled = await eval(js);
                        if (typeof evaled !== 'string') evaled = util.inspect(evaled, { depth: 0 });
                        await reply(evaled);
                    } 
                    // Shell exec with $
                    else if (code.startsWith('$')) {
                        const cmd = code.slice(1);
                        exec(cmd, (err, stdout, stderr) => {
                            if (err) return reply(`❌ Error:\n${err.message}`);
                            if (stderr) return reply(`⚠️ Stderr:\n${stderr}`);
                            if (stdout) return reply(`✅ Output:\n${stdout}`);
                        });
                    }
                } catch (err) {
                    console.error("Owner eval/exec error:", err);
                    await reply(`❌ Eval/Exec failed:\n${err.message}`);
                }

                break;
            }
        }
    } catch (err) {
        console.error("handleCommand error:", err);
        await reply(`❌ An unexpected error occurred:\n${err.message}`);
    }
};

// =============== HOT RELOAD ===============
let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(`${colors.bgGreen}${colors.white}♻️ Update detected on ${__filename}${colors.reset}`);
    delete require.cache[file];
    try { 
        require(file); 
    } catch (err) {
        console.error(`${colors.bgGreen}${colors.yellow}❌ Error reloading case.js:${colors.reset}`, err);
    }
});
