import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Check, X, MessageCircle, Users } from 'lucide-react'
import {
  getFriends, sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  getConversations, openDM, getMessages,
  type Friend, type PendingRequest, type Conversation, type ChatMessage,
} from '../api/chat'
import { getMyGroup, createGroup, joinGroup, leaveGroup } from '../api/groups'
import { getMe } from '../api/auth'
import { socket } from '../lib/socket'

export default function Chat() {
    const queryClient = useQueryClient()
    const [activeConv, setActiveConv] = useState<Conversation | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [draft, setDraft] = useState('')
    const [addInput, setAddInput] = useState('')
    const [addError, setAddError] = useState('')
    const [groupNameInput, setGroupNameInput] = useState('')
    const [joinCodeInput, setJoinCodeInput] = useState('')
    const [groupError, setGroupError] = useState('')
    const [showMembers, setShowMembers] = useState(false)
    const [memberSearch, setMemberSearch] = useState('')
    const bottomRef = useRef<HTMLDivElement>(null)
    const activeConvIdRef = useRef<number | null>(null)

    const { data: me } = useQuery({
        queryKey: ['me'],
        queryFn: getMe,
    })

    const { data: friendData, refetch: refetchFriends } = useQuery({
        queryKey: ['friends'],
        queryFn: getFriends,
    })

    const { data: conversations = [], refetch: refetchConvs } = useQuery({
        queryKey: ['conversations'],
        queryFn: getConversations,
    })

    const { data: groupData, isLoading: groupLoading } = useQuery({
        queryKey: ['group'],
        queryFn: getMyGroup,
    })

    // Connect socket when page mounts, disconnect when leaving
    useEffect(() => {
        if (!socket.connected) socket.connect()
        socket.off('new_message')  // prevent duplicate listeners if component re-renders
        socket.on('new_message', (msg: ChatMessage & { conv_id: number }) => {
            if (activeConvIdRef.current === msg.conv_id) {
                setMessages(prev => [...prev, msg])
            }
        })
        
        return () => {
            socket.off('new_message')
        }
    }, [])

    // Auto-scroll to bottom when messages change
    useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // When active conversation changes: join the room + fetch history
    useEffect(() => {
    if (!activeConv) return
    socket.emit('join', { conv_id: activeConv.id })
    getMessages(activeConv.id).then(setMessages)
    }, [activeConv])

    useEffect(() => {
        activeConvIdRef.current = activeConv?.id ?? null
    }, [activeConv])

    const addFriendMutation = useMutation({
    mutationFn: () => sendFriendRequest(addInput.trim()),
    onSuccess: () => { setAddInput(''); setAddError(''); refetchFriends() },
    onError: () => setAddError('User not found or request already sent.'),
    })

    const acceptMutation = useMutation({
    mutationFn: (id: number) => acceptFriendRequest(id),
    onSuccess: () => refetchFriends(),
    })

    const declineMutation = useMutation({
    mutationFn: (id: number) => declineFriendRequest(id),
    onSuccess: () => refetchFriends(),
    })

    const openDMMutation = useMutation({
    mutationFn: (username: string) => openDM(username),
    onSuccess: async (convId, username) => {
        await refetchConvs()
        const convs = await getConversations()
        const conv = convs.find(c => c.id === convId) ?? { id: convId, type: 'dm' as const, name: username }
        setActiveConv(conv)
    },
    })

    const createGroupMutation = useMutation({
    mutationFn: () => createGroup(groupNameInput.trim()),
    onSuccess: async () => {
        setGroupNameInput('')
        setGroupError('')
        queryClient.invalidateQueries({ queryKey: ['group'] })
        await refetchConvs()
    },
    onError: (err: Error) => setGroupError(err.message),
    })

    const joinGroupMutation = useMutation({
    mutationFn: () => joinGroup(joinCodeInput.trim()),
    onSuccess: async () => {
        setJoinCodeInput('')
        setGroupError('')
        queryClient.invalidateQueries({ queryKey: ['group'] })
        await refetchConvs()
    },
    onError: (err: Error) => setGroupError(err.message),
    })

    const leaveGroupMutation = useMutation({
    mutationFn: leaveGroup,
    onSuccess: async () => {
        // If the group chat was open, close it
        if (activeConv?.type === 'group') setActiveConv(null)
        queryClient.invalidateQueries({ queryKey: ['group'] })
        await refetchConvs()
    },
    })

    // Opens the group chat from the sidebar
    function openGroupConv() {
        const groupConv = conversations.find(c => c.type === 'group')
        if (groupConv) setActiveConv(groupConv)
    }

    function sendMessage() {
        if (!activeConv || !draft.trim()) return
        socket.emit('send_message', { conv_id: activeConv.id, content: draft.trim() })
        setDraft('')
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const friends: Friend[] = friendData?.friends ?? []
    const pending: PendingRequest[] = friendData?.pending ?? []
 
    return (
    <>
    <div className="flex h-full overflow-hidden">

        {/* Message area */}
        <div className="flex-1 flex flex-col min-w-0">
        {activeConv ? (
            <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-indigo-200 bg-white shrink-0">
                <h2 className="text-base font-bold text-indigo-900">{activeConv.name}</h2>
                <p className="text-xs text-slate-400">{activeConv.type === 'dm' ? 'Direct message' : 'Group chat'}</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-white">
                {messages.length === 0 && (
                <p className="text-sm text-slate-400 text-center mt-8">No messages yet. Say hi!</p>
                )}
                {messages.map(msg => {
                const isMe = msg.sender === me?.username
                return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-xs lg:max-w-md">
                        {!isMe && <p className="text-xs text-slate-400 mb-0.5 ml-1">{msg.sender}</p>}
                        <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                        isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                        }`}>
                        {msg.content}
                        </div>
                    </div>
                    </div>
                )
                })}
                <div ref={bottomRef} />
            </div>

            {/* Compose */}
            <div className="px-6 py-4 border-t border-indigo-200 bg-white shrink-0">
                <div className="flex gap-3 items-end">
                <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message…"
                    rows={1}
                    className="flex-1 resize-none text-sm px-3.5 py-2.5 rounded-xl border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-indigo-50"
                />
                <button
                    onClick={sendMessage}
                    disabled={!draft.trim()}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 cursor-pointer shrink-0"
                >
                    Send
                </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">Enter to send · Shift+Enter for new line</p>
            </div>
            </>
        ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 bg-white">
            <MessageCircle size={48} className="text-indigo-300 mb-4" />
            <h2 className="text-lg font-bold text-slate-700 mb-1">No conversation open</h2>
            <p className="text-sm text-slate-400">Add a friend on the right, then click their name to start a DM.</p>
            </div>
        )}
        </div>

        {/* Right sidebar */}
        <aside className="w-64 flex flex-col border-l border-indigo-200 bg-white shrink-0 overflow-hidden">

        {/* Study Group */}
        <div className="px-4 pt-5 pb-3 border-b border-indigo-200">
          <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">Study Group</p>
          {groupLoading ? (
            <p className="text-xs text-slate-400 animate-pulse">Loading…</p>
          ) : groupData ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{groupData.name}</p>
                  <p className="text-xs text-slate-400 font-mono tracking-widest">{groupData.join_code}</p>
                </div>
                <button
                  onClick={() => leaveGroupMutation.mutate()}
                  disabled={leaveGroupMutation.isPending}
                  className="text-xs font-semibold text-rose-400 hover:text-rose-600 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {leaveGroupMutation.isPending ? '…' : 'Leave'}
                </button>
              </div>
              <button
                onClick={() => { setShowMembers(true); setMemberSearch('') }}
                className="w-full text-xs font-semibold text-indigo-500 hover:text-indigo-700 cursor-pointer text-left"
              >
                {groupData.members.length} member{groupData.members.length !== 1 ? 's' : ''} · View all
              </button>
              <button
                onClick={openGroupConv}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold hover:bg-indigo-200 cursor-pointer transition-colors"
              >
                <Users size={13} />
                Open Group Chat
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {groupError && <p className="text-xs text-red-500">{groupError}</p>}
              <form onSubmit={e => { e.preventDefault(); createGroupMutation.mutate() }} className="flex gap-1.5">
                <input
                  value={groupNameInput}
                  onChange={e => { setGroupNameInput(e.target.value); setGroupError('') }}
                  placeholder="Group name"
                  className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  type="submit"
                  disabled={!groupNameInput.trim() || createGroupMutation.isPending}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-40 cursor-pointer shrink-0"
                >
                  {createGroupMutation.isPending ? '…' : 'Create'}
                </button>
              </form>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-indigo-200" />
                <span className="text-xs text-indigo-400 font-bold">or</span>
                <div className="flex-1 h-px bg-indigo-200" />
              </div>
              <form onSubmit={e => { e.preventDefault(); joinGroupMutation.mutate() }} className="flex gap-1.5">
                <input
                  value={joinCodeInput}
                  onChange={e => { setJoinCodeInput(e.target.value.toUpperCase()); setGroupError('') }}
                  placeholder="Join code"
                  className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 font-mono uppercase"
                />
                <button
                  type="submit"
                  disabled={!joinCodeInput.trim() || joinGroupMutation.isPending}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold hover:bg-indigo-200 disabled:opacity-40 cursor-pointer shrink-0"
                >
                  {joinGroupMutation.isPending ? '…' : 'Join'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Add friend */}
        <div className="px-4 pt-5 pb-3 border-b border-indigo-200">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">Add Friend</p>
            <div className="flex gap-1.5">
            <input
                value={addInput}
                onChange={e => { setAddInput(e.target.value); setAddError('') }}
                onKeyDown={e => e.key === 'Enter' && addFriendMutation.mutate()}
                placeholder="Username"
                className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
                onClick={() => addFriendMutation.mutate()}
                disabled={!addInput.trim()}
                className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
            >
                <UserPlus size={15} />
            </button>
            </div>
            {addError && <p className="text-xs text-red-500 mt-1">{addError}</p>}
        </div>

        {/* Pending requests */}
        {pending.length > 0 && (
            <div className="px-4 pt-3 pb-1 border-b border-indigo-200">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">Requests</p>
            <ul className="space-y-1.5">
                {pending.map(req => (
                <li key={req.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate">{req.from}</span>
                    <div className="flex gap-1 shrink-0 ml-1">
                    <button onClick={() => acceptMutation.mutate(req.id)} className="p-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer">
                        <Check size={13} />
                    </button>
                    <button onClick={() => declineMutation.mutate(req.id)} className="p-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 cursor-pointer">
                        <X size={13} />
                    </button>
                    </div>
                </li>
                ))}
            </ul>
            </div>
        )}

        {/* Friends list — flex-1 + overflow so only this section scrolls */}
        <div className="px-4 pt-3 pb-2 flex-1 overflow-y-auto">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">
            Friends {friends.length > 0 && `(${friends.length})`}
            </p>
            {friends.length === 0 ? (
            <p className="text-xs text-slate-400">No friends yet.</p>
            ) : (
            <ul className="space-y-0.5">
                {friends.map(f => (
                <li key={f.id}>
                    <button
                    onClick={() => openDMMutation.mutate(f.username)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-indigo-100 cursor-pointer text-left"
                    >
                    <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                        {f.username[0].toUpperCase()}
                    </div>
                    {f.username}
                    </button>
                </li>
                ))}
            </ul>
            )}
        </div>

        {/* Recent conversations — shrink-0 so it anchors at the bottom, pt-[23px] matches compose border-t height */}
        {conversations.length > 0 && (
            <div className="px-4 pt-[23px] pb-4 border-t border-indigo-200 shrink-0">
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">Recent</p>
            <ul className="space-y-0.5">
                {conversations.slice(0, 3).map(conv => (
                <li key={conv.id}>
                    <button
                    onClick={() => setActiveConv(conv)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm cursor-pointer text-left transition-colors ${
                        activeConv?.id === conv.id
                        ? 'bg-indigo-200 text-indigo-900 font-semibold'
                        : 'text-slate-700 hover:bg-indigo-100'
                    }`}
                    >
                    <MessageCircle size={14} className="shrink-0 text-indigo-500" />
                    <span className="truncate">{conv.name}</span>
                    </button>
                </li>
                ))}
            </ul>
            </div>
        )}
        </aside>
    </div>

    {/* Members modal */}
    {showMembers && groupData && (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={() => setShowMembers(false)}
        >
            <div
                className="bg-white rounded-2xl shadow-xl w-80 max-h-[70vh] flex flex-col overflow-hidden border border-indigo-100"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-5 pt-5 pb-3 border-b border-indigo-100">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold text-slate-800">{groupData.name} members</p>
                        <button onClick={() => setShowMembers(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                            <X size={16} />
                        </button>
                    </div>
                    <input
                        autoFocus
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search members…"
                        className="w-full text-sm px-3 py-2 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                </div>
                <ul className="overflow-y-auto px-3 py-3 space-y-0.5">
                    {groupData.members
                        .filter(m => m.toLowerCase().includes(memberSearch.toLowerCase()))
                        .map(m => (
                        <li key={m} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-indigo-50">
                            <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                                {m[0].toUpperCase()}
                            </div>
                            <span className="text-sm text-slate-700 font-medium">@{m}</span>
                        </li>
                    ))}
                    {groupData.members.filter(m => m.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                        <li className="text-xs text-slate-400 text-center py-4">No members match.</li>
                    )}
                </ul>
            </div>
        </div>
    )}
    </>
    )
}
