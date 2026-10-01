// Runs before every test file: isolates tests from any dev data and pins deterministic limits.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.REDIS_DB = process.env.REDIS_DB ?? '15';
process.env.JWT_SECRET ??= 'test_secret_test_secret_test_secret_123';
process.env.ENCRYPTION_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BULL_BOARD_PASSWORD ??= 'test-password-123';
process.env.ELASTICSEARCH_ENABLED = 'false';
process.env.MIN_DELAY_BETWEEN_EMAILS_MS = '0';
process.env.MAX_EMAILS_PER_HOUR_PER_SENDER = '200';
process.env.WORKER_CONCURRENCY = '5';
