let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return conn.reply(m.chat, '🌠 ¿Que comando quieres sugerir?', m)
    if (text.length < 5) return conn.reply(m.chat, '🌠 La sugerencia debe ser más de 5 caracteres.', m)
    if (text.length > 1000) return conn.reply(m.chat, '🌠 Máximo de la sugerencia es de 1000 caracteres.', m)
    
    const teks = `🌠 Sugerencia de nuevo comando del usuario *${conn.getName(m.sender)}*

🛡️ Han sugerido un comando:
> ${text}`
    
    const groupChatId = '120363395340241509@g.us';
/*    await conn.reply(groupChatId, m.quoted ? teks + m.quoted.text : teks, m, { mentions: conn.parseMention(teks) })
*/
     await conn.reply(groupChatId, m.quoted ? teks + m.quoted.text : teks, m, { mentions: [m.sender] })

    m.reply('🌠 La sugerencia se envió al Staff De Sonicbot.')
}
handler.help = ['sugerencia']
handler.tags = ['owner']
handler.command = ['sugerencia', 'sugerir', 'crowsug']
handler.group = true;

export default handler