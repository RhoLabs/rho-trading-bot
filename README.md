### Rho Trading Bot

## Configuration
| Env variable name      | Required | Default                  | Description                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                
|------------------------|----------|--------------------------|----------------------------------------------------------------|
| PRIVATE_KEY            | true     | -                        | Bot account private key to sign a transactions                 |
| NETWORK_TYPE           | false    | testnet                  | mainnet / testnet                                              |
| SUBGRAPH_API_URL       | true     | -                        | Subgraph API URL                                               |
| RPC_URL                | true     | -                        | RPC URL                                                        |
| MARKET_IDS             | false    | -                        | List of market ids, divided by comma, for example: 0x123,0x567 |
| FUTURE_IDS             | false    | -                        | List of future ids, divided by comma, for example: 0x123,0x567 |
| TRADE_AVERAGE_INTERVAL | false    | 30                       | [seconds] Average interval between trades                      |
| TRADE_MAX_RISK         | false    | 1                        | [Integer] Used in trading rules to compare against dv01        |
| TRADE_MAX_SIZE         | false    | 1000                     | [integer, USDT] Max notional amount                            |
| TRADE_WARNING_LOSSES   | false    | 1000                     | [integer, USDT] Max warning losses per day                     |

## Run locally
```
npm i
npm run start
```

```shell
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 769492012699.dkr.ecr.eu-central-1.amazonaws.com

docker buildx build -t 769492012699.dkr.ecr.eu-central-1.amazonaws.com/trading-bot:1.2.1  --platform linux/amd64 --push .
```

## TODO
- [x] Check balances on start
- [ ] Check access rights on start
- [x] Circuit breaker
- [x] Basic Prometheus metrics
