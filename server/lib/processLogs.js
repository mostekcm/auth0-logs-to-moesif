const loggingTools = require('auth0-log-extension-tools');
const config = require('../lib/config');
const logger = require('../lib/logger');
const postEventsToMoesif = require('../lib/moesif');

module.exports = (storage) =>
  (req, res, next) => {
    const wtBody = (req.webtaskContext && req.webtaskContext.body) || req.body || {};
    const wtHead = (req.webtaskContext && req.webtaskContext.headers) || {};
    const isCron = (wtBody.schedule && wtBody.state === 'active') || (wtHead.referer === 'https://manage.auth0.com/' && wtHead['if-none-match']);

    if (!isCron) {
      return next();
    }

    const onLogsReceived = (logs, callback) => {
      if (!logs || !logs.length) {
        return callback();
      }

      return postEventsToMoesif(config('AUTH0_DOMAIN'), config('MOESIF_APPLICATION_ID'), logs)
        .end((err) => {
          if (err) {
            logger.error('Error sending logs to Moesif', err);
            return callback(err);
          }

          logger.info(`${logs.length} events successfully sent to Moesif`);

          return callback();
        });
    };

    const slack = new loggingTools.reporters.SlackReporter({
      hook: config('SLACK_INCOMING_WEBHOOK_URL'),
      username: 'auth0-logs-to-moesif',
      title: 'Logs To Moesif' });

    const options = {
      domain: config('AUTH0_DOMAIN'),
      clientId: config('AUTH0_CLIENT_ID'),
      clientSecret: config('AUTH0_CLIENT_SECRET'),
      batchSize: config('BATCH_SIZE'),
      startFrom: config('START_FROM'),
      logTypes: [ 'sapi', 'fapi' ]
    };

    const auth0logger = new loggingTools.LogsProcessor(storage, options);

    return auth0logger
      .run(onLogsReceived)
      .then(result => {
        slack.send(result.status, result.checkpoint);
        res.json(result);
      })
      .catch(err => {
        slack.send({ error: err, logsProcessed: 0 }, null);
        next(err);
      });
  };
