process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'
import './config.js'
import { createRequire } from 'module'
import path, { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import * as ws from 'ws'
import fs from 'fs'
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, rmSync, watch } from 'fs'
import yargs from 'yargs'
import { spawn } from 'child_process'
import lodash from 'lodash'
import chalk from 'chalk'
import syntaxerror from 'syntax-error'
import { tmpdir } from 'os'
import { format } from 'util'
import P from 'pino'
import pino from 'pino'
import Pino from 'pino'
import { Boom } from '@hapi/boom'
import { makeWASocket, protoType, serialize } from './lib/simple.js'
import { Low, JSONFile } from 'lowdb'
import { mongoDB, mongoDBV2 } from './lib/mongoDB.js'
import store from './lib/store.js'
import QRCode from 'qrcode'
const { proto } = (await import('@whiskeysockets/baileys')).default
const { DisconnectReason, useMultiFileAuthState, MessageRetryMap, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, PHONENUMBER_MCC } = await import('@whiskeysockets/baileys')
import readline from 'readline'
import NodeCache from 'node-cache'
const { CONNECTING } = ws
const { chain } = lodash
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000

protoType()
serialize()

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString()
}
global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true))
}
global.__require = function require(dir = import.meta.url) {
  return createRequire(dir)
}

global.API = (name, path = '/', query = {}, apikeyqueryname) => (name in global.APIs ? global.APIs[name] : name) + path + (query || apikeyqueryname ? '?' + new URLSearchParams(Object.entries({ ...query, ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {}) })) : '')

global.timestamp = { start: new Date() }

const __dirname = global.__dirname(import.meta.url)

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp('^[' + (opts['prefix'] || '‎z/#$%.\\-').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') + ']')

global.db = new Low(/https?:\/\//.test(opts['db'] || '') ? new cloudDBAdapter(opts['db']) : new JSONFile(`${opts._[0] ? opts._[0] + '_' : ''}database.json`))

global.DATABASE = global.db
global.loadDatabase = async function loadDatabase() {
  if (global.db.READ)
    return new Promise((resolve) =>
      setInterval(async function () {
        if (!global.db.READ) {
          clearInterval(this)
          resolve(global.db.data == null ? global.loadDatabase() : global.db.data)
        }
      }, 1 * 1000)
    )
  if (global.db.data !== null) return
  global.db.READ = true
  await global.db.read().catch(console.error)
  global.db.READ = null
  global.db.data = {
    users: {},
    chats: {},
    stats: {},
    msgs: {},
    sticker: {},
    settings: {},
    ...(global.db.data || {})
  }
  global.db.chain = chain(global.db.data)
}
await loadDatabase()

global.authFile = `sessions`
const { state, saveState, saveCreds } = await useMultiFileAuthState(global.authFile)
const msgRetryCounterMap = (MessageRetryMap) => {}
const msgRetryCounterCache = new NodeCache()
const { version } = await fetchLatestBaileysVersion()
let phoneNumber = global.botnumber

const methodCodeQR = process.argv.includes('qr')
const methodCode = !!phoneNumber || process.argv.includes('code')
const MethodMobile = process.argv.includes('mobile')
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (texto) => new Promise((resolver) => rl.question(texto, resolver))

let opcion
if (methodCodeQR) {
  opcion = '1'
}
if (!methodCodeQR && !methodCode && !fs.existsSync(`./${authFile}/creds.json`)) {
  do {
    opcion = await question('Seleccione una opción:\n1. Con código QR\n2. Con código de texto de 8 dígitos\n---> ')
    if (!/^[1-2]$/.test(opcion)) {
      console.log('Por favor, seleccione solo 1 o 2.\n')
    }
  } while ((opcion !== '1' && opcion !== '2') || fs.existsSync(`./${authFile}/creds.json`))
}

console.info = () => {}

const connectionOptions = {
  logger: pino({ level: 'silent' }),
  printQRInTerminal: opcion == '1' ? true : methodCodeQR ? true : false,
  mobile: MethodMobile,
  browser:
    opcion == '1'
      ? ['Sonic Bot', 'Safari', '2.0.0']
      : methodCodeQR
      ? ['Sonic Bot', 'Safari', '2.0.0']
      : ['Ubuntu', 'Chrome', '110.0.5585.95'],
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'fatal' }).child({ level: 'fatal' }))
  },
  markOnlineOnConnect: true,
  generateHighQualityLinkPreview: true,
  getMessage: async (clave) => {
    let jid = jidNormalizedUser(clave.remoteJid)
    let msg = await store.loadMessage(jid, clave.id)
    return msg?.message || ''
  },
  msgRetryCounterCache,
  msgRetryCounterMap,
  defaultQueryTimeoutMs: undefined,
  version
}

global.conn = makeWASocket(connectionOptions)

conn.ev.on('connection.update', async (update) => {
  const { connection, lastDisconnect, qr, isNewLogin } = update

  if (qr) {
    console.log(chalk.cyan('Escanea este código QR con WhatsApp:\n'))
    try {
      const qrStr = await QRCode.toString(qr, { type: 'terminal', small: true })
      console.log(qrStr)
    } catch (e) {
      console.error('Error mostrando QR:', e)
    }
  }

  if (connection === 'close') {
    const statusCode = lastDisconnect?.error?.output?.statusCode
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut
    console.log(chalk.red(`Conexión cerrada: ${lastDisconnect?.error?.message || statusCode}`))
    if (shouldReconnect) {
      console.log(chalk.yellow('Reconectando...'))
      startConnection()
    } else {
      console.log(chalk.red('Sesión cerrada. Inicie sesión nuevamente.'))
      process.exit(0)
    }
  }
  if (connection === 'open') {
    console.log(chalk.green('✅ Conexión establecida correctamente.'))
  }
  if (isNewLogin) {
    console.log(chalk.green('Inicio de sesión nuevo exitoso'))
  }
})

conn.ev.on('creds.update', saveCreds)

// Aquí tu código para manejar mensajes y plugins
conn.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0]
  if (!msg.message || msg.key.fromMe) return

  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
  const prefixMatch = text.match(global.prefix)
  if (!prefixMatch) return

  const body = text.slice(prefixMatch[0].length).trim()
  const [cmd, ...args] = body.split(/\s+/)
  const command = cmd.toLowerCase()

  for (const pluginName in global.plugins) {
    const plugin = global.plugins[pluginName]
    try {
      if (typeof plugin === 'function') {
        await plugin({ conn, msg, command, args, text: body })
      }
    } catch (e) {
      console.error(chalk.red(`[PLUGIN ERROR] ${pluginName}:`), e)
    }
  }
})

// Resto de tu código para gestionar plugins, recarga, sesiones, limpieza, etc.
// (Mantén el resto de tu starcore.js sin cambios, solo actualiza como te pasé acá la parte de conexión y QR)

async function startConnection() {
  // Puedes mover aquí la lógica si quieres iniciar conexión explícitamente
  // Por ejemplo, si quieres reiniciar conexión cuando cierren
}

startConnection()

export default conn
