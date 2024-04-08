/**
 * Deposit API Demo for endpoint:
 * /api/deposit/:dpid/close
 * 
 * You can run this demo using the shell command:
 * yarn load demo/api/deposit/close
 */

import { print_banner } from '@scrow/test'

import { client }       from '@scrow/demo/01_create_client.js'
import { signers }      from '@scrow/demo/02_create_signer.js'
import { open_deposit } from '@scrow/demo/api/deposit/register.js'

// Define our funder for the deposit.
const funder = signers[0]
// Generate a close request from the depositor.
const req = funder.deposit.close(open_deposit, 5)
// Deliver the request and token.
const res = await client.deposit.close(req)
// Check the response is valid.
if (!res.ok) throw new Error(res.error)
// Unpack our response data.
const closed_deposit = res.data.deposit

print_banner('closed deposit')
console.dir(closed_deposit, { depth : null })
console.log('\n')
