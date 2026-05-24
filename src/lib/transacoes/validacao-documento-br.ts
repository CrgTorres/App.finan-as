/** Dígitos verificadores CPF/CNPJ (Brasil) — reduz documentos espúrios na leitura do extrato. */

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

export function digitosCnpjSaoValidos(cnpj: string): boolean {
  const c = soDigitos(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;

  let length = 12;
  let numbers = c.substring(0, length);
  const digits = c.substring(12);
  let sum = 0;
  let pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += Number.parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number.parseInt(digits.charAt(0), 10)) return false;

  length = 13;
  numbers = c.substring(0, length);
  sum = 0;
  pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += Number.parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === Number.parseInt(digits.charAt(1), 10);
}

export function digitosCpfSaoValidos(cpf: string): boolean {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += Number.parseInt(c.charAt(i), 10) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  const dv1 = resto >= 10 ? 0 : resto;
  if (dv1 !== Number.parseInt(c.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += Number.parseInt(c.charAt(i), 10) * (11 - i);
  }
  resto = 11 - (soma % 11);
  const dv2 = resto >= 10 ? 0 : resto;
  return dv2 === Number.parseInt(c.charAt(10), 10);
}
