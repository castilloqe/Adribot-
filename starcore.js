process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'

import './config.js'
import { createRequire } from 'module'
import path, { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import * as ws from 'ws'
import fs from 'fs'
import { readdirSync, statSync, unlinkSync, existsSync } from 'fs'
import yargs from 'yargs'
import { spawn } from 'child_process'
import lodash from 'lodash'
import chalk from 'chalk'
import syntaxerror from 'syntax-error'
import { tmpdir } from 'os'
import { format } from 'util'
import pino from 'pino'
import { Boom } from '@hapi/boom'
import { makeWASocket, protoType, serialize } from './lib/simple.js'
import { Low, JSONFile } from 'lowdb'
import { mongoDB, mongoDBV2 } from './lib/mongoDB.js'
import store from './lib/store.js'
import QRCode from 'qrcode'

const { proto } = (await import('@whiskeysockets/baileys')).default
const {
  DisconnectReason,
  useMultiFileAuthState,
  MessageRetryMap,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  PHONENUMBER_MCC
} = await import('@whiskeysockets/baileys')

import readline from 'readline'
import NodeCache from 'node-cache'

protoType()
serialize()

// Helpers para path en ESM
global.__filename = (pathURL = import.meta.url, rmPrefix = platform !== 'win32') =>
  rmPrefix
    ? /file:\/\/\//.test(pathURL)
      ? fileURLToPath(pathURL)
      : pathURL
    : pathToFileURL(pathURL).toString()

global.__dirname = (pathURL) => path.dirname(global.__filename(pathURL, true))

global.__require = (dir = import.meta.url) => createRequire(dir)

const __dirname = global.__dirname(import.meta.url)

// API helper global
global.API = (name, path = '/', query = {}, apikeyqueryname) =>
  (name in global.APIs ? global.APIs[name] : name) +
  path +
  (query || apikeyqueryname
    ? '?' +
      new URLSearchParams(
        Object.entries({
          ...query,
          ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {})
        })
      )
    : '')

global.timestamp = { start: new Date() }

// Leer opciones CLI
global.opts = yargs(process.argv.slice(2)).exitProcess(false).parse()
global.prefix = new RegExp(
  '^[' + (opts['prefix'] || '‎z/#$%.\\-').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') + ']'
)

// Configurar base de datos LowDB
global.db = new Low(
  /https?:\/\//.test(opts['db'] || '')
    ? new cloudDBAdapter(opts['db'])
    : new JSONFile(`${opts._[0] ? opts._[0] + '_' : ''}database.json`)
)
global.DATABASE = global.db

// Carga base de datos
global.loadDatabase = async () => {
  if (global.db.READ)
    return new Promise((resolve) =>
      setInterval(async function () {
        if (!global.db.READ) {
          clearInterval(this)
          resolve(global.db.data == null ? global.loadDatabase() : global.db.data)
        }
      }, 1000)
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
  global.db.chain = lodash.chain(global.db.data)
}
await loadDatabase()

global.authFile = 'sessions'
const { state, saveState, saveCreds } = await useMultiFileAuthState(global.authFile)

const msgRetryCounterMap = (MessageRetryMap) => {}
const msgRetryCounterCache = new NodeCache()
const { version } = await fetchLatestBaileysVersion()
const phoneNumber = global.botnumber

const methodCodeQR = process.argv.includes('qr')
const methodCode = !!phoneNumber || process.argv.includes('code')
const methodMobile = process.argv.includes('mobile')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))

let opcion
if (methodCodeQR) {
  opcion = '1'
} else if (!methodCodeQR && !methodCode && !fs.existsSync(`./${authFile}/creds.json`)) {
  do {
    opcion = await question('Seleccione una opción:\n1. Con código QR\n2. Con código de texto de 8 dígitos\n---> ')
    if (!/^[1-2]$/.test(opcion)) console.log('Por favor, seleccione solo 1 o 2.\n')
  } while ((opcion !== '1' && opcion !== '2') || fs.existsSync(`./${authFile}/creds.json`))
}
rl.close()

console.info = () => {} // desactivar logs info por defecto

// Opciones para baileys
const connectionOptions = {
  logger: pino({ level: 'silent' }),
  printQRInTerminal: opcion === '1' || methodCodeQR,
  mobile: methodMobile,
  browser: opcion === '1' || methodCodeQR ? ['Sonic Bot', 'Safari', '2.0.0'] : ['Ubuntu', 'Chrome', '110.0.5585.95'],
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
  },
  markOnlineOnConnect: true,
  generateHighQualityLinkPreview: true,
  getMessage: async (key) => {
    const jid = jidNormalizedUser(key.remoteJid)
    const msg = await store.loadMessage(jid, key.id)
    return msg?.message || ''
  },
  msgRetryCounterCache,
  msgRetryCounterMap,
  defaultQueryTimeoutMs: undefined,
  version
}

global.conn = makeWASocket(connectionOptions)

// Manejo de login con código
if (!fs.existsSync(`./${authFile}/creds.json`)) {
  if (opcion === '2' || methodCode) {
    if (!conn.authState.creds.registered) {
      if (methodMobile) throw new Error('No se puede usar un código de emparejamiento con la API móvil')

      let numeroTelefono = ''
      if (phoneNumber) {
        numeroTelefono = phoneNumber.replace(/[^0-9]/g, '')
        if (!Object.keys(PHONENUMBER_MCC).some((v) => numeroTelefono.startsWith(v))) {
          console.log(chalk.bgBlack(chalk.bold.redBright('Comience con el código de país de su número de WhatsApp.\nejemplo: 54xxxxxxxxx\n')))
          process.exit(0)
        }
      } else {
        while (true) {
          numeroTelefono = await question(
            chalk.bgBlack(chalk.bold.yellowBright('Por favor, escriba su número de WhatsApp.\nEjemplo: 54xxxxxxxxx\n'))
          )
          numeroTelefono = numeroTelefono.replace(/[^0-9]/g, '')

          if (numeroTelefono.match(/^\d+$/) && Object.keys(PHONENUMBER_MCC).some((v) => numeroTelefono.startsWith(v))) {
            break
          } else {
            console.log(chalk.bgBlack(chalk.bold.redBright('Por favor, escriba su número de WhatsApp.\nEjemplo: 5218261275256.\n')))
          }
        }
        rl.close()
      }

      setTimeout(async () => {
        const codigo = (await conn.requestPairingCode(numeroTelefono))
          ?.match(/.{1,4}/g)
          ?.join('-')
        console.log(chalk.yellow('introduce el código de emparejamiento en WhatsApp.'))
        console.log(chalk.black(chalk.bgGreen('Tu código de emparejamiento es : ')), chalk.black(chalk.white(codigo || '')))
      }, 3000)
    }
  }
}

conn.isInit = false
conn.well = false

// Auto guardado y limpieza tmp si está habilitado
if (!opts['test']) {
  if (global.db) {
    setInterval(async () => {
      if (global.db.data) await global.db.write()
      if (opts['autocleartmp'] && global.support?.find) {
        const tmp = [tmpdir(), 'tmp', 'serbot']
        tmp.forEach((filename) => spawn('find', [filename, '-amin', '3', '-type', 'f', '-delete']))
      }
    }, 30 * 1000)
  }
}

// Server si está activo
if (opts['server']) (await import('./server.js')).default(global.conn, process.env.PORT || process.env.SERVER_PORT || 3000)

// Función para limpiar tmp files
function clearTmp() {
  const tmpDirs = [join(__dirname, './tmp')]
  const files = []
  tmpDirs.forEach((dir) => readdirSync(dir).forEach((file) => files.push(join(dir, file))))
  files.forEach((file) => {
    const stats = statSync(file)
    if (stats.isFile() && Date.now() - stats.mtimeMs >= 1000 * 60 * 3) {
      unlinkSync(file)
    }
  })
}

// Manejo de eventos de conexión
conn.connectionUpdate = async (update) => {
  const { connection, lastDisconnect, qr } = update

  if (qr) {
    try {
      await QRCode.toFile('qr-whatsapp.png', qr, {
        color: { dark: '#000000', light: '#FFFFFF' },
        width: 300
      })
      console.log(chalk.green('QR generado y guardado en qr-whatsapp.png'))
    } catch (err) {
      console.error('Error generando el QR:', err)
    }
  }

  if (connection) {
    console.log(`Estado de conexión: ${connection}`)
  }

  if (connection === 'close') {
    const statusCode = (lastDisconnect?.error instanceof Boom && lastDisconnect.error.output.statusCode) || null
    if (statusCode === DisconnectReason.loggedOut) {
      console.log(chalk.red('Sesión cerrada, elimine la carpeta "sessions" y vuelva a iniciar.'))
      process.exit(0)
    } else {
      console.log('Conexión cerrada por otra razón, intentando reconectar...')
      conn.isInit = false
      await conn.logout()
      start() // Debes definir esta función start si quieres reconectar automáticamente
    }
  } else if (connection === 'open') {
    conn.isInit = true
    conn.well = true
    console.log(chalk.green('Conectado correctamente!'))
  }
}
