import { ProgramTerms } from './proposal.js'

export interface MemberData {
  id   : string
  pub  : string
  pol ?: string
  sig  : string
  xpub : string
}

export interface RolePolicy {
  label     : string
  limit    ?: number
  paths    ?: [ string, number ][]
  payment  ?: number
  programs ?: ProgramTerms[]
}