const APP_TITLE = 'Agent Orchestrator';

export const getPageTitle = (pageTitle?: string) =>
  pageTitle ? `${pageTitle} | ${APP_TITLE}` : APP_TITLE;
