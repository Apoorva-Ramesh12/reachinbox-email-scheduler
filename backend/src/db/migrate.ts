import { db } from './knex';
import { logger } from '../config/logger';

export async function migrateLatest(): Promise<void> {
  const [batch, files] = await db.migrate.latest();
  logger.info({ batch, files }, files.length ? 'Migrations applied' : 'Database already up to date');
}

async function main() {
  const cmd = process.argv[2] ?? 'latest';
  if (cmd === 'rollback') {
    const [batch, files] = await db.migrate.rollback();
    logger.info({ batch, files }, 'Rolled back');
  } else {
    await migrateLatest();
  }
  await db.destroy();
}

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  });
}
