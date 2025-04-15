// Google By WillZek >> https://github.com/WillZek

import fetch from 'node-fetch';

let MF = async(m, { conn, usedPrefix, command, args }) => {

if (!args[0]) return m.reply('🌃 Ingrese Para Buscar En Google');

let moon = args[0];
let force = await (await fetch (`https://moonforce-apiofc.vercel.app/api/download/tiktok?url=${moon}`)).json();

let txt = `*Titulo:* force.results.title`
let vid = force.results.video.no_watermark;

conn.sendFile(m.chat, img, 'MoonForce.jpg', txt, null, rcanal);

conn.sendMessage(m.chat, { video: { url: vid }, mimetype: 'video/mp4' }, { quoted: m });
}

MF.command = ['test'];

export default MF;