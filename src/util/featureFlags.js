/**
 * Hardcoded switches for TheLuupe features. Changing a value needs a code change and a deploy.
 *
 * PORTFOLIO_ENABLED — the Portfolio feature (`portfolio-showcase` listings): the profile and Manage-listings tabs and
 * the upload wizard. `false` hides it, code and data kept: no Portfolio tab on the profile, and on Manage listings a
 * Portfolio tab that only says portfolios are paused. `true` restores it. See spec/v0/hide-portfolio.md.
 */
export const PORTFOLIO_ENABLED = false;
