const http = require('http');

class HealthChecker {
  constructor() {
    this.startTime = Date.now();
    this.requestCount = 0;
  }

  /**
   * Create health check endpoint
   * @param {number} port - Server port
   */
  createHealthEndpoint(port) {
    const server = http.createServer((req, res) => {
      this.requestCount++;
      
      if (req.url === '/health') {
        const uptime = Date.now() - this.startTime;
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          uptime: uptime,
          requests: this.requestCount,
          timestamp: new Date().toISOString()
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(port, () => {
      console.log(`Health check endpoint running on port ${port}`);
    });

    return server;
  }

  /**
   * Get health status
   * @returns {Object} Health status
   */
  getStatus() {
    return {
      status: 'healthy',
      uptime: Date.now() - this.startTime,
      requests: this.requestCount,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { HealthChecker }; 