import { ProposalTemplate } from '@scrow/sdk/core'
import { RoleTemplate }     from '@scrow/sdk/client'
import { now }              from '@scrow/sdk/util'

import { config }  from './00_demo_config.js'
import { signers } from './02_create_signer.js'

/**
 * We can specify one of our signers to be a moderator.
 * 
 * Moderators have a limited ability to manage or cancel
 * a contract during the funding stage. 
 */
export const moderator = signers[2]

/**
 * Define our proposal template.
 */
export const proposal : ProposalTemplate = {
  title      : 'Basic two-party contract with third-party arbitration.',
  created_at : now(),
  duration   : 14400,
  feerate    : 1,
  moderator  : moderator.pubkey,
  network    : config.network,
  schedule   : [[ 7200, 'spend|resolve', 'payout|refund' ]],
  value      : 10000
}

/**
 * Define our role templates.
 */
export const roles : RoleTemplate[] = [
  {
    title : 'buyer',
    paths : [[ 'refund', 10000 ],],
    programs : [
      [ 'endorse', 'spend|close', '*', 2 ],
      [ 'endorse', 'dispute', 'payout', 1  ]
    ]
  },
  {
    title : 'seller',
    paths : [[ 'payout', 10000 ]],
    programs : [
      [ 'endorse', 'spend|close', '*', 2   ],
      [ 'endorse', 'dispute', 'refund', 1  ]
    ]
  },
  {
    title : 'agent',
    programs : [
      [ 'endorse', 'resolve', '*', 1 ]
    ]
  }
]
