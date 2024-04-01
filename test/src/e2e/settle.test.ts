/* Global Imports */

import { Test }       from 'tape'
import { CoreClient } from '@cmdcode/core-cmd'
import { P2TR }       from '@scrow/tapscript/address'

/* Package Imports */

import { endorse_proposal } from '@scrow/sdk/proposal'
import { assert, now }      from '@scrow/sdk/util'
import { VirtualMachine }   from '@scrow/sdk/cvm'

import {
  DepositData,
  PaymentEntry,
  TxOutput
} from '@scrow/sdk/core'

import {
  create_account,
  create_account_req,
} from '@scrow/sdk/account'

import {
  create_contract_req,
  create_contract,
  activate_contract,
  settle_contract,
  get_settlement_tx,
  fund_contract
} from '@scrow/sdk/contract'

import {
  create_commit_req,
  create_deposit
} from '@scrow/sdk/deposit'

import {
  verify_account_req,
  verify_account,
  verify_contract_req,
  verify_deposit,
  verify_settlement,
  verify_witness,
  verify_commit_req,
  verify_proposal,
  verify_publishing,
  verify_receipt
} from '@scrow/sdk/verify'

import { create_receipt, get_vm_config } from '@scrow/sdk/vm'

import {
  create_witness,
  endorse_witness
} from '@scrow/sdk/witness'

/* Local Imports */

import {
  fund_address,
  get_members,
  get_utxo
} from '../core.js'

import { get_proposal } from './util.js'

import ServerPolicy from '../config/policy.json' assert { type: 'json' }

const VERBOSE = process.env.VERBOSE === 'true'

const FEERATE  = 1
const LOCKTIME = 172800
const NETWORK  = 'regtest'

export default async function (
  client  : CoreClient,
  tape    : Test
) {
  tape.test('E2E Settlement Test', async t => {
    try {

      /* ------------------- [ Init ] ------------------- */

      const banner   = (title : string) => `\n\n=== [ ${title} ] ===`.padEnd(80, '=') + '\n\n'
      const aliases  = [ 'agent', 'alice', 'bob', 'carol' ]
      const fee_addr = await client.core.faucet.get_address('faucet')
      const users    = await get_members(client, aliases)

      const [ server, ...members ] = users

      const funders   = [ members[0], members[1] ]

      const fees      = [[ 1000, fee_addr ]] as PaymentEntry[]
      const ct_config = { fees, feerate: FEERATE }

      const funder_sd  = members[0].signer
      const server_sd  = server.signer
      const server_pol = ServerPolicy

      /* ------------------- [ Create Proposal ] ------------------- */

      // Construct a proposal from the template.

      const proposal   = await get_proposal(members)
      // Verify the proposal
      verify_proposal(VirtualMachine, server_pol, proposal)
      // Have each member endorse the proposal.
      const signatures = members.map(e => endorse_proposal(proposal, e.signer))

      if (VERBOSE) {
        console.log(banner('proposal'))
        console.dir(proposal, { depth : null })
      } else {
        t.pass('proposal ok')
      }

      /* ------------------- [ Create Contract ] ------------------- */

      // Client: Create a contract request.
      const pub_req  = create_contract_req(proposal, signatures)
      // Server: Verify contract request.
      verify_contract_req(VirtualMachine, server_pol, pub_req)
      // Server: Create contract data.
      let contract = create_contract(ct_config, server_pol, pub_req, server_sd)
      // Client: Verify contract data.
      verify_publishing(contract, proposal)
      
      if (VERBOSE) {
        console.log(banner('published contract'))
        console.dir({ ...contract }, { depth : null })
      } else {
        t.pass('contract ok')
      }

      let deposits : DepositData[] = [],
          utxos    : TxOutput[]    = []

      for (const funder of funders) {

        /* ------------------- [ Create Accounts ] ------------------ */

        //
        const return_addr = P2TR.create(funder_sd.pubkey, NETWORK)
        // Client: Create account request.
        const acct_req = create_account_req(funder_sd.pubkey, LOCKTIME, NETWORK, return_addr)
        // Server: Verify account request.
        verify_account_req(server_pol, acct_req)
        // Server: Create account data.
        const account = create_account(acct_req, server_sd)
        // Client: Verify account data.
        verify_account(account, funder_sd)
        // Return account and signer as tuple.


        if (VERBOSE) {
          console.log(banner('account'))
          console.dir(account, { depth : null })
        } else {
          t.pass('account ok')
        }

        /* ------------------- [ Create Deposits ] ------------------- */

        // Calculate the funding amount required for the contract.
        const fund_amt = (Math.ceil(contract.tx_total / 2)) + contract.fund_txfee
        // Fund deposit address and get txid.
        const dep_txid = await fund_address(client, 'faucet', account.deposit_addr, fund_amt, false)
        // Fetch the utxo for the funded address.
        const utxo = await get_utxo(client, account.deposit_addr, dep_txid)
        // Add utxo to array.
        utxos.push(utxo)
        // Client: Create the commit request.
        const commit_req = create_commit_req(FEERATE, contract, account, funder_sd, utxo)
        // Server: Verify the registration request.
        verify_commit_req(contract, server_pol, commit_req, server_sd)
        // Server: Create the deposit data.
        const deposit = create_deposit({}, commit_req, server_sd)
        // Client: Verify the deposit data.
        verify_deposit(deposit, funder_sd)
        // Deposit funds into contract.
        contract = fund_contract(contract, deposit)
        // Add deposit to array.
        deposits.push(deposit)

        if (VERBOSE) {
          console.log(banner(`${funder.alias} deposit`))
          console.dir(deposit, { depth : null })
        }
      }

      await client.mine_blocks(1)

      if (VERBOSE) {
        console.log(banner('funded contract'))
        console.dir({ ...contract }, { depth : null })
      } else {
        t.pass('deposit ok')
      }

      /* ------------------ [ Activate Contract ] ------------------ */

      contract = activate_contract(contract)

      const vm_config = get_vm_config(contract)
      let   vm_state  = VirtualMachine.init(vm_config)

      if (VERBOSE) {
        console.log(banner('active contract'))
        console.dir({ ...contract }, { depth : null })
        console.log(banner('vm state'))
        console.dir(vm_state, { depth : null })
      } else {
        t.pass('activation ok')
      }

      /* ------------------- [ Submit Statements ] ------------------- */

      const signers = [
        members[0].signer.pubkey,
        members[1].signer.pubkey
      ]

      const config = {
        action : 'close',
        method : 'endorse',
        path   : 'payout',
      }

      let witness = create_witness(proposal.programs, signers, config)
          witness = endorse_witness(members[0].signer, witness)
          witness = endorse_witness(members[1].signer, witness)

      verify_witness(contract, witness)

      if (VERBOSE) {
        console.log(banner('witness'))
        console.dir(witness, { depth : null })
      } else {
        t.pass('witness ok')
      }

      vm_state = VirtualMachine.eval(vm_state, witness)

      if (vm_state.error !== null) {
        throw new Error(vm_state.error)
      }

      // Create a signed receipt for the latest commit.
      const vm_receipt = create_receipt(vm_state, server_sd)
      // Verify the latest commit matches the receipt.
      verify_receipt(vm_receipt, vm_state)

      if (VERBOSE) {
        console.log(banner('settled contract'))
        console.dir({ ...contract }, { depth : null })
        console.log(banner('vm receipt'))
        console.dir(vm_receipt, { depth : null })
      } else {
        t.pass('execution ok')
      }

      /* ------------------- [ Settle Contract ] ------------------- */

      const settled_at = now() + 8000

      vm_state = VirtualMachine.run(vm_state, settled_at)

      assert.exists(vm_state.output)

      const txdata = get_settlement_tx(contract, deposits, vm_state.output, server_sd)
      const txid   = await client.publish_tx(txdata, true)

      contract = settle_contract(contract, vm_state.updated, txid)

      verify_settlement(contract, deposits, vm_state)

      if (VERBOSE) {
        console.log(banner('closing tx'))
        console.dir(txdata, { depth : null })
      } else {
        t.pass('settlement ok')
      }

      t.pass('completed with txid: ' + txid)
    } catch (err) {
      const { message } = err as Error
      console.log(err)
      t.fail(message)
    }
  })
}
