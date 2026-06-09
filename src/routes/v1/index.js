const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const leadRoute = require('./lead.route');
const settingsRoute = require('./settings.route');
const dashboardRoute = require('./dashboard.route');
const docsRoute = require('./docs.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  { path: '/auth', route: authRoute },
  { path: '/users', route: userRoute },
  { path: '/leads', route: leadRoute },
  { path: '/settings', route: settingsRoute },
  { path: '/dashboard', route: dashboardRoute },
];

const devRoutes = [{ path: '/docs', route: docsRoute }];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
