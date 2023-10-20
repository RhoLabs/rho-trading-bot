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
