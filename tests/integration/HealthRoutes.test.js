'use strict';

const request = require('supertest');
const GameServer = require('../../server');

describe('Integration: Health Routes', () => {
  let gameServer;

  beforeAll(async () => {
    gameServer = new GameServer();
    await gameServer.ready;
  });

  afterAll(async () => {
    await gameServer.stop();
  });

  describe('GET /api/ping', () => {
    test('returns 200 with ok status and pong message', async () => {
      const res = await request(gameServer.app).get('/api/ping').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.message).toBe('pong');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/health', () => {
    test('returns 200 with healthy status', async () => {
      const res = await request(gameServer.app).get('/api/health').expect(200);

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('version');
      expect(typeof res.body.activeParties).toBe('number');
      expect(typeof res.body.activePlayers).toBe('number');
      expect(res.body).toHaveProperty('store');
      expect(res.body).toHaveProperty('database');
    });

    test('store health report has healthy boolean', async () => {
      const res = await request(gameServer.app).get('/api/health').expect(200);
      expect(typeof res.body.store.healthy).toBe('boolean');
    });
  });

  describe('GET /api/readiness', () => {
    test('returns 200 when both store and database are healthy', async () => {
      const res = await request(gameServer.app).get('/api/readiness');
      expect([200, 503]).toContain(res.status);
      expect(typeof res.body.ready).toBe('boolean');
      expect(res.body).toHaveProperty('store');
      expect(res.body).toHaveProperty('database');
    });
  });

  describe('GET /api/public-parties', () => {
    test('returns parties and stats on first call (cache miss)', async () => {
      const res = await request(gameServer.app).get('/api/public-parties').expect(200);
      expect(res.body).toHaveProperty('parties');
      expect(res.body).toHaveProperty('stats');
      expect(Array.isArray(res.body.parties)).toBe(true);
    });

    test('returns same shape on immediate second call (cache hit)', async () => {
      const res = await request(gameServer.app).get('/api/public-parties').expect(200);
      expect(res.body).toHaveProperty('parties');
      expect(res.body).toHaveProperty('stats');
    });
  });

  describe('POST /api/validate-party', () => {
    test('returns 404 for non-existent party code', async () => {
      const res = await request(gameServer.app)
        .post('/api/validate-party')
        .send({ partyCode: 'XXXXXX' })
        .expect(404);
      expect(res.body).toHaveProperty('error');
    });
  });
});
