const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Statische Dateien servieren
app.use(express.static("public"));

// Raum-Daten speichern
const rooms = new Map();

// Socket.IO Event-Handler
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Raum beitreten
  socket.on("join-room", (data) => {
    const { roomId, username, color } = data;
    socket.join(roomId);

    // Raum initialisieren falls nicht vorhanden
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        drawings: [],
        userInfo: {},
      });
    }

    const room = rooms.get(roomId);
    room.users.add(socket.id);

    // Benutzer-Info sofort speichern
    room.userInfo[socket.id] = {
      username: username || "Anonymous",
      color: color || "#ff6b6b",
    };

    console.log(
      `User ${socket.id} joined room ${roomId} with info: ${username}, ${color}`
    );

    // Aktuelle Canvas-Daten an neuen Benutzer senden
    if (room.drawings.length > 0) {
      socket.emit("canvas-data", room.drawings);
    }

    // Alle Benutzer-Informationen an neuen Client senden
    const userInfos = {};
    for (const [userId, userInfo] of Object.entries(room.userInfo || {})) {
      if (userId !== socket.id) {
        // Eigene Info nicht senden
        userInfos[userId] = userInfo;
      }
    }
    if (Object.keys(userInfos).length > 0) {
      socket.emit("user-infos", userInfos);
      console.log(
        `Benutzer-Infos an neuen Client ${socket.id} gesendet:`,
        userInfos
      );
    } else {
      console.log(
        `Keine Benutzer-Infos für neuen Client ${socket.id} zu senden`
      );
    }

    // Neuen Benutzer an alle anderen Clients weiterleiten
    socket.to(roomId).emit("user-joined", {
      userId: socket.id,
      username: username || "Anonymous",
      color: color || "#ff6b6b",
    });

    // Anzahl der Benutzer im Raum aktualisieren
    io.to(roomId).emit("user-count", room.users.size);
    console.log(
      `User ${socket.id} joined room ${roomId}. Users in room: ${room.users.size}`
    );
  });

  // Zeichen-Events
  socket.on("draw", (data) => {
    const roomId = getRoomId(socket);
    if (roomId) {
      // Event an alle anderen im Raum weiterleiten
      socket.to(roomId).emit("draw", data);
    }
  });

  // Cursor-Events
  socket.on("cursor-move", (data) => {
    const roomId = getRoomId(socket);
    if (roomId) {
      // Cursor-Position an alle anderen im Raum senden
      data.userId = socket.id;
      // Benutzer-Info hinzufügen falls vorhanden
      const room = rooms.get(roomId);
      if (
        room.users.has(socket.id) &&
        room.userInfo &&
        room.userInfo[socket.id]
      ) {
        data.username = room.userInfo[socket.id].username;
        data.color = room.userInfo[socket.id].color;
      }
      socket.to(roomId).emit("cursor-update", data);
      console.log(
        `Cursor von ${socket.id} in Raum ${roomId}: ${data.x}, ${data.y}`
      );
    }
  });

  // Canvas-Daten speichern
  socket.on("save-canvas", (drawings) => {
    const roomId = getRoomId(socket);
    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).drawings = drawings;
    }
  });

  // Canvas leeren
  socket.on("clear-canvas", () => {
    const roomId = getRoomId(socket);
    if (roomId) {
      // Event an alle anderen im Raum weiterleiten
      socket.to(roomId).emit("clear-canvas");
      // Lokale Daten leeren
      if (rooms.has(roomId)) {
        rooms.get(roomId).drawings = [];
      }
    }
  });

  // Benutzer-Info speichern und an andere Clients weiterleiten
  socket.on("user-info", (data) => {
    const roomId = getRoomId(socket);
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      if (!room.userInfo) {
        room.userInfo = {};
      }
      room.userInfo[socket.id] = {
        username: data.username || "Anonymous",
        color: data.color || "#ff6b6b",
      };
      console.log(
        `Benutzer-Info gespeichert für ${socket.id}: ${data.username}, ${data.color}`
      );

      // Benutzer-Info an alle anderen Clients im Raum weiterleiten
      socket.to(roomId).emit("user-joined", {
        userId: socket.id,
        username: data.username || "Anonymous",
        color: data.color || "#ff6b6b",
      });
      console.log(
        `Benutzer-Info an Raum ${roomId} weitergeleitet: ${data.username}`
      );
    } else {
      console.log(`Keine Raum-ID gefunden für Benutzer-Info von ${socket.id}`);
    }
  });

  // Neuen Raum erstellen
  socket.on("create-room", () => {
    const roomId = uuidv4();
    socket.emit("room-created", roomId);
  });

  // Verbindung trennen
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Benutzer aus allen Räumen entfernen
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);

        // Raum leeren falls kein Benutzer mehr da ist
        if (room.users.size === 0) {
          rooms.delete(roomId);
        } else {
          // Anzahl der Benutzer aktualisieren
          io.to(roomId).emit("user-count", room.users.size);
        }
      }
    }
  });
});

// Hilfsfunktion um Raum-ID eines Sockets zu finden
function getRoomId(socket) {
  const rooms = Array.from(socket.rooms);
  return rooms.find((room) => room !== socket.id);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
