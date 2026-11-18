'use strict';

// The site serves a single city. Districts replace the old distance filter.
const { CITY, DISTRICTS } = require('../config');

const districtNames = () => DISTRICTS.slice();

function findDistrict(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return DISTRICTS.find((district) => district.toLowerCase() === normalized) || null;
}

function isValidCity(value) {
  return String(value || '').trim().toLowerCase() === CITY.toLowerCase();
}

module.exports = { CITY, DISTRICTS, districtNames, findDistrict, isValidCity };
