export default () => ({
  privateKey: process.env.PRIVATE_KEY || '',
  networkType: process.env.NETWORK_TYPE || 'testnet',
  rpcUrl: process.env.RPC_URL || '',
  strategy: process.env.STRATEGY_TYPE || 'default',
  trading: {
    marketIds: (process.env.MARKET_IDS || '')
      .split(',')
      .filter((_) => _)
      .map((item) => item.trim().toLowerCase()),
    futureIds: (process.env.FUTURE_IDS || '')
      .split(',')
      .filter((_) => _)
      .map((item) => item.trim().toLowerCase()),
    // Average interval between trade attempts [seconds]
    avgInterval: Math.max(Number(process.env.TRADE_AVERAGE_INTERVAL || '600'), 600),
    maxRisk: Number(process.env.TRADE_MAX_RISK || '10000'),
    // Max notional value [USDT]
    maxTradeSize: Number(process.env.TRADE_MAX_SIZE || '1000'),
    maxMarginInUse: Number(process.env.TRADE_MAX_MARGIN_IN_USE || '100'),
    // Max losses per day [USD]
    warningLosses: Number(process.env.TRADE_WARNING_LOSSES || '1000'),
    riskLevel: Number(process.env.TRADE_RISK_LEVEL || '1000'),
    xFactor: Number(process.env.TRADE_X_FACTOR || '5'),
    yFactor: Number(process.env.TRADE_Y_FACTOR || '15'),
    zFactor: Number(process.env.TRADE_Z_FACTOR || '10'),
    px1: Number(process.env.TRADE_PX_1 || 0.6),
    px2: Number(process.env.TRADE_PX_2 || 0.75),
  },
});
