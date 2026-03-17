const express = require("express");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// =====================
// ✅ FILE SAFETY (IMPORTANT)
// =====================
if (!fs.existsSync("users.json")) {
  fs.writeFileSync("users.json", "[]");
}

if (!fs.existsSync("messages.json")) {
  fs.writeFileSync("messages.json", "[]");
}

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// =====================
// MIDDLEWARE
// =====================
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// =====================
// FILE UPLOAD SETUP
// =====================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// =====================
// HELPERS
// =====================
const readUsers = () => JSON.parse(fs.readFileSync("users.json"));
const writeUsers = (d) => fs.writeFileSync("users.json", JSON.stringify(d, null, 2));

const readMsgs = () => JSON.parse(fs.readFileSync("messages.json"));
const writeMsgs = (d) => fs.writeFileSync("messages.json", JSON.stringify(d, null, 2));

// =====================
// ROUTES
// =====================

// REGISTER
app.get("/register", (req, res) => {
  const { user, pass } = req.query;
  let users = readUsers();

  if (!user || !pass) return res.send("INVALID");

  if (users.find(u => u.user === user)) return res.send("EXISTS");

  users.push({ user, pass });
  writeUsers(users);

  res.send("OK");
});

// LOGIN
app.get("/login", (req, res) => {
  const { user, pass } = req.query;
  let users = readUsers();

  const found = users.find(u => u.user === user && u.pass === pass);
  res.send(found ? "OK" : "FAIL");
});

// GET USERS
app.get("/users", (req, res) => {
  res.json(readUsers());
});

// UPLOAD
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send("No file");
  res.json({ file: req.file.filename });
});

// =====================
// 🔐 ADMIN RESET ROUTE (NEW)
// =====================
app.get("/allMessages", (req, res) => {
  const { pass } = req.query;

  if (pass !== "devadathb2009") {
    return res.status(403).send("Forbidden");
  }

  const messages = readMsgs();
  res.json(messages);
});

// =====================
// SOCKET.IO
// =====================
io.on("connection", (socket) => {

  socket.on("joinRoom", ({ user, target }) => {
    const room = [user, target].sort().join("_");
    socket.join(room);

    let messages = readMsgs();

    const chat = messages.filter(m =>
      (m.from === user && m.to === target) ||
      (m.from === target && m.to === user)
    );

    socket.emit("loadMessages", chat);
  });

  socket.on("sendMessage", (data) => {
    let messages = readMsgs();

    data.id = Date.now();
    data.status = "sent";

    messages.push(data);
    writeMsgs(messages);

    const room = [data.from, data.to].sort().join("_");
    io.to(room).emit("receiveMessage", data);
  });

  socket.on("messageDelivered", (id) => {
    let messages = readMsgs();

    messages = messages.map(m => {
      if (m.id === id && m.status === "sent") m.status = "delivered";
      return m;
    });

    writeMsgs(messages);
  });

  socket.on("messageSeen", (id) => {
    let messages = readMsgs();

    messages = messages.map(m => {
      if (m.id === id) m.status = "seen";
      return m;
    });

    writeMsgs(messages);

    io.emit("messageSeenUpdate", id);
  });

});

// =====================
// ✅ SERVER START (FIXED FOR RENDER)
// =====================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});