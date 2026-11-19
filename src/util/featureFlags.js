/**
 * Hardcoded switches for TheLuupe features. Changing a value needs a code change and a deploy.
 *
 * PORTFOLIO_ENABLED — the Portfolio feature (`portfolio-showcase` listings): the profile and Manage-listings tabs and
 * the upload wizard. `true` shows it. `false` hides it, code and data kept: no Portfolio tab on the profile, and on
 * Manage listings a Portfolio tab that only says portfolios are paused. Switched off 2026-10-16, back on 2026-11-19.
 * Either way Shop is the default tab (LISTING_GRID_DEFAULTS.TYPE in util/types.js). See spec/v0/hide-portfolio.md.
 */
export const PORTFOLIO_ENABLED = true;
