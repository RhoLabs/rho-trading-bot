import { Margin, ProfitAndLoss } from "../types";

export const generateRandom = (start = 0, end = 1000, increments = 100) => {
  const numbers = [];
  for(let n = start; n <= end; n += increments) {
    numbers.push(n);
  }

  const randomIndex = Math.floor(Math.random() * numbers.length);
  return numbers[randomIndex];
}

export const toBigInt = (value: number, decimalPlaces: bigint | number) => {
  return BigInt(value) * BigInt(10n ** BigInt(decimalPlaces))
}

export const profitAndLossTotal = (input: ProfitAndLoss) => {
  return input.accruedLPFee + input.netFutureValue - input.incurredFee
}

export const marginTotal = (input: Margin) => {
  return input.collateral + profitAndLossTotal(input.profitAndLoss)
}

export const getMax = (...values) => {
  if (values.length < 1) {
    return -Infinity;
  }

  let maxValue = values.shift();

  for (const value of values) {
    if (value > maxValue) {
      maxValue = value;
    }
  }

  return maxValue;
}
