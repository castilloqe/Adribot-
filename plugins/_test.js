import fetch from 'node-fetch';

let MF = async (m, { conn, usedPrefix, command, args }) => {

if (!args[0]) return m.reply('🌃 Ingrese una URL de TikTok');

let moon = args[0];
let force = await (await fetch(`https://moonforce-apiofc.vercel.app/api/download/tiktok?url=${moon}`)).json();

if (!force.results) return m.reply('❌ Error al obtener los datos');

let { title, video, thumbnail } = force.result;
let txt = `*Título:* ${title}`;
let vid = video.no_watermark;

await conn.sendFile(m.chat, thumbnail, 'thumbnail.jpg', txt, m);
await conn.sendMessage(m.chat, { video: { url: vid }, mimetype: 'video/mp4' }, { quoted: m });
};

MF.command = ['test'];

export default MF;