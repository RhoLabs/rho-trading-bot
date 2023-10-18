### Rho Trading Bot

## Configuration
| Env variable name       | Required | Default                                    | Description                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                
|-------------------------|----------|--------------------------------------------|------------------------------------------------|
| RPC_URL                 | false    | https://arbitrum-goerli.public.blastapi.io | RPC URL                                        |
| ORACLE_URL              | false    | https://roaracle.fly.dev                   | Rho Oracle URL                                 |
| ROUTER_CONTRACT_ADDRESS | true     | -                                          | Rho Router contract address                    |
| VIEW_CONTRACT_ADDRESS   | true     | -                                          | Rho ViewDataProvider contract address          |
| PRIVATE_KEY             | true     | -                                          | Rho account private key to sign a transactions |

## Run locally
```
npm i
npm run start
```

## TODO
- [x] Check balances on start
- [ ] Check access rights on start
- [ ] Circuit breaker
