import { Buff }   from '@cmdcode/buff'
import { assert } from '@/core/util/index.js'

import {
  create_proposal,
  endorse_proposal,
  get_path_total,
  get_pay_total
} from '@/core/lib/proposal.js'

import {
  ContractRequest,
  SignerAPI
} from '@/core/types/index.js'

import {
  DraftSession,
  CredentialData,
  DraftTemplate
} from '../types.js'

import ClientSchema from '../schema.js'

import {
  claim_membership,
  clear_signatures,
  get_signatures,
  has_membership,
  update_membership
} from './membership.js'

import {
  add_member_data,
  create_role_policy,
  get_role_paths_totals,
  get_role_payment_totals,
  get_role_policy,
  has_open_roles,
  rem_member_data,
  verify_member_data
} from './enrollment.js'

export function create_session (
  template : DraftTemplate
) : DraftSession {
  const { proposal, roles } = template
  return {
    members  : [],
    proposal : create_proposal(proposal),
    roles    : roles.map(e => create_role_policy(e))
  }
}

export function join_session (
  cred      : CredentialData,
  policy_id : string,
  session   : DraftSession
) : DraftSession {
  // Check if member already exists.
  assert.ok(!has_membership(cred, session), 'membership already exists')
  // Check if role is available.
  assert.ok(has_open_roles(policy_id, session), 'all slots are filled for policy id: ' + policy_id)
  const members  = [ ...session.members, { ...cred, pid: policy_id } ]
  //
  const policy   = get_role_policy(policy_id, session)
  // Add member to proposal.
  const proposal = add_member_data(cred, policy, session.proposal)
  //
  return ClientSchema.session.parse({ ...session, members, proposal })
}

export function leave_session (
  cred    : CredentialData,
  session : DraftSession
) : DraftSession {
  //
  const members  = session.members.filter(e => e.pub !== cred.pub)
  // Add member to proposal.
  const proposal = rem_member_data(cred, session.proposal)
  //
  return ClientSchema.session.parse({ ...session, members, proposal })
}

export function reset_session (session : DraftSession) {
  const members = clear_signatures(session.members)
  return ClientSchema.session.parse({ ...session, members })
}

export function endorse_session (
  session : DraftSession,
  signer  : SignerAPI
) : DraftSession {
  const mship = claim_membership(session.members, signer)
  assert.ok(mship !== null, 'signer is not a member of the session')
  const sig     = endorse_proposal(session.proposal, signer)
  const members = update_membership(session.members, { ...mship, sig })
  return ClientSchema.session.parse({ ...session, members })
}

export function tabualte_session (session : DraftSession) {
  const { paths, payments } = session.proposal
  const prop_path_tabs  = get_path_total(paths)
  const prop_path_total = prop_path_tabs.reduce((p, c) => p + c[1], 0)
  const prop_pay_total  = get_pay_total(payments)
  const role_path_tabs  = get_role_paths_totals(session.roles)
  const role_path_total = role_path_tabs.reduce((p, c) => p + c[1], 0)
  const role_pay_total  = get_role_payment_totals(session.roles)
  const path_map        = new Map(role_path_tabs)
  const path_total      = prop_path_total + role_path_total
  const pay_total       = prop_pay_total + role_pay_total

  prop_path_tabs.forEach(([ path, value ]) => {
    const curr = path_map.get(path) ?? 0
    path_map.set(path, curr + value)
  })

  const path_values = [ ...path_map.values() ]
  const max_value   = path_values
    .sort((a, b) => a - b)
    .pop() ?? 0

  return {
    max_value,
    path_total,
    pay_total,
    total_value : path_total + pay_total,
    path_tabs   : [ ...path_map.entries() ],
    proposal    : {
      path_tabs  : prop_path_tabs,
      path_total : prop_path_total,
      pay_total  : prop_pay_total
    },
    roles : {
      path_tabs  : [ ...role_path_tabs.entries() ],
      path_total : role_path_total,
      pay_total  : role_pay_total
    }
  }
}

export function verify_session (
  session : DraftSession
) {
  const { members, proposal, roles } = session
  members.forEach(mbr => {
    const pol = roles.find(e => e.id === mbr.pid)
    assert.exists(pol, 'policy does not exist for member: ' + mbr.pub)
    verify_member_data(mbr, proposal, pol)
  })
}

export function publish_session (
  session : DraftSession
) : ContractRequest {
  const { proposal } = session
  const signatures = get_signatures(session.members)
  return { proposal, signatures }
}

export function encode_session (session : DraftSession) {
  const json = JSON.stringify(session)
  return Buff.str(json).b64url
}

export function decode_session (session_str : string) : DraftSession {
  const json = Buff.b64url(session_str).str
  const data = JSON.parse(json)
  return ClientSchema.session.parse(data)
}

export const DraftUtil = {
  create   : create_session,
  decode   : decode_session,
  encode   : encode_session,
  endorse  : endorse_session,
  join     : join_session,
  leave    : leave_session,
  publish  : publish_session,
  reset    : reset_session,
  tabulate : tabualte_session,
  verify   : verify_session
}
