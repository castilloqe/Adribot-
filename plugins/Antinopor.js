import fs from "fs";
import path from "path";

const handler = async (m, { conn, args }) => {
  // const chatId = m.key.remoteJid;
  // const senderId = m.key.participant || m.key.remoteJid;
  const senderClean = m.sender.replace(/[^0-9]/g, "");

  // Solo funciona en grupos
  if (!m.chat.endsWith("@g.us")) {
    return await conn.sendMessage(m.chat, {
      text: "❌ Este comando solo funciona en grupos."
    }, { quoted: m });
  }

  // Verificar si es admin del grupo o owner del bot
  try {
    const metadata = await conn.groupMetadata(m.chat);
    const participant = metadata.participants.find(p => p.id.includes(senderClean));
    const isAdmin = participant?.admin === "admin" || participant?.admin === "superadmin";
    const isOwner = global.owner.some(o => o[0] === senderClean);

    if (!isAdmin && !isOwner) {
      return conn.sendMessage(m.chat, {
        text: "❌ Solo los administradores o el owner pueden usar este comando."
      }, { quoted: m });
    }

    if (!args[0] || !["on", "off"].includes(args[0])) {
      return conn.sendMessage(m.chat, {
        text: "✳️ Usa el comando así:\n\n📌 *antiporno on*  (activar)\n📌 *antiporno off* (desactivar)"
      }, { quoted: m });
    }

    // Reacción ⏳
    await conn.sendMessage(m.chat, {
      react: { text: "⏳", key: m.key }
    });

    const filePath = path.resolve("./activos.json");
    let data = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath)) : {};
    if (!data.antiporno) data.antiporno = {};

    if (args[0] === "on") {
      data.antiporno[m.chat] = true;
      await conn.sendMessage(m.chat, {
        text: "✅ Antiporno *activado* en este grupo."
      }, { quoted: m });
    } else {
      delete data.antiporno[m.chat];
      await conn.sendMessage(m.chat, {
        text: "✅ Antiporno *desactivado* en este grupo."
      }, { quoted: m });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    // Reacción final
    await conn.sendMessage(m.chat, {
      react: { text: "✅", key: m.key }
    });

  } catch (err) {
    console.error("❌ Error en comando antiporno:", err);
    await conn.sendMessage(m.chat, {
      text: "❌ Ocurrió un error al ejecutar el comando."
    }, { quoted: m });

    await conn.sendMessage(m.chat, {
      react: { text: "❌", key: m.key }
    });
  }
};

handler.command = ["antiporno"];

export default handler;