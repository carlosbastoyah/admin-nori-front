const UNITS = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

/** 0–999 in words; `apocope` turns a trailing "uno" into "un" before a noun (un mil, veintiún pesos). */
function hundreds(n: number, apocope: boolean): string {
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest < 30) {
    let word = UNITS[rest];
    if (apocope && rest === 1) word = 'un';
    if (apocope && rest === 21) word = 'veintiún';
    if (word) parts.push(word);
  } else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    let unit = UNITS[u];
    if (apocope && u === 1) unit = 'un';
    parts.push(u ? `${TENS[t]} y ${unit}` : TENS[t]);
  }
  return parts.join(' ');
}

/** Integer in Spanish words, up to the billions; `apocope` as in {@link hundreds}. */
export function numberInWords(value: number, apocope = false): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'cero';

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];

  if (millions) {
    parts.push(millions === 1 ? 'un millón' : `${numberInWords(millions, true)} millones`);
  }
  if (thousands) {
    parts.push(thousands === 1 ? 'mil' : `${hundreds(thousands, true)} mil`);
  }
  if (rest) parts.push(hundreds(rest, apocope));
  return parts.join(' ');
}

/** "Dos mil ochocientos setenta y seis pesos 22/100 M.N." as Mexican invoices write the total. */
export function amountInWordsMXN(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const pesos = Math.floor(cents / 100);
  const centavos = String(cents % 100).padStart(2, '0');
  let words = numberInWords(pesos, true);
  // "un millón de pesos", "dos millones de pesos".
  if (pesos > 0 && pesos % 1_000_000 === 0) words += ' de';
  const text = `${words} ${pesos === 1 ? 'peso' : 'pesos'} ${centavos}/100 M.N.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
