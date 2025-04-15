// Google By WillZek >> https://github.com/WillZek

import fetch from 'node-fetch';

let MF = async(m, { conn, usedPrefix, command, args }) => {

if (!args[0]) return m.reply('🌃 Ingrese Para Buscar En Google');

let moon = args[0];
let force = await (await fetch (`https://moonforce-apiofc.vercel.app/api/download/tiktok?url=${moon}`)).json();

let txt = `*Titulo:* force.results.title`
}

MF.command = ['google', 'test'];

export default MF;