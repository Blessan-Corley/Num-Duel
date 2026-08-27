function registerHealthRoutes(gameServer) {
  // A lightweight endpoint for uptime monitoring tools (e.g., UptimeRobot)
  // to prevent Render cold starts without calling DB or Redis (saving Neon DB compute time).
  gameServer.app.get('/api/ping', (req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'pong',
      timestamp: new Date().toISOString(),
    });
  });

  gameServer.app.get(
    '/api/health',
    gameServer.withReady(async (req, res) => {
      const [storeHealth, databaseHealth] = await Promise.all([
        gameServer.store.healthCheck(),
        gameServer.database.healthCheck(),
      ]);

      res.json({
        status: storeHealth.healthy && databaseHealth.healthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../../../config/config').APP_VERSION,
        activeParties: await gameServer.partyService.getActivePartiesCount(),
        activePlayers: await gameServer.partyService.getActivePlayersCount(),
        store: storeHealth,
        database: databaseHealth,
      });
    })
  );

  gameServer.app.get(
    '/api/readiness',
    gameServer.withReady(async (req, res) => {
      const [storeHealth, databaseHealth] = await Promise.all([
        gameServer.store.healthCheck(),
        gameServer.database.healthCheck(),
      ]);
      const ready = storeHealth.healthy && databaseHealth.healthy;

      res.status(ready ? 200 : 503).json({
        ready,
        store: storeHealth,
        database: databaseHealth,
      });
    })
  );
}

module.exports = registerHealthRoutes;
