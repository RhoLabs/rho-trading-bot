import { Margin, ProfitAndLoss } from "../types";

function getRandomArbitrary(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export const generateRandom = (start: number, end: number, step: number) => {
  if(step <= 0) {
    throw new Error('generateRandom: step should be a positive number')
  }
  if(start + step > end) {
    throw new Error('generateRandom: wrong params')
  }
  const stepsCount = Math.round((end - start) / step)
  const randomStepsCount = Math.floor(getRandomArbitrary(1, stepsCount))
  return start + randomStepsCount * step
}

export const toBigInt = (value: number, decimalPlaces: bigint | number) => {
  return BigInt(Math.round(value)) * BigInt(10n ** BigInt(decimalPlaces))
}

export const fromBigInt = (value: bigint, decimalPlaces: bigint | number) => {
  return Number(value) / 10 ** Number(decimalPlaces)
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

const secondsInYear = 60 * 60 * 24 * 365

export const getDV01FromNotional = (notionalValue: number, secondsToExpiry: number) => {
  return notionalValue * 0.0001 * secondsToExpiry / secondsInYear
}
