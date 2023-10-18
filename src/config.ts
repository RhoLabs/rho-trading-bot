export default () => ({
  privateKey: process.env.PRIVATE_KEY || '',
  rpcUrl: process.env.RPC_URL || 'https://arbitrum-goerli.public.blastapi.io',
  oracleUrl: process.env.ORACLE_URL || 'https://roaracle.fly.dev',
  oracleServiceApiKey: process.env.ORACLE_SERVICE_API_KEY || '',
  routerContractAddress: process.env.ROUTER_CONTRACT_ADDRESS || '',
  viewContractAddress: process.env.VIEW_CONTRACT_ADDRESS || '',
  quoterContractAddress: process.env.QUOTER_CONTRACT_ADDRESS || '',
});
