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

const { CONNECTING } = ws
const { chain } = lodash
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000

protoType()
serialize()

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  return rmPrefix ? (/file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL) : pathToFileURL(pathURL).toString()
}

global.__dirname = function dirname(pathURL) {
  return path.dirname(global.__filename(pathURL, true))
}

global.__require = function require(dir = import.meta.url) {
  return createRequire(dir)
}

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

const __dirname = global.__dirname(import.meta.url)

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp(
  '^[' + (opts['prefix'] || '‎z/#$%.\\-').replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') + ']'
)

// global.opts['db'] = process.env['db']

global.db = new Low(
  /https?:\/\//.test(opts['db'] || '')
    ? new cloudDBAdapter(opts['db'])
    : new JSONFile(`${opts._[0] ? opts._[0] + '_' : ''}database.json`)
)

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
loadDatabase()

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
    let lineM = '⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ 》'
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

if (!fs.existsSync(`./${authFile}/creds.json`)) {
  if (opcion === '2' || methodCode) {
    opcion = '2'
    if (!conn.authState.creds.registered) {
      if (MethodMobile) throw new Error('No se puede usar un código de emparejamiento con la API móvil')

      let numeroTelefono
      if (!!phoneNumber) {
        numeroTelefono = phoneNumber.replace(/[^0-9]/g, '')
        if (!Object.keys(PHONENUMBER_MCC).some((v) => numeroTelefono.startsWith(v))) {
          console.log(
            chalk.bgBlack(chalk.bold.redBright('Comience con el código de país de su número de WhatsApp.\nejemplo: 54xxxxxxxxx\n'))
          )
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
            console.log(
              chalk.bgBlack(
                chalk.bold.redBright('Por favor, escriba su número de WhatsApp.\nEjemplo: 5218261275256.\n')
              )
            )
          }
        }
        rl.close()
      }

      setTimeout(async () => {
        let codigo = await conn.requestPairingCode(numeroTelefono)
        codigo = codigo?.match(/.{1,4}/g)?.join('-') || codigo
        console.log(chalk.yellow('introduce el código de emparejamiento en WhatsApp.'))
        console.log(chalk.black(chalk.bgGreen(`Tu código de emparejamiento es : `)), chalk.black(chalk.white(codigo)))
      }, 3000)
    }
  }
}

conn.isInit = false
conn.well = false

if (!opts['test']) {
  if (global.db) {
    setInterval(async () => {
      if (global.db.data) await global.db.write()
      if (opts['autocleartmp'] && (global.support || {}).find)
        tmp = [os.tmpdir(), 'tmp', 'serbot'], tmp.forEach((filename) => cp.spawn('find', [filename, '-amin', '3', '-type', 'f', '-delete']))
    }, 30 * 1000)
  }
}

if (opts['server']) (await import('./server.js')).default(global.conn, PORT)

function clearTmp() {
  const tmp = [join(__dirname, './tmp')]
  const filename = []
  tmp.forEach((dirname) => readdirSync(dirname).forEach((file) => filename.push(join(dirname, file))))
  return filename.map((file) => {
    const stats = statSync(file)
    if (stats.isFile() && Date.now() - stats.mtimeMs >= 1000 * 60 * 3) return unlinkSync(file) // 3 minutes
    return false
  })
}

function purgeSession() {
  let prekey = []
  let directorio = readdirSync('./sessions')
  let filesFolderPreKeys = directorio.filter((file) => file.startsWith('pre-key-'))
  prekey = [...prekey, ...filesFolderPreKeys]
  filesFolderPreKeys.forEach((files) => {
    unlinkSync(`./sessions/${files}`)
  })
}

function purgeSessionSB() {
  try {
    let listaDirectorios = readdirSync('./serbot/')
    let SBprekey = []
    listaDirectorios.forEach((directorio) => {
      if (statSync(`./serbot/${directorio}`).isDirectory()) {
        let DSBPreKeys = readdirSync(`./serbot/${directorio}`).filter((fileInDir) => {
          return fileInDir.startsWith('pre-key-')
        })
        SBprekey = [...SBprekey, ...DSBPreKeys]
        DSBPreKeys.forEach((fileInDir) => {
          unlinkSync(`./serbot/${directorio}/${fileInDir}`)
        })
      }
    })
    if (SBprekey.length === 0) return
    console.log(chalk.cyanBright(`=> No hay archivos por eliminar.`))
  } catch (err) {
    console.log(chalk.bold.red(`Algo salio mal durante la eliminación, archivos no eliminados`))
  }
}

function purgeOldFiles() {
  const directories = ['./sessions/', './serbot/']
  const oneHour = 3600 * 1000

  directories.forEach((directory) => {
    if (!existsSync(directory)) return
    readdirSync(directory).forEach((file) => {
      const fullPath = join(directory, file)
      if (!statSync(fullPath).isFile()) return
      const age = Date.now() - statSync(fullPath).mtimeMs
      if (age > oneHour) {
        unlinkSync(fullPath)
        console.log(chalk.red(`Archivo eliminado: ${fullPath}`))
      }
    })
  })
}

async function main() {
  if (opts['purge']) {
    purgeSession()
    purgeSessionSB()
    purgeOldFiles()
  }
}

main()

// Exporta conn para usarlo en otros módulos
export default global.conn
