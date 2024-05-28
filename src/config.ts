const parseStringArray = (value: string) => {
  return value.split(',')
    .filter((_) => _)
    .map((item) => item.trim().toLowerCase())
}

export default () => ({
  privateKey: parseStringArray(process.env.PRIVATE_KEY || ''),
  networkType: process.env.NETWORK_TYPE || 'testnet',
  rpcUrl: process.env.RPC_URL || '',
  strategy: process.env.STRATEGY_TYPE || 'default',
  trading: {
    marketIds: parseStringArray(process.env.MARKET_IDS || ''),
    futureIds: parseStringArray(process.env.FUTURE_IDS || ''),
    // Average interval between trade attempts [seconds]
    avgInterval: Number(process.env.TRADE_AVERAGE_INTERVAL || '3000'),
    maxRisk: Number(process.env.TRADE_MAX_RISK || '10000'),
    // Max notional value [USDT]
    maxTradeSize: Number(process.env.TRADE_MAX_SIZE || '1000'),
    maxMarginInUse: Number(process.env.TRADE_MAX_MARGIN_IN_USE || '0'),
    riskLevel: Number(process.env.TRADE_RISK_LEVEL || '1000'),
    xFactor: Number(process.env.TRADE_X_FACTOR || '5'),
    yFactor: Number(process.env.TRADE_Y_FACTOR || '15'),
    zFactor: Number(process.env.TRADE_Z_FACTOR || '10'),
    px1: Number(process.env.TRADE_PX_1 || 0.6),
    px2: Number(process.env.TRADE_PX_2 || 0.75),
  },
});
