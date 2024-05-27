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
| TRADE_AVERAGE_INTERVAL | false    | 600     | [seconds] Average interval between trades                                                                            |
| TRADE_MAX_SIZE         | false    | 1000    | [integer, USDT] Max notional amount                                                                                  |
| TRADE_MAX_RISK         | false    | 1       | [Integer] Used in trading rules to compare against dv01                                                              |

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
docker pull rholabs/trading-bot:1.4.0
```

2. Create .env file with list or environment variables. `.env.example` can be used as reference.

**NOTE**: Bot trading account (env: `PRIVATE_KEY`) should have underlying tokens on balance to execute trades.

3. Run bot in docker container:
```shell
docker run --env-file .env rholabs/trading-bot:1.4.0
```

## Bot strategy

**P_Receive**: probability of the bot to sell (receive rates)

**P_Pay**: probability of the bot to buy (pay rates)

**AvgRate**: average rate of the last 50 trades done by the bot

```shell
1. If (|DV01| ≤ RiskLevel1)   && (Rate > (1 + X) AvgRate ) then:
    
          P_Receive > P_Pay
```
```shell
2. If (|DV01| ≤ RiskLevel1)   && (Rate < (1 - X) AvgRate ) then:
    
          P_Receive < P_Pay
```
```shell
3. If (RiskLevel1 < |DV01| < MaxRisk) &&  (RiskDirection = Receiver) &&  (Rate < (1 - Y) AvgRate ) then:
    
          P_Receive << P_Pay;
    
    If (RiskLevel1 < |DV01| < MaxRisk) &&  (RiskDirection = Receiver) &&  (Rate > (1 + Z) AvgRate ) then:
    
     P_Receive > P_Pay;
```

```shell
4. If (RiskLevel1<|DV01| < MaxRisk) && (RiskDirection = Payer)  && (Rate > (1 + Y) AvgRate ) then:
    
          P_Receive >> P_Pay;
    
    If (RiskLevel1 < |DV01| < MaxRisk) &&  (RiskDirection = Payer) &&  (Rate < (1 - Z) AvgRate ) then:
    
     P_Receive < P_Pay;
```

```shell
5. If (|DV01| ≥ MaxRisk)  &&  (RiskDirection = Receiver) , then:
    
          P_Receive = 0
```

```shell
6. If (|DV01| ≥ MaxRisk)  &&  (RiskDirection = Payer) , then:
    
          P_Pay = 0
```

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
docker buildx build -t rholabs/trading-bot:1.5.1  --platform linux/amd64 .

docker push rholabs/trading-bot:1.5.1
```
