import fs from "fs";
import path from "path";
import express from "express";
import http from "http";
import helmet from "helmet";
import cors from "cors";
import { Server as IOServer } from "socket.io";

const __dirname = path.resolve();

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: "*"}
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const SETTINGS_FILE = path.join(__dirname, "server", "settings.json");
let settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));

// === простейший стор для статистики ===
const queues = { male: [], female: [] };
const peers = new Map(); // socketId -> {gender, roomId}
const rooms = new Map(); // roomId -> {a, b}

const makeRoomId = () => "r_" + Math.random().toString(36).slice(2, 10);

// === admin api ===
const ADMIN_CODE = process.env.ADMIN_CODE || "supersecret123";

app.get("/api/admin/stats", (req, res) => {
  res.json({
    online: io.engine.clientsCount,
    queues: { male: queues.male.length, female: queues.female.length },
    rooms: rooms.size
  });
});

app.get("/api/admin/settings", (req, res) => {
  const code = req.query.code || "";
  if (code !== ADMIN_CODE) return res.status(403).json({ ok: false });
  res.json({ ok: true, settings });
});

app.post("/api/admin/settings", (req, res) => {
  const code = req.query.code || "";
  if (code !== ADMIN_CODE) return res.status(403).json({ ok: false });
  try {
    const next = req.body || {};
    settings = { ...settings, ...next };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    res.json({ ok: true, settings });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === «оплатить»: редирект-форма с автозаполнением ===
app.post("/api/pay/kaspi", (req, res) => {
  const { minutes = 30, amount = settings.priceUSDfor30 } = req.body || {};
  // здесь «демо»-сборка формы; у Kaspi нет универсального публичного checkout-линка.
  // обычно это ваш эквайринг/ссылка продавца. мы формируем страницу с автосабмитом.
  const m = settings.payments.kaspi;
  const amountText = String(amount);
  const descr = `${m.description || "LoveMeet"} (${minutes} min)`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Kaspi</title></head>
<body>
<p>Переходим в Kaspi…</p>
<form id="f" method="post" action="https://pay.kaspi.kz/pay/${m.merchantId}">
  <input type="hidden" name="receiver" value="${escapeHtml(m.receiver || "")}">
  <input type="hidden" name="amount" value="${escapeHtml(amountText)}">
  <input type="hidden" name="description" value="${escapeHtml(descr)}">
</form>
<script>document.getElementById('f').submit();</script>
</body></html>`);
});

app.post("/api/pay/webmoney", (req, res) => {
  const { minutes = 30, amount = settings.priceUSDfor30 } = req.body || {};
  const wm = settings.payments.webmoney;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>WebMoney</title></head>
<body>
<p>Переходим в WebMoney…</p>
<form id="f" method="post" action="https://merchant.webmoney.ru/lmi/payment.asp">
  <input type="hidden" name="LMI_PAYEE_PURSE" value="${escapeHtml(wm.purse)}">
  <input type="hidden" name="LMI_PAYMENT_AMOUNT" value="${escapeHtml(String(amount))}">
  <input type="hidden" name="LMI_PAYMENT_DESC" value="${escapeHtml("LoveMeet minutes " + minutes)}">
</form>
<script>document.getElementById('f').submit();</script>
</body></html>`);
});

// === сокеты / сигнальный сервер WebRTC ===
io.on("connection", (socket) => {
  peers.set(socket.id, { gender: "unknown", roomId: null });

  socket.on("join", ({ gender }) => {
    const g = (gender === "female") ? "female" : "male";
    peers.set(socket.id, { gender: g, roomId: null });

    const otherQueue = g === "male" ? queues.female : queues.male;

    if (otherQueue.length > 0) {
      const partnerId = otherQueue.shift();
      if (io.sockets.sockets.get(partnerId)) {
        const roomId = makeRoomId();
        rooms.set(roomId, { a: partnerId, b: socket.id });
        peers.get(partnerId).roomId = roomId;
        peers.get(socket.id).roomId = roomId;
        socket.join(roomId);
        io.to(partnerId).socketsJoin(roomId);

        io.to(roomId).emit("matched", { roomId });
      } else {
        queues[g].push(socket.id);
      }
    } else {
      queues[g].push(socket.id);
    }
  });

  socket.on("signal", (data) => {
    const p = peers.get(socket.id);
    if (!p?.roomId) return;
    socket.to(p.roomId).emit("signal", data);
  });

  socket.on("leave", () => {
    cleanupSocket(socket.id);
  });

  socket.on("disconnect", () => {
    cleanupSocket(socket.id);
  });
});

function cleanupSocket(id) {
  // убрать из очередей
  ["male", "female"].forEach((g) => {
    const idx = queues[g].indexOf(id);
    if (idx >= 0) queues[g].splice(idx, 1);
  });

  const p = peers.get(id);
  if (!p) return;
  if (p.roomId && rooms.has(p.roomId)) {
    const room = rooms.get(p.roomId);
    const other = room.a === id ? room.b : room.a;
    if (other && io.sockets.sockets.get(other)) {
      io.to(other).emit("partner-left");
    }
    rooms.delete(p.roomId);
  }
  peers.delete(id);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, (c) =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;" }[c])
  );
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("LoveMeet running on", PORT);
});
