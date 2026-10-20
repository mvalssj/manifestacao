'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');

// 3000 fica de fora: neste PC há um portproxy do Windows prendendo essa porta
const PORT = Number(process.env.PORT) || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const MAX_PER_ROOM = 50;
const TICK_MS = 66;
const BOUNDS = { x: 21, z: 290 };

const SIDES = ['amarelo', 'vermelho', 'verde', 'azul', 'branco', 'roxo'];
const HATS = ['nenhum', 'bone', 'chapeu', 'bandana'];
const ITEMS = ['bandeira', 'cartaz', 'nenhum'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

// ---------- arquivos estáticos ----------
const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }

  let root = PUBLIC_DIR;
  if (urlPath.startsWith('/vendor/three/')) {
    root = THREE_DIR;
    urlPath = urlPath.slice('/vendor/three'.length);
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const file = path.join(root, urlPath);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ---------- validação ----------
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const round2 = (v) => Math.round(v * 100) / 100;

function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function cleanRoom(s) {
  return cleanText(s, 16).toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'PAULISTA';
}

function cleanLook(l) {
  l = l && typeof l === 'object' ? l : {};
  return {
    side: SIDES.includes(l.side) ? l.side : 'amarelo',
    skin: clamp(Math.round(num(l.skin, 1)), 0, 5),
    hat: HATS.includes(l.hat) ? l.hat : 'nenhum',
    item: ITEMS.includes(l.item) ? l.item : 'bandeira',
    sign: cleanText(l.sign, 40),
  };
}

const pub = (p) => ({ id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, z: p.z, ry: p.ry });

// ---------- salas ----------
const rooms = new Map();
let nextId = 1;

function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { code, players: new Map() };
    rooms.set(code, room);
  }
  return room;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.id !== exceptId && p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws) => {
  let player = null;
  let room = null;
  let chatTimes = [];
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (!player) {
      if (msg.t !== 'join') return;
      room = getRoom(cleanRoom(msg.room));
      if (room.players.size >= MAX_PER_ROOM) {
        send(ws, { t: 'error', msg: 'Esta sala está cheia.' });
        ws.close();
        return;
      }
      player = {
        id: nextId++,
        ws,
        name: cleanText(msg.name, 20) || 'Manifestante',
        look: cleanLook(msg.look),
        x: round2(Math.random() * 16 - 8),
        y: 0,
        z: round2(Math.random() * 20 - 10),
        ry: Math.PI,
        moving: false,
        dirty: false,
      };
      room.players.set(player.id, player);
      send(ws, { t: 'welcome', id: player.id, room: room.code, players: [...room.players.values()].map(pub) });
      broadcast(room, { t: 'join', p: pub(player) }, player.id);
      return;
    }

    switch (msg.t) {
      case 'move':
        player.x = clamp(num(msg.x, player.x), -BOUNDS.x, BOUNDS.x);
        player.y = clamp(num(msg.y, player.y), 0, 5);
        player.z = clamp(num(msg.z, player.z), -BOUNDS.z, BOUNDS.z);
        player.ry = num(msg.ry, player.ry);
        player.moving = !!msg.m;
        player.dirty = true;
        break;
      case 'chat': {
        const now = Date.now();
        chatTimes = chatTimes.filter((t) => now - t < 5000);
        if (chatTimes.length >= 5) return;
        const text = cleanText(msg.text, 120);
        if (!text) return;
        chatTimes.push(now);
        broadcast(room, { t: 'chat', id: player.id, text }, player.id);
        break;
      }
      case 'look':
        player.look = cleanLook(msg.look);
        broadcast(room, { t: 'look', id: player.id, look: player.look });
        break;
    }
  });

  ws.on('close', () => {
    if (!player || !room) return;
    room.players.delete(player.id);
    broadcast(room, { t: 'leave', id: player.id });
    if (room.players.size === 0) rooms.delete(room.code);
  });
});

// posições: só envia quem se mexeu desde o último tick
setInterval(() => {
  for (const room of rooms.values()) {
    const s = [];
    for (const p of room.players.values()) {
      if (!p.dirty) continue;
      s.push([p.id, round2(p.x), round2(p.y), round2(p.z), round2(p.ry), p.moving ? 1 : 0]);
      p.dirty = false;
    }
    if (s.length) broadcast(room, { t: 's', s });
  }
}, TICK_MS);

// derruba conexões mortas
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`\nDomingo na Paulista rodando!`);
  console.log(`  Neste PC:        http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Na rede local:   http://${a.address}:${PORT}`);
    }
  }
  console.log('');
});
