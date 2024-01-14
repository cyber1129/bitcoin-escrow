import { EscrowClient, Signer } from '@scrow/core'

import ctx from '../const.js'

const alice = { signer : Signer.seed('alice') }

const hostname = ctx.escrow
const oracle   = ctx.oracle

const client   = new EscrowClient(alice.signer, { hostname, oracle })

const cid = ctx.cid

const contract = await client.contract.cancel(cid)

console.log('Contract:', contract)
