import { state } from './state.js';
import { supabaseClient } from './config.js';
import { showToast } from './utils.js';

export function handleRespond(adId, receiverId, adDescription) {
    if (!state.currentUser) return;
    const modal = document.getElementById('message-modal');
    const adInfo = document.getElementById('modal-ad-info');
    const sendBtn = document.getElementById('send-msg-btn');
    const closeBtn = document.getElementById('close-modal');

    if (adInfo) adInfo.innerText = `Oglas: "${adDescription}"`;
    modal.classList.add('active');
    closeBtn.onclick = () => modal.classList.remove('active');

    sendBtn.onclick = async () => {
        const content = document.getElementById('message-text').value;
        if (!content) return;
        sendBtn.innerText = 'Slanje...';
        sendBtn.disabled = true;

        const { error } = await supabaseClient.from('poruke').insert([{
            oglas_id: adId,
            sender_id: state.currentUser.id,
            receiver_id: receiverId,
            content: content,
            sender_name: state.currentUser.user_metadata?.full_name || 'Susjed',
            is_read: false
        }]);

        if (error) showToast('Greška pri slanju.', 'error');
        else {
            showToast('Poruka poslana!');
            modal.classList.remove('active');
            document.getElementById('message-text').value = '';
        }
        sendBtn.innerText = 'Pošalji';
        sendBtn.disabled = false;
    };
}

export async function fetchMessages() {
    const messagesList = document.getElementById('messages-list');
    if (!messagesList || !state.currentUser) return;

    const { data, error } = await supabaseClient.from('poruke')
        .select(`*, oglas_id (id, description, expires_at, user_id)`)
        .or(`sender_id.eq.${state.currentUser.id},receiver_id.eq.${state.currentUser.id}`)
        .order('created_at', { ascending: false });

    if (error) return;

    const now = new Date();
    const conversations = {};
    let totalUnread = 0;

    data.forEach(msg => {
        const oglas = msg.oglas_id;
        if (!oglas) return;

        const expiryDate = new Date(oglas.expires_at);
        const cutoffDate = new Date(expiryDate.getTime() + (24 * 60 * 60 * 1000));
        if (now > cutoffDate) return;

        const otherUserId = (msg.sender_id === state.currentUser.id) ? msg.receiver_id : msg.sender_id;
        const otherUserName = (msg.sender_id !== state.currentUser.id) ? msg.sender_name : null;
        const convKey = `${oglas.id}_${otherUserId}`;

        if (!conversations[convKey]) {
            conversations[convKey] = {
                title: oglas.description,
                adId: oglas.id,
                adOwnerId: oglas.user_id,
                otherUserId: otherUserId,
                otherUserName: otherUserName || 'Susjed',
                messages: [],
                lastMsg: msg.content,
                time: msg.created_at
            };
        } else if (otherUserName && conversations[convKey].otherUserName === 'Susjed') {
            conversations[convKey].otherUserName = otherUserName;
        }
        conversations[convKey].messages.push(msg);

        if (msg.receiver_id === state.currentUser.id && !msg.is_read) {
            totalUnread++;
        }
    });

    const badge = document.getElementById('unread-badge');
    if (badge) {
        if (totalUnread > 0) {
            badge.innerText = totalUnread > 99 ? '99+' : totalUnread;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    if (state.activeConversationAdId) {
        const currentConv = conversations[state.activeConversationAdId];
        if (currentConv) renderChatThread(currentConv);
        else renderConversations(conversations);
    } else {
        renderConversations(conversations);
    }
}

function renderConversations(conversations) {
    const messagesList = document.getElementById('messages-list');
    if (Object.keys(conversations).length === 0) {
        messagesList.innerHTML = '<p class="empty-state">Još nemaš aktivnih razgovora.</p>';
        return;
    }

    messagesList.innerHTML = '';
    const sortedConvs = Object.values(conversations).sort((a, b) => new Date(b.time) - new Date(a.time));

    sortedConvs.forEach(conv => {
        const convKey = `${conv.adId}_${conv.otherUserId}`;
        const card = document.createElement('div');
        card.className = 'conversation-card';
        card.innerHTML = `
            <div class="conv-header"><span class="conv-meta">Oglas: ${conv.title}</span></div>
            <div class="conv-user-name">${conv.otherUserName}</div>
            <p class="conv-last-msg">${conv.lastMsg}</p>
        `;
        card.onclick = () => {
            state.activeConversationAdId = convKey;
            renderChatThread(conv);
        };
        messagesList.appendChild(card);
    });
}

function renderChatThread(conv) {
    const messagesList = document.getElementById('messages-list');
    const currentInput = document.getElementById('chat-reply-input');
    const savedValue = currentInput ? currentInput.value : '';
    const wasFocused = currentInput === document.activeElement;

    messagesList.innerHTML = `
        <div class="chat-thread-container">
            <div class="thread-header">
                <button class="back-btn" onclick="window.goBackToConversations()">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div class="thread-info">
                    <div class="thread-user-name">${conv.otherUserName}</div>
                    <div class="thread-ad-title">Oglas: ${conv.title}</div>
                </div>
            </div>
            <div class="messages-scroller thread-scroller" id="thread-scroller"></div>
            <div class="chat-input-bar">
                <input type="text" id="chat-reply-input" placeholder="Napiši poruku...">
                <button class="chat-send-btn" id="chat-reply-btn">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
    `;

    const newInput = document.getElementById('chat-reply-input');
    if (newInput) {
        newInput.value = savedValue;
        if (wasFocused) newInput.focus();
    }

    const scroller = document.getElementById('thread-scroller');
    const threadMsgs = [...conv.messages].reverse();

    threadMsgs.forEach(msg => {
        const isSender = msg.sender_id === state.currentUser.id;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isSender ? 'sent' : 'received'}`;

        const timeStr = new Date(msg.created_at).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date(msg.created_at).toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
        const isToday = new Date(msg.created_at).toDateString() === new Date().toDateString();
        const displayTime = isToday ? timeStr : `${dateStr}, ${timeStr}`;

        const statusText = isSender ? (msg.is_read ? 'Pročitano' : 'Poslano') : '';

        bubble.innerHTML = `
            <div class="bubble-name">${isSender ? 'Ja' : (msg.sender_name || 'Susjed')}</div>
            <div class="bubble-text">${msg.content}</div>
            <span class="bubble-time">
                ${displayTime}
                ${statusText ? `<span class="message-status">${statusText}</span>` : ''}
            </span>
        `;
        scroller.appendChild(bubble);

        if (!isSender && !msg.is_read) {
            supabaseClient.from('poruke').update({ is_read: true }).eq('id', msg.id).then();
        }
    });

    if (conv.messages.length > state.lastMessageCount) {
        setTimeout(() => {
            if (scroller) {
                scroller.scrollTop = scroller.scrollHeight;
            }
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
        }, 200);
        state.lastMessageCount = conv.messages.length;
    }

    const replyBtn = document.getElementById('chat-reply-btn');
    const replyInput = document.getElementById('chat-reply-input');

    replyBtn.onclick = async () => {
        const content = replyInput.value.trim();
        if (!content) return;
        const receiverId = conv.otherUserId;

        const { error } = await supabaseClient.from('poruke').insert([{
            oglas_id: conv.adId,
            sender_id: state.currentUser.id,
            receiver_id: receiverId,
            content: content,
            sender_name: state.currentUser.user_metadata?.full_name || 'Susjed',
            is_read: false
        }]);

        if (!error) {
            replyInput.value = '';
            fetchMessages();
        }
    };
}

export function goBackToConversations() {
    state.activeConversationAdId = null;
    state.lastMessageCount = 0;
    fetchMessages();
}

export function initRealtime() {
    if (!state.currentUser) return;
    if (state.realtimeChannel) supabaseClient.removeChannel(state.realtimeChannel);
    state.realtimeChannel = supabaseClient
        .channel('realtime-messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'poruke', filter: `receiver_id=eq.${state.currentUser.id}` }, () => fetchMessages())
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'poruke', filter: `sender_id=eq.${state.currentUser.id}` }, () => fetchMessages())
        .subscribe();

    fetchMessages();
}
