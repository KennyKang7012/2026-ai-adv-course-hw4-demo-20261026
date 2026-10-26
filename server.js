const app = require('./app');

const PORT = process.env.PORT || 3001;

const MIN_JWT_SECRET_LENGTH = 32;
const WEAK_JWT_SECRETS = new Set([
  'your-jwt-secret-key-here',
  'secret',
  'changeme',
  'integration-test-secret'
]);

function exitWithError(message) {
  console.error(`Fatal: ${message}`);
  process.exit(1);
}

function validateRuntimeConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    exitWithError('JWT_SECRET is not set');
  }

  if (process.env.NODE_ENV === 'production') {
    if (secret.length < MIN_JWT_SECRET_LENGTH || WEAK_JWT_SECRETS.has(secret)) {
      exitWithError(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters and not a known placeholder`);
    }
    if (process.env.ENABLE_MOCK_PAYMENT === 'true') {
      exitWithError('ENABLE_MOCK_PAYMENT must not be enabled in production');
    }
  }
}

if (require.main === module) {
  validateRuntimeConfig();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
