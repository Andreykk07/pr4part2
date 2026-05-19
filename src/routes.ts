import { Router, Response } from 'express';
import { pool } from './db';

const router = Router();

router.post('/', async (req, res) => {
  const { title, content, tags, status, ownerId } = req.body;
  const result = await pool.query(
    'INSERT INTO posts (title, content, tags, status, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [title, content, tags || [], status || 'draft', ownerId || 1]
  );
  res.status(201).json(result.rows[0]);
});

router.get('/', async (req, res) => {
  const { tag, status, page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let queryText = 'SELECT * FROM posts WHERE 1=1';
  const params: any[] = [];

  if (tag) {
    params.push(tag);
    queryText += ` AND $${params.length} = ANY(tags)`;
  }
  if (status) {
    params.push(status);
    queryText += ` AND status = $${params.length}`;
  }

  params.push(Number(limit), offset);
  queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const result = await pool.query(queryText, params);
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.put('/:id', async (req, res) => {
  const { title, content, tags, status, userId } = req.body;
  const check = await pool.query('SELECT owner_id FROM posts WHERE id = $1', [req.params.id]);
  if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  if (check.rows[0].owner_id !== userId) return res.status(403).json({ error: 'Forbidden' });

  const result = await pool.query(
    'UPDATE posts SET title = $1, content = $2, tags = $3, status = $4 WHERE id = $5 RETURNING *',
    [title, content, tags, status, req.params.id]
  );
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { userId, role } = req.body;
  const check = await pool.query('SELECT owner_id FROM posts WHERE id = $1', [req.params.id]);
  if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  if (check.rows[0].owner_id !== userId && role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
  res.status(204).send();
});

router.post('/:id/publish', async (req, res) => {
  const check = await pool.query('SELECT status FROM posts WHERE id = $1', [req.params.id]);
  if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  const result = await pool.query(
    "UPDATE posts SET status = 'published' WHERE id = $1 RETURNING *",
    [req.params.id]
  );
  res.json(result.rows[0]);
});

// --- TDD Реалізація функції getRelatedPosts ---
router.get('/:id/related', async (req, res) => {
  const postId = req.params.id;
  const limit = req.query.limit ? Number(req.query.limit) : 3;

  const originRes = await pool.query('SELECT tags FROM posts WHERE id = $1', [postId]);
  if (originRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });

  const originTags = originRes.rows[0].tags;

  const relatedRes = await pool.query(
    `SELECT *, CARDINALITY(ARRAY(SELECT UNNEST(tags) INTERSECT SELECT UNNEST($1::text[]))) as common_count
     FROM posts 
     WHERE id != $2 AND status = 'published' AND tags && $1
     ORDER BY common_count DESC, id DESC 
     LIMIT $3`,
    [originTags, postId, limit]
  );

  res.json(relatedRes.rows);
});

export default router;
