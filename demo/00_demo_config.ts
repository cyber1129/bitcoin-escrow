import { Network }           from '@scrow/sdk'
import { get_server_config } from '@scrow/test'

const faucets = {
  mutiny  : 'https://faucet.mutinynet.com',
  regtest : 'none',
  signet  : 'https://signet.bc-2.jp',
  testnet : 'https://bitcoinfaucet.uo1.net'
}

const returns = {
  mutiny  : 'tb1qd28npep0s8frcm3y7dxqajkcy2m40eysplyr9v',
  regtest : 'bcrt1p6zxjm3wcugjxkn339etgmnytaeflzlzuruved30z3hk963jzfz5q5y0z7e',
  signet  : 'tb1q5tsjcyz7xmet07yxtumakt739y53hcttmntajq',
  testnet : 'tb1q5tsjcyz7xmet07yxtumakt739y53hcttmntajq'
}

const poll_rates = {
  mutiny  : [ 10, 6  ],
  regtest : [ 10, 6  ],
  signet  : [ 60, 30 ],
  testnet : [ 60, 30 ]
}

const feerate  = 2
const locktime = 172800
const network  = process.env.NETWORK ?? 'mutiny'
const client   = get_server_config(network as Network)

export const config = {
  client,
  feerate,
  locktime,
  network,
  faucet      : faucets[network as keyof typeof faucets],
  members     : [ 'alice', 'bob', 'carol' ],
  poll        : poll_rates[network as keyof typeof poll_rates],
  return_addr : returns[network as keyof typeof returns]
}
