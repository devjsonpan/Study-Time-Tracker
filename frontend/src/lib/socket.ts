import { io, Socket } from 'socket.io-client'

// io creates the socket instance
// we don't want it to connect immediately on import since we'll call socket.connect() manually in Chat.tsx
export const socket: Socket = io({ autoConnect: false })  // don't connect until the user is logged in