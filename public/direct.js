
let _roomID_ = window.location.href;
_roomID_ = _roomID_.replace(/.*\/([^\/]*)\/.*/, "$1")

$('#join-page').on('click', ()=>{
    window.location.href = `/${_roomID_}`;
});

$('#external-chat').on('click', ()=>{
    window.location.href = `/${_roomID_}/message`;
})