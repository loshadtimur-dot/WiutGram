'use strict';

// Payment details shown to advertisers. The card is only ever published when
// the owner explicitly enables it and a usable number is saved.

const CARD_MIN_DIGITS = 12;
const CARD_MAX_DIGITS = 19;

function normalizeCard(value) {
  return String(value || '').replace(/\D/g, '').slice(0, CARD_MAX_DIGITS);
}

function cardDigitsValid(digits) {
  return digits.length >= CARD_MIN_DIGITS && digits.length <= CARD_MAX_DIGITS;
}

// Soft check: a failure is a warning for the owner, never a hard block.
function luhnValid(digits) {
  if (!cardDigitsValid(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function formatCard(digits) {
  const clean = normalizeCard(digits);
  return clean.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function publicPayment(settings) {
  const telegram = String(settings.telegram || '').replace(/^@+/, '');
  const digits = normalizeCard(settings.card_number);
  const cardVisible = !!settings.show_card && cardDigitsValid(digits);
  return {
    telegram,
    telegram_url: telegram ? `https://t.me/${telegram}` : '',
    card: cardVisible
      ? {
          number: formatCard(digits),
          holder: String(settings.card_holder || ''),
          bank: String(settings.card_bank || ''),
          note: String(settings.payment_note || '')
        }
      : null
  };
}

module.exports = {
  CARD_MIN_DIGITS,
  CARD_MAX_DIGITS,
  normalizeCard,
  cardDigitsValid,
  luhnValid,
  formatCard,
  publicPayment
};
