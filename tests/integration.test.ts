import request from 'supertest';
import app from '../src/app';
import { pool, initDb, clearDb } from '../src/db';

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await clearDb();
});

afterAll(async () => {
  await pool.end();
});

describe('Blog API Integration Tests', () => {
  
  // 1. POST /posts
  it('should create a draft post by default', async () => {
    const res = await request(app)
      .post('/posts')
      .send({ title: 'TDD Workflow', content: 'Red Green Refactor', tags: ['testing'], ownerId: 10 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
  });

  // 2. GET /posts
  it('should get posts list with pagination filters', async () => {
    await request(app).post('/posts').send({ title: 'P1', content: 'C1', tags: ['node'], status: 'published' });
    await request(app).post('/posts').send({ title: 'P2', content: 'C2', tags: ['js'], status: 'draft' });

    const res = await request(app).get('/posts?status=published');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('P1');
  });

  it('should filter posts accurately by active tags', async () => {
    await request(app).post('/posts').send({ title: 'P1', content: 'C1', tags: ['go'] });
    await request(app).post('/posts').send({ title: 'P2', content: 'C2', tags: ['rust'] });

    const res = await request(app).get('/posts?tag=rust');
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe('P2');
  });

  // 3. GET /posts/:id
  it('should return a specific post data profile by id', async () => {
    const post = await request(app).post('/posts').send({ title: 'Find Me', content: 'Text' });
    const res = await request(app).get(`/posts/${post.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Find Me');
  });

  it('should throw 404 error if entity key is missing', async () => {
    const res = await request(app).get('/posts/99999');
    expect(res.status).toBe(404);
  });

  // 4. PUT /posts/:id
  it('allows resource modification updates if matching user is owner', async () => {
    const post = await request(app).post('/posts').send({ title: 'Init', content: 'Body', ownerId: 42 });
    const res = await request(app)
      .put(`/posts/${post.body.id}`)
      .send({ title: 'Updated', content: 'Body', tags: [], status: 'draft', userId: 42 });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
  });

  it('blocks modification updates if user is not resource owner', async () => {
    const post = await request(app).post('/posts').send({ title: 'Init', content: 'Body', ownerId: 42 });
    const res = await request(app)
      .put(`/posts/${post.body.id}`)
      .send({ title: 'Hack', content: 'Body', tags: [], status: 'draft', userId: 99 });
    expect(res.status).toBe(403);
  });

  // 5. DELETE /posts/:id
  it('allows resource destruction if caller matches owner identity', async () => {
    const post = await request(app).post('/posts').send({ title: 'Kill', content: 'B', ownerId: 12 });
    const res = await request(app).delete(`/posts/${post.body.id}`).send({ userId: 12 });
    expect(res.status).toBe(204);
  });

  it('allows absolute deletion rights if caller is an admin override role', async () => {
    const post = await request(app).post('/posts').send({ title: 'Kill', content: 'B', ownerId: 12 });
    const res = await request(app).delete(`/posts/${post.body.id}`).send({ userId: 99, role: 'admin' });
    expect(res.status).toBe(204);
  });

  it('blocks deletion if caller lacks owner privileges or admin clearance', async () => {
    const post = await request(app).post('/posts').send({ title: 'Save', content: 'B', ownerId: 12 });
    const res = await request(app).delete(`/posts/${post.body.id}`).send({ userId: 99, role: 'reader' });
    expect(res.status).toBe(403);
  });

  // 6. POST /posts/:id/publish
  it('transitions state field from draft status to published status', async () => {
    const post = await request(app).post('/posts').send({ title: 'Draft', content: 'B', status: 'draft' });
    const res = await request(app).post(`/posts/${post.body.id}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
  });

  // 7. TDD Test Scenarios: getRelatedPosts
  it('should return empty collection arrays if no matching tag overlap exists', async () => {
    const p1 = await request(app).post('/posts').send({ title: 'O1', content: 'B', tags: ['a'], status: 'published' });
    await request(app).post('/posts').send({ title: 'O2', content: 'B', tags: ['b'], status: 'published' });

    const res = await request(app).get(`/posts/${p1.body.id}/related`);
    expect(res.body.length).toBe(0);
  });

  it('should strictly fetch cross matches whose status is set published', async () => {
    const p1 = await request(app).post('/posts').send({ title: 'O1', content: 'B', tags: ['node'], status: 'published' });
    await request(app).post('/posts').send({ title: 'O2', content: 'B', tags: ['node'], status: 'draft' });

    const res = await request(app).get(`/posts/${p1.body.id}/related`);
    expect(res.body.length).toBe(0);
  });

  it('should prioritize and sort outputs by highest count of tag intersections', async () => {
    const target = await request(app).post('/posts').send({ title: 'Base', content: 'B', tags: ['js', 'ts', 'node'], status: 'published' });
    await request(app).post('/posts').send({ title: 'Low Match', content: 'B', tags: ['js'], status: 'published' });
    await request(app).post('/posts').send({ title: 'High Match', content: 'B', tags: ['js', 'ts'], status: 'published' });

    const res = await request(app).get(`/posts/${target.body.id}/related`);
    expect(res.body.length).toBe(2);
    expect(res.body[0].title).toBe('High Match');
  });

  it('should enforce strict response list truncation limits based on parameters', async () => {
    const target = await request(app).post('/posts').send({ title: 'Base', content: 'B', tags: ['js'], status: 'published' });
    await request(app).post('/posts').send({ title: 'M1', content: 'B', tags: ['js'], status: 'published' });
    await request(app).post('/posts').send({ title: 'M2', content: 'B', tags: ['js'], status: 'published' });

    const res = await request(app).get(`/posts/${target.body.id}/related?limit=1`);
    expect(res.body.length).toBe(1);
  });

  it('should bounce a 404 response structure if root base index does not exist', async () => {
    const res = await request(app).get('/posts/99999/related');
    expect(res.status).toBe(404);
  });
});
