import { amountInWordsMXN, numberInWords } from './amount-in-words.util';

describe('amountInWordsMXN', () => {
  it('writes the total of the template prefactura', () => {
    expect(amountInWordsMXN(2876.22)).toBe('Dos mil ochocientos setenta y seis pesos 22/100 M.N.');
  });

  it('uses the short forms before "pesos" and "mil"', () => {
    expect(amountInWordsMXN(1)).toBe('Un peso 00/100 M.N.');
    expect(amountInWordsMXN(21)).toBe('Veintiún pesos 00/100 M.N.');
    expect(amountInWordsMXN(31_000)).toBe('Treinta y un mil pesos 00/100 M.N.');
    expect(amountInWordsMXN(1_000_000)).toBe('Un millón de pesos 00/100 M.N.');
  });

  it('handles round hundreds and cents', () => {
    expect(amountInWordsMXN(100.5)).toBe('Cien pesos 50/100 M.N.');
    expect(amountInWordsMXN(0.99)).toBe('Cero pesos 99/100 M.N.');
  });

  it('writes large numbers', () => {
    expect(numberInWords(2_501_115)).toBe('dos millones quinientos un mil ciento quince');
  });
});
