// Player identity: Ed25519 keypair via hypercore-crypto (libsodium under the hood).
// playerId = hex of the 32-byte public key (64 hex chars).

import hyperCrypto from 'hypercore-crypto'
import { readFile, writeFile } from 'fs/promises'

export function generateKeypair() {
  return hyperCrypto.keyPair()
  // → { publicKey: Buffer(32), secretKey: Buffer(64) }
}

export function playerId(publicKey) {
  return Buffer.isBuffer(publicKey)
    ? publicKey.toString('hex')
    : publicKey
}

export async function saveKeypair(keypair, filePath) {
  const data = {
    publicKey: keypair.publicKey.toString('hex'),
    secretKey: keypair.secretKey.toString('hex')
  }
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

export async function loadKeypair(filePath) {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8'))
    return {
      publicKey: Buffer.from(raw.publicKey, 'hex'),
      secretKey: Buffer.from(raw.secretKey, 'hex')
    }
  } catch {
    return null
  }
}

// Full player identity: keypair + assigned clan.
export async function saveIdentity(identity, filePath) {
  await writeFile(filePath, JSON.stringify({
    publicKey: identity.keypair.publicKey.toString('hex'),
    secretKey: identity.keypair.secretKey.toString('hex'),
    clanId: identity.clanId ?? null
  }, null, 2), 'utf8')
}

export async function loadIdentity(filePath) {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8'))
    return {
      keypair: {
        publicKey: Buffer.from(raw.publicKey, 'hex'),
        secretKey: Buffer.from(raw.secretKey, 'hex')
      },
      clanId: raw.clanId ?? null
    }
  } catch {
    return null
  }
}
