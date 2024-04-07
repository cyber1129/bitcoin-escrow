import { verify_witness }  from '@/core/validation/witness.js'
import { EscrowSigner }    from '../../class/signer.js'

import {
  can_endorse,
  create_witness,
  endorse_witness
} from '@/core/lib/witness.js'

import {
  ContractData,
  VMConfig,
  VMData,
  WitnessData,
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
    vmdata   : VMConfig | VMData,
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
    // esigner.check_issuer(vmdata.server_pk)
    verify_witness(vmdata, witness)
    return endorse_witness(esigner._signer, witness)
  }
}

export default function (esigner : EscrowSigner) {
  return {
    can_sign : can_sign_api(esigner),
    create   : create_witness_api(esigner),
    endorse  : endorse_witness_api(esigner)
  }
}
