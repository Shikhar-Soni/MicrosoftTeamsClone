const express = require('express');
const app = express();
const server = require('http').Server(app);
const {v4: v4} = require('uuid');
const io = require('socket.io')(server)

app.use('/peerjs', require('peer').ExpressPeerServer(server, {
    debug: true
}))

app.set('view engine', 'ejs');
app.use(express.static('public'));

const lockedRoom = new Set();

app.get('/', (req, res) => {
    res.redirect(`/${v4()}`);
});

app.get('/:room/exit', (req, res) => {
    res.render('end_meet');
})

app.get('/:room/message', (req, res) => {
    res.render('extra_chat');
})

app.get('/room-locked', (req, res) => {
    res.render('room_locked')
})

app.get('/invalid', (req, res) => {
    res.render('invalid');
})

app.get('/:room', (req, res) => {
    let room_id = req.params.room;
    console.log(room_id);
    if(lockedRoom.has(room_id)){
        res.redirect(`/room-locked`);
    }
    else{
        res.render('base');
    }
})

io.on('connection', socket => {
    socket.on('outer-user', (outer_room_id)=>{
        console.log('outer_user_joined_room');
        socket.join(outer_room_id);
    })
    socket.on('join-room', (roomId, id, name)=>{
        socket.name = name;
        socket.room = roomId;
        socket.peer_userID = id;
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', id, name);
        io.to(socket.id).emit('room-lock-status', lockedRoom.has(socket.room));
        socket.on('disconnect', () => {
            console.log('Got disconnected!', socket.name);
            socket.to(socket.room).emit('update-user-list', socket.name, socket.peer_userID);
        })

        socket.on('lock-this-room', () => {
            console.log('lock it');
            lockedRoom.add(socket.room);
            socket.to(socket.room).emit('lock-room', socket.name);
        })

        socket.on('unlock-this-room', ()=>{
            console.log('unlock it');
            lockedRoom.delete(socket.room);
            socket.to(socket.room).emit('unlock-room', socket.name);
        })
    })
    socket.on('share-screen-end', screen_share_peer_id => {
        socket.to(socket.room).emit('update-screen-share-status');
    })

    socket.on('message', (msg, msgUserName, outer_room) => {
        _room_id = socket.room || outer_room;
        socket.to(_room_id).emit('message-to-all-users', msg, msgUserName);
    })
})

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`listening at port : ${port}`);
});