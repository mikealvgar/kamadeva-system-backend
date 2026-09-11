import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import type { TestProject } from 'vitest/node';

const execFile = promisify(execFileCallback);

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Own one disposable database per run; never connect to the project's .env. */
export default async function setup(project: TestProject) {
  const name = `kamadeva-auth-test-${randomUUID()}`;
  const { stdout } = await execFile(
    'docker',
    [
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_USER=auth_test',
      '-e',
      'POSTGRES_PASSWORD=auth_test',
      '-e',
      'POSTGRES_DB=auth_test',
      'postgres:16',
    ],
    { timeout: 120000 },
  );
  const id = stdout.trim();
  const cleanup = async () => {
    await execFile('docker', ['stop', '--time', '1', id]);
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await execFile('docker', [
          'exec',
          id,
          'pg_isready',
          '-h',
          '127.0.0.1',
          '-U',
          'auth_test',
          '-d',
          'auth_test',
        ]);
        ready = true;
        break;
      } catch {
        await setTimeout(500);
      }
    }
    if (!ready) throw new Error('PostgreSQL de pruebas no arrancó');
    const { stdout: port } = await execFile('docker', ['port', id, '5432/tcp']);
    const databaseUrl = `postgresql://auth_test:auth_test@${port.trim()}/auth_test`;
    await execFile(
      process.execPath,
      [
        'node_modules/prisma/build/index.js',
        'migrate',
        'deploy',
        '--config',
        'prisma7.config.ts',
      ],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 60000,
      },
    );
    project.provide('databaseUrl', databaseUrl);
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
