/* Global Imports */

import { Test }         from 'tape'
import { CoreClient }   from '@cmdcode/core-cmd'

/* Package Imports */

import {
  create_account,
  create_account_req,
} from '@scrow/sdk/core/account'

import { AccountData, PaymentEntry, SignerAPI } from '@scrow/sdk/core'

import { endorse_proposal } from '@scrow/sdk/core/proposal'
import { now }              from '@scrow/sdk/util'
import { VM }               from '@scrow/sdk/vm'

import {
  create_vm_receipt,
  create_witness,
  sign_witness
} from '@scrow/sdk/core/vm'

import {
  create_contract_req,
  create_contract,
  activate_contract,
  settle_contract,
  get_vm_config
} from '@scrow/sdk/core/contract'

import {
  create_commit_req,
  create_deposit
} from '@scrow/sdk/core/deposit'

import {
  verify_account_req,
  verify_account,
  verify_contract_req,
  verify_contract,
  verify_deposit,
  verify_settlement,
  verify_witness,
  verify_commit_req,
  verify_vm_receipt
} from '@scrow/sdk/core/validate'

import * as assert from '@scrow/sdk/assert'

/* Local Imports */

import {
  fund_address,
  get_members,
  get_utxo
} from '../core.js'

import { get_proposal } from '../vectors/basic_escrow.js'

const VERBOSE = process.env.VERBOSE === 'true'

const FEERATE  = 2
const LOCKTIME = 60 * 60 * 2
const NETWORK  = 'regtest'

export default async function (client : CoreClient, tape : Test) {
  tape.test('E2E test of the core protocol', async t => {
    t.plan(1)

    try {

      /* ------------------- [ Init ] ------------------- */

      const banner    = (title : string) => `\n=== [ ${title} ] ===`.padEnd(80, '=') + '\n'
      const aliases   = [ 'agent', 'alice', 'bob', 'carol' ]
      const ret_addr  = await client.core.faucet.get_address('faucet')
      const users     = await get_members(client, aliases)

      const [ server, ...members ] = users

      const fees      = [[ 1000, ret_addr ]] as PaymentEntry[]

      const ct_config = { fees, feerate: FEERATE }
      const server_sd = server.signer
      const server_pk = server_sd.pubkey

      /* ------------------- [ Create Proposal ] ------------------- */

      // Construct a proposal from the template.
      const proposal   = await get_proposal(members)
      // Have each member endorse the proposal.
      const signatures = members.map(e => endorse_proposal(proposal, e.signer))

      if (VERBOSE) {
        console.log(banner('proposal'))
        console.dir(proposal, { depth : null })
      }

      /* ------------------- [ Create Contract ] ------------------- */

      // Client: Create a contract request.
      const pub_req  = create_contract_req(proposal, signatures)
      // Server: Verify contract request.
      verify_contract_req(pub_req)
      // Server: Create contract data.
      const contract = create_contract(ct_config, pub_req)
      // Client: Verify contract data.
      // verify_contract(contract, proposal, server_pk)
      
      if (VERBOSE) {
        console.log(banner('contract'))
        console.dir(contract, { depth : null })
      }

      /* ------------------- [ Create Accounts ] ------------------ */

      const funder = members[0].signer

      // Client: Create account request.
      const acct_req = create_account_req(funder.pubkey, LOCKTIME, NETWORK, ret_addr)
      // Server: Verify account request.
      verify_account_req(acct_req)
      // Server: Create account data.
      const account = create_account(acct_req, server_sd)
      // Client: Verify account data.
      verify_account(account, server_pk, funder)
      // Return account and signer as tuple.


      if (VERBOSE) {
        console.log(banner('account'))
        console.dir(account, { depth : null })
      }

      /* ------------------- [ Create Deposits ] ------------------- */

      // Fund deposit address and get txid.
      const txid = await fund_address(client, 'faucet', account.deposit_addr, contract.total, false)
      // Fetch the utxo for the funded address.
      const utxo = await get_utxo(client, account.deposit_addr, txid)
      // Client: Create the commit request.
      const commit_req = create_commit_req(FEERATE, contract, account, funder, utxo)
      // Server: Verify the registration request.
      verify_commit_req(contract, commit_req, server_sd)
      // Server: Create the deposit data.
      const deposit = create_deposit({}, commit_req)
      // Client: Verify the deposit data.
      verify_deposit(deposit, server_pk)

      await client.mine_blocks(1)

      if (VERBOSE) {
        console.log(banner('deposit'))
        console.dir(deposit, { depth : null })
      }

      /* ------------------ [ Activate Contract ] ------------------ */

      const ct_active = activate_contract(contract)
      const vm_config = get_vm_config(ct_active)
      const vm_state  = VM.init(vm_config)

      if (VERBOSE) {
        console.log('contract activated')
        console.log(banner('vm state'))
        console.dir(vm_state, { depth : null })
      }

      /* ------------------- [ Submit Statements ] ------------------- */

      const signer = members[0].signer

      const config = {
        action : 'dispute',
        method : 'endorse',
        path   : 'payout',
      }

      let witness = create_witness(proposal.programs, signer.pubkey, config)
          witness = sign_witness(signer, witness)

      verify_witness(ct_active, witness)

      if (VERBOSE) {
        console.log(banner('witness'))
        console.dir(witness, { depth : null })
      }

      let state = VM.eval(vm_state, witness, now())

      if (state.error !== null) {
        throw new Error(state.error)
      }
      //
      const { head, updated, vmid } = state
      // Create a signed receipt for the latest commit.
      const vm_receipt = create_vm_receipt(head, server_sd, vmid, witness.wid, updated)
      // Verify the latest commit matches the receipt.
      verify_vm_receipt(head, vm_receipt, server_pk, vmid, witness.wid)

      if (VERBOSE) {
        console.log(banner('vm receipt'))
        console.dir(state, { depth : null })
      }

      /* ------------------- [ Settle Contract ] ------------------- */

      state = VM.run(state, now() + 8000)

      assert.exists(state.output)

      const txdata = settle_contract(ct_active, [ deposit ], state.output, server_sd)

      // verify_settlement(ct_active, [ witness ], txdata)

      if (VERBOSE) {
        console.log(banner('closing tx'))
        console.dir(txdata, { depth : null })
      }

      const settlement_txid = await client.publish_tx(txdata, true)

      if (VERBOSE) {
        console.log(banner('txid'))
        console.log(settlement_txid)
        console.log('\n' + '='.repeat(80) + '\n')
      }

      t.true(typeof settlement_txid === 'string', 'E2E test passed with txid: ' + settlement_txid)
    } catch (err) {
      const { message } = err as Error
      console.log(err)
      t.fail(message)
    }
  })
}
