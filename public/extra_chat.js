const chat_styling = document.getElementById('chat-screen').style;
chat_styling.display = 'flex';
socket = io('/');

let _roomID_ = window.location.href;
_roomID_ = _roomID_.replace(/.*\/([^\/]*)\/.*/, "$1")

const NAME = sessionStorage.getItem(`${_roomID_}-name`);
if(NAME === null){
    //if someone tries to accesses the chat without a set name
    window.location.href = '/invalid';
}

socket.emit('outer-user', _roomID_);

$(document).keydown(e => {
    let keycode = (e.keyCode ? e.keyCode : e.which);
    let message_txt = $('#chat-text').val().trim();
    if(keycode === 13 && !(message_txt === "")){
        $('#chat-text').val('');
        injectMessagesintoChat(NAME, message_txt);
        socket.emit('message', message_txt, NAME, _roomID_);
    }
})

socket.on('message-to-all-users', (msg, msgUserName )=> {
    injectMessagesintoChat(msgUserName, msg);
})

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


const TwelveHourFormatCurrentTime = ()=>{
    let CurrentTime = new Date().toLocaleTimeString().replace(/([\d]+:[\d]{2})(:[\d]{2})(.*)/, "$1$3");
    return CurrentTime;
}

$('#return-to-main').on('click', ()=>{
    window.location.href = `/${_roomID_}`;
})