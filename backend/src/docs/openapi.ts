const err = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const auth = [{ cookieAuth: [] }];
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const emailList = { description: 'Paged emails', content: { 'application/json': { schema: { $ref: '#/components/schemas/EmailPage' } } } };

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Email Scheduler API',
    version: '1.0.0',
    description:
      'Schedule emails with BullMQ delayed jobs, per-sender hourly rate limiting, and Elasticsearch search. ' +
      'Authenticate via Google OAuth at `/api/auth/google`; the session is an httpOnly cookie.',
  },
  servers: [{ url: '/' }],
  tags: [{ name: 'Auth' }, { name: 'Campaigns' }, { name: 'Emails' }, { name: 'Senders' }, { name: 'Slack' }, { name: 'System' }],
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Liveness + dependency check', responses: { '200': { description: 'OK' }, '503': { description: 'A dependency is down' } } } },
    '/api/auth/google': { get: { tags: ['Auth'], summary: 'Start Google OAuth login (redirects to Google)', responses: { '302': { description: 'Redirect to Google' } } } },
    '/api/auth/google/callback': { get: { tags: ['Auth'], summary: 'Google OAuth callback; sets session cookie and redirects to the dashboard', responses: { '302': { description: 'Redirect to frontend' } } } },
    '/api/auth/me': { get: { tags: ['Auth'], summary: 'Current user', security: auth, responses: { '200': { description: 'User', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } }, '401': err } } },
    '/api/auth/logout': { post: { tags: ['Auth'], summary: 'Clear session', responses: { '204': { description: 'Logged out' } } } },
    '/api/campaigns': {
      post: {
        tags: ['Campaigns'],
        summary: 'Schedule a batch of emails',
        description: 'Persists all emails in MySQL, then enqueues one BullMQ delayed job per email (jobId = email id).',
        security: auth,
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ScheduleRequest' } } } },
        responses: { '201': { description: 'Scheduled', content: { 'application/json': { schema: { $ref: '#/components/schemas/ScheduleResponse' } } } }, '400': err, '401': err },
      },
      get: { tags: ['Campaigns'], summary: 'List recent campaigns', security: auth, responses: { '200': { description: 'Campaigns' }, '401': err } },
    },
    '/api/emails/scheduled': { get: { tags: ['Emails'], summary: 'Emails waiting to be sent (scheduled / sending)', security: auth, parameters: pageParams, responses: { '200': emailList, '401': err } } },
    '/api/emails/sent': { get: { tags: ['Emails'], summary: 'Emails that were sent or failed', security: auth, parameters: pageParams, responses: { '200': emailList, '401': err } } },
    '/api/emails/search': {
      get: {
        tags: ['Emails'],
        summary: 'Full-text search (Elasticsearch)',
        security: auth,
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Matches recipient, subject, body, sender' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['scheduled', 'sending', 'sent', 'failed'] } },
          ...pageParams,
        ],
        responses: { '200': { description: 'Search hits' }, '401': err },
      },
    },
    '/api/senders': {
      get: { tags: ['Senders'], summary: 'List sender accounts', security: auth, responses: { '200': { description: 'Senders' } } },
      post: {
        tags: ['Senders'],
        summary: 'Create a new Ethereal sender (calls the Ethereal API)',
        security: auth,
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { fromName: { type: 'string' } } } } } },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/senders/{id}': { delete: { tags: ['Senders'], summary: 'Delete a sender without emails', security: auth, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '204': { description: 'Deleted' }, '409': err } } },
    '/api/slack/connect': { get: { tags: ['Slack'], summary: 'Start Slack OAuth (redirects to Slack)', security: auth, responses: { '302': { description: 'Redirect to Slack' } } } },
    '/api/slack/callback': { get: { tags: ['Slack'], summary: 'Slack OAuth callback; stores the encrypted incoming webhook', security: auth, responses: { '302': { description: 'Redirect to frontend' } } } },
    '/api/slack/status': { get: { tags: ['Slack'], summary: 'Is Slack connected?', security: auth, responses: { '200': { description: 'Status' } } } },
    '/api/slack/test': { post: { tags: ['Slack'], summary: 'Send a real test message to the connected Slack channel', security: auth, responses: { '200': { description: 'Sent' }, '400': err } } },
    '/api/slack': { delete: { tags: ['Slack'], summary: 'Disconnect Slack', security: auth, responses: { '204': { description: 'Disconnected' } } } },
  },
  components: {
    securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'session' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } },
      User: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, avatarUrl: { type: 'string', nullable: true } } },
      ScheduleRequest: {
        type: 'object',
        required: ['subject', 'body', 'emails', 'startTime', 'delaySeconds', 'hourlyLimit'],
        properties: {
          subject: { type: 'string' },
          body: { type: 'string' },
          emails: { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 10000 },
          startTime: { type: 'string', format: 'date-time' },
          delaySeconds: { type: 'integer', minimum: 0, description: 'Gap between consecutive emails' },
          hourlyLimit: { type: 'integer', minimum: 1, description: 'Max emails per sender per hour (capped by MAX_EMAILS_PER_HOUR_PER_SENDER)' },
          senderIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Defaults to all of the user\'s senders' },
        },
      },
      ScheduleResponse: {
        type: 'object',
        properties: {
          campaignId: { type: 'string' },
          total: { type: 'integer' },
          senders: { type: 'integer' },
          effectiveHourlyLimit: { type: 'integer' },
          firstSendAt: { type: 'string', format: 'date-time' },
          lastSendAt: { type: 'string', format: 'date-time' },
        },
      },
      Email: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          to: { type: 'string' },
          subject: { type: 'string' },
          status: { type: 'string', enum: ['scheduled', 'sending', 'sent', 'failed'] },
          scheduledAt: { type: 'string', format: 'date-time' },
          sentAt: { type: 'string', format: 'date-time', nullable: true },
          senderEmail: { type: 'string' },
          previewUrl: { type: 'string', nullable: true, description: 'Ethereal message preview link' },
          error: { type: 'string', nullable: true },
        },
      },
      EmailPage: {
        type: 'object',
        properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Email' } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' } },
      },
    },
  },
} as const;
