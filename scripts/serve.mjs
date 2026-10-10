import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.FLIX_SERVE_DIR || 'public');
const port = Number(process.env.PORT || 4173);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gz': 'application/octet-stream'};
http.createServer(async (request, response) => {
  try {
    let filename = path.resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) throw new Error('Forbidden');
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    const data = await readFile(filename);
    response.writeHead(200, {'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff'});
    response.end(data);
  } catch {
    response.writeHead(404, {'Content-Type': 'text/plain'});
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Flix is running at http://127.0.0.1:${port}`));
