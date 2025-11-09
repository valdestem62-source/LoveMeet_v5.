const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
});
/* i18n */
const I18N = {
  ru: {
    male: "Я мужчина", female: "Я женщина",
    cam_on: "Камера вкл", cam_off: "Камера выкл",
    mic_on: "Микрофон вкл", mic_off: "Микрофон выкл",
    next: "Следующий собеседник", start: "Начать знакомство", send: "Отправить",
    ready: "Готово", searching: "Ищем собеседника…", matched: "Собеседник найден!", left: "Собеседник отключился"
  },
  en: {
    male: "I am male", female: "I am female",
    cam_on: "Camera on", cam_off: "Camera off",
    mic_on: "Mic on", mic_off: "Mic off",
    next: "Next", start: "Start", send: "Send",
    ready: "Ready", searching: "Searching…", matched: "Matched!", left: "Partner left"
  }
};

const qs = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));
const $local = qs("#local");
const $remote = qs("#remote");
const $status = qs("#status");
const $btnStart = qs("#btnStart");
const $btnNext = qs("#btnNext");
const $btnCamera = qs("#btnCamera");
const $btnMic = qs("#btnMic");
const $chat = qs("#chat");
const $msg = qs("#msg");
const $send = qs("#send");
const $lang = qs("#lang");
const $payKaspi = qs("#payKaspi");
const $payWM = qs("#payWM");
const $payInfo = qs("#payInfo");

const adminModal = qs("#adminModal");
const openAdmin = qs("#openAdmin");
const closeAdmin = qs("#closeAdmin");

let lang = "ru";
let pc, localStream;
const socket = io();

let currentRoom = null;

function setStatus(s){ $status.textContent = s; }

function applyI18N(l) {
  lang = l;
  qsa("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = I18N[l][key] || el.textContent;
  });
}

async function initMedia() {
  if (localStream) return;
  localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
  $local.srcObject = localStream;
}
function toggleCam() {
  if (!localStream) return;
  const v = localStream.getVideoTracks()[0];
  v.enabled = !v.enabled;
  $btnCamera.textContent = v.enabled ? I18N[lang].cam_on : I18N[lang].cam_off;
}
function toggleMic() {
  if (!localStream) return;
  const a = localStream.getAudioTracks()[0];
  a.enabled = !a.enabled;
  $btnMic.textContent = a.enabled ? I18N[lang].mic_on : I18N[lang].mic_off;
}

function gender() {
  return (document.querySelector('input[name="gender"]:checked')?.value || "male");
}

function createPC() {
  pc = new RTCPeerConnection({ iceServers:[{urls:"stun:stun.l.google.com:19302"}] });
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  pc.ontrack = e => { $remote.srcObject = e.streams[0]; };
  pc.onicecandidate = e => { if (e.candidate) socket.emit("signal",{ type:"candidate", candidate: e.candidate }); };
}

async function startMatch() {
  await initMedia();
  setStatus(I18N[lang].searching);
  socket.emit("join", { gender: gender() });
}
function next() {
  socket.emit("leave");
  if (pc) pc.close();
  $remote.srcObject = null;
  startMatch();
}

socket.on("matched", async ({ roomId }) => {
  currentRoom = roomId;
  setStatus(I18N[lang].matched);
  createPC();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { type:"offer", sdp: offer.sdp });
});

socket.on("signal", async (data) => {
  if (!pc) createPC();
  if (data.type === "offer") {
    await pc.setRemoteDescription({ type:"offer", sdp: data.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", { type:"answer", sdp: answer.sdp });
  } else if (data.type === "answer") {
    await pc.setRemoteDescription({ type:"answer", sdp: data.sdp });
  } else if (data.type === "candidate") {
    try { await pc.addIceCandidate(data.candidate); } catch {}
  }
});

socket.on("partner-left", () => {
  setStatus(I18N[lang].left);
  if (pc) pc.close();
  $remote.srcObject = null;
});

$btnStart.onclick = startMatch;
$btnNext.onclick = next;
$btnCamera.onclick = toggleCam;
$btnMic.onclick = toggleMic;

$send.onclick = () => {
  const txt = $msg.value.trim();
  if (!txt) return;
  const line = document.createElement("div");
  line.textContent = "Вы: " + txt;
  $chat.appendChild(line);
  $msg.value = "";
};

// i18n init
$lang.onchange = () => {
  applyI18N($lang.value);
  localStorage.setItem("lm_lang", $lang.value);
};
applyI18N(localStorage.getItem("lm_lang") || "ru");
$lang.value = lang;

// информация об оплате (текст)
fetch("/api/admin/settings?code=__none") // просто чтобы вытащить цены (403 не страшно)
  .then(r => r.json())
  .then(data => {
    if (data?.settings) {
      $payInfo.textContent = `Бесплатно: ${data.settings.freeMinutes} мин, затем $${data.settings.priceUSDfor30} за 30 мин.`;
    }
  })
  .catch(()=>{});

// кнопки оплаты — формируем POST на сервер, он сделает авто-редирект на каспи/WM
$payKaspi.onclick = () => {
  postRedirect("/api/pay/kaspi", { minutes: 30, amount: 5 });
};
$payWM.onclick = () => {
  postRedirect("/api/pay/webmoney", { minutes: 30, amount: 5 });
};
function postRedirect(url, data) {
  const f = document.createElement("form");
  f.method = "post"; f.action = url;
  for (const k in data) {
    const i = document.createElement("input");
    i.type="hidden"; i.name=k; i.value=data[k];
    f.appendChild(i);
  }
  document.body.appendChild(f);
  f.submit();
}

// ==== админка (вкладки) ====
openAdmin.onclick = () => adminModal.style.display = "flex";
closeAdmin.onclick = () => adminModal.style.display = "none";

qsa(".tab").forEach(btn=>{
  btn.onclick = ()=>{
    qsa(".tabpane").forEach(p=>p.style.display="none");
    qs("#"+btn.dataset.tab).style.display="block";
  }
});

const $adminCode = qs("#adminCode");
const $freeMinutes = qs("#freeMinutes");
const $priceUSDfor30 = qs("#priceUSDfor30");
const $langDefault = qs("#langDefault");

const $kaspiEnabled = qs("#kaspiEnabled");
const $kaspiMerchant = qs("#kaspiMerchant");
const $kaspiReceiver = qs("#kaspiReceiver");

const $wmEnabled = qs("#wmEnabled");
const $wmPurse = qs("#wmPurse");

qs("#loadSettings").onclick = async () => {
  const code = $adminCode.value.trim();
  if (!code) return alert("Введите код администратора");
  const r = await fetch(`/api/admin/settings?code=${encodeURIComponent(code)}`);
  if (!r.ok) return alert("Код неверен");
  const { settings } = await r.json();

  $freeMinutes.value = settings.freeMinutes;
  $priceUSDfor30.value = settings.priceUSDfor30;
  $langDefault.value = settings.langDefault || "ru";

  $kaspiEnabled.checked = !!settings.payments?.kaspi?.enabled;
  $kaspiMerchant.value = settings.payments?.kaspi?.merchantId || "";
  $kaspiReceiver.value = settings.payments?.kaspi?.receiver || "";

  $wmEnabled.checked = !!settings.payments?.webmoney?.enabled;
  $wmPurse.value = settings.payments?.webmoney?.purse || "";

  // users
  refreshStats(code);
};

qs("#saveSettings").onclick = async () => {
  const code = $adminCode.value.trim();
  if (!code) return alert("Введите код администратора");

  const body = {
    freeMinutes: Number($freeMinutes.value || 0),
    priceUSDfor30: Number($priceUSDfor30.value || 0),
    langDefault: $langDefault.value,
    payments: {
      kaspi: {
        enabled: $kaspiEnabled.checked,
        merchantId: $kaspiMerchant.value.trim(),
        receiver: $kaspiReceiver.value.trim()
      },
      webmoney: {
        enabled: $wmEnabled.checked,
        purse: $wmPurse.value.trim()
      }
    }
  };

  const r = await fetch(`/api/admin/settings?code=${encodeURIComponent(code)}`, {
    method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
  });
  if (!r.ok) return alert("Ошибка сохранения");
  alert("Сохранено");
};

qs("#refreshStats").onclick = () => refreshStats($adminCode.value.trim());
async function refreshStats(code){
  if (!code) return;
  const r = await fetch(`/api/admin/stats`);
  const data = await r.json();
  qs("#stats").textContent = `Онлайн: ${data.online}, В очередях: M=${data.queues.male} / F=${data.queues.female}, Комнат: ${data.rooms}`;
}
