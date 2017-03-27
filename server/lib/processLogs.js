const loggingTools = require('auth0-log-extension-tools');
const config = require('../lib/config');
const logger = require('../lib/logger');
const postEventsToMoesif = require('../lib/moesif');
const getNewUsers = require('../lib/helpers').getNewUsers;

module.exports = (storage) =>
  (req, res, next) => {
    if (!req.body || !req.body.schedule || req.body.state !== 'active') {
      return next();
    }

    const onLogsReceived = (logs, callback) => {
      if (!logs || !logs.length) {
        return callback();
      }
      console.log('got ' + logs.length + ' logs');
      return postEventsToMoesif(config('AUTH0_DOMAIN'), config('MOESIF_APPLICATION_ID'), logs)
        .end((err) => {
          if (err) {
            logger.error('Error sending logs to Moesif', err);
            return callback(err);
          }

          logger.info(`${logs.length} events successfully sent to Moesif`);

          const signups = logs.filter(log => log.type === 'ss');

          if (signups.length) {
            return getNewUsers(req.auth0, signups, callback);
          }

          return callback();
        });
    };

    const slack = new loggingTools.SlackReporter({ hook: config('SLACK_INCOMING_WEBHOOK_URL'), username: 'auth0-logs-to-moesif', title: 'Logs To Moesif' });

    const options = {
      domain: config('AUTH0_DOMAIN'),
      clientId: config('AUTH0_CLIENT_ID'),
      clientSecret: config('AUTH0_CLIENT_SECRET'),
      batchSize: config('BATCH_SIZE'),
      startFrom: config('START_FROM'),
      logTypes: [ 'sapi', 'fapi', 'ss' ],
      onLogsReceived: onLogsReceived,
      onSuccess: (config('SLACK_SEND_SUCCESS')) ? slack.send : null,
      onError: slack.send
    };

    const auth0logger = loggingTools.Auth0Logger(storage, options);

    return auth0logger(req, res, next);
  };
