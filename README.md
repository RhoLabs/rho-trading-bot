![image](https://github.com/RhoLabs/rho-trading-bot/assets/8803471/fb47f21d-badc-4b8c-8be5-a47797c04138)

### Rho Trading Bot

## Environment variables
| Env variable name      | Required | Default | Description                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                
|------------------------|----------|---------|----------------------------------------------------------------------------------------------------------------------|
| PRIVATE_KEY            | true     | -       | Bot account private key to sign a transactions. Use comma separated values for multiple accounts: 0x123,0x456,0x789. |
| NETWORK_TYPE           | false    | testnet | mainnet / testnet                                                                                                    |
| RPC_URL                | false    | -       | custom RPC URL                                                                                                       |
| MARKET_IDS             | false    | -       | List of market ids, divided by comma, for example: 0x123,0x567                                                       |
| FUTURE_IDS             | false    | -       | List of future ids, divided by comma, for example: 0x123,0x567                                                       |
| TRADE_AVERAGE_INTERVAL | false    | 3000    | [seconds] Average interval between trades                                                                            |
| TRADE_MAX_SIZE         | false    | 100000  | [notional] Max notional amount                                                                                       |
| TRADE_MAX_RISK         | false    | 200000  | [notional] Used in trading rules to compare against dv01. Set in notional, converted to dv01.                        |

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
docker pull rholabs/trading-bot:1.6.0
```

2. Create .env file with list or environment variables. `.env.testnet.example` can be used as reference.
```shell
PRIVATE_KEY=<PRIVATE_KEY_ARBITRUM_SEPOLIA>
NETWORK_TYPE=testnet
MARKET_IDS=0xb46e832d0cb2456cdc7e2ba8eebd91e5eebba17f50ee6c7a34450e5b8a22467c
FUTURE_IDS=0x793c2bb8ffcd34b60cdf14f331b200ebca9e72d784f14a2c34d0f487784812c7
TRADE_MAX_SIZE=100000
TRADE_MAX_RISK=200000
TRADE_AVERAGE_INTERVAL=3000
```

**NOTE**: Bot trading account (env: `PRIVATE_KEY`) should have underlying tokens on balance to execute trades.

3. Run bot in docker container:
```shell
docker run --env-file .env rholabs/trading-bot:1.6.0
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
docker buildx build -t rholabs/trading-bot:1.6.0  --platform linux/amd64 .

docker push rholabs/trading-bot:1.6.0
```

## Market and Future ids

### Mainnet

| Name   | Future | Market | Maturity                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                
|------------------------|----------|---------|----------------------------------------------------------------------------------------------------------------------|
| Binance BTCUSDT           | 0x96c41719e4d49d669fa631b2ad3ba6a99fc70110bcc5ab3a31019d95fa0367fa     | 0x852d33076c184e71c510bd29bb2e8ad041f4e32ebfb4dd119469332664a56bce       | June/24 |
| Binance ETHUSDT           | 0x883a66f1be5f4278eedece824b92be1c3ca1ae57d441b4047cd2d4c1fbbf9574    | 0x5dc9814bc6650ce1e620667427cea9497265edd04844c865aaa9e49faf7fe1e0 | June/24


### Testnet

| Name   | Future | Market | Maturity                                                                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                
|------------------------|----------|---------|----------------------------------------------------------------------------------------------------------------------|
| Binance BTCUSDT           | 0x793c2bb8ffcd34b60cdf14f331b200ebca9e72d784f14a2c34d0f487784812c7     | 0xb46e832d0cb2456cdc7e2ba8eebd91e5eebba17f50ee6c7a34450e5b8a22467c       | 28/06/24 |
| Binance BTCUSDT           | 0xfc7327efacaa1e2c54c79d07f2d493aab5801d82db18af40b0365e5c7c7bcc28    | 0xb46e832d0cb2456cdc7e2ba8eebd91e5eebba17f50ee6c7a34450e5b8a22467c | 27/09/2024
| Binance ETHUSDT           | 0x91d60dfbfe4e0f45cd0e6d4fd0dccc9997258f1012a04227f8831d3d3b1d43b8     | 0x26099aa48729f70a8df74968eb64f93726fb7154f56c26f9845266648cf36bce       | 28/06/24 |
| Binance ETHUSDT           | 0xafbac802fbd7c48209aaea2c9ef8bfa75985ab10f555723e0f2dfd27e19b50fe    | 0x26099aa48729f70a8df74968eb64f93726fb7154f56c26f9845266648cf36bce | 27/09/2024
