const socket = io('/');

let NAME = 'anonymous'; //symbolic start name
AllUsersinRoom = {};
endCallTracker = {};
NetConnect = 0;
const ScreenCaptureElement = document.getElementById('screen-capture');
const videoGrid = document.getElementById('video-grid');
let isScreenBeingShared = false;
let isMeetingLocked = false;
let CapturedStream;

//cleaning the URL to get the room ID
let _roomID = window.location.href;
_roomID = _roomID.replace(/.*\/([^\/]*)/, "$1")

//prevents duplication of tab when room is locked - not an ideal way to do it
//but I wasn't able to come up with something better
let checkIfLockedAndDuplicate = sessionStorage.getItem(`locked-${_roomID}`);
if(checkIfLockedAndDuplicate === 'locked'){
    window.location.href = '/room-locked';
}

//these few lines ensure that a user doesn't have to enter their name again and again
let checkPreviousName = sessionStorage.getItem(`${_roomID}-name`);
if(checkPreviousName !== null){
    $('#name').val(checkPreviousName);
}

const peer_port = (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "") ? '3000' : '443';

var peer = new Peer(undefined,{
    host: '/',
    port: peer_port,
    path: '/peerjs'
});

var getUserMedia = navigator.mediaDevices.getUserMedia;

let UserMediaObject = {
    video: true,
    audio: true
}
let ShareTracker = 0;
let shareScreenUserID = -1;

let ID; //id generated by peerjs
peer.on('open', id => {
    ID = id;
    console.log('MY ID' + ID)
})

peer.on('connection', conn => {
    conn.on('data', name_of_a_user => {
    //saving the name of different users in the room on connection
        SaveUsersInRoom(name_of_a_user);
        console.log('sent data', name_of_a_user);
    });
});

let stream;
//Join meet/name-set button
$('#name-set').on('click', ()=>JoinMeet());

const JoinMeet = async ()=>{

    NAME = $('#name').val().trim();
    if(NAME.length === 0){
        NAME = 'anonymous';
        document.getElementById('zero-input').style.display = 'block';
        return;
    }
    sessionStorage.setItem(`${_roomID}-name`, NAME);
    document.getElementById('start-message').style.display = 'none';
    document.getElementById('main-window').style.display = 'block';
    document.getElementById('zero-input').style.display = 'none';
    document.getElementsByTagName('body')[0].style.backgroundImage = 'none';

    //wait for the promise to resolve and then proceed further
    stream = await getUserMedia(UserMediaObject);

    try{
        stream.getAudioTracks()[0].enabled = false;
    }catch(err){
        console.log(err.message);
    }
    try{
        stream.getVideoTracks()[0].enabled = false;
    }
    catch(err){
        console.log(err.message);
    }

    sendStatusMessage(NAME, 'joined');
    SaveUsersInRoom(NAME);
    
    const OwnVideo = document.createElement('video');
    OwnVideo.muted = true;
    OwnVideo.srcObject = stream;
    OwnVideo.addEventListener('loadedmetadata', () => {
        OwnVideo.play();
    })
    videoGrid.append(OwnVideo);

    console.log('currentRoomID = ', _roomID);
    socket.emit('join-room', _roomID, ID, NAME);
    UpdateParticipantCount('+');
}

socket.on('user-connected', (id, name_newuser)=>{

    //join message to be printed in chat
    sendStatusMessage(name_newuser, 'joined');

    //saving the name of the new_user that connected
    SaveUsersInRoom(name_newuser);
    UpdateParticipantCount('+');

    //connecting to that user and sending it your name back
    let conn = peer.connect(id);
    conn.on('open', function(){
        conn.send(NAME);
    });

    //calling the user and sending them our stream
    connectToNewUser(id, stream);
});

peer.on('call', call =>{

    console.log(call.peer + ' called');
    ShareTracker = 0;
    
    if(endCallTracker[call.peer]){
        ShareTracker = 1;
    }
    if(ShareTracker === 0){
        endCallTracker[call.peer] = call;
        //answering a call and sending the caller our stream
        call.answer(stream);
    }
    else{
        call.answer()
        //empty answer for one way connection needed in screen sharing from peerjs documentation
    }
    const video = document.createElement('video');
    UpdateParticipantCount('+');

    call.on('stream', remoteStream => {
        if(ShareTracker === 0){
            injectStreamIntoVideo(video, remoteStream, call.peer);
        }
        else{
            injectScreenIntoField(ScreenCaptureElement, remoteStream, call.peer);
        }
    });
})

socket.on('update-user-list', (delete_name, delete_user_id)=>{

    if(endCallTracker[delete_user_id]) endCallTracker[delete_user_id].close();

    sendStatusMessage(delete_name, 'left');
    if(shareScreenUserID === delete_user_id){
        stopScreenMediaCapture();
        shareScreenUserID = -1;
    }
    console.log('delete this name ?', delete_name, ' ', delete_user_id);
    maintainParticipantList(delete_name)
    UpdateParticipantCount('-');
    removeVideo(delete_user_id);
    printUsersInRoom();
})

socket.on('update-screen-share-status', () => {
    stopScreenMediaCapture();
    shareScreenUserID = -1;
})

socket.on('lock-room', LockersName=>{
    sendStatusMessage(LockersName, 'locked this room');
    isMeetingLocked = true;
    document.getElementById('lock-close').style.display = 'flex';
    document.getElementById('lock-open').style.display = 'none';
    flipColor('lock-meet')
    sessionStorage.setItem(`locked-${_roomID}`, 'locked');
})

socket.on('unlock-room', UnlockersName=>{
    sendStatusMessage(UnlockersName, 'unlocked this room');
    isMeetingLocked = false;
    document.getElementById('lock-close').style.display = 'none';
    document.getElementById('lock-open').style.display = 'flex';
    flipColor('lock-meet');
    sessionStorage.removeItem(`locked-${_roomID}`);
})

const connectToNewUser = (id, stream) => {
    const call = peer.call(id, stream);
    const video = document.createElement('video');
    call.on('stream', (userVideoStream) => {
        injectStreamIntoVideo(video, userVideoStream, id);
    })
    call.on('close', () => {
        video.remove();
    })
    endCallTracker[id] = call;
}

const injectStreamIntoVideo = (video, stream, peer_id) => {
    video.srcObject = stream;
    video.id = peer_id;
    video.class = 'all_video_element';
    video.addEventListener('loadedmetadata', () => {
        video.play();
    })
    videoGrid.append(video);
    if(isScreenBeingShared){
        peer.call(peer_id, CapturedStream);
    }
}

const injectScreenIntoField = (videoElement, ScreenShareStream, ShareUserPeerID) => {
    videoElement.srcObject = ScreenShareStream;
    videoElement.style.display = 'flex';
    shareScreenUserID = ShareUserPeerID;
}

$(document).keydown(e => {
    let keycode = (e.keyCode ? e.keyCode : e.which);
    let message_txt = $('#chat-text').val().trim();
    if(keycode === 13 && !(message_txt === "")){
        $('#chat-text').val('');
        injectMessagesintoChat(NAME, message_txt);
        socket.emit('message', message_txt, NAME);
    }
})

socket.on('message-to-all-users', (msg, msgUserName )=> {
    injectMessagesintoChat(msgUserName, msg);
})

socket.on('room-lock-status', isItLocked => {
    console.log('lock status sent');
    if(isItLocked){
        isMeetingLocked = true;
        document.getElementById('lock-close').style.display = 'flex';
        document.getElementById('lock-open').style.display = 'none';
        flipColor('lock-meet')
        sessionStorage.setItem(`locked-${_roomID}`, 'locked');
    }
})

// ------------------------------------------------------------------------
//BUTTON CONTROLS
// ------------------------------------------------------------------------

$('#extra-chat').on('click', ()=>{
    let otherChatName = $('#name').val().trim();
    if(otherChatName.length === 0){
        document.getElementById('zero-input').style.display = 'block';
        return;
    }
    sessionStorage.setItem(`${_roomID}-name`, otherChatName);
    chatWithoutLogging();
})

const flipColor = (ID_name) => {
    let btn = document.getElementById(ID_name);
    btn.style.color = btn.style.color === 'red' ? 'white' : 'red';
}

$('#camera-stop').on('click', ()=>{
    try{
        let isOpen = stream.getVideoTracks()[0].enabled = !stream.getVideoTracks()[0].enabled;
        console.log('Is Camera Open ? : ' + isOpen);
        flipColor('camera-stop');
    }
    catch(err){
        console.log(err.message);
    }
})

$('#mute').on('click', () => {
    try{
        let isOpen = stream.getAudioTracks()[0].enabled = !stream.getAudioTracks()[0].enabled;
        console.log('Is Microphone Open ? : ' + isOpen);
        flipColor('mute');
    }
    catch(err){
        console.log(err.message);
    }
})

var displayMediaObject = {
    video: {
      cursor: "always"
    },
    audio: false
};

$('#screen-share').on('click', async () => {
    console.log(isScreenBeingShared, 'screen - share');
    if(shareScreenUserID !== -1){
        alert('only one user can share screen at a time');
        return;
    }
    if(!isScreenBeingShared){
        CapturedStream = await captureScreenMedia();
        isScreenBeingShared = true;
        let UserIDList = Object.keys(endCallTracker);
        for(let i = 0; i < UserIDList.length; i++){
            peer.call(UserIDList[i], CapturedStream);
        }
        ScreenCaptureElement.style.display = 'flex';
        flipColor('screen-share');

        CapturedStream.getVideoTracks()[0].onended = () => {
            console.log('stop screen capture');
            ScreenCaptureElement.style.display = 'none';
            isScreenBeingShared = false;
            socket.emit('share-screen-end');
            flipColor('screen-share');
        };
    }
    else{
        socket.emit('share-screen-end');
        stopScreenMediaCapture();
        isScreenBeingShared = false;
        flipColor('screen-share');
    }
})

const  captureScreenMedia = async () => {
    console.log('screen capture begins');
    let saveTheStream =  await navigator.mediaDevices.getDisplayMedia(displayMediaObject);
    ScreenCaptureElement.srcObject = saveTheStream;
    return saveTheStream;
}

const stopScreenMediaCapture = async () => {
    let tracks = ScreenCaptureElement.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    ScreenCaptureElement.srcObject = null;
    ScreenCaptureElement.style.display = 'none';
}

$('#participant').on('click', () => {
    document.getElementById('chat-screen').style.display = 'none';
    let currentVisibilityStatus = document.getElementById('participant-list').style.display;
    document.getElementById('participant-list').style.display = (currentVisibilityStatus === 'none' || currentVisibilityStatus === "")? 'flex' : 'none';
})

$('#chat-list-toggle').on('click', () => {
    document.getElementById('participant-list').style.display = 'none';
    let currentVisibilityStatus = document.getElementById('chat-screen').style.display;
    document.getElementById('chat-screen').style.display = (currentVisibilityStatus === 'none' || currentVisibilityStatus === "")? 'flex' : 'none';
    $('#chat-display').scrollTop($('#chat-display')[0].scrollHeight);
})

// refer https://stackoverflow.com/a/64000120 for reference to this
$('#copy-link').on('click', () => {
    let currentURL = window.location.href;
    navigator.clipboard.writeText(currentURL).then(()=>{
        popUp();
    }, function () {
        alert('Failure to copy. Check permissions for clipboard');
    });
})

const popUp = () => {
    const popUpElement = document.getElementById('popUp');
    popUpElement.style.visibility = 'visible';
    setTimeout(()=>{popUpElement.style.visibility = 'hidden'}, 1000)
}

$('#lock-meet').on('click', () => {
    isMeetingLocked = !isMeetingLocked;
    if(isMeetingLocked){
        socket.emit('lock-this-room');
        sendStatusMessage('You', 'locked this room');
        document.getElementById('lock-close').style.display = 'flex';
        document.getElementById('lock-open').style.display = 'none';
        sessionStorage.setItem(`locked-${_roomID}`, 'locked');
    }
    else{
        socket.emit('unlock-this-room');
        sendStatusMessage('You', 'unlocked this room');
        document.getElementById('lock-close').style.display = 'none';
        document.getElementById('lock-open').style.display = 'flex';
        sessionStorage.removeItem(`locked-${_roomID}`);
    }
    flipColor('lock-meet');
})

$('#end-meet').on('click', () => {
    console.log('meeting ended');
    exitMeet();
})

// ------------------------------------------------------------------------
// UTILITY
// ------------------------------------------------------------------------


const TwelveHourFormatCurrentTime = ()=>{
    let CurrentTime = new Date().toLocaleTimeString().replace(/([\d]+:[\d]{2})(:[\d]{2})(.*)/, "$1$3");
    return CurrentTime;
}


const injectMessagesintoChat = (name, msg) => {

    //append the messages into the chat display
    let CurrentTime = TwelveHourFormatCurrentTime();
    let MessageToBeInjected = `
    <br>
    <div id="style-text">
        <span id="style-chat-name"> ${name} </span>
        <span style="font-size:0.8em; font-family: Verdana">${CurrentTime}</span>
        <div id="main-body-message"> ${msg} </div>
    </div>
    <br>
    `;

    $('#chat-display').append(MessageToBeInjected);

    //auto scroll to the bottom
    $('#chat-display').scrollTop($('#chat-display')[0].scrollHeight);
}

const SaveUsersInRoom = (new_name) => {
    if(AllUsersinRoom[new_name])
        AllUsersinRoom[new_name].push(NetConnect);
    else
        AllUsersinRoom[new_name] = [NetConnect];
    addParticipantList(new_name);
    ++NetConnect;
}

const printUsersInRoom = ()=>{
    for(let i = 0; i < AllUsersinRoom.length; i++){
        console.log('name ->', AllUsersinRoom[i]);
    }
}

const addParticipantList = (addThisName) => {
    $("#insert-participants:last").after("<div class='style-participant-list' id='div_"+ NetConnect +"'></div>");
    $("#div_" + NetConnect).append(`<div>${addThisName}</div>`);
}

const maintainParticipantList = (delete_name) => {
    
    let removed = -1;
    if(AllUsersinRoom[delete_name]){
        removed = AllUsersinRoom[delete_name].pop();
    }
    console.log('deleted at', delete_name);
    $("#div_" + removed).remove();
}

const sendStatusMessage = (PrintUserStatus, Status) => {
    $('#chat-display').append(

    `
    <br>
    <div id="joining-message-chat">
        ${PrintUserStatus}  ${Status}
    </div>
    <br>
    `
    );

    //auto scroll to the bottom
    $('#chat-display').scrollTop($('#chat-display')[0].scrollHeight);
}

const removeVideo = (delete_user_id) => {
    $(`#${delete_user_id}`).remove();
}

const exitMeet = () => {
    window.location.href = `/${_roomID}/exit`;
};

const chatWithoutLogging = () => {
    window.location.href = `/${_roomID}/message`;
}

let countTotal = 0 //stores the exact count of persons other than us currently connected to the meet
const UpdateParticipantCount = (operation_type) => {
    ParticipantCountElement = document.getElementById('participant-count');
    if(operation_type === '+'){
        countTotal += 1;
    }
    else{
        countTotal -= 1;
    }
    ParticipantCountElement.innerHTML = `<span>&nbsp; (${countTotal}) </span>`;
    console.log(countTotal);
}