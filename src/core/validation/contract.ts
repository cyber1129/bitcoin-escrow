/* Global Imports */

import {
  decode_tx,
  encode_tx
} from '@scrow/tapscript/tx'

/* Module Imports */

import { assert } from '../util/index.js'

import {
  get_proposal_id,
  verify_endorsement
} from '../lib/proposal.js'

import {
  create_txinput,
  get_txid
} from '../lib/tx.js'

import {
  create_spend_templates,
  get_contract_id,
  get_spend_template,
  tabulate_funds,
  verify_contract_sig
} from '../module/contract/util.js'

import {
  ContractData,
  ContractRequest,
  FundingData,
  ProposalData,
  ServerPolicy,
  VMData,
  ScriptEngineAPI
} from '../types/index.js'

import ContractSchema from '../schema/contract.js'

/* Local Imports */

import {
  validate_proposal_data,
  verify_proposal_data
} from './proposal.js'

export function validate_publish_req (
  contract : unknown
) : asserts contract is ContractData {
  void ContractSchema.publish_req.parse(contract)
}

export function validate_contract_data (
  contract : unknown
) : asserts contract is ContractData {
  void ContractSchema.data.parse(contract)
}

export function verify_contract_req (
  machine : ScriptEngineAPI,
  policy  : ServerPolicy,
  request : ContractRequest
) {
  const { endorsements, proposal } = request
  validate_proposal_data(proposal)
  verify_proposal_data(machine, policy, proposal)
  verify_endorsements(proposal, endorsements)
}

export function verify_endorsements (
  proposal   : ProposalData,
  signatures : string[] = []
) {
  // List all pubkeys in proposal.
  const prop_id = get_proposal_id(proposal)
  for (const sig of signatures) {
    const pub = sig.slice(0, 64)
    const is_valid = verify_endorsement(prop_id, sig)
    assert.ok(is_valid, 'signature is invalid for pubkey: ' + pub)
  }
}

export function verify_contract_data (contract : ContractData) {
  const { created_at, outputs, terms } = contract
  const pid = get_proposal_id(terms)
  const cid = get_contract_id(outputs, pid, created_at)
  assert.ok(pid === contract.prop_id, 'computed terms id does not match contract')
  assert.ok(cid === contract.cid,     'computed cid id does not match contract')
  for (const [ label, txhex ] of outputs) {
    const tmpl = contract.outputs.find(e => e[0] === label)
    assert.ok(tmpl !== undefined,     'output template does not exist for label: ' + label)
    assert.ok(tmpl[1] === txhex,      'tx hex does not match output for label: ' + label)
  }
}

export function verify_contract_sigs (
  contract : ContractData,
  pubkey   : string
) {
  const labels = contract.sigs.map(e => e[0])

  assert.ok(labels.includes('published'),                       'contract signature missing: published')
  assert.ok(!contract.canceled  || labels.includes('canceled'), 'contract signature missing: canceled')
  assert.ok(!contract.activated || labels.includes('active'),   'contract signature missing: active')
  assert.ok(!contract.closed    || labels.includes('closed'),   'contract signature missing: closed')
  assert.ok(!contract.spent     || labels.includes('spent'),    'contract signature missing: spent')
  assert.ok(!contract.settled   || labels.includes('settled'),  'contract signature missing: settled')

  contract.sigs.forEach(sig => {
    verify_contract_sig(contract, pubkey, sig)
  })
}

export function verify_contract_publishing (
  contract  : ContractData,
  proposal  : ProposalData
) {
  const { created_at, fees } = contract
  const out = create_spend_templates(proposal, fees)
  const pid = get_proposal_id(proposal)
  const cid = get_contract_id(out, pid, created_at)
  assert.ok(pid === contract.prop_id, 'computed proposal id does not match contract')
  assert.ok(cid === contract.cid,     'computed contract id id does not match contract')
  for (const [ label, txhex ] of out) {
    const tmpl = contract.outputs.find(e => e[0] === label)
    assert.ok(tmpl !== undefined,     'output template does not exist for label: ' + label)
    assert.ok(tmpl[1] === txhex,      'tx hex does not match output for label: ' + label)
  }
}

export function verify_contract_funding (
  contract : ContractData,
  funds    : FundingData[]
) {
  const { fund_count, fund_pend, fund_value, tx_fees, tx_total, tx_vsize } = contract
  const tab    = tabulate_funds(contract, funds)
  const vtotal = fund_pend + fund_value
  assert.ok(fund_count === tab.fund_count, 'tabulated funds count does not match contract')
  assert.ok(vtotal     === tab.fund_value, 'tabulated funds value does not match contract')
  assert.ok(tx_fees    === tab.tx_fees,    'tabulated tx fees does not match contract')
  assert.ok(tx_total   === tab.tx_total,   'tabulated tx total does not match contract')
  assert.ok(tx_vsize   === tab.tx_vsize,   'tabulated tx size does not match contract')
}

export function verify_contract_activation (
  contract : ContractData,
  vmstate  : VMData
) {
  const { activated, active_at, canceled, expires_at, engine_vmid } = contract
  assert.ok(!canceled,                       'contract is flagged as canceled')
  assert.ok(activated,                       'contract is not flagged as active')
  assert.ok(active_at === vmstate.active_at, 'contract activated date does not match vm')
  assert.ok(engine_vmid === vmstate.vmid,    'contract vmid does not match vm internal id')
  const expires_chk = active_at + contract.terms.duration
  assert.ok(expires_at === expires_chk,      'computed expiration date does not match contract')
}

export function verify_contract_close (
  contract : ContractData,
  vmstate  : VMData
) {
  assert.ok(vmstate.closed,  'vm state is not closed')
  assert.ok(contract.closed, 'contract is not closed')
  assert.ok(vmstate.closed_at === contract.closed_at,   'contract closed_at does not match vm result')
  assert.ok(vmstate.head      === contract.engine_head, 'contract active_head does not match vm result')
  assert.ok(vmstate.output    === contract.engine_vout, 'contract closed_path does not match vm result')
}

export function verify_contract_spending (
  contract   : ContractData,
  funds      : FundingData[],
  vmstate    : VMData
) {
  assert.ok(contract.closed,         'contract is not closed')
  assert.ok(contract.spent,          'contract is not settled')
  assert.ok(vmstate.output !== null, 'vmstate is not closed')
  // Get the spend template for the provided output.
  const output = get_spend_template(vmstate.output, contract.outputs)
  // Convert the output into a txdata object.
  const txdata = decode_tx(output, false)
  // Collect utxos from funds.
  const utxos = funds.map(e => e.utxo)
  // Add each utxo to the txdata object.
  for (const utxo of utxos) {
    const vin = create_txinput(utxo)
    txdata.vin.push(vin)
  }
  // Encode the new tx as a segwit transaction.
  const txhex = encode_tx(txdata)
  // Compute the final transaction id.
  const txid  = get_txid(txhex)
  // Assert that the transaction id matches.
  assert.ok(txid === contract.spent_txid, 'spent txid does not match contract')
}

export function verify_contract_settlement (
  contract   : ContractData,
  funds      : FundingData[],
  proposal   : ProposalData,
  vmstate    : VMData
) {
  verify_contract_data(contract)
  verify_contract_publishing(contract, proposal)
  verify_contract_funding(contract, funds)
  verify_contract_activation(contract, vmstate)
  verify_contract_close(contract, vmstate)
  verify_contract_spending(contract, funds, vmstate)
}

export default {
  validate : {
    request : validate_publish_req,
    data    : validate_contract_data
  },
  verify : {
    request    : verify_contract_req,
    data       : verify_contract_data,
    publish    : verify_contract_publishing,
    funding    : verify_contract_funding,
    activation : verify_contract_activation,
    closing    : verify_contract_close,
    spending   : verify_contract_spending,
    settlement : verify_contract_settlement,
    signatures : verify_contract_sigs
  }
}
