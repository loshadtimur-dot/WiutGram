'use strict';

// Advertising module facade. The implementation is split by responsibility:
// settings/pricing, public requests, campaigns, live banners and owner reports.

const {
  PLACEMENTS,
  PLACEMENT_LABELS,
  getSettings,
  parseDiscounts,
  priceForHours,
  placementEnabled,
  availability,
  audienceStats,
  groupHours,
  describeGroups,
  validateHours
} = require('./ads/settings');
const { createRequest, listRequests, setRequestStatus, hashIp } = require('./ads/requests');
const {
  bannerRow,
  bannerView,
  bannerInUse,
  campaignView,
  createCampaign,
  updateCampaign,
  setPaidStatus,
  cancelCampaign,
  duplicateCampaign,
  listCampaigns,
  safeLink
} = require('./ads/campaigns');
const { activeBanner, bustCache, recordImpression, recordClick, statsFor, reportByToken } = require('./ads/live');
const { revenueSummary, adminOverview, calendar, loadSummary, cleanup } = require('./ads/admin');

module.exports = {
  PLACEMENTS,
  PLACEMENT_LABELS,
  getSettings,
  parseDiscounts,
  priceForHours,
  placementEnabled,
  availability,
  audienceStats,
  createRequest,
  describeGroups,
  createCampaign,
  updateCampaign,
  setPaidStatus,
  cancelCampaign,
  duplicateCampaign,
  listCampaigns,
  campaignView,
  bannerView,
  bannerRow,
  bannerInUse,
  safeLink,
  activeBanner,
  bustCache,
  recordImpression,
  recordClick,
  statsFor,
  reportByToken,
  revenueSummary,
  adminOverview,
  calendar,
  listRequests,
  setRequestStatus,
  loadSummary,
  cleanup,
  hashIp,
  groupHours,
  validateHours
};
