/**
 * Garante que uma consulta nunca deixe a tela em "carregando" para sempre: passado o limite,
 * lança e o `error.tsx` da rota assume (mensagem + "Tentar de novo").
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Tempo esgotado ao carregar o financeiro.")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
