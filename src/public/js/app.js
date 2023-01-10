// app.js

const socket = io(); // io function은 알아서 socket.io를 실행하고 있는 서버를 찾을 것이다!

const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");
const call = document.getElementById("call");

call.hidden = true;

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection = {};
let myDataChannel;

/*------------- 순서 2번 -----------------*/

async function getCameras() {
  try {
    console.log(" getCameras카메라 가지고온다. ")
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}

/*------------- 순서 2번 -----------------*/

async function getMedia(deviceId) {
  console.log(" getMedia카메라 가지고온다. ");
  const initialConstrains = {
    audio: true,
    video: { facingMode: "user" },
  };
  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };
  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstrains
    );
    myFace.srcObject = myStream;
    if (!deviceId) {
      await getCameras();
    }
  } catch (e) {
    console.log(e);
  }
}

/*------------- 순서 2번 -----------------*/

function handleMuteClick() {
  myStream                           // addStream() 대신 사용되고, 
    .getAudioTracks()                // 오디오 트랙과 비디오 트랙을 myPeerConnection넣어줘야한다.
    .forEach((track) => (track.enabled = !track.enabled));
  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "Mute";
    muted = false;
  }
}
function handleCameraClick() {
  myStream
    .getVideoTracks()                   // 비디오 트랙을 myPeerConnection넣어줘야한다.
    .forEach((track) => (track.enabled = !track.enabled));
  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera On";
    cameraOff = true;
  }
}

async function handleCameraChange() {
  await getMedia(camerasSelect.value);
  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);

// Welcome Form (join a room)

const welcome = document.getElementById("welcome");
const welcomeForm = welcome.querySelector("form");

/*------------- 순서 2번 -----------------*/

async function initCall() {
  console.log("1.3번")
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();      // getUserMedia()로 부터 동영상 스트림을 출력하고 다른 하나는 RTCPeerConnection을 통해 동일 동영상을 출력한다.
  //makeconnection
}

/*------------- 순서 1.5번 -----------------*/

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");
  await initCall();
  socket.emit("join_room", input.value, socket.id);
  console.log("socket ID 는 :" + socket.id)
  roomName = input.value;
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);
/*------------- 순서 1번 -----------------*/

// Socket Code

socket.on("welcome", async (newSocketId) => { //A소켓이 받아
  makeConnection(newSocketId);
  const connection = myPeerConnection[newSocketId];
  myDataChannel = connection.createDataChannel("chat");
  myDataChannel.addEventListener("message", (event) => console.log(event.data));
  console.log("made data channel");
  const offer = await connection.createOffer();  // createOffer() 메소드 는 원격 피어에 대한 새로운 WebRTC 연결을 시작할 목적으로 SDP 제안 생성 을 시작합니다. 
  connection.setLocalDescription(offer);         // setLocalDescription() changes the local description associated with the connection. This description specifies the properties of the local end of the connection, including the media format.
  console.log("sent the offer");
  socket.emit("offer", offer, roomName, newSocketId, socket.id);
});

socket.on("offer", async (offer, oldSocketId) => {
  makeConnection(oldSocketId);
  const connection = myPeerConnection[oldSocketId];
  connection.addEventListener("datachannel", (event) => {
    myDataChannel = event.channel;
    myDataChannel.addEventListener("message", (event) =>
      console.log(event.data)
    );
  });
  console.log("received the offer");
  connection.setRemoteDescription(offer);
  const answer = await connection.createAnswer();
  connection.setLocalDescription(answer);
  socket.emit("answer", answer, roomName, oldSocketId, socket.id); // 새로 들어온 애한테 old 들한테 나를 전해주는 부분
  console.log("sent the answer");
});

socket.on("answer", (answer, newSocketId) => {
  console.log("received the answer");
  const connection = myPeerConnection[newSocketId]
  connection.setRemoteDescription(answer);
});

socket.on("ice", (ice, curSocketId) => {
  if (ice) {
    console.log("received candidate");
    const connection = myPeerConnection[curSocketId]
    connection.addIceCandidate(ice);
  }
});

// RTC Code
function makeConnection(socketId) {
  console.log("연결을 일으킨다.")
  const localMyPeerConnection = new RTCPeerConnection({ // RTCPeerConnection은 동영상과 음성, 그리고 데이터를 주고 받을 수 있도록 WebRTC를 구성하는 API 이다.
    iceServers: [                            // ice : 두 단말이 서로 통신할 수 있는 최적의 경로를 찾을 수 있도록 도와주는 프레임워크
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });
  if (socketId !== '') {
    myPeerConnection[socketId] = localMyPeerConnection
  }
  console.log(localMyPeerConnection)
  console.log(myDataChannel)
  localMyPeerConnection.addEventListener("icecandidate", handleIce);
  localMyPeerConnection.addEventListener("track", handleTrack);
  console.log("!새로운 커넥션", myPeerConnection)

  myStream
    .getTracks()
    .forEach((track) => localMyPeerConnection.addTrack(track, myStream));
}

function handleIce(data) {
  console.log("sent candidate");
  for (const [sid, connection] of Object.entries(myPeerConnection)) {
    if (connection === data.target) {
      socket.emit("ice", data.candidate, sid, socket.id);
    }
  }
}

function handleTrack(data) {
  if (data.track.kind === 'video') {
    const div = document.getElementById('video')
    const peerFace = document.createElement("video");
    peerFace.autoplay = true;
    peerFace.width = 400;
    peerFace.height = 400;
    peerFace.setAttribute("playsinline", "playsinline");
    peerFace.srcObject = data.streams[0];
    div.appendChild(peerFace);
  }
}


// wsServer.sockets.emit('room_change',publicRoom())
// wsServer(웹서버의).sockets(지금 연결된 모든 소켓들에게).emit('room_change',publicRoom())(개설되어있는 방과 함께 room_change이벤트를 보낸다. )
