import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      tags TEXT[] DEFAULT '{}',
      status VARCHAR(50) NOT NULL,
      owner_id INT NOT NULL
    );
  `);
};

export const clearDb = async () => {
  await pool.query('TRUNCATE TABLE posts RESTART IDENTITY CASCADE;');
};
