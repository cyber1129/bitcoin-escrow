import { Buff }                 from '@cmdcode/buff'
import { decode_tx, encode_tx } from '@scrow/tapscript/tx'
import { verify_sig }           from '@cmdcode/crypto-tools/signer'
import { assert, sort_record }  from '@/core/util/index.js'
import { get_contract_state }   from './state.js'

import { CONTRACT_KIND, SPEND_TXIN_SIZE } from '@/core/const.js'

import {
  get_proof_id,
  parse_proof,
  update_proof
} from '@/core/util/notarize.js'

import {
  ContractData,
  ContractStatus,
  DepositData,
  FundingData,
  NoteTemplate,
  PaymentEntry,
  ProofEntry,
  ProposalData,
  SignerAPI,
  SpendTemplate
} from '../../types/index.js'

import {
  get_covenant_psig,
  settle_covenant
} from '../../lib/covenant.js'

import {
  get_path_names,
  get_path_vouts
} from '../../lib/proposal.js'

import {
  create_txinput,
  get_vout_txhex
} from '../../lib/tx.js'

/**
 * Compute the record identifier for a contract.
 */
export function get_contract_id (
  outputs  : SpendTemplate[],
  prop_id  : string,
  stamp    : number
) {
  const hash = Buff.hex(prop_id)
  const stmp = Buff.num(stamp, 4)
  const thex = outputs
    .map(e => e[1])
    .sort()
    .map(e => Buff.hex(e))
  return Buff.join([ hash, stmp, ...thex ]).digest.hex
}

/**
 * Returns a relative deadline (in seconds)
 * for receiving deposits.
 */
export function get_deadline (
  proposal  : ProposalData,
  published : number
) {
  // Unpack the proposal object.
  const { deadline, effective } = proposal
  // If an effective date is set:
  if (effective !== undefined) {
    // Return remaining time until effective date.
    return effective - published
  } else {
    // Return published date, plus deadline.
    return published + deadline
  }
}

/**
 * Get the size (in bytes) of the largest tx template.
 */
export function get_max_vout_size (
  outputs : SpendTemplate[]
) {
  const tx_lens = outputs.map(e => e[1].length)
  return Math.max(...tx_lens) / 2
}

/**
 * Convert each spending path in the proposal
 * into a transaction output template.
 */
export function create_spend_templates (
  proposal : ProposalData,
  fees     : PaymentEntry[]
) : SpendTemplate[] {
  // Unpack proposal object.
  const { payments, paths } = proposal
  // Collect and sort path names.
  const pathnames = get_path_names(paths)
  // Collect payments.
  const pay_total = [ ...payments, ...fees ]
  // Return labeled array of spend templates.
  return pathnames.map(pathname => {
    // Get a list of tx outputs.
    const vout  = get_path_vouts(pathname, paths, pay_total)
    // Combine the outputs into a tx template (hex).
    const txhex = get_vout_txhex(vout)
    // Return the txhex as an array entry.
    return [ pathname, txhex ]
  })
}

export function get_spend_template (
  label     : string,
  templates : SpendTemplate[]
) {
  const tmpl = templates.find(e => e[0] === label)

  if (tmpl === undefined) {
    throw new Error('spend template found for label: ' + label)
  }

  return tmpl[1]
}

export function get_settlement_tx (
  contract  : ContractData,
  deposits  : DepositData[],
  signer    : SignerAPI
) : string {
  assert.ok(contract.closed)
  assert.exists(contract.engine_vout)
  const vout   = contract.engine_vout
  const output = get_spend_template(vout, contract.outputs)
  const txdata = decode_tx(output, false)
  for (const deposit of deposits) {
    assert.exists(deposit.covenant)
    const vin  = create_txinput(deposit.utxo)
    const psig = get_covenant_psig(vout, deposit.covenant)
    const sig  = settle_covenant(contract, deposit, output, psig, signer)
    txdata.vin.push({ ...vin, witness: [ sig ] })
  }
  return encode_tx(txdata).hex
}

export function tabulate_funds (
  contract : ContractData,
  funds    : FundingData[]
) {
  const { feerate, outputs, subtotal, vin_txfee } = contract
  const base_size  = get_max_vout_size(outputs)
  const base_fee   = base_size * feerate
  const confirmed  = funds.filter(e => e.confirmed)
  const vin_count  = confirmed.length
  const fund_value = confirmed.reduce((val, fund) => val + fund.utxo.value, 0)

  const tx_txin_size  = SPEND_TXIN_SIZE * vin_count
  const tx_txin_fee   = tx_txin_size * feerate
  const tx_total_size = base_fee  + tx_txin_fee
  const tx_total_fee  = base_size + tx_txin_size

  const tx_fees    = base_fee  + (vin_count * vin_txfee)
  const tx_vsize   = base_size + (vin_count * SPEND_TXIN_SIZE)
  const tx_total   = subtotal  + tx_fees
  const sats_vbyte = Math.floor(tx_total_size / tx_total_fee)

  return { vin_count, fund_value, sats_vbyte, tx_fees, tx_vsize, tx_total }
}

export function get_contract_value (contract : ContractData) {
  const { feerate, subtotal, tx_bsize } = contract
  return subtotal + (feerate * tx_bsize)
}

export function get_contract_balance (contract : ContractData) {
  const { funds_conf, vin_count, vin_txfee } = contract
  const total_value = (vin_count * vin_txfee) - funds_conf
  return get_contract_value(contract) + total_value
}

export function get_contract_preimg (
  contract : ContractData,
  status   : ContractStatus
) : NoteTemplate {
  const { cid, server_pk: pubkey } = contract
  const { content, created_at }    = get_contract_state(contract, status)
  const kind  = CONTRACT_KIND
  const tags  = [ [ 'i', cid ] ]
  return { content, created_at, kind, pubkey, tags }
}

export function get_contract_note (
  contract : ContractData,
  status   : ContractStatus
) {
  const tmpl  = get_contract_preimg(contract, status)
  const proof = contract.sigs.find(e => e[0] === status)
  assert.exists(proof, 'signature no found for status: ' + status)
  const id  = proof[1].slice(0, 64)
  const sig = proof[1].slice(64)
  return { ...tmpl, id, sig }
}

export function notarize_contract (
  contract : ContractData,
  signer   : SignerAPI,
  status   : ContractStatus
) : ProofEntry<ContractStatus> {
  const img = get_contract_preimg(contract, status)
  const dig = get_proof_id(img)
  const sig = signer.sign(dig)
  return [ contract.status, Buff.join([ dig, sig ]).hex ]
}

export function update_contract (
  contract : ContractData,
  signer   : SignerAPI,
  status   : ContractStatus
) {
  const proof   = notarize_contract(contract, signer, status)
  contract.sigs = update_proof(contract.sigs, proof)
  return sort_record(contract)
}

export function verify_contract_sig (
  contract  : ContractData,
  pubkey    : string,
  signature : ProofEntry<ContractStatus>
) {
  const [ status, proof ] = signature
  const [ id, sig ]       = parse_proof(proof)
  const pub = contract.server_pk
  const img = get_contract_preimg(contract, status)
  const dig = get_proof_id(img)
  assert.ok(pubkey === pub,           'pubkey does not match: ' + status)
  assert.ok(dig === id,               'digest does not match: ' + status)
  assert.ok(verify_sig(sig, id, pub), 'invalid signature: '     + status)
}