import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

// --- Настройка путей ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.static(path.join(__dirname, "../public")));

const server = http.createServer(app);

// --- Настройка Socket.io ---
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket"],
  secure: true,
});

// ---- Список пользователей ----
let users = [];

// ---- Логика соединения ----
io.on("connection", (socket) => {
  console.log("✅ Пользователь подключен:", socket.id);
  users.push(socket.id);

  // Передача offer
  socket.on("offer", (data) => {
    socket.to(data.to).emit("offer", {
      from: socket.id,
      sdp: data.sdp,
    });
  });

  // Передача answer
  socket.on("answer", (data) => {
    socket.to(data.to).emit("answer", {
      from: socket.id,
      sdp: data.sdp,
    });
  });

  // Передача ICE кандидатов
  socket.on("candidate", (data) => {
    socket.to(data.to).emit("candidate", {
      from: socket.id,
      candidate: data.candidate,
    });
  });

  // Кнопка "Следующий собеседник"
  socket.on("next", () => {
    const nextUser = users.find((u) => u !== socket.id);
    if (nextUser) {
      socket.emit("offerRequest", { to: nextUser });
      socket.to(nextUser).emit("nextPartner", { from: socket.id });
    } else {
      socket.emit("waiting");
    }
  });

  // Отключение пользователя
  socket.on("disconnect", () => {
    console.log("❌ Пользователь отключен:", socket.id);
    users = users.filter((id) => id !== socket.id);
  });
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
