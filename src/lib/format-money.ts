const usd = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatMoney(value: number) {
  return usd.format(value);
}
