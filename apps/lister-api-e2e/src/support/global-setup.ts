import { waitForPortOpen } from '@nx/node/utils';

// Runs once before all e2e files. Start or wait for services the API needs here.
export default async function setup() {
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await waitForPortOpen(port, { host });
}
