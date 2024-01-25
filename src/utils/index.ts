import { Margin, ProfitAndLoss } from '@rholabs/rho-sdk';
import { webcrypto as crypto } from "node:crypto";

export const getRandomArbitrary = (min: number, max: number) => {
  return Math.round(Math.random() * (max - min) + min);
}

export const generateRandom = (start: number, end: number, step: number) => {
  if (step <= 0) {
    throw new Error('generateRandom: step should be a positive number');
  }
  if (start + step > end) {
    throw new Error('generateRandom: wrong params');
  }
  const stepsCount = Math.round((end - start) / step);
  const randomStepsCount = Math.floor(getRandomArbitrary(1, stepsCount));
  return start + randomStepsCount * step;
};

const getBitCount = (v: bigint) => {
  let x = v;
  let c = 0;
  do {
    ++c;
    x >>= 1n;
  } while (x > 0n)
  return c;
}

const mask = (arr: Uint8Array, numBits: number) => {
  let idx = 0;
  let b = numBits;
  while (idx < arr.length) {
    arr[idx] =
      b <= 0 ? 0 : b > 0 && b < 8 ? arr[idx] & ((1 >> b) - 1) : arr[idx];
    ++idx;
    b -= 8;
  }
}

export const bigRandomInRange = (v1: bigint, v2: bigint) => {
  const min = v1 > v2 ? v2 : v1;
  const r = v1 - v2;
  const range = r < 0 ? -r : r;
  if (range === 0n) {
    return min;
  }
  const bitCount = getBitCount(range);
  const byteCount = Math.ceil(bitCount / 8);
  const arr = new Uint8Array(byteCount);
  for (; ;) {
    crypto.getRandomValues(arr);
    mask(arr, bitCount);
    const v = arr.reduce(
      (acc, curr, i) => (1n << (BigInt(i) * 8n)) * BigInt(curr) + acc, 0n);
    if (v < range) {
      return min + v;
    }
  }
}

export const toBigInt = (value: number, decimalPlaces: bigint | number) => {
  const dp = Number(decimalPlaces.toString());
  return BigInt(value * 10 ** dp);
};

export const fromBigInt = (value: bigint, decimalPlaces: bigint | number) => {
  return Number(value) / 10 ** Number(decimalPlaces);
};

export const profitAndLossTotal = (input: ProfitAndLoss) => {
  return input.accruedLPFee + input.netFutureValue - input.incurredFee;
};

export const marginTotal = (input: Margin) => {
  return input.collateral + profitAndLossTotal(input.profitAndLoss);
};

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
};

const secondsInYear = 60 * 60 * 24 * 365;

export const getDV01FromNotional = (
  notionalValue: number,
  secondsToExpiry: number,
) => {
  return (notionalValue * 0.0001 * secondsToExpiry) / secondsInYear;
};
