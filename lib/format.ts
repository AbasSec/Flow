export function formatSen(amountSen: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR"
  }).format(amountSen / 100);
}
