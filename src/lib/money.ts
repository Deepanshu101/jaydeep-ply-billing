const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underHundred(n: number) {
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
}

function underThousand(n: number) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return `${hundred ? `${ones[hundred]} Hundred` : ""} ${rest ? underHundred(rest) : ""}`.trim();
}

export function amountInWords(value: number) {
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Rupees Zero Only";

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  const words = [
    crore ? `${underThousand(crore)} Crore` : "",
    lakh ? `${underThousand(lakh)} Lakh` : "",
    thousand ? `${underThousand(thousand)} Thousand` : "",
    rest ? underThousand(rest) : "",
  ].filter(Boolean);

  return `Rupees ${words.join(" ")}${paise ? ` and ${underHundred(paise)} Paise` : ""} Only`;
}

export function inr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}
