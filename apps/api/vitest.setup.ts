import dotenv from 'dotenv';
import path from 'path';

// 1. Load test environment variables (.env.test) first
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

// 2. Fall back to standard .env for any unspecified variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// 3. Guarantees for test execution
process.env.NODE_ENV = 'test';
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}