![image](https://github.com/RhoLabs/rho-trading-bot/assets/8803471/fb47f21d-badc-4b8c-8be5-a47797c04138)

### Rho Trading Bot

## Environment variables
| Env variable name      | Required | Default | Description                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                
|------------------------|----------|---------|----------------------------------------------------------------|
| PRIVATE_KEY            | true     | -       | Bot account private key to sign a transactions                 |
| STRATEGY_TYPE          | false    | default | Bot strategy type                                              |
| NETWORK_TYPE           | false    | testnet | mainnet / testnet                                              |
| RPC_URL                | true     | -       | RPC URL                                                        |
| MARKET_IDS             | false    | -       | List of market ids, divided by comma, for example: 0x123,0x567 |
| FUTURE_IDS             | false    | -       | List of future ids, divided by comma, for example: 0x123,0x567 |
| TRADE_AVERAGE_INTERVAL | false    | 30      | [seconds] Average interval between trades                      |
| TRADE_MAX_RISK         | false    | 1       | [Integer] Used in trading rules to compare against dv01        |
| TRADE_MAX_SIZE         | false    | 1000    | [integer, USDT] Max notional amount                            |
| TRADE_WARNING_LOSSES   | false    | 1000    | [integer, USDT] Max warning losses per day                     |

## Run locally
```
npm i
npm run start
```

## Architecture overview

The trading bot is designed to support various trading strategies, while also being relatively simple to set up.

The current version of the bot supports only one strategy, which is located in the directory `src/trading/base-strategy`. Each bot strategy is a separate “service” in terms of NestJS architecture. Strategies are separated from each other; bot cannot be launched with two strategies at the same time.

Interaction with the protocol is done through the [rho-sdk](https://www.npmjs.com/package/@rholabs/rho-sdk) library, available on npm.

## How to implement new strategy

[Learn more](https://docs.nestjs.com/providers#services) about services on NestJS website.

1. Generate new service `advanced-strategy`:
```shell
nest generate service trading/advanced-strategy
```
NestJS will generate new service and add it to Trading module.

2. Go to `src/trading/advanced-strategy/advanced-strategy.service.ts` and implement custom strategy. You can use `src/trading/base-strategy/base-strategy.service.ts` as an example.
3. Add specific code for launching new strategy in AppService (`src/app.service.ts`)

## Publishing to Docker Hub
```shell
docker buildx build -t rholabs/trading-bot:1.3.2  --platform linux/amd64 .

docker push rholabs/trading-bot:1.3.2
```
