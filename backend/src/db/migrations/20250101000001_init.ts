import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.string('id', 36).primary();
    t.string('google_id', 64).notNullable().unique();
    t.string('email', 255).notNullable().unique();
    t.string('name', 255).notNullable();
    t.string('avatar_url', 1024).nullable();
    t.timestamp('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    t.timestamp('updated_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  await knex.schema.createTable('senders', (t) => {
    t.string('id', 36).primary();
    t.string('user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('email', 255).notNullable();
    t.string('from_name', 255).notNullable();
    t.string('smtp_host', 255).notNullable();
    t.integer('smtp_port').notNullable();
    t.boolean('smtp_secure').notNullable().defaultTo(false);
    t.string('smtp_user', 255).notNullable();
    t.text('smtp_pass_enc').notNullable();
    t.timestamp('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    t.unique(['user_id', 'email']);
  });

  await knex.schema.createTable('campaigns', (t) => {
    t.string('id', 36).primary();
    t.string('user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('subject', 998).notNullable();
    t.text('body', 'longtext').notNullable();
    t.timestamp('start_time', { precision: 3 }).notNullable();
    t.integer('delay_seconds').notNullable();
    t.integer('hourly_limit').notNullable();
    t.integer('total').notNullable();
    t.timestamp('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  await knex.schema.createTable('emails', (t) => {
    t.string('id', 36).primary(); // also the BullMQ jobId -> idempotency key
    t.string('campaign_id', 36).notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.string('user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('sender_id', 36).notNullable().references('id').inTable('senders');
    t.string('to_email', 255).notNullable();
    t.string('subject', 998).notNullable();
    t.text('body', 'longtext').notNullable();
    t.enu('status', ['scheduled', 'sending', 'sent', 'failed']).notNullable().defaultTo('scheduled');
    t.timestamp('scheduled_at', { precision: 3 }).notNullable();
    t.timestamp('sent_at', { precision: 3 }).nullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.integer('reschedule_count').notNullable().defaultTo(0);
    t.integer('seq').notNullable().defaultTo(0);
    t.string('message_id', 255).nullable();
    t.string('preview_url', 1024).nullable();
    t.text('error').nullable();
    t.timestamp('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    t.timestamp('updated_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    t.index(['user_id', 'status', 'scheduled_at']);
    t.index(['user_id', 'status', 'sent_at']);
    t.index(['campaign_id']);
  });

  await knex.schema.createTable('slack_connections', (t) => {
    t.string('id', 36).primary();
    t.string('user_id', 36).notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    t.string('team_name', 255).nullable();
    t.string('channel', 255).nullable();
    t.text('webhook_url_enc').notNullable();
    t.timestamp('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('slack_connections');
  await knex.schema.dropTableIfExists('emails');
  await knex.schema.dropTableIfExists('campaigns');
  await knex.schema.dropTableIfExists('senders');
  await knex.schema.dropTableIfExists('users');
}
