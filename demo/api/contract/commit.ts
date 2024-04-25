/**
 * Deposit API Demo for endpoint:
 * /api/deposit/:dpid/commit
 * 
 * You can run this demo using the shell command:
 * yarn load demo/api/deposit/commit
 */

import { print_banner } from '@scrow/test'
import { sleep }        from '@scrow/sdk/util'
import { config }       from '@scrow/demo/00_demo_config.js'
import { client }       from '@scrow/demo/01_create_client.js'
import { signers }      from '@scrow/demo/02_create_signer.js'
import { new_contract } from '@scrow/demo/05_create_contract.js'
import { new_account }  from '@scrow/demo/06_request_account.js'

import {
  fund_mutiny_address,
  fund_regtest_address,
} from '@scrow/demo/util.js'

// Unpack account address.
const { deposit_addr } = new_account
// Compute a txfee from the feerate.
const vin_fee   = new_contract.fund_txfee
// Compute a total amount (in sats) with the txfee.
const amt_total = new_contract.tx_total + vin_fee
// Also compute a total amount in bitcoin.
const btc_total = amt_total / 100_000_000

/** ========== [ Print Deposit Info ] ========== **/

switch (config.network) {
  case 'mutiny':
    fund_mutiny_address(deposit_addr, amt_total)
    break
  case 'regtest':
    fund_regtest_address(deposit_addr, amt_total)
    break
  default:
    print_banner('make a deposit')
    console.log('copy this address :', deposit_addr)
    console.log('send this amount  :', `${amt_total} sats || ${btc_total} btc`)
    console.log('get funds here    :', config.faucet, '\n')   
}

await sleep(2000)

/** ========== [ Poll Deposit Status ] ========== **/

// Define our polling interval and retries.
const [ ival, retries ] = config.poll
// Poll for utxos from the account address.
const utxo = await client.oracle.poll_address(deposit_addr, ival, retries, true)

print_banner('address utxo')
console.log('utxo:', utxo)

// Define our funder for the deposit.
const funder = signers[0]
// Define a feerate for the return transaction.
const feerate = config.feerate
// Generate a commit request from the depositor.
const req    = funder.deposit.commit(new_account, new_contract, feerate, utxo.txout)
// Deliver our commit request to the server.
const res    = await client.contract.commit(req)
// Check the response is valid.
if (!res.ok) throw new Error(res.error)
// Unpack our data object.
const locked_deposit = res.data.deposit

print_banner('locked deposit')
console.dir(locked_deposit, { depth: null })
console.log('\n')