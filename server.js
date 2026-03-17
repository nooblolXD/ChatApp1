const express = require("express");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// file upload
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// helpers
const readUsers = () => JSON.parse(fs.readFileSync("users.json"));
const writeUsers = (d) => fs.writeFileSync("users.json", JSON.stringify(d, null, 2));

const readMsgs = () => JSON.parse(fs.readFileSync("messages.json"));
const writeMsgs = (d) => fs.writeFileSync("messages.json", JSON.stringify(d, null, 2));

// REGISTER
app.get("/register", (req, res) => {
  const { user, pass } = req.query;
  let users = readUsers();

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
  res.json({ file: req.file.filename });
});

// SOCKET
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

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});