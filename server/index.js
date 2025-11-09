import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.static(path.join(__dirname, "../public")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ["websocket"],
  secure: true
});

// ---- Список всех пользователей ----
let users = [];

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  users.push(socket.id);

  socket.on("offer", (data) => {
    socket.to(data.to).emit("offer", {
      from: socket.id,
      sdp: data.sdp,
    });
  });

  socket.on("answer", (data) => {
    socket.to(data.to).emit("answer", {
      from: socket.id,
      sdp: data.sdp,
    });
  });

  socket.on("candidate", (data) => {
    socket.to(data.to).emit("candidate", {
      from: socket.id,
      candidate: data.candidate,
    });
  });

 socket.on("next", () => {
  const nextUser = users.find(u => u !== socket.id);
  if (nextUser) {
    socket.emit("offerRequest", { to: nextUser });
    socket.to(nextUser).emit("nextPartner", { from: socket.id });
  } else {
    socket.emit("waiting");
  }
});

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    users = users.filter((id) => id !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
