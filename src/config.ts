export default () => ({
  privateKey: process.env.PRIVATE_KEY || '',
  rpcUrl: process.env.RPC_URL || 'https://arbitrum-goerli.public.blastapi.io',
  oracleUrl: process.env.ORACLE_URL || 'https://roaracle-test.fly.dev',
  oracleServiceApiKey: process.env.ORACLE_SERVICE_API_KEY || '',
  routerContractAddress: process.env.ROUTER_CONTRACT_ADDRESS || '',
  viewContractAddress: process.env.VIEW_CONTRACT_ADDRESS || '',
  quoterContractAddress: process.env.QUOTER_CONTRACT_ADDRESS || '',
  txConfirmations: parseInt(process.env.TX_CONFIRMATIONS || '2'),
  marketIds: (process.env.MARKET_IDS || '')
    .split(',')
    .filter(_ => _)
    .map(item => item.trim().toLowerCase()),
  futureIds: (process.env.FUTURE_IDS || '')
    .split(',')
    .filter(_ => _)
    .map(item => item.trim().toLowerCase()),
  trading: {
    // Average interval between trade attempts [seconds]
    avgInterval: parseInt(process.env.TRADE_AVERAGE_INTERVAL || '60'),
    maxRisk: parseInt(process.env.TRADE_MAX_RISK || '1'),
    // Max notional value [USDT]
    maxTradeSize: parseInt(process.env.TRADE_MAX_SIZE || '1000'),
    // Max losses / day [USD]
    warningLosses: parseInt(process.env.TRADE_WARNING_LOSSES || '1000'),
    riskLevel: parseInt(process.env.TRADE_RISK_LEVEL || '100')
  }
});
