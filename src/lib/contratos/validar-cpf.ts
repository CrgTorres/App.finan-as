/** Validação básica de CPF (11 dígitos + dígitos verificadores). */
export function cpfDigitosValido(cpf?: string | null): string | null {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return null;
  if (/^(\d)\1{10}$/.test(d)) return null;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(d[i]!, 10) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(d[9]!, 10)) return null;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(d[i]!, 10) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== parseInt(d[10]!, 10)) return null;

  return d;
}
