'use strict';

const rateLimit = require('express-rate-limit');

// Automated tests make far more requests than a human; only the ad request
// limiter stays strict so its behaviour can be asserted.
const TEST_FACTOR = process.env.UNI_TEST_MODE === '1' ? 20 : 1;

const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте позже.' }
};

// Global API limiter.
const apiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 300 * TEST_FACTOR
});

// Login attempts: 10 per 15 minutes.
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10 * TEST_FACTOR,
  skipSuccessfulRequests: true,
  message: { error: 'Слишком много попыток входа. Подождите 15 минут.' }
});

// Registration and other account creation actions.
const registerLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 20 * TEST_FACTOR,
  message: { error: 'Слишком много регистраций с этого адреса. Попробуйте позже.' }
});

// Uploads and content creation.
const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 120 * TEST_FACTOR,
  message: { error: 'Слишком много загрузок. Попробуйте позже.' }
});

// Swipes are frequent but should stay human.
const swipeLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 180 * TEST_FACTOR
});

// The owner control center is powerful, so keep its request rate tight.
const adminLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 120 * TEST_FACTOR,
  message: { error: 'Слишком много запросов к панели. Подождите минуту.' }
});

// Public advertising requests: five per hour per IP.
const adRequestLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { error: 'Слишком много заявок с этого адреса. Напишите администратору в Telegram.' }
});

// Super like purchase requests: ten per hour per signed-in account.
const superlikeOrderLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 10 * TEST_FACTOR,
  message: { error: 'Слишком много заявок. Напишите администратору в Telegram.' }
});

module.exports = {
  apiLimiter,
  authLimiter,
  registerLimiter,
  uploadLimiter,
  swipeLimiter,
  adminLimiter,
  adRequestLimiter,
  superlikeOrderLimiter
};
