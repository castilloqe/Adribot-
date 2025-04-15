import fetch from 'node-fetch';

let MF = async (m, { conn, usedPrefix, command, args }) => {

if (!args[0]) return m.reply('🌃 Ingrese una URL de TikTok');

try {
let moon = args[0];
let force = await (await fetch(`https://moonforce-apiofc.vercel.app/api/download/tiktok?url=${moon}`)).json();

let { title, video } = force.result;
let txt = `*Título:* ${title}`;
let vid = video.no_watermark;

await conn.sendMessage(m.chat, { video: { url: vid }, caption: txt, mimetype: 'video/mp4' }, { quoted: m });

} catch (e) {
m.reply(`Error: ${e.message}`);
}};

MF.command = ['test'];

export default MF;