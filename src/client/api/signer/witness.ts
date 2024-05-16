import { verify_witness_data } from '@/core/validation/witness.js'
import { EscrowSigner }        from '../../class/signer.js'

import {
  can_endorse,
  create_witness,
  endorse_witness
} from '@/core/module/witness/api.js'

import {
  ContractData,
  MachineConfig,
  VMData,
  WitnessData,
  WitnessReceipt,
  WitnessTemplate
} from '@/core/types/index.js'

export function can_sign_api (esigner : EscrowSigner) {
  return (
    contract : ContractData,
    witness  : WitnessData
  ) => {
    const programs = contract.terms.programs
    return can_endorse(programs, esigner._signer, witness)
  }
}

export function create_witness_api (esigner : EscrowSigner) {
  return (
    vmdata   : MachineConfig | VMData,
    template : WitnessTemplate
  ) => {
    // esigner.check_issuer(vmdata.server_pk)
    const pubkey   = esigner._signer.pubkey
    const witness  = create_witness(vmdata, pubkey, template)
    return endorse_witness(esigner._signer, witness)
  }
}

export function endorse_witness_api (esigner : EscrowSigner) {
  return (
    vmdata  : VMData,
    witness : WitnessData
  ) => {
    verify_witness_data(vmdata, witness)
    return endorse_witness(esigner._signer, witness)
  }
}

export function list_machines_api (esigner : EscrowSigner) {
  return () => {
    const pub  = esigner.pubkey
    const host = esigner.server_url
    const url  = `${host}/api/vm/list?pk=${pub}`
    const content = 'GET' + url
    return esigner._signer.gen_token(content)
  }
}

export function verify_receipt_api (_esigner : EscrowSigner) {
  return (
    _witness : WitnessData,
    _receipt : WitnessReceipt
  ) => {
    console.log('not implemented yet')
    return null
  }
}

export default function (esigner : EscrowSigner) {
  return {
    can_sign : can_sign_api(esigner),
    create   : create_witness_api(esigner),
    endorse  : endorse_witness_api(esigner),
    list     : list_machines_api(esigner),
    verify   : verify_receipt_api(esigner)
  }
}
