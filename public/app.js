// Socket.IO Verbindung
const socket = io();

// DOM Elemente
const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");
const roomIdInput = document.getElementById("room-id-input");
const currentRoomDiv = document.getElementById("current-room");
const roomStatusDiv = document.getElementById("room-status");
const userCountDiv = document.getElementById("user-count");
const colorPicker = document.getElementById("color-picker");
const brushSize = document.getElementById("brush-size");
const brushSizeValue = document.getElementById("brush-size-value");
const clearCanvasBtn = document.getElementById("clear-canvas");
const minimapCanvas = document.getElementById("minimap-canvas");
const minimapCtx = minimapCanvas.getContext("2d");
const usernameInput = document.getElementById("username-input");
const userColorPicker = document.getElementById("user-color-picker");

// Zeichen-Variablen
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentRoom = null;
let drawings = []; // Array für alle Zeichnungen

// Cursor-Variablen
let cursors = new Map(); // userId -> cursor element
let lastCursorSend = 0;
const CURSOR_THROTTLE = 50; // ms zwischen Cursor-Updates

// Canvas-Transformations-Variablen
let scale = 1; // Zoom-Faktor
let offsetX = 0; // Horizontaler Offset
let offsetY = 0; // Vertikaler Offset
let isPanning = false; // Pan-Modus aktiv
let lastPanX = 0; // Letzte Pan-Position X
let lastPanY = 0; // Letzte Pan-Position Y

// Unendliches Canvas
const CANVAS_SIZE = 50000; // Virtuelle Canvas-Größe

// Fullscreen Mode
let isFullscreenMode = false;

// Canvas initialisieren und skalieren
function resizeCanvas() {
  const canvas = document.getElementById("drawing-canvas");
  const ctx = canvas.getContext("2d");

  // Canvas auf Bildschirmgröße setzen
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Zeichenstil beibehalten
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

// Initiale Canvas-Größe setzen
resizeCanvas();
redrawCanvas(); // Fadenkreuz und Zeichnungen beim Start zeichnen

// Canvas bei Fenstergrößenänderung anpassen
window.addEventListener("resize", resizeCanvas);

// Event Listener für UI
createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
colorPicker.addEventListener("change", updateBrushSettings);
brushSize.addEventListener("input", updateBrushSettings);
clearCanvasBtn.addEventListener("click", clearCanvas);

// Enter-Taste für Raum-ID Input
roomIdInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    joinRoom();
  }
});

// Minimap Event Listener
minimapCanvas.addEventListener("click", handleMinimapClick);

// Zeichen-Event Listener
canvas.addEventListener("mousedown", startDrawing);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseout", stopDrawing);

// Touch-Events für Mobile
canvas.addEventListener("touchstart", handleTouchStart);
canvas.addEventListener("touchmove", handleTouchMove);
canvas.addEventListener("touchend", handleTouchEnd);

// Cursor-Tracking
document.addEventListener("mousemove", handleMouseMove);
document.addEventListener("mouseenter", handleMouseEnter);
document.addEventListener("mouseleave", handleMouseLeave);

// Zoom und Pan
canvas.addEventListener("wheel", handleZoom);
canvas.addEventListener("mousedown", handlePanStart);
document.addEventListener("mousemove", handlePanMove);
document.addEventListener("mouseup", handlePanEnd);

// Verhindere Kontextmenü bei Rechtsklick
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Socket.IO Event Listener
socket.on("room-created", handleRoomCreated);
socket.on("draw", handleRemoteDraw);
socket.on("canvas-data", handleCanvasData);
socket.on("user-count", handleUserCount);
socket.on("cursor-update", handleCursorUpdate);
socket.on("user-infos", handleUserInfos);
socket.on("user-joined", handleUserJoined);
socket.on("user-info-update", handleUserJoined); // Gleiche Behandlung wie user-joined
socket.on("clear-canvas", handleRemoteClear);

// Funktionen
function createRoom() {
  socket.emit("create-room");
}

function joinRoom() {
  const roomId = roomIdInput.value.trim();
  if (roomId) {
    // Stelle sicher, dass localStorage-Werte geladen sind
    loadUserSettings();

    const username = usernameInput.value.trim() || "Anonymous";
    const userColor = userColorPicker.value;

    console.log(
      `Betrete Raum: ${roomId} mit Benutzer: ${username}, Farbe: ${userColor}`
    );

    socket.emit("join-room", {
      roomId: roomId,
      username: username,
      color: userColor,
    });
    currentRoom = roomId;
    // Raum-ID im localStorage speichern
    localStorage.setItem("websocketDrawRoomId", roomId);
    console.log(`✅ Raum-ID ${roomId} im localStorage gespeichert`);
    console.log(
      `💾 localStorage Inhalt:`,
      localStorage.getItem("websocketDrawRoomId")
    );
    updateRoomDisplay();
  } else {
    console.log("❌ Keine Raum-ID eingegeben");
  }
}

function handleRoomCreated(roomId) {
  currentRoom = roomId;
  // Stelle sicher, dass localStorage-Werte geladen sind
  loadUserSettings();

  const username = usernameInput.value.trim() || "Anonymous";
  const userColor = userColorPicker.value;

  socket.emit("join-room", {
    roomId: roomId,
    username: username,
    color: userColor,
  });
  updateRoomDisplay();
  // URL mit Raum-ID aktualisieren
  window.history.pushState({}, "", `?room=${roomId}`);
}

function updateRoomDisplay() {
  if (currentRoom) {
    roomStatusDiv.textContent = `Raum: ${currentRoom}`;
    roomIdInput.value = currentRoom;
    updateShareLink();
  } else {
    roomStatusDiv.textContent = "Kein Raum beigetreten";
    updateShareLink();
  }
}

function handleUserCount(count) {
  userCountDiv.textContent = `Benutzer: ${count}`;
}

function updateBrushSettings() {
  ctx.strokeStyle = colorPicker.value;
  ctx.lineWidth = brushSize.value;
  brushSizeValue.textContent = brushSize.value;

  // Lokalen Cursor-Größe aktualisieren
  updateCursorSize();
}

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function getTouchPos(e) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0] || e.changedTouches[0];
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  };
}

function startDrawing(e) {
  if (isPanning) return; // Nicht zeichnen wenn Pan aktiv

  isDrawing = true;
  const pos = getTransformedMousePos(e);
  lastX = pos.x;
  lastY = pos.y;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.restore();
}

function draw(e) {
  if (!isDrawing || isPanning) return;

  const pos = getTransformedMousePos(e);

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  ctx.restore();

  // Zeichnung zum Array hinzufügen
  drawings.push({
    fromX: lastX,
    fromY: lastY,
    toX: pos.x,
    toY: pos.y,
    color: ctx.strokeStyle,
    size: ctx.lineWidth,
  });

  // An andere Clients senden
  if (currentRoom) {
    socket.emit("draw", {
      fromX: lastX,
      fromY: lastY,
      toX: pos.x,
      toY: pos.y,
      color: ctx.strokeStyle,
      size: ctx.lineWidth,
    });
  }

  lastX = pos.x;
  lastY = pos.y;
}

function stopDrawing() {
  if (isDrawing) {
    isDrawing = false;
    // Canvas-Daten speichern
    if (currentRoom) {
      socket.emit("save-canvas", drawings);
    }
  }
}

function handleTouchStart(e) {
  e.preventDefault();
  const pos = getTouchPos(e);
  startDrawing({
    clientX: pos.x + canvas.getBoundingClientRect().left,
    clientY: pos.y + canvas.getBoundingClientRect().top,
  });
}

function handleTouchMove(e) {
  e.preventDefault();
  if (isDrawing) {
    const pos = getTouchPos(e);
    draw({
      clientX: pos.x + canvas.getBoundingClientRect().left,
      clientY: pos.y + canvas.getBoundingClientRect().top,
    });
  }
}

function handleTouchEnd(e) {
  e.preventDefault();
  stopDrawing();
}

function handleRemoteDraw(data) {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Temporäre Zeichen-Einstellungen speichern
  const originalColor = ctx.strokeStyle;
  const originalSize = ctx.lineWidth;

  // Remote-Zeichen-Einstellungen anwenden
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.size;

  // Linie zeichnen
  ctx.beginPath();
  ctx.moveTo(data.fromX, data.fromY);
  ctx.lineTo(data.toX, data.toY);
  ctx.stroke();

  // Original-Einstellungen wiederherstellen
  ctx.strokeStyle = originalColor;
  ctx.lineWidth = originalSize;

  ctx.restore();

  // Zeichnung zum Array hinzufügen
  drawings.push(data);

  // Minimap in Echtzeit aktualisieren
  updateMinimap();
}

function handleCanvasData(data) {
  drawings = data;
  redrawCanvas();
}

function handleUserInfos(data) {
  console.log("handleUserInfos aufgerufen mit Daten:", data);

  if (!data || Object.keys(data).length === 0) {
    console.log("Keine Benutzer-Infos empfangen");
    return;
  }

  // Für jeden Benutzer einen Cursor erstellen (falls noch nicht vorhanden)
  for (const [userId, userInfo] of Object.entries(data)) {
    console.log(`Verarbeite Benutzer ${userId}:`, userInfo);

    if (!cursors.has(userId)) {
      // Neuen Cursor erstellen
      const cursor = document.createElement("div");
      cursor.className = "remote-cursor";
      cursor.id = `cursor-${userId}`;

      // Cursor-Icon (Pfeil) mit Benutzerfarbe
      cursor.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20">
          <polygon points="5,5 15,10 5,15" fill="${
            userInfo.color || "#ff6b6b"
          }" stroke="#fff" stroke-width="1"/>
        </svg>
      `;

      // Benutzer-Label mit Benutzername und individueller Farbe
      const label = document.createElement("div");
      label.className = "cursor-label";
      label.textContent = userInfo.username || `User ${userId.slice(-4)}`;
      label.style.backgroundColor = userInfo.color
        ? `${userInfo.color}E6`
        : "rgba(255, 107, 107, 0.9)"; // E6 für 90% Opacity
      cursor.appendChild(label);

      // Pfeil-Farbe anpassen
      const style = document.createElement("style");
      style.textContent = `
        #cursor-${userId} .cursor-label::after {
          border-top-color: ${userInfo.color || "#ff6b6b"}E6 !important;
        }
      `;
      style.className = `cursor-style-${userId}`;
      document.head.appendChild(style);

      document.body.appendChild(cursor);
      cursors.set(userId, cursor);

      console.log(
        `Cursor für ${
          userInfo.username || "User " + userId.slice(-4)
        } aus Benutzer-Info erstellt`
      );

      // Cursor außerhalb des sichtbaren Bereichs positionieren (wird bei Bewegung aktualisiert)
      cursor.style.left = "-100px";
      cursor.style.top = "-100px";
    } else {
      console.log(`Cursor für ${userId} existiert bereits`);
    }
  }
}

function handleUserJoined(data) {
  const { userId, username, color } = data;
  console.log(`Neuer Benutzer beigetreten: ${userId}, ${username}, ${color}`);

  if (!cursors.has(userId)) {
    // Neuen Cursor für den neuen Benutzer erstellen
    const cursor = document.createElement("div");
    cursor.className = "remote-cursor";
    cursor.id = `cursor-${userId}`;

    // Cursor-Icon (Pfeil) mit Benutzerfarbe
    cursor.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20">
        <polygon points="5,5 15,10 5,15" fill="${
          color || "#ff6b6b"
        }" stroke="#fff" stroke-width="1"/>
      </svg>
    `;

    // Benutzer-Label mit Benutzername und individueller Farbe
    const label = document.createElement("div");
    label.className = "cursor-label";
    label.textContent = username || `User ${userId.slice(-4)}`;
    label.style.backgroundColor = color
      ? `${color}E6`
      : "rgba(255, 107, 107, 0.9)"; // E6 für 90% Opacity
    cursor.appendChild(label);

    // Pfeil-Farbe anpassen
    const style = document.createElement("style");
    style.textContent = `
      #cursor-${userId} .cursor-label::after {
        border-top-color: ${color || "#ff6b6b"}E6 !important;
      }
    `;
    style.className = `cursor-style-${userId}`;
    document.head.appendChild(style);

    document.body.appendChild(cursor);
    cursors.set(userId, cursor);

    console.log(
      `Cursor für neuen Benutzer ${
        username || "User " + userId.slice(-4)
      } erstellt`
    );

    // Cursor außerhalb des sichtbaren Bereichs positionieren (wird bei Bewegung aktualisiert)
    cursor.style.left = "-100px";
    cursor.style.top = "-100px";
  } else {
    // Bestehenden Cursor aktualisieren (falls Benutzer-Info sich geändert hat)
    const cursor = cursors.get(userId);
    const svg = cursor.querySelector("svg polygon");
    const label = cursor.querySelector(".cursor-label");

    if (svg && color) {
      svg.setAttribute("fill", color);
    }

    if (label && username) {
      label.textContent = username;
      label.style.backgroundColor = `${color}E6`;
    }

    // CSS-Stil aktualisieren
    const existingStyle = document.querySelector(`.cursor-style-${userId}`);
    if (existingStyle && color) {
      existingStyle.textContent = `
        #cursor-${userId} .cursor-label::after {
          border-top-color: ${color}E6 !important;
        }
      `;
    }

    console.log(
      `Cursor für bestehenden Benutzer ${
        username || "User " + userId.slice(-4)
      } aktualisiert`
    );
  }
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawings = [];
  if (currentRoom) {
    socket.emit("clear-canvas");
    socket.emit("save-canvas", drawings);
  }
}

function handleRemoteClear() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawings = [];
  redrawCanvas();
}

// Cursor-Funktionen
function handleMouseMove(e) {
  if (!currentRoom) return;

  const now = Date.now();
  if (now - lastCursorSend < CURSOR_THROTTLE) return;

  // Mausposition relativ zum Canvas berechnen
  const rect = canvas.getBoundingClientRect();
  const pos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };

  // Nur senden wenn Maus über dem Canvas ist
  if (
    pos.x >= 0 &&
    pos.x <= canvas.width &&
    pos.y >= 0 &&
    pos.y <= canvas.height
  ) {
    // Transformierte Position (Blatt-Koordinaten) senden
    const transformedPos = getTransformedMousePos(e);
    socket.emit("cursor-move", {
      x: transformedPos.x,
      y: transformedPos.y,
    });
    lastCursorSend = now;
    console.log(`Cursor gesendet: ${transformedPos.x}, ${transformedPos.y}`);
  }
}

function handleMouseEnter(e) {
  // Cursor wieder anzeigen wenn Maus ins Fenster kommt
  if (currentRoom) {
    const transformedPos = getTransformedMousePos(e);
    socket.emit("cursor-move", {
      x: transformedPos.x,
      y: transformedPos.y,
    });
  }
}

function handleMouseLeave(e) {
  // Cursor ausblenden wenn Maus das Fenster verlässt
  // Hier könnte man einen "leave" Event senden, aber für jetzt einfach nichts tun
}

function removeCursor(userId) {
  const cursor = cursors.get(userId);
  if (cursor) {
    cursor.remove();
    cursors.delete(userId);
  }
}

// Alle Cursor entfernen (z.B. beim Raum verlassen)
function clearAllCursors() {
  for (const [userId] of cursors) {
    removeCursor(userId);
  }
}

// Zoom und Pan Funktionen
function handleZoom(e) {
  e.preventDefault();

  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const mousePos = getMousePos(e);

  // Zoom um Mausposition herum
  const newScale = Math.max(0.1, Math.min(100, scale * zoomFactor));

  if (newScale !== scale) {
    // Berechne neuen Offset, um Zoom um Mausposition zu zentrieren
    const scaleChange = newScale / scale;
    let newOffsetX = mousePos.x - (mousePos.x - offsetX) * scaleChange;
    let newOffsetY = mousePos.y - (mousePos.y - offsetY) * scaleChange;

    // Grenzen für das Scrolling nach Zoom berechnen
    const maxOffsetX = CANVAS_SIZE * newScale - canvas.width / 2;
    const minOffsetX = -CANVAS_SIZE * newScale + canvas.width / 2;
    const maxOffsetY = CANVAS_SIZE * newScale - canvas.height / 2;
    const minOffsetY = -CANVAS_SIZE * newScale + canvas.height / 2;

    // Offset-Werte begrenzen
    newOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, newOffsetX));
    newOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, newOffsetY));

    offsetX = newOffsetX;
    offsetY = newOffsetY;
    scale = newScale;

    redrawCanvas();
  }
}

function handlePanStart(e) {
  // Mittlere Maustaste oder Leertaste + Linksklick für Pan
  if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
    e.preventDefault();
    isPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    canvas.style.cursor = "grabbing";
  }
}

function handlePanMove(e) {
  if (!isPanning) return;

  const deltaX = e.clientX - lastPanX;
  const deltaY = e.clientY - lastPanY;

  // Neue Offset-Werte berechnen
  let newOffsetX = offsetX + deltaX;
  let newOffsetY = offsetY + deltaY;

  // Grenzen für das Scrolling berechnen
  const maxOffsetX = CANVAS_SIZE * scale - canvas.width / 2;
  const minOffsetX = -CANVAS_SIZE * scale + canvas.width / 2;
  const maxOffsetY = CANVAS_SIZE * scale - canvas.height / 2;
  const minOffsetY = -CANVAS_SIZE * scale + canvas.height / 2;

  // Offset-Werte begrenzen
  newOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, newOffsetX));
  newOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, newOffsetY));

  // Nur aktualisieren wenn sich etwas geändert hat
  if (newOffsetX !== offsetX || newOffsetY !== offsetY) {
    offsetX = newOffsetX;
    offsetY = newOffsetY;
    redrawCanvas();
  }

  lastPanX = e.clientX;
  lastPanY = e.clientY;
}

function handlePanEnd(e) {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = "crosshair";
  }
}

// Canvas neu zeichnen mit aktueller Transformation
function redrawCanvas() {
  ctx.save();

  // Transformation anwenden
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Canvas leeren
  ctx.clearRect(-CANVAS_SIZE, -CANVAS_SIZE, CANVAS_SIZE * 2, CANVAS_SIZE * 2);

  // Fadenkreuz für Nullpunkt zeichnen
  drawCrosshair();

  // Alle Zeichnungen neu zeichnen
  for (const drawing of drawings) {
    const originalColor = ctx.strokeStyle;
    const originalSize = ctx.lineWidth;

    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = drawing.size;

    ctx.beginPath();
    ctx.moveTo(drawing.fromX, drawing.fromY);
    ctx.lineTo(drawing.toX, drawing.toY);
    ctx.stroke();

    ctx.strokeStyle = originalColor;
    ctx.lineWidth = originalSize;
  }

  ctx.restore();
}

// Fadenkreuz für Nullpunkt zeichnen
function drawCrosshair() {
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1 / scale; // Linienbreite skalieren
  ctx.setLineDash([5 / scale, 5 / scale]);

  // Horizontale Linie
  ctx.beginPath();
  ctx.moveTo(-CANVAS_SIZE, 0);
  ctx.lineTo(CANVAS_SIZE, 0);
  ctx.stroke();

  // Vertikale Linie
  ctx.beginPath();
  ctx.moveTo(0, -CANVAS_SIZE);
  ctx.lineTo(0, CANVAS_SIZE);
  ctx.stroke();

  ctx.setLineDash([]); // Linien zurücksetzen
}

// Transformierte Mausposition für Zeichenfunktionen
function getTransformedMousePos(e) {
  const pos = getMousePos(e);
  return {
    x: (pos.x - offsetX) / scale,
    y: (pos.y - offsetY) / scale,
  };
}

// URL-Parameter prüfen (für geteilte Raum-Links)
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get("room");
if (roomParam) {
  roomIdInput.value = roomParam;
  joinRoom();
}

// Minimap-Funktionen
function updateMinimap() {
  // Minimap leeren
  minimapCtx.fillStyle = "#f8f9fa";
  minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  // Verwende die gesamte Canvas-Größe (100.000x100.000)
  const worldSize = CANVAS_SIZE * 2; // -100k bis +100k

  // Skalierungsfaktor für Minimap
  const mapScale =
    Math.min(
      minimapCanvas.width / worldSize,
      minimapCanvas.height / worldSize
    ) * 0.95; // 95% der verfügbaren Fläche nutzen

  // Zeichnungen auf Minimap zeichnen
  minimapCtx.save();
  minimapCtx.translate(minimapCanvas.width / 2, minimapCanvas.height / 2);
  minimapCtx.scale(mapScale, mapScale);

  // Fadenkreuz für Nullpunkt zeichnen
  minimapCtx.strokeStyle = "#ccc";
  minimapCtx.lineWidth = 1 / mapScale;
  minimapCtx.setLineDash([10 / mapScale, 5 / mapScale]);
  minimapCtx.beginPath();
  minimapCtx.moveTo(-CANVAS_SIZE, 0);
  minimapCtx.lineTo(CANVAS_SIZE, 0);
  minimapCtx.moveTo(0, -CANVAS_SIZE);
  minimapCtx.lineTo(0, CANVAS_SIZE);
  minimapCtx.stroke();
  minimapCtx.setLineDash([]);

  // Zeichnungen zeichnen
  minimapCtx.strokeStyle = "#000";
  minimapCtx.lineWidth = 1 / mapScale;
  minimapCtx.lineCap = "round";
  minimapCtx.lineJoin = "round";

  for (const drawing of drawings) {
    minimapCtx.strokeStyle = drawing.color;
    minimapCtx.lineWidth = Math.max(0.5, drawing.size * 0.3);

    minimapCtx.beginPath();
    minimapCtx.moveTo(drawing.fromX, drawing.fromY);
    minimapCtx.lineTo(drawing.toX, drawing.toY);
    minimapCtx.stroke();
  }

  minimapCtx.restore();

  // Aktueller Viewport-Rechteck zeichnen
  const viewportWidth = canvas.width / scale;
  const viewportHeight = canvas.height / scale;
  const viewportCenterX = -offsetX / scale;
  const viewportCenterY = -offsetY / scale;

  // Viewport in Minimap-Koordinaten umwandeln
  const rectCenterX = minimapCanvas.width / 2 + viewportCenterX * mapScale;
  const rectCenterY = minimapCanvas.height / 2 + viewportCenterY * mapScale;
  const rectWidth = viewportWidth * mapScale;
  const rectHeight = viewportHeight * mapScale;

  // Rechteck von der Mitte aus zeichnen
  const rectLeft = rectCenterX - rectWidth / 2;
  const rectTop = rectCenterY - rectHeight / 2;

  // Sicherstellen, dass das Rechteck innerhalb der Minimap bleibt
  const clampedLeft = Math.max(
    0,
    Math.min(minimapCanvas.width - rectWidth, rectLeft)
  );
  const clampedTop = Math.max(
    0,
    Math.min(minimapCanvas.height - rectHeight, rectTop)
  );
  const clampedWidth = Math.min(rectWidth, minimapCanvas.width - clampedLeft);
  const clampedHeight = Math.min(rectHeight, minimapCanvas.height - clampedTop);

  minimapCtx.strokeStyle = "#e53e3e";
  minimapCtx.lineWidth = 2;
  minimapCtx.strokeRect(clampedLeft, clampedTop, clampedWidth, clampedHeight);
}

function handleMinimapClick(e) {
  const rect = minimapCanvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  // Verwende die gesamte Canvas-Größe (100.000x100.000)
  const worldSize = CANVAS_SIZE * 2; // -100k bis +100k

  // Skalierungsfaktor für Minimap (gleiche Berechnung wie in updateMinimap)
  const mapScale =
    Math.min(
      minimapCanvas.width / worldSize,
      minimapCanvas.height / worldSize
    ) * 0.95;

  // Klick-Position in Welt-Koordinaten umwandeln
  // Minimap ist zentriert, also müssen wir vom Zentrum aus rechnen
  const worldX = (clickX - minimapCanvas.width / 2) / mapScale;
  const worldY = (clickY - minimapCanvas.height / 2) / mapScale;

  // Viewport zu dieser Position bewegen
  // Neue Formel: offsetX = -worldX * scale + canvas.width / 2
  // Neue Formel: offsetY = -worldY * scale + canvas.height / 2
  let newOffsetX = -worldX * scale + canvas.width / 2;
  let newOffsetY = -worldY * scale + canvas.height / 2;

  // Grenzen für das Scrolling berechnen
  const maxOffsetX = CANVAS_SIZE * scale - canvas.width / 2;
  const minOffsetX = -CANVAS_SIZE * scale + canvas.width / 2;
  const maxOffsetY = CANVAS_SIZE * scale - canvas.height / 2;
  const minOffsetY = -CANVAS_SIZE * scale + canvas.height / 2;

  // Offset-Werte begrenzen
  newOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, newOffsetX));
  newOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, newOffsetY));

  // Nur aktualisieren wenn sich etwas geändert hat
  if (newOffsetX !== offsetX || newOffsetY !== offsetY) {
    offsetX = newOffsetX;
    offsetY = newOffsetY;

    console.log(
      `Minimap-Klick: (${clickX}, ${clickY}) -> Welt: (${worldX}, ${worldY}) -> Offset: (${offsetX}, ${offsetY})`
    );

    redrawCanvas();
  }
}

// Minimap nach jedem redrawCanvas aktualisieren
const originalRedrawCanvas = redrawCanvas;
redrawCanvas = function () {
  originalRedrawCanvas();
  updateMinimap();
};

// Benutzer-Einstellungen laden und speichern
function loadUserSettings() {
  const savedUsername = localStorage.getItem("websocketDrawUsername");
  const savedUserColor = localStorage.getItem("websocketDrawUserColor");

  if (savedUsername) {
    usernameInput.value = savedUsername;
  }
  if (savedUserColor) {
    userColorPicker.value = savedUserColor;
  }
}

function saveUserSettings() {
  const username = usernameInput.value.trim();
  const userColor = userColorPicker.value;

  if (username) {
    localStorage.setItem("websocketDrawUsername", username);
  }
  if (userColor) {
    localStorage.setItem("websocketDrawUserColor", userColor);
  }
}

// Event Listener für Benutzer-Einstellungen
usernameInput.addEventListener("input", () => {
  saveUserSettings();
  sendUserInfo();
});
usernameInput.addEventListener("change", () => {
  saveUserSettings();
  sendUserInfo();
});
userColorPicker.addEventListener("input", () => {
  saveUserSettings();
  sendUserInfo();
});
userColorPicker.addEventListener("change", () => {
  saveUserSettings();
  sendUserInfo();
});

// Benutzer-Info an Server senden
function sendUserInfo() {
  // Lade Werte aus localStorage falls Input-Felder leer sind
  let username = usernameInput.value.trim();
  let userColor = userColorPicker.value;

  if (!username || username === "Anonymous") {
    const savedUsername = localStorage.getItem("websocketDrawUsername");
    if (savedUsername) {
      username = savedUsername;
      usernameInput.value = savedUsername; // Input-Feld aktualisieren
    } else {
      username = "Anonymous";
    }
  }

  if (!userColor || userColor === "#ff6b6b") {
    const savedUserColor = localStorage.getItem("websocketDrawUserColor");
    if (savedUserColor) {
      userColor = savedUserColor;
      userColorPicker.value = savedUserColor; // Input-Feld aktualisieren
    } else {
      userColor = "#ff6b6b";
    }
  }

  socket.emit("user-info", {
    username: username,
    color: userColor,
  });

  console.log(`Benutzer-Info gesendet: ${username}, ${userColor}`);
}

// Raum beitreten mit Benutzer-Info
const originalJoinRoom = joinRoom;
joinRoom = function () {
  originalJoinRoom();
  // Benutzer-Info sofort senden
  sendUserInfo();
  // Zyklisches Broadcasting starten
  startUserInfoBroadcast();
};

// Raum erstellen mit Benutzer-Info
const originalHandleRoomCreated = handleRoomCreated;
handleRoomCreated = function (roomId) {
  originalHandleRoomCreated(roomId);
  // Benutzer-Info sofort senden
  sendUserInfo();
  // Zyklisches Broadcasting starten
  startUserInfoBroadcast();
};

// Cursor-Update mit Benutzer-Info
function handleCursorUpdate(data) {
  const { userId, x, y, username, color } = data;
  console.log(
    `Cursor-Update empfangen: ${userId}, ${x}, ${y}, ${username}, ${color}`
  );

  // Canvas-Position einmal berechnen
  const canvasRect = canvas.getBoundingClientRect();

  if (!cursors.has(userId)) {
    // Neuen Cursor erstellen
    const cursor = document.createElement("div");
    cursor.className = "remote-cursor";
    cursor.id = `cursor-${userId}`;

    // Cursor-Icon (Pfeil) mit Benutzerfarbe
    cursor.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20">
        <polygon points="5,5 15,10 5,15" fill="${
          color || "#ff6b6b"
        }" stroke="#fff" stroke-width="1"/>
      </svg>
    `;

    // Benutzer-Label mit Benutzername und individueller Farbe
    const label = document.createElement("div");
    label.className = "cursor-label";
    label.textContent = username || `User ${userId.slice(-4)}`;
    label.style.backgroundColor = color
      ? `${color}E6`
      : "rgba(255, 107, 107, 0.9)"; // E6 für 90% Opacity
    cursor.appendChild(label);

    // Pfeil-Farbe anpassen
    const style = document.createElement("style");
    style.textContent = `
      #cursor-${userId} .cursor-label::after {
        border-top-color: ${color || "#ff6b6b"}E6 !important;
      }
    `;
    style.className = `cursor-style-${userId}`;
    document.head.appendChild(style);

    document.body.appendChild(cursor);
    cursors.set(userId, cursor);

    console.log(
      `Cursor für ${username || "User " + userId.slice(-4)} erstellt`
    );
  } else {
    // Bestehenden Cursor aktualisieren (falls Benutzer-Info sich geändert hat)
    const cursor = cursors.get(userId);
    const svg = cursor.querySelector("svg polygon");
    const label = cursor.querySelector(".cursor-label");

    if (svg && color) {
      svg.setAttribute("fill", color);
    }

    if (label && username) {
      label.textContent = username;
      label.style.backgroundColor = `${color}E6`;
    }

    // CSS-Stil aktualisieren
    const existingStyle = document.querySelector(`.cursor-style-${userId}`);
    if (existingStyle && color) {
      existingStyle.textContent = `
        #cursor-${userId} .cursor-label::after {
          border-top-color: ${color}E6 !important;
        }
      `;
    }

    console.log(
      `Cursor für ${username || "User " + userId.slice(-4)} aktualisiert`
    );
  }

  // Cursor-Position aktualisieren (Blatt-Koordinaten in Bildschirm-Koordinaten umwandeln)
  const cursor = cursors.get(userId);
  const newLeft = x * scale + offsetX + canvasRect.left;
  const newTop = y * scale + offsetY + canvasRect.top;

  cursor.style.left = `${newLeft}px`;
  cursor.style.top = `${newTop}px`;

  console.log(
    `Cursor ${
      username || "User " + userId.slice(-4)
    } aktualisiert: ${newLeft}, ${newTop}`
  );
}

// Zyklisches Update für Benutzer-Infos
let userInfoInterval = null;

function startUserInfoBroadcast() {
  if (userInfoInterval) {
    clearInterval(userInfoInterval);
  }
  userInfoInterval = setInterval(() => {
    if (currentRoom) {
      console.log("🔄 Broadcasting user info...");
      sendUserInfo();
    }
  }, 10000); // Alle 10 Sekunden
  console.log("✅ User info broadcasting started");
}

function stopUserInfoBroadcast() {
  if (userInfoInterval) {
    clearInterval(userInfoInterval);
    userInfoInterval = null;
  }
}

// Fullscreen Funktionalität
function toggleFullscreen() {
  const container = document.querySelector(".container");
  const fullscreenBtn = document.getElementById("fullscreen-toggle");
  const overlayBtn = document.getElementById("fullscreen-overlay-btn");

  isFullscreenMode = !isFullscreenMode;

  if (isFullscreenMode) {
    container.classList.add("fullscreen-mode");
    fullscreenBtn.classList.add("active");
    overlayBtn.classList.add("visible");
  } else {
    container.classList.remove("fullscreen-mode");
    fullscreenBtn.classList.remove("active");
    overlayBtn.classList.remove("visible");
  }

  // Zustand im localStorage speichern
  localStorage.setItem("websocketDrawFullscreen", isFullscreenMode);

  console.log(
    `🔄 Fullscreen-Modus: ${isFullscreenMode ? "aktiviert" : "deaktiviert"}`
  );
}

// Fullscreen-Button Event Listener
document
  .getElementById("fullscreen-toggle")
  .addEventListener("click", toggleFullscreen);

// Fullscreen Overlay Button Event Listener
document
  .getElementById("fullscreen-overlay-btn")
  .addEventListener("click", toggleFullscreen);

// Keyboard shortcuts für Fullscreen
document.addEventListener("keydown", (e) => {
  // Escape-Taste für Fullscreen verlassen
  if (e.key === "Escape" && isFullscreenMode) {
    toggleFullscreen();
  }
  // F11 für Fullscreen umschalten
  if (e.key === "F11") {
    e.preventDefault();
    toggleFullscreen();
  }
});

// Gespeicherten Fullscreen-Zustand laden
function loadFullscreenState() {
  const savedFullscreen = localStorage.getItem("websocketDrawFullscreen");
  if (savedFullscreen === "true") {
    isFullscreenMode = true;
    document.querySelector(".container").classList.add("fullscreen-mode");
    document.getElementById("fullscreen-toggle").classList.add("active");
    document.getElementById("fullscreen-overlay-btn").classList.add("visible");
    console.log("🔄 Fullscreen-Modus aus localStorage wiederhergestellt");
  }
}

// Benutzer-Einstellungen beim Start laden
loadUserSettings();
loadFullscreenState();

// Raum-ID aus localStorage laden und beitreten (nachdem Benutzer-Einstellungen geladen sind)
setTimeout(() => {
  const savedRoomId = localStorage.getItem("websocketDrawRoomId");
  console.log(`🔍 localStorage Raum-ID: ${savedRoomId}`);
  console.log(`🔗 URL Raum-Parameter: ${roomParam}`);
  console.log(`📝 Aktuelle Input-Feld Wert: ${roomIdInput.value}`);

  if (savedRoomId && !roomParam) {
    roomIdInput.value = savedRoomId;
    console.log(`🚀 Versuche automatisch Raum ${savedRoomId} beizutreten`);
    console.log(`📋 Input-Feld nach Setzen: ${roomIdInput.value}`);
    joinRoom();
    // URL mit Raum-ID aktualisieren
    window.history.pushState({}, "", `?room=${savedRoomId}`);
    // Zyklisches Broadcasting starten
    startUserInfoBroadcast();
  } else if (!savedRoomId) {
    console.log("❌ Keine gespeicherte Raum-ID gefunden");
  } else if (roomParam) {
    console.log(`⚠️ URL-Parameter überschreibt localStorage: ${roomParam}`);
  }
}, 200); // Mehr Zeit für localStorage-Loading

// Lokaler Cursor für Pinselgröße-Indikator
let localCursor = null;

function createLocalCursor() {
  if (localCursor) return; // Bereits vorhanden

  localCursor = document.createElement("div");
  localCursor.className = "local-cursor";
  localCursor.id = "local-cursor";

  // Cursor-Icon mit Größen-Indikator
  localCursor.innerHTML = `
    <div class="cursor-size-indicator"></div>
    <svg width="20" height="20" viewBox="0 0 20 20">
      <polygon points="5,5 15,10 5,15" fill="#000" stroke="#fff" stroke-width="1"/>
    </svg>
  `;

  document.body.appendChild(localCursor);
  updateCursorSize(); // Initiale Größe setzen
}

function updateCursorSize() {
  if (!localCursor) return;

  const brushSize = parseInt(brushSize.value) || 5;
  const sizeIndicator = localCursor.querySelector(".cursor-size-indicator");

  // Skaliere den Größen-Indikator basierend auf der Pinselgröße
  // Minimum 10px, Maximum 100px für gute Sichtbarkeit
  const indicatorSize = Math.max(10, Math.min(100, brushSize * 2));

  sizeIndicator.style.width = `${indicatorSize}px`;
  sizeIndicator.style.height = `${indicatorSize}px`;
  sizeIndicator.style.borderWidth = `${Math.max(1, brushSize / 10)}px`;

  console.log(
    `🎨 Pinselgröße aktualisiert: ${brushSize}px, Indikator: ${indicatorSize}px`
  );
}

// Maus-Tracking für lokalen Cursor
document.addEventListener("mousemove", (e) => {
  if (!localCursor) return;

  // Positioniere lokalen Cursor an Mausposition
  localCursor.style.left = `${e.clientX}px`;
  localCursor.style.top = `${e.clientY}px`;

  // Zeige/verstecke Cursor basierend auf Canvas-Position
  const canvas = document.getElementById("drawing-canvas");
  const rect = canvas.getBoundingClientRect();

  if (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  ) {
    localCursor.style.opacity = "1";
  } else {
    localCursor.style.opacity = "0.3";
  }
});

// Lokalen Cursor erstellen
createLocalCursor();

// Initiale Brush-Einstellungen
updateBrushSettings();

// Copy to Clipboard Funktion
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      // Moderne Clipboard API
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback für ältere Browser
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const success = document.execCommand("copy");
      textArea.remove();

      return success;
    }
  } catch (err) {
    console.error("Fehler beim Kopieren:", err);
    return false;
  }
}

// Share Link Funktionalität
function updateShareLink() {
  const roomIdDisplay = document.getElementById("room-id-display");
  const shareLink = document.getElementById("share-link");

  if (currentRoom) {
    roomIdDisplay.textContent = currentRoom;
    shareLink.style.display = "block";
  } else {
    roomIdDisplay.textContent = "";
    shareLink.style.display = "none";
  }
}

async function copyShareLink() {
  if (!currentRoom) {
    console.log("❌ Kein Raum zum Teilen verfügbar");
    return;
  }

  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;

  const success = await copyToClipboard(shareUrl);

  if (success) {
    console.log(`🔗 Link erfolgreich kopiert: ${shareUrl}`);
  } else {
    console.log("❌ Fehler beim Kopieren des Links");
  }
}

// Event Listener für Share-Funktionalität
document.getElementById("share-link").addEventListener("click", copyShareLink);

// Broadcasting stoppen wenn Seite verlassen wird
window.addEventListener("beforeunload", () => {
  stopUserInfoBroadcast();
});
