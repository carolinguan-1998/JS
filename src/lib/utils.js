export async function withRetry(fn, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

