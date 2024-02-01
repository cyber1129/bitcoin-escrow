# Server API

Reference guide for the BitEscrow Server API.

> Click on the links below to navigate:

- [/api/server/keys](#get-server-keys)
- [/api/server/policy](#get-server-policy)
- [/api/server/status](#get-server-status)

## Get Server Keys

Fetch a list of the latest BitEscrow signing pubkeys in rotaion.

**Request Format**

```ts
method   : 'GET'
endpoint : '/api/keys'
```

**Response Interface**

```ts
interface ServerKeyResponse {
  data : {
    pubkeys : string[]
  }
}
```

## Get Server Policy

Fetch the policy and terms configuration of the escrow server.

Related interfaces:

- [ServerPolicy](../interfaces/server.md#serverpolicy)

**Request Format**

```ts
method   : 'GET'
endpoint : '/api/policy'
```

**Response Interface**

```ts
interface ServerPolicyResponse {
  data : {
    policy : ServerPolicy
  }
}
```

## Get Server Status

Fetch the current status information of the server.

**Request Format**

```ts
method   : 'GET'
endpoint : '/api/status'
```

**Response Interface**

```ts
interface ServerStatusResponse {
  data : {
    status : string
  }
}
```