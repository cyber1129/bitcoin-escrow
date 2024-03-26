import { Buff }          from '@cmdcode/buff'
import { parse_addr }    from '@scrow/tapscript/address'
import { create_vout }   from '@scrow/tapscript/tx'
import { TxOutput }      from '@scrow/tapscript'

import { get_object_id, now } from '@/util.js'

import { parse_proposal } from './parse.js'

import {
  PaymentEntry,
  PathEntry,
  ProposalData,
  SignerAPI,
  ProposalTemplate
} from '../types/index.js'

type PathTotal = [ path: string, total : number ]

const GET_DEFAULT_PROP = () => {
  return {
    content    : '',
    created_at : now(),
    network    : 'signet',
    members    : [],
    paths      : [],
    payments   : [],
    programs   : [],
    schedule   : [],
    version    : 1
  }
}

export function create_proposal (template : ProposalTemplate) {
  return parse_proposal({ ...GET_DEFAULT_PROP(), ...template })
}

/**
 * Returns an array of payment paths
 * that is filtered by a given label.
 */
export function filter_path (
  label : string,
  paths : PathEntry[]
) : PathEntry[] {
  // Return a filtered list of paths by label.
  return paths.filter(e => e[0] === label)
}

/**
 * Returns an array of unique path names
 * from an array of payment paths.
 */
export function get_path_names (
  paths : PathEntry[]
) : string[] {
  // Collect a unique set of pathnames
  const pnames = new Set(paths.map(e => e[0]))
  // Return pathnames as a sorted list.
  return [ ...pnames ].sort()
}

/**
 * Returns the total value
 * from an array of payments.
 */
export function get_pay_total (
  payments : PaymentEntry[]
) : number {
  // Return the value total of all payments.
  return payments.map(e => e[0]).reduce((acc, curr) => acc + curr, 0)
}

/**
 * Returns an array of unique addresses
 * from an array of payment paths.
 */
export function get_addrs (
  paths : PathEntry[]
) : string[] {
  // Collect a set of unique addresses.
  const addrs = new Set(paths.map(e => e[2]))
  // Return the set as an array.
  return [ ...addrs ]
}

/**
 * Returns an array of transaction outputs from
 * an array of payment paths and array of payments.
 */
export function get_path_vouts (
  label    : string,
  paths    : PathEntry[]    = [],
  payments : PaymentEntry[] = []
) : TxOutput[] {
  // Filter paths based on their label.
  const filtered : PaymentEntry[] = filter_path(label, paths).map(e => [ e[1], e[2] ])
  // Collect a sorted list of selected paths and payments.
  const template : PaymentEntry[] = [ ...filtered.sort(), ...payments.sort() ]
  // Return a list of tx outputs.
  return template.map(([ value, addr ]) => {
    // Parse the scriptkey from the address.
    const scriptPubKey = parse_addr(addr).asm
    // Create a tx output object.
    return create_vout({ value, scriptPubKey })
  })
}

/**
 * Returns an array of labeled totals, one
 * for each unique payment path.
 */
export function get_path_total (
  paths : PathEntry[]
) : PathTotal[] {
  // Setup an array for out totals.
  const path_totals : PathTotal[] = []
  // Collect a set of unique path names.
  const path_names = get_path_names(paths)
  // For each unique name in the set:
  for (const label of path_names) {
    // Collect all values for that path.
    const val = filter_path(label, paths).map(e => e[1])
    // Reduce the values into a total amount.
    const amt = val.reduce((acc, curr) => acc + curr, 0)
    // Add the total to the array.
    path_totals.push([ label, amt ])
  }
  return path_totals
}

export function get_proposal_id (
  proposal : ProposalData
) {
  // Return object id of proposal.
  return get_object_id(proposal).hex
}

export function endorse_proposal (
  proposal : ProposalData,
  signer   : SignerAPI
) : string {
  const msg  = get_proposal_id(proposal)
  const pub  = signer.pubkey
  const sig  = signer.sign(msg)
  return Buff.join([ pub, sig ]).hex
}