export default () => ({
  privateKey: process.env.PRIVATE_KEY || '',
  rpcUrl: process.env.RPC_URL || 'https://arbitrum-goerli.public.blastapi.io',
  oracleUrl: process.env.ORACLE_URL || 'https://testnet.roaracle.app',
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
    avgInterval: Number(process.env.TRADE_AVERAGE_INTERVAL || '600'),
    maxRisk: Number(process.env.TRADE_MAX_RISK || '10000'),
    // Max notional value [USDT]
    maxTradeSize: Number(process.env.TRADE_MAX_SIZE || '1000'),
    maxMarginInUse: Number(process.env.TRADE_MAX_MARGIN_IN_USE || '100'),
    // Max losses / day [USD]
    warningLosses: Number(process.env.TRADE_WARNING_LOSSES || '1000'),
    riskLevel: Number(process.env.TRADE_RISK_LEVEL || '1000'),
    xFactor: Number(process.env.TRADE_X_FACTOR || '5'),
    yFactor: Number(process.env.TRADE_Y_FACTOR || '15'),
    zFactor: Number(process.env.TRADE_Z_FACTOR || '10'),
  }
});
