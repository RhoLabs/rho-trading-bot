![image](https://github.com/RhoLabs/rho-trading-bot/assets/8803471/fb47f21d-badc-4b8c-8be5-a47797c04138)

### Rho Trading Bot

## Environment variables
| Env variable name      | Is required | Default value | Description                                                                                                                                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                
|------------------------|-------------|---------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| PRIVATE_KEY            | true        | -             | Private key for the bot account, needed to sign transactions. Use comma separated values to trade from multiple accounts: 0x123,0x456,0x789. |
| NETWORK_TYPE           | false       | testnet       | mainnet / testnet                                                                                                                            |
| FUTURES                | true        | -             | Future aliases, separated by comma. Example: "BINANCE-ETHUSDT-SEP24,BINANCE-ETHUSDT-JUL24"                                                   |
| TRADE_AVERAGE_INTERVAL | false       | 3000          | [seconds] Average interval between trades                                                                                                    |
| TRADE_MAX_SIZE         | false       | 100000        | [notional] Max notional amount                                                                                                               |
| TRADE_MAX_RISK         | false       | 200000        | [notional] Used in trading rules to compare against dv01. Set in notional, converted to dv01.                                                |
| RPC_URL                | false       | -             | custom RPC URL                                                                                                                               |

## Run locally
1) Prepare .env config. `.env.example` can be used as reference.
```shell
touch .env
```
**NOTE**: Bot trading account (env: `PRIVATE_KEY`) should have underlying tokens on balance to execute trades.

2) Install dependencies and run the bot
```
npm i
npm run start
```

## Run in docker container

1. Pull docker image from the [public registry](https://hub.docker.com/r/rholabs/trading-bot)
```sh
docker pull rholabs/trading-bot:1.6.3
```

2. Create .env file with list or environment variables. `.env.testnet.example` can be used as reference.
```shell
PRIVATE_KEY=<PRIVATE_KEY_ARBITRUM_SEPOLIA>
NETWORK_TYPE=testnet
FUTURES=BINANCE-ETHUSDT-JUN24,BINANCE-ETHUSDT-JUL24
TRADE_MAX_SIZE=100000
TRADE_MAX_RISK=200000
TRADE_AVERAGE_INTERVAL=3000
```

**NOTE**: Bot trading account (env: `PRIVATE_KEY`) should have underlying tokens on balance to execute trades.

3. Run bot in docker container:
```shell
docker run --env-file .env rholabs/trading-bot:1.6.3
```

## Bot strategy

**Basic logic:**
* Trades at random intervals selected from the range +-50%, averaging TRADE_AVERAGE_INTERVAL (Default: averaging a trade every 3000 seconds (50 minutes))
* Trades random notional between 0 and TRADE_MAX_SIZE (Default: 100,000 USDT)
* Side is chosen randomly, unless the resulting absolute exposure exceeds TRADE_MAX_RISK (Default: 200,000 USDT)
* If the exposure is >TRADE_MAX_RISK on either side (payer OR receiver), the bot selects the opposite side to reduce the exposure.

## How to implement new strategy

[Learn more](https://docs.nestjs.com/providers#services) about services on NestJS website.

1. Generate new service `advanced-strategy`:
```shell
nest generate service trading/advanced-strategy
```
NestJS will generate new service and add it to Trading module.

2. Go to `src/trading/advanced-strategy/advanced-strategy.service.ts` and implement custom strategy. You can use `src/trading/base-strategy/base-strategy.service.ts` as an example.
3. Add specific code for launching new strategy in AppService (`src/app.service.ts`)


## Trading from multiple accounts
Use comma separated values to trade from multiple accounts.
```shell
PRIVATE_KEY=0x123,0x456,0x789
```

## Publishing to Docker Hub
```shell
docker buildx build -t rholabs/trading-bot:1.6.3 --platform linux/amd64 .

docker push rholabs/trading-bot:1.6.3
```
